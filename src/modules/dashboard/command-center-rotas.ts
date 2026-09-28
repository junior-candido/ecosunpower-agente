// src/modules/dashboard/command-center-rotas.ts
// Handlers de /dashboard/command-center, /dashboard/atencao e /dashboard/tv.
// Ficam fora do router.ts pra poderem ser testados direto (req/res falsos),
// sem subir o router inteiro com sessão.
//
// FASE B: dado real (command-center-queries.ts), sempre escopado pela empresa
// DA SESSÃO. Acesso a cada bloco = papel do usuário E módulo contratado
// (empresa_modulos, lido 1x por requisição, fail-closed). O que a empresa não
// contratou aparece trancado (vitrine). Aberto pro tenant desde 28/09/2026
// (primeiro: Conquista Solar). Modo TV continua só da casa. Sem sessão (ou sem
// permissão) vai pro Cockpit — a entrada do tenant —, nunca pra /home.

import type { Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthedRequest } from './auth.js';
import { can, type DashUser } from './permissions.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';
import { bancoDoOperador } from '../tenant-client.js';
import {
  carregarCommandCenter, lerModulosContratados, NENHUM_MODULO,
  type DadosCommandCenter, type PermissoesCC,
} from './command-center-queries.js';
import { todasEmpresasConhecidas } from '../empresa-config.js';
import { renderCommandCenterPage, renderCentralAtencaoPage, renderModoTvPage } from './command-center-views.js';

type Handler = (req: Request, res: Response) => Promise<void>;

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

async function carregar(req: Request, supabase: SupabaseClient, user: DashUser, agora: Date): Promise<Carga> {
  let contratados: PermissoesCC = { ...NENHUM_MODULO };
  try {
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    // 1 leitura por requisição; erro = tudo trancado (fail-closed).
    contratados = await lerModulosContratados(db, user.companyId);
    // Cada fonte já se protege sozinha; aqui só pega o que escapar (ex.: cliente quebrado).
    const dados = await carregarCommandCenter(db, user.companyId, agora, permissoesDe(user), {
      contratados,
      // Conta a pagar PF (pessoal do dono) só pro admin.
      verContasPF: user.isAdmin,
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
      res.redirect('/dashboard/cockpit');
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
      res.redirect('/dashboard/cockpit');
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

// Modo TV — fase I. Por enquanto a página explica o que vem (sem número). Só da casa.
export function rotaModoTv(): Handler {
  return async (req, res) => {
    const user = (req as AuthedRequest).dashUser;
    if (!ehDaCasa(user)) {
      res.redirect('/dashboard/cockpit');
      return;
    }
    res.type('text/html').send(renderModoTvPage(user));
  };
}
