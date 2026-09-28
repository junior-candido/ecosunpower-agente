// src/modules/dashboard/atendimento-rotas.ts
//
// Rotas do "responder pelo painel" (Atendimento Parte 2, 28/09/2026). Ficam
// fora do router.ts pra serem testadas com req/res falsos; o router.ts só
// registra (DEPOIS do portão /leads/:id — trava de empresa do #325).
//
// Portões, em ordem, em TODO envio:
//  1. sessão + exigir('leads','editar') (no router) + trava /leads/:id (#325);
//  2. o lead é relido aqui com .eq('company_id', <sessão>) — nunca da URL;
//  3. canal da EMPRESA: casa → número oficial da Eva (WABA); tenant → a
//     instância QR dele (noCanalDaEmpresa); sem canal → não envia;
//  4. opt-out / LGPD (envioProibido) / janela de 24 h (no servidor) bloqueiam;
//  5. freio (LimiteDeEnvio) + chave única por clique reservada no banco;
//  6. envia, grava (mensagens_whatsapp) e ASSUME (mesmo estado do WhatsApp).
//
// Nenhum envio de verdade nos testes: `DepsAtendimento` recebe dublês.

import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthedRequest } from './auth.js';
import { bancoDoOperador } from '../tenant-client.js';
import { empresaDe } from '../empresa-config.js';
import { envioProibido } from '../tenant-admin-guard.js';
import { normalizeBrazilianPhone } from '../meta-leadgen.js';
import { noCanalDaEmpresa, EMPRESA_CASA } from './canal-envio.js';
import { assumirAtendimento, devolverParaEva } from '../assumir-atendimento.js';
import { reservarEnvio, concluirEnvio, statusDaChave, semTelefone } from '../mensagens-whatsapp.js';
import { variantesTelefone } from '../phone.js';
import { historicoDoLead, canalDaAssistente, type CanalConversa, type MensagemChat } from './conversas-queries.js';
import {
  ultimaDoCliente, janelaAtendimento, motivoBloqueio, validarTexto, chaveValida, enviarDoPainel,
  LimiteDeEnvio, RESULTADO_ENVIO, type ViaEnvio, type MotivoBloqueio,
} from './atendimento-envio.js';
import { modelosDaTela, parametroNome, previaDoModelo, type ModeloDaMeta, type ModeloAtendimento } from './modelos-atendimento.js';
import { registrarAtividade } from './atividades.js';
import { audit } from './audit.js';
import type { CompositorInput, ContatoPessoalTela } from './atendimento-views.js';
import { linhaDoPainelParaChat } from './conversas-queries.js';
import { numeroPessoalDoDono, mensagensPessoais, virarLead, leadDoTelefoneNaEmpresa, CASA as CASA_ID, type NumeroPessoal } from '../numero-pessoal.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_MODELOS_MS = 10 * 60 * 1000;
/** Meta fora do ar: tenta de novo logo (a lista local vale só por 30 s). */
const CACHE_MODELOS_FALHA_MS = 30 * 1000;
/** A tela do lead nunca espera a Meta mais que isto. */
const TEMPO_MAX_META_MS = 3000;

/** Só o pedaço do serviço oficial (Meta) que o painel usa. */
export interface WabaPainel {
  sendText(to: string, text: string): Promise<{ messageId: string }>;
  sendTemplate(to: string, name: string, lang: string, components: Array<{ type: 'body'; parameters: Array<{ type: 'text'; text: string }> }>): Promise<{ messageId: string }>;
  listTemplates?(): Promise<ModeloDaMeta[]>;
}

