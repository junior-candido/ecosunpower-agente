// Tela "Custo de IA" (só a casa): contas puras — por empresa, por uso, mês
// atual × anterior, custo por lead atendido, mensalidade × custo → margem.
import { describe, it, expect } from 'vitest';
import { montarPainelCustoIa, janelaMeses, type LinhaUsoIa } from '../src/modules/dashboard/custo-ia-calc.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const CONQ = '4b1f2c3d-1111-4111-8111-222222222222';
// 28/09/2026 15h BRT
const AGORA = new Date('2026-09-28T18:00:00.000Z');

function linha(p: Partial<LinhaUsoIa>): LinhaUsoIa {
  return {
    created_at: '2026-09-10T15:00:00.000Z', company_id: CASA, origem: 'conversa:lead', modelo: 'claude-sonnet-4-6',
    input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, custo_cents: 0, ...p,
  };
}

const EMPRESAS = [{ id: CASA, nome: 'EcoSunPower' }, { id: CONQ, nome: 'Conquista Solar' }];

describe('janelaMeses (horário de Brasília)', () => {
  it('mês atual começa 01 00:00 BRT (03:00 UTC); o anterior também', () => {
    const j = janelaMeses(AGORA);
    expect(j.inicioAtual).toBe('2026-09-01T03:00:00.000Z');
    expect(j.inicioAnterior).toBe('2026-08-01T03:00:00.000Z');
    expect(j.diasDecorridos).toBeCloseTo(27.625, 3); // 27 dias + 15h
    expect(j.diasNoMes).toBe(30);
  });
  it('virada de ano', () => {
    const j = janelaMeses(new Date('2027-01-05T12:00:00.000Z'));
    expect(j.inicioAnterior).toBe('2026-12-01T03:00:00.000Z');
  });
});

