// src/modules/dashboard/trava-lead-empresa.ts
// HOTFIX DE SEGURANÇA (28/09/2026): toda rota /dashboard/leads/:id… só age se o
// lead for da EMPRESA DA SESSÃO. Antes, um operador de outra empresa abria a
// ficha (e o claim automático "capturava" o lead), pausava a Eva, arquivava,
// apagava, marcava perdido etc. sabendo só o id da URL.
//
// Um portão só, registrado no router ANTES de todas as rotas /leads/:id
// (router.use('/leads/:id', …)). Roda antes de qualquer efeito — inclusive o
// claim automático do GET da ficha. Lead de outra empresa → 404 (não conta que
// o lead existe). O company_id sai SÓ da sessão (req.dashUser), nunca da URL.
//
// Não-UUID (/leads/kanban, /leads/conversas…) passa direto: não é id de lead,
// e cada rota com :id já recusa id inválido (400).

import type { Request, Response, NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O lead (já lido) é da empresa da sessão? Lead legado sem company_id = da casa. Sem sessão → não. */
export function leadEhDaEmpresa(lead: { company_id?: string | null }, companyIdSessao: string | undefined | null): boolean {
  if (!companyIdSessao) return false;
  return (lead.company_id ?? ECOSUN_COMPANY_ID) === companyIdSessao;
}

type ReqComSessao = Request & { dashUser?: { companyId?: string } };

/**
 * Middleware para `router.use('/leads/:id', …)`. `db` é o client que lê o lead
 * (o de serviço serve: o filtro de empresa é feito aqui, explícito).
 */
export function criarTravaLeadDaEmpresa(db: SupabaseClient) {
  return async function travaLeadDaEmpresa(req: Request, res: Response, next: NextFunction): Promise<void> {
    const id = String((req.params as Record<string, string>).id ?? '');
    if (!UUID_RE.test(id)) { next(); return; }
    const companyId = (req as ReqComSessao).dashUser?.companyId;
    if (!companyId) { res.status(404).send('lead não encontrado'); return; }
    try {
      const { data, error } = await db.from('leads').select('id, company_id').eq('id', id).maybeSingle();
      if (error) { res.status(500).send('erro ao conferir o lead'); return; }
      if (!data || !leadEhDaEmpresa(data as { company_id?: string | null }, companyId)) {
        res.status(404).send('lead não encontrado');
        return;
      }
      next();
    } catch {
      res.status(500).send('erro ao conferir o lead');
    }
  };
}