export interface DepsAtendimento {
  /** Client de serviço (o banco do operador é derivado da requisição). */
  supabase: SupabaseClient;
  /** Número oficial da Eva (só existe na casa). */
  waba?: WabaPainel | null;
  /** Envio pela instância QR da empresa (index.ts sendText, dentro de noCanalDaEmpresa). */
  sendTextEvolution?: (to: string, text: string) => Promise<unknown>;
  /** Instância Evolution do tenant da sessão (null = sem). */
  instanciaDaEmpresa: (companyId: string) => Promise<string | null>;
  engineerPhone: string;
  /** Limpa a pausa curta do Redis do telefone (devolver = a Eva volta já). */
  retomarTakeover?: (telefone: string) => Promise<void>;
  /** Cópia na memória da Eva (conversations), pra ela saber o que foi dito. */
  copiarParaMemoria?: (p: { leadId: string; companyId: string; texto: string; painelId: string }) => Promise<void>;
  limite?: LimiteDeEnvio;
  agora?: () => number;
  /** Troca o banco do operador nos testes. */
  banco?: (req: AuthedRequest) => SupabaseClient;
  /** Parte 2b: envio pelo WhatsApp PESSOAL do dono (instância QR dele). */
  enviarPessoal?: (instancia: string, to: string, text: string) => Promise<{ messageId?: string } | void>;
  /** Parte 2b: número pessoal de quem está logado (padrão: whatsapp_numeros_pessoais). */
  numeroPessoal?: (companyId: string, userId: string) => Promise<NumeroPessoal | null>;
}

/**
 * Defesa extra contra envio forjado de outro site: quando o navegador manda
 * Origin, ela tem que ser o próprio painel. (O cookie já é SameSite=Strict.)
 */
export function mesmaOrigem(req: Pick<Request, 'headers'>): boolean {
  const origin = String(req.headers?.origin ?? '');
  if (!origin) return true;
  if (origin === 'null') return false;
  const host = String(req.headers?.['x-forwarded-host'] ?? req.headers?.host ?? '').split(',')[0].trim();
  try { return new URL(origin).host === host; } catch { return false; }
}

interface LeadEnvio { id: string; name: string | null; phone: string | null; opt_out: boolean | null; eva_active: boolean | null; company_id: string | null }

