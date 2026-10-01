// src/modules/dashboard/modulos-contratados.ts
// O que a EMPRESA contratou (empresa_modulos, migration 128) — a regra ÚNICA
// usada pelo Command Center, pelo menu e pela trava das rotas do painel.
//
// Junior 28/09/2026: a Jimena (Conquista Solar, contratou SÓ a assistente) é
// admin do tenant e via Usinas, Financeiro e Marketing abertos — o menu e o
// exigir(...) só olhavam o PAPEL. Agora são dois portões: papel E contrato.
//
// Regras:
//  - EcoSun (a casa) tem TODOS os módulos, sem ler a tabela (não depende da 128
//    estar aplicada nem do banco responder).
//  - Tenant: erro ou exceção na leitura → NENHUM módulo (fail-closed).
//  - 1 leitura por requisição (cache na própria requisição).
//  - Página de módulo não contratado → vitrine /dashboard/conhecer/<chave>.

import type { Response, NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';
import { bancoDoOperador } from '../tenant-client.js';
import type { AuthedRequest } from './auth.js';

/** Os módulos vendáveis (mesma lista do comentário da coluna empresa_modulos.modulo). */
export const MODULOS = [
  'eva', 'email', 'pasta_digital', 'monitoramento', 'financeiro', 'fiscal', 'rh', 'marketing', 'medicao', 'previsto_real',
] as const;
export type Modulo = (typeof MODULOS)[number];

export interface RotaDeModulo {
  /** Caminho relativo a /dashboard; casa ele e tudo abaixo dele. */
  prefixo: string;
  modulo: Modulo;
  /** Chave do menu cuja vitrine (/dashboard/conhecer/<chave>) abre quando trancado. */
  chave: string;
}

/**
 * O MAPA — único lugar. Página do painel → módulo contratado.
 * O menu (menu-areas.ts) tira daqui o módulo de cada item (pelo href) e a trava
 * das rotas usa a mesma tabela. O que não está aqui é sempre aberto (Command
 * Center, Central de Atenção, Cockpit, Minha assinatura, Usuários, WhatsApp,
 * vitrine, login...) — só o papel decide.
 */
export const MODULO_DA_ROTA: readonly RotaDeModulo[] = [
  // Usinas / O&M / Instalações / Pós-venda
  { prefixo: '/monitoramento', modulo: 'monitoramento', chave: 'monitoramento' },
  { prefixo: '/demonstrativos', modulo: 'monitoramento', chave: 'demonstrativos' },
  { prefixo: '/usinas', modulo: 'monitoramento', chave: 'usinas_kanban' },
  { prefixo: '/manutencao', modulo: 'monitoramento', chave: 'manutencao' },
  { prefixo: '/os', modulo: 'monitoramento', chave: 'manutencao' },
  { prefixo: '/servicos', modulo: 'monitoramento', chave: 'servicos' },
  { prefixo: '/pos-venda', modulo: 'monitoramento', chave: 'pos_venda' },
  { prefixo: '/medicao', modulo: 'medicao', chave: 'medicao' },
  { prefixo: '/energia', modulo: 'medicao', chave: 'energia' },
  { prefixo: '/pastas', modulo: 'pasta_digital', chave: 'pastas' },
  // Financeiro / fiscal
  { prefixo: '/financeiro', modulo: 'financeiro', chave: 'financeiro' },
  { prefixo: '/cobrar', modulo: 'financeiro', chave: 'cobrar' },
  { prefixo: '/cobrancas', modulo: 'financeiro', chave: 'cobrar' },
  { prefixo: '/assinaturas', modulo: 'financeiro', chave: 'assinaturas' },
  { prefixo: '/fiscal', modulo: 'fiscal', chave: 'fiscal' },
  // Marketing
  { prefixo: '/marketing', modulo: 'marketing', chave: 'marketing' },
  { prefixo: '/marketing/blog', modulo: 'marketing', chave: 'blog' },
  { prefixo: '/marketing/email', modulo: 'marketing', chave: 'email' },
  { prefixo: '/cadencia', modulo: 'marketing', chave: 'cadencia' },
  // Comercial / CRM = a assistente
  { prefixo: '/leads', modulo: 'eva', chave: 'leads' },
  { prefixo: '/leads/kanban', modulo: 'eva', chave: 'kanban' },
  { prefixo: '/propostas', modulo: 'eva', chave: 'propostas' },
  { prefixo: '/recados', modulo: 'eva', chave: 'recados' },
  { prefixo: '/conhecimento', modulo: 'eva', chave: 'conhecimento' },
  // Equipe
  { prefixo: '/rh', modulo: 'rh', chave: 'rh_vagas' },
];

/** Qual módulo (e vitrine) uma página exige. Aceita com ou sem o "/dashboard". null = sempre aberta. */
export function moduloDoCaminho(caminho: string): { modulo: Modulo; chave: string } | null {
  // O router do Express casa rota SEM diferenciar maiúscula (/Financeiro abre
  // /financeiro): a trava normaliza igual, senão vira porta dos fundos.
  let p = (caminho.split('?')[0] ?? '').toLowerCase().replace(/\/{2,}/g, '/');
  if (p === '/dashboard' || p.startsWith('/dashboard/')) p = p.slice('/dashboard'.length);
  let achado: RotaDeModulo | null = null;
  for (const r of MODULO_DA_ROTA) {
    const casa = p === r.prefixo || p.startsWith(`${r.prefixo}/`);
    if (casa && (!achado || r.prefixo.length > achado.prefixo.length)) achado = r;
  }
  return achado ? { modulo: achado.modulo, chave: achado.chave } : null;
}

/**
 * Módulos ATIVOS da empresa. EcoSun = todos (sem ler). Tenant: erro/exceção →
 * conjunto vazio (fail-closed): sem saber o que foi contratado, nada abre.
 */
export async function lerModulosAtivos(db: SupabaseClient, companyId: string): Promise<ReadonlySet<Modulo>> {
  if (companyId === ECOSUN_COMPANY_ID) return new Set(MODULOS);
  try {
    const { data, error } = await db.from('empresa_modulos').select('modulo')
      .eq('company_id', companyId).eq('ativo', true);
    if (error) {
      console.warn('[modulos] empresa_modulos falhou — tudo trancado:', error.message);
      return new Set();
    }
    const validos = new Set<string>(MODULOS);
    return new Set(((data ?? []) as Array<{ modulo?: unknown }>)
      .map((r) => String(r.modulo ?? ''))
      .filter((m): m is Modulo => validos.has(m)));
  } catch (err) {
    console.warn('[modulos] empresa_modulos lançou — tudo trancado:', (err as Error).message);
    return new Set();
  }
}

// Cache por requisição: a trava das rotas e o Command Center pedem a mesma
// coisa; a tabela é lida uma vez só. WeakMap = morre junto com a requisição.
const cachePorRequisicao = new WeakMap<object, Promise<ReadonlySet<Modulo>>>();

/** lerModulosAtivos com cache na requisição (no máximo 1 leitura por requisição). */
export function modulosDaRequisicao(req: object, db: SupabaseClient, companyId: string): Promise<ReadonlySet<Modulo>> {
  let p = cachePorRequisicao.get(req);
  if (!p) {
    p = lerModulosAtivos(db, companyId);
    cachePorRequisicao.set(req, p);
  }
  return p;
}

/**
 * Trava CENTRAL das rotas do painel (router.use depois do login). Para o tenant:
 *  - lê os módulos 1x e deixa na sessão (req.dashUser.modulosContratados) — é
 *    daí que o menu desenha o cadeado;
 *  - página de módulo não contratado: GET → vitrine; pedido de JSON ou outros
 *    métodos → 403 (nada executa, nenhum dado sai).
 * EcoSun passa direto, sem ler nada.
 */
export function criarTravaDeModulo(supabase: SupabaseClient) {
  return async function travaDeModulo(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
    const user = req.dashUser;
    if (!user || user.companyId === ECOSUN_COMPANY_ID) { next(); return; }
    let ativos: ReadonlySet<Modulo>;
    try {
      ativos = await modulosDaRequisicao(req, bancoDoOperador(req, supabase), user.companyId);
    } catch (err) {
      // bancoDoOperador pode lançar (env do crachá quebrada): fail-closed.
      console.warn('[modulos] sem banco pra ler módulos — tudo trancado:', (err as Error).message);
      ativos = new Set();
    }
    // Objeto novo (não muta o usuário que veio do banco/cache da sessão).
    req.dashUser = { ...user, modulosContratados: [...ativos] };

    const alvo = moduloDoCaminho(req.path);
    if (!alvo || ativos.has(alvo.modulo)) { next(); return; }

    // Chamada de dados (fetch que pede JSON) não vira redirect pra uma página HTML.
    const accept = String(req.headers?.accept ?? '').toLowerCase();
    if (accept.includes('application/json')) {
      res.status(403).json({ erro: 'modulo_nao_contratado', modulo: alvo.modulo });
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.redirect(`/dashboard/conhecer/${encodeURIComponent(alvo.chave)}`);
      return;
    }
    res.status(403).type('html').send(
      `<h2>Módulo não contratado</h2><p>Esta parte ainda não faz parte do seu plano. <a href="/dashboard/conhecer/${encodeURIComponent(alvo.chave)}">Conhecer</a></p>`,
    );
  };
}
