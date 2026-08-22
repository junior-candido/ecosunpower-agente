// tests/precificador.test.ts
import { describe, it, expect } from 'vitest';
import { precificar, PRODUTIVIDADE_KWH_KWP_DIA, TETO_RS_POR_WP, kwpAlvo } from '../src/modules/vendas/precificador.js';
import type { ItemPreco } from '../src/modules/vendas/tabela-precos.js';

const T0 = Date.UTC(2026, 7, 24, 15, 0, 0);
const item = (p: Partial<ItemPreco>): ItemPreco => ({
  tipo: 'modulo', marca: 'X', modelo: 'X', potenciaW: null, modulosPorUnidade: null, precoUnitario: 0, unidade: 'un', fonte: 'junior', atualizadoEmMs: T0, ...p,
});
const tabelaBase = (): ItemPreco[] => [
  item({ tipo: 'modulo', marca: 'Risen', modelo: '715', potenciaW: 715, precoUnitario: 980 }),
  item({ tipo: 'modulo', marca: 'JA', modelo: '625', potenciaW: 625, precoUnitario: 900 }),
  item({ tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T', modulosPorUnidade: 4, precoUnitario: 1450 }),
  item({ tipo: 'micro', marca: 'Sungrow', modelo: 'S2500S-L', modulosPorUnidade: 4, precoUnitario: 1500 }),
  item({ tipo: 'estrutura', marca: 'ceramico', modelo: 'ceramico', precoUnitario: 95, unidade: 'modulo' }),
  item({ tipo: 'cabos_protecao', marca: 'geral', modelo: 'geral', precoUnitario: 420, unidade: 'kwp' }),
];

describe('precificador', () => {
  it('constantes da spec', () => {
    expect(PRODUTIVIDADE_KWH_KWP_DIA).toBe(3.75);
    expect(TETO_RS_POR_WP).toBe(2.60);
  });

  // NOTA (desvio do plano, ver relatório): o plano usava 734 kWh aqui, mas
  // kwpAlvo(734) = 6,435068... kWp, que arredonda pra 6,44 (não 6,43) — e o
  // módulo Risen 715 vira 10 unidades (não 9), invertendo qual opção é A/B.
  // 733 kWh é o valor que de fato produz os números documentados no plano
  // (9 módulos Risen, kWp real 6,435 exato, kit 16.727,70 etc.).
  it('kWp alvo pela régua 3,75: 733 kWh → 6,43 kWp', () => {
    expect(kwpAlvo(733)).toBeCloseTo(6.43, 2);
  });

  it('733 kWh, cerâmico: monta A (mais barata) e B (outra marca de módulo)', () => {
    const r = precificar({ consumoAlvoKwh: 733, telhado: 'ceramico', tabela: tabelaBase(), agoraMs: T0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.consumoAlvoKwh).toBe(733);
    expect(r.kwpAlvo).toBeCloseTo(6.43, 2);
    expect(r.servicoRsPorWp).toBe(0.85);
    // Risen 715: ceil(6426,3/715)=9 mód → 6,435 kWp → 3 micros → kit 9×980 + 3×1450 + 9×95 + 6,435×420 = 8820+4350+855+2702,7 = 16.727,70; serviço 6435×0,85 = 5.469,75 → 22.197,45
    // JA 625: ceil(6426,3/625)=11 mód → 6,875 kWp → 3 micros → kit 11×900 + 3×1450 + 11×95 + 6,875×420 = 9900+4350+1045+2887,5 = 18.182,50; serviço 6875×0,85 = 5.843,75 → 24.026,25
    expect(r.opcoes.map(o => o.rotulo)).toEqual(['A', 'B']);
    const [a, b] = r.opcoes;
    expect(a).toMatchObject({ moduloMarca: 'Risen', moduloModelo: '715', modulos: 9, kwpReal: 6.44, microMarca: 'Hoymiles', micros: 3 });
    expect(a.kit).toBeCloseTo(16727.7, 1);
    expect(a.servico).toBeCloseTo(5469.75, 1);
    expect(a.total).toBeCloseTo(22197.45, 1);
    expect(a.rsPorWp).toBe(3.449);
    expect(b).toMatchObject({ moduloMarca: 'JA', modulos: 11, micros: 3 });
    expect(b.total).toBeCloseTo(24026.25, 1);
    expect(a.parcela18x).toBeGreaterThan(a.total / 18);
    // DESVIO (ver relatório): o plano esperava `avisos: []`, mas com os
    // preços da tabelaBase() o rsPorWp total (kit + serviço) de A (3,45) e
    // B (3,50) fica muito acima do teto de 2,60 R$/Wp — a regra do código
    // (rsPorWp > TETO → acima_mercado) dispara corretamente pras duas
    // opções. Isso é consistente com o card-sombra.test.ts, cuja fixture
    // fixa usa exatamente esse mesmo cenário "🚨 Muito acima do mercado".
    expect(r.avisos).toEqual([
      { tipo: 'acima_mercado', texto: 'A a 3,45 R$/Wp — acima do teto 2,60 (Greener 2,21) 🚨 Muito acima do mercado' },
      { tipo: 'acima_mercado', texto: 'B a 3,50 R$/Wp — acima do teto 2,60 (Greener 2,21) 🚨 Muito acima do mercado' },
    ]);
  });

  it('A/B determinístico: total empatado desempata por kwpReal e depois pelo nome do módulo (ordem alfabética)', () => {
    const t = tabelaBase();
    // AAA 715: mesmo Wp e mesmo preço do Risen 715 → mesmo total e mesmo kwpReal exatos.
    // Desempate cai no nome "marca modelo": "AAA 715" < "Risen 715" < "ZZZ 715".
    t.push(item({ tipo: 'modulo', marca: 'AAA', modelo: '715', potenciaW: 715, precoUnitario: 980 }));
    t.push(item({ tipo: 'modulo', marca: 'ZZZ', modelo: '715', potenciaW: 715, precoUnitario: 980 }));
    const r = precificar({ consumoAlvoKwh: 733, telhado: 'ceramico', tabela: t, agoraMs: T0 });
    if (!r.ok) throw new Error('esperava ok');
    // JA (625) tem total mais alto, então fica fora do A/B; entre os empatados a ordem é alfabética.
    expect(r.opcoes.map(o => o.moduloMarca)).toEqual(['AAA', 'Risen']);
  });

  it.each([
    [700, 0.85],
    [999, 0.85],
    [1000, 0.70],
    [1500, 0.70],
  ])('faixa de serviço na fronteira: %i kWh → %s R$/Wp', (kwh, band) => {
    const r = precificar({ consumoAlvoKwh: kwh, telhado: 'ceramico', tabela: tabelaBase(), agoraMs: T0 });
    if (!r.ok) throw new Error('esperava ok');
    expect(r.servicoRsPorWp).toBe(band);
    const a = r.opcoes[0];
    const kwpRealExato = (a.modulos * a.moduloWp) / 1000;
    expect(Math.abs(a.servico - kwpRealExato * 1000 * band)).toBeLessThanOrEqual(0.01);
  });

  it('parcela é injetável: parcela:()=>null zera parcela18x sem chamar a tabela oficial do cartão', () => {
    const r = precificar({ consumoAlvoKwh: 733, telhado: 'ceramico', tabela: tabelaBase(), agoraMs: T0, parcela: () => null });
    if (!r.ok) throw new Error('esperava ok');
    expect(r.opcoes.every(o => o.parcela18x === null)).toBe(true);
  });

  it('estrutura/cabos com preço zerado é ignorado (usa o próximo preço válido)', () => {
    const t = tabelaBase();
    t.unshift(item({ tipo: 'estrutura', marca: 'ceramico', modelo: 'promo', precoUnitario: 0 }));
    const r = precificar({ consumoAlvoKwh: 733, telhado: 'ceramico', tabela: t, agoraMs: T0 });
    if (!r.ok) throw new Error('esperava ok');
    expect(r.opcoes[0].kit).toBeCloseTo(16727.7, 1);
  });

  it('micro: escolhe o mais barato por opção e respeita módulos por unidade', () => {
    const t = tabelaBase().filter(i => i.tipo !== 'micro');
    t.push(item({ tipo: 'micro', marca: 'GoodWe', modelo: 'GW2000-MIS', modulosPorUnidade: 2, precoUnitario: 900 }));
    t.push(item({ tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T', modulosPorUnidade: 4, precoUnitario: 1450 }));
    const r = precificar({ consumoAlvoKwh: 733, telhado: 'ceramico', tabela: t, agoraMs: T0 });
    if (!r.ok) throw new Error('esperava ok');
    // Risen 9 mód: GoodWe ceil(9/2)=5×900=4500 > Hoymiles 3×1450=4350 → Hoymiles
    expect(r.opcoes[0]).toMatchObject({ microMarca: 'Hoymiles', micros: 3 });
  });

  it('avisa preço velho (>15 d) e acima do mercado (>2,60 R$/Wp)', () => {
    const t = tabelaBase().map(i => i.tipo === 'modulo' && i.marca === 'Risen' ? { ...i, atualizadoEmMs: T0 - 20 * 86400_000, precoUnitario: 2000 } : i);
    const r = precificar({ consumoAlvoKwh: 600, telhado: 'ceramico', tabela: t, agoraMs: T0 });
    if (!r.ok) throw new Error('esperava ok');
    expect(r.avisos.some(a => a.tipo === 'preco_velho' && a.texto.includes('Risen 715') && a.texto.includes('20 d'))).toBe(true);
    const b = r.opcoes.find(o => o.moduloMarca === 'Risen')!;
    expect(b.rsPorWp).toBeGreaterThan(2.60);
    expect(r.avisos.some(a => a.tipo === 'acima_mercado' && a.texto.includes('B'))).toBe(true);
  });

  it('uma marca só → só A + aviso', () => {
    const t = tabelaBase().filter(i => !(i.tipo === 'modulo' && i.marca === 'JA'));
    const r = precificar({ consumoAlvoKwh: 734, telhado: 'ceramico', tabela: t, agoraMs: T0 });
    if (!r.ok) throw new Error('esperava ok');
    expect(r.opcoes).toHaveLength(1);
    expect(r.avisos.some(a => a.tipo === 'so_uma_marca')).toBe(true);
  });

  it('falta estrutura do telhado → erro com lista do que falta', () => {
    const r = precificar({ consumoAlvoKwh: 734, telhado: 'fibrocimento', tabela: tabelaBase(), agoraMs: T0 });
    expect(r).toEqual({ ok: false, erro: 'tabela_incompleta', faltando: ['estrutura fibrocimento'] });
  });

  it('tabela vazia → lista tudo que falta', () => {
    const r = precificar({ consumoAlvoKwh: 734, telhado: 'ceramico', tabela: [], agoraMs: T0 });
    expect(r).toEqual({ ok: false, erro: 'tabela_incompleta', faltando: ['módulo', 'micro', 'estrutura ceramico', 'cabos'] });
  });

  it('consumo inválido → erro', () => {
    expect(precificar({ consumoAlvoKwh: 0, telhado: 'ceramico', tabela: tabelaBase(), agoraMs: T0 })).toEqual({ ok: false, erro: 'consumo_invalido', faltando: [] });
  });
});
