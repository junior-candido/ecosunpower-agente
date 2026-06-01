import { describe, it, expect } from 'vitest';
import { SOLAR_SCENES, pickScene } from '../src/modules/marketing/solar-scenes.js';

describe('solar-scenes', () => {
  it('tem pelo menos 8 cenas distintas', () => {
    const keys = new Set(SOLAR_SCENES.map((s) => s.key));
    expect(keys.size).toBe(SOLAR_SCENES.length);
    expect(keys.size).toBeGreaterThanOrEqual(8);
  });

  it('nunca repete a última cena', () => {
    let last: string | undefined;
    for (let i = 0; i < 200; i++) {
      const { scene } = pickScene(last);
      expect(scene.key).not.toBe(last);
      last = scene.key;
    }
  });

  it('o prompt inclui a base da cena + uma variação', () => {
    // rng fixo (sempre 0) → primeira cena, primeira variação
    const { scene, prompt, seed } = pickScene(undefined, () => 0);
    expect(prompt.startsWith(scene.prompt)).toBe(true);
    expect(prompt.length).toBeGreaterThan(scene.prompt.length);
    expect(seed).toBe(0);
  });

  it('ao longo da rotação cobre todas as cenas', () => {
    const vistas = new Set<string>();
    let last: string | undefined;
    // PRNG determinístico (mulberry32) pra cobertura reprodutível
    let a = 0x9e3779b9;
    const rng = () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < 500; i++) {
      const { scene } = pickScene(last, rng);
      vistas.add(scene.key);
      last = scene.key;
    }
    expect(vistas.size).toBe(SOLAR_SCENES.length);
  });
});
