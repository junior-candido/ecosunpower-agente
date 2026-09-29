// src/modules/dashboard/command-center-rotas.ts
// Handlers de /dashboard/command-center, /dashboard/atencao e /dashboard/tv.
// Ficam fora do router.ts pra poderem ser testados direto (req/res falsos),
// sem subir o router inteiro com sessão.
//
// FASE B: dado real (command-center-queries.ts), sempre escopado pela empresa
// DA SESSÃO. Acesso a cada bloco = papel do usuário E módulo contratado
// (empresa_modulos, lido 1x por requisição, fail-closed). O que a empresa não
// contratou aparece trancado (vitrine). Aberto pro tenant desde 28/09/2026
// (primeiro: Conquista Solar). Modo TV continua só da casa.
// R5 (nova entrada, D1 = a): quem não pode ver vai pra paginaInicialDe(user) —
// sem sessão → login; tenant no Modo TV → Command Center dele. Nunca pro
// Cockpit (saiu do menu e é só da casa) nem pra /home.

import type { Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthedRequest } from './auth.js';
import { can, ehPapelTv, type DashUser } from './permissions.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';
import { bancoDoOperador } from '../tenant-client.js';
import {
  carregarCommandCenter, blocosContratados, NENHUM_MODULO,
  type DadosCommandCenter, type PermissoesCC,
} from './command-center-queries.js';
import { modulosDaRequisicao } from './modulos-contratados.js';
import { todasEmpresasConhecidas } from '../empresa-config.js';
import { renderCommandCenterPage, renderCentralAtencaoPage, renderModoTvPage } from './command-center-views.js';
import { paginaInicialDe } from './entrada.js';

type Handler = (req: Request, res: Response) => Promise<void>;

const SEM_ACESSO_CC = '<p style="font-family:sans-serif;padding:40px">Esta área ainda não está disponível para a sua empresa.</p>';

/** Command Center e Central de Atenção abertos pro tenant (dado escopado + vitrine). */
export const CC_ABERTO_A_TENANTS = true;

function podeVer(user: DashUser | undefined): user is DashUser {
  if (!user) return false;
  return user.companyId === ECOSUN_COMPANY_ID || CC_ABERTO_A_TENANTS;
}

/** Modo TV é da casa: a tela do escritório da EcoSun. */
function ehDaCasa(user: DashUser | undefined): user is DashUser {
  return !!user && user.companyId === ECOSUN_COMPANY_ID;
}

/**
 * Nome da assistente DESTA empresa, só se ela estiver no cadastro carregado
 * (empresa_config). Empresa que o cache não conhece cairia nos defaults da
 * EcoSun ("Eva") — por isso não se usa empresaDe() aqui. Genérico = null.
 */
export function nomeDaAssistente(companyId: string): string | null {
  const e = todasEmpresasConhecidas().find((x) => x.companyId === companyId);
  const nome = e?.nomeAtendente?.trim();
  return nome && nome !== 'Assistente' ? nome : null;
}

export function permissoesDe(user: DashUser): PermissoesCC {
  return {
    usinas: can(user, 'usinas', 'visualizar'),
    leads: can(user, 'leads', 'visualizar'),
    propostas: can(user, 'propostas', 'visualizar'),
    financeiro: can(user, 'financeiro', 'visualizar'),
    marketing: can(user, 'marketing', 'visualizar'),
  };
}

interface Carga { dados: DadosCommandCenter | null; contratados: PermissoesCC }

/** Modo TV (R26): o que a TV mostra — usinas e comercial, NUNCA financeiro
 *  (dinheiro não vai pra tela da parede) nem marketing. Vale pro usuário do
 *  papel TV (que não tem permissão nenhuma de área) e pra casa abrindo a TV. */
export const PERMISSOES_TV: PermissoesCC = { usinas: true, leads: true, propostas: true, financeiro: false, marketing: false };

async function carregar(req: Request, supabase: SupabaseClient, user: DashUser, agora: Date, permissoes: PermissoesCC = permissoesDe(user)): Promise<Carga> {
  let contratados: PermissoesCC = { ...NENHUM_MODULO };
  try {
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    // 1 leitura por requisição (a trava de módulos do router já leu e deixou
    // no cache da requisição); erro = tudo trancado (fail-closed).
    contratados = blocosContratados(await modulosDaRequisicao(req, db, user.companyId));
    // Cada fonte já se protege sozinha; aqui só pega o que escapar (ex.: cliente quebrado).
    const dados = await carregarCommandCenter(db, user.companyId, agora, permissoes, {
      contratados,
      // Conta a pagar PF (pessoal do dono) só pro admin — e nunca na TV.
      verContasPF: user.isAdmin && permissoes.financeiro,
    });
    return { dados, contratados };
  } catch (err) {
    console.error('[dashboard/command-center] carga falhou', err);
    return { dados: null, contratados };
  }
}

export function rotaCommandCenter(supabase: SupabaseClient, agoraFn: () => Date = () => new Date()): Handler {
  return async (req, res) => {
    const user = (req as AuthedRequest).dashUser;
    if (!podeVer(user)) {
      // Sem sessão → login. Logado sem acesso → 403 (redirecionar pra entrada
      // seria laço: a entrada É o Command Center desde o R5).
      if (user) { res.status(403).type('text/html').send(SEM_ACESSO_CC); return; }
      res.redirect(paginaInicialDe(user));
      return;
    }
    const agora = agoraFn();
    const { dados, contratados } = await carregar(req, supabase, user, agora);
    res.type('text/html').send(renderCommandCenterPage({
      agora, nomeUsuario: user.nome ?? null, dados, contratados, nomeAssistente: nomeDaAssistente(user.companyId),
    }, user));
  };
}

