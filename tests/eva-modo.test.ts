// tests/eva-modo.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { isVitrineEcosof, promptFileDoModo, conhecimentoDirDoModo } from '../src/modules/eva-modo.js';

afterEach(() => { delete process.env.EVA_MODO; });

describe('eva-modo', () => {
  it('default (sem EVA_MODO) = solar', () => {
    expect(isVitrineEcosof()).toBe(false);
    expect(promptFileDoModo()).toBe('system-prompt.md');
    expect(conhecimentoDirDoModo()).toBe('conhecimento');
  });
  it('EVA_MODO=vitrine_ecosof → prompt e pasta da vitrine', () => {
    process.env.EVA_MODO = 'vitrine_ecosof';
    expect(isVitrineEcosof()).toBe(true);
    expect(promptFileDoModo()).toBe('system-prompt-vitrine.md');
    expect(conhecimentoDirDoModo()).toBe('conhecimento-ecosof');
  });
  it('valor desconhecido cai no solar (seguro)', () => {
    process.env.EVA_MODO = 'qualquer';
    expect(isVitrineEcosof()).toBe(false);
    expect(promptFileDoModo()).toBe('system-prompt.md');
  });
});
