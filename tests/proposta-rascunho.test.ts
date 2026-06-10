import { describe, it, expect } from 'vitest';
import { resumirRascunho } from '../src/modules/proposal/rascunho.js';

describe('resumirRascunho', () => {
  it('em andamento: extrai nome do cliente e o que falta do último turno do Claude', () => {
    const history = [
      { role: 'assistant', content: JSON.stringify({ action: 'ask_more', data: { nomeCliente: 'João' }, missing: ['valorTotalRs', 'inversor'] }) },
    ];
    const r = resumirRascunho({ modoEnvio: 'junior_envia', tipo: 'basica', geracaoConcluida: false }, history as any);
    expect(r.emAndamento).toBe(true);
    expect(r.nomeCliente).toBe('João');
    expect(r.faltando).toEqual(['valorTotalRs', 'inversor']);
  });
  it('já gerada: não é rascunho', () => {
    const r = resumirRascunho({ geracaoConcluida: true } as any, []);
    expect(r.emAndamento).toBe(false);
  });
  it('sem histórico: não em andamento', () => {
    const r = resumirRascunho({} as any, []);
    expect(r.emAndamento).toBe(false);
  });
});
