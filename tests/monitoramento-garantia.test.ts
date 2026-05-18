// tests/monitoramento-garantia.test.ts
import { describe, it, expect } from 'vitest';
import { garantiaInfo } from '../src/modules/monitoring/garantia.js';

const HOJE = new Date('2026-05-18T12:00:00Z');

describe('garantiaInfo', () => {
  it('sem data_instalacao -> tudo indefinido, não inventa', () => {
    const r = garantiaInfo({ data_instalacao: null, marca_inversor: 'deye', painel_marca: null }, HOJE);
    expect(r.idadeTexto).toBe('—');
    expect(r.ecosun.status).toBe('indefinida');
    expect(r.fabricanteInversor).toBe('informar equipamento');
  });

  it('instalada há 5 meses -> garantia EcoSun vigente, 7 meses restantes', () => {
    const r = garantiaInfo({ data_instalacao: '2025-12-18', marca_inversor: 'deye', painel_marca: 'Trina Solar' }, HOJE);
    expect(r.idadeTexto).toBe('5 meses');
    expect(r.ecosun.status).toBe('vigente');
    expect(r.ecosun.mesesRestantes).toBe(7);
  });

  it('instalada há 20 meses -> garantia EcoSun encerrada há 8 meses', () => {
    const r = garantiaInfo({ data_instalacao: '2024-09-18', marca_inversor: 'solaredge', painel_marca: 'LONGi' }, HOJE);
    expect(r.ecosun.status).toBe('encerrada');
    expect(r.ecosun.mesesDesdeFim).toBe(8);
    expect(r.idadeTexto).toBe('1 ano 8 meses');
  });

  it('marca de inversor conhecida na tabela -> anos do fabricante; desconhecida -> consultar', () => {
    const r1 = garantiaInfo({ data_instalacao: '2025-01-01', marca_inversor: 'solaredge', painel_marca: null }, HOJE);
    expect(r1.fabricanteInversor).toBe('12 anos');
    expect(r1.fabricantePainel).toBe('informar equipamento');
    const r2 = garantiaInfo({ data_instalacao: '2025-01-01', marca_inversor: 'marcaX', painel_marca: 'Jinko Solar' }, HOJE);
    expect(r2.fabricanteInversor).toBe('consultar fabricante');
  });

  it('data inválida -> indefinida, não throw', () => {
    const r = garantiaInfo({ data_instalacao: 'invalid-date', marca_inversor: 'deye', painel_marca: null }, HOJE);
    expect(r.idadeTexto).toBe('—');
    expect(r.ecosun.status).toBe('indefinida');
  });

  it('data futura -> Math.max(0) protege, vigente com 12 mesesRestantes', () => {
    const r = garantiaInfo({ data_instalacao: '2026-06-01', marca_inversor: null, painel_marca: null }, HOJE);
    expect(r.idadeTexto).toBe('menos de 1 mês');
    expect(r.ecosun.status).toBe('vigente');
    expect(r.ecosun.mesesRestantes).toBe(12);
  });

  it('exatamente 12 meses -> 0 mesesRestantes, ainda vigente (boundary)', () => {
    const r = garantiaInfo({ data_instalacao: '2025-05-18', marca_inversor: null, painel_marca: null }, HOJE);
    // Semanticamente: "12 meses de garantia" = cliente protegido ATÉ o dia 12, portanto HOJE está vigente
    expect(r.ecosun.status).toBe('vigente');
    expect(r.ecosun.mesesRestantes).toBe(0);
  });

  it('13 meses (pós-boundary) -> encerrada', () => {
    // Um mês depois do vencimento de 12 meses (2025-04-18 + 13 meses = 2026-05-18)
    const r = garantiaInfo({ data_instalacao: '2025-04-18', marca_inversor: null, painel_marca: null }, HOJE);
    expect(r.ecosun.status).toBe('encerrada');
    expect(r.ecosun.mesesDesdeFim).toBe(1);
  });

  it('marca com whitespace -> trim limpa, indefinida', () => {
    const r = garantiaInfo({ data_instalacao: '2025-01-01', marca_inversor: '   ', painel_marca: '  ' }, HOJE);
    expect(r.fabricanteInversor).toBe('informar equipamento');
    expect(r.fabricantePainel).toBe('informar equipamento');
  });

  it('pluralização: 1 mês singular, 2+ meses plural', () => {
    const r1 = garantiaInfo({ data_instalacao: '2026-04-18', marca_inversor: null, painel_marca: null }, HOJE);
    expect(r1.idadeTexto).toBe('1 mês');
    const r2 = garantiaInfo({ data_instalacao: '2026-03-18', marca_inversor: null, painel_marca: null }, HOJE);
    expect(r2.idadeTexto).toBe('2 meses');
  });

  it('pluralização: 24 meses -> "2 anos", 25 meses -> "2 anos 1 mês"', () => {
    const r1 = garantiaInfo({ data_instalacao: '2024-05-18', marca_inversor: null, painel_marca: null }, HOJE);
    expect(r1.idadeTexto).toBe('2 anos');
    const r2 = garantiaInfo({ data_instalacao: '2024-04-18', marca_inversor: null, painel_marca: null }, HOJE);
    expect(r2.idadeTexto).toBe('2 anos 1 mês');
  });
});
