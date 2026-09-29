// src/modules/cobranca-recorrente/disparos-repo.ts
// Na VOLTA da 2ª trava (pagou / reativado / prazo dado): os disparos
// automáticos do tenant que ficaram na fila voltam de onde pararam, com
// espaçamento (pausa.ts#novosHorarios) — sem enxurrada.
//
// Filas de disparo automático pros clientes do tenant (todas com company_id e
// status 'pending'). Nova fila de disparo? Entra AQUI e no ponto único
// (pausa.ts#disparoLiberado / filtrarDisparosLiberados).

import type { SupabaseClient } from '@supabase/supabase-js';
import { novosHorarios } from './pausa.js';

export const FILAS_DE_DISPARO: ReadonlyArray<{ tabela: string; coluna: string; data?: boolean }> = [
  { tabela: 'eva_cadence', coluna: 'scheduled_for' },
  { tabela: 'eva_intro_pending', coluna: 'scheduled_for' },
  { tabela: 'proposta_followup_vivo', coluna: 'scheduled_for' },
  { tabela: 'post_install_touches', coluna: 'scheduled_for' },
  { tabela: 'reengagement_touches', coluna: 'scheduled_for' },
  { tabela: 'email_sequencia', coluna: 'scheduled_for' },
  { tabela: 'maintenance_reminders', coluna: 'scheduled_date', data: true },
];

/**
 * Reagenda os pendentes da empresa (todas as filas juntas, espaçamento entre
 * todos). Devolve quantos mudaram. Uma fila que falhar não impede as outras.
 */
export async function reagendarDisparosDaEmpresa(
  client: SupabaseClient,
  companyId: string,
  pausadoDesde: string,
  agoraIso: string = new Date().toISOString(),
): Promise<number> {
  const itens: Array<{ id: string; quando: string; fila: (typeof FILAS_DE_DISPARO)[number] }> = [];
  for (const fila of FILAS_DE_DISPARO) {
    const { data, error } = await client.from(fila.tabela).select(`id, ${fila.coluna}`)
      .eq('company_id', companyId).eq('status', 'pending').limit(2000);
    if (error) { console.warn(`[cobranca-recorrente] reagendar ${fila.tabela}: ${error.message}`); continue; }
    for (const r of (data ?? []) as unknown as Array<Record<string, string>>) {
      const q = r[fila.coluna];
      if (!q) continue;
      itens.push({ id: `${fila.tabela}:${r.id}`, quando: fila.data ? `${q.slice(0, 10)}T12:00:00.000Z` : q, fila });
    }
  }
  if (itens.length === 0) return 0;
  const porId = new Map(itens.map((i) => [i.id, i]));
  let mudou = 0;
  for (const n of novosHorarios(itens, pausadoDesde, agoraIso)) {
    const it = porId.get(n.id)!;
    if (n.quando === it.quando) continue;
    const valor = it.fila.data ? n.quando.slice(0, 10) : n.quando;
    const { error } = await client.from(it.fila.tabela).update({ [it.fila.coluna]: valor })
      .eq('id', n.id.slice(it.fila.tabela.length + 1)).eq('company_id', companyId).eq('status', 'pending');
    if (!error) mudou++;
  }
  return mudou;
}
