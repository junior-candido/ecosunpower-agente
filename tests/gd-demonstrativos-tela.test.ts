import { describe, it, expect } from 'vitest';
import {
  alertaVencimento, compensadoDoMes, economiaEstimadaRs, montarItem, filtrarItens, TARIFA_PADRAO_RS_KWH,
} from '../src/modules/gd/demonstrativos-tela.js';
import type { LinhaDemonstrativo } from '../src/modules/gd/demonstrativos-tela-repo.js';
import type { ResultadoValidacao } from '../src/modules/gd/gd-validacao.js';

const linha = (over: Partial<LinhaDemonstrativo> = {}): LinhaDemonstrativo => ({
  id: 'x', lead_id: 'L1', cliente_nome: 'JOAO TESTE', codigo_cliente: '100001', instalacao: '200002',
  referencia: '2026-08-01', injetado_kwh: 222, consumo_kwh: 480, credito_utilizado_kwh: 210,
  credito_restante_kwh: null, saldo_acumulado_kwh: 1240, proximo_expirar_kwh: 654, ciclo_expirar: '2029-12-01',
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
});

describe('compensado e economia', () => {
  it('compensado vem da linha do historico do proprio mes', () => {
    expect(compensadoDoMes(linha())).toBe(380);
    expect(compensadoDoMes(linha({ historico: [] }))).toBeNull();
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
});
