// src/modules/tenant-db.ts
//
// INVERTER O PADRAO (19/09/2026).
//
// Hoje a aplicacao inteira entra no banco com `service_role`, que IGNORA RLS
// por definicao. As 106 tabelas com company_id tem RLS ligada e 95 politicas
// que checam empresa — e nenhuma delas e avaliada. Sobra a disciplina de
// lembrar o filtro em 929 consultas. Esquecer devolve TUDO; deveria devolver
// NADA. Foi assim que 6 leads da Conquista receberam e-mail da EcoSunPower.
//
// A boa noticia: as politicas ja aceitam a empresa vinda do JWT —
//
//   USING (company_id = coalesce(
//     nullif(current_setting('app.company_id', true), '')::uuid,
//     (auth.jwt() ->> 'company_id')::uuid))
//
// ou seja, nao e preciso reescrever politica nenhuma. Basta a aplicacao parar
// de entrar como chave mestra e passar a entrar com um cracha que diz de quem
// ela e. E o que este modulo faz.
//
// FATIA 1 (esta): constroi a peca e deixa DESLIGADA. Nada muda em producao
// enquanto RLS_ESTRITO=off, que e o padrao.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';

/**
 * off   — como sempre foi: tudo pela chave mestra. Padrao.
 * aviso — ainda usa a chave mestra, mas GRITA no log quando alguem consulta
 *         sem contexto de empresa. E a fatia 2: colher a lista real do que
 *         quebraria, sem quebrar nada.
 * on    — cracha por empresa de verdade. Consulta sem contexto volta vazia.
 */
export type ModoRls = 'off' | 'aviso' | 'on';

export function modoRls(): ModoRls {
  const v = (process.env.RLS_ESTRITO ?? 'off').trim().toLowerCase();
  return v === 'on' || v === 'aviso' ? v : 'off';
}

function base64url(b: Buffer | string): string {
  return Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Cracha HS256 no formato que o Supabase entende, carregando a empresa.
 *
 * Nao usamos biblioteca: o token do Supabase e HS256 puro e o `crypto` do Node
 * resolve em tres linhas. Uma dependencia a menos numa peca de seguranca.
 *
 * `role: 'authenticated'` e o que faz o PostgREST APLICAR a RLS — com
 * `service_role` ele pula, que e exatamente o problema que viemos consertar.
 */
export function mintarCracha(companyId: string, segredo: string, validadeSegundos = 3600): string {
  const agora = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    role: 'authenticated',
    company_id: companyId,
    iat: agora,
    exp: agora + validadeSegundos,
  }));
  const assinatura = base64url(createHmac('sha256', segredo).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${assinatura}`;
}

interface CrachaCache { token: string; expiraEm: number; client: SupabaseClient }
const cache = new Map<string, CrachaCache>();

/** Margem pra nao usar um cracha que vence no meio da requisicao. */
const MARGEM_MS = 5 * 60 * 1000;

export interface ConfigTenantDb {
  supabaseUrl: string;
  supabaseAnonKey?: string;
  supabaseJwtSecret?: string;
}

/**
 * Cliente amarrado a UMA empresa. Toda consulta feita por ele so enxerga o que
 * pertence a ela — a RLS cuida disso, nao a memoria de quem escreveu a query.
 *
 * Devolve null quando falta configuracao (anon key ou segredo do JWT). Quem
 * chama decide: em 'off' cai no cliente de sempre; em 'on' e erro de operacao
 * e o servico nao deve subir sem isso.
 */
export function clientDaEmpresa(companyId: string, cfg: ConfigTenantDb): SupabaseClient | null {
  if (!cfg.supabaseAnonKey || !cfg.supabaseJwtSecret) return null;
  if (!companyId) return null;

  const agora = Date.now();
  const emCache = cache.get(companyId);
  if (emCache && emCache.expiraEm - MARGEM_MS > agora) return emCache.client;

  const validade = 3600;
  const token = mintarCracha(companyId, cfg.supabaseJwtSecret, validade);
  const client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  cache.set(companyId, { token, expiraEm: agora + validade * 1000, client });
  return client;
}

/** Usado pelos testes e pelo boot, pra nao carregar cracha velho entre trocas. */
export function limparCacheDeCrachas(): void {
  cache.clear();
}

/**
 * Quem PODE rodar sem empresa. Lista fechada e declarada — a chave mestra
 * deixa de ser o padrao e vira excecao com nome e dono.
 *
 * Sao as rotinas do grupo B do levantamento: ingestao de noticia, telemetria
 * da propria plataforma, limpeza. Nenhuma delas toca dado de cliente.
 */
export const ROTINAS_GLOBAIS = new Set<string>([
  'runCanalSolarIngestion',
  'checkNewsScraperSchedule',
  'checkBlogSchedule',
  'coletarTelemetria',
  'resumirTelemetria',
  'runInsightsCollector',
  'autoMapearEcosunWaba',
  'limparRh',
  'migrations',
  'health',
]);

export function ehGlobalDeclarada(motivo: string): boolean {
  return ROTINAS_GLOBAIS.has(motivo);
}
