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
import multer from 'multer';
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
import { pedacosDaConversa, pedacosDoContato, assinaturaDaConversa } from './atendimento-views.js';
import { aviso } from './ui/componentes.js';
import { can } from './permissions.js';
import { podeVerLead, type LeadDetail } from './leads-queries.js';
import { linhaDoPainelParaChat } from './conversas-queries.js';
import { numeroPessoalDoDono, mensagensPessoais, virarLead, leadDoTelefoneNaEmpresa, CASA as CASA_ID, type NumeroPessoal } from '../numero-pessoal.js';
import { linhaVisivelPara } from '../mensagens-whatsapp.js';
import { gravarReacao, emojiDeReacaoValido } from '../reacoes-citacoes.js';
import { estaDigitando, marcarLidasAoAbrir } from '../status-whatsapp.js';
import {
  validarArquivo, guardarMidia, apagarMidia, urlDaMidia, textoDaMidia, caminhoDaEmpresa, LIMITE_LEGENDA, LIMITE_MIDIA_BYTES,
  type TipoMidia, type ArquivoValidado,
} from '../midia-whatsapp.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_MODELOS_MS = 10 * 60 * 1000;
/** Meta fora do ar: tenta de novo logo (a lista local vale só por 30 s). */
const CACHE_MODELOS_FALHA_MS = 30 * 1000;
/** A tela do lead nunca espera a Meta mais que isto. */
const TEMPO_MAX_META_MS = 3000;

/** Só o pedaço do serviço oficial (Meta) que o painel usa. */
export interface WabaPainel {
  sendText(to: string, text: string): Promise<{ messageId: string }>;
  /** W2: texto respondendo (citando) outra mensagem. */
  sendTextReply?(to: string, text: string, contextMessageId: string): Promise<{ messageId: string }>;
  /** W2: reação com emoji (vazio = tirar). */
  sendReaction?(to: string, messageId: string, emoji: string): Promise<{ messageId: string }>;
  /** W1: sobe o arquivo na Meta (devolve o media_id). */
  uploadMedia?(buffer: Buffer, mimeType: string, filename: string): Promise<{ mediaId: string }>;
  /** W1: manda a mídia já enviada à Meta. */
  sendMediaById?(to: string, tipo: 'image' | 'video' | 'audio' | 'document', mediaId: string, opts?: { caption?: string; filename?: string; contextId?: string }): Promise<{ messageId: string }>;
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
  enviarPessoal?: (instancia: string, to: string, text: string, citada?: Citada) => Promise<{ messageId?: string } | void>;
  /** W2: texto citando pela instância QR do TENANT (roda dentro de noCanalDaEmpresa). */
  sendTextEvolutionCitando?: (to: string, text: string, citada: Citada) => Promise<unknown>;
  /** W3: marcar como LIDAS no WhatsApp (instância do dono) — "marcar como lida ao abrir". */
  marcarLidasEvolution?: (instancia: string, companyId: string, to: string, wamids: string[]) => Promise<unknown>;
  /** W2: reação pela Evolution (número pessoal do dono ou tenant). */
  reagirEvolution?: (instancia: string, companyId: string, to: string, alvo: { id: string; fromMe: boolean }, emoji: string) => Promise<{ messageId?: string } | void>;
  /** Parte 2b: número pessoal de quem está logado (padrão: whatsapp_numeros_pessoais). */
  numeroPessoal?: (companyId: string, userId: string) => Promise<NumeroPessoal | null>;
  /**
   * W1: mídia pela Evolution — instância do dono (número pessoal) ou do tenant.
   * O index.ts roda dentro da empresa/canal da instância (sendMediaBase64 /
   * sendWhatsAppAudio).
   */
  enviarMidiaEvolution?: (instancia: string, companyId: string, to: string, m: MidiaParaEnviar) => Promise<{ messageId?: string } | void>;
  /** W1: gravação do navegador (WebM) → OGG/Opus (ffmpeg). Ausente = gravação recusada. */
  converterAudio?: (webm: Buffer) => Promise<Buffer>;
  /** W1: foto WebP → JPEG para sair pela Meta (que só aceita JPEG/PNG como foto). Ausente = WebP recusada no número da Eva. */
  converterImagemJpeg?: (img: Buffer) => Promise<Buffer>;
}

/** Arquivo pronto para sair (já conferido e guardado). */
export interface MidiaParaEnviar { tipo: TipoMidia; mime: string; nome: string; base64: string; legenda: string; citada?: Citada }

/** W2: a mensagem que a resposta cita (id do WhatsApp + um pedaço do texto). */
export interface Citada { id: string; texto: string | null; fromMe: boolean }

const TIPO_META: Record<TipoMidia, 'image' | 'video' | 'audio' | 'document'> = { imagem: 'image', video: 'video', audio: 'audio', documento: 'document' };

/** Arquivo que o multer deixou em req.file. */
interface ArquivoRecebido { buffer: Buffer; originalname?: string; mimetype?: string; size?: number }

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

/**
 * O navegador pediu JSON? (envio SEM recarregar a página — o script do
 * responder manda `Accept: application/json`). Sem JS o formulário faz o
 * POST normal e recebe o redirect de sempre.
 */
export function querJson(req: Pick<Request, 'headers'>): boolean {
  return /application\/json/i.test(String(req.headers?.accept ?? ''));
}

/** Resposta JSON de um envio: o resultado já traduzido + a chave do PRÓXIMO clique. */
export function respostaDoEnvio(resultado: string): { ok: boolean; resultado: string; tom: 'ok' | 'erro' | 'aviso'; texto: string; avisoHtml: string; chave: string } {
  const r = Object.prototype.hasOwnProperty.call(RESULTADO_ENVIO, resultado) ? resultado : 'falhou';
  const info = RESULTADO_ENVIO[r];
  return {
    ok: r === 'enviada', resultado: r, tom: info.tom, texto: info.texto,
    avisoHtml: aviso({ tom: info.tom === 'ok' ? 'ok' : info.tom === 'erro' ? 'erro' : 'atencao', texto: info.texto }),
    chave: randomUUID(),
  };
}

interface LeadEnvio { id: string; name: string | null; phone: string | null; opt_out: boolean | null; eva_active: boolean | null; company_id: string | null; claimed_by?: string | null }

