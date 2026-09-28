// src/modules/mensagens-whatsapp.ts
//
// Histórico COMPLETO do atendimento (migration 138, Atendimento Parte 2).
// `conversations.messages` é a memória curta da Eva (20 mensagens, sem autor);
// aqui fica o que a equipe manda pelo painel, os eventos assumiu/devolveu e —
// na Parte 2b — o número pessoal conectado por QR.
//
// Toda leitura/escrita leva company_id explícito (além da RLS FORCE da 138).
// Nenhuma função lança por causa do banco: quem chama decide o que fazer com
// { ok:false }. A ÚNICA exceção de propósito é `reservarEnvio`, que devolve
// 'erro' — e o envio NÃO sai (falha fechada: sem reserva, sem anti envio duplo).

import type { SupabaseClient } from '@supabase/supabase-js';

export type CanalMensagem = 'eva_oficial' | 'whatsapp_business' | 'qr_code';

export interface LinhaMensagemWhatsapp {
  id: string;
  company_id: string;
  lead_id: string | null;
  contato_telefone: string | null;
  contato_nome: string | null;
  direcao: 'entrada' | 'saida' | 'evento';
  autor: 'cliente' | 'eva' | 'humano' | 'sistema';
  user_id: string | null;
  autor_nome: string | null;
  canal: CanalMensagem | null;
  numero: string | null;
  tipo: string;
  texto: string | null;
  modelo: string | null;
  evento: 'assumiu' | 'devolveu' | null;
  origem: string | null;
  wamid: string | null;
  status: 'enviando' | 'enviada' | 'falhou' | 'recebida' | 'registrada';
  erro: string | null;
  visivel_so_para: string | null;
  criado_em: string;
  enviada_em: string | null;
}

export type NovaMensagem = Partial<Omit<LinhaMensagemWhatsapp, 'id' | 'criado_em'>> &
  Pick<LinhaMensagemWhatsapp, 'company_id' | 'direcao' | 'autor'>;

const COLUNAS = 'id, company_id, lead_id, contato_telefone, contato_nome, direcao, autor, user_id, autor_nome, canal, numero, tipo, texto, modelo, evento, origem, wamid, status, erro, visivel_so_para, criado_em, enviada_em';

/**
 * Reserva o envio ANTES de chamar o WhatsApp. A `chave_envio` é única por
 * empresa (índice da 138): o mesmo clique chegando duas vezes → 'duplicado'.
 */
export async function reservarEnvio(
  client: SupabaseClient,
  linha: NovaMensagem & { chave_envio: string },
): Promise<{ ok: true; id: string } | { ok: false; motivo: 'duplicado' | 'ja_falhou' | 'erro'; erro?: string }> {
  try {
    const { data, error } = await client.from('mensagens_whatsapp')
      .insert({ ...linha, status: 'enviando' })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') {
        // Mesmo clique de novo. Se o 1º tinha falhado, diz isso (não "já enviada").
        const status = await statusDaChave(client, linha.company_id, linha.chave_envio);
        return { ok: false, motivo: status === 'falhou' ? 'ja_falhou' : 'duplicado' };
      }
      return { ok: false, motivo: 'erro', erro: error.message };
    }
    return { ok: true, id: String((data as { id: string }).id) };
  } catch (err) {
    return { ok: false, motivo: 'erro', erro: (err as Error).message };
  }
}

/** Status do envio desta chave (null = chave nunca usada / erro). */
export async function statusDaChave(client: SupabaseClient, companyId: string, chave: string): Promise<LinhaMensagemWhatsapp['status'] | null> {
  try {
    const { data, error } = await client.from('mensagens_whatsapp').select('status')
      .eq('company_id', companyId).eq('chave_envio', chave).maybeSingle();
    if (error || !data) return null;
    return (data as { status: LinhaMensagemWhatsapp['status'] }).status;
  } catch {
    return null;
  }
}

/** Erro da Meta/Evolution pode trazer o número do cliente: some antes de gravar/logar. PURA. */
export function semTelefone(texto: string): string {
  return texto.replace(/\d[\d\s().-]{8,}\d/g, '[número]');
}

