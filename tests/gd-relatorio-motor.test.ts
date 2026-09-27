import { describe, it, expect } from 'vitest';
import { montarRelatorio, mesExtenso, type EntradaRelatorio } from '../src/modules/gd/relatorio-motor.js';
import type { LinhaDemonstrativo } from '../src/modules/gd/demonstrativos-tela-repo.js';

const linha = (over: Partial<LinhaDemonstrativo> = {}): LinhaDemonstrativo => ({
  id: 'D1', lead_id: 'L1', cliente_nome: 'JOAO TESTE', codigo_cliente: '2870620', instalacao: '351534',
  referencia: '2026-08-01', injetado_kwh: 222, consumo_kwh: 480, credito_utilizado_kwh: 380,
  credito_restante_kwh: 100, saldo_acumulado_kwh: 1240, proximo_expirar_kwh: 50, ciclo_expirar: '2027-03-01',
  historico: [
    { mes: '2026-07-01', consumida: 500, injetada: 200, faturada: 120, compensado: 380, credito: 90 },
    { mes: '2026-08-01', consumida: 480, injetada: 222, faturada: 100, compensado: 380, credito: 100 },
  ],
  unidades: [], inconsistencias: [], origem: 'email', origem_verificada: true,
  recebido_em: '2026-09-02T10:00:00Z', conferido_em: null, ...over,
});

const entrada = (over: Partial<EntradaRelatorio> = {}): EntradaRelatorio => ({
  linha: linha(), geracaoKwh: 612, origemGeracao: 'api',
  geracaoPorMes: { '2026-07-01': 590, '2026-08-01': 612 },
  potenciaKwp: 5.5, esperadoMesKwh: 640, tarifaRsKwh: 0.99, ...over,
});

describe('mesExtenso', () => {
  it('escreve o mes por extenso', () => {
    expect(mesExtenso('2026-08-01')).toBe('agosto de 2026');
    expect(mesExtenso('2027-03-01')).toBe('março de 2027');
  });
});

describe('montarRelatorio', () => {
  it('os 4 numeros grandes vem do demonstrativo + geracao', () => {
    const r = montarRelatorio(entrada());
    expect(r.gerouKwh).toBe(612);
    expect(r.consumiuKwh).toBe(480);
    expect(r.creditosKwh).toBe(1240);
    expect(r.economiaRs).toBe(376.2); // compensado 380 × 0,99
  });

  it('frase simples com autoconsumo = gerou - injetado', () => {
    const r = montarRelatorio(entrada());
    expect(r.autoconsumoKwh).toBe(390);
    expect(r.frase).toBe(
      'Em agosto de 2026 sua usina gerou 612 kWh. Você usou 390 kWh direto do sol e mandou 222 kWh pra rede, que viraram créditos. Neste mês, 380 kWh de créditos abateram a sua conta.',
    );
  });

  it('sem injetado nem compensado a frase fica so na geracao', () => {
    const r = montarRelatorio(entrada({ linha: linha({ injetado_kwh: null, historico: [] }) }));
    expect(r.frase).toBe('Em agosto de 2026 sua usina gerou 612 kWh.');
    expect(r.autoconsumoKwh).toBeNull();
    expect(r.economiaRs).toBeNull();
  });

  it('grafico: no maximo 13 meses, em ordem, com a geracao de cada mes quando houver', () => {
    const hist = Array.from({ length: 15 }, (_, i) => {
      const d = new Date(Date.UTC(2025, 5 + i, 1)).toISOString().slice(0, 10);
      return { mes: d, consumida: 100 + i, injetada: 50, faturada: 0, compensado: 40, credito: 0 };
    });
    const r = montarRelatorio(entrada({ linha: linha({ historico: [...hist].reverse() }), geracaoPorMes: { '2026-08-01': 612 } }));
    expect(r.meses).toHaveLength(13);
    expect(r.meses[0].mes < r.meses[12].mes).toBe(true);
    expect(r.meses[12].mes).toBe('2026-08-01');
    expect(r.meses[12].geracao).toBe(612);
    expect(r.meses[0].geracao).toBeNull();
    expect(r.meses[12].rotulo).toBe('ago/2026');
  });

  it('creditos: saldo, usados no mes e a vencer com mes', () => {
    const r = montarRelatorio(entrada());
    expect(r.creditos).toEqual({ saldoKwh: 1240, usadosNoMesKwh: 380, aVencerKwh: 50, venceEm: 'mar/2027' });
  });

  it('rateio so aparece com mais de uma unidade', () => {
    expect(montarRelatorio(entrada()).rateio).toEqual([]);
    const un = [{ codigoCliente: 'A', percentual: 60, saldo: 10 }, { codigoCliente: 'B', percentual: 40, saldo: 5 }];
    expect(montarRelatorio(entrada({ linha: linha({ unidades: un }) })).rateio).toEqual([
      { codigoCliente: 'A', percentual: 60, saldoKwh: 10 }, { codigoCliente: 'B', percentual: 40, saldoKwh: 5 },
    ]);
  });

  it('desempenho = gerou / esperado', () => {
    expect(montarRelatorio(entrada()).desempenho).toEqual({ esperadoKwh: 640, percentual: 96, potenciaKwp: 5.5 });
    expect(montarRelatorio(entrada({ esperadoMesKwh: null, potenciaKwp: null })).desempenho)
      .toEqual({ esperadoKwh: null, percentual: null, potenciaKwp: null });
  });

  it('fontes citam de onde veio cada numero e a formula da economia', () => {
    const f = montarRelatorio(entrada()).fontes.join(' | ');
    expect(f).toMatch(/demonstrativo da concessionária.*e-mail.*assinatura conferida/);
    expect(f).toMatch(/Geração: monitoramento da usina/);
    expect(f).toMatch(/R\$ 0,99\/kWh/);
    const g = montarRelatorio(entrada({ origemGeracao: 'manual', linha: linha({ origem: 'pdf_manual', origem_verificada: false }) })).fontes.join(' | ');
    expect(g).toMatch(/PDF enviado/);
    expect(g).toMatch(/informada e conferida pela equipe/);
  });
});