export function criarRotasAtendimento(deps: DepsAtendimento) {
  const limite = deps.limite ?? new LimiteDeEnvio();
  const semCache = (res: Response) => { if (typeof res.setHeader === 'function') res.setHeader('Cache-Control', 'private, no-store'); };
  const agora = deps.agora ?? (() => Date.now());
  const banco = deps.banco ?? ((req: AuthedRequest) => bancoDoOperador(req, deps.supabase));
  /** Respostas desta requisição saem em JSON (envio sem recarregar). */
  const emJson = new WeakSet<object>();
  const comJson = (fn: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response): Promise<void> => {
    if (querJson(req)) emJson.add(res);
    await fn(req, res);
  };
  /** Erro "de verdade" (400/403/404): texto no POST normal, JSON no envio sem recarregar. */
  const falha = (res: Response, status: number, texto: string): void => {
    if (emJson.has(res)) { res.status(status).json({ ok: false, resultado: 'erro', tom: 'erro', texto, avisoHtml: aviso({ tom: 'erro', texto }), chave: null }); return; }
    res.status(status).send(texto);
  };
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

  /**
   * W2 — a mensagem citada (body.citando = id da linha em mensagens_whatsapp).
   * Tem que ser DESTA conversa (lead da empresa, ou o contato do número pessoal
   * do dono), visível para quem envia, com id do WhatsApp e do MESMO número
   * por onde a resposta vai sair. Sem citação → null.
   */
  async function citadaDoPedido(
    req: AuthedRequest,
    alvo: { companyId: string; viewerId: string; leadId?: string; telefone?: string; canal: CanalConversa },
  ): Promise<{ ok: true; citada: Citada | null } | { ok: false; motivo: 'citacao_invalida' | 'citacao_outro_numero' }> {
    const id = String(req.body?.citando ?? '').trim();
    if (!id) return { ok: true, citada: null };
    if (!UUID_RE.test(id)) return { ok: false, motivo: 'citacao_invalida' };
    try {
      const { data, error } = await deps.supabase.from('mensagens_whatsapp')
        .select('id, company_id, lead_id, contato_telefone, visivel_so_para, wamid, texto, tipo, canal, direcao')
        .eq('id', id).eq('company_id', alvo.companyId).maybeSingle();
      const l = data as { lead_id: string | null; contato_telefone: string | null; visivel_so_para: string | null; wamid: string | null; texto: string | null; tipo: string; canal: string | null; direcao: string } | null;
      if (error || !l || !l.wamid || l.tipo === 'reacao' || l.direcao === 'evento' || !linhaVisivelPara(l, alvo.viewerId)) return { ok: false, motivo: 'citacao_invalida' };
      if (alvo.leadId ? l.lead_id !== alvo.leadId : (l.contato_telefone !== alvo.telefone || l.visivel_so_para !== alvo.viewerId)) return { ok: false, motivo: 'citacao_invalida' };
      const canalDaCitada = l.canal === 'whatsapp_business' ? 'whatsapp_business' : 'assistente';
      const canalDaResposta = alvo.canal === 'whatsapp_business' ? 'whatsapp_business' : 'assistente';
      if (canalDaCitada !== canalDaResposta) return { ok: false, motivo: 'citacao_outro_numero' };
      return { ok: true, citada: { id: l.wamid, texto: (l.texto ?? '').slice(0, 300) || null, fromMe: l.direcao === 'saida' } };
    } catch {
      return { ok: false, motivo: 'citacao_invalida' };
    }
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
      .select('id, name, phone, opt_out, eva_active, company_id, claimed_by')
      .eq('id', leadId);
    // Lead legado sem company_id é da casa (mesma regra da trava /leads/:id).
    const q = companyId === EMPRESA_CASA ? base.or(`company_id.eq.${EMPRESA_CASA},company_id.is.null`) : base.eq('company_id', companyId);
    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    return (data as LeadEnvio | null) ?? null;
  }

  function voltar(res: Response, leadId: string, resultado: string, canal?: CanalConversa): void {
    if (emJson.has(res)) { res.json(respostaDoEnvio(resultado)); return; }
    const r = Object.prototype.hasOwnProperty.call(RESULTADO_ENVIO, resultado) ? resultado : 'falhou';
    const c = canal === 'whatsapp_business' ? '&canal=whatsapp_business' : '';
    res.redirect(303, `/dashboard/leads/${leadId}?resp=${encodeURIComponent(r)}${c}#responder`);
  }

  /** Conferências comuns ao texto e ao modelo. Devolve o contexto ou já respondeu. */
  async function preparar(req: AuthedRequest, res: Response, tipo: 'texto' | 'modelo') {
    const leadId = String(req.params.id ?? '');
    if (!UUID_RE.test(leadId)) { falha(res, 400, 'id inválido'); return null; }
    const viewer = req.dashUser;
    if (!viewer?.companyId) { falha(res, 404, 'lead não encontrado'); return null; }
    const companyId = viewer.companyId;
    if (!mesmaOrigem(req)) { falha(res, 403, 'origem não permitida'); return null; }
    if (!chaveValida(req.body?.chave)) { voltar(res, leadId, 'chave_invalida'); return null; }
    const chave = String(req.body.chave);
    const db = banco(req);
    let lead: LeadEnvio | null;
    try { lead = await lerLead(db, leadId, companyId); } catch { voltar(res, leadId, 'erro_banco'); return null; }
    if (!lead) { falha(res, 404, 'lead não encontrado'); return null; }
    // Vendedor só responde o lead dele ou do balcão (mesma regra da tela do lead).
    if (!podeVerLead(viewer, { claimed_by: lead.claimed_by ?? null })) { falha(res, 403, 'lead de outro vendedor'); return null; }

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

  function depsComuns(ctx: NonNullable<Awaited<ReturnType<typeof preparar>>>, extra: { texto: string; modelo?: string; midia?: { tipo: TipoMidia; caminho: string; mime: string; nome: string; bytes: number }; citada?: Citada | null }) {
    const { companyId, leadId, viewer, canal } = ctx;
    // Número pessoal: a linha é privada (visivel_so_para) e a RLS restritiva da
    // 138 esconde do crachá — grava/fecha com o client de serviço + filtro explícito.
    const db = ctx.np ? deps.supabase : ctx.db;
    return {
      reservar: () => reservarEnvio(db, {
        company_id: companyId, lead_id: leadId, contato_telefone: ctx.telefone, contato_nome: ctx.lead.name,
        direcao: 'saida', autor: 'humano', user_id: viewer.id, autor_nome: (viewer.nome || '').slice(0, 80),
        canal, numero: ctx.via === 'evolution' ? ctx.instancia : null,
        tipo: extra.midia ? extra.midia.tipo : extra.modelo ? 'modelo' : 'texto', texto: extra.texto, modelo: extra.modelo ?? null,
        ...(extra.midia ? { midia_caminho: extra.midia.caminho, midia_mime: extra.midia.mime, midia_nome: extra.midia.nome, midia_bytes: extra.midia.bytes } : {}),
        ...(extra.citada ? { citando_wamid: extra.citada.id, citando_texto: extra.citada.texto } : {}),
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
            titulo: extra.midia ? 'Arquivo enviado pelo WhatsApp pessoal' : 'Mensagem enviada pelo WhatsApp pessoal', automatica: false, user_id: viewer.id,
          });
          await audit(ctx.db, { companyId, userId: viewer.id, entidade: 'lead', entidadeId: leadId, acao: 'whatsapp_enviado', campo: canal, valorNovo: extra.midia ? extra.midia.tipo : 'texto' });
          return;
        }
        await registrarAtividade(db, {
          company_id: companyId, lead_id: leadId, tipo: 'whatsapp',
          titulo: extra.midia ? `Arquivo enviado pelo painel (${extra.midia.tipo})` : extra.modelo ? `Modelo enviado pelo painel (${extra.modelo})` : 'Mensagem enviada pelo painel',
          descricao: extra.texto.slice(0, 1000), automatica: false, user_id: viewer.id,
        });
        await audit(db, { companyId, userId: viewer.id, entidade: 'lead', entidadeId: leadId, acao: 'whatsapp_enviado', campo: canal, valorNovo: extra.midia?.tipo ?? extra.modelo ?? 'texto' });
      },
    };
  }

  /** POST /leads/:id/responder — texto livre (número da Eva: só na janela de 24 h). */
  async function responder(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    const leadId = String(r.params.id ?? '');
    const v = validarTexto(r.body?.texto);
    if (!v.ok) { if (UUID_RE.test(leadId)) voltar(res, leadId, v.motivo); else falha(res, 400, 'id inválido'); return; }
    const ctx = await preparar(r, res, 'texto');
    if (!ctx) return;
    const cit = await citadaDoPedido(r, { companyId: ctx.companyId, viewerId: ctx.viewer.id, leadId: ctx.leadId, canal: ctx.canal });
    if (!cit.ok) { voltar(res, ctx.leadId, cit.motivo, ctx.canal); return; }
    const citada = cit.citada;
    const s = await enviarDoPainel({
      ...depsComuns(ctx, { texto: v.texto, citada }),
      enviar: () => ctx.np
        ? (citada ? deps.enviarPessoal!(ctx.np.instancia, ctx.telefone, v.texto, citada) : deps.enviarPessoal!(ctx.np.instancia, ctx.telefone, v.texto))
        : ctx.via === 'waba'
          ? (citada && deps.waba!.sendTextReply ? deps.waba!.sendTextReply(ctx.telefone, v.texto, citada.id) : deps.waba!.sendText(ctx.telefone, v.texto))
          : noCanalDaEmpresa(ctx.companyId, ctx.instancia, () => (citada && deps.sendTextEvolutionCitando
            ? deps.sendTextEvolutionCitando(ctx.telefone, v.texto, citada)
            : deps.sendTextEvolution!(ctx.telefone, v.texto))).then(() => undefined),
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

  // -------------------------------------------------------------------------
  // W1 — MÍDIA: enviar foto, PDF/documento, áudio e vídeo pelo painel
  // -------------------------------------------------------------------------

  /** Arquivo + legenda conferidos (antes de qualquer outra coisa). */
  function lerArquivo(req: AuthedRequest): { ok: true; arq: ArquivoValidado; dados: Buffer; legenda: string } | { ok: false; motivo: string } {
    const erroUpload = (req as unknown as { erroArquivo?: string }).erroArquivo;
    if (erroUpload) return { ok: false, motivo: erroUpload };
    const f = (req as unknown as { file?: ArquivoRecebido }).file;
    if (!f || !Buffer.isBuffer(f.buffer) || f.buffer.length === 0) return { ok: false, motivo: 'sem_arquivo' };
    let legenda = String(req.body?.legenda ?? '').replace(/\r\n/g, '\n').trim();
    if (legenda.length > LIMITE_LEGENDA) return { ok: false, motivo: 'legenda_longa' };
    const v = validarArquivo({ nome: f.originalname, mime: f.mimetype, dados: f.buffer });
    if (!v.ok) return { ok: false, motivo: v.motivo === 'grande_demais' ? 'arquivo_grande' : v.motivo === 'vazio' ? 'sem_arquivo' : 'arquivo_invalido' };
    // Áudio não leva legenda no WhatsApp (nem na Meta nem na Evolution): não grava o que não sai.
    if (v.tipo === 'audio') legenda = '';
    return { ok: true, arq: v, dados: f.buffer, legenda };
  }

  /** Gravação do navegador (WebM) → OGG/Opus. Falhou/sem conversor → null. */
  async function prepararAudio(a: ArquivoValidado, dados: Buffer): Promise<{ arq: ArquivoValidado; dados: Buffer } | null> {
    if (!a.precisaConverter) return { arq: a, dados };
    if (!deps.converterAudio) return null;
    try {
      const ogg = await deps.converterAudio(dados);
      const nome = a.nome.replace(/\.[^.]+$/, '') + '.ogg';
      const v = validarArquivo({ nome, mime: 'audio/ogg', dados: ogg });
      return v.ok ? { arq: v, dados: ogg } : null;
    } catch (e) {
      console.warn(`[atendimento] gravação não converteu: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Ajustes que só a Meta exige: foto WebP vira JPEG (WebP lá é figurinha);
   * CSV sobe como texto simples (a lista de documentos da Meta não tem CSV).
   * null = não dá para mandar por este canal.
   */
  async function paraAMeta(arq: ArquivoValidado, dados: Buffer): Promise<{ arq: ArquivoValidado; dados: Buffer } | null> {
    if (arq.mime === 'image/webp') {
      if (!deps.converterImagemJpeg) return null;
      try {
        const jpg = await deps.converterImagemJpeg(dados);
        const v = validarArquivo({ nome: arq.nome.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', dados: jpg });
        return v.ok ? { arq: v, dados: jpg } : null;
      } catch { return null; }
    }
    if (arq.mime === 'text/csv') return { arq: { ...arq, mime: 'text/plain' }, dados };
    return { arq, dados };
  }

  /** Manda o arquivo pelo canal certo (Meta por id / Evolution em base64). */
  function enviarArquivo(p: { via: ViaEnvio; instancia: string | null; companyId: string; telefone: string; pessoal: boolean }, arq: ArquivoValidado, dados: Buffer, legenda: string, citada?: Citada | null): Promise<{ messageId?: string } | void> {
    if (p.via === 'waba' && !p.pessoal) {
      const w = deps.waba;
      if (!w?.uploadMedia || !w.sendMediaById) return Promise.reject(new Error('envio de mídia pela Meta não configurado'));
      return w.uploadMedia(dados, arq.mime, arq.nome)
        .then(({ mediaId }) => w.sendMediaById!(p.telefone, TIPO_META[arq.tipo], mediaId, { caption: legenda || undefined, filename: arq.nome, ...(citada ? { contextId: citada.id } : {}) }));
    }
    const inst = p.instancia;
    const enviar = deps.enviarMidiaEvolution;
    if (!enviar || !inst) return Promise.reject(new Error('envio de mídia pela Evolution não configurado'));
    const m: MidiaParaEnviar = { tipo: arq.tipo, mime: arq.mime, nome: arq.nome, base64: dados.toString('base64'), legenda, ...(citada ? { citada } : {}) };
    // Tenant: dentro do canal DA EMPRESA (nunca pelo número de outra). Pessoal: o index roda na instância do dono.
    return p.pessoal
      ? enviar(inst, p.companyId, p.telefone, m)
      : noCanalDaEmpresa(p.companyId, inst, () => enviar(inst, p.companyId, p.telefone, m));
  }

  /**
   * Multipart do painel: UM arquivo, em memória, até 16 MB (+ folga). Erro do
   * upload (grande demais, campo a mais) não derruba: vira o motivo e a rota
   * responde como qualquer outro envio recusado.
   */
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITE_MIDIA_BYTES + 1024, files: 1, fields: 8, fieldSize: 8 * 1024 } }).single('arquivo');
  /** Envios de arquivo em andamento por pessoa: no máximo 2 ao mesmo tempo (memória do servidor). */
  const subindo = new Map<string, number>();
  const comArquivo = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response): void => {
    const quem = (req as AuthedRequest).dashUser?.id ?? '?';
    // Maior que o limite já pelo cabeçalho: recusa SEM ler o arquivo.
    const cl = Number(req.headers?.['content-length'] ?? 0);
    if ((Number.isFinite(cl) && cl > LIMITE_MIDIA_BYTES + 64 * 1024) || (subindo.get(quem) ?? 0) >= 2) {
      (req as unknown as { erroArquivo?: string }).erroArquivo = (subindo.get(quem) ?? 0) >= 2 ? 'limite' : 'arquivo_grande';
      if (querJson(req)) emJson.add(res);
      void fn(req, res).catch(() => { if (!res.headersSent) falha(res, 500, 'erro ao enviar o arquivo'); });
      return;
    }
    subindo.set(quem, (subindo.get(quem) ?? 0) + 1);
    const soltar = () => { const n = (subindo.get(quem) ?? 1) - 1; if (n <= 0) subindo.delete(quem); else subindo.set(quem, n); };
    upload(req, res, (err?: unknown) => {
      if (err) {
        const code = (err as { code?: string }).code;
        (req as unknown as { erroArquivo?: string }).erroArquivo = code === 'LIMIT_FILE_SIZE' ? 'arquivo_grande' : 'arquivo_invalido';
      }
      void fn(req, res).catch((e) => {
        console.warn(`[atendimento] envio de arquivo quebrou: ${(e as Error).message}`);
        if (!res.headersSent) falha(res, 500, 'erro ao enviar o arquivo');
      }).finally(soltar);
    });
  };

  /** Envio que não chegou a sair por causa da chave/banco: o arquivo guardado à toa sai do bucket. */
  const naoSaiu = (resultado: string) => resultado === 'duplicado' || resultado === 'ja_falhou' || resultado === 'erro_banco';

  /** POST /leads/:id/responder-midia — arquivo (multipart). Número da Eva: só na janela de 24 h. */
  async function responderMidia(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    const leadId = String(r.params.id ?? '');
    if (!UUID_RE.test(leadId)) { falha(res, 400, 'id inválido'); return; }
    const a = lerArquivo(r);
    if (!a.ok) { voltar(res, leadId, a.motivo, r.body?.canal === 'whatsapp_business' ? 'whatsapp_business' : undefined); return; }
    const ctx = await preparar(r, res, 'texto');
    if (!ctx) return;
    const pronto = await prepararAudio(a.arq, a.dados);
    if (!pronto) { voltar(res, leadId, 'audio_invalido', ctx.canal); return; }
    const naMeta = ctx.via === 'waba' && !ctx.np ? await paraAMeta(pronto.arq, pronto.dados) : pronto;
    if (!naMeta) { voltar(res, leadId, 'arquivo_invalido', ctx.canal); return; }
    const { arq, dados } = naMeta;
    // Sem guardar, não sai: o arquivo fica no bucket privado ANTES do envio.
    const g = await guardarMidia(deps.supabase, { companyId: ctx.companyId, dados, mime: arq.mime, ext: arq.ext });
    if (!g.ok) { console.warn(`[atendimento] arquivo não guardado: ${g.erro}`); voltar(res, leadId, 'erro_arquivo', ctx.canal); return; }
    const texto = textoDaMidia(arq.tipo, a.legenda, arq.nome);
    const cit = await citadaDoPedido(r, { companyId: ctx.companyId, viewerId: ctx.viewer.id, leadId: ctx.leadId, canal: ctx.canal });
    if (!cit.ok) { await apagarMidia(deps.supabase, g.caminho); voltar(res, ctx.leadId, cit.motivo, ctx.canal); return; }
    let s: Awaited<ReturnType<typeof enviarDoPainel>>;
    try {
      s = await enviarDoPainel({
        ...depsComuns(ctx, { texto, midia: { tipo: arq.tipo, caminho: g.caminho, mime: arq.mime, nome: arq.nome, bytes: arq.bytes }, citada: cit.citada }),
        enviar: () => enviarArquivo({ via: ctx.via, instancia: ctx.instancia, companyId: ctx.companyId, telefone: ctx.telefone, pessoal: !!ctx.np }, arq, dados, a.legenda, cit.citada),
      });
    } catch (e) {
      await apagarMidia(deps.supabase, g.caminho);
      throw e;
    }
    if (naoSaiu(s.resultado)) await apagarMidia(deps.supabase, g.caminho);
    console.log(`[atendimento] arquivo (${arq.tipo}) ${ctx.leadId.slice(0, 8)} por ${ctx.np ? 'numero_pessoal' : ctx.via} (${ctx.viewer.id.slice(0, 8)}): ${s.resultado}${s.erro ? ` — ${semTelefone(s.erro)}` : ''}`);
    voltar(res, ctx.leadId, s.resultado, ctx.canal);
  }

  /** POST /leads/conversas/contato/responder-midia — arquivo pelo número pessoal, pra quem ainda não é lead. */
  async function responderContatoMidia(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    const viewer = r.dashUser;
    const telefone = normalizeBrazilianPhone(String(r.body?.telefone ?? ''));
    if (!viewer?.companyId || !telefone) { falha(res, 404, 'conversa não encontrada'); return; }
    if (!mesmaOrigem(r)) { falha(res, 403, 'origem não permitida'); return; }
    const companyId = viewer.companyId;
    if (!chaveValida(r.body?.chave)) { voltarContato(res, telefone, 'chave_invalida'); return; }
    const a = lerArquivo(r);
    if (!a.ok) { voltarContato(res, telefone, a.motivo); return; }
    const np = await pessoalDe(companyId, viewer.id);
    if (!np) { voltarContato(res, telefone, 'sem_canal'); return; }
    // Só responde quem já conversou com ESTE dono no número pessoal.
    const conversa = await mensagensPessoais(deps.supabase, companyId, viewer.id, { telefone }, 1);
    if (conversa.length === 0) { falha(res, 404, 'conversa não encontrada'); return; }
    const chave = String(r.body.chave);
    const jaUsada = await statusDaChave(deps.supabase, companyId, chave);
    if (jaUsada) { voltarContato(res, telefone, jaUsada === 'falhou' ? 'ja_falhou' : 'duplicado'); return; }
    if (!limite.permitir(viewer.id, `${companyId}:${telefone}`, agora())) { voltarContato(res, telefone, 'limite'); return; }
    const pronto = await prepararAudio(a.arq, a.dados);
    if (!pronto) { voltarContato(res, telefone, 'audio_invalido'); return; }
    const { arq, dados } = pronto;
    const g = await guardarMidia(deps.supabase, { companyId, dados, mime: arq.mime, ext: arq.ext });
    if (!g.ok) { voltarContato(res, telefone, 'erro_arquivo'); return; }
    const cit = await citadaDoPedido(r, { companyId, viewerId: viewer.id, telefone, canal: 'whatsapp_business' });
    if (!cit.ok) { await apagarMidia(deps.supabase, g.caminho); voltarContato(res, telefone, cit.motivo); return; }
    const leadDoContato = await leadDoTelefoneNaEmpresa(deps.supabase, companyId, telefone).catch(() => null);
    const s = await enviarDoPainel({
      reservar: () => reservarEnvio(deps.supabase, {
        company_id: companyId, lead_id: leadDoContato?.id ?? null, contato_telefone: telefone, contato_nome: conversa[0]?.contato_nome ?? null,
        direcao: 'saida', autor: 'humano', user_id: viewer.id, autor_nome: (viewer.nome || '').slice(0, 80),
        canal: 'whatsapp_business', numero: np.instancia, tipo: arq.tipo, texto: textoDaMidia(arq.tipo, a.legenda, arq.nome),
        midia_caminho: g.caminho, midia_mime: arq.mime, midia_nome: arq.nome, midia_bytes: arq.bytes,
        ...(cit.citada ? { citando_wamid: cit.citada.id, citando_texto: cit.citada.texto } : {}),
        origem: 'painel', chave_envio: chave, visivel_so_para: viewer.id,
      }),
      concluir: (id, x) => concluirEnvio(deps.supabase, id, companyId, x),
      enviar: () => enviarArquivo({ via: 'evolution', instancia: np.instancia, companyId, telefone, pessoal: true }, arq, dados, a.legenda, cit.citada),
    });
    if (naoSaiu(s.resultado)) await apagarMidia(deps.supabase, g.caminho);
    console.log(`[atendimento] numero pessoal → contato, arquivo ${arq.tipo} (${viewer.id.slice(0, 8)}): ${s.resultado}${s.erro ? ` — ${semTelefone(s.erro)}` : ''}`);
    voltarContato(res, telefone, s.resultado);
  }

  /**
   * GET /leads/midia/:id — ver/baixar o arquivo de uma mensagem. LGPD: só quem
   * vê a conversa (empresa da sessão; conversa pessoal só o dono; lead de outro
   * vendedor não). Responde com um redirecionamento para URL assinada de 2 min.
   */
  async function midia(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    semCache(res);
    const id = String(r.params?.id ?? '');
    if (!UUID_RE.test(id)) { res.status(400).send('id inválido'); return; }
    const viewer = r.dashUser;
    if (!viewer?.companyId) { res.status(404).send('arquivo não encontrado'); return; }
    const companyId = viewer.companyId;
    try {
      const { data, error } = await deps.supabase.from('mensagens_whatsapp')
        .select('id, company_id, lead_id, visivel_so_para, tipo, midia_caminho, midia_nome')
        .eq('id', id).eq('company_id', companyId).maybeSingle();
      const l = data as { lead_id: string | null; visivel_so_para: string | null; tipo: string; midia_caminho: string | null; midia_nome: string | null } | null;
      if (error || !l || !l.midia_caminho || !linhaVisivelPara(l, viewer.id) || !caminhoDaEmpresa(l.midia_caminho, companyId)) {
        res.status(404).send('arquivo não encontrado'); return;
      }
      if (l.lead_id) {
        const base = deps.supabase.from('leads').select('id, claimed_by, company_id').eq('id', l.lead_id);
        const { data: lead } = await (companyId === EMPRESA_CASA ? base.or(`company_id.eq.${EMPRESA_CASA},company_id.is.null`) : base.eq('company_id', companyId)).maybeSingle();
        // Conversa pessoal: o dono do número vê o que é dele (a trava de vendedor vale para as da empresa).
        const doDono = !!l.visivel_so_para && l.visivel_so_para === viewer.id;
        if (!lead || (!doDono && !podeVerLead(viewer, lead as { claimed_by: string | null }))) { res.status(404).send('arquivo não encontrado'); return; }
      } else if (!l.visivel_so_para) {
        res.status(404).send('arquivo não encontrado'); return;
      }
      const baixar = String(r.query?.baixar ?? '') === '1';
      const ext = l.midia_caminho.split('.').pop() ?? 'bin';
      const url = await urlDaMidia(deps.supabase, l.midia_caminho, baixar ? { baixarComo: l.midia_nome || `arquivo.${ext}` } : {});
      if (!url) { res.status(404).send('arquivo não encontrado'); return; }
      if (typeof res.setHeader === 'function') res.setHeader('Referrer-Policy', 'no-referrer');
      res.redirect(302, url);
    } catch (e) {
      console.warn(`[atendimento] mídia ${id.slice(0, 8)} falhou: ${(e as Error).message}`);
      res.status(500).send('erro ao abrir o arquivo');
    }
  }

  // -------------------------------------------------------------------------
  // W2 — REAGIR com emoji (não assume a conversa: não é resposta com texto)
  // -------------------------------------------------------------------------

  /** A mensagem reagida: desta conversa, visível, com id do WhatsApp. */
  async function alvoDaReacao(companyId: string, viewerId: string, id: string, conversa: { leadId?: string; telefone?: string }) {
    if (!UUID_RE.test(id)) return null;
    const { data, error } = await deps.supabase.from('mensagens_whatsapp')
      .select('id, company_id, lead_id, contato_telefone, visivel_so_para, wamid, tipo, canal, numero, direcao')
      .eq('id', id).eq('company_id', companyId).maybeSingle();
    const l = data as { lead_id: string | null; contato_telefone: string | null; visivel_so_para: string | null; wamid: string | null; tipo: string; canal: CanalConversa | null; numero: string | null; direcao: string } | null;
    if (error || !l || !l.wamid || l.tipo === 'reacao' || l.direcao === 'evento' || !linhaVisivelPara(l, viewerId)) return null;
    if (conversa.leadId ? l.lead_id !== conversa.leadId : (l.contato_telefone !== conversa.telefone || l.visivel_so_para !== viewerId)) return null;
    return l;
  }

  function voltarReacao(res: Response, destino: string, resultado: string): void {
    if (emJson.has(res)) { const j = respostaDoEnvio(resultado); res.json({ ...j, ok: resultado === 'reacao_enviada' || resultado === 'reacao_nao_gravada' }); return; }
    res.redirect(303, destino);
  }

  /** Envia a reação pelo MESMO número da mensagem reagida e grava. */
  async function mandarReacao(p: {
    companyId: string; viewer: { id: string; nome?: string | null }; telefone: string; leadId: string | null; contatoNome: string | null;
    alvo: { wamid: string; canal: CanalConversa | null; direcao: string; visivel_so_para: string | null }; emoji: string;
  }): Promise<string> {
    const pessoal = p.alvo.canal === 'whatsapp_business';
    const np = pessoal ? await pessoalDe(p.companyId, p.viewer.id) : null;
    if (pessoal && (!np || p.alvo.visivel_so_para !== p.viewer.id)) return 'sem_canal';
    const { via, instancia, motivo } = pessoal ? { via: 'evolution' as ViaEnvio, instancia: np!.instancia, motivo: undefined } : await viaDaEmpresa(p.companyId);
    if (via === 'nenhum') return motivo ?? 'sem_canal';
    if (envioProibido(p.telefone, deps.engineerPhone, empresaDe(p.companyId))) return 'bloqueado_lgpd';
    if (via === 'waba') {
      // Reação é mensagem livre: na Meta, só com a janela de 24 h aberta.
      const msgs: MensagemChat[] = p.leadId ? await historicoDoLead(deps.supabase, p.leadId, p.companyId, p.viewer.id).catch(() => []) : [];
      if (!janelaAtendimento(ultimaDoCliente(msgs, canalDaAssistente(p.companyId)), agora()).aberta) return 'janela_fechada';
    }
    if (!limite.permitir(p.viewer.id, `${p.companyId}:${p.telefone}:reacao`, agora())) return 'limite';
    const alvoWa = { id: p.alvo.wamid, fromMe: p.alvo.direcao === 'saida' };
    try {
      const s = via === 'waba'
        ? (deps.waba?.sendReaction ? await deps.waba.sendReaction(p.telefone, p.alvo.wamid, p.emoji) : await Promise.reject(new Error('reação pela Meta não configurada')))
        : !deps.reagirEvolution || !instancia
          ? await Promise.reject(new Error('reação pela Evolution não configurada'))
          : pessoal
            ? await deps.reagirEvolution(instancia, p.companyId, p.telefone, alvoWa, p.emoji)
            : await noCanalDaEmpresa(p.companyId, instancia, () => deps.reagirEvolution!(instancia, p.companyId, p.telefone, alvoWa, p.emoji));
      const gravou = await gravarReacao(deps.supabase, {
        companyId: p.companyId, leadId: p.leadId, telefone: p.telefone, alvoWamid: p.alvo.wamid, emoji: p.emoji, de: 'humano',
        userId: p.viewer.id, autorNome: (p.viewer.nome || '').slice(0, 80) || null, canal: (p.alvo.canal ?? canalDaAssistente(p.companyId)) as CanalConversa,
        numero: via === 'evolution' ? instancia : null, visivelSoPara: pessoal ? p.viewer.id : null,
        wamid: (s && typeof s === 'object' && 'messageId' in s ? (s as { messageId?: string }).messageId : null) || null, contatoNome: p.contatoNome,
      });
      // Saiu no WhatsApp, mas não ficou no painel (ex.: migration 142 ainda não aplicada).
      return gravou ? 'reacao_enviada' : 'reacao_nao_gravada';
    } catch (e) {
      console.warn(`[atendimento] reação não saiu: ${semTelefone((e as Error).message)}`);
      return 'falhou';
    }
  }

  /** POST /leads/:id/reagir — { alvo: id da mensagem, emoji } (emoji vazio = tirar). */
  async function reagir(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    const leadId = String(r.params.id ?? '');
    if (!UUID_RE.test(leadId)) { falha(res, 400, 'id inválido'); return; }
    const viewer = r.dashUser;
    if (!viewer?.companyId) { falha(res, 404, 'lead não encontrado'); return; }
    if (!mesmaOrigem(r)) { falha(res, 403, 'origem não permitida'); return; }
    const destino = `/dashboard/leads/${leadId}#conversa`;
    const emoji = r.body?.emoji ?? '';
    if (!emojiDeReacaoValido(emoji)) { voltarReacao(res, destino, 'reacao_invalida'); return; }
    let lead: LeadEnvio | null;
    try { lead = await lerLead(banco(r), leadId, viewer.companyId); } catch { voltarReacao(res, destino, 'erro_banco'); return; }
    if (!lead) { falha(res, 404, 'lead não encontrado'); return; }
    if (!podeVerLead(viewer, { claimed_by: lead.claimed_by ?? null })) { falha(res, 403, 'lead de outro vendedor'); return; }
    if (lead.opt_out) { voltarReacao(res, destino, 'opt_out'); return; }
    const telefone = normalizeBrazilianPhone(lead.phone ?? '');
    if (!telefone) { voltarReacao(res, destino, 'sem_telefone'); return; }
    const alvo = await alvoDaReacao(viewer.companyId, viewer.id, String(r.body?.alvo ?? ''), { leadId }).catch(() => null);
    if (!alvo) { falha(res, 404, 'mensagem não encontrada'); return; }
    const x = await mandarReacao({ companyId: viewer.companyId, viewer, telefone, leadId, contatoNome: lead.name, alvo: { ...alvo, wamid: alvo.wamid! }, emoji });
    voltarReacao(res, destino, x);
  }

  /** POST /leads/conversas/contato/reagir — número pessoal, com quem ainda não é lead (só o dono). */
  async function reagirContato(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    const viewer = r.dashUser;
    const telefone = normalizeBrazilianPhone(String(r.body?.telefone ?? ''));
    if (!viewer?.companyId || !telefone) { falha(res, 404, 'conversa não encontrada'); return; }
    if (!mesmaOrigem(r)) { falha(res, 403, 'origem não permitida'); return; }
    const destino = `/dashboard/leads/conversas?contato=${encodeURIComponent(telefone)}`;
    const emoji = r.body?.emoji ?? '';
    if (!emojiDeReacaoValido(emoji)) { voltarReacao(res, destino, 'reacao_invalida'); return; }
    const alvo = await alvoDaReacao(viewer.companyId, viewer.id, String(r.body?.alvo ?? ''), { telefone }).catch(() => null);
    if (!alvo || alvo.canal !== 'whatsapp_business') { falha(res, 404, 'mensagem não encontrada'); return; }
    const x = await mandarReacao({ companyId: viewer.companyId, viewer, telefone, leadId: alvo.lead_id, contatoNome: null, alvo: { ...alvo, wamid: alvo.wamid! }, emoji });
    voltarReacao(res, destino, x);
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
    // Página aberta (sem ?assinatura=) ou atualização com a aba em foco.
    if (req.query?.assinatura === undefined || String(req.query?.foco ?? '') === '1') aoAbrirConversa(req, { telefone });
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
    if (emJson.has(res)) { res.json(respostaDoEnvio(resultado)); return; }
    const r = Object.prototype.hasOwnProperty.call(RESULTADO_ENVIO, resultado) ? resultado : 'falhou';
    res.redirect(303, `/dashboard/leads/conversas?contato=${encodeURIComponent(telefone)}&resp=${encodeURIComponent(r)}#responder`);
  }

  /** POST /leads/conversas/contato/responder — pelo número pessoal, pra quem ainda não é lead. */
  async function responderContato(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    const viewer = r.dashUser;
    const telefone = normalizeBrazilianPhone(String(r.body?.telefone ?? ''));
    if (!viewer?.companyId || !telefone) { falha(res, 404, 'conversa não encontrada'); return; }
    if (!mesmaOrigem(r)) { falha(res, 403, 'origem não permitida'); return; }
    const companyId = viewer.companyId;
    if (!chaveValida(r.body?.chave)) { voltarContato(res, telefone, 'chave_invalida'); return; }
    const v = validarTexto(r.body?.texto);
    if (!v.ok) { voltarContato(res, telefone, v.motivo); return; }
    const np = await pessoalDe(companyId, viewer.id);
    if (!np) { voltarContato(res, telefone, 'sem_canal'); return; }
    // Só responde quem já conversou com ESTE dono no número pessoal.
    const conversa = await mensagensPessoais(deps.supabase, companyId, viewer.id, { telefone }, 1);
    if (conversa.length === 0) { falha(res, 404, 'conversa não encontrada'); return; }
    const chave = String(r.body.chave);
    const jaUsada = await statusDaChave(deps.supabase, companyId, chave);
    if (jaUsada) { voltarContato(res, telefone, jaUsada === 'falhou' ? 'ja_falhou' : 'duplicado'); return; }
    if (!limite.permitir(viewer.id, `${companyId}:${telefone}`, agora())) { voltarContato(res, telefone, 'limite'); return; }
    const cit = await citadaDoPedido(r, { companyId, viewerId: viewer.id, telefone, canal: 'whatsapp_business' });
    if (!cit.ok) { voltarContato(res, telefone, cit.motivo); return; }
    const leadDoContato = await leadDoTelefoneNaEmpresa(deps.supabase, companyId, telefone).catch(() => null);
    const s = await enviarDoPainel({
      reservar: () => reservarEnvio(deps.supabase, {
        company_id: companyId, lead_id: leadDoContato?.id ?? null, contato_telefone: telefone, contato_nome: conversa[0]?.contato_nome ?? null,
        direcao: 'saida', autor: 'humano', user_id: viewer.id, autor_nome: (viewer.nome || '').slice(0, 80),
        canal: 'whatsapp_business', numero: np.instancia, tipo: 'texto', texto: v.texto,
        ...(cit.citada ? { citando_wamid: cit.citada.id, citando_texto: cit.citada.texto } : {}),
        origem: 'painel', chave_envio: chave, visivel_so_para: viewer.id,
      }),
      concluir: (id, x) => concluirEnvio(deps.supabase, id, companyId, x),
      enviar: () => (cit.citada ? deps.enviarPessoal!(np.instancia, telefone, v.texto, cit.citada) : deps.enviarPessoal!(np.instancia, telefone, v.texto)),
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

  /**
   * W3: "digitando…" desta conversa — a do número pessoal só para o DONO; a da
   * assistente por QR (tenant) para a empresa. (A Meta não avisa quando o
   * cliente digita no número oficial.)
   */
  async function digitandoAgora(companyId: string, viewerId: string, telefone: string | null | undefined): Promise<'digitando' | 'gravando' | null> {
    const t = normalizeBrazilianPhone(telefone ?? '');
    if (!t) return null;
    const tels = variantesTelefone(t);
    const dono = await donoDoNumero(companyId, viewerId).catch(() => null);
    return (dono ? estaDigitando(companyId, viewerId, tels) : null) ?? estaDigitando(companyId, null, tels);
  }

  /**
   * W3: abriu a conversa → marca como lida no WhatsApp as recebidas pelo número
   * pessoal (só o dono, só com a opção ligada). Não segura a tela: roda por fora.
   */
  function aoAbrirConversa(req: AuthedRequest, alvo: { leadId?: string | null; telefone?: string | null }): void {
    const v = req.dashUser;
    if (!v?.companyId || !deps.marcarLidasEvolution) return;
    void (async () => {
      const np = await pessoalDe(v.companyId, v.id);
      if (!np) return;
      await marcarLidasAoAbrir(deps.supabase, { np, viewerId: v.id, leadId: alvo.leadId ?? null, telefone: alvo.telefone ?? null }, deps.marcarLidasEvolution!);
    })().catch((e) => console.warn(`[lido] marcar como lida falhou: ${(e as Error).message}`));
  }

  /** Nome do dono do número pessoal quando QUEM ESTÁ VENDO é o dono (rótulo "👤 Junior"). Nunca lança. */
  async function nomeDoDonoPessoal(req: AuthedRequest): Promise<string | null> {
    const v = req.dashUser;
    if (!v?.companyId) return null;
    const np = await donoDoNumero(v.companyId, v.id).catch(() => null);
    return np ? (np.dono_nome || 'Meu WhatsApp') : null;
  }

  // -------------------------------------------------------------------------
  // Conversa aberta SEM recarregar (Junior 28/09: "demora e dá um toque na tela
  // inteira"): o script pede os pedaços da conversa a cada poucos segundos (só
  // com a aba visível) e logo depois de cada envio. Mesmo HTML da página; a
  // `assinatura` evita mandar tudo de novo quando nada mudou.
  // -------------------------------------------------------------------------


  /** GET /leads/:id/conversa.json — mesmos portões da tela do lead (trava de empresa no router + aqui). */
  async function conversaJson(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    semCache(res);
    const leadId = String(r.params?.id ?? '');
    if (!UUID_RE.test(leadId)) { res.status(400).json({ erro: 'id inválido' }); return; }
    const viewer = r.dashUser;
    if (!viewer?.companyId) { res.status(404).json({ erro: 'lead não encontrado' }); return; }
    const companyId = viewer.companyId;
    const db = banco(r);
    try {
      const base = db.from('leads')
        .select('id, name, phone, status, eva_active, opt_out, city, uf, created_at, claimed_by, company_id, installation_status')
        .eq('id', leadId);
      const { data, error } = await (companyId === EMPRESA_CASA ? base.or(`company_id.eq.${EMPRESA_CASA},company_id.is.null`) : base.eq('company_id', companyId)).maybeSingle();
      if (error) { res.status(503).json({ erro: 'banco indisponível' }); return; }
      const lead = data as (LeadDetail & { claimed_by: string | null }) | null;
      if (!lead) { res.status(404).json({ erro: 'lead não encontrado' }); return; }
      if (!podeVerLead(viewer, lead)) { res.status(403).json({ erro: 'lead de outro vendedor' }); return; }
      const [mensagens, anexos, donoPessoal] = await Promise.all([
        historicoDoLead(db, leadId, companyId, viewer.id, deps.supabase).catch(() => [] as MensagemChat[]),
        Promise.resolve(db.from('lead_anexos').select('id').eq('lead_id', leadId).limit(1)).then((x) => (x.data ?? []) as unknown[]).catch(() => [] as unknown[]),
        nomeDoDonoPessoal(r),
      ]);
      const envio = can(viewer, 'leads', 'editar') ? await envioDaTela(r, lead, mensagens) : undefined;
      const digitando = await digitandoAgora(companyId, viewer.id, lead.phone);
      // Atualização automática: só marca como lida se a aba está EM FOCO (como o WhatsApp Web).
      if (String(r.query?.foco ?? '') === '1') aoAbrirConversa(r, { leadId });
      const p = pedacosDaConversa({ user: viewer, lead: { ...lead, anexos } as unknown as LeadDetail, mensagens, envio, donoPessoal, digitando });
      const assinatura = assinaturaDaConversa(p);
      if (String(r.query?.assinatura ?? '') === assinatura) { res.json({ igual: true, assinatura }); return; }
      res.json({ assinatura, ...p });
    } catch (e) {
      console.warn(`[atendimento] conversa.json ${leadId.slice(0, 8)} falhou: ${(e as Error).message}`);
      res.status(500).json({ erro: 'falhou' });
    }
  }

  /** GET /leads/conversas/contato.json?contato= — conversa do número pessoal com quem não é lead (só o dono). */
  async function contatoJson(req: Request, res: Response): Promise<void> {
    const r = req as AuthedRequest;
    semCache(res);
    try {
      const x = await contatoDaTela(r);
      if (!x) { res.status(404).json({ erro: 'conversa não encontrada' }); return; }
      if ('leadId' in x) { res.json({ irPara: `/dashboard/leads/${x.leadId}?canal=whatsapp_business` }); return; }
      const digitando = r.dashUser?.companyId ? await digitandoAgora(r.dashUser.companyId, r.dashUser.id, x.contato.telefone) : null;
      const p = pedacosDoContato({ user: r.dashUser, contato: x.contato, donoPessoal: x.donoPessoal, digitando });
      const assinatura = assinaturaDaConversa(p);
      if (String(r.query?.assinatura ?? '') === assinatura) { res.json({ igual: true, assinatura }); return; }
      res.json({ assinatura, ...p });
    } catch (e) {
      console.warn(`[atendimento] contato.json falhou: ${(e as Error).message}`);
      res.status(500).json({ erro: 'falhou' });
    }
  }

  return {
    responder: comJson(responder), responderModelo: comJson(responderModelo), assumir, devolver, envioDaTela, modelos, contatoDaTela,
    responderContato: comJson(responderContato), virarLeadDoContato, nomeDoDonoPessoal, conversaJson, contatoJson,
    responderMidia: comJson(responderMidia), responderContatoMidia: comJson(responderContatoMidia), midia,
    /** Para o router: multer + handler (o arquivo chega em req.file). */
    comArquivo,
    reagir: comJson(reagir), reagirContato: comJson(reagirContato),
    /** W3: a página do lead chama ao abrir (marca como lida no número pessoal). */
    aoAbrirConversa,
  };
}
