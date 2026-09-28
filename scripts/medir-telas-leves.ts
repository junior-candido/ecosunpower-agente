// Mede o PESO das telas renovadas do painel (perf/telas-leves, 28/09/2026):
// tamanho do HTML e tempo de render no Chrome headless (puppeteer), com dados
// FICTÍCIOS em volume de 10, 50 e 200 linhas. Também simula o que a automação
// do Chrome faz (mexer no DOM) e mede quanto a página trava com isso.
//
// Uso:  npx tsx scripts/medir-telas-leves.ts [pasta-de-saida]   (padrão: pasta temporária do sistema)
// Precisa de internet (Tailwind CDN e fontes, nas telas que ainda usam).
// Não toca em banco nem em segredo nenhum.
import express from 'express';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { AddressInfo } from 'net';
import { telasRenovadas } from '../tests/fixtures/telas-renovadas.js';

const SAIDA = process.argv[2] ?? join(tmpdir(), 'medicao-telas-leves');
// SO_FOTOS=1: só as capturas de tela (50 linhas, 1 rodada) — pra comparar o visual.
const SO_FOTOS = process.env.SO_FOTOS === '1';
const VOLUMES = SO_FOTOS ? [50] : [10, 50, 200];
const RODADAS = SO_FOTOS ? 1 : 3;

async function main(): Promise<void> {
  mkdirSync(SAIDA, { recursive: true });
  const paginas = new Map<string, string>();
  for (const n of VOLUMES) {
    for (const [nome, html] of Object.entries(telasRenovadas(n))) paginas.set(`${nome}-${n}`, html);
  }

  const app = express();
  // Arquivos estáticos do painel (CSS/logo), quando o módulo existir.
  try {
    const { servirEstatico } = await import('../src/modules/dashboard/ui/estatico.js');
    app.get('/dashboard/estatico/:arquivo', servirEstatico);
  } catch { /* versão antiga: tudo embutido no HTML */ }
  app.get('/p/:id', (req, res) => { res.type('text/html').send(paginas.get(req.params.id) ?? 'nada'); });
  const srv = app.listen(0);
  await new Promise((ok) => srv.once('listening', ok));
  const porta = (srv.address() as AddressInfo).port;

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const linhas: string[] = ['tela;linhas;html_kb;load_ms;cpu_ms;estilo_ms;layout_ms;script_ms;mutacao_ms;ocioso_cpu_ms_2s'];
  try {
    for (const [id, html] of paginas) {
      const [nome, n] = [id.slice(0, id.lastIndexOf('-')), id.slice(id.lastIndexOf('-') + 1)];
      const med: number[][] = [];
      for (let r = 0; r < RODADAS + 1; r++) {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        const m0 = await page.metrics();
        const t0 = Date.now();
        await page.goto(`http://127.0.0.1:${porta}/p/${id}`, { waitUntil: 'load' });
        await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 50)))));
        const loadMs = Date.now() - t0 - 50;
        const m1 = await page.metrics();
        // Simula a automação do Chrome: marca 300 elementos (atributo + classe),
        // um por vez, esperando o navegador reagir — como quem "lê" a página.
        const mutMs = await page.evaluate(async () => {
          const els = Array.from(document.querySelectorAll('body *')).slice(0, 300);
          const t = performance.now();
          for (const e of els) { e.setAttribute('data-auto-ref', 'x'); e.classList.add('auto-marca'); }
          await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 0))));
          void document.body.offsetHeight;
          return performance.now() - t;
        });
        // Custo parado (animações contínuas): CPU gasto em 2 s sem ninguém mexer.
        const o0 = await page.metrics();
        await new Promise((ok) => setTimeout(ok, 2000));
        const o1 = await page.metrics();
        if (r > 0) { // 1ª rodada só aquece o cache (CDN, fontes)
          med.push([
            loadMs,
            ((m1.TaskDuration ?? 0) - (m0.TaskDuration ?? 0)) * 1000,
            ((m1.RecalcStyleDuration ?? 0) - (m0.RecalcStyleDuration ?? 0)) * 1000,
            ((m1.LayoutDuration ?? 0) - (m0.LayoutDuration ?? 0)) * 1000,
            ((m1.ScriptDuration ?? 0) - (m0.ScriptDuration ?? 0)) * 1000,
            mutMs,
            ((o1.TaskDuration ?? 0) - (o0.TaskDuration ?? 0)) * 1000,
          ]);
        }
        if (r === RODADAS && Number(n) === 50) {
          await page.screenshot({ path: join(SAIDA, `${nome}.png`) as `${string}.png`, fullPage: false });
          await page.setViewport({ width: 390, height: 844 });
          await new Promise((ok) => setTimeout(ok, 800)); // gaveta do menu termina de fechar
          await page.screenshot({ path: join(SAIDA, `${nome}-celular.png`) as `${string}.png`, fullPage: false });
        }
        await page.close();
      }
      const mediana = (k: number) => { const v = med.map((x) => x[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
      linhas.push([nome, n, (Buffer.byteLength(html) / 1024).toFixed(1), ...[0, 1, 2, 3, 4, 5, 6].map((k) => mediana(k).toFixed(0))].join(';'));
      console.log(linhas[linhas.length - 1]);
    }
  } finally {
    await browser.close();
    srv.close();
  }
  writeFileSync(join(SAIDA, 'medicao.csv'), linhas.join('\n'));
  console.log(`\nResultado em ${join(SAIDA, 'medicao.csv')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
