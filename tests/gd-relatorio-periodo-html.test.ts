import { describe, it, expect } from 'vitest';
import { renderRelatorioPeriodoHtml } from '../src/modules/gd/relatorio-periodo-html.js';
import { RODAPE_CONFERENCIA, MARCA_GRAFICO_OK } from '../src/modules/gd/relatorio-html.js';
import type { RelatorioPeriodoGd, MesDoPeriodo } from '../src/modules/gd/relatorio-periodo-motor.js';
import type { MarcaRelatorio } from '../src/modules/gd/relatorio-marca.js';

const mes = (m: string, rotulo: string, ext: string, gerou: number): MesDoPeriodo => ({
  mes: m, rotulo, mesExtenso: ext, gerouKwh: gerou, consumoKwh: 550, compensadoKwh: 350, economiaRs: 346.5, injetadoKwh: 400, esperadoKwh: 600,
});

const rel = (over: Partial<RelatorioPeriodoGd> = {}): RelatorioPeriodoGd => ({
  cliente: 'JOAO <script>x</script>', instalacao: '351534', inicio: '2026-05-01', fim: '2026-08-01',
  periodoExtenso: 'maio a agosto de 2026',
  meses: [
    mes('2026-05-01', 'mai/2026', 'maio de 2026', 580), mes('2026-06-01', 'jun/2026', 'junho de 2026', 540),
    mes('2026-07-01', 'jul/2026', 'julho de 2026', 560), mes('2026-08-01', 'ago/2026', 'agosto de 2026', 620),
  ],
  totais: { gerouKwh: 2300, consumoKwh: 2200, compensadoKwh: 1400, economiaRs: 1386, injetadoKwh: 1600 },
  creditosHojeKwh: 1240,
  creditos: { saldoKwh: 1240, usadosNoPeriodoKwh: 1400, aVencerKwh: 50, venceEm: 'dez/2026', avisoVencimento: 'alerta' },
  rateio: [
    { codigoCliente: 'A-111', percentual: 50, consumoKwh: 1200, compensadoKwh: 800, saldoKwh: 800 },
    { codigoCliente: 'B-222', percentual: 30, consumoKwh: 600, compensadoKwh: 400, saldoKwh: 300 },
    { codigoCliente: 'C-333', percentual: 20, consumoKwh: 400, compensadoKwh: 200, saldoKwh: 140 },
  ],
  desempenho: { esperadoKwh: 2400, percentual: 96, potenciaKwp: 5.5 },
  frase: 'De maio a agosto de 2026 sua usina gerou 2.300 kWh.',
  grafico: [
    { mes: '2026-04-01', rotulo: 'abr/2026', geracao: 590, consumo: 551, injetado: 400, compensado: 350, noPeriodo: false },
    { mes: '2026-05-01', rotulo: 'mai/2026', geracao: 580, consumo: 552, injetado: 400, compensado: 352, noPeriodo: true },
  ],
  fontes: ['Totais do período = soma dos meses.'],
  tarifaRsKwh: 0.99,
  ...over,
});
const marca: MarcaRelatorio = { nomeFantasia: 'Conquista Solar', logoSrc: null, cor: '#112233', telefone: '(71) 99999-0000',
  email: 'c@x.com', site: 'conquista.com', rodapeRt: 'JIMENA X — Responsável Técnico' };

