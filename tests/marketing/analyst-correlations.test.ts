import { describe, it, expect } from 'vitest';
import { detectPatterns, type WeeklyData } from '../../src/modules/marketing/analyst-correlations.js';

describe('detectPatterns', () => {
  it('detecta ctr_alto_conv_baixa quando CTR > 1.5% e conversao < 30%', () => {
    const data: WeeklyData = {
      creatives: [{ id: 1, name: 'Casa premium DF', ctr: 2.5, leads: 10, conversations: 1 }],
      campaigns: [], leads_by_day: [], leads_by_persona: {},
    };
    const r = detectPatterns(data);
    const p = r.find((x) => x.tipo === 'ctr_alto_conv_baixa');
    expect(p).toBeDefined();
    expect(p?.severity).toBe('warning');
    expect(p?.message).toContain('Casa premium DF');
  });

  it('nao detecta ctr_alto_conv_baixa quando CTR baixo', () => {
    const data: WeeklyData = {
      creatives: [{ id: 1, name: 'A', ctr: 0.8, leads: 10, conversations: 1 }],
      campaigns: [], leads_by_day: [], leads_by_persona: {},
    };
    expect(detectPatterns(data).find((x) => x.tipo === 'ctr_alto_conv_baixa')).toBeUndefined();
  });

  it('detecta categoria_sem_lead quando gastou > R$300 e zero lead', () => {
    const data: WeeklyData = {
      creatives: [],
      campaigns: [{ id: 1, codigo_portfolio: 'D', name: 'Off-grid rural', leads: 0, spend_cents: 50000 }],
      leads_by_day: [], leads_by_persona: {},
    };
    const r = detectPatterns(data);
    const p = r.find((x) => x.tipo === 'categoria_sem_lead');
    expect(p).toBeDefined();
    expect(p?.message).toContain('Off-grid rural');
    expect(p?.message).toContain('500.00');
  });

  it('nao detecta categoria_sem_lead quando gasto baixo', () => {
    const data: WeeklyData = {
      creatives: [],
      campaigns: [{ id: 1, codigo_portfolio: 'D', name: 'Teste', leads: 0, spend_cents: 20000 }],
      leads_by_day: [], leads_by_persona: {},
    };
    expect(detectPatterns(data).find((x) => x.tipo === 'categoria_sem_lead')).toBeUndefined();
  });

  it('detecta concentracao_dia quando 1 dia tem mais de 50% dos leads', () => {
    const data: WeeklyData = {
      creatives: [], campaigns: [],
      leads_by_day: [
        { day_of_week: 4, count: 12 }, // qui
        { day_of_week: 1, count: 1 },
        { day_of_week: 2, count: 2 },
        { day_of_week: 3, count: 1 },
      ],
      leads_by_persona: {},
    };
    const r = detectPatterns(data);
    const p = r.find((x) => x.tipo === 'concentracao_dia');
    expect(p).toBeDefined();
    expect(p?.message).toContain('Qui');
  });

  it('nao detecta concentracao_dia com menos de 6 leads', () => {
    const data: WeeklyData = {
      creatives: [], campaigns: [],
      leads_by_day: [{ day_of_week: 4, count: 3 }, { day_of_week: 1, count: 1 }],
      leads_by_persona: {},
    };
    expect(detectPatterns(data).find((x) => x.tipo === 'concentracao_dia')).toBeUndefined();
  });

  it('retorna array vazio sem nenhum padrao', () => {
    const data: WeeklyData = { creatives: [], campaigns: [], leads_by_day: [], leads_by_persona: {} };
    expect(detectPatterns(data)).toEqual([]);
  });
});
