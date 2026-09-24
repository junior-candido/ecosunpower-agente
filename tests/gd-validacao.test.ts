import { describe, it, expect } from 'vitest';
import { validarMes, esperadoMes, diasNoMes, type EntradaValidacao } from '../src/modules/gd/gd-validacao.js';

// 5 kWp no DF: esperadoDiaKwh = 5 × HSP_DF × 0,8. Os testes usam esperadoMes()
// pra não depender do valor da tabela de HSP.
const base: EntradaValidacao = {
  leadId: 'L1',
  referencia: '2026-08-01',
  injetadoKwh: 200,
  inconsistenciasLeitura: [],
  geracaoManualKwh: null,
  geracaoApiKwh: null,
  potenciaKwp: 5,
  uf: 'DF',
};
const plausivel = () => Math.round(esperadoMes(5, 'DF', '2026-08-01')!);

describe('diasNoMes / esperadoMes', () => {
  it('conta os dias do mês', () => {
    expect(diasNoMes('2026-02-01')).toBe(28);
    expect(diasNoMes('2026-08-01')).toBe(31);
  });
  it('sem kWp não há esperado', () => {
    expect(esperadoMes(null, 'DF', '2026-08-01')).toBeNull();
    expect(esperadoMes(0, 'DF', '2026-08-01')).toBeNull();
  });
});

describe('validarMes', () => {
  it('tudo certo com geração da API → pronto', () => {
    const r = validarMes({ ...base, geracaoApiKwh: plausivel() });
    expect(r.estado).toBe('pronto');
    expect(r.origemGeracao).toBe('api');
    expect(r.bloqueios).toEqual([]);
  });

  it('sem geração → falta_dado', () => {
    const r = validarMes(base);
    expect(r.estado).toBe('falta_dado');
    expect(r.pendencias.join(' ')).toMatch(/falta a geração/);
  });

  it('sem cliente ligado → sem_cliente', () => {
    const r = validarMes({ ...base, leadId: null, geracaoManualKwh: plausivel() });
    expect(r.estado).toBe('sem_cliente');
  });

  it('geração menor que o injetado → inconsistente', () => {
    const r = validarMes({ ...base, injetadoKwh: 900, geracaoManualKwh: 500, potenciaKwp: null });
    expect(r.estado).toBe('inconsistente');
    expect(r.bloqueios[0]).toMatch(/menor que o injetado/);
  });

  it('geração muito acima do esperado (vírgula lida errado) → inconsistente', () => {
    const r = validarMes({ ...base, geracaoManualKwh: plausivel() * 10 });
    expect(r.estado).toBe('inconsistente');
    expect(r.bloqueios.join(' ')).toMatch(/fora do esperado/);
  });

  it('sem kWp: não bloqueia, só avisa', () => {
    const r = validarMes({ ...base, potenciaKwp: null, geracaoManualKwh: 700 });
    expect(r.estado).toBe('pronto');
    expect(r.avisos.join(' ')).toMatch(/sem kWp/);
  });

  it('manual e API diferentes em mais de 3% → inconsistente; manual tem precedência', () => {
    const p = plausivel();
    const r = validarMes({ ...base, geracaoManualKwh: p, geracaoApiKwh: p * 0.9 });
    expect(r.estado).toBe('inconsistente');
    expect(r.origemGeracao).toBe('manual');
    expect(r.geracaoKwh).toBe(p);
    expect(r.bloqueios.join(' ')).toMatch(/difere/);
  });

  it('manual e API iguais dentro de 3% → pronto', () => {
    const p = plausivel();
    expect(validarMes({ ...base, geracaoManualKwh: p, geracaoApiKwh: p * 1.01 }).estado).toBe('pronto');
  });

  it('inconsistência de leitura do PDF bloqueia; "remetente não verificado" só avisa', () => {
    const p = plausivel();
    const a = validarMes({ ...base, geracaoApiKwh: p, inconsistenciasLeitura: ['saldo acumulado não fecha'] });
    expect(a.estado).toBe('inconsistente');
    const b = validarMes({
      ...base, geracaoApiKwh: p,
      inconsistenciasLeitura: ['remetente não verificado (sem assinatura DKIM da Neoenergia que confira)'],
    });
    expect(b.estado).toBe('pronto');
    expect(b.avisos.join(' ')).toMatch(/remetente não verificado/);
  });

  it('bloqueio vence sem_cliente e falta_dado', () => {
    const r = validarMes({ ...base, leadId: null, inconsistenciasLeitura: ['x'] });
    expect(r.estado).toBe('inconsistente');
  });
});
