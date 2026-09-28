// src/modules/numero-pessoal.ts
//
// O WhatsApp PESSOAL do dono no painel (Atendimento Parte 2b, 28/09/2026 —
// "plano B" por QR code na Evolution, enquanto a coexistência oficial da Meta
// não sai). Migration 139 (whatsapp_numeros_pessoais) + 138 (mensagens).
//
// Regras do dono (Junior):
//  - só a EcoSun, e SÓ QUEM CONECTOU vê: tudo que passa por esse número é
//    gravado com visivel_so_para = dono (e a RLS da 138 esconde do resto);
//  - TODAS as conversas entram (amigo pode virar cliente); quem não é lead
//    fica sem lead_id até ele tocar "virar lead";
//  - mesmo cliente nos dois números = UM lead: busca pelo telefone com 55
//    (variantesTelefone, o 9º dígito incluso) DENTRO da empresa;
//  - a Eva NUNCA responde nesse número. O webhook desvia a mensagem pra cá
//    ANTES de qualquer coisa da Eva (fila, lead novo, cadência).
//  - o dono digitando no celular para um LEAD = ele assumiu aquele cliente
//    (mesmo estado do botão "✋ Assumir"; a Eva para no número dela também).
//
// Nada aqui responde, cria lead sozinho ou manda mensagem.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IncomingMessage } from './evolution.js';
import { normalizeBrazilianPhone } from './meta-leadgen.js';
import { variantesTelefone } from './phone.js';
import { gravarMensagem, type LinhaMensagemWhatsapp, type NovaMensagem } from './mensagens-whatsapp.js';
import { assumirAtendimento } from './assumir-atendimento.js';
import { completarMidiaRecebida, TIPO_DA_ENTRADA } from './midia-whatsapp.js';

export const CASA = '00000000-0000-0000-0000-000000000001';
const TTL_MS = 60_000;
const NOME_INSTANCIA_OK = /^[a-zA-Z0-9_-]{1,64}$/;
/** ILIKE sem curinga: "_" e "%" viram letra (senão "pessoal_x" casaria com "pessoalAx"). */
const semCuringa = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export interface NumeroPessoal {
  id: string;
  company_id: string;
  dono_user_id: string;
  dono_nome: string | null;
  instancia: string;
  numero: string | null;
  ativo: boolean;
}

const COLUNAS = 'id, company_id, dono_user_id, dono_nome, instancia, numero, ativo';

/**
 * Instância → número pessoal (cache de 1 min). Devolve também o DESLIGADO
 * (ativo=false: o webhook ignora calado) e 'erro' quando o banco não
 * respondeu — aí o webhook NÃO confirma (a Evolution tenta de novo) e nada
 * de conversa pessoal cai em log. Tabela ainda inexistente (42P01) = não é pessoal.
 */
export function criarResolverNumeroPessoal(client: SupabaseClient) {
  const cache = new Map<string, { at: number; valor: NumeroPessoal | null }>();
  return {
    async porInstancia(instancia: string | undefined): Promise<NumeroPessoal | null | 'erro'> {
      const chave = (instancia ?? '').trim();
      if (!chave || !NOME_INSTANCIA_OK.test(chave)) return null;
      const c = cache.get(chave);
      if (c && Date.now() - c.at < TTL_MS) return c.valor;
      try {
        const { data, error } = await client.from('whatsapp_numeros_pessoais')
          .select(COLUNAS).ilike('instancia', semCuringa(chave)).maybeSingle();
        if (error) {
          if (error.code === '42P01' || /does not exist/i.test(error.message ?? '')) { cache.set(chave, { at: Date.now(), valor: null }); return null; }
          return 'erro';
        }
        const v = (data as NumeroPessoal | null) ?? null;
        cache.set(chave, { at: Date.now(), valor: v });
        return v;
      } catch {
        return 'erro';
      }
    },
    limpar() { cache.clear(); },
  };
}

/** Número pessoal de QUEM ESTÁ LOGADO (só o dono vê). */
export async function numeroPessoalDoDono(client: SupabaseClient, companyId: string, userId: string): Promise<NumeroPessoal | null> {
  if (!companyId || !userId) return null;
  try {
    const { data, error } = await client.from('whatsapp_numeros_pessoais')
      .select(COLUNAS).eq('company_id', companyId).eq('dono_user_id', userId).maybeSingle();
    if (error) return null;
    return (data as NumeroPessoal | null) ?? null;
  } catch {
    return null;
  }
}

