// src/modules/dashboard/password.ts
// Hash de senha com bcryptjs (JS puro). Custo 10 = bom equilíbrio segurança/tempo.
import bcrypt from 'bcryptjs';

const COST = 10;

export async function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, COST);
}

export async function verificarSenha(senha: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(senha, hash);
  } catch {
    return false;
  }
}
