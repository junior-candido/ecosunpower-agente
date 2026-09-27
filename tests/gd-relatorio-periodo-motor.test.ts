import { describe, it, expect } from 'vitest';
import {
  montarRelatorioPeriodo, periodoExtenso, mesesDoPeriodo, erroDoPeriodo, faltaNoPeriodo, numerosDoRelatorioPeriodo,
  type EntradaRelatorioPeriodo, type MesEntradaPeriodo,
} from '../src/modules/gd/relatorio-periodo-motor.js';
import type { LinhaDemonstrativo } from '../src/modules/gd/demonstrativos-tela-repo.js';

type H = LinhaDemonstrativo['historico'][number];

/** Histórico com 3 unidades do rateio (A geradora, B e C beneficiárias) de mar a ago/2026. */
function historicoRateio(): H[] {
  const out: H[] = [];
  const meses = ['2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01'];
  meses.forEach((mes, i) => {
    out.push({ mes, codigoCliente: 'A', consumida: 300 + i, injetada: 400, faturada: 0, compensado: 200, credito: 0 });
    out.push({ mes, codigoCliente: 'B', consumida: 150, injetada: 0, faturada: 0, compensado: 100 + i, credito: 0 });
    out.push({ mes, codigoCliente: 'C', consumida: 100, injetada: 0, faturada: 0, compensado: 50, credito: 0 });
  });
  return out;
}

const UNIDADES = [
  { codigoCliente: 'A', percentual: 50, saldo: 800 },
  { codigoCliente: 'B', percentual: 30, saldo: 300 },
  { codigoCliente: 'C', percentual: 20, saldo: 140 },
];

const linha = (referencia: string, over: Partial<LinhaDemonstrativo> = {}): LinhaDemonstrativo => ({
  id: `D-${referencia}`, lead_id: 'L1', cliente_nome: 'JOAO TESTE', codigo_cliente: 'A', instalacao: '351534',
  referencia, injetado_kwh: 400, consumo_kwh: 300, credito_utilizado_kwh: 200,
  credito_restante_kwh: 100, saldo_acumulado_kwh: 1240, total_compensado_kwh: 99999, proximo_expirar_kwh: 50, ciclo_expirar: '2027-01-01',
  historico: historicoRateio(), unidades: UNIDADES, inconsistencias: [], origem: 'email', origem_verificada: true,
  recebido_em: '2026-09-02T10:00:00Z', conferido_em: null, ...over,
});

const mesEntrada = (referencia: string, geracaoKwh: number, over: Partial<MesEntradaPeriodo> = {}): MesEntradaPeriodo => ({
  linha: linha(referencia), geracaoKwh, origemGeracao: 'api', esperadoMesKwh: 600, ...over,
});

const entrada = (over: Partial<EntradaRelatorioPeriodo> = {}): EntradaRelatorioPeriodo => ({
  inicio: '2026-05-01', fim: '2026-08-01',
  meses: [
    mesEntrada('2026-05-01', 580), mesEntrada('2026-06-01', 540), mesEntrada('2026-07-01', 560), mesEntrada('2026-08-01', 620),
  ],
  geracaoPorMes: { '2026-04-01': 590, '2026-05-01': 580, '2026-06-01': 540, '2026-07-01': 560, '2026-08-01': 620 },
  potenciaKwp: 5.5, tarifaRsKwh: 1, ...over,
});

describe('periodoExtenso', () => {
  it('mesmo ano: "maio a agosto de 2026"', () => {
    expect(periodoExtenso('2026-05-01', '2026-08-01')).toBe('maio a agosto de 2026');
  });
  it('virando o ano: "novembro de 2025 a fevereiro de 2026"', () => {
    expect(periodoExtenso('2025-11-01', '2026-02-01')).toBe('novembro de 2025 a fevereiro de 2026');
  });
  it('um mês só: igual ao mesExtenso', () => {
    expect(periodoExtenso('2026-08-01', '2026-08-01')).toBe('agosto de 2026');
  });
});

describe('mesesDoPeriodo / erroDoPeriodo', () => {
  it('lista os meses do período em ordem, atravessando o ano', () => {
    expect(mesesDoPeriodo('2025-11-01', '2026-02-01')).toEqual(['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01']);
    expect(mesesDoPeriodo('2026-08-01', '2026-08-01')).toEqual(['2026-08-01']);
  });
  it('período válido → null', () => {
    expect(erroDoPeriodo('2026-05-01', '2026-08-01')).toBeNull();
    expect(erroDoPeriodo('2025-09-01', '2026-08-01')).toBeNull(); // 12 meses
  });
  it('recusa formato errado, início depois do fim e mais de 12 meses', () => {
    expect(erroDoPeriodo('2026-5-01', '2026-08-01')).toMatch(/inválid/);
    expect(erroDoPeriodo('2026-05-15', '2026-08-01')).toMatch(/inválid/);
    expect(erroDoPeriodo('2026-09-01', '2026-08-01')).toMatch(/depois/);
    expect(erroDoPeriodo('2025-08-01', '2026-08-01')).toMatch(/12 meses/);
  });
});