/** Fecha a reserva: saiu (com o id do WhatsApp) ou falhou (com o motivo). */
export async function concluirEnvio(
  client: SupabaseClient,
  id: string,
  companyId: string,
  r: { status: 'enviada' | 'falhou'; wamid?: string | null; erro?: string | null },
): Promise<void> {
  try {
    const { error } = await client.from('mensagens_whatsapp')
      .update({
        status: r.status,
        wamid: r.wamid || null,
        erro: r.erro ? semTelefone(r.erro).slice(0, 500) : null,
        enviada_em: r.status === 'enviada' ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .eq('company_id', companyId);
    if (error?.code === '23505' && r.wamid) {
      // O eco do celular já gravou este id do WhatsApp: fecha o envio sem ele.
      await client.from('mensagens_whatsapp').update({ status: r.status, enviada_em: new Date().toISOString() })
        .eq('id', id).eq('company_id', companyId);
      return;
    }
    if (error) console.warn(`[mensagens-whatsapp] concluir ${id} falhou: ${error.message}`);
  } catch (err) {
    console.warn(`[mensagens-whatsapp] concluir ${id} falhou: ${(err as Error).message}`);
  }
}

/** Grava uma mensagem/evento que já aconteceu (ex.: recebida no número pessoal). */
export async function gravarMensagem(client: SupabaseClient, linha: NovaMensagem): Promise<{ ok: boolean; duplicada?: boolean }> {
  try {
    const { error } = await client.from('mensagens_whatsapp').insert(linha);
    if (error) {
      if (error.code === '23505') return { ok: true, duplicada: true };
      console.warn(`[mensagens-whatsapp] gravar falhou: ${error.message}`);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.warn(`[mensagens-whatsapp] gravar falhou: ${(err as Error).message}`);
    return { ok: false };
  }
}

/** Pode o `viewerId` ver esta linha? Conversa pessoal só o dono do número vê. PURA. */
export function linhaVisivelPara(l: Pick<LinhaMensagemWhatsapp, 'visivel_so_para'>, viewerId: string | null | undefined): boolean {
  return !l.visivel_so_para || (!!viewerId && l.visivel_so_para === viewerId);
}

/**
 * Histórico do painel para um lead, DA EMPRESA. As linhas da empresa toda
 * (visivel_so_para null) vêm pelo `client` (o do operador: a RLS da 138 filtra);
 * as PESSOAIS de quem está vendo (número pessoal, Parte 2b) só vêm quando o
 * chamador passa o client de serviço em `privado` — com o filtro do dono
 * explícito. As mais NOVAS primeiro no corte, depois em ordem de tempo.
 * Erro (ex.: migration 138 ainda não aplicada) → lista vazia.
 */
export async function mensagensDoPainel(
  client: SupabaseClient,
  companyId: string,
  leadId: string,
  viewerId: string | null,
  limite = 500,
  privado?: SupabaseClient,
): Promise<LinhaMensagemWhatsapp[]> {
  if (!companyId || !leadId) return [];
  const ler = async (c: SupabaseClient, dono: string | null): Promise<LinhaMensagemWhatsapp[]> => {
    try {
      let q = c.from('mensagens_whatsapp').select(COLUNAS)
        .eq('company_id', companyId)
        .eq('lead_id', leadId);
      q = dono ? q.eq('visivel_so_para', dono) : q.is('visivel_so_para', null);
      const { data, error } = await q.order('criado_em', { ascending: false }).limit(limite);
      if (error) return [];
      return (data ?? []) as LinhaMensagemWhatsapp[];
    } catch {
      return [];
    }
  };
  const [daEmpresa, pessoais] = await Promise.all([
    ler(client, null),
    privado && viewerId ? ler(privado, viewerId) : Promise.resolve([] as LinhaMensagemWhatsapp[]),
  ]);
  return [...daEmpresa, ...pessoais]
    .filter((l) => linhaVisivelPara(l, viewerId))
    .sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
}
