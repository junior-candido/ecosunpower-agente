// src/modules/proposal/recuperar-dados-input.ts
// Reconstrói o `dados_input` (jsonb de propostas_publicas) a partir do JSON que
// foi salvo no Google Drive na geração (`dados-<numero>.json` = { data, calcInput }).
// Usado pelo script de resgate das propostas antigas que ficaram sem dados_input
// (bug do caminho com estudo). Espelha exatamente o que generateProposalCore grava.
import { montarDadosInputCompleto } from './dados-input.js';
import { somaServicosExtras } from './service-render.js';
import { mapServicosFromClaude } from '../proposal-assistant.js';

export function construirDadosInputDeDrive(driveJson: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(driveJson);
  } catch {
    return null;
  }
  // O Drive salva { data, calcInput }. Tolera também o `data` cru (fallback).
  const root = parsed as Record<string, unknown> | null;
  const data = (root && typeof root === 'object' && 'data' in root ? root.data : root) as
    | Record<string, unknown>
    | null;
  if (!data || data.valorTotalRs === undefined || data.valorTotalRs === null) return null;

  const total = Number(data.valorTotalRs) + somaServicosExtras(mapServicosFromClaude(data.servicos));
  return montarDadosInputCompleto(data, total);
}