describe('renderRelatorioPeriodoHtml', () => {
  it('duas páginas A4, rodapé de conferência nas duas, nome escapado', () => {
    const h = renderRelatorioPeriodoHtml(rel(), marca);
    expect(h.match(/class="pagina"/g)).toHaveLength(2);
    expect(h).toContain(`${RODAPE_CONFERENCIA} · página 1 de 2`);
    expect(h).toContain(`${RODAPE_CONFERENCIA} · página 2 de 2`);
    expect(h).toContain('JOAO &lt;script&gt;x&lt;/script&gt;');
    expect(h).not.toContain('<script>x</script>');
  });

  it('título com o período e os 4 números grandes do período', () => {
    const h = renderRelatorioPeriodoHtml(rel(), marca);
    expect(h).toContain('Relatório da sua usina solar — maio a agosto de 2026');
    expect(h).toContain('gerou no período');
    expect(h).toContain('2.300 kWh');
    expect(h).toContain('Consumo no período');
    expect(h).toContain('2.200 kWh');
    expect(h).toContain('Economia estimada no período');
    expect(h).toContain('R$ 1.386,00');
    expect(h).toContain('Créditos guardados hoje');
    expect(h).toContain('1.240 kWh');
    expect(h).toContain('De maio a agosto de 2026 sua usina gerou 2.300 kWh.');
  });

  it('gráfico de 13 meses com os meses do período em destaque + marca de que carregou', () => {
    const h = renderRelatorioPeriodoHtml(rel(), marca);
    expect(h).toContain('chart.umd.min.js');
    expect(h).toContain('"noPeriodo":true');
    expect(h).toContain('m.noPeriodo ?');
    expect(h).toContain(MARCA_GRAFICO_OK);
    expect(h).toContain('animation: false');
  });

  it('sem histórico: sem gráfico e sem Chart.js', () => {
    const h = renderRelatorioPeriodoHtml(rel({ grafico: [] }), marca);
    expect(h).not.toContain('chart.umd.min.js');
    expect(h).not.toContain('<canvas');
  });

  it('tabela mês a mês com linha de total', () => {
    const h = renderRelatorioPeriodoHtml(rel(), marca);
    expect(h).toContain('Mês a mês');
    for (const r of ['mai/2026', 'jun/2026', 'jul/2026', 'ago/2026']) expect(h).toContain(`<td>${r}</td>`);
    expect(h).toMatch(/<tr class="total"><td>Total<\/td>/);
    expect(h).toContain('R$ 346,50');
  });

  it('rateio: tabela por unidade com as somas do período e o saldo de hoje', () => {
    const h = renderRelatorioPeriodoHtml(rel(), marca);
    expect(h).toContain('Rateio dos créditos');
    expect(h).toContain('A-111');
    expect(h).toContain('C-333');
    expect(h).toContain('140 kWh');
  });

  it('sem rateio (uma unidade) → sem a seção de unidades', () => {
    const h = renderRelatorioPeriodoHtml(rel({ rateio: [] }), marca);
    expect(h).not.toContain('Rateio dos créditos');
  });

  it('créditos a vencer em alerta; validade só informa', () => {
    expect(renderRelatorioPeriodoHtml(rel(), marca)).toMatch(/vencem em <b>dez\/2026<\/b>/);
    const v = renderRelatorioPeriodoHtml(rel({ creditos: { ...rel().creditos, avisoVencimento: 'validade' } }), marca);
    expect(v).toMatch(/válidos até <b>dez\/2026<\/b>/);
  });

  it('desempenho do período quando há esperado', () => {
    expect(renderRelatorioPeriodoHtml(rel(), marca)).toContain('<b>96%</b>');
    const s = renderRelatorioPeriodoHtml(rel({ desempenho: { esperadoKwh: null, percentual: null, potenciaKwp: null } }), marca);
    expect(s).not.toContain('Desempenho');
  });

  it('marca do tenant, nunca EcoSun', () => {
    const h = renderRelatorioPeriodoHtml(rel(), marca);
    expect(h).toContain('Conquista Solar');
    expect(h).not.toMatch(/ecosun/i);
    expect(h).toContain(`background:${marca.cor}`);
  });

  it('muitos meses ou unidades → tabelas mais compactas pra caber em 2 páginas', () => {
    const muitos = Array.from({ length: 12 }, (_, i) => mes(`2026-${String(i + 1).padStart(2, '0')}-01`, `m${i}`, `m${i}`, 500));
    const h = renderRelatorioPeriodoHtml(rel({ meses: muitos }), marca);
    expect(h).toContain('class="apertada"');
    expect(renderRelatorioPeriodoHtml(rel(), marca)).not.toContain('class="apertada"');
  });
});
