import { describe, it, expect } from 'vitest';
import { renderLojasPage, type LojasPageInput } from '../src/modules/dashboard/lojas-views.js';
import type { KitOferta } from '../src/modules/vendas/lojas/kit-oferta.js';

const kit = (o: Partial<KitOferta>): KitOferta => ({
  fonte: 'solfacil', region: 'DF', inversorMarca: 'SOFAR', moduloMarca: 'LEAPTON',
  descricao: 'Kit', precoTotal: 6908, rsPorWp: 1.15,
  itens: [], pagamentos: [{ nome: 'Pix', descontoPct: 6, precoFinal: 6493.52, semJuros: null }],
  ehAlternativa: false, alerta: null, ...o,
});

const base: LojasPageInput = {
  totalItens: 0, contagemPorFonte: { belenus: 0, solfacil: 0, fortlev: 0 }, atualizadoEmMs: null,
  kitSpec: null, kits: [], cotacao: null,
  cotParams: { servicoRsPorWp: 0.85, impostoPct: 6, margemAlvoPct: 25, margemMinimaPct: 12 },
  precoManual: null, margemManual: null, melhorFonte: null,
  catalogo: [], catSel: '', fonteSel: '', mostrarGrandes: false,
  marcasModulo: [], marcasInversor: [], marcaMod: '', marcaInv: '',
  kitReal: { power: null, region: 'DF', zipcode: '', inverterType: '', inverterManufacturer: '' },
  kitRealView: null, cotReal: null, margemManualReal: null, melhorFonteReal: null,
};

describe('renderLojasPage — kit real', () => {
  it('mostra o formulário do configurador sempre', () => {
    const html = renderLojasPage(base);
    expect(html).toContain('Montar kit real');
    expect(html).toContain('name="kwpreal"');
    expect(html).toContain('DF (Brasília)');
    expect(html).toContain('GO (Goiás)');
  });

  it('lista ofertas da Sol Fácil com preço e Pix e marca o 🏆', () => {
    const html = renderLojasPage({
      ...base,
      kitReal: { power: 5, region: 'DF', zipcode: '', inverterType: '', inverterManufacturer: '' },
      kitRealView: {
        solfacil: [kit({ precoTotal: 6908 }), kit({ inversorMarca: 'GOODWE', precoTotal: 7282.76, rsPorWp: 1.21, pagamentos: [] })],
        erros: [], semCredencial: false, fortlev: 'assistida', belenus: 'assistida',
      },
    });
    expect(html).toContain('SOFAR');
    expect(html).toContain('6.908');
    expect(html).toContain('Pix');
    expect(html).toContain('🏆');
    expect(html).toContain('Fortlev');
    expect(html).toContain('Belenus');
  });

  it('avisa quando falta login no servidor', () => {
    const html = renderLojasPage({
      ...base,
      kitReal: { power: 5, region: 'DF', zipcode: '', inverterType: '', inverterManufacturer: '' },
      kitRealView: { solfacil: [], erros: [], semCredencial: true, fortlev: 'assistida', belenus: 'assistida' },
    });
    expect(html).toContain('indisponível');
  });

  it('cotação do kit real: sugestão + "seu preço manda"', () => {
    const cotReal = { custoMateriais: 6908, custoServico: 4250, custoTotal: 11158, precoSugerido: 16000, impostoValor: 960, lucro: 3882, lucroPct: 25, precoMinimo: 13000, descontoMaxRs: 3000, descontoMaxPct: 18.75 };
    const html = renderLojasPage({
      ...base,
      kitReal: { power: 5, region: 'DF', zipcode: '', inverterType: '', inverterManufacturer: '' },
      kitRealView: { solfacil: [kit({})], erros: [], semCredencial: false, fortlev: 'assistida', belenus: 'assistida' },
      cotReal, melhorFonteReal: 'solfacil',
    });
    expect(html).toContain('Cotação do kit real');
    expect(html).toContain('Preço sugerido');
    expect(html).toContain('Seu preço');
  });
});
