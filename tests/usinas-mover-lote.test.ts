// Mover usinas em lote: sanitiza a entrada da rota antes de tocar no banco.
// Mantém só ids em formato UUID (sem duplicados) e diz se a etapa destino existe.
// Blindagem: entrada que não é lista vira [] (rota recusa quando vazio).
import { describe, it, expect } from 'vitest';
import { sanitizarMoverLote } from '../src/modules/monitoring/usinas-queries.js';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

describe('sanitizarMoverLote', () => {
  it('aceita etapa existente e recusa etapa inválida', () => {
    expect(sanitizarMoverLote([A], 'operacao').etapaValida).toBe(true);
    expect(sanitizarMoverLote([A], 'xpto').etapaValida).toBe(false);
  });

  it('mantém só ids em formato UUID', () => {
    const r = sanitizarMoverLote([A, 'nao-e-uuid', B, ''], 'operacao');
    expect(r.ids).toEqual([A, B]);
  });

  it('remove ids duplicados', () => {
    const r = sanitizarMoverLote([A, A, B], 'operacao');
    expect(r.ids).toEqual([A, B]);
  });

  it('entrada que não é lista vira lista vazia', () => {
    expect(sanitizarMoverLote(undefined, 'operacao').ids).toEqual([]);
    expect(sanitizarMoverLote('abc', 'operacao').ids).toEqual([]);
  });
});