/** Lead da EMPRESA com este telefone (qualquer formato: com/sem 55, com/sem 9º dígito). */
export async function leadDoTelefoneNaEmpresa(
  client: SupabaseClient,
  companyId: string,
  telefone: string,
): Promise<{ id: string; name: string | null; eva_active: boolean | null; opt_out: boolean | null } | null> {
  const variantes = variantesTelefone(telefone);
  if (variantes.length === 0) return null;
  const base = client.from('leads').select('id, name, eva_active, opt_out, company_id, created_at').in('phone', variantes);
  // Lead legado sem company_id é da casa (mesma regra da trava de empresa).
  const q = companyId === CASA ? base.or(`company_id.eq.${CASA},company_id.is.null`) : base.eq('company_id', companyId);
  const { data, error } = await q.order('created_at', { ascending: true }).limit(1);
  if (error) throw new Error(error.message);
  const l = (data as Array<{ id: string; name: string | null; eva_active: boolean | null; opt_out: boolean | null }> | null)?.[0];
  return l ?? null;
}

const TIPO: Record<IncomingMessage['type'], LinhaMensagemWhatsapp['tipo']> = {
  text: 'texto', audio: 'audio', image: 'imagem', video: 'video', document: 'documento', location: 'texto',
};
const MARCADOR: Partial<Record<IncomingMessage['type'], string>> = {
  audio: '[áudio]', image: '[imagem]', video: '[vídeo]', document: '[documento]', location: '[localização]',
};

/** O que fica escrito no histórico. Mídia vira marcador (+ legenda). PURA. */
export function textoDaEntrada(msg: Pick<IncomingMessage, 'type' | 'content' | 'caption'> & { nomeArquivo?: string }): string {
  if (msg.type === 'text') return (msg.content ?? '').trim();
  const marcador = MARCADOR[msg.type] ?? '';
  // Documento sem legenda: o nome do arquivo (igual ao que o painel grava ao enviar).
  const legenda = (msg.caption ?? '').trim() || (msg.type === 'document' ? (msg.nomeArquivo ?? '').trim() : '');
  return legenda ? `${marcador} ${legenda}` : marcador;
}

/** Hora da mensagem (ISO) quando válida e não no futuro; senão null (vale a do banco). PURA. */
export function horaDaMensagem(ts: Date | undefined, agora = Date.now()): string | null {
  const t = ts instanceof Date ? ts.getTime() : NaN;
  if (!Number.isFinite(t) || t <= 0 || t > agora + 60_000) return null;
  return new Date(Math.min(t, agora)).toISOString();
}

export type ResultadoPessoal = 'gravada' | 'eco' | 'duplicada' | 'ignorada' | 'falhou';

/** W1: só baixa mídia recente (ao reconectar, a Evolution reentrega dias de mensagens). */
export const JANELA_BAIXAR_MIDIA_MS = 24 * 60 * 60 * 1000;

export interface OpcoesPessoal {
  /** Baixa a mídia desta mensagem pela instância do dono (Evolution). Ausente = só o marcador. */
  baixarMidia?: (msg: IncomingMessage) => Promise<{ base64: string; mimetype: string } | null>;
  /** Transcreve o áudio (fica embaixo do player). */
  transcrever?: (base64: string, mime: string) => Promise<string | null>;
  /**
   * Webhook: a mensagem é gravada NA HORA (com o marcador) e o arquivo
   * (download + bucket + transcrição) completa depois, sem segurar a Evolution.
   * Ausente = completa antes de devolver (testes / importação).
   */
  emSegundoPlano?: (tarefa: Promise<unknown>) => void;
}

/**
 * Mensagem que chegou (ou saiu do celular) no número pessoal: GRAVA e pronto.
 * - de grupo / sem telefone → ignorada (não é conversa de cliente);
 * - eco de algo que o painel mandou → não duplica (casa pelo wamid ou pelo
 *   texto recente ainda sem wamid);
 * - o dono digitou pra um lead → ele assumiu esse cliente.
 */
