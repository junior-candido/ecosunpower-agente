import { describe, it, expect } from 'vitest';
import {
  alertaVencimento, compensadoDoMes, economiaEstimadaRs, montarItem, filtrarItens, TARIFA_PADRAO_RS_KWH,
  hojeBrasilia, historicoPorMes, assinarTextoConferencia, conferirAssinaturaTexto, emLotes,
} from '../src/modules/gd/demonstrativos-tela.js';
import type { LinhaDemonstrativo } from '../src/modules/gd/demonstrativos-tela-repo.js';
import type { ResultadoValidacao } from '../src/modules/gd/gd-validacao.js';

const linha = (over: Partial<LinhaDemonstrativo> = {}): LinhaDemonstrativo => ({
  id: 'x', lead_id: 'L1', cliente_nome: 'JOAO TESTE', codigo_cliente: '100001', instalacao: '200002',
  referencia: '2026-08-01', injetado_kwh: 222, consumo_kwh: 480, credito_utilizado_kwh: 210,
  credito_restante_kwh: null, saldo_acumulado_kwh: 1240, total_compensado_kwh: null, proximo_expirar_kwh: 654, ciclo_expirar: '2029-12-01',
  historico: [{ mes: '2026-08-01', consumida: 480, injetada: 222, faturada: 100, compensado: 380, credito: 0 }],
  unidades: [], inconsistencias: [], origem: 'email', origem_verificada: true,
  recebido_em: '2026-09-23T00:00:00Z', conferido_em: null, ...over,
});
const val = (over: Partial<ResultadoValidacao> = {}): ResultadoValidacao => ({
  estado: 'pronto', bloqueios: [], pendencias: [], avisos: [], geracaoKwh: 612,
  origemGeracao: 'api', esperadoMesKwh: 600, ...over,
});

describe('alertaVencimento', () => {
  it('avisa quando vence em ate 6 meses', () => {
    expect(alertaVencimento(654, '2026-12-01', '2026-09-23')).toMatch(/654.*dez\/2026/);
  });
  it('longe ou sem valor: nada', () => {
    expect(alertaVencimento(654, '2029-12-01', '2026-09-23')).toBeNull();
    expect(alertaVencimento(null, '2026-12-01', '2026-09-23')).toBeNull();
    expect(alertaVencimento(0, '2026-12-01', '2026-09-23')).toBeNull();
  });
  it('bordas: mesmo mes entra, mes passado sai, exatamente 6 meses ainda entra', () => {
    expect(alertaVencimento(100, '2026-09-01', '2026-09-23')).not.toBeNull();
    expect(alertaVencimento(100, '2026-08-01', '2026-09-23')).toBeNull();
    expect(alertaVencimento(100, '2027-03-01', '2026-09-23')).not.toBeNull();
  });
});

describe('compensado e economia', () => {
  it('compensado vem da linha do historico do proprio mes', () => {
    expect(compensadoDoMes(linha())).toBe(380);
    expect(compensadoDoMes(linha({ historico: [] }))).toBeNull();
  });
  it('compensado null/undefined ou nao finito vira null (nao 0)', () => {
    const hist = (compensado: unknown) => [{ mes: '2026-08-01', consumida: 480, injetada: 222, faturada: 100, compensado: compensado as number, credito: 0 }];
    expect(compensadoDoMes(linha({ historico: hist(null) }))).toBeNull();
    expect(compensadoDoMes(linha({ historico: hist(undefined) }))).toBeNull();
    expect(compensadoDoMes(linha({ historico: hist(NaN) }))).toBeNull();
    expect(compensadoDoMes(linha({ historico: hist(0) }))).toBe(0);
  });
  it('rateio: soma o compensado de todas as unidades do mes (nao pega so a primeira)', () => {
    const historico = [
      { mes: '2026-07-01', codigoCliente: 'A', consumida: 1, injetada: 1, faturada: 0, compensado: 999, credito: 0 },
      { mes: '2026-08-01', codigoCliente: 'A', consumida: 300, injetada: 222, faturada: 0, compensado: 200, credito: 0 },
      { mes: '2026-08-01', codigoCliente: 'B', consumida: 180, injetada: 0, faturada: 0, compensado: 150, credito: 0 },
    ];
    expect(compensadoDoMes(linha({ historico }))).toBe(350);
  });
  it('total_compensado_kwh (coluna do demonstrativo) tem prioridade', () => {
    expect(compensadoDoMes(linha({ total_compensado_kwh: 410 }))).toBe(410);
    expect(compensadoDoMes(linha({ total_compensado_kwh: 0, historico: [] }))).toBe(0);
  });
  it('economia estimada = compensado x tarifa', () => {
    expect(economiaEstimadaRs(380, TARIFA_PADRAO_RS_KWH)).toBe(Math.round(380 * TARIFA_PADRAO_RS_KWH * 100) / 100);
    expect(economiaEstimadaRs(null, 0.99)).toBeNull();
  });
});

