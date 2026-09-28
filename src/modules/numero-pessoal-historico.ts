// src/modules/numero-pessoal-historico.ts
//
// HISTÓRICO do WhatsApp pessoal do dono (Atendimento Parte 2b, 28/09/2026).
// O número pessoal entra no painel por QR (Evolution). As conversas ANTERIORES
// à conexão chegam de dois jeitos, e os dois caem aqui:
//  1) messages.set — quando o dono lê o QR com a sincronização completa
//     ligada, o celular manda o histórico e a Evolution repassa ao webhook em
//     lotes (pode ser muita coisa: milhares de mensagens por evento);
//  2) chat/findMessages — o que a Evolution JÁ guardou desta instância (ela não
//     reenvia no messages.set o que já tem), puxado página a página.
//
// Regras do dono (Junior):
//  - SÓ conversa individual: sem grupo, sem status/transmissão, sem canal;
//  - SÓ os últimos 90 dias;
//  - idempotente: a chave anti-duplicado é o id da mensagem no WhatsApp
//    (índice único company_id+wamid da 138) — reprocessar não duplica;
//  - mídia: só o marcador ("[imagem]" → 📷 Foto na tela), nada é baixado;
//  - mesma política do tempo real: company_id da casa, visivel_so_para = dono
//    (só ele vê), liga ao lead quando o telefone já é lead DA EMPRESA;
//  - a Eva, o próprio dono e a equipe (contatos_internos) ficam de fora;
//  - NUNCA assume a conversa nem mexe na Eva (é passado, não atendimento).
//
// O webhook só ENFILEIRA e responde na hora; o trabalho pesado roda aqui em
// segundo plano, em lotes, um de cada vez. Nada de telefone/texto em log.

import type { SupabaseClient } from '@supabase/supabase-js';
import { lerMensagemEvolution, type IncomingMessage } from './evolution.js';
import { normalizeBrazilianPhone } from './meta-leadgen.js';
import { variantesTelefone } from './phone.js';
import { textoDaEntrada, telefonesOcultosDoPessoal, ehTelefoneOculto, CASA, type NumeroPessoal } from './numero-pessoal.js';
import { mensagensGuardadas, type ConexaoEvolutionDeps } from './evolution-conexao.js';
import type { NovaMensagem, LinhaMensagemWhatsapp } from './mensagens-whatsapp.js';

export const DIAS_HISTORICO = 90;
export const TAMANHO_LOTE = 200;
/** Teto da fila em memória (linhas enxutas, ~0,5 KB cada ≈ 50 MB). Passou disso, o resto fica de fora (e o log diz). */
export const MAX_FILA = 100_000;
/** Teto de páginas puxadas da Evolution numa busca (200 × 500 = 100 mil mensagens). */
const MAX_PAGINAS = 500;

const DIA_MS = 24 * 60 * 60 * 1000;

const TIPO: Record<IncomingMessage['type'], LinhaMensagemWhatsapp['tipo']> = {
  text: 'texto', audio: 'audio', image: 'imagem', video: 'video', document: 'documento', location: 'texto',
};

/**
 * Segundos (epoch) do messageTimestamp como a Evolution manda: número, texto
 * ou o Long do protobuf ({ low, high }). Inválido → null. PURA.
 */
export function segundosDe(ts: unknown): number | null {
  let n: number;
  if (typeof ts === 'number') n = ts;
  else if (typeof ts === 'string' && /^\d+$/.test(ts.trim())) n = Number(ts.trim());
  else if (ts && typeof ts === 'object' && typeof (ts as { low?: unknown }).low === 'number') {
    const { low, high } = ts as { low: number; high?: number };
    n = (high ?? 0) * 2 ** 32 + (low >>> 0);
  } else return null;
  if (!Number.isFinite(n) || n <= 0) return null;
  // Algumas versões mandam em milissegundos.
  return n > 1e12 ? Math.floor(n / 1000) : n;
}

/**
 * Telefone (55…) de uma conversa INDIVIDUAL, pelo JID. Grupo (@g.us), status
 * (status@broadcast), lista de transmissão (@broadcast) e canal (@newsletter)
 * → null. Conta que o WhatsApp esconde atrás de um @lid usa o número "alt"
 * quando a Evolution manda; sem ele, fica de fora. PURA.
 */
