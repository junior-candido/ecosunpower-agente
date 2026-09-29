// src/modules/dashboard/numero-pessoal-rotas.ts
//
// "Meu WhatsApp no painel" — conectar o WhatsApp Business PESSOAL do dono por
// QR (Atendimento Parte 2b, 28/09/2026). Portões:
//  - no router: exigir('usuarios','administrar');
//  - aqui: SÓ a EcoSun (decisão do dono) — tenant recebe 404;
//  - o número é de QUEM CONECTOU (dono_user_id = sessão): só ele vê as conversas;
//  - a instância não pode ser a da Eva nem a de um tenant (lá a assistente responde).
// Nada aqui conecta de verdade sozinho: o dono lê o QR depois do deploy.

import type { Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthedRequest } from './auth.js';
import { numeroPessoalDoDono, instanciaLivreParaPessoal, nomeInstanciaPessoal, CASA } from '../numero-pessoal.js';
import { estadoConexao, obterQrConexao, criarInstancia, pedirHistoricoCompleto, apontarWebhook, type ConexaoEvolutionDeps, type QrConexao } from '../evolution-conexao.js';
import { resumoDoPessoal, DIAS_HISTORICO, type ImportadorHistorico } from '../numero-pessoal-historico.js';
import { mesmaOrigem } from './atendimento-rotas.js';
import { renderWhatsappPessoalPage, resultadoWhatsappPessoal } from './whatsapp-pessoal-views.js';
import { lerMapeamento, salvarMapeamento, mapeamentoDoFormulario, type EtiquetaWhatsapp } from '../etiquetas-funil.js';
import { audit } from './audit.js';

export interface DepsNumeroPessoal {
  supabase: SupabaseClient;
  evolution?: ConexaoEvolutionDeps;
  /** EVOLUTION_INSTANCE (a da Eva) — nunca pode virar número pessoal. */
  instanciaDaEva: string;
  /** URL do webhook desta plataforma (sem token), pra apontar a instância nova. */
  webhookUrl?: string;
  /** Token do webhook — vai no cabeçalho x-webhook-token. */
  webhookToken?: string;
  /** Importador do histórico (o mesmo do webhook): progresso + puxar o que a Evolution guardou. */
  historico?: Pick<ImportadorHistorico, 'progresso' | 'puxarDoServidor' | 'recomecar' | 'cancelar'>;
  /** W4: etiquetas do WhatsApp Business da instância do dono (Evolution findLabels). */
  etiquetasDaInstancia?: (instancia: string) => Promise<EtiquetaWhatsapp[]>;
}

const primeiroNome = (s: string | null | undefined) => String(s ?? '').trim().split(/\s+/)[0] || null;

