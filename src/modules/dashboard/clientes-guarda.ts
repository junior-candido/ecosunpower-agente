// src/modules/dashboard/clientes-guarda.ts
// Renovação do miolo — R16 (revisão de segurança, 28/09/2026).
// /clientes ainda é só da EcoSun (soEcosunPorEnquanto no router), mas as rotas
// liam/alteravam/excluíam o cliente, os anexos, o relatório pós-instalação e o
// vínculo de usina SÓ pelo id da URL/formulário. Defesa em profundidade para o
// dia em que a tela abrir ao tenant (e para a própria EcoSun não mexer em
// cliente de outra empresa): toda leitura/escrita por id confere a empresa da
// SESSÃO. Alheio ou inexistente → o MESMO 404 (não revela que existe).
// Sem empresa na sessão → nega (fail-closed).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Request, Response, NextFunction } from 'express';
import { usinaPertenceAoOperador } from './permissions.js';
import { leadEhDaEmpresa } from './trava-lead-empresa.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O lead (cliente) é da empresa? Lead legado sem company_id = da casa (mesma regra de /leads/:id). */
export async function clienteDaEmpresa(db: SupabaseClient, leadId: string, companyId: string | null | undefined): Promise<boolean> {
  if (!companyId || !UUID_RE.test(leadId)) return false;
  const { data, error } = await db.from('leads').select('id, company_id').eq('id', leadId).maybeSingle();
  return !error && !!data && leadEhDaEmpresa(data as { company_id?: string | null }, companyId);
}

/** O anexo é DESTE cliente? (o remover apagava qualquer anexo pelo id). */
export async function anexoDoCliente(db: SupabaseClient, anexoId: string, leadId: string): Promise<boolean> {
  if (!UUID_RE.test(anexoId) || !UUID_RE.test(leadId)) return false;
  const { data, error } = await db.from('lead_anexos').select('id').eq('id', anexoId).eq('lead_id', leadId).maybeSingle();
  return !error && !!data;
}

/** A usina é da empresa? (company_id nulo = legado da EcoSun, igual ao Monitoramento). */
export async function sistemaDaEmpresa(db: SupabaseClient, sistemaId: string, companyId: string | null | undefined): Promise<boolean> {
  if (!companyId || !UUID_RE.test(sistemaId)) return false;
  const { data, error } = await db.from('sistemas_clientes').select('id, company_id').eq('id', sistemaId).maybeSingle();
  if (error || !data) return false;
  return usinaPertenceAoOperador((data as { company_id?: string | null }).company_id ?? null, companyId);
}

/**
 * Middleware para `router.use('/clientes/:id', …)`: se o :id é um UUID (ficha,
 * edit, arquivar, desarquivar, excluir, anexos, relatório pós-instalação), o
 * cliente tem que ser da empresa da sessão. Caminhos que não são UUID ("novo",
 * "eva-action", "vincular-sistema") passam — cada rota confere o seu.
 */
export function guardaClienteDaEmpresa(dbDe: (req: Request) => SupabaseClient) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) { next(); return; }
    const companyId = (req as Request & { dashUser?: { companyId?: string | null } }).dashUser?.companyId;
    try {
      if (await clienteDaEmpresa(dbDe(req), id, companyId)) { next(); return; }
    } catch (err) {
      console.error('[clientes-guarda]', (err as Error).message);
    }
    res.status(404).send('<h2>Cliente não encontrado</h2><a href="/dashboard/clientes">← voltar</a>');
  };
}
