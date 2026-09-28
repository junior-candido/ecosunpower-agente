// src/modules/assumir-atendimento.ts
//
// "ASSUMIR" É UM ESTADO SÓ (Atendimento Parte 2, 28/09/2026).
//
// Hoje a Eva manda para o Junior, no WhatsApp, um aviso com o botão "✋ Assumir"
// (evabt:lead-pause:<id>) e "↩️ Reativar" (evabt:lead-resume:<id>). O estado
// que eles mexem é `leads.eva_active` — o mesmo que a Eva confere antes de
// responder (index.ts, gate eva_active) e o mesmo do "⏸ Pausar / ▶ Retomar"
// da tela. O painel NÃO cria uma pausa paralela: ele chama estas funções, e o
// botão do WhatsApp também. Assim:
//   - assumir por um lado aparece no outro (é a mesma coluna);
//   - só "Devolver para a Eva" (aqui ou no zap) traz a Eva de volta — não há
//     volta automática por tempo (decisão do Junior, 28/09);
//   - cada troca vira um EVENTO na conversa (mensagens_whatsapp, migration
//     138): "Junior assumiu às 14:32" / "Devolvido para a Eva às 15:10".
//
// O evento é best-effort: se a tabela ainda não existe (migration não aplicada)
// a pausa acontece igual — o que não pode é o cliente receber a Eva por cima.

import type { SupabaseClient } from '@supabase/supabase-js';

export type OrigemAtendimento = 'painel' | 'whatsapp' | 'celular';

export interface PedidoAtendimento {
  leadId: string;
  /** Empresa de quem pediu (painel). Lead de outra empresa → nada acontece.
   *  Ausente (botão do WhatsApp, que já exige remetente admin) → usa a do lead. */
  companyId?: string;
  origem: OrigemAtendimento;
  userId?: string | null;
  /** Quem aparece no evento ("Junior", "Bia"). */
  autorNome: string;
}

export type ResultadoAtendimento =
  | { ok: true; jaEstava: boolean }
  | { ok: false; motivo: 'nao_encontrado' | 'opt_out' | 'erro' };

const CASA = '00000000-0000-0000-0000-000000000001';

interface LeadEstado { id: string; company_id: string | null; phone: string | null; eva_active: boolean | null; opt_out: boolean | null }

async function lerLead(client: SupabaseClient, p: PedidoAtendimento): Promise<LeadEstado | null> {
  const { data, error } = await client.from('leads')
    .select('id, company_id, phone, eva_active, opt_out')
    .eq('id', p.leadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const lead = data as LeadEstado | null;
  if (!lead) return null;
  // Lead legado sem company_id = da casa (mesma regra de trava-lead-empresa).
  if (p.companyId && (lead.company_id ?? CASA) !== p.companyId) return null;
  return lead;
}

async function gravarEvento(client: SupabaseClient, lead: LeadEstado, p: PedidoAtendimento, evento: 'assumiu' | 'devolveu'): Promise<void> {
  try {
    const { error } = await client.from('mensagens_whatsapp').insert({
      company_id: lead.company_id ?? CASA,
      lead_id: lead.id,
      direcao: 'evento',
      autor: 'humano',
      tipo: 'evento',
      evento,
      origem: p.origem,
      user_id: p.userId ?? null,
      autor_nome: (p.autorNome || '').slice(0, 80) || null,
      status: 'registrada',
    });
    if (error) console.warn(`[atendimento] evento "${evento}" não gravou (segue): ${error.message}`);
  } catch (err) {
    console.warn(`[atendimento] evento "${evento}" não gravou (segue): ${(err as Error).message}`);
  }
}

/** UPDATE do lead na empresa DELE (legado sem company_id = null, não "casa"). Devolve quantas linhas mudaram. */
async function atualizarLead(client: SupabaseClient, lead: LeadEstado, campos: Record<string, unknown>): Promise<number | null> {
  const base = client.from('leads').update(campos).eq('id', lead.id);
  const q = lead.company_id ? base.eq('company_id', lead.company_id) : base.is('company_id', null);
  const { data, error } = await q.select('id');
  if (error) return null;
  return Array.isArray(data) ? data.length : 0;
}

/** Humano assume a conversa: a Eva fica pausada ATÉ alguém devolver. */
export async function assumirAtendimento(client: SupabaseClient, p: PedidoAtendimento): Promise<ResultadoAtendimento> {
  let lead: LeadEstado | null;
  try { lead = await lerLead(client, p); } catch { return { ok: false, motivo: 'erro' }; }
  if (!lead) return { ok: false, motivo: 'nao_encontrado' };
  const jaEstava = lead.eva_active === false;

  // Nenhuma linha mudou (RLS, corrida) = NÃO pausou: não diz que pausou.
  const mudou = await atualizarLead(client, lead, { eva_active: false, updated_at: new Date().toISOString() });
  if (!mudou) return { ok: false, motivo: 'erro' };
  // Igual ao botão do zap: cadência pendente sai, senão a Eva manda toque por cima.
  const { error: eCad } = await client.from('eva_cadence')
    .update({ status: 'cancelled', cancelled_reason: 'admin_assumed' })
    .eq('lead_id', lead.id)
    .eq('status', 'pending');
  if (eCad) console.warn(`[atendimento] cadência do lead ${lead.id.slice(0, 8)} não cancelou: ${eCad.message}`);
  if (!jaEstava) await gravarEvento(client, lead, p, 'assumiu');
  return { ok: true, jaEstava };
}

/**
 * Devolve para a Eva. Único caminho de volta. `retomarTakeover` limpa a pausa
 * curta do Redis (eco do celular no canal QR) do telefone, pra ela voltar já.
 * Contato que pediu para parar NÃO volta a falar com a Eva.
 */
export async function devolverParaEva(
  client: SupabaseClient,
  p: PedidoAtendimento,
  retomarTakeover?: (telefone: string, companyId: string) => Promise<void>,
): Promise<ResultadoAtendimento> {
  let lead: LeadEstado | null;
  try { lead = await lerLead(client, p); } catch { return { ok: false, motivo: 'erro' }; }
  if (!lead) return { ok: false, motivo: 'nao_encontrado' };
  if (lead.opt_out) return { ok: false, motivo: 'opt_out' };
  const jaEstava = lead.eva_active !== false;

  const mudou = await atualizarLead(client, lead, { eva_active: true, updated_at: new Date().toISOString() });
  if (!mudou) return { ok: false, motivo: 'erro' };
  if (retomarTakeover && lead.phone) {
    await retomarTakeover(lead.phone, lead.company_id ?? CASA).catch((e) => console.warn(`[atendimento] takeover não limpou: ${(e as Error).message}`));
  }
  if (!jaEstava) await gravarEvento(client, lead, p, 'devolveu');
  return { ok: true, jaEstava };
}

/** Evento mais recente da conversa (quem assumiu/devolveu e quando). PURA. */
export function ultimoEventoDeAtendimento(
  msgs: ReadonlyArray<{ autor?: string; evento?: string | null; autorNome?: string | null; timestamp: string | null }>,
): { evento: 'assumiu' | 'devolveu'; autorNome: string | null; timestamp: string | null } | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.autor === 'evento' && (m.evento === 'assumiu' || m.evento === 'devolveu')) {
      return { evento: m.evento, autorNome: m.autorNome ?? null, timestamp: m.timestamp };
    }
  }
  return null;
}