export function telefoneDaConversa(key: Record<string, unknown> | undefined | null): string | null {
  if (!key) return null;
  const jid = String(key.remoteJid ?? '');
  if (!jid || /@(g\.us|broadcast|newsletter)$/i.test(jid) || jid.startsWith('status@')) return null;
  let usuario: string | null = null;
  if (/@s\.whatsapp\.net$/i.test(jid) || /@c\.us$/i.test(jid)) usuario = jid.split('@')[0];
  else if (/@lid$/i.test(jid)) {
    const alt = [key.remoteJidAlt, key.senderPn].map((x) => String(x ?? '')).find((x) => /@s\.whatsapp\.net$/i.test(x));
    usuario = alt ? alt.split('@')[0] : null;
  }
  if (!usuario) return null;
  // "5561999990001:12" (aparelho) → só o número.
  return normalizeBrazilianPhone(usuario.split(':')[0]);
}

/** O `data` de um messages.set (lista, ou { messages: [...] } em algumas versões). PURA. */
export function mensagensDoEvento(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const m = (data as { messages?: unknown } | null)?.messages;
  return Array.isArray(m) ? m : [];
}

/** Nome que a pessoa usa no WhatsApp — a Evolution põe o NÚMERO quando não sabe: aí fica sem nome. */
function nomeDoContato(pushName: unknown): string | null {
  const n = String(pushName ?? '').trim();
  if (!n || /^[\d\s()+-]+$/.test(n) || n === 'Você') return null;
  return n.slice(0, 120);
}

/**
 * Uma mensagem do histórico → linha de mensagens_whatsapp (ainda sem lead).
 * null = fica de fora (grupo, status, canal, mais velha que 90 dias, tipo que
 * não mostramos, sem id). PURA.
 */
export function linhaDoHistorico(np: NumeroPessoal, bruto: unknown, agora = Date.now()): (NovaMensagem & { contato_telefone: string; wamid: string; criado_em: string }) | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const raw = bruto as Record<string, unknown>;
  const key = raw.key as Record<string, unknown> | undefined;
  const telefone = telefoneDaConversa(key);
  const wamid = String(key?.id ?? '').trim();
  if (!telefone || !wamid || wamid.length > 128) return null;
  const seg = segundosDe(raw.messageTimestamp);
  if (seg === null) return null;
  const ms = seg * 1000;
  if (ms < agora - DIAS_HISTORICO * DIA_MS || ms > agora + DIA_MS) return null;
  const msg = lerMensagemEvolution({ ...raw, key: { ...key, remoteJid: `${telefone}@s.whatsapp.net` }, messageTimestamp: seg });
  if (!msg) return null;
  const texto = textoDaEntrada(msg);
  if (!texto) return null;
  const iso = new Date(ms).toISOString();
  const fromMe = !!msg.fromMe;
  return {
    company_id: np.company_id,
    lead_id: null,
    contato_telefone: telefone,
    contato_nome: fromMe ? null : nomeDoContato(raw.pushName),
    direcao: fromMe ? 'saida' : 'entrada',
    autor: fromMe ? 'humano' : 'cliente',
    user_id: fromMe ? np.dono_user_id : null,
    autor_nome: fromMe ? np.dono_nome : null,
    canal: 'whatsapp_business',
    numero: np.instancia,
    tipo: TIPO[msg.type] ?? 'texto',
    texto: texto.slice(0, 4096),
    // Mesmos rótulos do tempo real: "pelo celular" (dele) / recebida.
    origem: fromMe ? 'celular' : 'webhook',
    wamid,
    status: fromMe ? 'enviada' : 'recebida',
    visivel_so_para: np.dono_user_id,
    // A data ORIGINAL (a conversa fica na ordem certa no chat e na lista).
    criado_em: iso,
    enviada_em: iso,
  };
}

export interface ProgressoHistorico {
  emAndamento: boolean;
  /** Mensagens que chegaram (antes do filtro). */
  recebidas: number;
  /** Gravadas agora (novas). */
  gravadas: number;
  /** Já estavam no painel (reprocesso). */
  repetidas: number;
  /** Ficaram de fora (grupo, status, antiga, Eva/equipe, tipo sem texto). */
  ignoradas: number;
  /** Conversas (telefones) com mensagem gravada nesta busca. */
  conversas: number;
  /** Data da mensagem mais antiga trazida nesta busca. */
  maisAntiga: string | null;
  iniciadoEm: string | null;
  atualizadoEm: string | null;
  /** Mensagens ainda na fila. */
  naFila: number;
  falhas: number;
}

