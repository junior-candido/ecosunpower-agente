// src/modules/cobranca-recorrente/servico.ts
// Liga o motor/baixa (puros, testados com dublês) no mundo real: banco
// (service-role), InfinitePay (link), WhatsApp oficial (WABA — só MODELO),
// e-mail (Resend), caixa (financeiro_lancamentos) e o zap do Junior.
// Quem usa: src/index.ts (robô diário + webhook) e dashboard/router.ts
// (botões da tela da casa).
//
// Sem segredo aqui: handle da InfinitePay, chaves e números vêm da config.

import type { SupabaseClient } from '@supabase/supabase-js';
import { criarLinkPagamento, type CriarLinkParams, type CriarLinkResult } from '../infinitepay.js';
import { criarConfirmado, getCategorias } from '../financeiro/lancamentos-repo.js';
import { montarMolduraEmail } from '../email/email-moldura.js';
import {
  getAssinaturaDaDona, getAssinatura, listarCobraveis, listarAssinaturas, registrarPagamentoNaAssinatura, descricaoDaAssinatura,
  listarEmpresasSimples, pausarAssistenteNoBanco, reativarAssistenteNoBanco, pausarDisparosNoBanco, editarAssinatura,
  type AssinaturaRow,
} from '../dashboard/assinaturas-store.js';
import {
  criarFatura, faturasDaAssinatura, reservarAviso, liberarAviso, registrarCanal, salvarCobrancaDaFatura,
  vincularCobrancaSeLivre, marcarFaturaPaga, vincularLancamento, getFaturaDaDona, getFaturaPorCobranca,
  reservarExecucaoDoDia, faturasDaDona, type FaturaRow, type InfoBaixa,
} from './faturas-repo.js';
import {
  rodarCobrancaRecorrente, gerarCobrancaAgora, reenviarFatura, pausarAssistenteDe, reativarAssistenteDe,
  type AssinaturaMotor, type MotorDeps, type PausaDeps, type ResultadoManual, type ResumoRodada,
} from './motor.js';
import { baixarFatura, type BaixaDeps, type InfoPagamento } from './baixa.js';
import { diasPausaValidos, diasTravaDisparosValidos, podePausar, limparCacheDisparos } from './pausa.js';
import { reagendarDisparosDaEmpresa } from './disparos-repo.js';
import { referenciaDaFatura, textoResumoMensalidades } from './mensagens.js';
import { hojeBrasilia, reais, somarMeses, competenciaDe, diasEntre, proximoVencimento, resumoCarteira } from './ciclo.js';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function paraMotor(a: AssinaturaRow, empresaNome: string | null = null): AssinaturaMotor {
  return {
    id: a.id, nome: a.nome, email: a.email, telefone: a.telefone, valorCentavos: a.valorCentavos,
    status: a.status, diaVencimento: a.diaVencimento ?? null, inicioEm: a.inicioEm ?? null,
    companyId: a.companyId, descricao: descricaoDaAssinatura(a), leadId: a.leadId ?? null,
    pausaAutomatica: a.pausaAutomatica ?? true, diasPausa: diasPausaValidos(a.diasPausa),
    pausaAdiadaAte: a.pausaAdiadaAte ?? null, assistentePausadaEm: a.assistentePausadaEm ?? null,
    diasTravaDisparos: diasTravaDisparosValidos(a.diasTravaDisparos, diasPausaValidos(a.diasPausa)),
    disparosPausadosEm: a.disparosPausadosEm ?? null,
    empresaNome,
  };
}

/** Link completo da tela (clicável no WhatsApp). */
export function urlDaAssinatura(baseUrl: string | undefined, id: string): string {
  const base = (baseUrl ?? '').replace(/\/$/, '');
  return `${base}/dashboard/assinaturas/${id}`;
}

// ---------------------------------------------------------------------------
// Link de pagamento (InfinitePay)
// ---------------------------------------------------------------------------