describe('montarItem / filtrarItens', () => {
  it('leva estado, geracao e o primeiro motivo', () => {
    const it1 = montarItem(linha(), val({ estado: 'falta_dado', pendencias: ['falta a geração do mês'] , geracaoKwh: null }), '2026-09-23');
    expect(it1.estado).toBe('falta_dado');
    expect(it1.motivo).toMatch(/falta a geração/);
    expect(it1.geracaoKwh).toBeNull();
  });
  it('filtra por estado e por busca (nome ou UC)', () => {
    const itens = [
      montarItem(linha(), val(), '2026-09-23'),
      montarItem(linha({ cliente_nome: 'MARIA', instalacao: '999' }), val({ estado: 'inconsistente', bloqueios: ['x'] }), '2026-09-23'),
    ];
    expect(filtrarItens(itens, { estado: 'inconsistente' })).toHaveLength(1);
    expect(filtrarItens(itens, { q: 'joao' })).toHaveLength(1);
    expect(filtrarItens(itens, { q: '999' })).toHaveLength(1);
    expect(filtrarItens(itens, {})).toHaveLength(2);
  });
  it('busca ignora acento — "joão" bate com "JOAO" e vice-versa', () => {
    const comAcento = [montarItem(linha({ cliente_nome: 'João Teste' }), val(), '2026-09-23')];
    expect(filtrarItens(comAcento, { q: 'joao' })).toHaveLength(1);
    const semAcento = [montarItem(linha({ cliente_nome: 'JOAO TESTE' }), val(), '2026-09-23')];
    expect(filtrarItens(semAcento, { q: 'joão' })).toHaveLength(1);
  });
});

describe('hojeBrasilia', () => {
  it('21h-24h UTC do ultimo dia do mes ainda e o dia anterior em Brasilia (UTC-3)', () => {
    expect(hojeBrasilia(new Date('2026-09-30T02:00:00Z'))).toBe('2026-09-29');
  });
  it('meio-dia UTC e o mesmo dia em Brasilia', () => {
    expect(hojeBrasilia(new Date('2026-09-30T15:00:00Z'))).toBe('2026-09-30');
  });
});

describe('assinatura do texto da conferência (HMAC)', () => {
  const seg = 'segredo-de-teste';
  const a = assinarTextoConferencia(seg, 'C1', 'texto do pdf');
  it('valida o que foi assinado', () => {
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(conferirAssinaturaTexto(seg, 'C1', 'texto do pdf', a)).toBe(true);
  });
  it('recusa texto alterado', () => {
    expect(conferirAssinaturaTexto(seg, 'C1', 'texto do pdf!', a)).toBe(false);
  });
  it('recusa outra empresa', () => {
    expect(conferirAssinaturaTexto(seg, 'C2', 'texto do pdf', a)).toBe(false);
  });
  it('recusa outro segredo', () => {
    expect(conferirAssinaturaTexto('outro', 'C1', 'texto do pdf', a)).toBe(false);
  });
  it('recusa assinatura de tamanho errado ou vazia (sem lançar)', () => {
    expect(conferirAssinaturaTexto(seg, 'C1', 'texto do pdf', a.slice(0, -2))).toBe(false);
    expect(conferirAssinaturaTexto(seg, 'C1', 'texto do pdf', '')).toBe(false);
    expect(conferirAssinaturaTexto(seg, 'C1', 'texto do pdf', a + 'xx')).toBe(false);
  });
});

describe('emLotes', () => {
  it('processa em lotes de N e mantém a ordem', async () => {
    let ativos = 0; let pico = 0;
    const out = await emLotes([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      ativos++; pico = Math.max(pico, ativos);
      await new Promise((r) => setTimeout(r, (8 - n) * 2));
      ativos--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(pico).toBeLessThanOrEqual(3);
  });
  it('lista vazia', async () => {
    expect(await emLotes([], 10, async (n: number) => n)).toEqual([]);
  });
});

describe('historicoPorMes', () => {
  it('agrupa por mes somando as unidades, em ordem, no maximo 13 meses distintos', () => {
    const hist = Array.from({ length: 15 }, (_, i) => {
      const mes = new Date(Date.UTC(2025, 5 + i, 1)).toISOString().slice(0, 10);
      return [
        { mes, consumida: 100, injetada: 50, compensado: 40 },
        { mes, consumida: 10 + i, injetada: 0, compensado: 5 },
      ];
    }).flat().reverse();
    const g = historicoPorMes(hist);
    expect(g).toHaveLength(13);
    expect(new Set(g.map((m) => m.mes)).size).toBe(13);
    expect(g[12]).toEqual({ mes: '2026-08-01', consumida: 124, injetada: 50, compensado: 45, unidades: 2 });
    expect(g[0].mes < g[1].mes).toBe(true);
  });
  it('campo sem numero em todas as unidades vira null; numero parcial soma o que tem', () => {
    const g = historicoPorMes([
      { mes: '2026-08-01', consumida: null, injetada: 10, compensado: 'x' },
      { mes: '2026-08-01', consumida: undefined, injetada: null, compensado: 5 },
    ]);
    expect(g).toEqual([{ mes: '2026-08-01', consumida: null, injetada: 10, compensado: 5, unidades: 2 }]);
  });
  it('historico vazio devolve lista vazia', () => {
    expect(historicoPorMes([])).toEqual([]);
  });
});
