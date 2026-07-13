// src/modules/vendas/propostas-abertas.ts
// Lista as propostas EM ABERTO (enviadas, cliente ainda não é venda) como linhas
// tocáveis pra lista interativa do WhatsApp — o "Fechei uma venda" clicável da
// Eva. Cada linha carrega o id `fechei_pick:<leadId>`; ao tocar, o handler marca
// a venda pelo Coração da Venda (registrarVenda). Uma proposta por cliente.
import { CLIENTE_STATUSES } from '../dashboard/clientes-queries.js';

export interface PropostaAbertaRow {
  id: string;          // 'fechei_pick:<leadId>' — volta como texto quando o Junior toca
  title: string;       // nome do cliente (≤24 chars, limite do WhatsApp)
  description: string;  // nº da proposta (≤72 chars)
  leadId: string;
}

/**
 * Propostas em aberto (lead ligado, não revogada, ainda não vendido), a mais
 * recente por cliente, no máx `limite` linhas. Best-effort: erro → lista vazia.
 */
export async function listarPropostasAbertas(client: any, limite = 9): Promise<PropostaAbertaRow[]> {
  try {
    const { data: props, error } = await client
      .from('propostas_publicas')
      .select('id, lead_id, cliente_nome, numero_proposta, created_at, revoked')
      .not('lead_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error || !props) return [];
    const linhas = (props as any[]).filter((p) => p.revoked !== true && p.lead_id);

    // Descobre quais leads já são venda (pra tirar da lista de "em aberto").
    const leadIds = [...new Set(linhas.map((p) => p.lead_id))];
    const vendidos = new Set<string>();
    if (leadIds.length) {
      const { data: leadsRows } = await client
        .from('leads')
        .select('id, installation_status')
        .in('id', leadIds);
      for (const l of (leadsRows ?? []) as any[]) {
        if (CLIENTE_STATUSES.includes(String(l.installation_status ?? ''))) vendidos.add(l.id);
      }
    }

    const rows: PropostaAbertaRow[] = [];
    const jaListado = new Set<string>();
    for (const p of linhas) {
      if (vendidos.has(p.lead_id) || jaListado.has(p.lead_id)) continue;
      jaListado.add(p.lead_id);
      rows.push({
        id: `fechei_pick:${p.lead_id}`,
        title: String(p.cliente_nome ?? 'Cliente').slice(0, 24),
        description: (p.numero_proposta ? `Proposta ${p.numero_proposta}` : 'Proposta').slice(0, 72),
        leadId: p.lead_id,
      });
      if (rows.length >= limite) break;
    }
    return rows;
  } catch {
    return [];
  }
}