describe('montarPainelCustoIa', () => {
  const linhas: LinhaUsoIa[] = [
    linha({ company_id: CASA, custo_cents: 3000 }),
    linha({ company_id: CONQ, custo_cents: 10000 }),
    linha({ company_id: CONQ, custo_cents: 2000, origem: 'midia:imagem' }),
    linha({ company_id: CONQ, custo_cents: 5000, created_at: '2026-08-20T15:00:00.000Z' }),
    // origem antiga (setembro, antes da correção) — traduzida
    linha({ company_id: CASA, custo_cents: 1000, origem: 'eva' }),
    // sem empresa marcada
    linha({ company_id: CASA, custo_cents: 500, origem: 'resumo:lead#sem-empresa' }),
    // chamada pequena gravada com 0: soma pelos tokens (haiku 1000 in = 0,54 centavo)
    linha({ company_id: CASA, custo_cents: 0, origem: 'escrita:corretor', modelo: 'claude-haiku-4-5', input_tokens: 1000 }),
    // fora da janela: ignora
    linha({ company_id: CASA, custo_cents: 99999, created_at: '2026-07-31T12:00:00.000Z' }),
  ];
  const p = montarPainelCustoIa({
    linhas, empresas: EMPRESAS, agora: AGORA,
    mensalidades: new Map([[CONQ, 29700]]),
    atendidos: [
      { company_id: CONQ, lead_id: 'a', created_at: '2026-09-02T12:00:00.000Z' },
      { company_id: CONQ, lead_id: 'a', created_at: '2026-09-03T12:00:00.000Z' },
      { company_id: CONQ, lead_id: 'b', created_at: '2026-09-03T12:00:00.000Z' },
      { company_id: null, lead_id: 'c', created_at: '2026-09-03T12:00:00.000Z' }, // null = casa
    ],
  });

  it('total do mês atual e do anterior', () => {
    expect(p.total.atual.centavos).toBeCloseTo(3000 + 10000 + 2000 + 1000 + 500 + 0.54, 2);
    expect(p.total.anterior.centavos).toBe(5000);
    expect(p.total.atual.chamadas).toBe(6);
  });

  it('por empresa: tenant com mensalidade → margem e % da mensalidade', () => {
    const c = p.porEmpresa.find((e) => e.companyId === CONQ)!;
    expect(c.atual.centavos).toBe(12000);
    expect(c.mensalidadeCents).toBe(29700);
    expect(c.margemCents).toBe(17700);
    expect(c.pctDaMensalidade).toBeCloseTo(40.4, 1);
    // projeção: 12000 / 27,625 dias × 30 = 13032 → 43,9% → passa dos 40%
    expect(c.projecaoCents).toBe(13032);
    expect(c.alerta).toBe(true);
    expect(c.leadsAtendidos).toBe(2);
    expect(c.custoPorLeadCents).toBe(6000);
  });

  it('a casa não tem mensalidade nem alerta; lead sem empresa conta pra casa', () => {
    const casa = p.porEmpresa.find((e) => e.companyId === CASA)!;
    expect(casa.ehCasa).toBe(true);
    expect(casa.mensalidadeCents).toBeNull();
    expect(casa.alerta).toBe(false);
    expect(casa.leadsAtendidos).toBe(1);
  });

  it('empresas ordenadas por custo do mês (maior primeiro)', () => {
    expect(p.porEmpresa[0].companyId).toBe(CONQ);
  });

  it('por uso: origem antiga vira o nome novo e soma junto', () => {
    const conversa = p.porUso.find((u) => u.chave === 'conversa:lead')!;
    expect(conversa.atual.centavos).toBe(3000 + 10000 + 1000);
    expect(conversa.rotulo).toMatch(/Conversa/);
    expect(p.porUso.find((u) => u.chave === 'midia:imagem')!.atual.centavos).toBe(2000);
  });

  it('por uso dentro de cada empresa (o detalhe da Conquista não mistura com a casa)', () => {
    const c = p.porEmpresa.find((e) => e.companyId === CONQ)!;
    expect(c.porUso.map((u) => u.chave).sort()).toEqual(['conversa:lead', 'midia:imagem']);
  });

  it('conta o que ficou sem empresa (buraco a corrigir)', () => {
    expect(p.semEmpresa.chamadas).toBe(1);
    expect(p.semEmpresa.centavos).toBe(500);
  });

  it('alerta configurável (ex.: 50% → Conquista não alerta)', () => {
    const p50 = montarPainelCustoIa({ linhas, empresas: EMPRESAS, agora: AGORA, mensalidades: new Map([[CONQ, 29700]]), atendidos: [], alertaPct: 50 });
    expect(p50.porEmpresa.find((e) => e.companyId === CONQ)!.alerta).toBe(false);
    expect(p50.alertaPct).toBe(50);
  });

  it('cache da conversa: % do que veio do cache (sinal de economia)', () => {
    const q = montarPainelCustoIa({
      linhas: [linha({ input_tokens: 1000, cache_read_tokens: 8000, cache_write_tokens: 1000 })],
      empresas: EMPRESAS, agora: AGORA, mensalidades: new Map(), atendidos: [],
    });
    expect(q.cacheConversaPct).toBe(80);
  });

  it('empresa desconhecida aparece com o id curto (nunca some o custo)', () => {
    const q = montarPainelCustoIa({
      linhas: [linha({ company_id: '9c9c9c9c-3333-4333-8333-444444444444', custo_cents: 10 })],
      empresas: EMPRESAS, agora: AGORA, mensalidades: new Map(), atendidos: [],
    });
    expect(q.porEmpresa.find((e) => e.companyId.startsWith('9c9c'))!.nome).toContain('9c9c9c9c');
  });
});

describe('projeção no começo do mês', () => {
  it('dia 1 às 01h BRT: não multiplica 1 hora por 30 (piso de 1 dia)', () => {
    const agora = new Date('2026-10-01T04:00:00.000Z');
    const j = janelaMeses(agora);
    expect(j.diasDecorridos).toBe(1);
  });
});
