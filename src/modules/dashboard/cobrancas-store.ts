// src/modules/dashboard/cobrancas-store.ts
// Apoio da página Cobrar (InfinitePay): acha o lead pelo telefone digitado
// pra VINCULAR a cobrança e pré-preencher o checkout. Busca por todas as
// variantes do número (9º dígito / prefixo 55) — mesmo dedup da Eva.

import type { SupabaseClient } from '@supabase/supabase-js';
import { variantesTelefone } from '../phone.js';

export interface LeadAchado { id: string; nome?: string; email?: string; telefone?: string }

/**
 * Acha o lead da empresa pelo telefone (variantes com/sem 9º dígito e 55).
 * Duplicata legada → devolve o MAIS ANTIGO (o original). Qualquer problema
 * (número inválido, erro do banco) → null: a cobrança segue sem vínculo.
 */
export async function acharLeadPorTelefone(
  client: SupabaseClient,
  companyId: string,
  telefone: string,
): Promise<LeadAchado | null> {
  const variantes = variantesTelefone(telefone);
  if (variantes.length === 0) return null;
  try {
    const { data, error } = await client
      .from('leads')
      .select('id, name, email, phone')
      .in('phone', variantes)
      .eq('company_id', companyId)
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) return null;
    const lead = (data as { id: string; name?: string; email?: string; phone?: string }[] | null)?.[0];
    if (!lead) return null;
    return { id: lead.id, nome: lead.name ?? undefined, email: lead.email ?? undefined, telefone: lead.phone ?? undefined };
  } catch {
    return null;
  }
}
