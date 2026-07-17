import { describe, it, expect } from 'vitest';
import { SupabaseService, svcDoOperador } from '../src/modules/supabase.js';

// FASE B do RLS (docs/ecosof/04) — a peça do WRAPPER. O supabaseService é um
// monolito (110 métodos) que hoje fala como service_role. Pra isolar por empresa
// sem reescrever tudo: uma FÁBRICA que devolve o MESMO wrapper amarrado ao crachá
// do tenant (comClient), e o SWITCH svcDoOperador (flag RLS_TENANT_ROTAS).
const SEGREDO = 'segredo-de-teste-nunca-o-real';
const ECO = '00000000-0000-0000-0000-000000000001';
const req = { dashUser: { companyId: ECO } };
const envCompleta = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_JWT_SECRET: SEGREDO };

describe('SupabaseService.comClient — wrapper amarrado a um client pronto', () => {
  it('usa o client fornecido (mesmos métodos, agora sob o RLS dele)', () => {
    const fake = { __tenant: true } as never;
    const svc = SupabaseService.comClient(fake);
    expect(svc).toBeInstanceOf(SupabaseService);
    expect(svc.getClient()).toBe(fake);
  });
});

describe('svcDoOperador — o wrapper do OPERADOR (switch strangler)', () => {
  const svcServico = SupabaseService.comClient({ __service: true } as never);

  it('flag DESLIGADA → o wrapper de serviço (zero mudança em produção)', () => {
    expect(svcDoOperador(req, svcServico, { ...envCompleta })).toBe(svcServico);
    expect(svcDoOperador(req, svcServico, { ...envCompleta, RLS_TENANT_ROTAS: '0' })).toBe(svcServico);
  });

  it('flag LIGADA + env completa → um wrapper NOVO amarrado ao crachá do tenant', () => {
    const svc = svcDoOperador(req, svcServico, { ...envCompleta, RLS_TENANT_ROTAS: '1' });
    expect(svc).not.toBe(svcServico);
    expect(svc).toBeInstanceOf(SupabaseService);
  });

  it('flag LIGADA mas env incompleta (vazia OU parcial) → cai no serviço (não quebra)', () => {
    expect(svcDoOperador(req, svcServico, { RLS_TENANT_ROTAS: '1' })).toBe(svcServico);
    // env PARCIAL (só URL, falta ANON_KEY e JWT_SECRET) — também cai no serviço
    expect(svcDoOperador(req, svcServico, { RLS_TENANT_ROTAS: '1', SUPABASE_URL: 'https://x.supabase.co' })).toBe(svcServico);
  });

  it('sem operador logado (sem sessão) → estoura (não emite crachá sem sessão)', () => {
    expect(() => svcDoOperador({}, svcServico, { ...envCompleta, RLS_TENANT_ROTAS: '1' })).toThrow(/sess|operador|logad/i);
  });
});
