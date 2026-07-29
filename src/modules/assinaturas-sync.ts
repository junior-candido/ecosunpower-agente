// src/modules/assinaturas-sync.ts
// Fatia 3a: quando a assinatura muda (pagou/travou/liberou na mão), o ACESSO
// real do assinante acompanha:
//  - calculadora → ponte HTTP POST /api/acesso-sync (token compartilhado
//    ASSINATURAS_SYNC_TOKEN; validoAte = vencimento+4d de rede de segurança);
//  - monitoramento → companies.ativo (o auth do dashboard barra tenant inativo).
// Best-effort: falha loga + avisa (callback), NUNCA derruba o fluxo de quem
// chamou — o pagamento/status já foi gravado; a ponte se acerta depois.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssinaturaRow } from './dashboard/assinaturas-store.js';

export type AcaoAcesso = 'liberar' | 'travar';

export interface SyncEnv { calculadoraUrl?: string; syncToken?: string }
export interface SyncDeps {
  env: SyncEnv;
  fetchImpl?: typeof fetch;
  avisarFalha?: (texto: string) => void | Promise<void>;
}

/** Rede de segurança da calculadora: acesso expira sozinho no vencimento+4d
 *  (3 dias de tolerância + o dia da trava) se a ponte de travar falhar. */
export function validoAteDaAssinatura(venceEm: string): string {
  const d = new Date(Date.parse(venceEm) + 4 * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export async function aplicarAcesso(
  client: SupabaseClient,
  a: Pick<AssinaturaRow, 'produtoId' | 'email' | 'companyId' | 'venceEm' | 'nome'>,
  acao: AcaoAcesso,
  deps: SyncDeps,
): Promise<boolean> {
  try {
    if (a.produtoId === 'monitoramento') {
      if (!a.companyId) return true; // sem tenant amarrado = nada pra travar
      const { error } = await client.from('companies')
        .update({ ativo: acao === 'liberar' }).eq('id', a.companyId);
      if (error) throw new Error(error.message);
      return true;
    }
    if (a.produtoId === 'calculadora') {
      const { calculadoraUrl, syncToken } = deps.env;
      if (!calculadoraUrl || !syncToken) return true; // ponte desligada de propósito
      if (!a.email) return true; // sem e-mail = sem chave de acesso lá
      const f = deps.fetchImpl ?? (fetch as typeof fetch);
      const resp = await f(`${calculadoraUrl.replace(/\/$/, '')}/api/acesso-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sync-token': syncToken },
        body: JSON.stringify({ email: a.email, acao, validoAte: validoAteDaAssinatura(a.venceEm) }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return true;
    }
    return true; // produto sem trava de acesso conhecida
  } catch (err) {
    const msg = `⚠️ Ponte de acesso falhou (${acao} ${a.produtoId} de ${a.nome}): ${(err as Error).message}. O status foi salvo — refaça o ${acao} na tela Assinaturas quando a ponte voltar.`;
    console.error('[assinaturas-sync]', msg);
    try { await deps.avisarFalha?.(msg); } catch { /* best-effort */ }
    return false;
  }
}
