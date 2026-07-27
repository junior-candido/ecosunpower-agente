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

// Logo do tenant por CONVENÇÃO de Storage (sem migration, sem UI): subir o
// arquivo em branding/tenants/<companyId>/logo.png no painel do Supabase e
// ela entra na folha. Sem arquivo = folha neutra (logo null). Cache só de
// SUCESSO — upload novo aparece no próximo relatório sem reiniciar nada.
const LOGO_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const logoTenantCache = new Map<string, string>();

async function logoDoTenant(client: SupabaseClient, companyId: string): Promise<string | null> {
  const path = `tenants/${companyId}/logo.png`;
  const cached = logoTenantCache.get(path);
  if (cached) return cached;
  try {
    const { data, error } = await client.storage.from('branding').download(path);
    if (error || !data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    if (buf.length === 0) return null;
    if (data.type && !LOGO_MIMES.has(data.type)) return null;
    const uri = `data:${data.type || 'image/png'};base64,${buf.toString('base64')}`;
    logoTenantCache.set(path, uri);
    return uri;
  } catch {
    return null;
  }
}

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
    logoBase64: await logoDoTenant(client, companyId),
  };
}
