/**
 * import-terceirizada-leads.ts
 *
 * Importa CSV da Letícia (comercial terceirizada antigo) pra tabela `leads`.
 * Filtra leads HIGH-VALUE (exclui "clicou por engano", "perfil inadequado",
 * "outra região"). Upsert por phone — preserva contexto rico em opportunities
 * JSONB pra Eva atender assertivo.
 *
 * Uso:
 *   npx tsx scripts/import-terceirizada-leads.ts --dry-run   (preview, nao escreve)
 *   npx tsx scripts/import-terceirizada-leads.ts             (aplica)
 */

import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { normalizeBrazilianPhone } from '../src/modules/meta-leadgen.js';

const CSV_PATH = 'C:/Users/Meu Computador/Downloads/Leads Ecosun Power(deal list).csv';
const DRY_RUN = process.argv.includes('--dry-run');

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

// Motivos de perda que NAO vamos reativar (alto risco de bloqueio)
const MOTIVOS_DESCARTAR = [
  'Contato sem interesse, clicou no anúncio por engano',
  'Perfil inadequado',
  'Outra região',
];

interface CsvRow {
  criado_em: string;
  organizacao: string;
  titulo: string;
  fone1: string;
  fone2: string;
  consumo: string;
  etiqueta: string;
  etapa: string;
  status: string;
  motivo: string;
}

function parseCsv(): CsvRow[] {
  const buf = fs.readFileSync(CSV_PATH);
  const text = buf.toString('latin1');
  const lines = text.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim());
  const rows: CsvRow[] = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(';');
    rows.push({
      criado_em: parts[0]?.trim() ?? '',
      organizacao: parts[1]?.trim() ?? '',
      titulo: parts[2]?.trim() ?? '',
      fone1: parts[3]?.trim() ?? '',
      fone2: parts[4]?.trim() ?? '',
      consumo: parts[5]?.trim() ?? '',
      etiqueta: parts[6]?.trim() ?? '',
      etapa: parts[7]?.trim() ?? '',
      status: parts[8]?.trim() ?? '',
      motivo: parts[9]?.trim() ?? '',
    });
  }
  return rows;
}

