import { describe, it, expect, vi } from 'vitest';
import { estadoConexao, obterQrConexao, instanciaValida, normalizarNumeroPairing } from '../src/modules/evolution-conexao.js';

function fakeFetch(rotas: Record<string, { ok: boolean; body: unknown }>) {
  const chamadas: string[] = [];
  const f = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    chamadas.push(u);
    const hit = Object.entries(rotas).find(([k]) => u.includes(k));
    if (!hit) return { ok: false, status: 500, json: async () => null } as Response;
    // a apikey tem que ir no header, nunca na URL
    expect((init?.headers as Record<string, string>).apikey).toBe('chave');
    expect(u).not.toContain('chave');
    return { ok: hit[1].ok, status: hit[1].ok ? 200 : 500, json: async () => hit[1].body } as Response;
  });
  return { f: f as unknown as typeof fetch, chamadas };
}

const deps = (f: typeof fetch) => ({ baseUrl: 'https://evo.test/', apiKey: 'chave', fetchImpl: f });

describe('evolution-conexao — Conectar WhatsApp self-service', () => {
  it('valida nome de instância e número de pairing', () => {
    expect(instanciaValida('conquista-solar')).toBe(true);
    expect(instanciaValida('a/b')).toBe(false);
    expect(instanciaValida('')).toBe(false);
    expect(normalizarNumeroPairing('+55 (77) 9961-0038')).toBe('557799610038');
    expect(normalizarNumeroPairing('123')).toBeUndefined();
  });

  it('estado: lê instance.state e cai em "desconhecido" fora do esperado', async () => {
    const { f } = fakeFetch({ '/instance/connectionState/conquista-solar': { ok: true, body: { instance: { state: 'close' } } } });
    expect(await estadoConexao(deps(f), 'conquista-solar')).toBe('close');
    const { f: f2 } = fakeFetch({ '/connectionState/': { ok: true, body: { instance: { state: 'weird' } } } });
    expect(await estadoConexao(deps(f2), 'conquista-solar')).toBe('desconhecido');
    expect(await estadoConexao(deps(f), 'nome inválido')).toBe('desconhecido');
  });

  it('estado: 404 = instância inexistente · 401/5xx/timeout = erro (sem pedir QR)', async () => {
    const f404 = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await estadoConexao(deps(f404), 'sumida')).toBe('inexistente');
    expect((await obterQrConexao(deps(f404), 'sumida')).estado).toBe('inexistente');
    expect(f404).toHaveBeenCalledTimes(2);
    const f401 = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await estadoConexao(deps(f401), 'x')).toBe('erro');
    const fBoom = vi.fn(async () => { throw new Error('timeout'); }) as unknown as typeof fetch;
    expect(await estadoConexao(deps(fBoom), 'x')).toBe('erro');
    expect((await obterQrConexao(deps(fBoom), 'x')).estado).toBe('erro');
  });

  it('QR: 1ª chamada sem base64 (socket subindo) → connecting sem imagem; connect já "open" → open', async () => {
    const { f } = fakeFetch({
      '/connectionState/': { ok: true, body: { instance: { state: 'close' } } },
      '/instance/connect/': { ok: true, body: { count: 0 } },
    });
    expect(await obterQrConexao(deps(f), 'conquista-solar')).toEqual({ estado: 'connecting', base64: undefined, pairingCode: undefined });
    const { f: f2 } = fakeFetch({
      '/connectionState/': { ok: true, body: { instance: { state: 'connecting' } } },
      '/instance/connect/': { ok: true, body: { instance: { instanceName: 'conquista-solar', state: 'open' } } },
    });
    expect(await obterQrConexao(deps(f2), 'conquista-solar')).toEqual({ estado: 'open' });
  });

  it('QR: não pede QR quando já está open', async () => {
    const { f, chamadas } = fakeFetch({ '/connectionState/': { ok: true, body: { instance: { state: 'open' } } } });
    const r = await obterQrConexao(deps(f), 'conquista-solar');
    expect(r.estado).toBe('open');
    expect(r.base64).toBeUndefined();
    expect(chamadas.some((u) => u.includes('/instance/connect/'))).toBe(false);
  });

  it('QR: devolve base64 e pairing code (só com número) e sanitiza lixo', async () => {
    const { f, chamadas } = fakeFetch({
      '/connectionState/': { ok: true, body: { instance: { state: 'connecting' } } },
      '/instance/connect/': { ok: true, body: { base64: 'data:image/png;base64,AAAA', pairingCode: 'ywz8zmfe', code: 'x' } },
    });
    const r = await obterQrConexao(deps(f), 'conquista-solar', '557799610038');
    expect(r).toEqual({ estado: 'connecting', base64: 'data:image/png;base64,AAAA', pairingCode: 'YWZ8ZMFE' });
    expect(chamadas.find((u) => u.includes('/instance/connect/'))).toContain('number=557799610038');

    const { f: f2 } = fakeFetch({
      '/connectionState/': { ok: true, body: { instance: { state: 'close' } } },
      '/instance/connect/': { ok: true, body: { base64: 'javascript:alert(1)', pairingCode: 'nope' } },
    });
    const r2 = await obterQrConexao(deps(f2), 'conquista-solar');
    expect(r2.base64).toBeUndefined();
    expect(r2.pairingCode).toBeUndefined();
  });
});