export function criarRotasAtendimento(deps: DepsAtendimento) {
  const limite = deps.limite ?? new LimiteDeEnvio();
  const agora = deps.agora ?? (() => Date.now());
  const banco = deps.banco ?? ((req: AuthedRequest) => bancoDoOperador(req, deps.supabase));
  /** Só a casa tem número pessoal (decisão do dono); e só o DONO dele usa. */
  const pessoalDe = async (companyId: string, userId: string): Promise<NumeroPessoal | null> => {
    if (companyId !== CASA_ID || !userId || !deps.enviarPessoal) return null;
    const np = await (deps.numeroPessoal ?? ((c: string, u: string) => numeroPessoalDoDono(deps.supabase, c, u)))(companyId, userId).catch(() => null);
    return np && np.ativo ? np : null;
  };
  let cacheModelos: { at: number; lista: ModeloAtendimento[]; validade: number } | null = null;

  async function modelos(): Promise<ModeloAtendimento[]> {
    if (cacheModelos && agora() - cacheModelos.at < cacheModelos.validade) return cacheModelos.lista;
    let daMeta: ModeloDaMeta[] | null = null;
    if (deps.waba?.listTemplates) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const limite = new Promise<null>((ok) => { timer = setTimeout(() => ok(null), TEMPO_MAX_META_MS); });
      daMeta = await Promise.race([
        deps.waba.listTemplates().catch((e) => {
          console.warn(`[atendimento] modelos da Meta indisponíveis (usa a cópia local): ${(e as Error).message}`);
          return null;
        }),
        limite,
      ]);
      if (timer) clearTimeout(timer);
    }
    const lista = modelosDaTela(daMeta);
    cacheModelos = { at: agora(), lista, validade: daMeta ? CACHE_MODELOS_MS : CACHE_MODELOS_FALHA_MS };
    return lista;
  }

  /** Por onde sai a resposta desta EMPRESA (nunca pelo número de outra). */
  async function viaDaEmpresa(companyId: string): Promise<{ via: ViaEnvio; instancia: string | null; motivo?: MotivoBloqueio }> {
    if (companyId === EMPRESA_CASA) {
      return deps.waba ? { via: 'waba', instancia: null } : { via: 'nenhum', instancia: null, motivo: 'whatsapp_nao_configurado' };
    }
    const inst = await deps.instanciaDaEmpresa(companyId).catch(() => null);
    return inst && deps.sendTextEvolution ? { via: 'evolution', instancia: inst } : { via: 'nenhum', instancia: null, motivo: 'sem_canal' };
  }

  async function lerLead(db: SupabaseClient, leadId: string, companyId: string): Promise<LeadEnvio | null> {
    const base = db.from('leads')
      .select('id, name, phone, opt_out, eva_active, company_id')
      .eq('id', leadId);
    // Lead legado sem company_id é da casa (mesma regra da trava /leads/:id).
    const q = companyId === EMPRESA_CASA ? base.or(`company_id.eq.${EMPRESA_CASA},company_id.is.null`) : base.eq('company_id', companyId);
    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    return (data as LeadEnvio | null) ?? null;
  }

  function voltar(res: Response, leadId: string, resultado: string, canal?: CanalConversa): void {
    const r = Object.prototype.hasOwnProperty.call(RESULTADO_ENVIO, resultado) ? resultado : 'falhou';
    const c = canal === 'whatsapp_business' ? '&canal=whatsapp_business' : '';
    res.redirect(303, `/dashboard/leads/${leadId}?resp=${encodeURIComponent(r)}${c}#responder`);
  }

  /** Conferências comuns ao texto e ao modelo. Devolve o contexto ou já respondeu. */
  async function preparar(req: AuthedRequest, res: Response, tipo: 'texto' | 'modelo') {
    const leadId = String(req.params.id ?? '');
    if (!UUID_RE.test(leadId)) { res.status(400).send('id inválido'); return null; }
    const viewer = req.dashUser;
    if (!viewer?.companyId) { res.status(404).send('lead não encontrado'); return null; }
    const companyId = viewer.companyId;
    if (!mesmaOrigem(req)) { res.status(403).send('origem não permitida'); return null; }
    if (!chaveValida(req.body?.chave)) { voltar(res, leadId, 'chave_invalida'); return null; }
    const chave = String(req.body.chave);
    const db = banco(req);
    let lead: LeadEnvio | null;
    try { lead = await lerLead(db, leadId, companyId); } catch { voltar(res, leadId, 'erro_banco'); return null; }
    if (!lead) { res.status(404).send('lead não encontrado'); return null; }

    // Por qual número responder: o da assistente (padrão) ou o PESSOAL do dono (2b).
    const pedePessoal = req.body?.canal === 'whatsapp_business';
    const np = pedePessoal ? await pessoalDe(companyId, viewer.id) : null;
    if (pedePessoal && (!np || tipo === 'modelo')) { voltar(res, leadId, tipo === 'modelo' ? 'modelo_so_no_oficial' : 'sem_canal', 'whatsapp_business'); return null; }
    const canal: CanalConversa = np ? 'whatsapp_business' : canalDaAssistente(companyId);
    const { via, instancia, motivo } = np ? { via: 'evolution' as ViaEnvio, instancia: np.instancia, motivo: undefined } : await viaDaEmpresa(companyId);
    const telefone = normalizeBrazilianPhone(lead.phone ?? '') ?? null;
    let janelaAberta = false;
    if (via === 'waba' && tipo === 'texto') {
      const msgs: MensagemChat[] = await historicoDoLead(db, leadId, companyId, viewer.id).catch(() => []);
      janelaAberta = janelaAtendimento(ultimaDoCliente(msgs, canal), agora()).aberta;
    }
    let bloqueio = motivoBloqueio({
      optOut: !!lead.opt_out, telefone, via,
      lgpdBloqueado: !!telefone && envioProibido(telefone, deps.engineerPhone, empresaDe(companyId)),
      tipo, janelaAberta,
    });
    if (bloqueio === 'sem_canal' && motivo) bloqueio = motivo;
    if (bloqueio) { voltar(res, leadId, bloqueio, canal); return null; }
    // Clique repetido responde "já enviada" (não "espere") — confere a chave antes do freio.
    const jaUsada = await statusDaChave(np ? deps.supabase : db, companyId, chave);
    if (jaUsada) { voltar(res, leadId, jaUsada === 'falhou' ? 'ja_falhou' : 'duplicado', canal); return null; }
    if (!limite.permitir(viewer.id, `${companyId}:${leadId}`, agora())) { voltar(res, leadId, 'limite', canal); return null; }
    return { leadId, viewer, companyId, chave, db, lead, canal, via, instancia, telefone: telefone!, np };
  }

  function depsComuns(ctx: NonNullable<Awaited<ReturnType<typeof preparar>>>, extra: { texto: string; modelo?: string }) {
    const { companyId, leadId, viewer, canal } = ctx;
    // Número pessoal: a linha é privada (visivel_so_para) e a RLS restritiva da
    // 138 esconde do crachá — grava/fecha com o client de serviço + filtro explícito.
    const db = ctx.np ? deps.supabase : ctx.db;
    return {
      reservar: () => reservarEnvio(db, {
        company_id: companyId, lead_id: leadId, contato_telefone: ctx.telefone, contato_nome: ctx.lead.name,
        direcao: 'saida', autor: 'humano', user_id: viewer.id, autor_nome: (viewer.nome || '').slice(0, 80),
        canal, numero: ctx.via === 'evolution' ? ctx.instancia : null,
        tipo: extra.modelo ? 'modelo' : 'texto', texto: extra.texto, modelo: extra.modelo ?? null,
        origem: 'painel', chave_envio: ctx.chave,
        // Número pessoal: só o dono vê o que ele mandou por lá.
        ...(ctx.np ? { visivel_so_para: viewer.id } : {}),
      }),
      concluir: (id: string, r: { status: 'enviada' | 'falhou'; wamid?: string | null; erro?: string | null }) => concluirEnvio(db, id, companyId, r),
      assumir: () => assumirAtendimento(db, { leadId, companyId, origem: 'painel', userId: viewer.id, autorNome: viewer.nome }),
      // O que sai pelo número pessoal NÃO entra na memória da Eva (é conversa dele).
      copiarParaMemoria: deps.copiarParaMemoria && !ctx.np
        ? (painelId: string) => deps.copiarParaMemoria!({ leadId, companyId, texto: extra.texto, painelId })
        : undefined,
      registrar: async () => {
        // Número pessoal: a linha do tempo é da empresa toda — registra SÓ o fato, nunca o texto.
        if (ctx.np) {
          await registrarAtividade(ctx.db, {
            company_id: companyId, lead_id: leadId, tipo: 'whatsapp',
            titulo: 'Mensagem enviada pelo WhatsApp pessoal', automatica: false, user_id: viewer.id,
          });
          await audit(ctx.db, { companyId, userId: viewer.id, entidade: 'lead', entidadeId: leadId, acao: 'whatsapp_enviado', campo: canal, valorNovo: 'texto' });
          return;
        }
        await registrarAtividade(db, {
          company_id: companyId, lead_id: leadId, tipo: 'whatsapp',
          titulo: extra.modelo ? `Modelo enviado pelo painel (${extra.modelo})` : 'Mensagem enviada pelo painel',
          descricao: extra.texto.slice(0, 1000), automatica: false, user_id: viewer.id,
        });
        await audit(db, { companyId, userId: viewer.id, entidade: 'lead', entidadeId: leadId, acao: 'whatsapp_enviado', campo: canal, valorNovo: extra.modelo ?? 'texto' });
      },
    };
  }

  /** POST /leads/:id/responder — texto livre (número da Eva: só na janela de 24 h). */
  async function responder(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    const leadId = String(r.params.id ?? '');
    const v = validarTexto(r.body?.texto);
    if (!v.ok) { if (UUID_RE.test(leadId)) voltar(res, leadId, v.motivo); else res.status(400).send('id inválido'); return; }
    const ctx = await preparar(r, res, 'texto');
    if (!ctx) return;
    const s = await enviarDoPainel({
      ...depsComuns(ctx, { texto: v.texto }),
      enviar: () => ctx.np
        ? deps.enviarPessoal!(ctx.np.instancia, ctx.telefone, v.texto)
        : ctx.via === 'waba'
          ? deps.waba!.sendText(ctx.telefone, v.texto)
          : noCanalDaEmpresa(ctx.companyId, ctx.instancia, () => deps.sendTextEvolution!(ctx.telefone, v.texto)).then(() => undefined),
    });
    console.log(`[atendimento] resposta ${ctx.leadId.slice(0, 8)} por ${ctx.np ? 'numero_pessoal' : ctx.via} (${ctx.viewer.id.slice(0, 8)}): ${s.resultado}${s.erro ? ` — ${semTelefone(s.erro)}` : ''}`);
    voltar(res, ctx.leadId, s.resultado, ctx.canal);
  }

  /** POST /leads/:id/responder-modelo — modelo aprovado (só o número oficial). */
  async function responderModelo(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    const ctx = await preparar(r, res, 'modelo');
    if (!ctx) return;
    const lista = await modelos();
    const modelo = lista.find((m) => m.nome === String(r.body?.modelo ?? ''));
    if (!modelo) { voltar(res, ctx.leadId, 'modelo_invalido'); return; }
    const nome = parametroNome(r.body?.nome);
    const texto = previaDoModelo(modelo, nome);
    const s = await enviarDoPainel({
      ...depsComuns(ctx, { texto, modelo: modelo.nome }),
      enviar: () => deps.waba!.sendTemplate(ctx.telefone, modelo.nome, 'pt_BR', [{ type: 'body', parameters: [{ type: 'text', text: nome }] }]),
    });
    console.log(`[atendimento] modelo ${modelo.nome} ${ctx.leadId.slice(0, 8)}: ${s.resultado}${s.erro ? ` — ${semTelefone(s.erro)}` : ''}`);
    voltar(res, ctx.leadId, s.resultado);
  }

  /** POST /leads/:id/pause-eva — "✋ Assumir" (o mesmo estado do botão do WhatsApp). */
  async function assumir(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    const leadId = String(r.params.id ?? '');
    if (!UUID_RE.test(leadId)) { res.status(400).send('id inválido'); return; }
    const viewer = r.dashUser;
    if (!viewer?.companyId) { res.status(404).send('lead não encontrado'); return; }
    const x = await assumirAtendimento(banco(r), { leadId, companyId: viewer.companyId, origem: 'painel', userId: viewer.id, autorNome: viewer.nome });
    if (!x.ok) { res.status(x.motivo === 'nao_encontrado' ? 404 : 500).send(x.motivo === 'nao_encontrado' ? 'lead não encontrado' : 'erro ao assumir'); return; }
    if (!x.jaEstava) await audit(banco(r), { companyId: viewer.companyId, userId: viewer.id, entidade: 'lead', entidadeId: leadId, acao: 'assumiu' });
    res.redirect(`/dashboard/leads/${leadId}`);
  }

  /** POST /leads/:id/resume-eva — "↩ Devolver para a Eva": o ÚNICO jeito de ela voltar. */
  async function devolver(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    const leadId = String(r.params.id ?? '');
    if (!UUID_RE.test(leadId)) { res.status(400).send('id inválido'); return; }
    const viewer = r.dashUser;
    if (!viewer?.companyId) { res.status(404).send('lead não encontrado'); return; }
    // A pausa curta do Redis tem chave SÓ pelo telefone (sem empresa): só a casa
    // limpa — senão um tenant apagaria a pausa de outra empresa no mesmo número.
    const retomar = deps.retomarTakeover
      ? async (tel: string, cid: string) => {
        if (cid !== EMPRESA_CASA) return;
        await Promise.all(variantesTelefone(tel).map((v) => deps.retomarTakeover!(v)));
      }
      : undefined;
    const x = await devolverParaEva(banco(r), { leadId, companyId: viewer.companyId, origem: 'painel', userId: viewer.id, autorNome: viewer.nome }, retomar);
    if (!x.ok) {
      if (x.motivo === 'opt_out') { voltar(res, leadId, 'opt_out'); return; }
      res.status(x.motivo === 'nao_encontrado' ? 404 : 500).send(x.motivo === 'nao_encontrado' ? 'lead não encontrado' : 'erro ao devolver');
      return;
    }
    if (!x.jaEstava) await audit(banco(r), { companyId: viewer.companyId, userId: viewer.id, entidade: 'lead', entidadeId: leadId, acao: 'devolveu_para_eva' });
    res.redirect(`/dashboard/leads/${leadId}`);
  }

  /** O que a tela precisa pra desenhar o campo de resposta. Nunca lança. */
  async function envioDaTela(req: AuthedRequest, lead: { id?: string; phone?: string | null }, mensagens: MensagemChat[] = []): Promise<CompositorInput | undefined> {
    const companyId = req.dashUser?.companyId;
    if (!companyId) return undefined;
    try {
      const np = await pessoalDe(companyId, req.dashUser?.id ?? '');
      const daAssistente = canalDaAssistente(companyId);
      // Padrão: o número em que o cliente escreveu por ÚLTIMO; ?canal= troca.
      const ultEva = ultimaDoCliente(mensagens, daAssistente);
      const ultPessoal = ultimaDoCliente(mensagens, 'whatsapp_business');
      const pedido = req.query?.canal === 'whatsapp_business' ? 'whatsapp_business' : req.query?.canal === daAssistente ? daAssistente : null;
      const padrao: CanalConversa = np && ultPessoal && (!ultEva || Date.parse(ultPessoal) > Date.parse(ultEva)) ? 'whatsapp_business' : daAssistente;
      const canal: CanalConversa = np ? (pedido ?? padrao) : daAssistente;
      const pessoal = canal === 'whatsapp_business' && !!np;
      const { via, motivo } = pessoal ? { via: 'evolution' as ViaEnvio, motivo: undefined } : await viaDaEmpresa(companyId);
      const telefone = normalizeBrazilianPhone(lead.phone ?? '') ?? '';
      const resp = typeof req.query?.resp === 'string' && Object.prototype.hasOwnProperty.call(RESULTADO_ENVIO, req.query.resp) ? req.query.resp : null;
      const base = lead.id && UUID_RE.test(lead.id) ? `/dashboard/leads/${lead.id}` : '';
      return {
        via,
        semCanalMotivo: motivo ?? null,
        canal,
        alternativas: np && base ? [daAssistente, 'whatsapp_business' as CanalConversa].map((c) => ({
          canal: c, ativo: c === canal, href: `${base}?canal=${c}#responder`,
        })) : undefined,
        donoPessoal: np?.dono_nome ?? null,
        modelos: via === 'waba' && !pessoal ? await modelos() : [],
        chave: randomUUID(),
        resultado: resp,
        lgpdBloqueado: !!telefone && envioProibido(telefone, deps.engineerPhone, empresaDe(companyId)),
        empresaNome: empresaDe(companyId).nomeFantasia,
        euNome: req.dashUser?.nome ?? '',
        agora: agora(),
      };
    } catch (e) {
      console.warn(`[atendimento] estado do envio indisponível: ${(e as Error).message}`);
      return undefined;
    }
  }

  // -------------------------------------------------------------------------
  // Parte 2b — conversa do número pessoal com quem AINDA NÃO é lead
  // -------------------------------------------------------------------------

  /** Número pessoal de quem está logado (pra VER; mandar exige também o envio ligado). */
  async function donoDoNumero(companyId: string, userId: string): Promise<NumeroPessoal | null> {
    if (companyId !== CASA_ID || !userId) return null;
    return (deps.numeroPessoal ?? ((c: string, u: string) => numeroPessoalDoDono(deps.supabase, c, u)))(companyId, userId).catch(() => null);
  }

  /**
   * ?contato=<telefone> na lista: a conversa do número pessoal com esse
   * telefone — SÓ do dono, só da empresa. Já virou lead → { leadId }.
   */
  async function contatoDaTela(req: AuthedRequest): Promise<{ contato: ContatoPessoalTela; donoPessoal: string | null } | { leadId: string } | null> {
    const viewer = req.dashUser;
    const telefone = normalizeBrazilianPhone(String(req.query?.contato ?? ''));
    if (!viewer?.companyId || !telefone) return null;
    const dono = await donoDoNumero(viewer.companyId, viewer.id);
    if (!dono) return null;
    const rows = await mensagensPessoais(deps.supabase, viewer.companyId, viewer.id, { telefone });
    if (rows.length === 0) return null;
    const comLead = [...rows].reverse().find((r) => r.lead_id);
    if (comLead?.lead_id) return { leadId: comLead.lead_id };
    const podeEnviar = !!(await pessoalDe(viewer.companyId, viewer.id));
    const resp = typeof req.query?.resp === 'string' && Object.prototype.hasOwnProperty.call(RESULTADO_ENVIO, req.query.resp) ? req.query.resp : null;
    return {
      donoPessoal: dono.dono_nome,
      contato: {
        telefone,
        nome: [...rows].reverse().find((r) => r.contato_nome)?.contato_nome ?? null,
        mensagens: rows.map(linhaDoPainelParaChat).filter((m): m is MensagemChat => !!m),
        envio: {
          via: podeEnviar ? 'evolution' : 'nenhum', canal: 'whatsapp_business', modelos: [], chave: randomUUID(),
          resultado: resp, donoPessoal: dono.dono_nome, empresaNome: empresaDe(viewer.companyId).nomeFantasia,
          euNome: viewer.nome ?? '', agora: agora(),
        },
      },
    };
  }

  function voltarContato(res: Response, telefone: string, resultado: string): void {
    const r = Object.prototype.hasOwnProperty.call(RESULTADO_ENVIO, resultado) ? resultado : 'falhou';
    res.redirect(303, `/dashboard/leads/conversas?contato=${encodeURIComponent(telefone)}&resp=${encodeURIComponent(r)}#responder`);
  }

  /** POST /leads/conversas/contato/responder — pelo número pessoal, pra quem ainda não é lead. */
  async function responderContato(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    const viewer = r.dashUser;
    const telefone = normalizeBrazilianPhone(String(r.body?.telefone ?? ''));
    if (!viewer?.companyId || !telefone) { res.status(404).send('conversa não encontrada'); return; }
    if (!mesmaOrigem(r)) { res.status(403).send('origem não permitida'); return; }
    const companyId = viewer.companyId;
    if (!chaveValida(r.body?.chave)) { voltarContato(res, telefone, 'chave_invalida'); return; }
    const v = validarTexto(r.body?.texto);
    if (!v.ok) { voltarContato(res, telefone, v.motivo); return; }
    const np = await pessoalDe(companyId, viewer.id);
    if (!np) { voltarContato(res, telefone, 'sem_canal'); return; }
    // Só responde quem já conversou com ESTE dono no número pessoal.
    const conversa = await mensagensPessoais(deps.supabase, companyId, viewer.id, { telefone }, 1);
    if (conversa.length === 0) { res.status(404).send('conversa não encontrada'); return; }
    const chave = String(r.body.chave);
    const jaUsada = await statusDaChave(deps.supabase, companyId, chave);
    if (jaUsada) { voltarContato(res, telefone, jaUsada === 'falhou' ? 'ja_falhou' : 'duplicado'); return; }
    if (!limite.permitir(viewer.id, `${companyId}:${telefone}`, agora())) { voltarContato(res, telefone, 'limite'); return; }
    const leadDoContato = await leadDoTelefoneNaEmpresa(deps.supabase, companyId, telefone).catch(() => null);
    const s = await enviarDoPainel({
      reservar: () => reservarEnvio(deps.supabase, {
        company_id: companyId, lead_id: leadDoContato?.id ?? null, contato_telefone: telefone, contato_nome: conversa[0]?.contato_nome ?? null,
        direcao: 'saida', autor: 'humano', user_id: viewer.id, autor_nome: (viewer.nome || '').slice(0, 80),
        canal: 'whatsapp_business', numero: np.instancia, tipo: 'texto', texto: v.texto,
        origem: 'painel', chave_envio: chave, visivel_so_para: viewer.id,
      }),
      concluir: (id, x) => concluirEnvio(deps.supabase, id, companyId, x),
      enviar: () => deps.enviarPessoal!(np.instancia, telefone, v.texto),
    });
    console.log(`[atendimento] numero pessoal → contato (${viewer.id.slice(0, 8)}): ${s.resultado}${s.erro ? ` — ${semTelefone(s.erro)}` : ''}`);
    voltarContato(res, telefone, s.resultado);
  }

  /** POST /leads/conversas/contato/virar-lead — o contato entra no funil (um cliente, um lead). */
  async function virarLeadDoContato(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    const viewer = r.dashUser;
    const telefone = normalizeBrazilianPhone(String(r.body?.telefone ?? ''));
    if (!viewer?.companyId || !telefone) { res.status(404).send('conversa não encontrada'); return; }
    if (!mesmaOrigem(r)) { res.status(403).send('origem não permitida'); return; }
    if (viewer.companyId !== CASA_ID) { res.status(404).send('conversa não encontrada'); return; }
    const x = await virarLead(deps.supabase, { companyId: viewer.companyId, userId: viewer.id, userNome: viewer.nome ?? '', telefone });
    if (!x.ok) {
      if (x.motivo === 'sem_conversa' || x.motivo === 'telefone_invalido') { res.status(404).send('conversa não encontrada'); return; }
      if (x.motivo === 'telefone_de_outra_empresa') { voltarContato(res, telefone, 'telefone_de_outra_empresa'); return; }
      voltarContato(res, telefone, 'erro_banco');
      return;
    }
    await audit(deps.supabase, { companyId: viewer.companyId, userId: viewer.id, entidade: 'lead', entidadeId: x.leadId, acao: x.criado ? 'virou_lead_whatsapp_pessoal' : 'ligou_whatsapp_pessoal' });
    res.redirect(303, `/dashboard/leads/${x.leadId}?canal=whatsapp_business#responder`);
  }

  /** Nome do dono do número pessoal quando QUEM ESTÁ VENDO é o dono (rótulo "👤 Junior"). Nunca lança. */
  async function nomeDoDonoPessoal(req: AuthedRequest): Promise<string | null> {
    const v = req.dashUser;
    if (!v?.companyId) return null;
    const np = await donoDoNumero(v.companyId, v.id).catch(() => null);
    return np ? (np.dono_nome || 'Meu WhatsApp') : null;
  }

  return { responder, responderModelo, assumir, devolver, envioDaTela, modelos, contatoDaTela, responderContato, virarLeadDoContato, nomeDoDonoPessoal };
}