function parseConsumoKwh(consumo: string): number | null {
  // "6.000 kWh/mês" -> 6000; "1.000kWh/mês" -> 1000
  if (!consumo) return null;
  const m = consumo.replace(/\./g, '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function extractTemperature(etiqueta: string): 'quente' | 'morno' | 'frio' | null {
  const lower = etiqueta.toLowerCase();
  if (lower.includes('quente')) return 'quente';
  if (lower.includes('morno')) return 'morno';
  if (lower.includes('frio')) return 'frio';
  return null;
}

function extractAtendente(etiqueta: string): string | null {
  // Letícia Alves aparece como atendente nas etiquetas
  const m = etiqueta.match(/(Letícia\s+\w+|Marcelo\s+\w+|[A-ZÀ-Ú][a-zà-ú]+\s+[A-ZÀ-Ú][a-zà-ú]+)/);
  // Heuristica: nome com 2 palavras capitalizadas que nao sao "Leads Novos" / "Marketing"
  if (m && !['Leads Novos', 'Marketing'].includes(m[1])) return m[1];
  return null;
}

// Mapeia pra enum lead_status valido: novo|qualificando|qualificado|agendado|transferido|inativo
// NAO marcamos perdidos como 'inativo' pq Eva pode pular leads inativos — usamos 'qualificando'
// pra Eva tentar reativar via cadencia de reengajamento.
function mapEtapaToStatus(etapa: string, statusOriginal: string): string {
  if (statusOriginal === 'Ganho') return 'transferido';
  if (etapa === 'Apresentação de Proposta') return 'qualificado';
  if (etapa === 'Qualificação') return 'qualificando';
  if (etapa === 'Pré-qualificação') return 'qualificando';
  // Perdidos: marca como qualificando pra Eva tentar reativar (NAO inativo)
  if (etapa === 'Perdidos' || statusOriginal === 'Perdido') return 'qualificando';
  return 'novo';
}

function shouldImport(row: CsvRow): { ok: boolean; reason?: string } {
  // Filtros de exclusao
  for (const m of MOTIVOS_DESCARTAR) {
    if (row.motivo.includes(m)) return { ok: false, reason: `motivo: ${m}` };
  }
  // Sem telefone nenhum
  if (!row.fone1 && !row.fone2) return { ok: false, reason: 'sem telefone' };
  return { ok: true };
}

interface LeadImport {
  phone: string;
  name: string;
  status: string;
  consent_given: boolean;
  consent_date: string;
  origin: string;
  lead_source: string;
  acquisition_source: string;
  eva_active: boolean;
  energy_data: Record<string, unknown>;
  opportunities: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

async function main() {
  console.log(`=== Import terceirizada leads (${DRY_RUN ? 'DRY RUN' : 'APLICANDO'}) ===\n`);
  const rows = parseCsv();
  console.log(`Total no CSV: ${rows.length}\n`);

  const toImport: LeadImport[] = [];
  const skipped: Array<{ titulo: string; reason: string }> = [];

  for (const row of rows) {
    const filter = shouldImport(row);
    if (!filter.ok) {
      skipped.push({ titulo: row.titulo || '(sem nome)', reason: filter.reason! });
      continue;
    }

    const phoneRaw = row.fone1 || row.fone2;
    const phone = normalizeBrazilianPhone(phoneRaw);
    if (!phone) {
      skipped.push({ titulo: row.titulo, reason: `phone invalido: ${phoneRaw}` });
      continue;
    }

    const consumoKwh = parseConsumoKwh(row.consumo);
    const temperature = extractTemperature(row.etiqueta);
    const atendente = extractAtendente(row.etiqueta);
    const status = mapEtapaToStatus(row.etapa, row.status);

    // Data criada — ISO em UTC
    let createdAtIso = new Date().toISOString();
    if (row.criado_em) {
      try {
        createdAtIso = new Date(row.criado_em).toISOString();
      } catch { /* keep now */ }
    }

    const energy_data: Record<string, unknown> = {};
    if (consumoKwh) energy_data.consumption_kwh = consumoKwh;

    const opportunities: Record<string, unknown> = {
      // Contexto rico pra Eva atender bem o lead reativado
      origem_historica: 'comercial_terceirizado_leticia',
      contato_criado_em_original: row.criado_em || null,
      etapa_anterior: row.etapa || null,
      status_anterior: row.status || null,
      temperatura_anterior: temperature,
      atendente_anterior: atendente,
      motivo_perda_anterior: row.motivo || null,
      tags_originais: row.etiqueta || null,
      eva_context: temperature === 'quente'
        ? `Lead QUENTE da campanha anterior. Era atendido por ${atendente ?? 'comercial terceirizado'}. Cancelamos a terceirização e voltamos com atendimento direto da Eco.`
        : temperature === 'morno'
        ? `Lead MORNO da campanha anterior — interessado mas indefinido. Etapa: ${row.etapa}. ${row.motivo ? 'Última obs: ' + row.motivo : ''}`
        : `Lead FRIO da campanha anterior. ${row.motivo ? 'Motivo da perda: ' + row.motivo : 'Não respondeu follow-up.'} Reativando pra ver se faz sentido agora.`,
    };

    toImport.push({
      phone,
      name: row.titulo || 'Sem nome',
      status,
      consent_given: true,
      consent_date: createdAtIso,
      origin: 'terceirizada_recovered',
      lead_source: 'terceirizada_recovered',
      acquisition_source: 'terceirizada_recovered',
      eva_active: true,
      energy_data,
      opportunities,
      created_at: createdAtIso,
      updated_at: new Date().toISOString(),
    });
  }

  // Stats
  console.log(`✅ Pra importar: ${toImport.length}`);
  console.log(`❌ Descartados: ${skipped.length}`);
  const byReason: Record<string, number> = {};
  for (const s of skipped) byReason[s.reason] = (byReason[s.reason] || 0) + 1;
  for (const [r, c] of Object.entries(byReason)) console.log(`   ${c}x ${r}`);
  console.log();

  // Preview 3 entries
  console.log('--- Preview (3 primeiros) ---');
  for (const l of toImport.slice(0, 3)) {
    console.log(`\n📞 ${l.phone} | ${l.name} | ${l.status}`);
    console.log(`   consumo: ${(l.energy_data as { consumption_kwh?: number }).consumption_kwh ?? 'N/D'} kWh/mes`);
    console.log(`   contexto Eva: ${(l.opportunities as { eva_context: string }).eva_context}`);
  }
  console.log();

  if (DRY_RUN) {
    console.log('DRY RUN — nada escrito no DB. Rode sem --dry-run pra aplicar.');
    return;
  }

  // Aplica upsert por phone
  let inserted = 0;
  let updated = 0;
  let errored = 0;
  for (const lead of toImport) {
    // Verifica se ja existe
    const { data: existing } = await supabase.from('leads').select('id').eq('phone', lead.phone).maybeSingle();
    if (existing) {
      // Update so campos relevantes — NAO sobrescreve dados existentes da Eva
      const { error } = await supabase
        .from('leads')
        .update({
          name: lead.name,
          consent_given: lead.consent_given,
          consent_date: lead.consent_date,
          acquisition_source: lead.acquisition_source,
          opportunities: lead.opportunities,
          updated_at: lead.updated_at,
          // Preserva status, energy_data, eva_active se ja existem (nao sobrescreve)
        })
        .eq('id', existing.id);
      if (error) { console.error(`erro update ${lead.phone}:`, error.message); errored++; }
      else updated++;
    } else {
      const { error } = await supabase.from('leads').insert(lead);
      if (error) { console.error(`erro insert ${lead.phone}:`, error.message); errored++; }
      else inserted++;
    }
  }

  console.log(`\n=== Resultado ===`);
  console.log(`  ${inserted} inseridos`);
  console.log(`  ${updated} atualizados (ja existiam)`);
  console.log(`  ${errored} com erro`);
}

main().catch((e) => { console.error('FALHA:', e); process.exit(1); });