interface EstadoInterno extends Omit<ProgressoHistorico, 'conversas' | 'naFila' | 'emAndamento'> {
  telefones: Set<string>;
  /** Telefones cujas linhas antigas sem lead já foram passadas pro lead nesta busca. */
  ligados: Set<string>;
  puxando: boolean;
  /** O dono desligou o número: a fila some e a busca no servidor para. */
  cancelado: boolean;
}

export interface DepsImportador {
  client: SupabaseClient;
  agora?: () => number;
  lote?: number;
  /** Pausa entre lotes (deixa o servidor respirar). Padrão: próximo giro do event loop. */
  pausa?: () => Promise<void>;
}

type Linha = NonNullable<ReturnType<typeof linhaDoHistorico>>;
/** Quantos ids vão num `.in()` (a URL do PostgREST tem limite: ~100 ids de 32 letras ≈ 4 KB). */
const IN_MAX = 100;

/**
 * Importador em memória (um por processo). `enfileirar` é o que o webhook
 * chama: já converte cada mensagem na linha ENXUTA (sem a mensagem crua, sem
 * miniatura de mídia — pouca memória) e volta na hora; um único "gravador"
 * esvazia a fila em lotes, um de cada vez.
 */
export function criarImportadorHistorico(deps: DepsImportador) {
  const agora = deps.agora ?? (() => Date.now());
  const lote = Math.max(1, deps.lote ?? TAMANHO_LOTE);
  const pausa = deps.pausa ?? (() => new Promise<void>((ok) => setImmediate(ok)));
  const filas = new Map<string, { np: NumeroPessoal; pedacos: Linha[][]; total: number }>();
  const estados = new Map<string, EstadoInterno>();
  let rodando: Promise<void> | null = null;

  const chaveDe = (instancia: string) => String(instancia ?? '').toLowerCase();
  const naFilaTotal = () => [...filas.values()].reduce((s, f) => s + f.total, 0);

  function estadoDe(np: NumeroPessoal): EstadoInterno {
    let e = estados.get(chaveDe(np.instancia));
    if (!e) {
      e = { recebidas: 0, gravadas: 0, repetidas: 0, ignoradas: 0, falhas: 0, maisAntiga: null, iniciadoEm: null, atualizadoEm: null, telefones: new Set(), ligados: new Set(), puxando: false, cancelado: false };
      estados.set(chaveDe(np.instancia), e);
    }
    if (!e.iniciadoEm) e.iniciadoEm = new Date(agora()).toISOString();
    return e;
  }

  /** Mensagens cruas → linhas (as que ficam de fora já contam como ignoradas). */
  function converter(np: NumeroPessoal, brutos: unknown[], est: EstadoInterno): Linha[] {
    est.recebidas += brutos.length;
    // Segurança: só número pessoal DA CASA e ligado (a mesma trava do resto da 2b).
    if (np.company_id !== CASA || !np.ativo) { est.ignoradas += brutos.length; return []; }
    const t = agora();
    const out: Linha[] = [];
    for (const b of brutos) {
      const l = linhaDoHistorico(np, b, t);
      if (l) out.push(l); else est.ignoradas++;
    }
    return out;
  }

  /** Grava linhas já convertidas. Nunca lança. */
  async function gravarLinhas(np: NumeroPessoal, entrada: Linha[]): Promise<{ gravadas: number; repetidas: number; ignoradas: number; falhou: boolean }> {
    const est = estadoDe(np);
    const r = { gravadas: 0, repetidas: 0, ignoradas: 0, falhou: false };
    if (np.company_id !== CASA || !np.ativo || est.cancelado) { r.ignoradas = entrada.length; est.ignoradas += entrada.length; return r; }
    try {
      const ocultos = await telefonesOcultosDoPessoal(deps.client, np.company_id, np);
      const porWamid = new Map<string, Linha>();
      for (const l of entrada) {
        if (ehTelefoneOculto(ocultos, l.contato_telefone)) { r.ignoradas++; continue; }
        if (porWamid.has(l.wamid)) { r.repetidas++; continue; }
        porWamid.set(l.wamid, l);
      }
      let linhas = [...porWamid.values()];
      // Já estão no painel? (o índice único é PARCIAL — o upsert do PostgREST não o usa.)
      const existentes = new Set<string>();
      for (let i = 0; i < linhas.length; i += IN_MAX) {
        const { data: ja, error: eJa } = await deps.client.from('mensagens_whatsapp').select('wamid')
          .eq('company_id', np.company_id).in('wamid', linhas.slice(i, i + IN_MAX).map((l) => l.wamid));
        if (eJa) throw new Error(eJa.message);
        for (const x of (ja ?? []) as Array<{ wamid: string | null }>) existentes.add(String(x.wamid));
      }
      const antes = linhas.length;
      linhas = linhas.filter((l) => !existentes.has(l.wamid));
      r.repetidas += antes - linhas.length;
      if (linhas.length > 0) {
        // Liga ao lead: telefone (qualquer formato) já é lead DA EMPRESA.
        const leadPorTel = await leadsDosTelefones(deps.client, np.company_id, [...new Set(linhas.map((l) => l.contato_telefone))]);
        for (const l of linhas) l.lead_id = leadPorTel.get(l.contato_telefone) ?? null;
        const { error } = await deps.client.from('mensagens_whatsapp').insert(linhas);
        if (error) {
          if (error.code !== '23505') throw new Error(error.message);
          // Corrida com o tempo real (a mesma mensagem chegou agora): uma a uma.
          for (const l of linhas) {
            const { error: e1 } = await deps.client.from('mensagens_whatsapp').insert(l);
            if (!e1) r.gravadas++;
            else if (e1.code === '23505') r.repetidas++;
            else throw new Error(e1.message);
          }
        } else {
          r.gravadas += linhas.length;
        }
        // Linhas antigas desses contatos (de antes de virarem lead) passam pro lead — uma vez por busca.
        for (const [tel, leadId] of leadPorTel) {
          if (est.ligados.has(tel)) continue;
          await deps.client.from('mensagens_whatsapp').update({ lead_id: leadId })
            .eq('company_id', np.company_id).eq('contato_telefone', tel).eq('visivel_so_para', np.dono_user_id).is('lead_id', null);
          est.ligados.add(tel);
        }
        for (const l of linhas) {
          est.telefones.add(l.contato_telefone);
          if (!est.maisAntiga || l.criado_em < est.maisAntiga) est.maisAntiga = l.criado_em;
        }
      }
    } catch (e) {
      r.falhou = true;
      est.falhas++;
      console.warn(`[numero-pessoal-historico] lote de ${entrada.length} não gravou: ${(e as Error).message}`);
    }
    est.gravadas += r.gravadas;
    est.repetidas += r.repetidas;
    est.ignoradas += r.ignoradas;
    est.atualizadoEm = new Date(agora()).toISOString();
    return r;
  }

  /** Mensagens cruas → grava já (usado nos testes e por quem não quer fila). */
  async function gravarLote(np: NumeroPessoal, brutos: unknown[]) {
    const est = estadoDe(np);
    const antes = est.ignoradas;
    const r = await gravarLinhas(np, converter(np, brutos, est));
    return { ...r, ignoradas: est.ignoradas - antes };
  }

  async function drenar(): Promise<void> {
    for (;;) {
      const prox = [...filas.values()].find((f) => f.total > 0);
      if (!prox) return;
      const pedaco = prox.pedacos.shift() ?? [];
      prox.total -= pedaco.length;
      if (prox.total <= 0) filas.delete(chaveDe(prox.np.instancia));
      await gravarLinhas(prox.np, pedaco);
      await pausa();
    }
  }

  function acordar(): Promise<void> {
    if (!rodando) {
      rodando = drenar().finally(() => {
        rodando = null;
        const e = [...estados.entries()].map(([inst, s]) => `${inst}: +${s.gravadas} gravadas, ${s.repetidas} repetidas, ${s.ignoradas} de fora`).join(' · ');
        if (e) console.log(`[numero-pessoal-historico] fila vazia — ${e}`);
      });
    }
    return rodando;
  }

  function enfileirar(np: NumeroPessoal, brutos: unknown[]): number {
    if (!Array.isArray(brutos) || brutos.length === 0) return 0;
    const est = estadoDe(np);
    if (est.cancelado) est.cancelado = false; // chegou histórico de novo: o dono religou e reconectou
    const linhas = converter(np, brutos, est);
    const cabe = Math.max(0, MAX_FILA - naFilaTotal());
    const aceitas = linhas.length <= cabe ? linhas : linhas.slice(0, cabe);
    if (aceitas.length < linhas.length) {
      est.ignoradas += linhas.length - aceitas.length;
      console.warn(`[numero-pessoal-historico] fila cheia — ${linhas.length - aceitas.length} mensagens do histórico ficaram de fora (clique "Buscar histórico" de novo depois)`);
    }
    if (aceitas.length === 0) return 0;
    const f = filas.get(chaveDe(np.instancia)) ?? { np, pedacos: [], total: 0 };
    f.np = np;
    for (let i = 0; i < aceitas.length; i += lote) f.pedacos.push(aceitas.slice(i, i + lote));
    f.total += aceitas.length;
    filas.set(chaveDe(np.instancia), f);
    void acordar();
    return aceitas.length;
  }

  return {
    /** O webhook chama: converte, guarda na fila e volta NA HORA. Devolve quantas entraram na fila. */
    enfileirar,

    /**
     * Puxa da Evolution o que ela já guardou (últimos 90 dias), página a
     * página. Cada página passa pela MESMA fila (um gravador só: sem corrida
     * com o messages.set) e a próxima só vem depois de gravada. Nunca lança.
     */
    async puxarDoServidor(np: NumeroPessoal, evolution: ConexaoEvolutionDeps, porPagina = TAMANHO_LOTE): Promise<{ paginas: number; ok: boolean }> {
      const est = estadoDe(np);
      if (est.puxando) return { paginas: 0, ok: true };
      est.puxando = true;
      est.cancelado = false;
      const ate = new Date(agora() + DIA_MS).toISOString();
      const desde = new Date(agora() - DIAS_HISTORICO * DIA_MS).toISOString();
      let pagina = 1;
      let ok = true;
      try {
        for (; pagina <= MAX_PAGINAS && !est.cancelado; pagina++) {
          const r = await mensagensGuardadas(evolution, np.instancia, { desdeIso: desde, ateIso: ate, pagina, porPagina });
          if (!r) { ok = false; break; }
          if (r.registros.length === 0) break;
          enfileirar(np, r.registros);
          while (rodando) await rodando;
          if (r.paginas && pagina >= r.paginas) break;
          await pausa();
        }
      } catch (e) {
        ok = false;
        console.warn(`[numero-pessoal-historico] busca no servidor parou: ${(e as Error).message}`);
      } finally {
        est.puxando = false;
        const atual = estados.get(chaveDe(np.instancia));
        if (atual) atual.puxando = false;
      }
      return { paginas: pagina, ok };
    },

    /** Progresso desta busca (memória do processo; reiniciar o servidor zera — o banco fica). */
    progresso(instancia: string): ProgressoHistorico | null {
      const e = estados.get(chaveDe(instancia));
      if (!e) return null;
      const naFila = filas.get(chaveDe(instancia))?.total ?? 0;
      const { telefones, ligados: _l, puxando, cancelado: _c, ...resto } = e;
      return { ...resto, conversas: telefones.size, naFila, emAndamento: naFila > 0 || puxando };
    },

    /** Zera o progresso (nova busca pedida pelo dono). */
    recomecar(instancia: string): void {
      const e = estados.get(chaveDe(instancia));
      estados.delete(chaveDe(instancia));
      // Busca no servidor ainda rodando: o novo estado sabe (não abre uma 2ª em paralelo).
      if (e?.puxando) estados.set(chaveDe(instancia), { recebidas: 0, gravadas: 0, repetidas: 0, ignoradas: 0, falhas: 0, maisAntiga: null, iniciadoEm: null, atualizadoEm: null, telefones: new Set(), ligados: new Set(), puxando: true, cancelado: false });
    },

    /** O dono DESLIGOU o número: joga fora o que está na fila e para a busca no servidor. */
    cancelar(instancia: string): void {
      filas.delete(chaveDe(instancia));
      const e = estados.get(chaveDe(instancia));
      if (e) e.cancelado = true;
    },

    /** Testes: espera a fila esvaziar. */
    async esperar(): Promise<void> { while (rodando) await rodando; },

    gravarLote,
  };
}

