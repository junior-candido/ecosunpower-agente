import { describe, it, expect } from 'vitest';
import { pickTopicType, ALL_TOPIC_TYPES } from '../../src/modules/marketing/post-rotation.js';

function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('pickTopicType', () => {
  it('lista os 6 tipos', () => {
    expect(ALL_TOPIC_TYPES).toHaveLength(6);
  });

  it('nunca devolve um tipo presente em excludeTypes', () => {
    const exclude = ALL_TOPIC_TYPES.slice(0, 3);
    const t = pickTopicType(exclude, seqRng([0]));
    expect(exclude).not.toContain(t);
  });

  it('cai no pool cheio quando a exclusão esgota os tipos', () => {
    const t = pickTopicType([...ALL_TOPIC_TYPES], seqRng([0]));
    expect(ALL_TOPIC_TYPES).toContain(t);
  });
});
