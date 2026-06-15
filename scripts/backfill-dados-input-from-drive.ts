// scripts/backfill-dados-input-from-drive.ts
// Resgata o `dados_input` das propostas antigas (geradas antes do fix de 15/06) a
// partir do JSON salvo no Google Drive (_internal/dados-<numero>.json). Sem isso o
// "Reabrir / Ajustar" falha com "sem dados pra reabrir". Não refaz proposta: só
// preenche o dado que faltou. A lógica fica em src/modules/proposal/resgatar-dados-input.ts
// (compartilhada com o comando de zap /resgatar-propostas).
//
// Uso:
//   npx tsx scripts/backfill-dados-input-from-drive.ts                   (dry-run — todas sem dados_input)
//   npx tsx scripts/backfill-dados-input-from-drive.ts --apply           (grava todas)
//   npx tsx scripts/backfill-dados-input-from-drive.ts --slug=ABC123...  (só uma — dry-run)
//   npx tsx scripts/backfill-dados-input-from-drive.ts --nome=Olavo --apply
import 'dotenv/config';
import { SupabaseService } from '../src/modules/supabase.js';
import { DriveUploader } from '../src/modules/proposal/drive-uploader.js';
import { resgatarDadosInput } from '../src/modules/proposal/resgatar-dados-input.js';

const apply = process.argv.includes('--apply');
const slug = process.argv.find((a) => a.startsWith('--slug='))?.split('=')[1] ?? null;
const nome = process.argv.find((a) => a.startsWith('--nome='))?.split('=')[1] ?? null;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
if (!url || !key) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_KEY no .env');
  process.exit(1);
}
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
if (!clientId || !clientSecret || !refreshToken) {
  console.error('Faltam GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN no .env');
  process.exit(1);
}

const supabase = new SupabaseService({ supabaseUrl: url, supabaseServiceKey: key });
const drive = new DriveUploader({ clientId, clientSecret, refreshToken });

async function main() {
  const res = await resgatarDadosInput({ supabase, drive, apply, slug, nome });
  console.log(`${res.candidatas} proposta(s) candidata(s) ${slug ? `(slug ${slug})` : nome ? `(nome ~${nome})` : 'sem dados_input'}. ${apply ? 'APLICANDO' : 'DRY-RUN'}\n`);
  for (const d of res.detalhes) console.log(`  - ${d}`);
  console.log(`\nResumo: ${res.resgatadas} ${apply ? 'gravadas' : 'resgatáveis'} · ${res.semJson} sem JSON no Drive · ${res.falhas} falhas`);
  if (!apply && res.resgatadas > 0) console.log('Rode de novo com --apply pra gravar.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
