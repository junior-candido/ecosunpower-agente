// tests/relatorio-template.test.ts
import { describe, it, expect } from 'vitest';
import { renderRelatorioHtml } from '../src/modules/monitoring/relatorio/template.js';

const base: any = {
  modo: 'acompanhamento', apelido: 'Casa Silva', cidade: 'Brasília', uf: 'DF',
  marcaInversor: 'deye', potenciaKwp: 10,
  kpis: { hojeKwh: 30, mesKwh: 400, anoKwh: 5000, totalKwh: 12000 },
  serieMensal: [{ mes: '2026-04', kwh: 1100, esperado: 1248 }],
  economiaEstimadaReais: 12000,
  garantia: { idadeTexto: '5 meses', ecosun: { status: 'vigente', mesesRestantes: 7 },
    fabricanteInversor: '5 anos', fabricantePainel: 'consultar fabricante' },
  sinal: { gravidade: null, descritivo: 'ok', ratio7d: 0.9 },
  semDados: false,
};

describe('renderRelatorioHtml', () => {
  it('contém branding EcoSunPower + Responsável Técnico, NUNCA "engenheiro"', () => {
    const html = renderRelatorioHtml(base, 'acompanhamento');
    expect(html).toContain('ECOSUNPOWER');
    expect(html).toContain('Responsável Técnico');
    expect(html.toLowerCase()).not.toContain('engenheiro');
    expect(html).toContain('Casa Silva');
    expect(html).toContain('economia estimada');
  });
  it('modo manutencao mostra diagnóstico vs esperado; boas_vindas NÃO', () => {
    const manut = renderRelatorioHtml({ ...base, sinal: { gravidade: 'medio', descritivo: 'd', ratio7d: 0.6 } }, 'manutencao');
    expect(manut).toContain('vs esperado');
    const bv = renderRelatorioHtml(base, 'boas_vindas');
    expect(bv).not.toContain('vs esperado');
    expect(bv).toContain('Bem-vindo');
  });
  it('semDados -> bloco "dados em breve", não quebra', () => {
    const html = renderRelatorioHtml({ ...base, semDados: true }, 'boas_vindas');
    expect(html).toContain('dados em breve');
  });
});
