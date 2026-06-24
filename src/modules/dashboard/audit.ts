// src/modules/dashboard/audit.ts
// Registra ações no audit_log. NUNCA lança — auditoria não pode derrubar o fluxo.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuditInput {
  companyId: string;
  userId?: string | null;
  entidade: string;       // 'lead' | 'usuario' | 'proposta' | ...
  entidadeId?: string | null;
  acao: string;           // 'criou' | 'editar' | 'excluiu' | 'claim' | 'etapa' | 'login' | ...
  campo?: string | null;
  valorAntigo?: string | null;
  valorNovo?: string | null;
}

export async function audit(client: SupabaseClient, input: AuditInput): Promise<void> {
  try {
    await client.from('audit_log').insert({
      company_id: input.companyId,
      user_id: input.userId ?? null,
      entidade: input.entidade,
      entidade_id: input.entidadeId ?? null,
      acao: input.acao,
      campo: input.campo ?? null,
      valor_antigo: input.valorAntigo ?? null,
      valor_novo: input.valorNovo ?? null,
    });
  } catch (err) {
    console.warn('[audit] falha ao gravar (ignorado):', (err as Error).message);
  }
}
