import { describe, it, expect } from 'vitest';
import {
  cifrarCred, decifrarCred, novoTokenMedidor, hashToken, tokenConfere, segredoConfere,
  normalizarServerUri, mascarar, chaveEnergiaValida, normalizarDeviceId,
} from '../src/modules/energia/credenciais.js';

const KEY = 'a'.repeat(64);

describe('credenciais da nuvem Shelly (cifradas)', () => {
  it('cifrar → decifrar devolve o que entrou', () => {
    const c = { server_uri: 'https://shelly-77-eu.shelly.cloud', auth_key: 'MzE2YWJjZGVm-segredo' };
    const s = cifrarCred(c, KEY);
    expect(decifrarCred(s, KEY)).toEqual(c);
  });
  it('o texto cifrado não contém a chave', () => {
    const s = cifrarCred({ server_uri: 'https://x.shelly.cloud', auth_key: 'CHAVE-SUPER-SECRETA' }, KEY);
    expect(s).not.toContain('CHAVE-SUPER-SECRETA');
    expect(Buffer.from(s, 'base64').toString('utf8')).not.toContain('CHAVE-SUPER-SECRETA');
  });
  it('chave de ambiente inválida lança com mensagem da ENERGIA_CRED_KEY (e sem ecoar a chave)', () => {
    expect(() => cifrarCred({ server_uri: 'https://x.shelly.cloud', auth_key: 'k' }, 'curta-demais')).toThrow(/ENERGIA_CRED_KEY/);
    try { cifrarCred({ server_uri: 'https://x.shelly.cloud', auth_key: 'k' }, 'curta-demais'); } catch (e) {
      expect((e as Error).message).not.toContain('curta-demais');
    }
  });
  it('chaveEnergiaValida', () => {
    expect(chaveEnergiaValida(KEY)).toBe(true);
    expect(chaveEnergiaValida(undefined)).toBe(false);
    expect(chaveEnergiaValida('zz')).toBe(false);
  });
  it('decifrar com a chave errada lança', () => {
    const s = cifrarCred({ server_uri: 'https://x.shelly.cloud', auth_key: 'k' }, KEY);
    expect(() => decifrarCred(s, 'b'.repeat(64))).toThrow();
  });
});

describe('token do medidor', () => {
  it('tem ≥ 32 bytes em base64url', () => {
    const t = novoTokenMedidor();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(t, 'base64url').length).toBeGreaterThanOrEqual(32);
    expect(novoTokenMedidor()).not.toBe(t);
  });
  it('hashToken é determinístico e não é o token', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('tokenConfere compara em tempo constante e recusa vazio', () => {
    const h = hashToken('tok-1');
    expect(tokenConfere('tok-1', h)).toBe(true);
    expect(tokenConfere('tok-2', h)).toBe(false);
    expect(tokenConfere('', h)).toBe(false);
    expect(tokenConfere('tok-1', '')).toBe(false);
    expect(tokenConfere('tok-1', 'nao-e-hex')).toBe(false);
  });
  it('segredoConfere (token global legado) compara em tempo constante', () => {
    expect(segredoConfere('segredo', 'segredo')).toBe(true);
    expect(segredoConfere('segredo', 'segredO')).toBe(false);
    expect(segredoConfere('seg', 'segredo')).toBe(false);
    expect(segredoConfere('', '')).toBe(false);
  });
});

describe('normalizações', () => {
  it('server_uri só da nuvem Shelly (evita SSRF pelo formulário)', () => {
    expect(normalizarServerUri('shelly-77-eu.shelly.cloud/')).toBe('https://shelly-77-eu.shelly.cloud');
    expect(normalizarServerUri('https://SHELLY-77-EU.shelly.cloud')).toBe('https://shelly-77-eu.shelly.cloud');
    expect(normalizarServerUri('http://shelly-77-eu.shelly.cloud')).toBe('https://shelly-77-eu.shelly.cloud');
    expect(normalizarServerUri('https://evil.com')).toBeNull();
    expect(normalizarServerUri('https://shelly.cloud.evil.com')).toBeNull();
    expect(normalizarServerUri('https://x.shelly.cloud@evil.com')).toBeNull();
    expect(normalizarServerUri('https://x.shelly.cloud/../x')).toBeNull();
    expect(normalizarServerUri('')).toBeNull();
  });
  it('mascarar mostra só o fim', () => {
    expect(mascarar('abcd1234')).toBe('••••1234');
    expect(mascarar('ab')).toBe('••••');
  });
  it('device_id sem o prefixo do modelo, minúsculo', () => {
    expect(normalizarDeviceId('shellypro3em-007007422D90')).toBe('007007422d90');
    expect(normalizarDeviceId(' 007007422d90 ')).toBe('007007422d90');
    expect(normalizarDeviceId('ShellyPro3EM-007007422d90')).toBe('007007422d90');
  });
});