export interface CtxLink {
  client: SupabaseClient;
  donaId: string;
  handle: string | undefined;
  baseUrl: string | undefined;
  criarCobranca(d: { companyId: string | null; leadId?: string | null; assinaturaId?: string | null; descricao: string; valorCentavos: number }): Promise<{ id: string; orderNsu: string }>;
  salvarLinkCobranca(id: string, url: string): Promise<void>;
  criarLink?: (p: CriarLinkParams) => Promise<CriarLinkResult>;
}

/**
 * Link da fatura: reusa o que existe; senão cria UMA cobrança (order_nsu
 * único, gerado pelo banco) presa na fatura e pede o link com webhook. Se uma
 * tentativa anterior criou a cobrança mas o link falhou, reusa o mesmo
 * order_nsu. InfinitePay recusou → lança (o motor avisa o Junior).
 */
export async function garantirLinkDaFatura(ctx: CtxLink, f: FaturaRow, a: AssinaturaMotor): Promise<string> {
  if (f.linkUrl) return f.linkUrl;
  if (!ctx.handle) throw new Error('Cobrança pela InfinitePay desligada (falta INFINITEPAY_HANDLE no servidor).');
  const ref = referenciaDaFatura(f.descricao, f.competencia);

  let cobrancaId = f.cobrancaId;
  let orderNsu: string | null = null;
  if (cobrancaId) {
    const { data } = await ctx.client.from('cobrancas').select('order_nsu, link_url').eq('id', cobrancaId).maybeSingle();
    const c = data as { order_nsu: string; link_url: string | null } | null;
    if (c?.link_url) {
      await salvarCobrancaDaFatura(ctx.client, f.id, cobrancaId, c.link_url);
      return c.link_url;
    }
    orderNsu = c?.order_nsu ?? null;
  }
  if (!cobrancaId) {
    // Link que o motor ANTIGO (antes da 146) já mandou pra este mês, mesmo valor,
    // ainda pendente e sem fatura: reusa em vez de mandar um 2º link (senão o
    // cliente podia pagar o velho e continuar recebendo cobrança do novo).
    const { data: velhas } = await ctx.client.from('cobrancas').select('id, link_url')
      .eq('assinatura_id', a.id).eq('status', 'pendente').eq('valor_centavos', f.valorCentavos)
      .not('link_url', 'is', null).order('criado_em', { ascending: false }).limit(1);
    const velha = (velhas as Array<{ id: string; link_url: string }> | null)?.[0];
    if (velha && !(await getFaturaPorCobranca(ctx.client, velha.id)) && await vincularCobrancaSeLivre(ctx.client, f.id, velha.id)) {
      await salvarCobrancaDaFatura(ctx.client, f.id, velha.id, velha.link_url);
      return velha.link_url;
    }
  }
  if (!orderNsu) {
    const cob = await ctx.criarCobranca({ companyId: ctx.donaId, leadId: a.leadId, assinaturaId: a.id, descricao: `${ref} (${a.nome})`, valorCentavos: f.valorCentavos });
    if (!(await vincularCobrancaSeLivre(ctx.client, f.id, cob.id))) {
      await ctx.client.from('cobrancas').update({ status: 'cancelado' }).eq('id', cob.id).eq('status', 'pendente');
      throw new Error('Outro processo está gerando o link desta fatura agora — tente de novo em instantes.');
    }
    cobrancaId = cob.id;
    orderNsu = cob.orderNsu;
  }

  const base = (ctx.baseUrl ?? '').replace(/\/$/, '');
  const r = await (ctx.criarLink ?? criarLinkPagamento)({
    handle: ctx.handle, orderNsu,
    itens: [{ descricao: ref, valorCentavos: f.valorCentavos }],
    redirectUrl: base ? `${base}/pago` : undefined,
    webhookUrl: base ? `${base}/webhook/infinitepay` : undefined,
    cliente: { nome: a.nome, email: a.email ?? undefined, telefone: a.telefone ?? undefined },
  });
  if (!r.ok) throw new Error(`InfinitePay recusou o link: ${r.reason}`);
  await ctx.salvarLinkCobranca(cobrancaId!, r.url);
  await salvarCobrancaDaFatura(ctx.client, f.id, cobrancaId!, r.url);
  return r.url;
}

