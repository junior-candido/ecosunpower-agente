import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Tenant Resolver (Eva multi-tenant — fatia 2, "hardening")
// ----------------------------------------------------------------------------
// Resolve o company_id a partir do phone_number_id que a Meta manda no webhook
// (value.metadata.phone_number_id = o NÚMERO que RECEBEU a mensagem). O mapa
// vive em companies.waba_phone_number_id (migration 081).
//
// Regra de ouro do mundo SEM mapeamentos (hoje): número ausente, não-mapeado
// ou erro de banco → EcoSun (tenant #1) = comportamento idêntico ao de hoje.
// Com a coluna NULL em todo mundo, TUDO resolve EcoSun.
//
// FALHA-FECHADO (fatia 2): assim que EXISTIR pelo menos um número mapeado no
// sistema, um número desconhecido (ou um erro de banco) NÃO pode mais cair em
// EcoSun — processar a conversa de outra empresa como EcoSun vazaria dados
// entre tenants. Nesse caso devolvemos companyId=null e o chamador RETÉM a
// mensagem (não processa). O gatilho é `existeAlgumMapeamento()`.
//
// Cache em memória (5min) por phone_number_id pra não bater no banco a cada
// mensagem. Só cacheamos respostas REAIS (mapeado / não-mapeado); resultado de
// ERRO nunca é cacheado (achado 2 do code review) — a próxima mensagem tenta
// de novo.
// ============================================================================

export const ECOSUN_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

const TTL_MS = 5 * 60 * 1000; // 5 minutos

export type MotivoResolucao = 'mapeado' | 'sem-numero' | 'nao-mapeado' | 'erro';

export interface ResolucaoTenant {
  // companyId=null significa "falha-fechado": há mapeamentos ativos e este
  // número não resolveu — o chamador NÃO deve processar como EcoSun.
  companyId: string | null;
  motivo: MotivoResolucao;
}

export interface TenantResolver {
  companyDoNumero(phoneNumberId: string | undefined): Promise<ResolucaoTenant>;
}

// Marcador do que a busca por número achou (é isso que cacheamos — NÃO a
// decisão de falha-fechado, que é recomputada a cada chamada via
// existeAlgumMapeamento pra reagir na hora quando um mapeamento aparece).
type LookupCache =
  | { tipo: 'mapeado'; companyId: string }
  | { tipo: 'nao-mapeado' };

export function criarTenantResolver(client: SupabaseClient): TenantResolver {
  const cache = new Map<string, { valor: LookupCache; at: number }>();

  // Cache do "existe algum número mapeado no sistema?" — a resposta muda
  // raríssimo (só quando alguém cadastra um tenant). Guardamos só quando a
  // query dá certo; em erro caímos em `false` (mundo legado = EcoSun) e NÃO
  // cacheamos, pra reavaliar na próxima.
  let mapeamentoCache: { existe: boolean; at: number } | null = null;

  async function existeAlgumMapeamento(): Promise<boolean> {
    if (mapeamentoCache && Date.now() - mapeamentoCache.at < TTL_MS) {
      return mapeamentoCache.existe;
    }
    try {
      const { data, error } = await client
        .from('companies')
        .select('id')
        .not('waba_phone_number_id', 'is', null)
        .limit(1);
      if (error) {
        // Não deu pra saber → assume mundo legado (sem mapeamentos) pra não
        // reter mensagem à toa. NÃO cacheia (tenta de novo na próxima).
        console.warn('[tenant] erro ao checar se existem mapeamentos (assumindo que NÃO existem):', error.message);
        return false;
      }
      const existe = Array.isArray(data) && data.length > 0;
      mapeamentoCache = { existe, at: Date.now() };
      return existe;
    } catch (err) {
      console.warn('[tenant] exceção ao checar mapeamentos (assumindo que NÃO existem):', (err as Error).message);
      return false;
    }
  }

  // Aplica a política de falha-fechado a uma resolução que não achou empresa
  // (não-mapeado ou erro): EcoSun se o sistema não tem mapeamentos; null
  // (retém) se já tem.
  async function semEmpresa(motivo: 'nao-mapeado' | 'erro'): Promise<ResolucaoTenant> {
    const algum = await existeAlgumMapeamento();
    return { companyId: algum ? null : ECOSUN_COMPANY_ID, motivo };
  }

  return {
    async companyDoNumero(phoneNumberId: string | undefined): Promise<ResolucaoTenant> {
      // Sem número (webhook antigo/sem metadata; canal Evolution) → EcoSun
      // direto, sem query. Mantém o comportamento legado intacto.
      if (!phoneNumberId) return { companyId: ECOSUN_COMPANY_ID, motivo: 'sem-numero' };

      const cached = cache.get(phoneNumberId);
      if (cached && Date.now() - cached.at < TTL_MS) {
        if (cached.valor.tipo === 'mapeado') {
          return { companyId: cached.valor.companyId, motivo: 'mapeado' };
        }
        // não-mapeado (cacheado) → recomputa a política de falha-fechado.
        return semEmpresa('nao-mapeado');
      }

      try {
        const { data, error } = await client
          .from('companies')
          .select('id')
          .eq('waba_phone_number_id', phoneNumberId)
          .maybeSingle();
        if (error) {
          // Erro de banco: NÃO cacheia. Falha-fechado se houver mapeamentos.
          console.warn(`[tenant] erro ao resolver empresa do número ${phoneNumberId}:`, error.message);
          return semEmpresa('erro');
        }
        const id = (data as { id?: string } | null)?.id;
        if (id) {
          cache.set(phoneNumberId, { valor: { tipo: 'mapeado', companyId: id }, at: Date.now() });
          return { companyId: id, motivo: 'mapeado' };
        }
        // data null → número não-mapeado. Resposta real: pode cachear.
        cache.set(phoneNumberId, { valor: { tipo: 'nao-mapeado' }, at: Date.now() });
        return semEmpresa('nao-mapeado');
      } catch (err) {
        // Exceção: NÃO cacheia. Falha-fechado se houver mapeamentos.
        console.warn(`[tenant] exceção ao resolver empresa do número ${phoneNumberId}:`, (err as Error).message);
        return semEmpresa('erro');
      }
    },
  };
}