export function rotaCentralAtencao(supabase: SupabaseClient, agoraFn: () => Date = () => new Date()): Handler {
  return async (req, res) => {
    const user = (req as AuthedRequest).dashUser;
    if (!podeVer(user)) {
      // Sem sessão → login. Logado sem acesso → 403 (redirecionar pra entrada
      // seria laço: a entrada É o Command Center desde o R5).
      if (user) { res.status(403).type('text/html').send(SEM_ACESSO_CC); return; }
      res.redirect(paginaInicialDe(user));
      return;
    }
    const agora = agoraFn();
    const { dados } = await carregar(req, supabase, user, agora);
    const q = req.query ?? {};
    res.type('text/html').send(renderCentralAtencaoPage({
      agora, dados, filtro: { area: q.area, severidade: q.severidade },
    }, user));
  };
}

// Modo TV — fase I / R26 (D6 = a). Quem abre: a casa (qualquer usuário, pelo
// botão do Command Center) e o usuário do papel "TV só-leitura" de QUALQUER
// empresa (a TV mostra a empresa DELE). Tenant comum continua no Command Center.
// Dado sempre escopado pela empresa da sessão, com PERMISSOES_TV (sem dinheiro).
// Sem banco (testes antigos) → a tela abre com "—".
export function rotaModoTv(supabase?: SupabaseClient, agoraFn: () => Date = () => new Date()): Handler {
  return async (req, res) => {
    const user = (req as AuthedRequest).dashUser;
    if (!user || !(ehDaCasa(user) || ehPapelTv(user))) {
      res.redirect(paginaInicialDe(user));
      return;
    }
    const agora = agoraFn();
    // Usuário da TV: PERMISSOES_TV. Pessoa da casa abrindo a TV: nunca vê mais
    // do que o papel dela já vê (interseção) — e nunca dinheiro.
    const meu = permissoesDe(user);
    const perm: PermissoesCC = ehPapelTv(user) ? PERMISSOES_TV : {
      usinas: PERMISSOES_TV.usinas && meu.usinas, leads: PERMISSOES_TV.leads && meu.leads,
      propostas: PERMISSOES_TV.propostas && meu.propostas, financeiro: false, marketing: false,
    };
    const { dados, contratados } = supabase
      ? await carregar(req, supabase, user, agora, perm)
      : { dados: null, contratados: undefined };
    res.type('text/html').send(renderModoTvPage(user, {
      agora, nomeUsuario: user.nome ?? null, dados, contratados, nomeAssistente: nomeDaAssistente(user.companyId),
    }));
  };
}

/**
 * Trava do papel "TV só-leitura" (R26): esse usuário só abre o Modo TV. Toda
 * outra página GET volta pra /dashboard/tv; POST/JSON → 403 (sair continua).
 * Registrada no router logo depois da sessão.
 */
export function travaPapelTv(req: Request, res: Response, next: () => void): void {
  const user = (req as AuthedRequest).dashUser;
  if (!ehPapelTv(user)) { next(); return; }
  const caminho = String(req.path ?? '').toLowerCase().replace(/\/+$/, '') || '/';
  if ((req.method === 'GET' || req.method === 'HEAD') && caminho === '/tv') { next(); return; }
  // (o /logout e o /estatico são registrados ANTES da sessão — nem chegam aqui)
  const querJson = String(req.headers?.accept ?? '').includes('application/json');
  if ((req.method === 'GET' || req.method === 'HEAD') && !querJson) { res.redirect('/dashboard/tv'); return; }
  res.status(403).json({ ok: false, error: 'Este acesso é só do Modo TV.' });
}

/**
 * Trava do Cockpit antigo (R5): a rota continua viva, mas SÓ para a casa.
 * A consulta do Cockpit (cockpit-queries.ts) não filtra empresa — lê os leads,
 * conversas e campanhas de todas — e o tenant caía nela depois do login. O
 * "SYNC AGORA" (POST /cockpit/sync) sincronizava as usinas de TODAS as
 * empresas. Tenant: GET de página → Command Center dele; POST ou JSON → 403.
 * Registrada no router com router.use('/cockpit', …) antes das rotas.
 */
export function travaTelaDaCasa(req: Request, res: Response, next: () => void): void {
  const user = (req as AuthedRequest).dashUser;
  if (ehDaCasa(user)) { next(); return; }
  const querJson = String(req.headers?.accept ?? '').includes('application/json');
  if ((req.method === 'GET' || req.method === 'HEAD') && !querJson) {
    res.redirect(paginaInicialDe(user));
    return;
  }
  res.status(403).json({ ok: false, error: 'Área indisponível para a sua empresa.' });
}

/** Cockpit antigo: só da casa (ver travaTelaDaCasa). */
export const travaCockpitDaCasa = travaTelaDaCasa;
/** Visão geral (/home, R24): a consulta (fetchDashboardKpis e os gráficos
 *  mensais) é da casa e não filtra empresa — o tenant, que nem tem o item no
 *  menu, caía nela digitando o endereço e via os números da casa. */
export const travaVisaoGeralDaCasa = travaTelaDaCasa;
