import { describe, it, expect } from 'vitest';
import { mapServicosFromClaude } from '../src/modules/proposal-assistant.js';

describe('mapServicosFromClaude', () => {
  it('mapeia lista de serviços do JSON da Eva', () => {
    const out = mapServicosFromClaude([
      { titulo: 'Carregador EV', descricao: 'Wallbox 7,4 kW', valorRs: 4500 },
    ]);
    expect(out).toEqual([{ titulo: 'Carregador EV', descricao: 'Wallbox 7,4 kW', valorRs: 4500 }]);
  });
  it('ignora itens sem título ou sem valor', () => {
    const out = mapServicosFromClaude([
      { titulo: '', descricao: 'x', valorRs: 100 },
      { titulo: 'Y', descricao: 'z', valorRs: 0 },
      { titulo: 'Ok', descricao: 'd', valorRs: 200 },
    ]);
    expect(out).toEqual([{ titulo: 'Ok', descricao: 'd', valorRs: 200 }]);
  });
  it('retorna undefined quando não há serviços (mantém proposta solar-only)', () => {
    expect(mapServicosFromClaude(undefined)).toBeUndefined();
    expect(mapServicosFromClaude([])).toBeUndefined();
  });
});
