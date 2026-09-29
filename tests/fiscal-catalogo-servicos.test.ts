// tests/fiscal-catalogo-servicos.test.ts
// Catálogo de serviços (códigos das notas reais 82/83/85) + conta do IBS/CBS.
// Os valores esperados são os IMPRESSOS nas notas reais emitidas pelo portal.
import { describe, it, expect } from 'vitest';
import {
  CATALOGO_SERVICOS, IBSCBS_PADRAO, servicoDoCatalogo, ibsCbsDoServico, calcularIbsCbs, situacaoTributariaIbsCbs,
} from '../src/modules/financeiro/fiscal/catalogo-servicos.js';

describe('catálogo de serviços', () => {
  it('tem os 3 serviços das notas reais com os códigos do portal', () => {
    const n82 = CATALOGO_SERVICOS.find((s) => s.nbs === '1.2001.60.00')!;
    expect(n82).toMatchObject({ codTribNacional: '14.01.01', atividadeMunicipal: '14.01', aliquotaIss: 0.05, issRetidoPjDf: true });
    expect(n82.ibscbs).toMatchObject({ cIndOp: '050102', cClassTrib: '000001', cst: '000' });
    const n83 = CATALOGO_SERVICOS.find((s) => s.codTribNacional === '31.01.02')!;
    expect(n83).toMatchObject({ atividadeMunicipal: '31.01', nbs: '1.1415.00.00', aliquotaIss: 0.05 });
    expect(n83.ibscbs).toMatchObject({ cIndOp: '100301', cClassTrib: '200052', cst: '200', pRedAliq: 30 });
    const n85 = CATALOGO_SERVICOS.find((s) => s.nbs === '1.1803.29.00')!;
    expect(n85).toMatchObject({ codTribNacional: '14.01.01', atividadeMunicipal: '14.01' });
    expect(n85.ibscbs).toMatchObject({ cIndOp: '050101', cClassTrib: '000001', cst: '000' });
  });
  it('padrão (serviço fora do catálogo) = nota 82: CST 000 / cClassTrib 000001 / cIndOp 050102 / CBS 0,9% / IBS UF 0,1% / IBS Mun 0%', () => {
    expect(IBSCBS_PADRAO).toMatchObject({ cst: '000', cClassTrib: '000001', cIndOp: '050102', pCBS: 0.9, pIBSUF: 0.1, pIBSMun: 0, pRedAliq: 0 });
    expect(ibsCbsDoServico('07.02.02', null)).toEqual(IBSCBS_PADRAO);
  });
  it('acha pelo código (com ou sem pontos) e desempata pelo NBS', () => {
    expect(servicoDoCatalogo('310102', null)?.nbs).toBe('1.1415.00.00');
    expect(servicoDoCatalogo('14.01.01', '118032900')?.ibscbs.cIndOp).toBe('050101');
    expect(servicoDoCatalogo('14.01.01', '1.2001.60.00')?.ibscbs.cIndOp).toBe('050102');
    expect(servicoDoCatalogo('14.01.01', null)?.nbs).toBe('1.2001.60.00'); // sem NBS: o da nota 82
    expect(servicoDoCatalogo('01.05.00', null)).toBeNull();
  });
  it('todo código do catálogo tem formato que o schema aceita', () => {
    for (const s of CATALOGO_SERVICOS) {
      expect(s.ibscbs.cst).toMatch(/^\d{3}$/);
      expect(s.ibscbs.cClassTrib).toMatch(/^\d{6}$/);
      expect(s.ibscbs.cIndOp).toMatch(/^\d{6}$/);
      expect(s.nbs.replace(/\D/g, '')).toMatch(/^\d{9}$/);
    }
  });
  it('situação tributária em texto (como o portal imprime)', () => {
    expect(situacaoTributariaIbsCbs('000')).toBe('Tributação integral');
    expect(situacaoTributariaIbsCbs('200')).toBe('Alíquota reduzida');
    expect(situacaoTributariaIbsCbs('999')).toBe('999');
  });
});

describe('calcularIbsCbs — bate centavo a centavo com as notas reais', () => {
  it('nota 82 (Superbom 19.995, ISS retido 999,75): base 18.995,25 · CBS 170,96 · IBS Est 19,00 · IBS Mun 0', () => {
    const r = calcularIbsCbs(19995, 999.75, ibsCbsDoServico('14.01.01', '1.2001.60.00'));
    expect(r).toMatchObject({ vBC: 18995.25, pAliqEfetCBS: 0.9, vCBS: 170.96, pAliqEfetUF: 0.1, vIBSUF: 19.0, vIBSMun: 0, vIBSTot: 19.0 });
  });
  it('nota 83 (Spazio 1.250, alíquota reduzida 30%): base 1.187,50 · CBS 0,63% = 7,48 · IBS Est 0,07% = 0,83', () => {
    const r = calcularIbsCbs(1250, 62.5, ibsCbsDoServico('31.01.02', '1.1415.00.00'));
    expect(r.vBC).toBe(1187.5);
    expect(r.pAliqEfetCBS).toBeCloseTo(0.63, 5);
    expect(r.vCBS).toBe(7.48);
    expect(r.pAliqEfetUF).toBeCloseTo(0.07, 5);
    expect(r.vIBSUF).toBe(0.83);
    expect(r.vIBSMun).toBe(0);
  });
  it('nota 85 (União Adventista 2.500, ISS NÃO retido 125): a base desconta o ISS mesmo sem retenção · total 23,76', () => {
    const r = calcularIbsCbs(2500, 125, ibsCbsDoServico('14.01.01', '1.1803.29.00'));
    expect(r).toMatchObject({ vBC: 2375, vCBS: 21.38, vIBSUF: 2.38, vIBSMun: 0 });
    expect(Math.round((r.vCBS + r.vIBSTot) * 100) / 100).toBe(23.76);
  });
});