export type ImportadorHistorico = ReturnType<typeof criarImportadorHistorico>;

/**
 * Telefone (55…) → lead DA EMPRESA com esse telefone (qualquer formato; o mais
 * antigo vale — a mesma regra do leadDoTelefoneNaEmpresa, em lote).
 */
async function leadsDosTelefones(client: SupabaseClient, companyId: string, telefones: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (telefones.length === 0) return out;
  const variantePara = new Map<string, string>();
  for (const t of telefones) for (const v of variantesTelefone(t)) if (!variantePara.has(v)) variantePara.set(v, t);
  const todas = [...variantePara.keys()];
  for (let i = 0; i < todas.length; i += 400) {
    const base = client.from('leads').select('id, phone, created_at').in('phone', todas.slice(i, i + 400));
    // Lead legado sem company_id é da casa (mesma trava de empresa do resto).
    const q = companyId === CASA ? base.or(`company_id.eq.${CASA},company_id.is.null`) : base.eq('company_id', companyId);
    const { data, error } = await q.order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    for (const l of (data ?? []) as Array<{ id: string; phone: string | null }>) {
      const t = variantePara.get(String(l.phone ?? ''));
      if (t && !out.has(t)) out.set(t, l.id);
    }
  }
  return out;
}

/**
 * O que já está no painel vindo do número pessoal deste dono (para a tela):
 * mensagens, conversas e a mais antiga. Nunca lança (null = não deu pra ler).
 */
