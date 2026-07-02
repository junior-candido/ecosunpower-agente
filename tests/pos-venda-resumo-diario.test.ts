// tests/pos-venda-resumo-diario.test.ts
import { describe, it, expect } from 'vitest';
import {
  dentroDaJanelaResumo, inicioDoDiaBrt, montarResumoDiario,
} from '../src/modules/dashboard/pos-venda-resumo-diario.js';

const LINK = 'https://dashboard.ecosunpower.eng.br/dashboard/pos-venda';

describe('dentroDaJanelaResumo', () => {
  // 17h BRT = 20h UTC (America/Sao_Paulo, sem DST desde 2019)
  it('quinta 17:10 BRT: dentro', () => {
    expect(dentroDaJanelaResumo(new Date('2026-07-02T20:10:00Z'))).toBe(true);
  });
  it('quinta 16:59 BRT: fora', () => {
    expect(dentroDaJanelaResumo(new Date('2026-07-02T19:59:00Z'))).toBe(false);
  });
  it('quinta 18:00 BRT: fora (janela fecha as 18)', () => {
    expect(dentroDaJanelaResumo(new Date('2026-07-02T21:00:00Z'))).toBe(false);
  });
  it('sabado 17:30 BRT: dentro (Junior trabalha sabado)', () => {
    expect(dentroDaJanelaResumo(new Date('2026-07-04T20:30:00Z'))).toBe(true);
  });
  it('domingo 17:30 BRT: fora', () => {
    expect(dentroDaJanelaResumo(new Date('2026-07-05T20:30:00Z'))).toBe(false);
  });
});

describe('inicioDoDiaBrt', () => {
  it('meio da tarde BRT -> 00:00 BRT = 03:00Z do mesmo dia', () => {
    expect(inicioDoDiaBrt(new Date('2026-07-02T20:10:00Z'))).toBe('2026-07-02T03:00:00.000Z');
  });
  it('01:00 BRT (04:00Z) -> ainda e o dia 02 em BRT', () => {
    expect(inicioDoDiaBrt(new Date('2026-07-02T04:00:00Z'))).toBe('2026-07-02T03:00:00.000Z');
  });
  it('23:30Z do dia 01 = 20:30 BRT do dia 01 -> inicio do dia 01', () => {
    expect(inicioDoDiaBrt(new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-01T03:00:00.000Z');
  });
});

describe('montarResumoDiario', () => {
  it('0 sugestoes -> null (dia sem nada = silencio)', () => {
    expect(montarResumoDiario([], LINK)).toBeNull();
  });

  it('agrupa por situacao na ordem de prioridade e traz o link', () => {
    const txt = montarResumoDiario([
      { nome: 'José Silva', tipo: 'upgrade' },
      { nome: 'Maria Souza', tipo: 'geracao_saudavel' },
      { nome: 'Denivaldo Alves', tipo: 'queda' },
      { nome: 'Sonia Lima', tipo: 'geracao_saudavel' },
    ], LINK)!;
    expect(txt).toContain('4 pedem atenção');
    // ordem: queda antes de boa notícia, que vem antes de upgrade
    const iQueda = txt.indexOf('📉');
    const iBoa = txt.indexOf('☀️ Boa notícia');
    const iUp = txt.indexOf('🔋');
    expect(iQueda).toBeGreaterThan(-1);
    expect(iBoa).toBeGreaterThan(iQueda);
    expect(iUp).toBeGreaterThan(iBoa);
    // primeiro nome só
    expect(txt).toContain('Denivaldo');
    expect(txt).not.toContain('Denivaldo Alves');
    expect(txt).toContain(LINK);
  });

  it('singular: 1 usina pede atencao', () => {
    const txt = montarResumoDiario([{ nome: 'Maria', tipo: 'queda' }], LINK)!;
    expect(txt).toContain('1 pede atenção');
  });

  it('mais de 3 no grupo vira (+n)', () => {
    const txt = montarResumoDiario([
      { nome: 'A', tipo: 'queda' }, { nome: 'B', tipo: 'queda' },
      { nome: 'C', tipo: 'queda' }, { nome: 'D', tipo: 'queda' },
      { nome: 'E', tipo: 'queda' },
    ], LINK)!;
    expect(txt).toContain('A, B, C (+2)');
  });

  it('grupo contato (sem falar ha tempo) aparece', () => {
    const txt = montarResumoDiario([{ nome: 'X', tipo: 'contato' }], LINK)!;
    expect(txt).toContain('📞 Sem falar há tempo: X');
  });
});