export async function receberNoNumeroPessoal(
  client: SupabaseClient,
  np: NumeroPessoal,
  msg: IncomingMessage,
  agora = Date.now(),
  opcoes: OpcoesPessoal = {},
): Promise<ResultadoPessoal> {
  if (msg.deGrupo) return 'ignorada';
  const telefone = normalizeBrazilianPhone(msg.from ?? '');
  if (!telefone) return 'ignorada';
  const texto = textoDaEntrada(msg);
  if (!texto) return 'ignorada';
  try {
    // Eva, o próprio dono, a equipe: não é conversa de cliente (não grava).
    if (ehTelefoneOculto(await telefonesOcultosDoPessoal(client, np.company_id, np), telefone)) return 'ignorada';
    if (msg.fromMe && msg.messageId) {
      const { data: igual } = await client.from('mensagens_whatsapp').select('id')
        .eq('company_id', np.company_id).eq('wamid', msg.messageId).limit(1);
      if (Array.isArray(igual) && igual.length > 0) return 'eco';
      // Eco que chegou ANTES de o painel gravar o wamid: mesmo contato, mesmo
      // texto, saído do painel há menos de 2 min, ainda sem wamid.
      const desde = new Date(agora - 2 * 60_000).toISOString();
      const { data: recentes } = await client.from('mensagens_whatsapp').select('id, texto, wamid, criado_em')
        .eq('company_id', np.company_id).eq('contato_telefone', telefone).eq('origem', 'painel')
        .eq('canal', 'whatsapp_business').eq('numero', np.instancia).eq('visivel_so_para', np.dono_user_id)
        .gte('criado_em', desde).limit(20);
      const norm = (t: string | null) => (t ?? '').replace(/\r\n/g, '\n').trim();
      const doPainel = ((recentes ?? []) as Array<{ id: string; texto: string | null; wamid: string | null; criado_em?: string }>)
        .filter((r) => !r.wamid && norm(r.texto) === norm(texto))
        .sort((a, b) => String(a.criado_em ?? '').localeCompare(String(b.criado_em ?? '')))[0];
      if (doPainel) {
        await client.from('mensagens_whatsapp').update({ wamid: msg.messageId })
          .eq('id', doPainel.id).eq('company_id', np.company_id).eq('visivel_so_para', np.dono_user_id);
        return 'eco';
      }
    }

    const lead = await leadDoTelefoneNaEmpresa(client, np.company_id, telefone).catch(() => null);
    const linha: NovaMensagem & { criado_em?: string } = {
      company_id: np.company_id,
      lead_id: lead?.id ?? null,
      contato_telefone: telefone,
      contato_nome: msg.fromMe ? null : (msg.pushName ?? null),
      direcao: msg.fromMe ? 'saida' : 'entrada',
      autor: msg.fromMe ? 'humano' : 'cliente',
      user_id: msg.fromMe ? np.dono_user_id : null,
      autor_nome: msg.fromMe ? np.dono_nome : null,
      canal: 'whatsapp_business',
      numero: np.instancia,
      tipo: TIPO[msg.type] ?? 'texto',
      texto: texto.slice(0, 4096),
      origem: msg.fromMe ? 'celular' : 'webhook',
      wamid: msg.messageId || null,
      status: msg.fromMe ? 'enviada' : 'recebida',
      visivel_so_para: np.dono_user_id,
      enviada_em: msg.fromMe ? new Date(msg.timestamp ?? agora).toISOString() : null,
      // Hora da MENSAGEM (não a da gravação): ao reconectar, o WhatsApp reentrega
      // mensagens antigas pelo tempo real — elas ficam na ordem certa.
      ...(horaDaMensagem(msg.timestamp, agora) ? { criado_em: horaDaMensagem(msg.timestamp, agora)! } : {}),
    };
    // W1: foto/áudio/vídeo/documento RECENTE → o arquivo vai para o bucket (só o dono vê).
    const tipoMidia = TIPO_DA_ENTRADA[msg.type];
    const recente = agora - new Date(msg.timestamp ?? agora).getTime() < JANELA_BAIXAR_MIDIA_MS;
    let r: { ok: boolean; duplicada?: boolean };
    if (tipoMidia && recente && opcoes.baixarMidia && msg.messageId) {
      // 1) a mensagem entra já (marcador + legenda); 2) o arquivo completa a linha pelo wamid.
      r = await gravarMensagem(client, linha);
      if (r.ok && !r.duplicada) {
        const tarefa = completarMidiaRecebida(client, {
          companyId: np.company_id, wamid: msg.messageId, tipo: tipoMidia,
          baixar: () => opcoes.baixarMidia!(msg), nomeArquivo: msg.nomeArquivo ?? null,
          // LGPD: áudio de amigo/família (quem não é lead) não vai para a IA de transcrição.
          transcrever: lead ? opcoes.transcrever : undefined,
          tamanhoBytes: msg.tamanhoBytes ?? null,
        });
        if (opcoes.emSegundoPlano) opcoes.emSegundoPlano(tarefa); else await tarefa;
      }
    } else {
      r = await gravarMensagem(client, linha);
    }
    if (!r.ok) return 'falhou';
    if (r.duplicada) return 'duplicada';
    // Mensagens antigas deste contato (de antes de ele virar lead) passam pro lead.
    if (lead) {
      await client.from('mensagens_whatsapp').update({ lead_id: lead.id })
        .eq('company_id', np.company_id).eq('contato_telefone', telefone).eq('visivel_so_para', np.dono_user_id).is('lead_id', null);
    }
    // O dono respondeu um LEAD pelo celular: ele assumiu esse cliente. Só mensagem
    // RECENTE — ao reconectar, a Evolution reentrega histórico e isso pausaria a Eva em massa.
    const idadeMs = agora - new Date(msg.timestamp ?? agora).getTime();
    if (msg.fromMe && lead && lead.eva_active !== false && !lead.opt_out && idadeMs < 5 * 60_000) {
      await assumirAtendimento(client, { leadId: lead.id, companyId: np.company_id, origem: 'celular', userId: np.dono_user_id, autorNome: np.dono_nome ?? 'Equipe' });
    }
    return 'gravada';
  } catch (err) {
    console.warn(`[numero-pessoal] mensagem não gravou: ${(err as Error).message}`);
    return 'falhou';
  }
}

