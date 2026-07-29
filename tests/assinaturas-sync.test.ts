// Fatia 3a — quando a assinatura trava/destrava, o ACESSO real acompanha:
// calculadora via ponte HTTP (token compartilhado), monitoramento via
// companies.ativo (login do tenant cai). Best-effort: falha avisa, não explode.
import { describe, it, expect, vi } from 'vitest';
import { aplicarAcesso, validoAteDaAssinatura } from '../src/modules/assinaturas-sync.js';

const CALC = {
  id: 'a1', produtoId: 'calculadora', produtoNome: 'Calculadora', nome: 'Fulano',
  email: 'f@x.com', telefone: null, zapConfirmado: false, valorCentavos: 5700,
  limite: null, venceEm: '2026-08-20', status: 'ativa' as const, companyId: null,
};
const MONIT = { ...CALC, id: 'a2', produtoId: 'monitoramento', produtoNome: 'Monitoramento', companyId: 'comp-sabion' };

function mockClient() {
  const updates: any[] = [];
  const chain: any = {
    update(row: any) { updates.push(row); return chain; },
    eq() { return chain; },
    then(res: any, rej: any) { return Promise.resolve({ data: null, error: null }).then(res, rej); },
  };
  return { client: { from: () => chain } as any, updates };
}

describe('validoAteDaAssinatura (rede de segurança = vencimento + 4 dias)', () => {
  it('soma 4 dias ao vencimento', () => {
    expect(validoAteDaAssinatura('2026-08-20')).toBe('2026-08-24');
    expect(validoAteDaAssinatura('2026-08-29')).toBe('2026-09-02'); // vira o mês
  });
});

describe('aplicarAcesso — calculadora (ponte HTTP)', () => {
  const env = { calculadoraUrl: 'https://calc.exemplo.com', syncToken: 'tok-123' };
  it('liberar → POST com token, email e validoAte', async () => {
    const fetchFake = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    const { client } = mockClient();
    const ok = await aplicarAcesso(client, CALC, 'liberar', { env, fetchImpl: fetchFake as any });
    expect(ok).toBe(true);
    const [url, init] = fetchFake.mock.calls[0];
    expect(url).toBe('https://calc.exemplo.com/api/acesso-sync');
    expect(init.headers['x-sync-token']).toBe('tok-123');
    expect(JSON.parse(init.body)).toEqual({ email: 'f@x.com', acao: 'liberar', validoAte: '2026-08-24' });
  });
  it('travar → acao travar', async () => {
    const fetchFake = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    const { client } = mockClient();
    await aplicarAcesso(client, CALC, 'travar', { env, fetchImpl: fetchFake as any });
    expect(JSON.parse(fetchFake.mock.calls[0][1].body).acao).toBe('travar');
  });
  it('ponte fora do ar → false + avisarFalha (não explode)', async () => {
    const fetchFake = vi.fn().mockRejectedValue(new Error('rede caiu'));
    const avisar = vi.fn();
    const { client } = mockClient();
    const ok = await aplicarAcesso(client, CALC, 'travar', { env, fetchImpl: fetchFake as any, avisarFalha: avisar });
    expect(ok).toBe(false);
    expect(avisar).toHaveBeenCalled();
  });
  it('sem env configurada → true (ponte desligada de propósito, não é falha)', async () => {
    const { client } = mockClient();
    const ok = await aplicarAcesso(client, CALC, 'liberar', { env: { calculadoraUrl: undefined, syncToken: undefined } });
    expect(ok).toBe(true);
  });
});

describe('aplicarAcesso — monitoramento (companies.ativo)', () => {
  it('travar → companies.ativo = false; liberar → true', async () => {
    const t = mockClient();
    await aplicarAcesso(t.client, MONIT, 'travar', { env: {} });
    expect(t.updates[0]).toEqual({ ativo: false });
    const l = mockClient();
    await aplicarAcesso(l.client, MONIT, 'liberar', { env: {} });
    expect(l.updates[0]).toEqual({ ativo: true });
  });
  it('sem companyId → true e não mexe (nada pra travar)', async () => {
    const { client, updates } = mockClient();
    const ok = await aplicarAcesso(client, { ...MONIT, companyId: null }, 'travar', { env: {} });
    expect(ok).toBe(true);
    expect(updates.length).toBe(0);
  });
});
