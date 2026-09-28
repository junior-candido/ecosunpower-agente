// src/modules/dashboard/trava-proposta-empresa.ts
// AP0 — SEGURANÇA (28/09/2026): toda rota /dashboard/propostas/… só age se a
// proposta (pelo slug) E o lead (lead_id, na URL ou no corpo) forem da EMPRESA
// DA SESSÃO. Antes, as rotas novo/preview/enviar/reabrir/visualizacoes buscavam
// só pelo slug: um operador de outra empresa via, reenviava e regravava a
// proposta alheia sabendo o link.
//
// Um portão só, registrado no router ANTES de todas as rotas /propostas
// (router.use('/propostas', …)). Roda antes de qualquer efeito. Outra empresa,
// slug inexistente ou sem sessão → 404 (não conta que existe). O company_id sai
// SÓ da sessão (req.dashUser), nunca da URL.
//
// - /propostas            (listagem) → passa (a listagem filtra por empresa).
// - /propostas/novo       → confere o lead_id (query e/ou corpo urlencoded).
//   O POST é multipart: o corpo só é lido DEPOIS (multer), então o form manda o
//   lead_id na URL e a rota usa leadIdConferido() — nunca o lead_id cru do corpo.
// - /propostas/<slug>/…   → confere a proposta; e o lead_id, se vier.
//   Rota fixa nova (ex.: /propostas/abertas) cairia aqui como slug → 404:
//   falha fechada; acrescente-a em ROTAS_SEM_SLUG.
//
// As rotas públicas do cliente (/p/:slug no index.ts) não passam por aqui.

import type { Request, Response, NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { leadEhDaEmpresa } from './trava-lead-empresa.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[A-Za-z0-9_-]{8,64}$/;
const ROTAS_SEM_SLUG = new Set(['novo']);
const CHAVE_LOCALS = 'leadIdConferido';

type ReqComSessao = Request & { dashUser?: { companyId?: string } };

/** lead_id já conferido pelo portão (null se o pedido não trouxe lead). */
export function leadIdConferido(_req: Request, res: Response): string | null {
  const v = (res.locals as Record<string, unknown>)[CHAVE_LOCALS];
  return typeof v === 'string' ? v : null;
}

function naoAchou(res: Response): void {
  res.status(404).send('não encontrado');
}

/** O registro (proposta/lead) da tabela é da empresa? Legado sem company_id = da casa. */
async function ehDaEmpresa(db: SupabaseClient, tabela: 'propostas_publicas' | 'leads', coluna: 'slug' | 'id', valor: string, companyId: string): Promise<boolean> {
  const { data, error } = await db.from(tabela).select('company_id').eq(coluna, valor).maybeSingle();
  if (error) throw new Error(error.message);
  return !!data && leadEhDaEmpresa(data as { company_id?: string | null }, companyId);
}

/** Middleware para `router.use('/propostas', …)`. `db` = client de serviço (o filtro é explícito aqui). */
export function criarTravaPropostaDaEmpresa(db: SupabaseClient) {
  return async function travaPropostaDaEmpresa(req: Request, res: Response, next: NextFunction): Promise<void> {
    const partes = req.path.split('/').filter(Boolean);
    if (partes.length === 0) { next(); return; } // listagem

    const companyId = (req as ReqComSessao).dashUser?.companyId;
    if (!companyId) { naoAchou(res); return; }

    // lead_id pode vir na URL e/ou no corpo (form urlencoded). Se vierem os dois, têm de bater.
    // Repetido (?lead_id=a&lead_id=b) vira lista e escaparia da conferência → recusa.
    const cruQ = req.query.lead_id;
    const cruB = (req.body as Record<string, unknown> | undefined)?.lead_id;
    if ((cruQ !== undefined && typeof cruQ !== 'string') || (cruB !== undefined && typeof cruB !== 'string')) {
      res.status(400).send('lead_id inválido');
      return;
    }
    const q = cruQ ?? '';
    const b = cruB ?? '';
    if (q && b && q !== b) { naoAchou(res); return; }
    const leadId = q || b;
    if (leadId && !UUID_RE.test(leadId)) { res.status(400).send('lead_id inválido'); return; }

    const primeiro = partes[0];
    const temSlug = !ROTAS_SEM_SLUG.has(primeiro);
    if (temSlug && !SLUG_RE.test(primeiro)) { naoAchou(res); return; }

    try {
      if (temSlug && !(await ehDaEmpresa(db, 'propostas_publicas', 'slug', primeiro, companyId))) { naoAchou(res); return; }
      if (leadId && !(await ehDaEmpresa(db, 'leads', 'id', leadId, companyId))) { naoAchou(res); return; }
    } catch {
      res.status(500).send('erro ao conferir a proposta');
      return;
    }
    (res.locals as Record<string, unknown>)[CHAVE_LOCALS] = leadId || null;
    next();
  };
}
