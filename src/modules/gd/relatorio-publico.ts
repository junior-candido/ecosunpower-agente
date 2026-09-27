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
    .select('storage_path, instalacao, referencia')
    .eq('token', token)
    .limit(1);
  if (error) throw new Error(`relatorios_gd_gerados (link público): ${error.message}`);
  const r = (data ?? [])[0] as { storage_path: string | null; instalacao: string; referencia: string } | undefined;
  if (!r?.storage_path) return null;
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

export async function listarRelatoriosEnviadosDoLead(
  db: SupabaseClient,
  leadId: string,
  base: string,
): Promise<RelatorioNaPasta[]> {
  const { data, error } = await db
    .from('relatorios_gd_gerados')
    .select('referencia, token')
    .eq('lead_id', leadId)
    .not('enviado_em', 'is', null)
    .not('token', 'is', null)
    .order('referencia', { ascending: false })
    .order('enviado_em', { ascending: false })
    .limit(60);
  if (error) throw new Error(`relatorios_gd_gerados (pasta): ${error.message}`);
  return relatoriosParaPasta((data ?? []) as Array<{ referencia: string; token: string | null }>, base);
}
