// tests/relatorio-dados.test.ts
import { describe, it, expect } from 'vitest';
import { montarDadosRelatorio, TARIFA_ESTIMADA_KWH } from '../src/modules/monitoring/relatorio/dados.js';

const detalheFake = {
  sistema: { id: 's1', apelido: 'Casa Silva', cidade: 'Brasília', uf: 'DF', marca_inversor: 'deye',
    potencia_kwp: 10, data_instalacao: '2025-12-18', ativo: true, ultimo_erro: null,
    painel_marca: 'Trina Solar' },
  kpis: { hojeKwh: 30, mesKwh: 400, anoKwh: 5000, totalKwh: 12000, esperadoDiaKwh: 41.6, ratioUltimos7: 0.9 },
  serieMensalCompleta: [{ mes: '2026-04', kwh: 1100, esperado: 1248 }, { mes: '2026-05', kwh: 400, esperado: 1290 }],
  alertas: [],
};

function deps(detalhe: any) {
  return { getDetalhe: async (_id: string) => detalhe } as any;
}

describe('montarDadosRelatorio', () => {
  it('TARIFA_ESTIMADA_KWH é 1.00', () => {
    expect(TARIFA_ESTIMADA_KWH).toBe(1.00);
  });

  it('monta dados + economia estimada (kWh total × tarifa) + sinal saudável', async () => {
    const r = await montarDadosRelatorio(deps(detalheFake), 's1', 'acompanhamento');
    expect('erro' in r).toBe(false);
    if (!('erro' in r)) {
      expect(r.apelido).toBe('Casa Silva');
      expect(r.modo).toBe('acompanhamento');
      expect(r.economiaEstimadaReais).toBe(12000 * 1.00);
      expect(r.garantia.ecosun.status).toBe('vigente');
      expect(r.sinal.gravidade).toBeNull();
      expect(r.serieMensal.length).toBe(2);
      expect(r.semDados).toBe(false);
    }
  });

  it('sistema sem geração -> semDados true (boas_vindas não quebra)', async () => {
    const vazio = { ...detalheFake, kpis: { ...detalheFake.kpis, totalKwh: 0, mesKwh: 0, anoKwh: 0 }, serieMensalCompleta: [] };
    const r = await montarDadosRelatorio(deps(vazio), 's1', 'boas_vindas');
    if (!('erro' in r)) expect(r.semDados).toBe(true);
  });

  it('detalhe null -> { erro }', async () => {
    const r = await montarDadosRelatorio(deps(null), 'x', 'acompanhamento');
    expect('erro' in r).toBe(true);
  });

  // Régua relativa (29/07): o relatório do CLIENTE não pode acusar "queda
  // forte" que o painel não mostra. Quando o detalhe traz a mediana da
  // carteira, a gravidade usa a régua relativa.
  it('julho nublado: ratio absoluto 0.45 mas usina na mediana da carteira → sinal saudável', async () => {
    // real7 = 0.45 × 41.6 × 7 = 131.04 kWh; 10 kWp → 13.1 kWh/kWp ≈ mediana 12.6
    const det = {
      ...detalheFake,
      kpis: { ...detalheFake.kpis, ratioUltimos7: 0.45, medianaCarteira7d: 12.6 },
      alertas: [],
    };
    const r = await montarDadosRelatorio(deps(det), 's1', 'acompanhamento');
    if (!('erro' in r)) expect(r.sinal.gravidade).toBeNull();
  });

  it('usina de fato ruim continua grave no relatório mesmo com mediana', async () => {
    // real7 = 0.12 × 41.6 × 7 = 34.9 kWh; 10 kWp → 3.5 kWh/kWp vs mediana 12.6 = 28%
    const det = {
      ...detalheFake,
      kpis: { ...detalheFake.kpis, ratioUltimos7: 0.12, medianaCarteira7d: 12.6 },
      alertas: [{ tipo: 'queda_geracao', severidade: 'aviso', texto: 'Geração últimos 7 dias 72% abaixo da média da carteira. Pode ser sujeira/sombreamento — agendar limpeza.' }],
    };
    const r = await montarDadosRelatorio(deps(det), 's1', 'acompanhamento');
    if (!('erro' in r)) expect(r.sinal.gravidade).toBe('grave');
  });
});
