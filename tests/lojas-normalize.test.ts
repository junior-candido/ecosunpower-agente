import { describe, it, expect } from 'vitest';
import { potenciaWpDeTexto, potenciaWDeCampo } from '../src/modules/vendas/lojas/tipos.js';
import { normalizarBelenus, marcaDeBelenus } from '../src/modules/vendas/lojas/belenus-normalize.js';
import { normalizarSolfacil, precoBrl, categoriaSolfacil } from '../src/modules/vendas/lojas/solfacil-normalize.js';
import { normalizarFortlev, melhorAnexoFortlev, categoriaFortlev, precoFortlev } from '../src/modules/vendas/lojas/fortlev-normalize.js';

describe('tipos: potência', () => {
  it('lê Wp de texto pegando o maior NNNW plausível', () => {
    expect(potenciaWpDeTexto('MFRI-1.4-HJ-132-715W MODULO 715W')).toBe(715);
    expect(potenciaWpDeTexto('sem potencia')).toBeNull();
  });
  it('lê W de campo "2.5 kW"/"600 W" (ponto é decimal em kW)', () => {
    expect(potenciaWDeCampo('2.5 kW')).toBe(2500);
    expect(potenciaWDeCampo('0.475 kW')).toBe(475);
    expect(potenciaWDeCampo('600 W')).toBe(600);
  });
});

describe('Belenus normalize', () => {
  it('limpa marca do imagemMarca', () => {
    expect(marcaDeBelenus('https://x/logo_astronergy.png', '')).toBe('astronergy');
    expect(marcaDeBelenus('https://x/growatt sem fundo.png', '')).toBe('growatt');
  });
  it('mapeia painel com Wp e R$/Wp; ignora sem preço', () => {
    const fam = [{ categoria: 'modulo' as const, produtos: [{ opcoes: [
      { sku: 'MFRI-1.4-HJ-132-715W', descricaoProduto: 'MODULO 715W RISEN', preco: 722.15, valorPotencia: 1.01, qtdEstoque: 2164, imagemMarca: 'https://x/risen.png' },
      { sku: 'SEMPRECO', descricaoProduto: 'X', preco: 0, valorPotencia: 0 },
    ] }] }];
    const out = normalizarBelenus(fam);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ fonte: 'belenus', categoria: 'modulo', potenciaW: 715, precoUnitario: 722.15, rsPorWp: 1.01, marca: 'risen' });
  });
});

describe('Sol Fácil normalize', () => {
  it('preçoBrl pt-BR', () => {
    expect(precoBrl('R$ 1.507,69')).toBeCloseTo(1507.69);
    expect(precoBrl('R$ 528,56')).toBeCloseTo(528.56);
  });
  it('categoria: micro/hibrido/string por descrição', () => {
    expect(categoriaSolfacil('INVERTERS', 'MICRO INVERSOR 2KW GOODWE')).toBe('micro');
    expect(categoriaSolfacil('INVERTERS', 'INVERSOR 12KW GOODWE HIBRIDO')).toBe('inversor_hibrido');
    expect(categoriaSolfacil('INVERTERS', 'INVERSOR 5KW GOODWE')).toBe('inversor_string');
    expect(categoriaSolfacil('MODULES', 'x')).toBe('modulo');
  });
  it('usa o Pix como preço unitário', () => {
    const prod = [{ sku: '573504', manufacturer: 'LEAPTON', model: 'LP182', description: 'MODULO BIFACIAL 600W LEAPTON',
      price: 562.3, info: [{ title: 'Potência', value: '600 W' }],
      datasheet: 'http://x.pdf',
      payment_conditions: [{ payment_name: 'Pix', discount_percent: 6, final_price: 'R$ 528,56' }] }];
    const out = normalizarSolfacil(prod, 'MODULES');
    expect(out[0]).toMatchObject({ fonte: 'solfacil', categoria: 'modulo', potenciaW: 600, precoUnitario: 528.56, precoCheio: 562.3, datasheet: 'http://x.pdf' });
  });
});

describe('Fortlev normalize', () => {
  it('prioriza INMETRO no anexo', () => {
    const a = melhorAnexoFortlev([
      { path: 'https://s3/DATASHEET - X.pdf' },
      { path: 'https://s3/CERTIFICADO DO INMETRO - X.pdf' },
    ]);
    expect(a?.tipo).toBe('INMETRO');
  });
  it('preçoFortlev pt-BR', () => {
    expect(precoFortlev('R$ 2.278,26')).toBeCloseTo(2278.26);
  });
  it('categoria por family+nome', () => {
    expect(categoriaFortlev('inverter', 'NEP MICROINVERSOR 2,5KW')).toBe('micro');
    expect(categoriaFortlev('module', 'MODULO JINKO 720WP')).toBe('modulo');
  });
  it('card → ItemLoja com potência (kW→W), marca 1ª palavra, datasheet INMETRO', () => {
    const card = { precoTexto: 'R$ 2.495,37', component: {
      code: 'IIN00366', name: 'SUNGROW ON-GRID 6KW - 220V - 2 MPPT - AFCI (SG6.0RS)', family: 'inverter',
      tech_data: { output: { nominal_power: 6 } },
      attachments: [{ path: 'https://s3/CERTIFICADO DO INMETRO - IIN00366 - SUNGROW SG6.0RS.pdf' }] } };
    const out = normalizarFortlev([card]);
    expect(out[0]).toMatchObject({ fonte: 'fortlev', categoria: 'inversor_string', sku: 'IIN00366', marca: 'SUNGROW', potenciaW: 6000, precoUnitario: 2495.37 });
    expect(out[0].datasheet).toContain('INMETRO');
  });
});

