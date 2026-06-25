import { describe, it, expect } from 'vitest';
import {
  cadenciaDaUsina, proximaData, feedbackLeitura,
  statusAgendaItem, ordenarAgenda, precisaLeituraDoMes,
} from '../src/modules/dashboard/manutencao-motor.js';

describe('cadenciaDaUsina', () => {
  it('usa o padrão global quando não há override', () => {
    expect(cadenciaDaUsina('limpeza', null)).toBe(6);
    expect(cadenciaDaUsina('revisao_inversor', null)).toBe(12);
    expect(cadenciaDaUsina('corretiva', null)).toBeNull();
  });
  it('override da usina vence o padrão', () => {
    expect(cadenciaDaUsina('limpeza', { limpeza: 3 })).toBe(3);
  });
  it('override inválido (0/negativo) cai no padrão', () => {
    expect(cadenciaDaUsina('limpeza', { limpeza: 0 })).toBe(6);
  });
});

describe('proximaData', () => {
  it('soma os meses da cadência', () => {
    const r = proximaData(new Date('2026-01-15T00:00:00Z'), 6);
    expect(r?.toISOString().slice(0, 10)).toBe('2026-07-15');
  });
  it('null quando cadência é null (corretiva/inspeção não recorrem)', () => {
    expect(proximaData(new Date('2026-01-15T00:00:00Z'), null)).toBeNull();
  });
});

describe('feedbackLeitura', () => {
  // esperado = kWp * HSP * dias * PR(0.78). Ex: 5kWp * 5.2 * 30 * 0.78 ≈ 608 kWh
  it('dentro de ±15% → ok', () => {
    expect(feedbackLeitura(600, 5, 5.2, 30).status).toBe('ok');
  });
  it('25% abaixo → baixo, com sugestão de limpeza', () => {
    const f = feedbackLeitura(456, 5, 5.2, 30);
    expect(f.status).toBe('baixo');
    expect(f.pctDesvio).toBeLessThanOrEqual(-15);
    expect(f.sugestao.toLowerCase()).toContain('limpeza');
  });
  it('bem acima → alto', () => {
    expect(feedbackLeitura(750, 5, 5.2, 30).status).toBe('alto');
  });
  it('sem dados da usina → indefinido (não chuta)', () => {
    expect(feedbackLeitura(500, 0, 5.2, 30).status).toBe('indefinido');
    expect(feedbackLeitura(500, 5, 0, 30).status).toBe('indefinido');
  });
});

describe('statusAgendaItem', () => {
  const hoje = new Date('2026-06-25T12:00:00Z');
  it('data passada → vencida', () => { expect(statusAgendaItem('2026-06-01', hoje)).toBe('vencida'); });
  it('dentro de 30 dias → proxima', () => { expect(statusAgendaItem('2026-07-10', hoje)).toBe('proxima'); });
  it('longe → ok', () => { expect(statusAgendaItem('2026-12-01', hoje)).toBe('ok'); });
  it('sem data → ok', () => { expect(statusAgendaItem(null, hoje)).toBe('ok'); });
});

describe('ordenarAgenda', () => {
  it('vencidas primeiro, depois por data agendada crescente', () => {
    const hoje = new Date('2026-06-25T12:00:00Z');
    const itens = [
      { id: 'a', data_agendada: '2026-07-10' },
      { id: 'b', data_agendada: '2026-06-01' },
      { id: 'c', data_agendada: '2026-06-20' },
    ];
    expect(ordenarAgenda(itens, hoje).map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('precisaLeituraDoMes', () => {
  const hoje = new Date('2026-06-25T12:00:00Z');
  it('usina com API nunca entra no empurrão', () => {
    expect(precisaLeituraDoMes(true, null, hoje)).toBe(false);
  });
  it('usina sem API e sem leitura no mês → precisa', () => {
    expect(precisaLeituraDoMes(false, null, hoje)).toBe(true);
    expect(precisaLeituraDoMes(false, '2026-05-31T00:00:00Z', hoje)).toBe(true);
  });
  it('usina sem API já com leitura neste mês → não precisa', () => {
    expect(precisaLeituraDoMes(false, '2026-06-02T00:00:00Z', hoje)).toBe(false);
  });
});
