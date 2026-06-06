import { describe, it, expect } from 'vitest';
import { mapServicosFromClaude, resumoServicosParaJunior } from '../src/modules/proposal-assistant.js';

describe('resumoServicosParaJunior', () => {
  it('serviço "a mais": mostra + R$ e o total geral somado', () => {
    const linhas = resumoServicosParaJunior(
      [{ titulo: 'Adequação', descricao: '', valorRs: 2800, jaIncluso: false }], 38500).join('\n');
    expect(linhas).toContain('2.800');
    expect(linhas).toContain('41.300'); // 38.500 + 2.800
  });
  it('serviço "já incluso": aparece à parte e NÃO soma ao total', () => {
    const linhas = resumoServicosParaJunior(
      [{ titulo: 'Carregador EV', descricao: '', valorRs: 1000, jaIncluso: true }], 38500).join('\n');
    expect(linhas.toLowerCase()).toContain('já incluso');
    expect(linhas).toContain('Carregador EV');
    expect(linhas).not.toContain('39.500'); // não somou
  });
  it('mistura: total geral = solar + extras; incluso fica à parte', () => {
    const linhas = resumoServicosParaJunior([
      { titulo: 'Adequação', descricao: '', valorRs: 2800, jaIncluso: false },
      { titulo: 'Carregador EV', descricao: '', valorRs: 1000, jaIncluso: true },
    ], 38500).join('\n');
    expect(linhas).toContain('41.300');
    expect(linhas).not.toContain('42.300');
    expect(linhas.toLowerCase()).toContain('já incluso');
  });
  it('sem serviços = nenhuma linha', () => {
    expect(resumoServicosParaJunior([], 38500)).toEqual([]);
    expect(resumoServicosParaJunior(undefined, 38500)).toEqual([]);
  });
});

describe('mapServicosFromClaude', () => {
  it('mapeia lista de serviços do JSON da Eva', () => {
    const out = mapServicosFromClaude([
      { titulo: 'Carregador EV', descricao: 'Wallbox 7,4 kW', valorRs: 4500 },
    ]);
    expect(out).toEqual([{ titulo: 'Carregador EV', descricao: 'Wallbox 7,4 kW', valorRs: 4500, jaIncluso: false }]);
  });
  it('ignora itens sem título ou sem valor', () => {
    const out = mapServicosFromClaude([
      { titulo: '', descricao: 'x', valorRs: 100 },
      { titulo: 'Y', descricao: 'z', valorRs: 0 },
      { titulo: 'Ok', descricao: 'd', valorRs: 200 },
    ]);
    expect(out).toEqual([{ titulo: 'Ok', descricao: 'd', valorRs: 200, jaIncluso: false }]);
  });
  it('retorna undefined quando não há serviços (mantém proposta solar-only)', () => {
    expect(mapServicosFromClaude(undefined)).toBeUndefined();
    expect(mapServicosFromClaude([])).toBeUndefined();
  });
  it('aceita valorRs como string (a Eva pode mandar string)', () => {
    const out = mapServicosFromClaude([{ titulo: 'Projeto elétrico', descricao: 'SPDA + laudo', valorRs: ('3200' as unknown as number) }]);
    expect(out).toEqual([{ titulo: 'Projeto elétrico', descricao: 'SPDA + laudo', valorRs: 3200, jaIncluso: false }]);
  });
  it('passa jaIncluso=true quando a Eva marca o serviço como já incluso no total', () => {
    const out = mapServicosFromClaude([
      { titulo: 'Carregador EV', descricao: 'wallbox 7,4kW', valorRs: 1000, jaIncluso: true },
    ]);
    expect(out).toEqual([{ titulo: 'Carregador EV', descricao: 'wallbox 7,4kW', valorRs: 1000, jaIncluso: true }]);
  });
  it('jaIncluso vira false quando a Eva não marca (default = serviço que soma)', () => {
    const out = mapServicosFromClaude([
      { titulo: 'Adequação', descricao: 'troca padrão', valorRs: 2800 },
    ]);
    expect(out?.[0].jaIncluso).toBe(false);
  });
});