// ---------------------------------------------------------------------------
// Caixa (receita)
// ---------------------------------------------------------------------------

type CriarConfirmadoFn = typeof criarConfirmado;

/** Mensalidade paga → ENTRADA confirmada no caixa. Já lançada → null. */
export async function lancarReceitaDaFatura(
  client: SupabaseClient,
  a: AssinaturaMotor,
  f: FaturaRow,
  info: InfoBaixa,
  criar: CriarConfirmadoFn = criarConfirmado,
): Promise<string | null> {
  const categoriaId = (await getCategorias(client).catch(() => [])).find((c) => c.slug === 'mensalidades')?.id ?? null;
  try {
    return await criar(client, {
      tipo: 'entrada', valor: info.pagoCentavos / 100, dataEvento: hojeBrasilia(new Date(info.pagoEm)),
      // Nome + id da fatura na descrição: o anti-duplicado do caixa (banco+dia+valor+descrição)
      // não pode confundir dois clientes com o mesmo plano pagando no mesmo dia.
      contraparte: a.nome, descricao: `Mensalidade — ${referenciaDaFatura(f.descricao, f.competencia)} — ${a.nome} (#${f.id.slice(0, 8)})`,
      categoriaId, pfPj: 'PJ', leadId: a.leadId, storagePath: null, mimeType: null,
      origem: 'assinatura', messageId: null,
      extracao: {
        fonte: 'cobranca_recorrente', fatura_id: f.id, assinatura_id: a.id, metodo: info.metodo,
        forma_baixa: info.formaBaixa, taxa_centavos: info.taxaCentavos ?? null,
        taxa_obs: 'a InfinitePay não informa a taxa na confirmação do pagamento',
      },
      createdBy: info.baixadoPor ?? 'cobranca-recorrente', temNota: false,
      bancoConta: info.formaBaixa === 'link' ? 'infinitepay' : 'desconhecido',
      favorecidoId: null, confianca: 'alta', arquivoId: null,
    });
  } catch (e) {
    if (msg(e) === 'DUPLICADO') return null;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Modelo aprovado na Meta?
// ---------------------------------------------------------------------------

type ListarModelos = () => Promise<Array<{ name: string; status: string; language: string }>>;

/** Consulta a Meta (cache de 10 min). Sem WABA / Meta fora → false (plano B). */
export function criarVerificadorDeModelo(listar: ListarModelos | null, agora: () => number = Date.now, ttlMs = 10 * 60_000): (nome: string) => Promise<boolean> {
  let cache: { em: number; aprovados: Set<string> } | null = null;
  return async (nome: string) => {
    if (!listar) return false;
    if (!cache || agora() - cache.em > ttlMs) {
      try {
        const ts = await listar();
        cache = { em: agora(), aprovados: new Set(ts.filter((t) => t.status === 'APPROVED' && t.language === 'pt_BR').map((t) => t.name)) };
      } catch {
        return cache?.aprovados.has(nome) ?? false;
      }
    }
    return cache.aprovados.has(nome);
  };
}

// ---------------------------------------------------------------------------
// Modelos APROVADOS — configuração (sem deploy)
// ---------------------------------------------------------------------------

/** Aprovados pela Meta em 28/09/2026 (informado pelo Junior). */
export const MODELOS_APROVADOS_PADRAO: readonly string[] = ['cobranca_mensalidade_v1', 'aviso_pausa_assistente_v1', 'assistente_pausada_v1'];
export const CHAVE_MODELOS_APROVADOS = 'cobranca_modelos_aprovados';

/** "a, b ,c" → ['a','b','c'] (vazio/nulo → null = não configurado). */
export function lerListaDeModelos(v: string | null | undefined): string[] | null {
  if (v === null || v === undefined || !v.trim()) return null;
  return v.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
}

export async function lerModelosAprovadosDoBanco(client: SupabaseClient): Promise<string | null> {
  const { data } = await client.from('app_flags').select('value').eq('key', CHAVE_MODELOS_APROVADOS).maybeSingle();
  return (data as { value?: string } | null)?.value ?? null;
}

/**
 * Um modelo só vai pelo WhatsApp se estiver na lista de APROVADOS. Fonte, em
 * ordem: linha 'cobranca_modelos_aprovados' em app_flags (muda SEM deploy;
 * relida a cada 5 min) → variável COBRANCA_MODELOS_APROVADOS → padrão.
 * Fora da lista → e-mail + texto pronto pro Junior encaminhar.
 */
export function criarListaDeModelosAprovados(
  lerDoBanco: () => Promise<string | null>,
  env: string | undefined,
  agora: () => number = Date.now,
  ttlMs = 5 * 60_000,
): (nome: string) => Promise<boolean> {
  let cache: { em: number; lista: ReadonlySet<string> } | null = null;
  return async (nome: string) => {
    if (!cache || agora() - cache.em > ttlMs) {
      let doBanco: string[] | null = null;
      try { doBanco = lerListaDeModelos(await lerDoBanco()); } catch { doBanco = cache ? [...cache.lista] : null; }
      cache = { em: agora(), lista: new Set(doBanco ?? lerListaDeModelos(env) ?? MODELOS_APROVADOS_PADRAO) };
    }
    return cache.lista.has(nome);
  };
}

// ---------------------------------------------------------------------------
// Serviço montado
// ---------------------------------------------------------------------------

export interface InfraCobranca {
  client: SupabaseClient;
  donaId: string;
  handle: string | undefined;
  baseUrl: string | undefined;
  criarCobranca: CtxLink['criarCobranca'];
  salvarLinkCobranca: CtxLink['salvarLinkCobranca'];
  criarLink?: CtxLink['criarLink'];
  /** WhatsApp oficial da empresa (Eva). null = sem WABA → sempre plano B. */
  waba: {
    sendTemplate(to: string, nome: string, idioma: string, components: Array<{ type: 'body'; parameters: Array<{ type: 'text'; text: string }> }>): Promise<unknown>;
    listTemplates(): Promise<Array<{ name: string; status: string; language: string }>>;
  } | null;
  /** Resend. null = sem e-mail configurado. */
  email: { enviar(e: { to: string; subject: string; html: string }): Promise<unknown> } | null;
  avisarJunior(texto: string): Promise<void>;
  /** Acesso suspenso voltou (ponte calculadora / companies.ativo). */
  liberarAcesso(a: AssinaturaMotor): Promise<void>;
  log?: (ev: Record<string, unknown>) => void;
  /** Lista de modelos aprovados (testes). Padrão: app_flags 'cobranca_modelos_aprovados'. */
  modelosAprovados?: () => Promise<string | null>;
  /** Auditoria / linha do tempo (audit_log da casa). */
  auditar?: (ev: { assinaturaId: string; acao: string; detalhe?: string }) => Promise<void>;
  /** Pausa/reativação mudou nesta empresa → limpa o cache do consumer da fila. */
  pausaMudou?: (companyId: string) => void;
}

/** Erro de Meta/Resend pode trazer telefone/e-mail do cliente: some com eles antes do log. */
export function semDadoPessoal(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  return v.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]').replace(/\+?\d[\d\s().-]{8,}\d/g, '[numero]').slice(0, 300);
}

export function logPadrao(ev: Record<string, unknown>): void {
  const limpo = Object.fromEntries(Object.entries(ev).map(([k, v]) => [k, k === 'erro' ? semDadoPessoal(v) : v]));
  const linha = `[cobranca-recorrente] ${JSON.stringify({ ts: new Date().toISOString(), ...limpo })}`;
  if (String(ev.evento ?? '').startsWith('erro') || ev.evento === 'rodada_falhou' || ev.evento === 'valor_nao_bate') console.error(linha);
  else console.log(linha);
}

export type ResultadoPorCobranca = 'sem_fatura' | 'ja_paga' | 'valor_nao_bate' | 'paga';

export function criarServicoCobranca(infra: InfraCobranca) {
  const { client, donaId } = infra;
  const log = infra.log ?? logPadrao;
  // Quais modelos a Meta JÁ aprovou = LISTA CONFIGURADA (app_flags 'cobranca_modelos_aprovados'
  // → env COBRANCA_MODELOS_APROVADOS → padrão). Sem WABA → nenhum (plano B).
  const modeloAprovado = infra.waba
    ? criarListaDeModelosAprovados(infra.modelosAprovados ?? (() => lerModelosAprovadosDoBanco(client)), process.env.COBRANCA_MODELOS_APROVADOS)
    : async () => false;

  const canais = {
    modeloAprovado,
    enviarModelo: async (tel: string, modelo: string, params: string[]) => {
      if (!infra.waba) throw new Error('WhatsApp oficial (WABA) não configurado');
      await infra.waba.sendTemplate(tel, modelo, 'pt_BR', [{ type: 'body', parameters: params.map((text) => ({ type: 'text' as const, text })) }]);
    },
    enviarEmail: async (to: string, assunto: string, html: string, ctaUrl: string | null) => {
      if (!infra.email) throw new Error('e-mail (Resend) não configurado');
      const corpo = montarMolduraEmail({
        conteudoHtml: html, titulo: assunto, linkDescadastro: 'https://ecosunpower.eng.br',
        ctaLabel: ctaUrl ? 'Pagar agora (Pix ou cartão de crédito)' : undefined, ctaUrl: ctaUrl ?? undefined,
      });
      await infra.email.enviar({ to, subject: assunto, html: corpo });
    },
    avisarJunior: infra.avisarJunior,
    log,
  };

  const ctxLink: CtxLink = {
    client, donaId, handle: infra.handle, baseUrl: infra.baseUrl,
    criarCobranca: infra.criarCobranca, salvarLinkCobranca: infra.salvarLinkCobranca, criarLink: infra.criarLink,
  };

  // Nome da empresa do painel (tenant) pros avisos do Junior.
  const nomesEmpresa = async (): Promise<Map<string, string>> =>
    new Map((await listarEmpresasSimples(client).catch(() => [])).map((e) => [e.id, e.nome]));
  const motorDe = async (a: AssinaturaRow): Promise<AssinaturaMotor> =>
    paraMotor(a, a.companyId ? (await nomesEmpresa()).get(a.companyId) ?? null : null);

  const pausaDeps: PausaDeps = {
    casaId: donaId,
    urlAssinatura: (id) => urlDaAssinatura(infra.baseUrl, id),
    pausarAssistente: async (a) => {
      const ok = await pausarAssistenteNoBanco(client, a.id, donaId);
      if (ok && a.companyId) infra.pausaMudou?.(a.companyId);
      return ok;
    },
    reativarAssistente: async (a) => {
      const ok = await reativarAssistenteNoBanco(client, a.id);
      if (ok && a.companyId) infra.pausaMudou?.(a.companyId);
      if (ok) limparCacheDisparos();
      return ok;
    },
    pausarDisparos: async (a) => {
      const ok = await pausarDisparosNoBanco(client, a.id, donaId);
      if (ok) limparCacheDisparos();
      return ok;
    },
    reagendarDisparos: async (a, desde) => (a.companyId ? reagendarDisparosDaEmpresa(client, a.companyId, desde) : 0),
    auditar: async (ev) => { await infra.auditar?.(ev); },
  };

  const motorDeps: MotorDeps = {
    ...canais,
    ...pausaDeps,
    donaId,
    listarCobraveis: async () => {
      const nomes = await nomesEmpresa();
      const lista = await listarCobraveis(client, donaId);
      return lista.map((a) => paraMotor(a, a.companyId ? nomes.get(a.companyId) ?? null : null));
    },
    faturasDaAssinatura: (id) => faturasDaAssinatura(client, donaId, id),
    criarFatura: (n) => criarFatura(client, n),
    garantirLink: (f, a) => garantirLinkDaFatura(ctxLink, f, a),
    reservarAviso: (id, tipo) => reservarAviso(client, id, tipo),
    liberarAviso: (id, tipo) => liberarAviso(client, id, tipo),
    registrarCanal: (id, canal) => registrarCanal(client, id, canal),
  };

  const baixaDeps: BaixaDeps = {
    ...canais,
    ...pausaDeps,
    marcarFaturaPaga: (id, info) => marcarFaturaPaga(client, id, info),
    lancarReceita: (a, f, info) => lancarReceitaDaFatura(client, a, f, info),
    vincularLancamento: (id, l) => vincularLancamento(client, id, l),
    registrarPagamentoNaAssinatura: (id, prox, pode) => registrarPagamentoNaAssinatura(client, id, prox, pode),
    liberarAcesso: infra.liberarAcesso,
    reservarAviso: (id, tipo) => reservarAviso(client, id, tipo),
    faturasDaAssinatura: (id) => faturasDaAssinatura(client, donaId, id),
  };

  const LOCK = 'cobranca_recorrente_dia';

  return {
    motorDeps,
    baixaDeps,
    modeloAprovado,

    /** Robô diário: só um servidor por dia; falhou tudo → Junior sabe e tenta de novo na próxima hora. */
    async rodarDiario(hoje: string): Promise<ResumoRodada | null> {
      if (!(await reservarExecucaoDoDia(client, LOCK, hoje))) return null;
      try {
        return await rodarCobrancaRecorrente(motorDeps, hoje);
      } catch (e) {
        log({ evento: 'rodada_falhou', hoje, erro: msg(e) });
        await client.from('app_flags').update({ value: `falhou:${hoje}` }).eq('key', LOCK);
        if (await reservarExecucaoDoDia(client, 'cobranca_recorrente_alerta', hoje)) {
          await infra.avisarJunior(`🚨 O robô da cobrança recorrente FALHOU hoje (${msg(e)}). Ele tenta de novo a cada hora; se precisar cobrar já, use "Gerar cobrança agora" em Financeiro › Assinaturas.`).catch(() => undefined);
        }
        return null;
      }
    },

    async gerarAgora(assinaturaId: string, hoje: string): Promise<ResultadoManual> {
      const a = await getAssinaturaDaDona(client, donaId, assinaturaId);
      if (!a) return { ok: false, erro: 'Assinatura não encontrada.' };
      return gerarCobrancaAgora(motorDeps, await motorDe(a), hoje);
    },

    async reenviar(faturaId: string, hoje: string): Promise<ResultadoManual> {
      const f = await getFaturaDaDona(client, donaId, faturaId);
      if (!f) return { ok: false, erro: 'Fatura não encontrada.' };
      const a = await getAssinaturaDaDona(client, donaId, f.assinaturaId);
      if (!a) return { ok: false, erro: 'Assinatura não encontrada.' };
      return reenviarFatura(motorDeps, await motorDe(a), f, hoje);
    },

    /** "Marcar como paga (Pix direto)": valor da fatura, quem marcou fica registrado. */
    async marcarPagaManual(faturaId: string, usuario: string): Promise<{ ok: true; lancamentoId: string | null; reativou: boolean } | { ok: false; motivo: 'nao_achada' | 'ja_paga' | 'valor_nao_bate' }> {
      const f = await getFaturaDaDona(client, donaId, faturaId);
      if (!f) return { ok: false, motivo: 'nao_achada' };
      const a = await getAssinaturaDaDona(client, donaId, f.assinaturaId);
      if (!a) return { ok: false, motivo: 'nao_achada' };
      return baixarFatura(baixaDeps, await motorDe(a), f, {
        pagoCentavos: f.valorCentavos, metodo: 'pix_direto', formaBaixa: 'manual', baixadoPor: usuario, pagoEm: new Date().toISOString(),
      });
    },

    /** /menu da Eva › Mensalidades: atrasadas, próximos 7 dias e o total do mês. */
    async resumoMensalidades(hoje: string, painelUrl: string | null): Promise<string> {
      const [assinaturas, faturas] = await Promise.all([
        listarAssinaturas(client, donaId),
        faturasDaDona(client, donaId, somarMeses(competenciaDe(hoje), -3)),
      ]);
      const porId = new Map(assinaturas.map((a) => [a.id, a]));
      const abertas = faturas.filter((f) => f.status === 'aberta');
      const atrasadas = abertas.filter((f) => f.venceEm < hoje)
        .map((f) => ({ nome: porId.get(f.assinaturaId)?.nome ?? '—', valorCentavos: f.valorCentavos, dias: diasEntre(f.venceEm, hoje) }))
        .sort((x, y) => y.dias - x.dias);
      const proximas: Array<{ nome: string; valorCentavos: number; venceEm: string }> = [];
      for (const a of assinaturas) {
        if (a.status !== 'ativa' && a.status !== 'travada') continue;
        const fs = faturas.filter((f) => f.assinaturaId === a.id);
        const v = proximoVencimento({ status: a.status, inicioEm: a.inicioEm ?? null, diaVencimento: a.diaVencimento ?? null }, fs, hoje);
        if (v && v >= hoje && diasEntre(hoje, v) <= 7) {
          const aberta = fs.find((f) => f.status === 'aberta' && f.venceEm === v);
          proximas.push({ nome: a.nome, valorCentavos: aberta?.valorCentavos ?? a.valorCentavos, venceEm: v });
        }
      }
      proximas.sort((x, y) => (x.venceEm < y.venceEm ? -1 : 1));
      return textoResumoMensalidades({ resumo: resumoCarteira(assinaturas, faturas, hoje), atrasadas, proximas, painelUrl });
    },

    /** Webhook de cobrança JÁ paga: só vale reprocessar se a fatura dela ainda está aberta (queda no meio). */
    async faturaAbertaDaCobranca(cobrancaId: string): Promise<boolean> {
      const f = await getFaturaPorCobranca(client, cobrancaId);
      return !!f && f.status === 'aberta';
    },

    /**
     * Webhook (JÁ reconfirmado no payment_check): baixa a fatura desta cobrança.
     * `novo` = a cobrança acabou de virar paga agora (não é webhook repetido):
     * só aí uma fatura já fechada (Pix direto / cancelada) é pagamento em dobro.
     */
    async baixarPorCobranca(cobrancaId: string, info: InfoPagamento, opts: { novo?: boolean } = {}): Promise<ResultadoPorCobranca> {
      const f = await getFaturaPorCobranca(client, cobrancaId);
      if (!f) return 'sem_fatura';
      if (f.status !== 'aberta') {
        const emDobro = opts.novo !== false && (f.status === 'cancelada' || f.formaBaixa === 'manual');
        if (!emDobro) return 'ja_paga';
        const a = await getAssinatura(client, f.assinaturaId).catch(() => null);
        log({ evento: 'pagamento_em_fatura_fechada', fatura_id: f.id, assinatura_id: f.assinaturaId, status: f.status, metodo_anterior: f.metodo });
        await infra.avisarJunior(`⚠️ Chegou pagamento pelo link da mensalidade de ${a?.nome ?? 'um assinante'} (${referenciaDaFatura(f.descricao, f.competencia)}${info.pagoCentavos !== null ? `, R$ ${reais(info.pagoCentavos)}` : ''}), mas essa fatura já estava ${f.status === 'paga' ? `paga (${f.metodo === 'pix_direto' ? 'marcada como Pix direto' : 'pelo link'})` : 'cancelada'}. Possível pagamento em dobro — confira e devolva/abata se for o caso.`).catch(() => undefined);
        return 'ja_paga';
      }
      const a = await getAssinatura(client, f.assinaturaId);
      if (!a) return 'sem_fatura';
      const r = await baixarFatura(baixaDeps, await motorDe(a), f, info);
      return r.ok ? 'paga' : r.motivo;
    },

    /**
     * Link ANTIGO (antes da 146, sem fatura) pago: a fatura do mês daquele
     * vencimento é baixada (ou criada já paga), pra régua não cobrar de novo.
     */
    async baixarLegado(assinaturaId: string, venceEmAntigo: string, info: InfoPagamento): Promise<ResultadoPorCobranca> {
      const a = await getAssinatura(client, assinaturaId);
      if (!a || (a.donaCompanyId && a.donaCompanyId !== donaId)) return 'sem_fatura';
      const comp = competenciaDe(venceEmAntigo);
      let f = (await faturasDaAssinatura(client, donaId, assinaturaId)).find((x) => x.competencia === comp) ?? null;
      if (!f) {
        f = await criarFatura(client, {
          assinaturaId, companyId: a.companyId, donaId, competencia: comp, venceEm: venceEmAntigo,
          valorCentavos: info.pagoCentavos ?? a.valorCentavos, descricao: descricaoDaAssinatura(a),
        });
      }
      if (!f || f.status !== 'aberta') return 'ja_paga';
      const r = await baixarFatura(baixaDeps, await motorDe(a), f, info);
      return r.ok ? 'paga' : r.motivo;
    },

    // ---- Assistente do tenant (botões da tela) ----

    /** "Pausar agora" (Junior). Nunca a casa nem cliente avulso. */
    async pausarAgora(assinaturaId: string, hoje: string): Promise<{ ok: boolean; erro?: string }> {
      const a = await getAssinaturaDaDona(client, donaId, assinaturaId);
      if (!a) return { ok: false, erro: 'Assinatura não encontrada.' };
      if (!podePausar(a, donaId)) return { ok: false, erro: 'Só dá pra pausar a assistente de uma empresa do painel (cliente avulso não tem assistente).' };
      const m = await motorDe(a);
      const ok = await pausarAssistenteDe({ ...canais, ...pausaDeps, garantirLink: motorDeps.garantirLink }, m, await faturasDaAssinatura(client, donaId, a.id), hoje, 'manual');
      return ok ? { ok } : { ok: false, erro: 'A assistente já estava pausada.' };
    },

    /** "Reativar agora" (Junior). */
    async reativarAgora(assinaturaId: string): Promise<{ ok: boolean; erro?: string }> {
      const a = await getAssinaturaDaDona(client, donaId, assinaturaId);
      if (!a) return { ok: false, erro: 'Assinatura não encontrada.' };
      const ok = await reativarAssistenteDe({ ...canais, ...pausaDeps }, await motorDe(a), 'manual');
      return ok ? { ok } : { ok: false, erro: 'A assistente já estava atendendo.' };
    },

    /**
     * "Dar mais prazo": a pausa só acontece DEPOIS de hoje + N dias. Se já
     * estava pausada, volta a atender agora (o prazo novo vale).
     */
    async darMaisPrazo(assinaturaId: string, dias: number, hoje: string): Promise<{ ok: boolean; ate?: string; reativou?: boolean; erro?: string }> {
      const n = Math.round(Number(dias));
      if (!Number.isFinite(n) || n < 1 || n > 60) return { ok: false, erro: 'Prazo de 1 a 60 dias.' };
      const a = await getAssinaturaDaDona(client, donaId, assinaturaId);
      if (!a) return { ok: false, erro: 'Assinatura não encontrada.' };
      const [y, mm, d] = hoje.split('-').map(Number);
      const ate = new Date(Date.UTC(y!, mm! - 1, d! + n)).toISOString().slice(0, 10);
      await editarAssinatura(client, a.id, { pausaAdiadaAte: ate }, donaId);
      log({ evento: 'pausa_adiada', assinatura_id: a.id, ate });
      await pausaDeps.auditar({ assinaturaId: a.id, acao: 'pausa_adiada', detalhe: ate });
      const reativou = a.assistentePausadaEm ? await reativarAssistenteDe({ ...canais, ...pausaDeps }, await motorDe(a), 'prazo') : false;
      return { ok: true, ate, reativou };
    },

  };
}

export type ServicoCobranca = ReturnType<typeof criarServicoCobranca>;
