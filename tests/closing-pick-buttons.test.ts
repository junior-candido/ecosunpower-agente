// tests/closing-pick-buttons.test.ts
import { describe, it, expect } from 'vitest';
import { buildFecharPickButtons } from '../src/modules/closing/closing-command-parser.js';

describe('buildFecharPickButtons', () => {
  // BUG real (Fabio Conti Antonioli x2): nomes iguais geravam botões com título
  // idêntico → WABA 400 "(#131009) Duplicate button title". Título tem de ser único.
  it('nomes idênticos → títulos ÚNICOS (prefixo numérico) e ≤20 chars', () => {
    const btns = buildFecharPickButtons(
      [
        { id: 'a', name: 'Fabio Conti Antonioli' },
        { id: 'b', name: 'Fabio Conti Antonioli' },
      ],
      'fechar',
    );
    expect(btns).toHaveLength(2);
    const titles = btns.map((b) => b.title);
    expect(new Set(titles).size).toBe(titles.length); // todos únicos
    for (const t of titles) expect(t.length).toBeLessThanOrEqual(20);
  });

  it('ids do botão certos por comando', () => {
    expect(buildFecharPickButtons([{ id: 'x', name: 'Ana' }], 'fechar')[0].id).toBe('evabt:fechar-pick:x');
    expect(buildFecharPickButtons([{ id: 'x', name: 'Ana' }], 'contrato')[0].id).toBe('evabt:fechar-doc:contrato:x');
    expect(buildFecharPickButtons([{ id: 'x', name: 'Ana' }], 'procuracao')[0].id).toBe('evabt:fechar-doc:procuracao:x');
  });

  it('dedupe por id (lead repetido não vira 2 botões)', () => {
    const btns = buildFecharPickButtons(
      [{ id: 'a', name: 'Fabio' }, { id: 'a', name: 'Fabio' }, { id: 'b', name: 'Fabio' }],
      'fechar',
    );
    expect(btns).toHaveLength(2);
    expect(btns.map((b) => b.id)).toEqual(['evabt:fechar-pick:a', 'evabt:fechar-pick:b']);
  });

  it('no máximo 3 botões', () => {
    const btns = buildFecharPickButtons(
      [{ id: '1', name: 'A' }, { id: '2', name: 'B' }, { id: '3', name: 'C' }, { id: '4', name: 'D' }],
      'fechar',
    );
    expect(btns).toHaveLength(3);
  });
});
