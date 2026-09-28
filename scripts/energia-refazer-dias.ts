// scripts/energia-refazer-dias.ts
//
// Refaz À MÃO o resumo diário (energia_diaria) de um medidor num intervalo de
// dias, a partir das janelas de 15 min que já estão no banco.
//
// Quase nunca é preciso: o fechamento da madrugada (00h de Brasília) já refaz
// sozinho os últimos 7 dias E todo dia cuja janela de 15 min mudou depois de o
// dia ser fechado (backfill colado no SQL Editor) — até 62 dias por noite.
// Use este script só pra um intervalo maior, ou pra não esperar a madrugada.
//
// Precisa de SUPABASE_URL e SUPABASE_SERVICE_KEY no .env (as mesmas do servidor).
//
// Uso (na pasta do projeto):
//   npx tsx scripts/energia-refazer-dias.ts --device 007007422d90 --refazer-de 2026-08-01 --refazer-ate 2026-09-27
// Opções:
//   --device        código do aparelho como está no cadastro (piloto: 007007422d90)
//   --refazer-de    1º dia (AAAA-MM-DD, dia de Brasília)
//   --refazer-ate   último dia (inclusive). Máximo 400 dias.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { EnergiaService, type MedidorRow } from '../src/modules/energia/energia-service.js';
import { criarEnergiaRepo, COLUNAS_MEDIDOR } from '../src/modules/energia/energia-repo.js';
import { normalizarDeviceId } from '../src/modules/energia/credenciais.js';

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const device = normalizarDeviceId(arg('device') ?? '');
  const de = arg('refazer-de');
  const ate = arg('refazer-ate');
  if (!device || !de || !ate) {
    console.error('Uso: npx tsx scripts/energia-refazer-dias.ts --device 007007422d90 --refazer-de 2026-08-01 --refazer-ate 2026-09-27');
    process.exit(1);
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_KEY no .env.');
    process.exit(1);
  }
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await client.from('medidores_energia').select(COLUNAS_MEDIDOR).eq('device_id', device).limit(1);
  if (error) throw new Error(error.message);
  const m = (data?.[0] ?? null) as unknown as MedidorRow | null;
  if (!m) {
    console.error(`Nenhum medidor cadastrado com o aparelho ${device}.`);
    process.exit(1);
  }
  const feitos = await new EnergiaService(criarEnergiaRepo(client)).refazerDias(m, de, ate);
  console.log(`Medidor ${m.id}: ${feitos} dia(s) refeito(s) de ${de} a ${ate} (dia sem janela de 15 min fica como está).`);
}

main().catch((e) => {
  console.error('Falhou:', (e as Error).message);
  process.exit(1);
});
