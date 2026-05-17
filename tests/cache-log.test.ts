import { describe, it, expect } from 'vitest';
import { formatCacheUsage } from '../src/modules/cache-log.js';

// Prova do ganho do prompt caching (commit 71c8583) em prod: linha [cache]
// por resposta do brain mostrando quanto veio do cache (~10% do preço) vs
// cobrado cheio. Sem isso o ganho é inferido, não medido.
describe('formatCacheUsage', () => {
  it('formata read/write/uncached/out + hit% (maioria do input cacheada)', () => {
    const line = formatCacheUsage({
      cache_read_input_tokens: 12000,
      cache_creation_input_tokens: 0,
      input_tokens: 400,
      output_tokens: 500,
    });
    expect(line).toContain('[cache]');
    expect(line).toContain('read=12000');
    expect(line).toContain('write=0');
    expect(line).toContain('uncached=400');
    expect(line).toContain('out=500');
    expect(line).toContain('96.8%'); // 12000 / (12000+0+400)
  });

  it('1º request (cache write, sem read) -> hit baixo', () => {
    const line = formatCacheUsage({
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 15000,
      input_tokens: 400,
      output_tokens: 300,
    });
    expect(line).toContain('write=15000');
    expect(line).toContain('0.0%');
  });

  it('null/undefined nos campos de cache -> tratados como 0, sem NaN', () => {
    const line = formatCacheUsage({
      cache_read_input_tokens: null,
      cache_creation_input_tokens: undefined,
      input_tokens: 800,
      output_tokens: 120,
    });
    expect(line).toContain('read=0');
    expect(line).toContain('write=0');
    expect(line).toContain('uncached=800');
    expect(line).not.toContain('NaN');
    expect(line).toContain('0.0%');
  });

  it('usage ausente (undefined/null) -> NUNCA estoura (log não pode quebrar a resposta)', () => {
    expect(() => formatCacheUsage(undefined as never)).not.toThrow();
    expect(() => formatCacheUsage(null as never)).not.toThrow();
    const line = formatCacheUsage(undefined as never);
    expect(line).toContain('[cache]');
    expect(line).not.toContain('NaN');
    expect(line).toContain('0.0%');
  });

  it('input total zero -> não quebra, hit 0.0%', () => {
    const line = formatCacheUsage({
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
    });
    expect(line).not.toContain('NaN');
    expect(line).toContain('0.0%');
  });
});
