// src/modules/capi-reporter.ts
//
// "Maestro" do CAPI: dado um leadId + nome do estagio, decide se devolve o
// evento pra Meta. Centraliza a regra pra que o index.ts (gigante) so precise
// chamar uma funcao de uma linha em cada ponto de transicao de funil.
//
// REGRAS:
//  1. Roteamento pelo jeito de casar o evento com o anuncio:
//     - ctwa_clid (clique CTWA) -> evento business_messaging (match mais forte)
//     - leadgen_id (formulario instantaneo) -> evento CRM system_generated
//     - nenhum dos dois (organico/antigo) -> nao manda
//  2. Estagio ja reportado (capi_stages_sent) -> nao manda de novo.
//  3. So marca como enviado APOS a Meta confirmar (ok), pra nao perder evento
//     numa falha transitoria de rede.
//  4. NUNCA lanca. Tudo aqui e fire-and-forget; o atendimento da Eva nao pode
//     quebrar porque a Meta caiu.

import { buildCtwaEvent, buildCrmLeadEvent, CapiEvent, CapiCrmEvent, MetaCapi } from './meta-capi.js';

export interface LeadCapiInfo {
  phone?: string | null;
  ctwa_clid?: string | null;
  /** leadgen_id do formulario Meta (meta_leadgen_events). Null = nao veio de form. */
  leadgen_id?: string | null;
  capi_stages_sent?: string[] | null;
}

// [MT fatia 3d] as deps de banco aceitam um `db` opcional (SupabaseService do
// crachá) — o caminho da MENSAGEM passa o dele; sem db, singleton (crons/HTTP).
// Tipado como unknown aqui pra não acoplar este módulo ao SupabaseService.
export interface CapiReporterDeps {
  capi: MetaCapi;
  wabaId: string;
  getLeadForCapi: (leadId: string, db?: unknown) => Promise<LeadCapiInfo | null>;
  recordCapiStage: (leadId: string, stage: string, db?: unknown) => Promise<boolean>;
  /** Injetavel pra teste. Default: Date.now. */
  now?: () => number;
}

export type CapiReporter = (
  leadId: string,
  eventName: string,
  opts?: { value?: number; db?: unknown },
) => Promise<void>;

export function makeCapiReporter(deps: CapiReporterDeps): CapiReporter {
  const now = deps.now ?? (() => Date.now());

  return async (leadId, eventName, opts) => {
    try {
      const lead = await deps.getLeadForCapi(leadId, opts?.db);
      if (!lead) return;
      if (lead.capi_stages_sent?.includes(eventName)) return;

      // event_id deterministico: mensagens em rajada disparam o mesmo estagio
      // antes do recordCapiStage gravar — a Meta dedupa pelo event_id.
      const eventId = `${leadId}:${eventName}`;

      let event: CapiEvent | CapiCrmEvent;
      if (lead.ctwa_clid) {
        event = buildCtwaEvent({
          eventName,
          eventTimeMs: now(),
          ctwaClid: lead.ctwa_clid,
          wabaId: deps.wabaId,
          phone: lead.phone ?? undefined,
          value: opts?.value,
          eventId,
        });
      } else if (lead.leadgen_id) {
        event = buildCrmLeadEvent({
          eventName,
          eventTimeMs: now(),
          leadgenId: lead.leadgen_id,
          phone: lead.phone ?? undefined,
          value: opts?.value,
          eventId,
        });
      } else {
        return; // organico/antigo: sem chave pra casar com anuncio
      }

      const res = await deps.capi.sendEvents([event]);
      if (res.ok) {
        await deps.recordCapiStage(leadId, eventName, opts?.db);
        console.log(`[capi] ${eventName} enviado pra Meta — lead=${leadId}`);
      } else {
        console.warn(`[capi] ${eventName} falhou pra lead=${leadId}: ${res.error}`);
      }
    } catch (err) {
      console.warn(`[capi] erro inesperado em ${eventName} lead=${leadId}:`, (err as Error).message);
    }
  };
}
