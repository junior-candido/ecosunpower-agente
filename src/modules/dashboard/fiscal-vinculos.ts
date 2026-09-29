// src/modules/dashboard/fiscal-vinculos.ts
// Nota fiscal (nova/editar): o formulário traz fechamento_id e lead_id em
// campos ocultos (vêm do link "emitir nota" de um fechamento). Antes eles iam
// direto pra fiscal_notas — dava pra amarrar a nota a fechamento/lead de OUTRA
// empresa só trocando o id. Agora só ficam se forem da empresa da sessão;
// senão viram null (a nota sai igual, só sem o vínculo).
import type { SupabaseClient } from '@supabase/supabase-js';

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function daEmpresa(client: SupabaseClient, tabela: 'leads' | 'fechamentos', companyId: string, id: string | null | undefined): Promise<string | null> {
  const v = String(id ?? '').trim();
  if (!RE_UUID.test(v)) return null;
  const { data, error } = await client.from(tabela).select('id').eq('id', v).eq('company_id', companyId).maybeSingle();
  if (error || !data) return null;
  return v;
}

/** Fechamento e lead do formulário, só se forem da empresa da sessão. */
export async function vinculosDaNota(
  client: SupabaseClient,
  companyId: string,
  v: { fechamentoId?: string | null; leadId?: string | null },
): Promise<{ fechamentoId: string | null; leadId: string | null }> {
  const [fechamentoId, leadId] = await Promise.all([
    daEmpresa(client, 'fechamentos', companyId, v.fechamentoId),
    daEmpresa(client, 'leads', companyId, v.leadId),
  ]);
  return { fechamentoId, leadId };
}
