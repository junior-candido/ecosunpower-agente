// src/modules/monitoring/relatorio/marca.ts
// Resolve a marca do relatório pela empresa DONA do sistema (degustação
// Sabion 27/07: relatório do tenant saía com a marca completa da EcoSun).
// EcoSun ou legado sem carimbo (null) → undefined = visual EcoSun de sempre.
// Tenant → marca NEUTRA com o nome da empresa dele.
//
// [B1c — pronto pra plugar a logo do Thiago] quando a config por empresa
// ganhar upload de logo, é SÓ trocar o `logoBase64: null` pela logo salva do
// tenant — o template (MarcaRelatorio) já aceita e renderiza.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MarcaRelatorio } from './template.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';

export async function resolverMarcaRelatorio(
  client: SupabaseClient,
  companyId: string | null | undefined,
): Promise<MarcaRelatorio | undefined> {
  if (!companyId || companyId === ECOSUN) return undefined;
  const { data } = await client
    .from('companies')
    .select('nome')
    .eq('id', companyId)
    .maybeSingle();
  return {
    nome: ((data as { nome?: string } | null)?.nome) ?? 'Monitoramento Solar',
    logoBase64: null,
  };
}
