// TESTE DE VAZAMENTO do RLS — variante CI (Fase B, fatia 5).
// Roda contra o banco LOCAL do `supabase start` (efêmero, zerado a cada run do
// GitHub Actions). Diferente do scripts/teste-vazamento-rls.ts (que é read-only
// contra o banco REAL), este script SEMEIA duas empresas fake + um lead pra cada
// uma e prova, de ponta a ponta, que a política company_isolation (migration
// 079) isola: o crachá da empresa A nunca lê nem escreve o dado da empresa B.
//
// Vermelho aqui = PR não junta (gate antes do "Juntar automaticamente" no
// ci.yml). É barreira de verdade, não decoração.
//
// TRAVA DE SEGURANÇA: este script faz INSERT/UPDATE de teste — só pode rodar
// contra localhost/127.0.0.1. Se SUPABASE_URL apontar pra qualquer outra coisa
// (produção, staging), ele recusa e sai com código 2 ANTES de tocar em nada.

import { clientDaEmpresa } from '../src/modules/tenant-client.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const env = {
  url: process.env.SUPABASE_URL ?? '',
  anonKey: process.env.SUPABASE_ANON_KEY ?? '',
  jwtSecret: process.env.SUPABASE_JWT_SECRET ?? '',
};

if (!env.url || !env.anonKey || !env.jwtSecret) {
  console.error('Faltou env: SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_JWT_SECRET.');
  process.exit(2);
}

// SÓ LOCAL — nunca contra um projeto real (este script semeia e escreve dados).
if (!/(127\.0\.0\.1|localhost)/i.test(env.url)) {
  console.error(
    `RECUSO rodar: SUPABASE_URL="${env.url}" não parece local (127.0.0.1/localhost).\n` +
      'Este script semeia empresas fake e tenta escritas — só é seguro contra o ' +
      'banco efêmero do `supabase start` no CI. Se você quer testar o banco REAL ' +
      '(read-only), use scripts/teste-vazamento-rls.ts.'
  );
  process.exit(2);
}

let falhas = 0;
const ok = (nome: string, passou: boolean, detalhe: string) => {
  console.log(`${passou ? '✅' : '❌ FALHOU'}  ${nome} — ${detalhe}`);
  if (!passou) falhas++;
};

// SEMEADURA: feita pelo passo psql do ci.yml (direto no Postgres local, sem
// depender do formato da chave service_role do CLI — que mudou de JWT pra
// sb_secret e o PostgREST passou a tratar como anon: foi o vermelho do run 3).

const crachaA = clientDaEmpresa(A, { url: env.url, anonKey: env.anonKey, jwtSecret: env.jwtSecret });
const crachaB = clientDaEmpresa(B, { url: env.url, anonKey: env.anonKey, jwtSecret: env.jwtSecret });

// 1) Crachá A lê leads → EXATAMENTE 1, e é o dela.
{
  const { data, error } = await crachaA.from('leads').select('id, name');
  const linhas = data ?? [];
  ok(
    'Crachá A vê SÓ o lead da A',
    !error && linhas.length === 1 && linhas[0]?.name === 'Lead da A',
    error ? `erro: ${error.message}` : `linhas: ${linhas.length} (${linhas.map((l) => l.name).join(', ')})`
  );
}

// 2) Crachá B lê leads → EXATAMENTE 1, e é o dela.
{
  const { data, error } = await crachaB.from('leads').select('id, name');
  const linhas = data ?? [];
  ok(
    'Crachá B vê SÓ o lead da B',
    !error && linhas.length === 1 && linhas[0]?.name === 'Lead da B',
    error ? `erro: ${error.message}` : `linhas: ${linhas.length} (${linhas.map((l) => l.name).join(', ')})`
  );
}

// id do lead da B, visto pela própria B (pro teste de UPDATE cruzado abaixo)
let leadIdB = '';
{
  const { data } = await crachaB.from('leads').select('id').eq('name', 'Lead da B').limit(1);
  leadIdB = data?.[0]?.id ?? '';
  if (!leadIdB) { console.error('Não achei o lead da B via crachá B — semeadura do psql rodou?'); process.exit(1); }
}

// 3) Crachá A tenta INSERT um lead FORJANDO company_id=B → o WITH CHECK barra.
{
  const { error } = await crachaA
    .from('leads')
    .insert({ name: 'TESTE-VAZAMENTO (não deve existir)', phone: '+5561900000099', company_id: B });
  ok(
    'Crachá A NÃO consegue plantar lead na B',
    !!error,
    error ? `barrado: ${error.code ?? '?'} — ${error.message}` : 'ESCREVEU NA EMPRESA B — VAZOU!'
  );
}

