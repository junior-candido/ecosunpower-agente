// tests/monitoramento-classificacao.test.ts
import { describe, it, expect } from 'vitest';
import { classificarSistema, esperadoDiaKwh } from '../src/modules/monitoring/classificacao.js';

describe('esperadoDiaKwh', () => {
  it('usa HSP 5.3 em GO e 5.2 fora, fator 0.80', () => {
    expect(esperadoDiaKwh(10, 'GO')).toBeCloseTo(10 * 5.3 * 0.8);
    expect(esperadoDiaKwh(10, 'DF')).toBeCloseTo(10 * 5.2 * 0.8);
    expect(esperadoDiaKwh(null, 'GO')).toBe(0);
  });
});

describe('classificarSistema', () => {
  const base = { ativo: true, ultimoErro: null, potenciaKwp: 10, uf: 'DF' as string | null };

  it('inativo -> ok, sem alerta (não polui radar)', () => {
    const r = classificarSistema({ ...base, ativo: false, diasSemGeracao: 30, realUltimos7: 0 });
    expect(r.nivel).toBe('ok');
    expect(r.alerta).toBeNull();
  });

  it('offline >=3 dias -> urgente com texto exato (zero-regressão)', () => {
    const r = classificarSistema({ ...base, diasSemGeracao: 5, realUltimos7: 0 });
    expect(r.nivel).toBe('urgente');
    expect(r.alerta).toEqual({
      tipo: 'sistema_offline', severidade: 'urgente',
      texto: 'Sem geração há 5 dias. Verificar inversor / conexão WiFi.',
    });
  });

  it('ultimo_erro setado -> urgente', () => {
    const r = classificarSistema({ ...base, ultimoErro: 'Deye 403', diasSemGeracao: 0, realUltimos7: 50 });
    expect(r.nivel).toBe('urgente');
    expect(r.alerta?.tipo).toBe('erro_integracao');
  });

  it('geração 7d <70% do esperado -> aviso (texto exato)', () => {
    const r = classificarSistema({ ...base, diasSemGeracao: 0, realUltimos7: 145.6 });
    expect(r.nivel).toBe('aviso');
    expect(r.alerta).toEqual({
      tipo: 'queda_geracao', severidade: 'aviso',
      texto: 'Geração últimos 7 dias 50% ABAIXO do esperado. Pode ser sujeira/sombreamento — agendar limpeza.',
    });
  });

  it('geração 7d >110% -> info', () => {
    const r = classificarSistema({ ...base, diasSemGeracao: 0, realUltimos7: 291.2 * 1.2 });
    expect(r.nivel).toBe('info');
    expect(r.alerta?.tipo).toBe('milestone_economia');
  });

  it('dentro do esperado -> ok sem alerta', () => {
    const r = classificarSistema({ ...base, diasSemGeracao: 0, realUltimos7: 291.2 });
    expect(r.nivel).toBe('ok');
    expect(r.alerta).toBeNull();
  });

  it('sem potência -> ok (não classifica queda sem base)', () => {
    const r = classificarSistema({ ...base, potenciaKwp: null, diasSemGeracao: 0, realUltimos7: 0 });
    expect(r.nivel).toBe('ok');
  });

  it('boundary: exatamente 70% do esperado NÃO dispara aviso (limiar é < 0.70)', () => {
    const r = classificarSistema({ ...base, diasSemGeracao: 0, realUltimos7: 291.2 * 0.70 });
    expect(r.nivel).toBe('ok');
    expect(r.alerta).toBeNull();
  });

  it('boundary: exatamente 110% do esperado NÃO dispara info (limiar é > 1.10)', () => {
    const r = classificarSistema({ ...base, diasSemGeracao: 0, realUltimos7: 291.2 * 1.10 });
    expect(r.nivel).toBe('ok');
    expect(r.alerta).toBeNull();
  });

  it('erro_integracao: texto completo do alerta (zero-regressão de texto)', () => {
    const r = classificarSistema({ ...base, ultimoErro: 'Deye 403', diasSemGeracao: 0, realUltimos7: 50 });
    expect(r.alerta).toEqual({
      tipo: 'erro_integracao', severidade: 'urgente', texto: 'Erro de integração: Deye 403',
    });
  });
});
