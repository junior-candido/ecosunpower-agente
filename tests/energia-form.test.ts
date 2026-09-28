import { describe, it, expect } from 'vitest';
import { validarFormMedidor } from '../src/modules/energia/form-medidor.js';
import { decifrarCred } from '../src/modules/energia/credenciais.js';

const KEY = 'd'.repeat(64);
const USINAS = [{ id: 'u1', lead_id: 'l1' }];
const base = { apelido: 'Quadro', device_id: 'shellypro3em-007007422D90', perfil: 'triphase', canal: '2', modo_coleta: 'push', consentimento: 'on' };
const ctx = (o = {}) => ({ usinas: USINAS, keyHex: KEY, temCredencialGuardada: false, novo: true, ...o });

describe('validarFormMedidor', () => {
  it('push simples: normaliza o id, liga usina e lead DA EMPRESA, carimba consentimento', () => {
    const r = validarFormMedidor({ ...base, sistema_id: 'u1', uc_instalacao: '12345678' }, ctx());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dados).toMatchObject({ device_id: '007007422d90', sistema_id: 'u1', lead_id: 'l1', canais: { rede: 2 }, modo_coleta: 'push' });
      expect(r.dados.consentimento_em).toBeTruthy();
      expect(r.dados).not.toHaveProperty('company_id'); // quem carimba é a rota, com a sessão
    }
  });
  it('usina de outra empresa é recusada', () => {
    const r = validarFormMedidor({ ...base, sistema_id: 'usina-de-outro' }, ctx());
    expect(r.ok).toBe(false);
  });
  it('sem consentimento no cadastro: recusa', () => {
    const r = validarFormMedidor({ ...base, consentimento: '' }, ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.join(' ')).toMatch(/LGPD/);
  });
  it('nuvem: cifra a chave e nunca devolve a chave em "valores"', () => {
    const r = validarFormMedidor({ ...base, modo_coleta: 'nuvem', server_uri: 'shelly-77-eu.shelly.cloud', auth_key: 'SEGREDO-XYZ' }, ctx());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(JSON.stringify(r.valores)).not.toContain('SEGREDO-XYZ');
      expect(String(r.dados.api_credentials_cifrado)).not.toContain('SEGREDO-XYZ');
      expect(decifrarCred(String(r.dados.api_credentials_cifrado), KEY)).toEqual({ server_uri: 'https://shelly-77-eu.shelly.cloud', auth_key: 'SEGREDO-XYZ' });
    }
  });
  it('nuvem com erro: a chave não volta pra tela', () => {
    const r = validarFormMedidor({ ...base, apelido: '', modo_coleta: 'nuvem', server_uri: 'x.shelly.cloud', auth_key: 'SEGREDO-XYZ' }, ctx());
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain('SEGREDO-XYZ');
  });
  it('nuvem sem ENERGIA_CRED_KEY: erro amigável, nada cifrado', () => {
    const r = validarFormMedidor({ ...base, modo_coleta: 'nuvem', server_uri: 'x.shelly.cloud', auth_key: 'k' }, ctx({ keyHex: undefined }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.join(' ')).toMatch(/ENERGIA_CRED_KEY/);
  });
  it('server_uri fora de *.shelly.cloud é recusado (SSRF)', () => {
    const r = validarFormMedidor({ ...base, modo_coleta: 'nuvem', server_uri: 'https://169.254.169.254', auth_key: 'k' }, ctx());
    expect(r.ok).toBe(false);
  });
  it('edição com chave guardada e campo em branco: mantém (não apaga nem exige)', () => {
    const r = validarFormMedidor({ ...base, modo_coleta: 'nuvem', consentimento: '' }, ctx({ novo: false, temCredencialGuardada: true }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dados).not.toHaveProperty('api_credentials_cifrado');
  });
  it('device_id inválido e UC com letra', () => {
    const r = validarFormMedidor({ ...base, device_id: '<script>', uc_instalacao: 'abc' }, ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.length).toBe(2);
  });
});
