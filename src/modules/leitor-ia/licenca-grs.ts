// Confere a licença "GRS2." do programa Gerador de Relatórios Solar — a MESMA regra do programa
// (repo produtos/gerador-relatorios-solar, src/dominio/licenca.ts e computador.ts), só a parte que
// o servidor precisa: assinatura Ed25519, produto, validade e o computador liberado.
//
// Só a chave PÚBLICA mora aqui (serve só para conferir, pode ficar no repositório). A chave privada
// de emitir licenças fica fora, com o Junior. Trocar uma letra da chave quebra a assinatura.

import { createPublicKey, verify } from 'node:crypto';

/** Chave pública da licença (a mesma embutida no programa desde 2026-09-27). */
export const CHAVE_PUBLICA_GRS = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEALMdkv6q+9OxMQaYvkZaFtIx43znQtqwN6rP7rmmPaC8=
-----END PUBLIC KEY-----
`;

const PRODUTO = 'gerador-relatorios-solar';
const PREFIXO = 'GRS2.';
const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const ID_VALIDO = /^[2-9A-HJ-NP-Z]{10}$/;

function conferencia(corpo: string): string {
  let soma = 0;
  for (let i = 0; i < corpo.length; i++) soma += (2 * i + 1) * ALFABETO.indexOf(corpo[i]);
  return ALFABETO[soma % 32];
}

/** Código do computador (XXXX-XXXX-XXXX-XXXX, com dígito de conferência) → formato certo, ou null. */
export function normalizarCodigo(texto: string): string | null {
  const s = String(texto ?? '').toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== 16 || [...s].some((c) => !ALFABETO.includes(c))) return null;
  if (conferencia(s.slice(0, 15)) !== s[15]) return null;
  return s.match(/.{4}/g)!.join('-');
}

export type ResultadoGrs =
  | { ok: true; id: string; empresa: string }
  | { ok: false; motivo: 'formato' | 'assinatura' | 'produto' | 'expirada' | 'computador' };

const hojeBrasilia = (agora: Date) => new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);

export function verificarLicencaGrs(chave: string, computador: string, agora: Date, publicaPem = CHAVE_PUBLICA_GRS): ResultadoGrs {
  const limpa = String(chave ?? '').replace(/[\s"'“”]/g, '');
  const partes = limpa.startsWith(PREFIXO) ? limpa.slice(PREFIXO.length).split('.') : [];
  if (partes.length !== 2 || !partes.every((x) => /^[A-Za-z0-9_-]{8,}$/.test(x))) return { ok: false, motivo: 'formato' };
  const [corpo, assinatura] = partes;
  let confere = false;
  try {
    confere = verify(null, Buffer.from(corpo, 'utf-8'), createPublicKey(publicaPem), Buffer.from(assinatura, 'base64url'));
  } catch {
    confere = false;
  }
  if (!confere) return { ok: false, motivo: 'assinatura' };
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf-8')) as Record<string, unknown>;
  } catch {
    return { ok: false, motivo: 'formato' };
  }
  if (!j || typeof j !== 'object' || typeof j.id !== 'string' || !ID_VALIDO.test(j.id) || !Array.isArray(j.computadores)) {
    return { ok: false, motivo: 'formato' };
  }
  if (j.produto !== PRODUTO) return { ok: false, motivo: 'produto' };
  const meu = normalizarCodigo(computador);
  const liberados = j.computadores.map((c) => normalizarCodigo(String(c)));
  if (!meu || !liberados.includes(meu)) return { ok: false, motivo: 'computador' };
  if (typeof j.validaAte === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.validaAte) && hojeBrasilia(agora) > j.validaAte) {
    return { ok: false, motivo: 'expirada' };
  }
  return { ok: true, id: j.id, empresa: typeof j.empresa === 'string' ? j.empresa.slice(0, 80) : '' };
}
