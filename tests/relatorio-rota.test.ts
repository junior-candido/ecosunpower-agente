// tests/relatorio-rota.test.ts
import { describe, it, expect } from 'vitest';
import { resolverRelatorioSlug } from '../src/modules/monitoring/relatorio/resolver.js';

describe('resolverRelatorioSlug', () => {
  it('slug inválido -> not_found', async () => {
    const r = await resolverRelatorioSlug({ getSlug: async () => null }, 'curto');
    expect(r).toEqual({ status: 'invalido' });
  });
  it('slug não existe/expirado -> expirado', async () => {
    const r = await resolverRelatorioSlug({ getSlug: async () => null }, 'abcdefghijklmnopqrst');
    expect(r).toEqual({ status: 'expirado' });
  });
  it('slug válido -> sistema_id', async () => {
    const r = await resolverRelatorioSlug({ getSlug: async () => ({ sistema_id: 's1', expira_em: 'x' }) }, 'abcdefghijklmnopqrst');
    expect(r).toEqual({ status: 'ok', sistemaId: 's1' });
  });
});
