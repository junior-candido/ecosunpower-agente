// Grava a SEQUÊNCIA DE PINTURA das telas de Leads (lista, Conversas, ficha do
// lead, Quadro) no Chrome headless — pra ver a "piscada" que o Junior reclamou
// (28/09/2026). Dados FICTÍCIOS (tests/fixtures), nada de banco nem segredo.
//
// Como a piscada aparece no mundo real: o HTML chega em pedaços pela internet
// e o Chrome pinta o que já chegou. Aqui o servidor manda a página em pedaços
// de 16 KB com uma pausa entre eles (simula a rede), e o Chrome grava cada
// quadro pintado (CDP screencast, PNGs na pasta de saída) e mede o quanto a
// tela PULOU até ficar pronta (Cumulative Layout Shift) — pulo alto = piscada.
//
// Uso:  npx tsx scripts/medir-leads-piscada.ts [pasta-de-saida]
//   PEDACO_MS (padrão 40) · PEDACO_KB (padrão 16) · N (itens, padrão 200)
import express from 'express';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { AddressInfo } from 'net';
import { telasRenovadas } from '../tests/fixtures/telas-renovadas.js';
import { servirEstatico } from '../src/modules/dashboard/ui/estatico.js';

const SAIDA = process.argv[2] ?? join(tmpdir(), 'medicao-leads-piscada');
const PEDACO_MS = Number(process.env.PEDACO_MS ?? 40);
const PEDACO = Number(process.env.PEDACO_KB ?? 16) * 1024;
const N = Number(process.env.N ?? 200);
const TELAS = ['leads', 'conversas', 'ficha', 'quadro-vendas'] as const;

async function main(): Promise<void> {
  mkdirSync(SAIDA, { recursive: true });
  const todas = telasRenovadas(N);
  const app = express();
  app.get('/dashboard/estatico/:arquivo', servirEstatico);
  app.get('/p/:id', async (req, res) => {
    const html = Buffer.from(todas[req.params.id] ?? 'nada', 'utf-8');
    res.type('text/html');
    for (let i = 0; i < html.length; i += PEDACO) {
      res.write(html.subarray(i, i + PEDACO));
      await new Promise((ok) => setTimeout(ok, PEDACO_MS));
    }
    res.end();
  });
  const srv = app.listen(0);
  await new Promise((ok) => srv.once('listening', ok));
  const porta = (srv.address() as AddressInfo).port;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const linhas = ['tela;html_kb;quadros_pintados;pulo_da_tela_cls'];
  try {
    for (const tela of TELAS) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      // aquece o cache (fontes, CSS) como na vida real: o Junior já abriu o painel antes
      await page.goto(`http://127.0.0.1:${porta}/p/${tela}`, { waitUntil: 'load' });
      await page.goto('about:blank');
      const cdp = await page.createCDPSession();
      const quadros: Array<{ t: number; png: string }> = [];
      cdp.on('Page.screencastFrame', (f: any) => {
        quadros.push({ t: Date.now(), png: f.data });
        cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
      });
      await cdp.send('Page.enable');
      await page.bringToFront();
      await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
      const t0 = Date.now();
      await page.goto(`http://127.0.0.1:${porta}/p/${tela}`, { waitUntil: 'load' });
      await new Promise((ok) => setTimeout(ok, 800));
      await cdp.send('Page.stopScreencast');
      // Quanto a tela PULOU enquanto carregava (Cumulative Layout Shift do Chrome):
      // 0 = nasceu no lugar; a grade montando depois do texto corrido dá número alto.
      const cls: number = await page.evaluate(() => new Promise<number>((ok) => {
        let soma = 0;
        new PerformanceObserver((l) => { for (const e of l.getEntries() as any[]) soma += e.value; }).observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => ok(soma), 100);
      }));
      const pasta = join(SAIDA, tela);
      mkdirSync(pasta, { recursive: true });
      quadros.forEach((q, i) => writeFileSync(join(pasta, `${String(i).padStart(3, '0')}-${q.t - t0}ms.png`), Buffer.from(q.png, 'base64')));
      linhas.push([tela, (Buffer.byteLength(todas[tela]) / 1024).toFixed(0), quadros.length, cls.toFixed(3)].join(';'));
      console.log(linhas[linhas.length - 1]);
      await page.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
  writeFileSync(join(SAIDA, 'piscada.csv'), linhas.join('\n'));
  console.log(`\nQuadros e resultado em ${SAIDA}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