export async function resumoDoPessoal(client: SupabaseClient, np: NumeroPessoal): Promise<{ mensagens: number; conversas: number; conversasMais: boolean; maisAntiga: string | null } | null> {
  try {
    const base = () => client.from('mensagens_whatsapp');
    const [cont, antiga, tels] = await Promise.all([
      base().select('id', { count: 'exact', head: true }).eq('company_id', np.company_id).eq('visivel_so_para', np.dono_user_id).eq('numero', np.instancia),
      base().select('criado_em').eq('company_id', np.company_id).eq('visivel_so_para', np.dono_user_id).eq('numero', np.instancia)
        .order('criado_em', { ascending: true }).limit(1),
      base().select('contato_telefone').eq('company_id', np.company_id).eq('visivel_so_para', np.dono_user_id).eq('numero', np.instancia)
        .order('criado_em', { ascending: false }).limit(5000),
    ]);
    if (cont.error || antiga.error || tels.error) return null;
    const lista = (tels.data ?? []) as Array<{ contato_telefone: string | null }>;
    const conversas = new Set(lista.map((x) => x.contato_telefone).filter(Boolean)).size;
    const mensagens = typeof cont.count === 'number' ? cont.count : Array.isArray(cont.data) ? cont.data.length : 0;
    const maisAntiga = ((antiga.data ?? []) as Array<{ criado_em: string }>)[0]?.criado_em ?? null;
    return { mensagens, conversas, conversasMais: lista.length >= 5000, maisAntiga };
  } catch {
    return null;
  }
}

