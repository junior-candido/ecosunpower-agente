import { describe, it, expect } from 'vitest';
import { montarRelatorio, mesExtenso, type EntradaRelatorio } from '../src/modules/gd/relatorio-motor.js';
import type { LinhaDemonstrativo } from '../src/modules/gd/demonstrativos-tela-repo.js';

const linha = (over: Partial<LinhaDemonstrativo> = {}): LinhaDemonstrativo => ({
  id: 'D1', lead_id: 'L1', cliente_nome: 'JOAO TESTE', codigo_cliente: '2870620', instalacao: '351534',
  referencia: '2026-08-01', injetado_kwh: 222, consumo_kwh: 480, credito_utilizado_kwh: 380,
  credito_restante_kwh: 100, saldo_acumulado_kwh: 1240, total_compensado_kwh: null, proximo_expirar_kwh: 50, ciclo_expirar: '2027-03-01',
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
    const r = montarRelatorio(entrada({ linha: linha({ injetado_kwh: null, historico: [], credito_utilizado_kwh: null }) }));
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

  it('fontes explicam o esperado quando ha esperado', () => {
    expect(montarRelatorio(entrada()).fontes.join(' | '))
      .toContain('Esperado = potência da usina × média de sol da região × dias do mês.');
    expect(montarRelatorio(entrada({ esperadoMesKwh: null })).fontes.join(' | ')).not.toMatch(/Esperado =/);
  });

  it('injetado maior que a geracao: autoconsumo null e a frase nao fala em "direto do sol"', () => {
    const r = montarRelatorio(entrada({ geracaoKwh: 200 }));
    expect(r.autoconsumoKwh).toBeNull();
    expect(r.frase).not.toMatch(/direto do sol/);
    expect(r.frase).toBe('Em agosto de 2026 sua usina gerou 200 kWh. Neste mês, 380 kWh de créditos abateram a sua conta.');
  });

  it('recusa referencia fora do formato e geracao invalida', () => {
    expect(() => montarRelatorio(entrada({ linha: linha({ referencia: '2026-08' }) }))).toThrow(Error);
    expect(() => montarRelatorio(entrada({ linha: linha({ referencia: '2026-08-15' }) }))).toThrow(Error);
    expect(() => montarRelatorio(entrada({ geracaoKwh: NaN }))).toThrow(Error);
    expect(() => montarRelatorio(entrada({ geracaoKwh: Infinity }))).toThrow(Error);
    expect(() => montarRelatorio(entrada({ geracaoKwh: -1 }))).toThrow(Error);
    expect(() => montarRelatorio(entrada({ geracaoKwh: 0 }))).not.toThrow();
  });

  it('grafico usa null (nao 0) quando falta numero no historico', () => {
    const hist = [{ mes: '2026-08-01', consumida: null as unknown as number, injetada: 222, faturada: 0, compensado: 'x' as unknown as number, credito: 0 }];
    const r = montarRelatorio(entrada({ linha: linha({ historico: hist }) }));
    expect(r.meses[0]).toMatchObject({ consumo: null, injetado: 222, compensado: null });
  });

  it('total_compensado_kwh do demonstrativo tem prioridade sobre o historico', () => {
    const r = montarRelatorio(entrada({ linha: linha({ total_compensado_kwh: 500 }) }));
    expect(r.compensadoKwh).toBe(500);
    expect(r.economiaRs).toBe(495);
  });
});

describe('montarRelatorio — rateio (uma linha por unidade por mes)', () => {
  const unidades = [{ codigoCliente: 'G1', percentual: 60, saldo: 800 }, { codigoCliente: 'B2', percentual: 40, saldo: 440 }];
  const doisPorMes = (n: number) => Array.from({ length: n }, (_, i) => {
    const mes = new Date(Date.UTC(2025, 8 + i, 1)).toISOString().slice(0, 10); // 2025-09 .. 2026-08 com n=12
    return [
      { mes, codigoCliente: 'G1', consumida: 300, injetada: 222, faturada: 0, compensado: 200, credito: 0 },
      { mes, codigoCliente: 'B2', consumida: 180 + i, injetada: 0, faturada: 0, compensado: 150, credito: 0 },
    ];
  }).flat();

  it('compensado e consumo do mes = soma das unidades; fontes avisam a soma', () => {
    const r = montarRelatorio(entrada({ linha: linha({ unidades, historico: doisPorMes(12), consumo_kwh: 300 }) }));
    expect(r.compensadoKwh).toBe(350);
    expect(r.economiaRs).toBe(346.5);
    expect(r.consumiuKwh).toBe(300 + 180 + 11);
    expect(r.frase).toMatch(/350 kWh de créditos abateram/);
    expect(r.fontes.join(' | ')).toContain('Consumo e créditos: soma das 2 unidades do rateio.');
  });

  it('creditos.usadosNoMesKwh da pagina 2 bate com o compensado da pagina 1, nao com credito_utilizado_kwh da UC geradora', () => {
    // credito_utilizado_kwh (default da fixture) fica em 380 — só da unidade geradora.
    // Com rateio, o total do mês (soma das 2 unidades) é 350: as duas páginas têm que concordar em 350.
    const r = montarRelatorio(entrada({ linha: linha({ unidades, historico: doisPorMes(12), consumo_kwh: 300 }) }));
    expect(r.creditos.usadosNoMesKwh).toBe(350);
    expect(r.creditos.usadosNoMesKwh).toBe(r.compensadoKwh);
    expect(r.creditos.usadosNoMesKwh).not.toBe(linha().credito_utilizado_kwh);
  });

  it('grafico: 13 meses DISTINTOS com os valores somados', () => {
    const r = montarRelatorio(entrada({ linha: linha({ unidades, historico: doisPorMes(15) }), geracaoPorMes: {} }));
    expect(r.meses).toHaveLength(13);
    expect(new Set(r.meses.map((m) => m.mes)).size).toBe(13);
    const ultimo = r.meses[12];
    expect(ultimo.mes).toBe('2026-11-01');
    expect(ultimo.consumo).toBe(300 + 180 + 14);
    expect(ultimo.injetado).toBe(222);
    expect(ultimo.compensado).toBe(350);
  });

  it('uma unidade so: consumo continua sendo o consumo_kwh e nao aparece a linha de soma', () => {
    const r = montarRelatorio(entrada());
    expect(r.consumiuKwh).toBe(480);
    expect(r.fontes.join(' | ')).not.toMatch(/soma das/);
  });
});

describe('montarRelatorio — demonstrativo digitado (sem historico)', () => {
  it('economia usa os creditos usados no mes e a fonte diz isso', () => {
    const r = montarRelatorio(entrada({ linha: linha({ origem: 'digitado', historico: [], credito_utilizado_kwh: 300 }) }));
    expect(r.compensadoKwh).toBe(300);
    expect(r.economiaRs).toBe(297);
    expect(r.meses).toEqual([]);
    expect(r.fontes.join(' | ')).toContain('créditos usados no mês, digitados a partir do demonstrativo');
  });
  it('sem creditos usados tambem: economia null', () => {
    const r = montarRelatorio(entrada({ linha: linha({ origem: 'digitado', historico: [], credito_utilizado_kwh: null }) }));
    expect(r.economiaRs).toBeNull();
  });
});
