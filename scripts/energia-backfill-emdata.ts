// scripts/energia-backfill-emdata.ts
//
// BACKFILL LOCAL do medidor Shelly Pro 3EM — lê a memória do próprio aparelho
// (~60 dias a 1 min) e GERA UM ARQUIVO .sql para o Junior revisar e colar no
// SQL Editor. NÃO fala com o banco e NÃO roda sozinho: é pra quando o script
// do aparelho ficou parado e deixou buraco (o .sql só preenche janela que não
// existe — "on conflict do nothing").
//
// Precisa estar NA MESMA REDE do aparelho (é um GET no IP local dele).
//
// Uso (PowerShell ou Git Bash, na pasta do projeto):
//   npx tsx scripts/energia-backfill-emdata.ts --ip 192.168.1.6 --de 2026-09-07 --ate 2026-09-28
// Opções:
//   --ip        IP do aparelho na rede local (piloto: 192.168.1.6)
//   --de/--ate  dias de Brasília (inclusive). Padrão: últimos 7 dias
//   --fase      a | b | c  (piloto: c)
//   --device    código do aparelho como está no cadastro (piloto: 007007422d90)
//   --empresa   company_id (padrão: EcoSun)
//   --tensao    127 | 220 | 380 (padrão 220)
//   --saida     arquivo .sql (padrão: backfill-<device>-<de>-<ate>.sql na pasta atual)
//
// Depois: abrir o .sql, conferir as primeiras linhas, colar no SQL Editor do
// Supabase e rodar — SÓ DEPOIS do Implantar (o servidor novo é que sabe que
// janela de backfill não conta como "já agregado"). O resumo do DIA
// (energia_diaria) é refeito sozinho na madrugada seguinte (00h de Brasília):
// ela refaz todo dia cuja janela de 15 min mudou depois de o dia ser fechado
// (até 62 dias por noite). Pra não esperar, ou pra mais de 62 dias:
//   npx tsx scripts/energia-refazer-dias.ts --device <código> --refazer-de <dia> --refazer-ate <dia>

import { writeFileSync } from 'node:fs';
import { parseEmdataCsv, janelasDoEmdata, sqlBackfill } from '../src/modules/energia/backfill-emdata.js';
import { inicioDoDiaBrtIso, somarDias, diaBrt } from '../src/modules/energia/tempo.js';

function arg(nome: string, padrao?: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : padrao;
}

async function main(): Promise<void> {
  const ip = arg('ip');
  if (!ip || !/^[0-9.]+$/.test(ip)) {
    console.error('Informe o IP local do aparelho: --ip 192.168.1.6');
    process.exit(1);
  }
  const hoje = diaBrt(new Date());
  const de = arg('de', somarDias(hoje, -7))!;
  const ate = arg('ate', hoje)!;
  const fase = (arg('fase', 'c') as 'a' | 'b' | 'c');
  const device = arg('device', '007007422d90')!;
  const empresa = arg('empresa', '00000000-0000-0000-0000-000000000001')!;
  const tensao = Number(arg('tensao', '220')) as 127 | 220 | 380;
  const saida = arg('saida', `backfill-${device}-${de}-${ate}.sql`)!;

  const ts = Math.floor(Date.parse(inicioDoDiaBrtIso(de)) / 1000);
  const endTs = Math.floor(Date.parse(inicioDoDiaBrtIso(somarDias(ate, 1))) / 1000) - 1;
  const url = `http://${ip}/emdata/0/data.csv?add_keys=true&ts=${ts}&end_ts=${endTs}`;
  console.log(`Lendo ${url} ...`);
  const r = await fetch(url);
  if (!r.ok) {
    console.error(`O aparelho respondeu ${r.status}. Está na mesma rede? O IP está certo?`);
    process.exit(1);
  }
  const regs = parseEmdataCsv(await r.text());
  const js = janelasDoEmdata(regs, fase, { tensaoNominal: tensao });
  writeFileSync(saida, sqlBackfill(js, { companyId: empresa, deviceId: device, canal: { a: 0, b: 1, c: 2 }[fase] }), 'utf8');
  const cobertas = js.filter((j) => j.segundosCobertos > 0).length;
  const possiveis = Math.round((endTs + 1 - ts) / 900);
  console.log(`${regs.length} registros de 1 min → ${cobertas} janelas de 15 min (de ${possiveis} possíveis). Arquivo: ${saida}`);
  console.log('Revise o arquivo e cole no SQL Editor. Nada foi gravado no banco. O resumo de cada dia é refeito sozinho na madrugada seguinte.');
}

main().catch((e) => {
  console.error('Falhou:', (e as Error).message);
  process.exit(1);
});
