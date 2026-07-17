// FASE B do RLS — o "crachá por empresa" (docs/ecosof/04-rls-fase-a-b.md).
//
// Hoje o app inteiro fala com o banco como service_role (chave-mestra, que
// BYPASSA o RLS). Este módulo cria a alternativa: um client Supabase que se
// identifica como UMA empresa, via JWT assinado aqui no servidor com o segredo
// do projeto (env SUPABASE_JWT_SECRET). A política company_isolation da
// migration 079 lê o claim `company_id` — com este client, é o POSTGRES que
// impõe o isolamento, não o código.
//
// REGRAS (blueprint §6):
// - company_id NUNCA vem do frontend: sai da sessão do operador logado ou do
//   phone_number_id do webhook. Quem chama este módulo já resolveu isso.
// - TTL curto (10 min): é crachá de visita, não chave-mestra. Assinar é um
//   HMAC — barato; re-assina a cada uso sem dó.
// - Sem dependência nova: HS256 com o crypto nativo (mesma assinatura que o
//   GoTrue/PostgREST validam).

import crypto from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const b64url = (obj: Record<string, unknown>): string =>
  Buffer.from(JSON.stringify(obj)).toString('base64url');

/** JWT HS256 de UMA empresa: role authenticated + claim company_id.
 *  `agoraMs` vem de fora (Date.now() no chamador) — puro e testável. */
export function jwtDaEmpresa(companyId: string, segredo: string, agoraMs: number, ttlSegundos = 600): string {
  if (!UUID_RE.test(companyId)) throw new Error(`company_id precisa ser uuid — recebi "${companyId}"`);
  if (!segredo) throw new Error('segredo do JWT vazio (env SUPABASE_JWT_SECRET) — não assino crachá sem tranca');
  const iat = Math.floor(agoraMs / 1000);
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const payload = b64url({ role: 'authenticated', company_id: companyId, iat, exp: iat + ttlSegundos });
  const assinatura = crypto.createHmac('sha256', segredo).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${assinatura}`;
}

export interface TenantClientEnv {
  url: string;      // SUPABASE_URL
  anonKey: string;  // SUPABASE_ANON_KEY (o apikey do gateway; o RLS barra o resto)
  jwtSecret: string; // SUPABASE_JWT_SECRET (painel do Supabase → Settings → API)
}

/** Client Supabase "da empresa": apikey anon + Authorization com o crachá.
 *  O PostgREST valida a assinatura e o RLS da 079 filtra por company_id. */
export function clientDaEmpresa(companyId: string, env: TenantClientEnv): SupabaseClient {
  if (!env.url) throw new Error('SUPABASE_URL ausente');
  if (!env.anonKey) throw new Error('SUPABASE_ANON_KEY ausente (crachá precisa do apikey público)');
  if (!env.jwtSecret) throw new Error('SUPABASE_JWT_SECRET ausente');
  const token = jwtDaEmpresa(companyId, env.jwtSecret, Date.now());
  return createClient(env.url, env.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Requisição com a sessão do operador logado (o dashboard preenche `req.dashUser`). */
export interface RequisicaoComOperador {
  dashUser?: { companyId?: string };
}

/** Client-do-tenant a partir da SESSÃO do operador (Fatia 3, strangler).
 *  O `company_id` sai SÓ do `req.dashUser` (sessão) — NUNCA de body/header/query,
 *  que o operador poderia forjar. Sem sessão, não emite crachá (melhor 500 que vazar). */
export function clientDoOperador(req: RequisicaoComOperador, env: TenantClientEnv): SupabaseClient {
  const companyId = req.dashUser?.companyId;
  if (!companyId) throw new Error('sem operador logado (req.dashUser.companyId) — não emito crachá sem sessão');
  return clientDaEmpresa(companyId, env);
}

type EnvLike = Record<string, string | undefined>;

/** Lê a env do tenant do process.env — undefined se qualquer chave faltar. */
export function tenantEnvDoProcesso(e: EnvLike = process.env): TenantClientEnv | undefined {
  const url = e.SUPABASE_URL, anonKey = e.SUPABASE_ANON_KEY, jwtSecret = e.SUPABASE_JWT_SECRET;
  if (!url || !anonKey || !jwtSecret) return undefined;
  return { url, anonKey, jwtSecret };
}

/** SWITCH strangler (Fatia 3): o banco que a rota deve usar.
 *  Com a flag `RLS_TENANT_ROTAS=1` E env completa → client-do-OPERADOR (o Postgres
 *  impõe o isolamento via RLS 079). Senão → o `servico` (comportamento de hoje:
 *  ZERO mudança em produção até o Junior setar as chaves e virar a flag). Migra
 *  rota a rota trocando `supabase` por `bancoDoOperador(req, supabase)`. */
export function bancoDoOperador(req: RequisicaoComOperador, servico: SupabaseClient, e: EnvLike = process.env): SupabaseClient {
  if (e.RLS_TENANT_ROTAS !== '1') return servico;
  const env = tenantEnvDoProcesso(e);
  if (!env) return servico;   // flag ligada mas env incompleta → não quebra a rota
  return clientDoOperador(req, env);
}