/** O webhook da Evolution trouxe o HISTÓRICO (messages.set / MESSAGES_SET)? PURA. */
export function ehEventoDeHistorico(body: unknown): boolean {
  const ev = String((body as { event?: unknown } | null)?.event ?? '').trim().toLowerCase().replace(/_/g, '.');
  return ev === 'messages.set';
}

/**
 * messages.set no webhook: SÓ da instância de um número pessoal ativo da casa
 * (Eva e tenants: ignorado — a Eva não importa histórico). Enfileira e volta
 * na hora; banco fora ao conferir a instância → 503 (a Evolution tenta de novo).
 */
export async function receberHistoricoNoWebhook(p: {
  body: unknown;
  porInstancia: (instancia: string | undefined) => Promise<NumeroPessoal | null | 'erro'>;
  companyDaInstancia: (instancia: string | undefined) => Promise<string | null | undefined>;
  importador: Pick<ImportadorHistorico, 'enfileirar'>;
  /** EVOLUTION_INSTANCE (a da Eva): o histórico dela nunca entra na caixa pessoal. */
  instanciaDaEva?: string;
}): Promise<{ http: number; status: string; aceitas?: number }> {
  const corpo = (p.body ?? {}) as { instance?: unknown; data?: unknown };
  const instancia = typeof corpo.instance === 'string' ? corpo.instance : undefined;
  if (!instancia || (p.instanciaDaEva && instancia.toLowerCase() === p.instanciaDaEva.toLowerCase())) return { http: 200, status: 'historico_ignorado' };
  const np = await p.porInstancia(instancia);
  if (np === 'erro') return { http: 503, status: 'numero_pessoal_indisponivel' };
  if (!np) return { http: 200, status: 'historico_ignorado' };
  if (await p.companyDaInstancia(instancia)) return { http: 200, status: 'numero_pessoal_conflito' };
  if (!np.ativo) return { http: 200, status: 'numero_pessoal_desligado' };
  const lista = mensagensDoEvento(corpo.data);
  const aceitas = p.importador.enfileirar(np, lista);
  console.log(`[numero-pessoal-historico] "${np.instancia}": ${lista.length} mensagens do histórico recebidas (${aceitas} na fila)`);
  return { http: 200, status: 'historico_enfileirado', aceitas };
}
