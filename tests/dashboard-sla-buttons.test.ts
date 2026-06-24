import { describe, it, expect } from 'vitest';
import { parseSlaButton } from '../src/modules/dashboard/sla-notifier.js';

describe('parseSlaButton', () => {
  it('reconhece os 3 ids', () => {
    expect(parseSlaButton('sla_cobrar:abc')).toEqual({ acao: 'cobrar', tid: 'abc' });
    expect(parseSlaButton('sla_eufalo:xyz')).toEqual({ acao: 'eufalo', tid: 'xyz' });
    expect(parseSlaButton('sla_adiar:t1')).toEqual({ acao: 'adiar', tid: 't1' });
  });
  it('ignora ids que não são sla', () => {
    expect(parseSlaButton('evabt:algo')).toBeNull();
  });
});
