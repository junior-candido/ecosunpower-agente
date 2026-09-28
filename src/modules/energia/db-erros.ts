// src/modules/energia/db-erros.ts
//
// A Gestão de Energia sobe ANTES de o Junior aplicar as migrations 136/137 no
// SQL Editor. Nesse intervalo o código tem que seguir de pé: tabela ausente não
// é erro pra gritar a cada minuto — é "ainda não ligado". Avisa 1x por hora.

export const MIGRATIONS_ENERGIA = '136 e 137';

/** O erro do Supabase/PostgREST é "tabela ou coluna ainda não existe"? */
export function tabelaAusente(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code ?? '');
  if (code === '42P01' || code === '42703' || code === 'PGRST205' || code === 'PGRST204') return true;
  return /does not exist|could not find the (table|.*column)|schema cache/i.test(String(err.message ?? ''));
}

let ultimoAvisoMs = 0;
/** Log único (no máximo 1x/hora) de "migrations da energia não aplicadas". */
export function avisarMigrationAusente(onde: string, agoraMs = Date.now()): void {
  if (agoraMs - ultimoAvisoMs < 3_600_000) return;
  ultimoAvisoMs = agoraMs;
  console.warn(`[energia] tabelas das migrations ${MIGRATIONS_ENERGIA} ainda não existem (${onde}) — Gestão de Energia desligada até aplicar.`);
}
