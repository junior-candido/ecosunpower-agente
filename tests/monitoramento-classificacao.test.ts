// tests/monitoramento-classificacao.test.ts
import { describe, it, expect } from 'vitest';
import { classificarSistema, esperadoDiaKwh } from '../src/modules/monitoring/classificacao.js';

describe('esperadoDiaKwh', () => {
  it('usa HSP 5.3 em GO e 5.2 fora, fator 0.80', () => {
    expect(esperadoDiaKwh(10, 'GO')).toBeCloseTo(10 * 5.3 * 0.8);
    expect(esperadoDiaKwh(10, 'DF')).toBeCloseTo(10 * 5.2 * 0.8);
    expect(esperadoDiaKwh(null, 'GO')).toBe(0);
  });

  // Degustação Sabion 27/07: a carteira do tenant é do RJ — irradiação menor
  // que o Planalto. Sem o HSP do RJ, a régua cobrava sol de cerrado do céu
  // carioca e gerava "abaixo do esperado" falso em usina saudável.
  it('RJ (e vizinhos SP/ES) usam HSP proprio, menor que o do Planalto', () => {
    expect(esperadoDiaKwh(10, 'RJ')).toBeCloseTo(10 * 4.8 * 0.8);
    expect(esperadoDiaKwh(10, 'SP')).toBeCloseTo(10 * 4.9 * 0.8);
    expect(esperadoDiaKwh(10, 'ES')).toBeCloseTo(10 * 4.9 * 0.8);
    // UF desconhecida segue no padrao 5.2 (nao quebra ninguem)
    expect(esperadoDiaKwh(10, 'AC')).toBeCloseTo(10 * 5.2 * 0.8);
    expect(esperadoDiaKwh(10, null)).toBeCloseTo(10 * 5.2 * 0.8);
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

describe('zero-regressão: textos batem com os literais antigos de getDetalheSistema', () => {
  it('offline 4 dias', () => {
    expect(classificarSistema({ ativo: true, ultimoErro: null, potenciaKwp: 5, uf: 'DF', diasSemGeracao: 4, realUltimos7: 0 }).alerta?.texto)
      .toBe('Sem geração há 4 dias. Verificar inversor / conexão WiFi.');
  });
  it('queda 35%', () => {
    const esperado7 = 5 * 5.2 * 0.8 * 7;
    expect(classificarSistema({ ativo: true, ultimoErro: null, potenciaKwp: 5, uf: 'DF', diasSemGeracao: 0, realUltimos7: esperado7 * 0.65 }).alerta?.texto)
      .toBe('Geração últimos 7 dias 35% ABAIXO do esperado. Pode ser sujeira/sombreamento — agendar limpeza.');
  });
});

describe('motivo no alerta de usina parada (fatia 1 — statusInversor, Thiago 28/07)', () => {
  const base = { ativo: true, ultimoErro: null, potenciaKwp: 5, uf: 'DF', diasSemGeracao: 7, realUltimos7: 0 };
  it('offline → sem comunicação (WiFi/internet)', () => {
    const c = classificarSistema({ ...base, statusInversor: 'offline' } as any);
    expect(c.alerta!.tipo).toBe('sistema_offline');
    expect(c.alerta!.texto).toContain('Sem comunicação há 7 dias');
    expect(c.alerta!.texto).toContain('WiFi');
  });
  it('falha → falha reportada pelo inversor', () => {
    const c = classificarSistema({ ...base, statusInversor: 'falha' } as any);
    expect(c.alerta!.tipo).toBe('sistema_offline');
    expect(c.alerta!.texto).toContain('Falha reportada pelo inversor');
  });
  it('ok → parada mas comunicando (disjuntor/strings)', () => {
    const c = classificarSistema({ ...base, statusInversor: 'ok' } as any);
    expect(c.alerta!.texto).toContain('comunicando, mas sem gerar');
  });
  it('desconhecido/ausente → texto antigo, zero regressão', () => {
    for (const s of ['desconhecido', undefined, null]) {
      const c = classificarSistema({ ...base, statusInversor: s } as any);
      expect(c.alerta!.texto).toBe('Sem geração há 7 dias. Verificar inversor / conexão WiFi.');
    }
  });
});

describe('régua de atenção POR EMPRESA (corteAtencao — Thiago 28/07)', () => {
  const base = { ativo: true, ultimoErro: null, potenciaKwp: 10, uf: 'RJ', diasSemGeracao: 0 };
  // 10 kWp no RJ → esperado 7d = 10 × 4.8 × 0.80 × 7 = 268.8 kWh
  it('corte 60%: ratio 65% deixa de ser aviso (era aviso no corte padrão 70%)', () => {
    const real = 268.8 * 0.65;
    const padrao = classificarSistema({ ...base, realUltimos7: real } as any);
    expect(padrao.alerta?.tipo).toBe('queda_geracao');
    const custom = classificarSistema({ ...base, realUltimos7: real, corteAtencao: 0.60 } as any);
    expect(custom.alerta).toBeNull();
  });
  it('corte 60%: ratio 55% continua aviso', () => {
    const c = classificarSistema({ ...base, realUltimos7: 268.8 * 0.55, corteAtencao: 0.60 } as any);
    expect(c.alerta?.tipo).toBe('queda_geracao');
  });
  it('sem corteAtencao → 70% (zero regressão)', () => {
    const c = classificarSistema({ ...base, realUltimos7: 268.8 * 0.69 } as any);
    expect(c.alerta?.tipo).toBe('queda_geracao');
  });
});
