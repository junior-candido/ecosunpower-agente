// src/modules/energia/credenciais.ts
//
// Segredos da Gestão de Energia:
//  - chave da nuvem Shelly (auth_key + server_uri): dá CONTROLE TOTAL da conta
//    (inclusive dos relés). Fica CIFRADA (AES-256-GCM) com a env ENERGIA_CRED_KEY,
//    reusando a cifra do fiscal (financeiro/fiscal/crypto-cert.ts). Entra só pelo
//    formulário da plataforma, nunca volta pra tela, nunca vai pro log.
//  - token do medidor: o script do aparelho manda no cabeçalho x-shelly-token.
//    No banco fica só o SHA-256; o token claro aparece UMA vez na tela.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cifrar, decifrar } from '../financeiro/fiscal/crypto-cert.js';

export interface CredShelly { server_uri: string; auth_key: string }

const HEX64 = /^[0-9a-fA-F]{64}$/;

/** A ENERGIA_CRED_KEY tem o formato certo (64 hex = 32 bytes)? */
export function chaveEnergiaValida(keyHex: string | null | undefined): keyHex is string {
  return typeof keyHex === 'string' && HEX64.test(keyHex);
}

function exigirChave(keyHex: string): void {
  // Mensagem própria (a do crypto-cert cita FISCAL_CERT_KEY) e sem ecoar o valor.
  if (!chaveEnergiaValida(keyHex)) throw new Error('ENERGIA_CRED_KEY inválida: precisa de 64 caracteres hex (32 bytes).');
}

export function cifrarCred(c: CredShelly, keyHex: string): string {
  exigirChave(keyHex);
  return cifrar(Buffer.from(JSON.stringify({ server_uri: c.server_uri, auth_key: c.auth_key }), 'utf8'), keyHex);
}

export function decifrarCred(s: string, keyHex: string): CredShelly {
  exigirChave(keyHex);
  const o = JSON.parse(decifrar(s, keyHex).toString('utf8')) as Partial<CredShelly>;
  if (typeof o.server_uri !== 'string' || typeof o.auth_key !== 'string') throw new Error('credencial cifrada em formato inesperado');
  return { server_uri: o.server_uri, auth_key: o.auth_key };
}

export const novoTokenMedidor = (): string => randomBytes(32).toString('base64url');

export const hashToken = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');

/** Token confere com o hash guardado? Tempo constante; vazio nunca confere. */
export function tokenConfere(token: string, hash: string): boolean {
  if (!token || !hash || !/^[0-9a-f]{64}$/i.test(hash)) return false;
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Compara dois segredos em tempo constante (token global legado). Vazio nunca confere. */
export function segredoConfere(recebido: string, esperado: string): boolean {
  if (!recebido || !esperado) return false;
  const a = createHash('sha256').update(recebido, 'utf8').digest();
  const b = createHash('sha256').update(esperado, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/**
 * Server URI da nuvem Shelly (User settings → Authorization cloud key).
 * Só aceita host *.shelly.cloud — o formulário não pode virar porta pra o nosso
 * servidor chamar endereço qualquer (SSRF). Sempre https, sem caminho.
 */
export function normalizarServerUri(s: string | null | undefined): string | null {
  const host = String(s ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
  if (!host) return null;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.shelly\.cloud$/.test(host) ? `https://${host}` : null;
}

/** "••••1a2b" — o máximo que a tela mostra de uma chave guardada. */
export const mascarar = (s: string): string => `••••${s.length > 6 ? s.slice(-4) : ''}`;

/** "shellypro3em-007007422D90" → "007007422d90" (o mesmo id que a nuvem usa). */
export function normalizarDeviceId(id: string | null | undefined): string {
  return String(id ?? '').trim().toLowerCase().replace(/^shelly[a-z0-9]*-/, '');
}