/**
 * Mensagens do número pessoal visíveis ao dono (as mais novas), da empresa.
 * Lê com o client de SERVIÇO de propósito: a RLS da 138 esconde linha pessoal
 * de todo mundo; aqui o filtro do dono é explícito.
 */
export async function mensagensPessoais(
  servico: SupabaseClient,
  companyId: string,
  userId: string,
  filtro: { leadId?: string; telefone?: string } = {},
  limite = 500,
): Promise<LinhaMensagemWhatsapp[]> {
  if (!companyId || !userId) return [];
  try {
    let q = servico.from('mensagens_whatsapp').select('*')
      .eq('company_id', companyId).eq('visivel_so_para', userId);
    if (filtro.leadId) q = q.eq('lead_id', filtro.leadId);
    if (filtro.telefone) q = q.eq('contato_telefone', filtro.telefone);
    const { data, error } = await q.order('criado_em', { ascending: false }).limit(limite);
    if (error) return [];
    return ((data ?? []) as LinhaMensagemWhatsapp[]).reverse();
  } catch {
    return [];
  }
}

/**
 * "Virar lead": o contato do número pessoal entra no funil da EMPRESA. Se já
 * existe lead com esse telefone (qualquer formato), usa ele — um cliente, um
 * lead. Entra com a Eva PAUSADA (o dono já está conversando) e com o evento
 * "assumiu". As mensagens do contato passam a apontar pro lead.
 */
export async function virarLead(
  servico: SupabaseClient,
  p: { companyId: string; userId: string; userNome: string; telefone: string; nome?: string | null },
): Promise<{ ok: true; leadId: string; criado: boolean } | { ok: false; motivo: 'telefone_invalido' | 'sem_conversa' | 'telefone_de_outra_empresa' | 'erro' }> {
  const telefone = normalizeBrazilianPhone(p.telefone ?? '');
  if (!telefone) return { ok: false, motivo: 'telefone_invalido' };
  try {
    // Só vira lead quem conversou com ESTE dono no número pessoal (nada de criar lead de telefone qualquer).
    const conversa = await mensagensPessoais(servico, p.companyId, p.userId, { telefone }, 1);
    if (conversa.length === 0) return { ok: false, motivo: 'sem_conversa' };
    const nome = (p.nome ?? conversa[0]?.contato_nome ?? '').trim().slice(0, 120) || null;

    let leadId: string;
    let criado = false;
    const existente = await leadDoTelefoneNaEmpresa(servico, p.companyId, telefone);
    if (existente) {
      leadId = existente.id;
    } else {
      const { data, error } = await servico.from('leads').insert({
        company_id: p.companyId, phone: telefone, name: nome, status: 'novo',
        acquisition_source: 'whatsapp_pessoal', eva_active: false,
        updated_at: new Date().toISOString(),
      }).select('id').single();
      if (error?.code === '23505') return { ok: false, motivo: 'telefone_de_outra_empresa' };
      if (error || !data) return { ok: false, motivo: 'erro' };
      leadId = String((data as { id: string }).id);
      criado = true;
      await gravarMensagem(servico, {
        company_id: p.companyId, lead_id: leadId, direcao: 'evento', autor: 'humano', tipo: 'evento', evento: 'assumiu',
        origem: 'painel', user_id: p.userId, autor_nome: p.userNome.slice(0, 80), status: 'registrada',
      });
    }
    await servico.from('mensagens_whatsapp').update({ lead_id: leadId })
      .eq('company_id', p.companyId).eq('contato_telefone', telefone).eq('visivel_so_para', p.userId).is('lead_id', null);
    return { ok: true, leadId, criado };
  } catch (err) {
    console.warn(`[numero-pessoal] virar lead falhou: ${(err as Error).message}`);
    return { ok: false, motivo: 'erro' };
  }
}

