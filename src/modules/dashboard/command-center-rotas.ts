// src/modules/dashboard/command-center-rotas.ts
// Handlers de /dashboard/command-center, /dashboard/atencao e /dashboard/tv.
// Ficam fora do router.ts pra poderem ser testados direto (req/res falsos),
// sem subir o router inteiro com sessão.
//
// FASE B: dado real (command-center-queries.ts), sempre escopado pela empresa
// DA SESSÃO e pelas permissões do usuário. Continua SÓ ECOSUN por decisão de
// produto: as consultas já são tenant-safe, então abrir pro tenant é virar
// CC_ABERTO_A_TENANTS (e decidir o gating por módulo). Quem não pode ver vai
// pro Cockpit — a entrada do tenant —, nunca pra /home (casca da casa).

import type { Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthedRequest } from './auth.js';
import { can, type DashUser } from './permissions.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';
import { bancoDoOperador } from '../tenant-client.js';
import { carregarCommandCenter, type DadosCommandCenter, type PermissoesCC } from './command-center-queries.js';
import { renderCommandCenterPage, renderCentralAtencaoPage, renderModoTvPage } from './command-center-views.js';

type Handler = (req: Request, res: Response) => Promise<void>;

/** Abrir o Command Center e a Central de Atenção pro tenant (fase posterior). */
export const CC_ABERTO_A_TENANTS = false;

function podeVer(user: DashUser | undefined): user is DashUser {
  if (!user) return false;
  return user.companyId === ECOSUN_COMPANY_ID || CC_ABERTO_A_TENANTS;
}

export function permissoesDe(user: DashUser): PermissoesCC {
  return {
    usinas: can(user, 'usinas', 'visualizar'),
    leads: can(user, 'leads', 'visualizar'),
    propostas: can(user, 'propostas', 'visualizar'),
    financeiro: can(user, 'financeiro', 'visualizar'),
  };
}

async function carregar(req: Request, supabase: SupabaseClient, user: DashUser, agora: Date): Promise<DadosCommandCenter | null> {
  try {
    // Cada fonte já se protege sozinha; aqui só pega o que escapar (ex.: cliente quebrado).
    return await carregarCommandCenter(bancoDoOperador(req as AuthedRequest, supabase), user.companyId, agora, permissoesDe(user));
  } catch (err) {
    console.error('[dashboard/command-center] carga falhou', err);
    return null;
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
    const dados = await carregar(req, supabase, user, agora);
    res.type('text/html').send(renderCommandCenterPage({ agora, nomeUsuario: user.nome ?? null, dados }, user));
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
    const dados = await carregar(req, supabase, user, agora);
    const q = req.query ?? {};
    res.type('text/html').send(renderCentralAtencaoPage({
      agora, dados, filtro: { area: q.area, severidade: q.severidade },
    }, user));
  };
}

// Modo TV — fase I. Por enquanto a página explica o que vem (sem número).
export function rotaModoTv(): Handler {
  return async (req, res) => {
    const user = (req as AuthedRequest).dashUser;
    if (!podeVer(user)) {
      res.redirect('/dashboard/cockpit');
      return;
    }
    res.type('text/html').send(renderModoTvPage(user));
  };
}
