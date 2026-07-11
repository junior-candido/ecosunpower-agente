/**
 * import-emails.ts
 *
 * Script ONE-OFF (roda uma vez, na mao) pra importar uma planilha historica
 * de e-mails de leads antigos, casando por telefone. Preenche APENAS
 * `leads.email` + `leads.email_origem = 'import'`.
 *
 * ⚠️  NAO matricula ninguem na sequencia de e-mail (nao chama
 * scheduleEmailSequence). Disparar e-mail pra milhares de leads de uma vez so
 * por causa da importacao destruiria a reputacao do dominio. A matricula da
 * base historica na sequencia e um passo controlado e SEPARADO, feito depois.
 *
 * Formato esperado do CSV (com linha de cabecalho, separado por virgula):
 *   telefone,email[,nome]
 *
 * Uso:
 *   npx tsx scripts/import-emails.ts scripts/data/emails-historico.csv
 */

import 'dotenv/config';
import fs from 'fs';
import { SupabaseService } from '../src/modules/supabase.js';
import { emailValido } from '../src/modules/email/email-util.js';

interface CsvRow {
  telefone: string;
  email: string;
  nome?: string;
}

function parseCsv(path: string): CsvRow[] {
  const text = fs.readFileSync(path, 'utf-8');
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim());
  const rows: CsvRow[] = [];
  // Pula o cabecalho (primeira linha)
  for (const line of lines.slice(1)) {
    const parts = line.split(',');
    const telefone = (parts[0] ?? '').trim();
    const email = (parts[1] ?? '').trim();
    const nome = (parts[2] ?? '').trim() || undefined;
    if (!telefone && !email) continue;
    rows.push({ telefone, email, nome });
  }
  return rows;
}

async function main() {
  console.log('=== Import de e-mails historicos (planilha) ===');
  console.log('Preenche leads.email + leads.email_origem="import" casando por telefone.');
  console.log('NAO matricula ninguem na sequencia de e-mail — isso e um passo separado, feito depois de forma controlada.\n');

  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Uso: npx tsx scripts/import-emails.ts <caminho-do-csv>');
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error(`Arquivo nao encontrado: ${csvPath}`);
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_KEY — rode onde tem as credenciais de producao.');
  }
  const supabase = new SupabaseService({ supabaseUrl: url, supabaseServiceKey: key });

  const rows = parseCsv(csvPath);
  console.log(`Total de linhas no CSV: ${rows.length}\n`);

  let ok = 0;
  let pulados = 0;

  for (const row of rows) {
    if (!row.telefone || !emailValido(row.email)) {
      pulados++;
      continue;
    }

    const lead = await supabase.getLeadByPhone(row.telefone);
    if (!lead) {
      pulados++;
      continue;
    }

    const salvo = await supabase.setLeadEmail(lead.id, row.email, 'import');
    if (salvo) ok++;
    else pulados++;
  }

  console.log(`\nImportados: ${ok}, pulados: ${pulados}`);
}

main().catch((e) => {
  console.error('FALHA:', e);
  process.exit(1);
});
