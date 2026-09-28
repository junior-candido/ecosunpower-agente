// src/modules/energia/credenciais.ts
//
// Segredos da Gestão de Energia:
//  - chave da nuvem Shelly (auth_key + server_uri): dá CONTROLE TOTAL da conta
//    (inclusive dos relés). Fica CIFRADA (AES-256-GCM, etiqueta de 16 bytes)
//    com a env ENERGIA_CRED_KEY e AMARRADA ao medidor e à empresa (AAD): o
//    texto cifrado copiado pra outro medidor ou outra empresa não abre. Entra
//    só pelo formulário da plataforma, nunca volta pra tela, nunca vai pro log.
//  - token do medidor: o script do aparelho manda no cabeçalho x-shelly-token.
//    No banco fica só o SHA-256; o token claro aparece UMA vez na tela.

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

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

/** A que medidor e empresa a chave cifrada pertence (vira o AAD do GCM). */
export interface AmarraCred { medidorId: string; companyId: string }

const PREFIXO = 'v2.';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const aad = (a: AmarraCred): Buffer => {
  if (!a?.medidorId || !a?.companyId) throw new Error('credencial da nuvem sem medidor/empresa para amarrar');
  return Buffer.from(`medidor:${a.medidorId}|empresa:${a.companyId}`, 'utf8');
};

/** Formato: "v2." + base64(iv 12 | etiqueta 16 | dados). */
export function cifrarCred(c: CredShelly, keyHex: string, amarra: AmarraCred): string {
  exigirChave(keyHex);
  const iv = randomBytes(IV_BYTES);
  const cf = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv, { authTagLength: TAG_BYTES });
  cf.setAAD(aad(amarra));
  const corpo = Buffer.concat([cf.update(JSON.stringify({ server_uri: c.server_uri, auth_key: c.auth_key }), 'utf8'), cf.final()]);
  return PREFIXO + Buffer.concat([iv, cf.getAuthTag(), corpo]).toString('base64');
}

export function decifrarCred(s: string, keyHex: string, amarra: AmarraCred): CredShelly {
  exigirChave(keyHex);
  if (typeof s !== 'string' || !s.startsWith(PREFIXO)) throw new Error('credencial cifrada em formato inesperado');
  const tudo = Buffer.from(s.slice(PREFIXO.length), 'base64');
  if (tudo.length <= IV_BYTES + TAG_BYTES) throw new Error('credencial cifrada em formato inesperado');
  const df = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), tudo.subarray(0, IV_BYTES), { authTagLength: TAG_BYTES });
  df.setAAD(aad(amarra));
  df.setAuthTag(tudo.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  const claro = Buffer.concat([df.update(tudo.subarray(IV_BYTES + TAG_BYTES)), df.final()]).toString('utf8');
  const o = JSON.parse(claro) as Partial<CredShelly>;
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