export function criarRotasNumeroPessoal(deps: DepsNumeroPessoal) {
  const qrCache = new Map<string, { at: number; valor: QrConexao }>();
  /** Totais do banco para o contador (3 leituras): no máximo 1 vez a cada 30 s por número. */
  const resumoCache = new Map<string, { at: number; chave: string; valor: Awaited<ReturnType<typeof resumoDoPessoal>> }>();

  function daCasa(req: AuthedRequest, res: Response): req is AuthedRequest & { dashUser: NonNullable<AuthedRequest['dashUser']> } {
    if (req.dashUser?.companyId !== CASA) { res.status(404).send('Página não encontrada'); return false; }
    return true;
  }

  async function pagina(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    if (!daCasa(r, res)) return;
    const np = await numeroPessoalDoDono(deps.supabase, CASA, r.dashUser.id);
    const [estado, resumo, etiquetas, mapeamento] = await Promise.all([
      np && deps.evolution ? estadoConexao(deps.evolution, np.instancia).catch(() => 'desconhecido' as const) : Promise.resolve(null),
      np ? resumoDoPessoal(deps.supabase, np) : Promise.resolve(null),
      np && deps.etiquetasDaInstancia ? deps.etiquetasDaInstancia(np.instancia).catch(() => null) : Promise.resolve(null),
      np ? lerMapeamento(deps.supabase, np) : Promise.resolve([]),
    ]);
    res.type('html').send(renderWhatsappPessoalPage({
      user: r.dashUser,
      numero: np ? { instancia: np.instancia, ativo: np.ativo, donoNome: np.dono_nome, marcarLida: np.marcar_lida_ao_abrir !== false } : null,
      estado,
      historico: np ? { resumo, progresso: deps.historico?.progresso(np.instancia) ?? null, dias: DIAS_HISTORICO, disponivel: !!deps.evolution && !!deps.historico } : undefined,
      resultado: resultadoWhatsappPessoal(r.query?.ok ?? r.query?.erro),
      etiquetas: np && deps.etiquetasDaInstancia ? { disponiveis: etiquetas, mapeamento } : undefined,
      sugestao: nomeInstanciaPessoal(r.dashUser.id),
    }));
  }

  async function criar(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    if (!daCasa(r, res)) return;
    const volta = (q: string) => res.redirect(303, `/dashboard/whatsapp/pessoal?${q}`);
    if (!mesmaOrigem(r)) { res.status(403).send('origem não permitida'); return; }
    // Nome escolhido pelo SERVIDOR: ninguém "adota" uma instância que já existe na
    // Evolution (tenant em implantação, outro produto). Um número por pessoa, sem troca de nome.
    const atual = await numeroPessoalDoDono(deps.supabase, CASA, r.dashUser.id);
    const instancia = atual?.instancia ?? nomeInstanciaPessoal(r.dashUser.id);
    if (!(await instanciaLivreParaPessoal(deps.supabase, instancia, deps.instanciaDaEva))) { volta('erro=instancia_ocupada'); return; }
    if (!deps.evolution) { volta('erro=evolution_falhou'); return; }
    const c = await criarInstancia(deps.evolution, instancia, deps.webhookUrl, deps.webhookToken);
    if (!c.ok) { volta('erro=evolution_falhou'); return; }
    // Já existia na Evolution e NÃO é deste dono (nome derivado do id, então só por acaso/ataque): recusa.
    if (c.jaExistia && !atual) { volta('erro=instancia_ocupada'); return; }

    const agoraIso = new Date().toISOString();
    const { error } = atual
      ? await deps.supabase.from('whatsapp_numeros_pessoais').update({ ativo: true, atualizado_em: agoraIso })
        .eq('id', atual.id).eq('company_id', CASA).eq('dono_user_id', r.dashUser.id)
      : await deps.supabase.from('whatsapp_numeros_pessoais').insert({
        company_id: CASA, dono_user_id: r.dashUser.id, dono_nome: primeiroNome(r.dashUser.nome), instancia, ativo: true,
      });
    if (error) { volta('erro=erro_banco'); return; }
    await audit(deps.supabase, { companyId: CASA, userId: r.dashUser.id, entidade: 'whatsapp_pessoal', acao: 'preparou', valorNovo: instancia });
    volta(c.webhook === 'falhou' ? 'ok=webhook_falhou' : 'ok=criada');
  }

  async function ligar(req: Request, res: Response, ativo: boolean): Promise<void> {
    const r = req as AuthedRequest;
    if (!daCasa(r, res)) return;
    if (!mesmaOrigem(r)) { res.status(403).send('origem não permitida'); return; }
    const np = await numeroPessoalDoDono(deps.supabase, CASA, r.dashUser.id);
    if (!np) { res.redirect(303, '/dashboard/whatsapp/pessoal'); return; }
    await deps.supabase.from('whatsapp_numeros_pessoais').update({ ativo, atualizado_em: new Date().toISOString() })
      .eq('id', np.id).eq('company_id', CASA).eq('dono_user_id', r.dashUser.id);
    // Desligou: o histórico que ainda estava na fila não é gravado.
    if (!ativo) deps.historico?.cancelar(np.instancia);
    await audit(deps.supabase, { companyId: CASA, userId: r.dashUser.id, entidade: 'whatsapp_pessoal', acao: ativo ? 'religou' : 'desligou', valorNovo: np.instancia });
    res.redirect(303, `/dashboard/whatsapp/pessoal?ok=${ativo ? 'religado' : 'desligado'}`);
  }

  /**
   * W3 — POST /whatsapp/pessoal/leitura { marcar: '1' | '0' }: liga/desliga o
   * "marcar como lida ao abrir" (só o dono). Aproveita e reaponta os avisos da
   * instância (✓✓ e "digitando…" precisam dos eventos novos).
   */
  async function leitura(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    if (!daCasa(r, res)) return;
    if (!mesmaOrigem(r)) { res.status(403).send('origem não permitida'); return; }
    const np = await numeroPessoalDoDono(deps.supabase, CASA, r.dashUser.id);
    if (!np) { res.redirect(303, '/dashboard/whatsapp/pessoal'); return; }
    const marcar = String(r.body?.marcar ?? '') === '1';
    const { error } = await deps.supabase.from('whatsapp_numeros_pessoais').update({ marcar_lida_ao_abrir: marcar, atualizado_em: new Date().toISOString() })
      .eq('id', np.id).eq('company_id', CASA).eq('dono_user_id', r.dashUser.id);
    if (error) { res.redirect(303, '/dashboard/whatsapp/pessoal?erro=leitura_sem_migration'); return; }
    if (deps.evolution && deps.webhookUrl) await apontarWebhook(deps.evolution, np.instancia, deps.webhookUrl, deps.webhookToken).catch(() => 'falhou');
    await audit(deps.supabase, { companyId: CASA, userId: r.dashUser.id, entidade: 'whatsapp_pessoal', acao: marcar ? 'leitura_ligada' : 'leitura_desligada', valorNovo: np.instancia });
    res.redirect(303, `/dashboard/whatsapp/pessoal?ok=${marcar ? 'leitura_ligada' : 'leitura_desligada'}`);
  }

  /**
   * W4 — POST /whatsapp/pessoal/etiquetas { etapa_<id>: labelId }: qual etiqueta
   * do WhatsApp vale para cada etapa do funil (só o dono; etiquetas conferidas
   * com as que existem no WhatsApp dele). Reaponta os avisos (LABELS_*).
   */
  async function etiquetas(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    if (!daCasa(r, res)) return;
    if (!mesmaOrigem(r)) { res.status(403).send('origem não permitida'); return; }
    const np = await numeroPessoalDoDono(deps.supabase, CASA, r.dashUser.id);
    if (!np || !deps.etiquetasDaInstancia) { res.redirect(303, '/dashboard/whatsapp/pessoal'); return; }
    const disponiveis = await deps.etiquetasDaInstancia(np.instancia).catch(() => null);
    if (!disponiveis) { res.redirect(303, '/dashboard/whatsapp/pessoal?erro=etiquetas_sem_whatsapp#wp-etiquetas'); return; }
    const pares = mapeamentoDoFormulario((r.body ?? {}) as Record<string, unknown>, disponiveis);
    if (!(await salvarMapeamento(deps.supabase, np, pares))) { res.redirect(303, '/dashboard/whatsapp/pessoal?erro=etiquetas_sem_migration#wp-etiquetas'); return; }
    if (deps.evolution && deps.webhookUrl) await apontarWebhook(deps.evolution, np.instancia, deps.webhookUrl, deps.webhookToken).catch(() => 'falhou');
    await audit(deps.supabase, { companyId: CASA, userId: r.dashUser.id, entidade: 'whatsapp_pessoal', acao: 'etiquetas_funil', valorNovo: pares.map((p) => `${p.etapa}=${p.label_nome ?? p.label_id}`).join(', ').slice(0, 500) });
    res.redirect(303, '/dashboard/whatsapp/pessoal?ok=etiquetas_salvas#wp-etiquetas');
  }

  async function estado(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    res.setHeader('Cache-Control', 'no-store');
    if (!daCasa(r, res)) return;
    const np = await numeroPessoalDoDono(deps.supabase, CASA, r.dashUser.id);
    if (!np || !deps.evolution) { res.json({ estado: 'desconhecido' }); return; }
    res.json({ estado: await estadoConexao(deps.evolution, np.instancia).catch(() => 'desconhecido') });
  }

  async function qr(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    res.setHeader('Cache-Control', 'no-store');
    if (!daCasa(r, res)) return;
    const np = await numeroPessoalDoDono(deps.supabase, CASA, r.dashUser.id);
    if (!np || !deps.evolution) { res.json({ estado: 'desconhecido' }); return; }
    try {
      const c = qrCache.get(np.instancia);
      const v = c && Date.now() - c.at < 15_000 && c.valor.base64 ? c.valor : await obterQrConexao(deps.evolution, np.instancia);
      if (v.estado === 'open' && c?.valor.estado !== 'open') console.log(`[whatsapp-pessoal] ✅ "${np.instancia}" conectado`);
      qrCache.set(np.instancia, { at: Date.now(), valor: v });
      res.json(v);
    } catch {
      res.json({ estado: 'desconhecido' });
    }
  }

  /**
   * POST /whatsapp/pessoal/historico — "Buscar histórico (reconectar)": liga a
   * sincronização completa, assina o evento do histórico e DESCONECTA (o dono
   * lê o QR de novo uma vez; ao ler, o celular manda o histórico). Na mesma
   * hora puxa o que a Evolution já guardou. Tudo em segundo plano.
   */
  async function buscarHistorico(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    if (!daCasa(r, res)) return;
    if (!mesmaOrigem(r)) { res.status(403).send('origem não permitida'); return; }
    const volta = (q: string) => res.redirect(303, `/dashboard/whatsapp/pessoal?${q}`);
    const np = await numeroPessoalDoDono(deps.supabase, CASA, r.dashUser.id);
    if (!np) { volta(''); return; }
    if (!np.ativo) { volta('erro=historico_desligado'); return; }
    if (!deps.evolution || !deps.historico) { volta('erro=evolution_falhou'); return; }
    const x = await pedirHistoricoCompleto(deps.evolution, np.instancia, deps.webhookUrl, deps.webhookToken);
    if (!x.ok) { volta('erro=historico_falhou'); return; }
    qrCache.delete(np.instancia);
    deps.historico.recomecar(np.instancia);
    const evo = deps.evolution;
    const hist = deps.historico;
    void hist.puxarDoServidor(np, evo).catch((e) => console.warn(`[whatsapp-pessoal] puxar histórico falhou: ${(e as Error).message}`));
    await audit(deps.supabase, { companyId: CASA, userId: r.dashUser.id, entidade: 'whatsapp_pessoal', acao: 'pediu_historico', valorNovo: np.instancia });
    console.log(`[whatsapp-pessoal] histórico pedido para "${np.instancia}" (webhook ${x.webhook}, desconectou=${x.desconectou})`);
    volta(x.webhook === 'falhou' ? 'ok=historico_sem_webhook' : 'ok=historico_pedido');
  }

  /** GET /whatsapp/pessoal/historico.json — progresso (só do número de quem está logado). */
  async function historicoJson(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    res.setHeader('Cache-Control', 'no-store');
    if (!daCasa(r, res)) return;
    const np = await numeroPessoalDoDono(deps.supabase, CASA, r.dashUser.id);
    if (!np) { res.json({ progresso: null }); return; }
    const progresso = deps.historico?.progresso(np.instancia) ?? null;
    // Total do banco: só com a busca parada, e no máximo 1 vez a cada 30 s (ou quando a busca avançou).
    let resumo: Awaited<ReturnType<typeof resumoDoPessoal>> = null;
    if (!progresso?.emAndamento) {
      const chave = progresso?.atualizadoEm ?? '';
      const c = resumoCache.get(np.instancia);
      if (c && c.chave === chave && Date.now() - c.at < 30_000) resumo = c.valor;
      else {
        resumo = await resumoDoPessoal(deps.supabase, np);
        resumoCache.set(np.instancia, { at: Date.now(), chave, valor: resumo });
      }
    }
    res.json({ progresso, resumo });
  }

  return {
    leitura, etiquetas,
    pagina, criar, estado, qr, buscarHistorico, historicoJson,
    desligar: (req: Request, res: Response) => ligar(req, res, false),
    religar: (req: Request, res: Response) => ligar(req, res, true),
  };
}
