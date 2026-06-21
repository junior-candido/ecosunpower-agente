import { describe, it, expect } from 'vitest';
import { pickScene, SOLAR_SCENES } from '../../src/modules/marketing/solar-scenes.js';

// rng determinístico: devolve valores fixos em sequência (cicla).
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('pickScene', () => {
  it('nunca devolve uma cena que está em excludeKeys', () => {
    const exclude = SOLAR_SCENES.slice(0, 3).map((s) => s.key);
    const { scene } = pickScene(exclude, seqRng([0, 0, 0]));
    expect(exclude).not.toContain(scene.key);
  });

  it('cai no pool cheio quando a exclusão esgota as cenas', () => {
    const exclude = SOLAR_SCENES.map((s) => s.key); // exclui todas
    const { scene } = pickScene(exclude, seqRng([0, 0, 0]));
    expect(scene).toBeDefined();
    expect(SOLAR_SCENES.map((s) => s.key)).toContain(scene.key);
  });

  it('combina cena + variação de luz + variação de composição no prompt', () => {
    const { prompt, scene } = pickScene([], seqRng([0, 0, 0]));
    expect(prompt.startsWith(scene.prompt)).toBe(true);
    const sufixos = prompt.slice(scene.prompt.length).split(',').filter((s) => s.trim());
    expect(sufixos.length).toBeGreaterThanOrEqual(2);
  });

  it('aceita string única por retrocompatibilidade defensiva', () => {
    const { scene } = pickScene([SOLAR_SCENES[0]!.key], seqRng([0, 0, 0]));
    expect(scene.key).not.toBe(SOLAR_SCENES[0]!.key);
  });
});
