import { describe, it, expect } from 'vitest';
import { melhorOrigem, melhorVendedor } from '../src/modules/bi-melhor-origem-vendedor.js';

describe('melhorOrigem', () => {
  it('retorna null para lista vazia', () => {
    expect(melhorOrigem([])).toBeNull();
  });

  it('retorna null quando não há leads ganhos', () => {
    const leads = [
      { canal: 'meta' as const, status: 'perdido' },
      { canal: 'google' as const, status: 'qualificando' },
    ];
    expect(melhorOrigem(leads)).toBeNull();
  });

  it('retorna o único canal com ganho', () => {
    const leads = [
      { canal: 'meta' as const, status: 'ganho' },
      { canal: 'google' as const, status: 'perdido' },
    ];
    expect(melhorOrigem(leads)).toBe('meta');
  });

  it('retorna o canal com mais ganhos', () => {
    const leads = [
      { canal: 'meta' as const, status: 'ganho' },
      { canal: 'meta' as const, status: 'ganho' },
      { canal: 'google' as const, status: 'ganho' },
      { canal: 'indicacao' as const, status: 'perdido' },
    ];
    expect(melhorOrigem(leads)).toBe('meta');
  });

  it('em empate retorna o primeiro que atingiu o máximo', () => {
    const leads = [
      { canal: 'google' as const, status: 'ganho' },
      { canal: 'meta' as const, status: 'ganho' },
    ];
    // google aparece primeiro e chega ao máximo (1) antes do meta
    expect(melhorOrigem(leads)).toBe('google');
  });
});

describe('melhorVendedor', () => {
  it('retorna null para lista vazia', () => {
    expect(melhorVendedor([])).toBeNull();
  });

  it('retorna null quando não há leads ganhos', () => {
    const leads = [
      { claimedBy: 'Lucas', status: 'perdido' },
      { claimedBy: 'Ana', status: 'qualificando' },
    ];
    expect(melhorVendedor(leads)).toBeNull();
  });

  it('ignora leads sem claimedBy', () => {
    const leads = [
      { claimedBy: null, status: 'ganho' },
      { claimedBy: 'Lucas', status: 'ganho' },
    ];
    expect(melhorVendedor(leads)).toBe('Lucas');
  });

  it('retorna o vendedor com mais ganhos', () => {
    const leads = [
      { claimedBy: 'Lucas', status: 'ganho' },
      { claimedBy: 'Lucas', status: 'ganho' },
      { claimedBy: 'Ana', status: 'ganho' },
      { claimedBy: 'Ana', status: 'perdido' },
    ];
    expect(melhorVendedor(leads)).toBe('Lucas');
  });

  it('retorna null quando todos os ganhos estão sem claimedBy', () => {
    const leads = [
      { claimedBy: null, status: 'ganho' },
    ];
    expect(melhorVendedor(leads)).toBeNull();
  });
});
