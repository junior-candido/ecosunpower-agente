// Smoke REAL do leitor por IA (gasta centavos da API da Anthropic). Não roda nos testes.
//
// Uso (na máquina que tem a chave; NUNCA commitar imagem de cliente):
//   ANTHROPIC_API_KEY=... npx tsx scripts/smoke-leitor-ia.ts <imagem.png|jpg> [--caso thiago] [--modelos claude-haiku-4-5-20251001,claude-sonnet-5]
//
// Faz o que o programa faz: página inteira + 4 pedaços ampliados (sharp), pede os campos, e mostra
// por modelo: o que leu, se bateu com o esperado, tokens e custo aproximado em R$.
// Caso "thiago" = conta Light escaneada (Downloads\Thiago.pdf → extraia a imagem antes, ex.: PyMuPDF).

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { lerConta } from '../src/modules/leitor-ia/leitor.js';
import { custoCentsBRL } from '../src/modules/custos/ia-metering.js';
import type { ImagemIa, PedidoConta } from '../src/modules/leitor-ia/contrato.js';

const CASOS: Record<string, { campos: PedidoConta['campos']; esperado: Record<string, number>; contexto: PedidoConta['contexto'] }> = {
  thiago: {
    contexto: { distribuidora: 'Light', referencia: '2026-08' },
    campos: [
      ...(['consumo', 'injetado'] as const).flatMap((m) => ([
        ['anterior', 'Leitura anterior do medidor', 'coluna "Leitura Anterior"'],
        ['atual', 'Leitura atual do medidor', 'coluna "Leitura Atual"'],
        ['constante', 'Constante do medidor', 'coluna "Const Medidor"'],
        ['kwh', 'Consumo do medidor em kWh', 'coluna "Consumo kWh"'],
      ] as const).map(([k, rot, col]) => ({
        id: `${m}:${k}`,
        rotulo: `${rot} (${m})`,
        dica: m === 'consumo'
          ? `Tabela do medidor (Medidor / Grandezas / Leitura Anterior / Leitura Atual / Const Medidor / Consumo kWh), linha "Energia kWh" (energia que veio da rede), ${col}.`
          : `Tabela do medidor, linha "Energia Injetada" (energia enviada à rede), ${col}.`,
      }))),
      { id: 'historico:kwh', rotulo: 'Consumo do mês no histórico (kWh)', dica: 'Quadro "CONSUMO / kWh" (histórico), linha do mês da conta (AGO/26), coluna "CONSUMO FATURADO".' },
      { id: 'historico:dias', rotulo: 'Dias do mês no histórico', dica: 'Quadro "CONSUMO / kWh" (histórico), linha do mês da conta (AGO/26), coluna "Nº DIAS FAT".' },
    ],
    esperado: {
      'consumo:anterior': 937, 'consumo:atual': 1387, 'consumo:constante': 1, 'consumo:kwh': 450,
      'injetado:anterior': 989, 'injetado:atual': 1580, 'injetado:constante': 1, 'injetado:kwh': 591,
      'historico:kwh': 43, 'historico:dias': 30,
    },
  },
};

const LADO = 1568;

export async function imagensComoOPrograma(arquivo: string): Promise<ImagemIa[]> {
  const img = sharp(readFileSync(arquivo));
  const { width = 0, height = 0 } = await img.metadata();
  const jpg = async (s: sharp.Sharp, papel: ImagemIa['papel']): Promise<ImagemIa> => ({ mime: 'image/jpeg', base64: (await s.jpeg({ quality: 90 }).toBuffer()).toString('base64'), papel });
  const escala = (w: number, h: number, ampliar: boolean) => Math.min(ampliar ? 2 : 1, LADO / Math.max(w, h));
  const out: ImagemIa[] = [];
  const e0 = escala(width, height, false);
  out.push(await jpg(sharp(readFileSync(arquivo)).resize(Math.round(width * e0), Math.round(height * e0)), 'pagina'));
  const mx = Math.round(width / 2); const my = Math.round(height / 2);
  const sx = Math.round(width * 0.08); const sy = Math.round(height * 0.08);
  for (const [y0, y1] of [[0, my + sy], [my - sy, height]]) {
    for (const [x0, x1] of [[0, mx + sx], [mx - sx, width]]) {
      const w = x1 - x0; const h = y1 - y0; const e = escala(w, h, true);
      out.push(await jpg(sharp(readFileSync(arquivo)).extract({ left: x0, top: y0, width: w, height: h }).resize(Math.round(w * e), Math.round(h * e)), 'recorte'));
    }
  }
  return out;
}

async function main() {
  const [arquivo, ...resto] = process.argv.slice(2);
  if (!arquivo) throw new Error('Passe o caminho da imagem da conta.');
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Sem ANTHROPIC_API_KEY no ambiente — nada foi chamado.');
  const arg = (n: string) => { const i = resto.indexOf(n); return i >= 0 ? resto[i + 1] : undefined; };
  const caso = CASOS[arg('--caso') ?? 'thiago'];
  const modelos = (arg('--modelos') ?? 'claude-haiku-4-5-20251001,claude-sonnet-5').split(',');
  const imagens = await imagensComoOPrograma(arquivo);
  const cliente = new Anthropic();
  for (const modelo of modelos) {
    const t0 = Date.now();
    const p: PedidoConta = { licenca: null, computador: 'SMOKE', versao: 'smoke', nivel: 1, imagens, campos: caso.campos, contexto: caso.contexto };
    try {
      const r = await lerConta(cliente, modelo, p);
      const erros = Object.entries(caso.esperado).filter(([k, v]) => r.valores[k] !== v);
      console.log(`\n== ${modelo} — ${Date.now() - t0} ms — ${r.uso.input_tokens} tokens entrada / ${r.uso.output_tokens} saída — R$ ${(custoCentsBRL(modelo, r.uso) / 100).toFixed(3)}`);
      console.log(JSON.stringify(r.valores));
      console.log(erros.length ? `ERROU ${erros.length}: ${erros.map(([k, v]) => `${k}=${r.valores[k]} (certo ${v})`).join(', ')}` : 'ACERTOU TUDO');
    } catch (e) {
      console.log(`\n== ${modelo}: FALHOU — ${(e as Error).message}`);
    }
  }
}

if (process.argv[1]?.includes("smoke-leitor-ia")) main().catch((e) => { console.error(e.message); process.exit(1); });
