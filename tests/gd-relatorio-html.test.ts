import { describe, it, expect } from 'vitest';
import { renderRelatorioHtml, RODAPE_CONFERENCIA } from '../src/modules/gd/relatorio-html.js';
import type { RelatorioGd } from '../src/modules/gd/relatorio-motor.js';
import type { MarcaRelatorio } from '../src/modules/gd/relatorio-marca.js';

const rel = (over: Partial<RelatorioGd> = {}): RelatorioGd => ({
  cliente: 'JOAO <script>x</script>', instalacao: '351534', referencia: '2026-08-01', mesExtenso: 'agosto de 2026',
  gerouKwh: 612, consumiuKwh: 480, economiaRs: 376.2, creditosKwh: 1240, autoconsumoKwh: 390, injetadoKwh: 222,
  compensadoKwh: 380, frase: 'Em agosto de 2026 sua usina gerou 612 kWh.',
  meses: [{ mes: '2026-08-01', rotulo: 'ago/2026', geracao: 612, consumo: 480, injetado: 222, compensado: 380 }],
  creditos: { saldoKwh: 1240, usadosNoMesKwh: 380, aVencerKwh: 50, venceEm: 'mar/2027' },
  rateio: [], desempenho: { esperadoKwh: 640, percentual: 96, potenciaKwp: 5.5 },
  fontes: ['Geração: monitoramento da usina (soma dos dias do mês).'], tarifaRsKwh: 0.99, ...over,
});
const marca: MarcaRelatorio = { nomeFantasia: 'Conquista Solar', logoSrc: null, cor: '#112233', telefone: '(71) 99999-0000',
  email: 'c@x.com', site: 'conquista.com', rodapeRt: 'JIMENA X — Responsável Técnico' };

describe('renderRelatorioHtml', () => {
  it('duas paginas A4, escapa o nome do cliente', () => {
    const h = renderRelatorioHtml(rel(), marca);
    expect(h.match(/class="pagina"/g)).toHaveLength(2);
    expect(h).toContain('JOAO &lt;script&gt;x&lt;/script&gt;');
    expect(h).not.toContain('<script>x</script>');
  });
  it('4 numeros grandes, frase e grafico com os 13 meses', () => {
    const h = renderRelatorioHtml(rel(), marca);
    expect(h).toContain('612');
    expect(h).toContain('R$ 376,20');
    expect(h).toContain('1.240');
    expect(h).toContain('Em agosto de 2026 sua usina gerou 612 kWh.');
    expect(h).toContain('"ago/2026"');
    expect(h).toContain('chart.umd.min.js');
    expect(h).toContain('animation: false');
  });
  it('sem logo escreve o nome da empresa; nunca menciona EcoSun num tenant', () => {
    const h = renderRelatorioHtml(rel(), marca);
    expect(h).toContain('Conquista Solar');
    expect(h).not.toMatch(/ecosun/i);
  });
  it('creditos a vencer em destaque; rateio so com mais de uma unidade', () => {
    expect(renderRelatorioHtml(rel(), marca)).toMatch(/vencem em <b>mar\/2027<\/b>/);
    expect(renderRelatorioHtml(rel(), marca)).not.toContain('Rateio dos créditos');
    const h = renderRelatorioHtml(rel({ rateio: [{ codigoCliente: 'A', percentual: 60, saldoKwh: 10 }, { codigoCliente: 'B', percentual: 40, saldoKwh: 5 }] }), marca);
    expect(h).toContain('Rateio dos créditos');
    expect(h).toContain('60%');
  });
  it('rodape com fontes, RT e a marca de conferencia', () => {
    const h = renderRelatorioHtml(rel(), marca);
    expect(h).toContain('JIMENA X — Responsável Técnico');
    expect(h).toContain('Geração: monitoramento da usina');
    expect(h).toContain(RODAPE_CONFERENCIA);
    expect(h).not.toMatch(/engenheiro/i);
  });
  it('glossario curto', () => {
    const h = renderRelatorioHtml(rel(), marca);
    for (const t of ['Injetado', 'Compensado', 'Crédito', 'Rateio']) expect(h).toContain(t);
  });
});
