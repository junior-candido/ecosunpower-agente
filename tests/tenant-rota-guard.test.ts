import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// GUARDA (ratchet) do strangler multi-tenant — docs/ecosof/04, achado do code-review.
// A opção (b) é opt-in POR ROTA: nada obriga uma rota nova a usar o crachá do
// operador. Esquecer = fallback silencioso pro service_role = bypass do RLS = risco
// de vazamento cross-tenant. Esta guarda fecha esse buraco: o nº de acessos CRUS ao
// banco no router (supabase.from / supabaseService.metodo) só pode CAIR conforme
// migramos pro bancoDoOperador/svcDoOperador. Rota NOVA no serviço cru faz o número
// SUBIR e QUEBRA aqui — forçando o autor a migrar OU, se for mesmo cross-tenant
// (audit/flags/dashboard_users/webhook/monitoring/slug público), baixar o teto
// conscientemente (o diff mostra, o revisor decide). Mesma ideia do guard de migrations.
const router = readFileSync(new URL('../src/modules/dashboard/router.ts', import.meta.url), 'utf8');
const conta = (re: RegExp): number => (router.match(re) ?? []).length;

describe('guarda multi-tenant — acessos crus ao banco no router (ratchet)', () => {
  // ⬇️ BAIXE estes tetos conforme migrar rotas de tenant. NUNCA aumente sem revisar
  //    (ou é dado de tenant que faltou migrar, ou é cross-tenant legítimo — decida).
  it('supabase.from(...) cru não aumenta (migre pro bancoDoOperador)', () => {
    expect(conta(/\bsupabase\.from\('/g)).toBeLessThanOrEqual(33);
  });

  it('supabaseService.metodo(...) cru não aumenta (migre pro svcDoOperador)', () => {
    expect(conta(/\bsupabaseService\.[a-zA-Z]/g)).toBeLessThanOrEqual(44);
  });
});
