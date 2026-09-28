// src/modules/dashboard/command-center-rotas.ts
// Handlers das rotas /dashboard/command-center e /dashboard/tv (fase A).
// Ficam fora do router.ts pra poderem ser testados direto (req/res falsos),
// sem subir o router inteiro com sessão.
//
// SÓ ECOSUN nesta fase: as consultas ainda não filtram company_id no código
// (dependem do RLS do bancoDoOperador, que pode estar desligado) e as telas
// apontam pra telas da casa (Cockpit, Financeiro). A fase B abre pro tenant
// com consultas escopadas explicitamente.

import type { Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthedRequest } from './auth.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';
import { bancoDoOperador } from '../tenant-client.js';
import { fetchCommandCenterKpis, type CommandCenterKpis } from './queries.js';
import { renderCommandCenterPage, renderModoTvPage } from './command-center-views.js';

type Handler = (req: Request, res: Response) => Promise<void>;

function ehEcosun(req: Request): boolean {
  return (req as AuthedRequest).dashUser?.companyId === ECOSUN_COMPANY_ID;
}

export function rotaCommandCenter(supabase: SupabaseClient, agoraFn: () => Date = () => new Date()): Handler {
  return async (req, res) => {
    const user = (req as AuthedRequest).dashUser;
    if (!ehEcosun(req)) {
      res.redirect('/dashboard/home');
      return;
    }
    const agora = agoraFn();
    let kpisMes: CommandCenterKpis | null = null;
    try {
      // Cada contagem que falhar vem null → "—" na tela, nunca número inventado.
      kpisMes = await fetchCommandCenterKpis(bancoDoOperador(req as AuthedRequest, supabase), agora);
    } catch (err) {
      console.error('[dashboard/command-center] kpis', err);
    }
    res.type('text/html').send(renderCommandCenterPage({ agora, nomeUsuario: user?.nome ?? null, kpisMes }, user));
  };
}

// Modo TV — fase I. Por enquanto a página explica o que vem (sem número).
// Só EcoSun até a fase B (mesma regra do Command Center).
export function rotaModoTv(): Handler {
  return async (req, res) => {
    if (!ehEcosun(req)) {
      res.redirect('/dashboard/home');
      return;
    }
    res.type('text/html').send(renderModoTvPage((req as AuthedRequest).dashUser));
  };
}
