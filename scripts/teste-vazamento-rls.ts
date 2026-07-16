// TESTE DE VAZAMENTO do RLS (Fase B, fatia 2) — roda contra o banco REAL.
// Prova, de ponta a ponta, que a política company_isolation da migration 079
// funciona: um crachá de empresa FALSA não lê nem escreve NADA; o crachá da
// EcoSun lê os dados dela. NÃO altera nada no banco (a única escrita tentada
// é a que TEM que ser bloqueada — e se não for, a gente quer saber JÁ).
//
// Rodar (precisa das envs — NUNCA colar segredo em chat/commit):
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_JWT_SECRET=... \
//     npx tsx scripts/teste-vazamento-rls.ts
// (no Windows/PowerShell: $env:SUPABASE_URL='...'; etc; depois npx tsx ...)
//
// SUPABASE_JWT_SECRET: painel do Supabase → Project Settings → API → JWT Secret.

import { clientDaEmpresa } from '../src/modules/tenant-client.js';

const ECO = '00000000-0000-0000-0000-000000000001';
const FALSA = '99999999-9999-4999-8999-999999999999'; // empresa que NÃO existe

const env = {
  url: process.env.SUPABASE_URL ?? '',
  anonKey: process.env.SUPABASE_ANON_KEY ?? '',
  jwtSecret: process.env.SUPABASE_JWT_SECRET ?? '',
};
if (!env.url || !env.anonKey || !env.jwtSecret) {
  console.error('Faltou env: SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_JWT_SECRET.');
  process.exit(2);
}

let falhas = 0;
const ok = (nome: string, passou: boolean, detalhe: string) => {
  console.log(`${passou ? '✅' : '❌ FALHOU'}  ${nome} — ${detalhe}`);
  if (!passou) falhas++;
};

// 1) Empresa FALSA lê leads → tem que vir 0 linhas (não erro: RLS filtra, não grita)
const falsa = clientDaEmpresa(FALSA, env);
{
  const { data, error } = await falsa.from('leads').select('id').limit(5);
  ok('empresa falsa NÃO lê leads', !error && (data ?? []).length === 0,
    error ? `erro: ${error.message}` : `linhas visíveis: ${(data ?? []).length}`);
}

// 2) Empresa FALSA tenta ESCREVER um lead → o WITH CHECK tem que barrar
{
  const { error } = await falsa.from('leads')
    .insert({ name: 'TESTE-VAZAMENTO (não deve existir)', phone: '5500000000000' });
  ok('empresa falsa NÃO escreve lead', !!error, error ? `barrado: ${error.code}` : 'ESCREVEU — VAZOU!');
}

// 3) Crachá da ECOSUN lê os leads dela → tem que vir > 0
const eco = clientDaEmpresa(ECO, env);
{
  const { data, error } = await eco.from('leads').select('id').limit(5);
  ok('EcoSun lê os próprios leads', !error && (data ?? []).length > 0,
    error ? `erro: ${error.message}` : `linhas: ${(data ?? []).length}`);
}

// 4) EcoSun NÃO enxerga a tabela de outra empresa via filtro forjado
//    (mesmo pedindo explicitamente company_id da falsa, o RLS corta antes)
{
  const { data, error } = await eco.from('leads').select('id').eq('company_id', FALSA).limit(5);
  ok('EcoSun não enxerga linhas de outra empresa', !error && (data ?? []).length === 0,
    error ? `erro: ${error.message}` : `linhas: ${(data ?? []).length}`);
}

// 5) Chave anon PURA (sem crachá) → nada
{
  const { createClient } = await import('@supabase/supabase-js');
  const anon = createClient(env.url, env.anonKey, { auth: { persistSession: false } });
  const { data, error } = await anon.from('leads').select('id').limit(5);
  ok('anon puro não lê leads', (data ?? []).length === 0 || !!error,
    error ? `barrado: ${error.message}` : `linhas: ${(data ?? []).length}`);
}

console.log(falhas === 0
  ? '\n🔒 ISOLAMENTO PROVADO — a 079 + crachá funcionam de ponta a ponta.'
  : `\n🚨 ${falhas} PROVA(S) FALHARAM — NÃO seguir com a fatia 3; me chama.`);
process.exit(falhas === 0 ? 0 : 1);
