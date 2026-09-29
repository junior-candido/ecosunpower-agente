// tests/fiscal-config-producao.test.ts
// Configuração pra produção: flag de e-mail automático (tolerante à migration 147
// ainda não aplicada) e códigos por serviço (cTribMun/NBS) sempre escopados na empresa.
import { describe, it, expect, vi } from 'vitest';
import { lerEmailAuto, salvarEmailAuto, salvarCodigosServico } from '../src/modules/financeiro/fiscal/notas-repo.js';

function chainMock(resultado: unknown) {
  const calls: Record<string, unknown[][]> = {};
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'update', 'eq']) chain[m] = vi.fn((...a: unknown[]) => { (calls[m] ??= []).push(a); return chain; });
  chain.maybeSingle = vi.fn().mockResolvedValue(resultado);
  chain.then = (res: (v: unknown) => void) => res(resultado);
  const from = vi.fn(() => chain);
  return { client: { from } as never, from, calls };
}

describe('flag de e-mail automático (fiscal_config.email_auto_tomador)', () => {
  it('lê true/false da empresa da sessão', async () => {
    const { client, calls } = chainMock({ data: { email_auto_tomador: true }, error: null });
    expect(await lerEmailAuto(client, 'c1')).toBe(true);
    expect(calls.eq).toContainEqual(['company_id', 'c1']);
  });
  it('coluna ainda não existe (migration 147 não aplicada) → desligado, sem erro', async () => {
    const { client } = chainMock({ data: null, error: { code: '42703', message: 'column fiscal_config.email_auto_tomador does not exist' } });
    expect(await lerEmailAuto(client, 'c1')).toBe(false);
  });
  it('salvar devolve false (sem explodir) quando a coluna não existe', async () => {
    const { client } = chainMock({ data: null, error: { code: '42703', message: 'column does not exist' } });
    expect(await salvarEmailAuto(client, 'c1', true)).toBe(false);
  });
  it('salvar escopa pela empresa', async () => {
    const { client, calls } = chainMock({ data: null, error: null });
    expect(await salvarEmailAuto(client, 'c1', true)).toBe(true);
    expect(calls.update![0][0]).toMatchObject({ email_auto_tomador: true });
    expect(calls.eq).toContainEqual(['company_id', 'c1']);
  });
});

describe('códigos por serviço (cTribMun + NBS)', () => {
  it('grava só número no cTribMun e NBS formatado, com company_id no filtro (anti-IDOR)', async () => {
    const { client, calls } = chainMock({ data: [{ id: 's1' }], error: null });
    const ok = await salvarCodigosServico(client, 'c1', 's1', { codTribMunicipal: ' 1401 ', nbs: '120016000' });
    expect(ok).toBe(true);
    expect(calls.update![0][0]).toEqual({ cod_trib_municipal: '1401', nbs: '1.2001.60.00' });
    expect(calls.eq).toContainEqual(['id', 's1']);
    expect(calls.eq).toContainEqual(['company_id', 'c1']);
  });
  it('recusa cTribMun que não é número ("14.01") e NBS sem 9 dígitos', async () => {
    const { client } = chainMock({ data: [], error: null });
    await expect(salvarCodigosServico(client, 'c1', 's1', { codTribMunicipal: '14.01', nbs: null })).rejects.toThrow(/número/);
    await expect(salvarCodigosServico(client, 'c1', 's1', { codTribMunicipal: '1401', nbs: '1.20' })).rejects.toThrow(/NBS/);
  });
  it('NBS vazio limpa o campo', async () => {
    const { client, calls } = chainMock({ data: [{ id: 's1' }], error: null });
    await salvarCodigosServico(client, 'c1', 's1', { codTribMunicipal: '7', nbs: '' });
    expect(calls.update![0][0]).toEqual({ cod_trib_municipal: '7', nbs: null });
  });
  it('serviço de outra empresa: nenhuma linha atualizada → false', async () => {
    const { client } = chainMock({ data: [], error: null });
    expect(await salvarCodigosServico(client, 'c2', 's1', { codTribMunicipal: '1', nbs: null })).toBe(false);
  });
});
