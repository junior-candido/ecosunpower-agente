// src/modules/dashboard/obras-store.ts
// Consultas do Quadro de Obras e do Vincular usinas SEMPRE presas à empresa da
// SESSÃO (revisão de segurança do R15, 28/09/2026). Antes as rotas liam/moviam
// sistemas_clientes só pelo id — um tenant movia obra, lia o contato do cliente
// ou vinculava usina de outra empresa. Regras:
//  - company_id vem do operador logado (req.dashUser.companyId), nunca do body;
//  - EcoSun também enxerga a usina legada sem carimbo (company_id null), como
//    usinaPertenceAoOperador;
//  - sem empresa na sessão → nada (fail-closed).
import type { SupabaseClient } from '@supabase/supabase-js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';

type Empresa = string | null | undefined;

/** Filtro da empresa dona da usina (EcoSun inclui o legado sem carimbo). */
function daEmpresa<Q extends { eq: (c: string, v: string) => Q; or: (f: string) => Q }>(q: Q, companyId: string): Q {
  return companyId === ECOSUN_COMPANY_ID
    ? q.or(`company_id.eq.${ECOSUN_COMPANY_ID},company_id.is.null`)
    : q.eq('company_id', companyId);
}

export interface ObraLinha {
  id: string;
  apelido: string | null;
  cidade: string | null;
  potencia_kwp: number | null;
  etapa_obra: string;
  etapa_obra_updated_at: string | null;
}

/** Usinas ativas da empresa para o Quadro de Obras. */
export async function listarObras(db: SupabaseClient, companyId: Empresa): Promise<ObraLinha[]> {
  if (!companyId) return [];
  const q = db.from('sistemas_clientes')
    .select('id, apelido, cidade, potencia_kwp, etapa_obra, etapa_obra_updated_at')
    .eq('ativo', true);
  const { data, error } = await daEmpresa(q as any, companyId).order('apelido', { ascending: true });
  if (error) throw new Error(`usinas/kanban: ${error.message}`);
  return (data ?? []) as ObraLinha[];
}

/** Move UMA obra de etapa. false = a usina não existe nesta empresa (nada mudou). */
export async function moverObra(db: SupabaseClient, companyId: Empresa, id: string, etapa: string): Promise<boolean> {
  if (!companyId) return false;
  const q = db.from('sistemas_clientes')
    .update({ etapa_obra: etapa, etapa_obra_updated_at: new Date().toISOString() })
    .eq('id', id);
  const { data, error } = await daEmpresa(q as any, companyId).select('id');
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown[]).length > 0;
}

/** Move VÁRIAS obras; devolve os ids que eram da empresa (e foram movidos). */
export async function moverObrasLote(db: SupabaseClient, companyId: Empresa, ids: string[], etapa: string): Promise<string[]> {
  if (!companyId || ids.length === 0) return [];
  const q = db.from('sistemas_clientes')
    .update({ etapa_obra: etapa, etapa_obra_updated_at: new Date().toISOString() })
    .in('id', ids);
  const { data, error } = await daEmpresa(q as any, companyId).select('id');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string }>).map((l) => l.id);
}

export interface UsinaContatoLinha extends ObraLinha { uf: string | null; lead_id: string | null }

/** A usina do painel de contato — só se for da empresa (null = 404). */
export async function lerUsinaDoContato(db: SupabaseClient, companyId: Empresa, id: string): Promise<UsinaContatoLinha | null> {
  if (!companyId) return null;
  const q = db.from('sistemas_clientes')
    .select('id, apelido, cidade, uf, potencia_kwp, etapa_obra, etapa_obra_updated_at, lead_id')
    .eq('id', id);
  const { data, error } = await daEmpresa(q as any, companyId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as UsinaContatoLinha | null;
}

/** Usinas ativas SEM cliente da empresa (mutirão de vínculo). */
export async function listarUsinasSemCliente(db: SupabaseClient, companyId: Empresa): Promise<Array<{ id: string; apelido: string | null }>> {
  if (!companyId) return [];
  const q = db.from('sistemas_clientes').select('id, apelido').eq('ativo', true).is('lead_id', null);
  const { data, error } = await daEmpresa(q as any, companyId).order('apelido');
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; apelido: string | null }>;
}

/** Vincula a usina (da empresa) ao cliente e manda pro pós-venda. false = não é da empresa. */
export async function vincularUsinaAoCliente(db: SupabaseClient, companyId: Empresa, usinaId: string, leadId: string): Promise<boolean> {
  if (!companyId) return false;
  const q = db.from('sistemas_clientes')
    .update({ lead_id: leadId, etapa_obra: 'pos_venda', etapa_obra_updated_at: new Date().toISOString() })
    .eq('id', usinaId).eq('ativo', true);
  const { data, error } = await daEmpresa(q as any, companyId).select('id');
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown[]).length > 0;
}
