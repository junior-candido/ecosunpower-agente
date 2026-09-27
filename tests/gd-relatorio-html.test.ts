import { describe, it, expect } from 'vitest';
import { renderRelatorioHtml, RODAPE_CONFERENCIA, MARCA_GRAFICO_OK } from '../src/modules/gd/relatorio-html.js';
import type { RelatorioGd } from '../src/modules/gd/relatorio-motor.js';
import type { MarcaRelatorio } from '../src/modules/gd/relatorio-marca.js';

const rel = (over: Partial<RelatorioGd> = {}): RelatorioGd => ({
  cliente: 'JOAO <script>x</script>', instalacao: '351534', referencia: '2026-08-01', mesExtenso: 'agosto de 2026',
  gerouKwh: 612, consumiuKwh: 480, economiaRs: 376.2, creditosKwh: 1240, autoconsumoKwh: 390, injetadoKwh: 222,
  compensadoKwh: 380, frase: 'Em agosto de 2026 sua usina gerou 612 kWh.',
  meses: [{ mes: '2026-08-01', rotulo: 'ago/2026', geracao: 612, consumo: 480, injetado: 222, compensado: 380 }],
  creditos: { saldoKwh: 1240, usadosNoMesKwh: 380, aVencerKwh: 50, venceEm: 'mar/2027', avisoVencimento: 'alerta' },
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
    expect(h).toContain('class="nome-empresa"');
  });

  it('cabecalho e uma faixa cheia com a cor da marca', () => {
    const h = renderRelatorioHtml(rel(), marca);
    expect(h).toContain(`background:${marca.cor}`);
  });

  it('logo de tenant entra numa caixa branca (cores da logo sao desconhecidas)', () => {
    const h = renderRelatorioHtml(rel(), { ...marca, logoSrc: 'https://cdn.x/logo.png', ehCasa: false });
    expect(h).toContain('<div class="logo-caixa">');
    expect(h).toContain('class="logo logo-tenant"');
  });

  it('logo da casa (ehCasa) vai direto na faixa, sem caixa branca', () => {
    const h = renderRelatorioHtml(rel(), { ...marca, nomeFantasia: 'EcoSunPower', logoSrc: 'data:image/png;base64,AAA', ehCasa: true });
    expect(h).not.toContain('<div class="logo-caixa">');
    expect(h).toContain('<img class="logo" ');
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
  it('sem meses no historico: nota no lugar do grafico, sem Chart.js', () => {
    const h = renderRelatorioHtml(rel({ meses: [] }), marca);
    expect(h).toContain('Histórico dos meses não disponível neste demonstrativo.');
    expect(h).not.toContain('chart.umd.min.js');
    expect(h).not.toContain('<canvas');
  });
  it('mes sem numero sai como null no grafico (nao 0)', () => {
    const h = renderRelatorioHtml(rel({ meses: [{ mes: '2026-08-01', rotulo: 'ago/2026', geracao: null, consumo: null, injetado: 222, compensado: null }] }), marca);
    expect(h).toContain('"consumo":null');
  });
  it('com grafico: marca invisivel gravada no DOM so DEPOIS do new Chart(...) — se o CDN falhar, a marca nao aparece', () => {
    const h = renderRelatorioHtml(rel(), marca);
    const idxChart = h.indexOf('new Chart(');
    const idxMarca = h.indexOf(MARCA_GRAFICO_OK);
    expect(idxChart).toBeGreaterThan(-1);
    expect(idxMarca).toBeGreaterThan(idxChart);
    expect(h).toContain(`insertAdjacentHTML('afterend', '<span style="font-size:1px;color:#fff">${MARCA_GRAFICO_OK}</span>')`);
    // nunca em document.body: la fora ela soma altura ao documento e estoura pra 3a pagina.
    expect(h).not.toContain('document.body.insertAdjacentHTML');
  });
  it('sem grafico (sem meses): a marca nao aparece (nada pra conferir)', () => {
    const h = renderRelatorioHtml(rel({ meses: [] }), marca);
    expect(h).not.toContain(MARCA_GRAFICO_OK);
  });
  it('percentual do rateio escapado (nunca HTML cru)', () => {
    const h = renderRelatorioHtml(rel({ rateio: [
      { codigoCliente: 'A', percentual: '60<script>x</script>' as unknown as number, saldoKwh: 10 },
      { codigoCliente: 'B', percentual: 40, saldoKwh: 5 },
    ] }), marca);
    expect(h).not.toContain('<script>x</script>');
    expect(h).toContain('60&lt;script&gt;x&lt;/script&gt;');
  });
});

describe('renderRelatorioHtml — vencimento dos créditos', () => {
  const creditos = { saldoKwh: 1240, usadosNoMesKwh: 380, aVencerKwh: 50, venceEm: 'mar/2027' };
  it('longe (mais de 6 meses): linha simples, sem o alerta amarelo', () => {
    const h = renderRelatorioHtml(rel({ creditos: { ...creditos, avisoVencimento: 'validade' } }), marca);
    expect(h).toContain('Créditos válidos até <b>mar/2027</b>.');
    expect(h).not.toContain('Use antes disso');
    expect(h).not.toContain('class="alerta"');
  });
  it('perto (até 6 meses): alerta amarelo', () => {
    const h = renderRelatorioHtml(rel({ creditos: { ...creditos, avisoVencimento: 'alerta' } }), marca);
    expect(h).toMatch(/class="alerta">⏰ .* vencem em <b>mar\/2027<\/b>\. Use antes disso\./);
  });
  it('sem aviso: nenhuma das duas linhas', () => {
    const h = renderRelatorioHtml(rel({ creditos: { ...creditos, avisoVencimento: null } }), marca);
    expect(h).not.toContain('Use antes disso');
    expect(h).not.toContain('Créditos válidos até');
  });
});
