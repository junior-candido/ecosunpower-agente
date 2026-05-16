import { describe, it, expect } from 'vitest';
import { buildHybridKnowledge } from '../../src/modules/rag/hybrid.js';

describe('buildHybridKnowledge', () => {
  it('core + chunks concatenados', () => {
    const out = buildHybridKnowledge('CORE6', ['chunkA', 'chunkB']);
    expect(out).toContain('CORE6');
    expect(out).toContain('chunkA');
    expect(out).toContain('chunkB');
  });
  it('sem chunks → só core (fallback)', () => {
    expect(buildHybridKnowledge('CORE6', [])).toBe('CORE6');
  });
});
