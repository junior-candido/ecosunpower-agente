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
import { gravarMensagem, type LinhaMensagemWhatsapp } from './mensagens-whatsapp.js';
import { assumirAtendimento } from './assumir-atendimento.js';

export const CASA = '00000000-0000-0000-0000-000000000001';
const TTL_MS = 60_000;
const NOME_INSTANCIA_OK = /^[a-zA-Z0-9_-]{1,64}$/;

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

/** Instância → número pessoal (cache de 1 min; erro = "não é pessoal", nunca derruba o webhook). */
export function criarResolverNumeroPessoal(client: SupabaseClient) {
  const cache = new Map<string, { at: number; valor: NumeroPessoal | null }>();
  return {
    async porInstancia(instancia: string | undefined): Promise<NumeroPessoal | null> {
      const chave = (instancia ?? '').trim();
      if (!chave || !NOME_INSTANCIA_OK.test(chave)) return null;
      const c = cache.get(chave);
      if (c && Date.now() - c.at < TTL_MS) return c.valor;
      try {
        const { data, error } = await client.from('whatsapp_numeros_pessoais')
          .select(COLUNAS).eq('instancia', chave).eq('ativo', true).maybeSingle();
        if (error) { cache.set(chave, { at: Date.now(), valor: null }); return null; }
        const v = (data as NumeroPessoal | null) ?? null;
        cache.set(chave, { at: Date.now(), valor: v });
        return v;
      } catch {
        return null;
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
export function textoDaEntrada(msg: Pick<IncomingMessage, 'type' | 'content' | 'caption'>): string {
  if (msg.type === 'text') return (msg.content ?? '').trim();
  const marcador = MARCADOR[msg.type] ?? '';
  const legenda = (msg.caption ?? '').trim();
  return legenda ? `${marcador} ${legenda}` : marcador;
}

export type ResultadoPessoal = 'gravada' | 'eco' | 'duplicada' | 'ignorada' | 'falhou';

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
): Promise<ResultadoPessoal> {
  if (msg.deGrupo) return 'ignorada';
  const telefone = normalizeBrazilianPhone(msg.from ?? '');
  if (!telefone) return 'ignorada';
  const texto = textoDaEntrada(msg);
  if (!texto) return 'ignorada';
  try {
    if (msg.fromMe && msg.messageId) {
      const { data: igual } = await client.from('mensagens_whatsapp').select('id')
        .eq('company_id', np.company_id).eq('wamid', msg.messageId).limit(1);
      if (Array.isArray(igual) && igual.length > 0) return 'eco';
      // Eco que chegou ANTES de o painel gravar o wamid: mesmo contato, mesmo
      // texto, saído do painel há menos de 2 min, ainda sem wamid.
      const desde = new Date(agora - 2 * 60_000).toISOString();
      const { data: recentes } = await client.from('mensagens_whatsapp').select('id, texto, wamid')
        .eq('company_id', np.company_id).eq('contato_telefone', telefone).eq('origem', 'painel')
        .eq('canal', 'whatsapp_business').gte('criado_em', desde).limit(20);
      const doPainel = ((recentes ?? []) as Array<{ id: string; texto: string | null; wamid: string | null }>)
        .find((r) => !r.wamid && (r.texto ?? '').trim() === texto);
      if (doPainel) {
        await client.from('mensagens_whatsapp').update({ wamid: msg.messageId }).eq('id', doPainel.id).eq('company_id', np.company_id);
        return 'eco';
      }
    }

    const lead = await leadDoTelefoneNaEmpresa(client, np.company_id, telefone).catch(() => null);
    const r = await gravarMensagem(client, {
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
    });
    if (!r.ok) return 'falhou';
    if (r.duplicada) return 'duplicada';
    // O dono respondeu um LEAD pelo celular: ele assumiu esse cliente.
    if (msg.fromMe && lead && lead.eva_active !== false && !lead.opt_out) {
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
): Promise<{ ok: true; leadId: string; criado: boolean } | { ok: false; motivo: 'telefone_invalido' | 'sem_conversa' | 'erro' }> {
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
      if (error || !data) return { ok: false, motivo: 'erro' };
      leadId = String((data as { id: string }).id);
      criado = true;
      await gravarMensagem(servico, {
        company_id: p.companyId, lead_id: leadId, direcao: 'evento', autor: 'humano', tipo: 'evento', evento: 'assumiu',
        origem: 'painel', user_id: p.userId, autor_nome: p.userNome.slice(0, 80), status: 'registrada',
      });
    }
    await servico.from('mensagens_whatsapp').update({ lead_id: leadId })
      .eq('company_id', p.companyId).eq('contato_telefone', telefone).is('lead_id', null);
    return { ok: true, leadId, criado };
  } catch (err) {
    console.warn(`[numero-pessoal] virar lead falhou: ${(err as Error).message}`);
    return { ok: false, motivo: 'erro' };
  }
}

/** A instância pode ser o número pessoal? (não pode ser número de assistente de tenant). */
export async function instanciaLivreParaPessoal(servico: SupabaseClient, instancia: string, instanciaDaEva: string): Promise<boolean> {
  if (!NOME_INSTANCIA_OK.test(instancia)) return false;
  if (instancia === instanciaDaEva) return false;
  const { data, error } = await servico.from('companies').select('id').eq('evolution_instance', instancia).limit(1);
  if (error) return false;
  return !Array.isArray(data) || data.length === 0;
}
