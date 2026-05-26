// tests/closing-buttons.test.ts
import { describe, it, expect, vi } from 'vitest';
import { tryHandleEvaAdminButton } from '../src/modules/eva-admin-buttons.js';

describe('eva-admin-buttons — cases fechar*', () => {
  function ctx() {
    return {
      client: {} as any,
      sendText: vi.fn(async (_to: string, _t: string) => {}),
      from: '5561993077140',
      forceCadenceForSilentes: async () => ({ acionados: 0 }),
      onFecharStart: vi.fn(async (_leadId: string) => {}),
      onFecharPick: vi.fn(async (_leadId: string) => {}),
      onFecharApprove: vi.fn(async (_fechamentoId: string) => {}),
      onFecharRefazer: vi.fn(async (_fechamentoId: string) => {}),
      onFecharCancel: vi.fn(async (_fechamentoId: string) => {}),
    };
  }

  it('evabt:fechar:<leadId> chama onFecharStart', async () => {
    const c = ctx();
    const handled = await tryHandleEvaAdminButton({
      ...c,
      text: 'evabt:fechar:11111111-1111-1111-1111-111111111111',
    });
    expect(handled).toBe(true);
    expect(c.onFecharStart).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
  });

  it('evabt:fechar-pick:<leadId> chama onFecharPick', async () => {
    const c = ctx();
    const handled = await tryHandleEvaAdminButton({
      ...c,
      text: 'evabt:fechar-pick:11111111-1111-1111-1111-111111111111',
    });
    expect(handled).toBe(true);
    expect(c.onFecharPick).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
  });

  it('evabt:fechar-aprovar:<fechamentoId> chama onFecharApprove', async () => {
    const c = ctx();
    const handled = await tryHandleEvaAdminButton({
      ...c,
      text: 'evabt:fechar-aprovar:22222222-2222-2222-2222-222222222222',
    });
    expect(handled).toBe(true);
    expect(c.onFecharApprove).toHaveBeenCalledWith('22222222-2222-2222-2222-222222222222');
  });

  it('evabt:fechar-refazer:<fechamentoId> chama onFecharRefazer', async () => {
    const c = ctx();
    const handled = await tryHandleEvaAdminButton({
      ...c,
      text: 'evabt:fechar-refazer:33333333-3333-3333-3333-333333333333',
    });
    expect(handled).toBe(true);
    expect(c.onFecharRefazer).toHaveBeenCalledWith('33333333-3333-3333-3333-333333333333');
  });

  it('evabt:fechar-cancelar:<fechamentoId> chama onFecharCancel', async () => {
    const c = ctx();
    const handled = await tryHandleEvaAdminButton({
      ...c,
      text: 'evabt:fechar-cancelar:44444444-4444-4444-4444-444444444444',
    });
    expect(handled).toBe(true);
    expect(c.onFecharCancel).toHaveBeenCalledWith('44444444-4444-4444-4444-444444444444');
  });

  it('texto não-botão retorna false', async () => {
    const c = ctx();
    const handled = await tryHandleEvaAdminButton({ ...c, text: 'oi tudo bem' });
    expect(handled).toBe(false);
  });
});
