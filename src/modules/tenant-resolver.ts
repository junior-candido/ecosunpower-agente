import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Tenant Resolver (Eva multi-tenant — fatia 1, "encanamento")
// ----------------------------------------------------------------------------
// Resolve o company_id a partir do phone_number_id que a Meta manda no webhook
// (value.metadata.phone_number_id = o NÚMERO que RECEBEU a mensagem). O mapa
// vive em companies.waba_phone_number_id (migration 081).
//
// Regra de ouro: NUNCA derruba a mensagem. Número ausente, não-mapeado, ou
// erro de banco → EcoSun (tenant #1) = comportamento de hoje. Com a coluna
// NULL em todo mundo, TUDO resolve EcoSun → comportamento idêntico.
//
// Cache em memória de 5min por phone_number_id pra não bater no banco a cada
// mensagem (o número que recebe muda raríssimo).
// ============================================================================

export const ECOSUN_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

const TTL_MS = 5 * 60 * 1000; // 5 minutos

interface CacheEntry {
  companyId: string;
  at: number; // Date.now() de quando foi resolvido
}

export interface TenantResolver {
  companyDoNumero(phoneNumberId: string | undefined): Promise<string>;
}

export function criarTenantResolver(client: SupabaseClient): TenantResolver {
  const cache = new Map<string, CacheEntry>();

  return {
    async companyDoNumero(phoneNumberId: string | undefined): Promise<string> {
      // Sem número (webhook antigo/sem metadata) → EcoSun direto, sem query.
      if (!phoneNumberId) return ECOSUN_COMPANY_ID;

      const cached = cache.get(phoneNumberId);
      if (cached && Date.now() - cached.at < TTL_MS) {
        return cached.companyId;
      }

      let companyId = ECOSUN_COMPANY_ID;
      try {
        const { data, error } = await client
          .from('companies')
          .select('id')
          .eq('waba_phone_number_id', phoneNumberId)
          .maybeSingle();
        if (error) {
          // Erro de banco NÃO pode derrubar a mensagem — cai no EcoSun e avisa.
          console.warn(`[tenant] erro ao resolver empresa do número ${phoneNumberId} (usando EcoSun):`, error.message);
        } else if (data && (data as { id?: string }).id) {
          companyId = (data as { id: string }).id;
        }
        // data null (número não-mapeado) → segue EcoSun, sem warn (caso normal).
      } catch (err) {
        console.warn(`[tenant] exceção ao resolver empresa do número ${phoneNumberId} (usando EcoSun):`, (err as Error).message);
      }

      cache.set(phoneNumberId, { companyId, at: Date.now() });
      return companyId;
    },
  };
}