describe('montarRelatorioPeriodo', () => {
  it('soma geração, consumo, compensado e economia dos meses (rateio: todas as unidades)', () => {
    const r = montarRelatorioPeriodo(entrada());
    expect(r.periodoExtenso).toBe('maio a agosto de 2026');
    expect(r.inicio).toBe('2026-05-01');
    expect(r.fim).toBe('2026-08-01');
    expect(r.meses.map((m) => m.mes)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01']);
    // maio: consumo 302+150+100 = 552; compensado 200+102+50 = 352
    expect(r.meses[0]).toMatchObject({ gerouKwh: 580, consumoKwh: 552, compensadoKwh: 352, economiaRs: 352, injetadoKwh: 400, rotulo: 'mai/2026' });
    expect(r.totais.gerouKwh).toBe(2300);
    expect(r.totais.consumoKwh).toBe(552 + 553 + 554 + 555);
    expect(r.totais.compensadoKwh).toBe(352 + 353 + 354 + 355);
    expect(r.totais.economiaRs).toBe(1414);
    expect(r.totais.injetadoKwh).toBe(1600);
  });

  it('NUNCA usa total_compensado_kwh (acumulado de 13 meses)', () => {
    const r = montarRelatorioPeriodo(entrada());
    expect(r.totais.compensadoKwh).not.toBe(99999 * 4);
    expect(JSON.stringify(r)).not.toContain('99999');
  });

  it('mês sem consumo → total nulo e o motivo diz qual mês (nunca vira 0)', () => {
    const semHistorico = linha('2026-06-01', { historico: [], unidades: [], consumo_kwh: null, credito_utilizado_kwh: 200 });
    const r = montarRelatorioPeriodo(entrada({
      meses: [mesEntrada('2026-05-01', 580), { ...mesEntrada('2026-06-01', 540), linha: semHistorico },
        mesEntrada('2026-07-01', 560), mesEntrada('2026-08-01', 620)],
    }));
    expect(r.meses[1].consumoKwh).toBeNull();
    expect(r.totais.consumoKwh).toBeNull();
    expect(faltaNoPeriodo(r)).toBe('falta o consumo de junho de 2026');
  });

  it('mês sem compensado → economia total nula e bloqueia', () => {
    const semComp = linha('2026-07-01', { historico: [], unidades: [], consumo_kwh: 300, credito_utilizado_kwh: null });
    const r = montarRelatorioPeriodo(entrada({
      meses: [mesEntrada('2026-05-01', 580), mesEntrada('2026-06-01', 540),
        { ...mesEntrada('2026-07-01', 560), linha: semComp }, mesEntrada('2026-08-01', 620)],
    }));
    expect(r.totais.compensadoKwh).toBeNull();
    expect(r.totais.economiaRs).toBeNull();
    expect(faltaNoPeriodo(r)).toBe('faltam os créditos compensados de julho de 2026');
  });

  it('tudo completo → faltaNoPeriodo null', () => {
    expect(faltaNoPeriodo(montarRelatorioPeriodo(entrada()))).toBeNull();
  });

  it('demonstrativo digitado (sem histórico) usa os créditos usados no mês, como o mensal', () => {
    const dig = linha('2026-08-01', { historico: [], unidades: [], consumo_kwh: 310, credito_utilizado_kwh: 210, origem: 'digitado' });
    const r = montarRelatorioPeriodo(entrada({ inicio: '2026-08-01', meses: [{ ...mesEntrada('2026-08-01', 620), linha: dig }] }));
    expect(r.totais.consumoKwh).toBe(310);
    expect(r.totais.compensadoKwh).toBe(210);
    expect(r.periodoExtenso).toBe('agosto de 2026');
  });

  it('créditos = do ÚLTIMO mês, aviso de vencimento relativo ao fim do período', () => {
    const ult = linha('2026-08-01', { saldo_acumulado_kwh: 1500, proximo_expirar_kwh: 70, ciclo_expirar: '2026-12-01' });
    const r = montarRelatorioPeriodo(entrada({
      meses: [mesEntrada('2026-05-01', 580), mesEntrada('2026-06-01', 540), mesEntrada('2026-07-01', 560),
        { ...mesEntrada('2026-08-01', 620), linha: ult }],
    }));
    expect(r.creditos).toEqual({
      saldoKwh: 1500, usadosNoPeriodoKwh: 1414, aVencerKwh: 70, venceEm: 'dez/2026', avisoVencimento: 'alerta',
    });
    expect(r.creditosHojeKwh).toBe(1500);
  });

  it('desempenho do período = soma gerou / soma esperado', () => {
    const r = montarRelatorioPeriodo(entrada());
    expect(r.desempenho).toEqual({ esperadoKwh: 2400, percentual: 96, potenciaKwp: 5.5 });
  });

  it('desempenho sem esperado em algum mês → percentual nulo', () => {
    const r = montarRelatorioPeriodo(entrada({
      meses: [mesEntrada('2026-05-01', 580, { esperadoMesKwh: null }), mesEntrada('2026-06-01', 540)],
      fim: '2026-06-01',
    }));
    expect(r.desempenho.percentual).toBeNull();
    expect(r.desempenho.esperadoKwh).toBeNull();
  });

  it('rateio: soma consumo e compensado de cada unidade no período + saldo atual (do último mês)', () => {
    const r = montarRelatorioPeriodo(entrada());
    expect(r.rateio).toEqual([
      { codigoCliente: 'A', percentual: 50, consumoKwh: 302 + 303 + 304 + 305, compensadoKwh: 800, saldoKwh: 800 },
      { codigoCliente: 'B', percentual: 30, consumoKwh: 600, compensadoKwh: 102 + 103 + 104 + 105, saldoKwh: 300 },
      { codigoCliente: 'C', percentual: 20, consumoKwh: 400, compensadoKwh: 200, saldoKwh: 140 },
    ]);
  });

  it('rateio: linha repetida da mesma unidade no mês (reenvio) não soma 2x', () => {
    const hist = historicoRateio();
    hist.push({ mes: '2026-08-01', codigoCliente: 'B', consumida: 150, injetada: 0, faturada: 0, compensado: 105, credito: 0 });
    const l = linha('2026-08-01', { historico: hist });
    const r = montarRelatorioPeriodo(entrada({ inicio: '2026-08-01', meses: [{ ...mesEntrada('2026-08-01', 620), linha: l }] }));
    expect(r.rateio.find((u) => u.codigoCliente === 'B')!.compensadoKwh).toBe(105);
    expect(r.meses[0].compensadoKwh).toBe(355);
  });

  it('sem rateio (uma unidade) → sem seção de unidades', () => {
    const hist: H[] = [
      { mes: '2026-07-01', consumida: 480, injetada: 200, faturada: 0, compensado: 380, credito: 0 },
      { mes: '2026-08-01', consumida: 470, injetada: 222, faturada: 0, compensado: 370, credito: 0 },
    ];
    const r = montarRelatorioPeriodo(entrada({
      inicio: '2026-07-01',
      meses: [
        // Sem rateio o consumo é o consumo_kwh da própria linha (mesma regra do mensal).
        { ...mesEntrada('2026-07-01', 560), linha: linha('2026-07-01', { historico: hist, unidades: [], consumo_kwh: 480 }) },
        { ...mesEntrada('2026-08-01', 620), linha: linha('2026-08-01', { historico: hist, unidades: [], consumo_kwh: 470 }) },
      ],
    }));
    expect(r.rateio).toEqual([]);
    expect(r.totais.consumoKwh).toBe(950);
    expect(r.totais.compensadoKwh).toBe(750);
  });

  it('frase resumo do período', () => {
    const r = montarRelatorioPeriodo(entrada());
    expect(r.frase).toBe(
      'De maio a agosto de 2026 sua usina gerou 2.300 kWh. Nesse período, 1.414 kWh de créditos abateram as contas, uma economia estimada de R$ 1.414,00.',
    );
  });

  it('gráfico: últimos 13 meses até o fim, com os meses do período marcados', () => {
    const r = montarRelatorioPeriodo(entrada());
    expect(r.grafico.map((m) => m.mes)).toEqual(['2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01']);
    expect(r.grafico.map((m) => m.noPeriodo)).toEqual([false, false, true, true, true, true]);
    expect(r.grafico[1]).toMatchObject({ geracao: 590, consumo: 551, rotulo: 'abr/2026' });
    expect(r.grafico[0].geracao).toBeNull();
  });

  it('fontes explicam a origem e a soma do rateio', () => {
    const r = montarRelatorioPeriodo(entrada());
    expect(r.fontes.join(' ')).toMatch(/demonstrativos da concessionária/);
    expect(r.fontes.join(' ')).toMatch(/soma das 3 unidades do rateio/);
    expect(r.fontes.join(' ')).toMatch(/monitoramento/);
  });

  it('recusa período inválido e meses que não batem com o período', () => {
    expect(() => montarRelatorioPeriodo(entrada({ inicio: '2026-09-01' }))).toThrow(/depois/);
    expect(() => montarRelatorioPeriodo(entrada({ meses: entrada().meses.slice(1) }))).toThrow(/meses/);
  });

  it('numerosDoRelatorioPeriodo grava os totais e o período', () => {
    const n = numerosDoRelatorioPeriodo(montarRelatorioPeriodo(entrada()));
    expect(n).toMatchObject({
      periodo: { inicio: '2026-05-01', fim: '2026-08-01' },
      gerouKwh: 2300, consumoKwh: 2214, compensadoKwh: 1414, economiaRs: 1414, creditosKwh: 1240, tarifaRsKwh: 1,
    });
  });
});
