import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDemonstrativo, type DemonstrativoGd } from '../src/modules/gd/demonstrativo-parser.js';
import { cruzarDemonstrativo, montarResumoWhats } from '../src/modules/gd/demonstrativo-cruzamento.js';

const REAL = readFileSync(join(__dirname, 'fixtures', 'gd', 'cliente-unico-2026-06.txt'), 'utf-8');
function base(): DemonstrativoGd {
  const r = parseDemonstrativo(REAL);
  if (!r.ok) throw new Error(r.motivo);
  return r.dados;
}

describe('cruzarDemonstrativo — geracao x injetado', () => {
  it('calcula o autoconsumo quando ha monitoramento (informativo)', () => {
    const a = cruzarDemonstrativo({ dados: base(), geracaoMesKwh: 1000, rateioCadastrado: [], inconsistencias: [] });
    const auto = a.find((x) => x.tipo === 'autoconsumo');
    expect(auto?.gravidade).toBe('info');
    // gerou 1000, injetou 687 → consumiu na hora 313 (31%)
    expect(auto?.texto).toContain('313');
    expect(auto?.texto).toContain('31%');
  });

  it('alerta quando a geracao do monitoramento e menor que o injetado medido', () => {
    const a = cruzarDemonstrativo({ dados: base(), geracaoMesKwh: 500, rateioCadastrado: [], inconsistencias: [] });
    const g = a.find((x) => x.tipo === 'geracao_nao_fecha');
    expect(g?.gravidade).toBe('atencao');
    expect(a.some((x) => x.tipo === 'autoconsumo')).toBe(false);
  });

  it('sem monitoramento nao inventa nada sobre geracao', () => {
    const a = cruzarDemonstrativo({ dados: base(), geracaoMesKwh: null, rateioCadastrado: [], inconsistencias: [] });
    expect(a.some((x) => x.tipo === 'autoconsumo' || x.tipo === 'geracao_nao_fecha')).toBe(false);
  });
});

describe('cruzarDemonstrativo — creditos a vencer', () => {
  it('alerta quando o proximo vencimento cai em ate 6 meses da referencia', () => {
    const d = { ...base(), cicloExpirar: '2026-10-01', proximoExpirarKwh: 654 };
    const a = cruzarDemonstrativo({ dados: d, geracaoMesKwh: null, rateioCadastrado: [], inconsistencias: [] });
    const c = a.find((x) => x.tipo === 'creditos_a_vencer');
    expect(c?.gravidade).toBe('atencao');
    expect(c?.texto).toContain('654');
  });
  it('vencimento distante (dez/2029) nao gera alerta', () => {
    const a = cruzarDemonstrativo({ dados: base(), geracaoMesKwh: null, rateioCadastrado: [], inconsistencias: [] });
    expect(a.some((x) => x.tipo === 'creditos_a_vencer')).toBe(false);
  });
  it('nada a expirar nao gera alerta', () => {
    const d = { ...base(), cicloExpirar: null, proximoExpirarKwh: 0 };
    const a = cruzarDemonstrativo({ dados: d, geracaoMesKwh: null, rateioCadastrado: [], inconsistencias: [] });
    expect(a.some((x) => x.tipo === 'creditos_a_vencer')).toBe(false);
  });
});

describe('cruzarDemonstrativo — rateio', () => {
  const comRateio = (): DemonstrativoGd => ({
    ...base(),
    unidades: [
      { codigoCliente: '100001', percentual: 60, saldo: 6599.2 },
      { codigoCliente: '300003', percentual: 40, saldo: 4399.47 },
    ],
  });

  it('rateio igual ao cadastro: sem alerta', () => {
    const a = cruzarDemonstrativo({
      dados: comRateio(), geracaoMesKwh: null, inconsistencias: [],
      rateioCadastrado: [{ uc: '300003', nome: 'Mae', percentual: 40 }],
    });
    expect(a.some((x) => x.tipo === 'rateio_divergente')).toBe(false);
  });

  it('percentual diferente do cadastro: alerta', () => {
    const a = cruzarDemonstrativo({
      dados: comRateio(), geracaoMesKwh: null, inconsistencias: [],
      rateioCadastrado: [{ uc: '300003', nome: 'Mae', percentual: 50 }],
    });
    const r = a.find((x) => x.tipo === 'rateio_divergente');
    expect(r?.gravidade).toBe('atencao');
    expect(r?.texto).toContain('Mae');
    expect(r?.texto).toContain('40');
    expect(r?.texto).toContain('50');
  });

  it('beneficiaria que nao aparece (ficha pode ter a instalacao): informa, sem acusar erro', () => {
    const a = cruzarDemonstrativo({
      dados: comRateio(), geracaoMesKwh: null, inconsistencias: [],
      rateioCadastrado: [{ uc: '999999', nome: 'Filha', percentual: 20 }],
    });
    const r = a.find((x) => x.tipo === 'rateio_divergente');
    expect(r?.gravidade).toBe('info');
    expect(r?.texto).toContain('Filha');
    expect(r?.texto).toMatch(/não consegui conferir/i);
    expect(r?.texto).toContain('300003');
  });

  it('beneficiaria sem percentual cadastrado nao gera alerta de diferenca', () => {
    const a = cruzarDemonstrativo({
      dados: comRateio(), geracaoMesKwh: null, inconsistencias: [],
      rateioCadastrado: [{ uc: '300003', nome: 'Mae', percentual: null }],
    });
    expect(a.some((x) => x.tipo === 'rateio_divergente')).toBe(false);
  });
});

describe('cruzarDemonstrativo — inconsistencias do documento', () => {
  it('cada inconsistencia do leitor vira alerta de atencao', () => {
    const a = cruzarDemonstrativo({
      dados: base(), geracaoMesKwh: null, rateioCadastrado: [],
      inconsistencias: ['percentuais do rateio somam 90%, nao 100%'],
    });
    const i = a.find((x) => x.tipo === 'documento_inconsistente');
    expect(i?.texto).toContain('90%');
  });
});

describe('montarResumoWhats', () => {
  it('resume mes, numeros e alertas em texto curto', () => {
    const d = base();
    const alertas = cruzarDemonstrativo({ dados: { ...d, cicloExpirar: '2026-09-01' }, geracaoMesKwh: 900, rateioCadastrado: [], inconsistencias: [] });
    const t = montarResumoWhats({ dados: d, alertas, nomeCliente: 'Cliente Teste', modoTeste: true });
    expect(t).toContain('Cliente Teste');
    expect(t).toContain('jun/2026');
    expect(t).toContain('687');       // injetado
    expect(t).toContain('10.998,67'); // saldo
    expect(t).toContain('⚠️');
    expect(t).toMatch(/teste/i);
  });
  it('sem alerta diz que esta tudo certo', () => {
    const d = base();
    const t = montarResumoWhats({ dados: d, alertas: [], nomeCliente: null, modoTeste: false });
    expect(t).toContain('CLIENTE TESTE UM');
    expect(t).toMatch(/nada fora do normal/i);
  });
});
