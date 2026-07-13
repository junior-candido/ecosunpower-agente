// src/modules/dashboard/cerebro-memoria.ts
// Memória conversacional do Elo: guarda cada troca (pergunta+resposta) do
// "Pergunte ao Elo" por usuário do dashboard e devolve as últimas pra
// reinjetar no contexto (o Elo lembra do fio da conversa). Best-effort:
// gravar/ler memória NUNCA derruba a resposta.
import type { SupabaseService } from '../supabase.js';

export type TrocaElo = { pergunta: string; resposta: string };

/** Salva uma troca do Pergunte ao Elo. Best-effort (nunca lança). */
export async function salvarMemoriaElo(
  supabase: SupabaseService,
  args: { userId?: string | null; quem?: string | null; pergunta: string; resposta: string },
): Promise<void> {
  try {
    await supabase.getClient().from('elo_memoria').insert({
      user_id: args.userId ?? null,
      quem: args.quem ?? null,
      pergunta: String(args.pergunta).slice(0, 2000),
      resposta: String(args.resposta).slice(0, 4000),
    });
  } catch (err) {
    console.warn('[elo-memoria] salvar falhou (ignorado):', (err as Error)?.message ?? err);
  }
}

/**
 * Últimas N trocas do usuário, em ordem CRONOLÓGICA (mais antiga → mais nova),
 * prontas pra virar mensagens no contexto. Sem userId ou erro → []. Best-effort.
 */
export async function getMemoriaRecenteElo(
  supabase: SupabaseService,
  userId: string | null | undefined,
  limite = 6,
): Promise<TrocaElo[]> {
  if (!userId) return [];
  try {
    const { data, error } = await supabase.getClient()
      .from('elo_memoria')
      .select('pergunta, resposta')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limite);
    if (error || !data) return [];
    // veio do banco mais-nova→mais-antiga; inverte pra ordem de conversa.
    return (data as TrocaElo[]).slice().reverse();
  } catch {
    return [];
  }
}