// 4) Crachá A tenta UPDATE no lead da B (por id) → 0 linhas OU erro; NUNCA sucesso.
{
  const { data, error } = await crachaA
    .from('leads')
    .update({ name: 'SEQUESTRADO PELA A' })
    .eq('id', leadIdB)
    .select('id');
  const linhasAfetadas = data?.length ?? 0;
  ok(
    'Crachá A NÃO consegue alterar o lead da B',
    !!error || linhasAfetadas === 0,
    error ? `barrado: ${error.code ?? '?'} — ${error.message}` : `linhas afetadas: ${linhasAfetadas}`
  );
}

// 5) Controle (contagem crua) roda no passo psql do ci.yml — se a semeadura
//    não tiver 2 leads, o próprio psql falha com ON_ERROR_STOP antes daqui.

// ————————————————————————————————————————————————————————————————————————
// CAMINHO DA EVA (fatias 3a-3e + checklist docs/ecosof/06-eva-rls.md):
// as escritas da mensagem (dossiê, eventos do Elo) sob o crachá do tenant.
// Fecha o "gap conhecido" do 06: antes só `leads` genérico era provado.
// ————————————————————————————————————————————————————————————————————————

// id do lead da A (pro dossiê com FK)
let leadIdA = '';
{
  const { data } = await crachaA.from('leads').select('id').eq('name', 'Lead da A').limit(1);
  leadIdA = data?.[0]?.id ?? '';
  if (!leadIdA) { console.error('Não achei o lead da A via crachá A — semeadura do psql rodou?'); process.exit(1); }
}

// 6) Dossiê SEM carimbo sob crachá A → o DEFAULT da coluna (EcoSun) bate no
//    WITH CHECK da 079 e o INSERT é REJEITADO (fail-closed — é por isso que a
//    fatia 3e carimba company_id em toda escrita do caminho da mensagem).
{
  const { error } = await crachaA
    .from('dossiers')
    .insert({ lead_id: leadIdA, formatted_text: 'TESTE-VAZAMENTO sem carimbo' });
  ok(
    'Dossiê SEM carimbo sob crachá A é rejeitado (default EcoSun ≠ tenant)',
    !!error,
    error ? `barrado: ${error.code ?? '?'} — ${error.message}` : 'ACEITOU SEM CARIMBO — escrita silenciosa fora do tenant!'
  );
}

// 7) Dossiê COM carimbo da A sob crachá A → aceito…
let dossierIdA = '';
{
  const { data, error } = await crachaA
    .from('dossiers')
    .insert({ lead_id: leadIdA, formatted_text: 'Dossiê da A (teste CI)', company_id: A })
    .select('id')
    .single();
  dossierIdA = data?.id ?? '';
  ok(
    'Dossiê COM carimbo da A entra normal',
    !error && !!dossierIdA,
    error ? `erro: ${error.message}` : `id: ${dossierIdA}`
  );
}

// 8) …e o crachá B não enxerga o dossiê da A.
{
  const { data, error } = await crachaB.from('dossiers').select('id');
  const linhas = data?.length ?? 0;
  ok(
    'Crachá B NÃO vê o dossiê da A',
    !error && linhas === 0,
    error ? `erro: ${error.message}` : `linhas: ${linhas}`
  );
}

// 9) Evento do Elo SEM carimbo sob crachá A → rejeitado. (No app o erro é
//    ENGOLIDO de propósito pelo registrarEvento — o evento sumiria em silêncio;
//    aqui provamos que a 3e carimbar é o que salva o evento do tenant.)
{
  const { error } = await crachaA
    .from('eventos_elo')
    .insert({ tipo: 'teste_vazamento_ci', lead_id: leadIdA, payload: {} });
  ok(
    'Evento do Elo SEM carimbo sob crachá A é rejeitado',
    !!error,
    error ? `barrado: ${error.code ?? '?'} — ${error.message}` : 'ACEITOU SEM CARIMBO — evento vazaria pra EcoSun!'
  );
}

// 10) Evento COM carimbo da A → aceito; crachá B lê 0.
{
  const { error } = await crachaA
    .from('eventos_elo')
    .insert({ tipo: 'teste_vazamento_ci', lead_id: leadIdA, payload: {}, company_id: A });
  const { data: doB, error: errB } = await crachaB
    .from('eventos_elo')
    .select('id')
    .eq('tipo', 'teste_vazamento_ci');
  const linhasB = doB?.length ?? 0;
  ok(
    'Evento COM carimbo da A entra e o crachá B não lê',
    !error && !errB && linhasB === 0,
    error ? `insert falhou: ${error.message}` : errB ? `leitura B falhou: ${errB.message}` : `B leu: ${linhasB}`
  );
}

console.log(
  falhas === 0
    ? '\n🔒 ISOLAMENTO PROVADO NO CI — leads + caminho da Eva (dossiê/eventos), zero vazamento.'
    : `\n🚨 ${falhas} PROVA(S) FALHARAM NO CI — vazamento de dado entre empresas. Build vermelho.`
);
process.exit(falhas === 0 ? 0 : 1);
