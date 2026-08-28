// src/modules/evolution-tenant.ts
// Mapa instância Evolution ↔ empresa (migration 107: companies.evolution_instance).
//
// Duas direções, ambas cacheadas (5 min) e best-effort:
//  - companyDaInstancia(instance): webhook da Evolution → dona da mensagem.
//    Não mapeada / erro / sem instance = undefined → o chamador segue como
//    EcoSun (comportamento de hoje). Diferente do resolver WABA, aqui NÃO há
//    falha-fechado: a instância padrão da Eva (EVOLUTION_INSTANCE) nunca está
//    na tabela e precisa continuar caindo em EcoSun.
//  - instanciaDaEmpresa(companyId): consumer da fila → por onde RESPONDER.
//    undefined = empresa sem instância própria (usa o canal padrão).
import type { SupabaseClient } from '@supabase/supabase-js';

const TTL_MS = 5 * 60 * 1000;

export interface EvolutionTenantResolver {
  companyDaInstancia(instance: string | undefined): Promise<string | undefined>;
  instanciaDaEmpresa(companyId: string | undefined): Promise<string | undefined>;
}

type Entrada<T> = { valor: T; at: number };

export function criarEvolutionTenantResolver(client: SupabaseClient): EvolutionTenantResolver {
  const porInstancia = new Map<string, Entrada<string | undefined>>();
  const porEmpresa = new Map<string, Entrada<string | undefined>>();

  function fresco<T>(e: Entrada<T> | undefined): e is Entrada<T> {
    return Boolean(e && Date.now() - e.at < TTL_MS);
  }

  return {
    async companyDaInstancia(instance) {
      const chave = (instance ?? '').trim();
      if (!chave) return undefined;
      const c = porInstancia.get(chave);
      if (fresco(c)) return c.valor;
      try {
        const { data, error } = await client
          .from('companies')
          .select('id')
          .eq('evolution_instance', chave)
          .eq('ativo', true)
          .maybeSingle();
        if (error) {
          console.warn(`[evolution-tenant] erro ao resolver instância "${chave}": ${error.message} — seguindo como EcoSun`);
          return undefined; // não cacheia erro
        }
        const id = (data as { id?: string } | null)?.id;
        porInstancia.set(chave, { valor: id, at: Date.now() });
        if (id) porEmpresa.set(id, { valor: chave, at: Date.now() });
        return id;
      } catch (e) {
        console.warn(`[evolution-tenant] falha ao resolver instância "${chave}": ${(e as Error).message}`);
        return undefined;
      }
    },

    async instanciaDaEmpresa(companyId) {
      if (!companyId) return undefined;
      const c = porEmpresa.get(companyId);
      if (fresco(c)) return c.valor;
      try {
        const { data, error } = await client
          .from('companies')
          .select('evolution_instance')
          .eq('id', companyId)
          .maybeSingle();
        if (error) {
          console.warn(`[evolution-tenant] erro ao buscar instância da empresa ${companyId.slice(0, 8)}: ${error.message}`);
          return undefined;
        }
        const inst = (data as { evolution_instance?: string | null } | null)?.evolution_instance ?? undefined;
        porEmpresa.set(companyId, { valor: inst || undefined, at: Date.now() });
        return inst || undefined;
      } catch (e) {
        console.warn(`[evolution-tenant] falha ao buscar instância da empresa: ${(e as Error).message}`);
        return undefined;
      }
    },
  };
}