import { compararLojas, tensaoDeTexto, faseDeTexto } from '../src/modules/vendas/lojas/comparador.js';
import type { ItemLoja } from '../src/modules/vendas/lojas/tipos.js';

const mk = (o: Partial<ItemLoja>): ItemLoja => ({
  fonte: 'belenus', categoria: 'inversor_string', sku: 's', marca: 'X', modelo: 'm',
  descricao: '', potenciaW: null, precoUnitario: 100, precoCheio: null, estoque: null,
  datasheet: null, rsPorWp: null, ...o,
});

describe('comparador', () => {
  it('lê tensão e fase da descrição', () => {
    expect(tensaoDeTexto('INVERSOR 5KW 220V')).toBe(220);
    expect(tensaoDeTexto('TRI 380V')).toBe(380);
    expect(faseDeTexto('INVERSOR TRIFASICO 380V')).toBe('tri');
    expect(faseDeTexto('MICRO MONOFASICO 220V')).toBe('mono');
    expect(faseDeTexto('HIBRIDO BIFASICO 127/220V')).toBe('bif');
  });

  it('NÃO compara tensões/fases diferentes (220V mono × 380V tri não agrupam)', () => {
    const itens = [
      mk({ fonte: 'belenus', marca: 'DEYE', potenciaW: 5000, descricao: 'INVERSOR MONOFASICO 220V 5KW DEYE', precoUnitario: 1454 }),
      mk({ fonte: 'fortlev', marca: 'DEYE', potenciaW: 5000, descricao: 'INVERSOR TRIFASICO 380V 5KW DEYE', precoUnitario: 3000 }),
    ];
    // chaves diferentes → nenhum grupo com 2 lojas
    expect(compararLojas(itens)).toHaveLength(0);
  });

  it('agrupa mesmo produto em 2 lojas e acha o mais barato + economia', () => {
    const itens = [
      mk({ fonte: 'belenus', marca: 'SUNGROW', potenciaW: 5000, descricao: 'INVERSOR MONOFASICO 220V 5KW SUNGROW', precoUnitario: 2761.63 }),
      mk({ fonte: 'solfacil', marca: 'SUNGROW', potenciaW: 5000, descricao: 'INVERSOR 5KW SUNGROW MONO 220V', precoUnitario: 2500 }),
      mk({ fonte: 'fortlev', marca: 'SUNGROW', potenciaW: 5000, descricao: 'SUNGROW ON-GRID 5KW - 220V', precoUnitario: 2592.63 }),
    ];
    const g = compararLojas(itens);
    expect(g).toHaveLength(1);
    expect(g[0].melhor.fonte).toBe('solfacil');
    expect(g[0].melhor.preco).toBe(2500);
    expect(g[0].economia).toBeCloseTo(261.63);
    expect(g[0].ofertas).toHaveLength(3);
  });

  it('módulo agrupa por marca+Wp; ignora grupo de loja única por padrão', () => {
    const itens = [
      mk({ categoria: 'modulo', fonte: 'belenus', marca: 'JA', potenciaW: 625, descricao: 'MOD 625W JA', precoUnitario: 625 }),
      mk({ categoria: 'modulo', fonte: 'solfacil', marca: 'JINKO', potenciaW: 620, descricao: 'MOD 620W JINKO', precoUnitario: 683 }),
    ];
    expect(compararLojas(itens)).toHaveLength(0); // marcas diferentes, sem par
    expect(compararLojas(itens, { incluirLojaUnica: true })).toHaveLength(2);
  });
});

import { marcaBanida } from '../src/modules/vendas/lojas/tipos.js';
describe('Growatt banido', () => {
  it('marcaBanida pega growatt (marca ou descrição)', () => {
    expect(marcaBanida('GROWATT', '')).toBe(true);
    expect(marcaBanida('growatt', '')).toBe(true);
    expect(marcaBanida('X', 'INVERSOR 6KW GROWATT MIN6000')).toBe(true);
    expect(marcaBanida('SUNGROW', 'INVERSOR')).toBe(false);
  });
  it('normalizarFortlev NÃO devolve Growatt', () => {
    const cards = [{ precoTexto: 'R$ 100,00', component: { code: 'G1', name: 'GROWATT MIN6000', family: 'inverter', tech_data: { output: { nominal_power: 6 } }, attachments: [] } }];
    expect(normalizarFortlev(cards)).toHaveLength(0);
  });
});
