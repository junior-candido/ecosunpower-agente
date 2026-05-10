// tests/marketing/creative-filters.test.ts
import { describe, it, expect } from 'vitest';
import { applyAllFilters, blocklistFilter, marcaFilter, criterio700Filter } from '../../src/modules/marketing/creative-filters.js';
import type { CreativePackage, Persona } from '../../src/modules/marketing/types.js';

const PERSONA_RESIDENCIAL: Persona = {
  id: 1, codigo: 'residencial_df_alto', nome: 'Residencial DF', categoria_portfolio: 'on_grid_residencial',
  descricao: '', conta_minima_brl: 700, consumo_minimo_kwh: 700, regiao_alvo: 'DF',
  palavras_proibidas: ['alugar terra', 'arrendar', 'fazenda solar', 'engenheiro'],
  contexto_marca: {},
};

const PACKAGE_OK: CreativePackage = {
  briefing: 'casa DF', persona_id: 1, imagens: [],
  copies: [{ length: 'curto', headline: 'Energia solar pra sua casa', body: 'Economize R$ 1000/mês', cta: 'Quero saber' }],
  cta_primario: 'Quero saber', justificativa: '',
};

describe('blocklistFilter', () => {
  it('passa quando nenhuma palavra proibida', () => {
    expect(blocklistFilter(PACKAGE_OK, PERSONA_RESIDENCIAL).passed).toBe(true);
  });

  it('rejeita "alugar terra"', () => {
    const bad = { ...PACKAGE_OK, copies: [{ ...PACKAGE_OK.copies[0], body: 'Quer alugar terra pra usina?' }] };
    const r = blocklistFilter(bad, PERSONA_RESIDENCIAL);
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('alugar terra');
  });

  it('rejeita case-insensitive', () => {
    const bad = { ...PACKAGE_OK, copies: [{ ...PACKAGE_OK.copies[0], body: 'ARRENDAR sua propriedade' }] };
    expect(blocklistFilter(bad, PERSONA_RESIDENCIAL).passed).toBe(false);
  });

  it('rejeita em headline tambem', () => {
    const bad = { ...PACKAGE_OK, copies: [{ ...PACKAGE_OK.copies[0], headline: 'Fazenda solar?' }] };
    expect(blocklistFilter(bad, PERSONA_RESIDENCIAL).passed).toBe(false);
  });
});

describe('marcaFilter', () => {
  it('rejeita "engenheiro" — deve usar Responsavel Tecnico CREA/CFT', () => {
    const bad = { ...PACKAGE_OK, copies: [{ ...PACKAGE_OK.copies[0], body: 'Atendido por engenheiro qualificado' }] };
    const r = marcaFilter(bad);
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('engenheiro');
  });

  it('passa quando usa "Responsavel Tecnico"', () => {
    const ok = { ...PACKAGE_OK, copies: [{ ...PACKAGE_OK.copies[0], body: 'Responsável Técnico CREA/CFT acompanha cada projeto' }] };
    expect(marcaFilter(ok).passed).toBe(true);
  });
});

describe('criterio700Filter', () => {
  it('passa quando copy menciona criterio R$ 700+', () => {
    const ok = { ...PACKAGE_OK, copies: [{ ...PACKAGE_OK.copies[0], body: 'Pra contas acima de R$ 700/mês' }] };
    expect(criterio700Filter(ok, PERSONA_RESIDENCIAL).passed).toBe(true);
  });

  it('passa quando persona tem conta_minima_brl=0 (off-grid)', () => {
    const offgrid: Persona = { ...PERSONA_RESIDENCIAL, conta_minima_brl: 0, consumo_minimo_kwh: 0 };
    const pkg = { ...PACKAGE_OK, copies: [{ ...PACKAGE_OK.copies[0], body: 'Energia 24h no sitio' }] };
    expect(criterio700Filter(pkg, offgrid).passed).toBe(true);
  });

  it('warning (nao rejeita) quando residencial nao menciona 700', () => {
    const r = criterio700Filter(PACKAGE_OK, PERSONA_RESIDENCIAL);
    expect(r.passed).toBe(true);  // nao rejeita, mas passa info
  });
});

describe('applyAllFilters', () => {
  it('overall_passed=true quando tudo OK', () => {
    const r = applyAllFilters(PACKAGE_OK, PERSONA_RESIDENCIAL);
    expect(r.overall_passed).toBe(true);
  });

  it('overall_passed=false quando blocklist falha', () => {
    const bad = { ...PACKAGE_OK, copies: [{ ...PACKAGE_OK.copies[0], body: 'arrendar' }] };
    expect(applyAllFilters(bad, PERSONA_RESIDENCIAL).overall_passed).toBe(false);
  });
});
