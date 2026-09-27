// src/modules/gd/relatorio-publico.ts
// Lado PÚBLICO do relatório mensal da usina (sem login). Usa a chave-mestra,
// então só existem duas portas, e as duas são estreitas:
//  - abrirPdfPublico: busca SÓ pelo token (32 caracteres aleatórios) e devolve
//    SÓ o PDF — nunca lista, nunca busca por UC, cliente ou empresa;
//  - listarRelatoriosEnviadosDoLead: para a Pasta Digital pública, que já é do
//    próprio lead (slug secreto) — só meses ENVIADOS, só mês + link.

import type { SupabaseClient } from '@supabase/supabase-js';
import { baixarAnexo } from '../anexos/storage.js';
import { mesExtenso } from './relatorio-motor.js';
import { linkPublicoRelatorio, nomeArquivoRelatorio } from './relatorio-envio-textos.js';

export async function abrirPdfPublico(
  db: SupabaseClient,
  token: string,
): Promise<{ pdf: Buffer; nomeArquivo: string } | null> {
  const { data, error } = await db
    .from('relatorios_gd_gerados')
    .select('storage_path, instalacao, referencia, lead_id')
    .eq('token', token)
    .limit(1);
  if (error) throw new Error(`relatorios_gd_gerados (link público): ${error.message}`);
  const r = (data ?? [])[0] as
    | { storage_path: string | null; instalacao: string; referencia: string; lead_id: string | null }
    | undefined;
  if (!r?.storage_path) return null;
  // LGPD: cliente apagado → a FK (migration 134) zera lead_id → o link morre.
  if (!r.lead_id) return null;
  const pdf = await baixarAnexo(db, r.storage_path);
  if (!pdf) return null;
  return { pdf, nomeArquivo: nomeArquivoRelatorio(r.instalacao, r.referencia) };
}

export interface RelatorioNaPasta {
  referencia: string;
  mesExtenso: string;
  url: string;
}

/** Um por mês (o 1º de cada mês na entrada = o envio mais novo), do mais novo pro mais velho, até `max`. */
export function relatoriosParaPasta(
  linhas: ReadonlyArray<{ referencia: string; token: string | null }>,
  base: string,
  max = 12,
): RelatorioNaPasta[] {
  const vistos = new Set<string>();
  const out: RelatorioNaPasta[] = [];
  // sort é estável: dentro do mesmo mês mantém a ordem de chegada (enviado_em desc).
  for (const l of [...linhas].sort((a, b) => b.referencia.localeCompare(a.referencia))) {
    if (!l.token || vistos.has(l.referencia)) continue;
    vistos.add(l.referencia);
    out.push({ referencia: l.referencia, mesExtenso: mesExtenso(l.referencia), url: linkPublicoRelatorio(base, l.token) });
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Porta da Pasta Digital pública: só relatórios do lead E da empresa dona do
 * lead (nunca de outra empresa, mesmo que um registro aponte para o lead).
 * Lead não encontrado → lista vazia.
 */
export async function listarRelatoriosDaPasta(
  db: SupabaseClient,
  leadId: string,
  base: string,
): Promise<RelatorioNaPasta[]> {
  const { data, error } = await db.from('leads').select('company_id').eq('id', leadId).limit(1);
  if (error) throw new Error(`leads (empresa do lead da pasta): ${error.message}`);
  const companyId = (data ?? [])[0]?.company_id as string | undefined;
  if (!companyId) return [];
  return listarRelatoriosEnviadosDoLead(db, leadId, base, companyId);
}

export async function listarRelatoriosEnviadosDoLead(
  db: SupabaseClient,
  leadId: string,
  base: string,
  companyId: string,
): Promise<RelatorioNaPasta[]> {
  const { data, error } = await db
    .from('relatorios_gd_gerados')
    .select('referencia, token')
    .eq('lead_id', leadId)
    .eq('company_id', companyId)
    .not('enviado_em', 'is', null)
    .not('token', 'is', null)
    .order('referencia', { ascending: false })
    .order('enviado_em', { ascending: false })
    .limit(60);
  if (error) throw new Error(`relatorios_gd_gerados (pasta): ${error.message}`);
  return relatoriosParaPasta((data ?? []) as Array<{ referencia: string; token: string | null }>, base);
}