/**
 * Nome da instância do número pessoal: escolhido pelo SERVIDOR (nunca digitado),
 * pra ninguém "adotar" uma instância que já existe na Evolution (de um tenant
 * em implantação, de outro produto…). PURA.
 */
export function nomeInstanciaPessoal(userId: string): string {
  return `pessoal-${String(userId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toLowerCase()}`;
}

/** A instância pode ser o número pessoal? (não pode ser a da Eva nem a de assistente de tenant; sem diferenciar maiúsculas). */
export async function instanciaLivreParaPessoal(servico: SupabaseClient, instancia: string, instanciaDaEva: string): Promise<boolean> {
  if (!NOME_INSTANCIA_OK.test(instancia)) return false;
  if (instancia.toLowerCase() === (instanciaDaEva ?? '').toLowerCase()) return false;
  const { data, error } = await servico.from('companies').select('id').ilike('evolution_instance', semCuringa(instancia)).limit(1);
  if (error) return false;
  return !Array.isArray(data) || data.length === 0;
}

// ---------------------------------------------------------------------------
// Números que NÃO são conversa de cliente no número pessoal (28/09/2026):
// o número da Eva (os avisos dela chegam no celular do dono e apareciam como
// "Não é lead"), o próprio dono e os números da empresa (config) + a equipe
// cadastrada em contatos_internos. Não são gravados e somem da lista.
// ---------------------------------------------------------------------------

let numerosDaCasa: string[] = [];

/** Números fixos da empresa (Eva/negócio, dono, admins extras) — o index.ts define no boot. */
export function definirNumerosInternos(lista: Array<string | null | undefined>): void {
  numerosDaCasa = lista.map((n) => String(n ?? '').trim()).filter(Boolean);
}

const cacheInternos = new Map<string, { at: number; valor: Set<string> }>();
const TTL_INTERNOS_MS = 5 * 60_000;

/**
 * Telefones (todas as variantes: com/sem 55, com/sem 9) que ficam FORA da caixa
 * pessoal desta empresa. Banco fora → só os fixos (esconder é o que falha
 * menos: a conversa, no máximo, aparece para o próprio dono).
 */
export async function telefonesOcultosDoPessoal(client: SupabaseClient, companyId: string, np?: Pick<NumeroPessoal, 'numero'> | null): Promise<Set<string>> {
  const c = cacheInternos.get(companyId);
  let base: Set<string>;
  if (c && Date.now() - c.at < TTL_INTERNOS_MS) {
    base = c.valor;
  } else {
    base = new Set<string>();
    for (const n of numerosDaCasa) for (const v of variantesTelefone(n)) base.add(v);
    try {
      const { data, error } = await client.from('contatos_internos').select('telefone')
        .eq('company_id', companyId).eq('ativo', true).limit(1000);
      if (!error) for (const l of (data ?? []) as Array<{ telefone: string | null }>) for (const v of variantesTelefone(l.telefone ?? '')) base.add(v);
    } catch { /* só os fixos */ }
    // Guarda mesmo com o banco fora (só os fixos): não martela o banco a cada lote.
    cacheInternos.set(companyId, { at: Date.now(), valor: base });
  }
  if (!np?.numero) return base;
  const comDono = new Set(base);
  for (const v of variantesTelefone(np.numero)) comDono.add(v);
  return comDono;
}

/** Este telefone está na lista de ocultos? PURA. */
export function ehTelefoneOculto(ocultos: Set<string>, telefone: string | null | undefined): boolean {
  if (!telefone || ocultos.size === 0) return false;
  return variantesTelefone(telefone).some((v) => ocultos.has(v));
}

/** Só para os testes: esquece o cache. */
export function limparCacheInternos(): void { cacheInternos.clear(); }
