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
import { numeroPessoalDoDono, instanciaLivreParaPessoal, CASA } from '../numero-pessoal.js';
import { estadoConexao, obterQrConexao, criarInstancia, instanciaValida, type ConexaoEvolutionDeps, type QrConexao } from '../evolution-conexao.js';
import { renderWhatsappPessoalPage, resultadoWhatsappPessoal } from './whatsapp-pessoal-views.js';
import { audit } from './audit.js';

export interface DepsNumeroPessoal {
  supabase: SupabaseClient;
  evolution?: ConexaoEvolutionDeps;
  /** EVOLUTION_INSTANCE (a da Eva) — nunca pode virar número pessoal. */
  instanciaDaEva: string;
  /** URL do webhook desta plataforma (com o token), pra apontar a instância nova. */
  webhookUrl?: string;
}

const primeiroNome = (s: string | null | undefined) => String(s ?? '').trim().split(/\s+/)[0] || null;

export function criarRotasNumeroPessoal(deps: DepsNumeroPessoal) {
  const qrCache = new Map<string, { at: number; valor: QrConexao }>();

  function daCasa(req: AuthedRequest, res: Response): req is AuthedRequest & { dashUser: NonNullable<AuthedRequest['dashUser']> } {
    if (req.dashUser?.companyId !== CASA) { res.status(404).send('Página não encontrada'); return false; }
    return true;
  }

  async function pagina(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    if (!daCasa(r, res)) return;
    const np = await numeroPessoalDoDono(deps.supabase, CASA, r.dashUser.id);
    const estado = np && deps.evolution ? await estadoConexao(deps.evolution, np.instancia).catch(() => 'desconhecido' as const) : null;
    res.type('html').send(renderWhatsappPessoalPage({
      user: r.dashUser,
      numero: np ? { instancia: np.instancia, ativo: np.ativo, donoNome: np.dono_nome } : null,
      estado,
      resultado: resultadoWhatsappPessoal(r.query?.ok ?? r.query?.erro),
      sugestao: `${(primeiroNome(r.dashUser.nome) ?? 'meu').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '') || 'meu'}-business`,
    }));
  }

  async function criar(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    if (!daCasa(r, res)) return;
    const volta = (q: string) => res.redirect(303, `/dashboard/whatsapp/pessoal?${q}`);
    const instancia = String(r.body?.instancia ?? '').trim();
    if (!instanciaValida(instancia)) { volta('erro=nome_invalido'); return; }
    if (!(await instanciaLivreParaPessoal(deps.supabase, instancia, deps.instanciaDaEva))) { volta('erro=instancia_ocupada'); return; }
    // Instância de OUTRA pessoa já cadastrada como pessoal: não toma.
    const { data: outro } = await deps.supabase.from('whatsapp_numeros_pessoais').select('dono_user_id').eq('instancia', instancia).maybeSingle();
    if (outro && (outro as { dono_user_id: string }).dono_user_id !== r.dashUser.id) { volta('erro=instancia_ocupada'); return; }
    if (!deps.evolution) { volta('erro=evolution_falhou'); return; }
    const c = await criarInstancia(deps.evolution, instancia, deps.webhookUrl);
    if (!c.ok) { volta(c.motivo === 'nome_invalido' ? 'erro=nome_invalido' : 'erro=evolution_falhou'); return; }

    const atual = await numeroPessoalDoDono(deps.supabase, CASA, r.dashUser.id);
    const agoraIso = new Date().toISOString();
    const { error } = atual
      ? await deps.supabase.from('whatsapp_numeros_pessoais').update({ instancia, ativo: true, atualizado_em: agoraIso })
        .eq('id', atual.id).eq('company_id', CASA)
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
    const np = await numeroPessoalDoDono(deps.supabase, CASA, r.dashUser.id);
    if (!np) { res.redirect(303, '/dashboard/whatsapp/pessoal'); return; }
    await deps.supabase.from('whatsapp_numeros_pessoais').update({ ativo, atualizado_em: new Date().toISOString() })
      .eq('id', np.id).eq('company_id', CASA).eq('dono_user_id', r.dashUser.id);
    await audit(deps.supabase, { companyId: CASA, userId: r.dashUser.id, entidade: 'whatsapp_pessoal', acao: ativo ? 'religou' : 'desligou', valorNovo: np.instancia });
    res.redirect(303, `/dashboard/whatsapp/pessoal?ok=${ativo ? 'religado' : 'desligado'}`);
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

  return {
    pagina, criar, estado, qr,
    desligar: (req: Request, res: Response) => ligar(req, res, false),
    religar: (req: Request, res: Response) => ligar(req, res, true),
  };
}
