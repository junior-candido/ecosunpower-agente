import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { jwtDaEmpresa, clientDaEmpresa, clientDoOperador, bancoDoOperador } from '../src/modules/tenant-client.js';

// FASE B do RLS (docs/ecosof/04-rls-fase-a-b.md): o app deixa de usar a
// chave-mestra nas rotas de tenant e passa a se identificar POR EMPRESA com um
// JWT assinado no servidor. A política company_isolation da migration 079 lê o
// claim `company_id` — o Postgres passa a impor o isolamento, não o código.
const SEGREDO = 'segredo-de-teste-nunca-o-real';
const ECO = '00000000-0000-0000-0000-000000000001';

const b64urlJson = (parte: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(parte, 'base64url').toString('utf8'));

describe('jwtDaEmpresa — o crachá de UMA empresa', () => {
  it('assina HS256 com role authenticated + claim company_id', () => {
    const token = jwtDaEmpresa(ECO, SEGREDO, 1_700_000_000_000);
    const [h, p, assinatura] = token.split('.');
    expect(b64urlJson(h!)).toEqual({ alg: 'HS256', typ: 'JWT' });
    const payload = b64urlJson(p!);
    expect(payload.role).toBe('authenticated');
    expect(payload.company_id).toBe(ECO);
    // assinatura confere (mesmo segredo → mesmo HMAC)
    const esperada = crypto.createHmac('sha256', SEGREDO).update(`${h}.${p}`).digest('base64url');
    expect(assinatura).toBe(esperada);
  });

  it('expira em 10 minutos por padrão (TTL curto: crachá, não chave-mestra)', () => {
    const agora = 1_700_000_000_000;
    const payload = b64urlJson(jwtDaEmpresa(ECO, SEGREDO, agora).split('.')[1]!);
    expect(payload.iat).toBe(Math.floor(agora / 1000));
    expect(payload.exp).toBe(Math.floor(agora / 1000) + 600);
  });

  it('recusa company_id que não é uuid (company_id NUNCA vem cru do request)', () => {
    expect(() => jwtDaEmpresa('1 OR 1=1', SEGREDO, 1_700_000_000_000)).toThrow(/uuid/i);
    expect(() => jwtDaEmpresa('', SEGREDO, 1_700_000_000_000)).toThrow(/uuid/i);
  });

  it('recusa segredo vazio (melhor quebrar aqui que assinar crachá sem tranca)', () => {
    expect(() => jwtDaEmpresa(ECO, '', 1_700_000_000_000)).toThrow(/segredo/i);
  });

  it('TTL custom é respeitado (crachá pode ter validade menor que os 10 min)', () => {
    const agora = 1_700_000_000_000;
    const payload = b64urlJson(jwtDaEmpresa(ECO, SEGREDO, agora, 30).split('.')[1]!);
    expect(payload.exp).toBe(Math.floor(agora / 1000) + 30);
  });

  it('segredo DIFERENTE gera assinatura diferente (a tranca depende do segredo)', () => {
    const agora = 1_700_000_000_000;
    const a = jwtDaEmpresa(ECO, SEGREDO, agora).split('.')[2];
    const b = jwtDaEmpresa(ECO, 'outro-segredo', agora).split('.')[2];
    expect(a).not.toBe(b);
  });
});

describe('clientDaEmpresa — client Supabase com o crachá da empresa', () => {
  it('exige url, anonKey e jwtSecret (sem env não há como isolar)', () => {
    expect(() => clientDaEmpresa(ECO, { url: '', anonKey: 'a', jwtSecret: 's' })).toThrow();
    expect(() => clientDaEmpresa(ECO, { url: 'https://x.supabase.co', anonKey: '', jwtSecret: 's' })).toThrow();
    expect(() => clientDaEmpresa(ECO, { url: 'https://x.supabase.co', anonKey: 'a', jwtSecret: '' })).toThrow();
  });

  it('cria o client sem rede (só monta os headers)', () => {
    const c = clientDaEmpresa(ECO, { url: 'https://x.supabase.co', anonKey: 'anon', jwtSecret: SEGREDO });
    expect(c).toBeTruthy();
  });
});

describe('clientDoOperador — crachá a partir da SESSÃO do operador (Fatia 3)', () => {
  const env = { url: 'https://x.supabase.co', anonKey: 'anon', jwtSecret: SEGREDO };

  it('usa o companyId da sessão (req.dashUser.companyId)', () => {
    expect(clientDoOperador({ dashUser: { companyId: ECO } }, env)).toBeTruthy();
  });

  it('recusa sem operador logado (sem sessão = sem crachá)', () => {
    expect(() => clientDoOperador({}, env)).toThrow(/sess|operador|logad/i);
    expect(() => clientDoOperador({ dashUser: {} }, env)).toThrow();
  });

  it('company_id NUNCA vem do frontend — só a sessão conta (body/header ignorados)', () => {
    // request "malicioso" com company_id no body mas sem sessão → recusa
    expect(() => clientDoOperador({ body: { company_id: ECO } } as never, env)).toThrow();
    // sessão manda: mesmo com body diferente, quem vale é o dashUser
    const c = clientDoOperador({ dashUser: { companyId: ECO }, body: { company_id: '1 OR 1=1' } } as never, env);
    expect(c).toBeTruthy();
  });
});

describe('bancoDoOperador — o switch strangler (flag RLS_TENANT_ROTAS)', () => {
  const req = { dashUser: { companyId: ECO } };
  const servico = { __service: true } as never;   // sentinela do client de serviço
  const envCompleta = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_JWT_SECRET: SEGREDO };

  it('flag DESLIGADA → usa o serviço (zero mudança em produção)', () => {
    expect(bancoDoOperador(req, servico, { ...envCompleta })).toBe(servico);
    expect(bancoDoOperador(req, servico, { ...envCompleta, RLS_TENANT_ROTAS: '0' })).toBe(servico);
  });

  it('flag LIGADA + env completa → usa o client-do-operador (não é o serviço)', () => {
    const db = bancoDoOperador(req, servico, { ...envCompleta, RLS_TENANT_ROTAS: '1' });
    expect(db).not.toBe(servico);
    expect(db).toBeTruthy();
  });

  it('flag LIGADA mas env incompleta → cai no serviço (não quebra a rota)', () => {
    expect(bancoDoOperador(req, servico, { RLS_TENANT_ROTAS: '1' })).toBe(servico);
    expect(bancoDoOperador(req, servico, { RLS_TENANT_ROTAS: '1', SUPABASE_URL: 'https://x.supabase.co' })).toBe(servico);
  });

  it('flag LIGADA + env completa + SEM sessão → estoura (fail-closed, igual o svc)', () => {
    expect(() => bancoDoOperador({}, servico, { ...envCompleta, RLS_TENANT_ROTAS: '1' })).toThrow(/sess|operador|logad/i);
  });
});
