// src/modules/vendas/estado-venda.ts
// Máquina de estados de venda (spec §3). Toda mudança passa por transicionar(): valida, grava, loga no Elo.
// NUNCA lança — quem chama já está no meio de um fluxo (envio, resposta, takeover) e não pode cair por causa disso.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventoInput } from '../elo/eventos.js';
import { type EstadoVenda, estadoOuNovo, transicaoValida } from './estado-venda-regras.js';

export interface EstadoVendaDeps {
  client: SupabaseClient;
  registrarEvento: (client: any, ev: EventoInput) => Promise<void>;
}

export interface TransicaoInput {
  leadId: string;
  para: EstadoVenda;
  motivo: string;
  autor: 'eva' | 'junior' | 'sistema';
  agoraMs: number;
}

export type TransicaoResultado =
  | { ok: true; de: EstadoVenda; para: EstadoVenda; noop?: true }
  | { ok: false; de: EstadoVenda; para: EstadoVenda; erro: 'transicao_invalida' | 'lead_nao_encontrado' | 'banco' };

export class EstadoVendaService {
  constructor(private readonly deps: EstadoVendaDeps) {}

  async transicionar(t: TransicaoInput): Promise<TransicaoResultado> {
    let de: EstadoVenda = 'NOVO';
    try {
      const { data: lead } = await this.deps.client
        .from('leads').select('id, estado_venda, company_id').eq('id', t.leadId).maybeSingle();
      if (!lead) return { ok: false, de, para: t.para, erro: 'lead_nao_encontrado' };
      de = estadoOuNovo((lead as any).estado_venda);
      if (de === t.para) return { ok: true, de, para: t.para, noop: true };
      if (!transicaoValida(de, t.para)) {
        console.warn(`[estado-venda] transição inválida ${de} → ${t.para} (lead ${t.leadId}, ${t.motivo})`);
        return { ok: false, de, para: t.para, erro: 'transicao_invalida' };
      }
      const em = new Date(t.agoraMs).toISOString();
      await this.deps.client.from('leads').update({ estado_venda: t.para, estado_venda_em: em }).eq('id', t.leadId);
      await this.deps.registrarEvento(this.deps.client, {
        tipo: 'comercial:estado_venda',
        leadId: t.leadId,
        companyId: (lead as any).company_id ?? null,
        canal: 'sistema',
        origem: 'estado-venda',
        payload: { de, para: t.para, motivo: t.motivo, autor: t.autor, em },
      });
      console.log(`[estado-venda] ${de} → ${t.para} lead=${t.leadId} (${t.autor}: ${t.motivo})`);
      return { ok: true, de, para: t.para };
    } catch (e) {
      console.error('[estado-venda] erro', e instanceof Error ? e.message : e);
      return { ok: false, de, para: t.para, erro: 'banco' };
    }
  }
}
