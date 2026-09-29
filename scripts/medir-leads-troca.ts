// Mede a PISCADA do Atendimento (Leads › Conversas) em duas ações do dia a dia
// (Junior 28/09/2026: "quero perfeito"):
//   1) TROCAR DE CONTATO — clicar noutro nome da lista;
//   2) ENVIAR — escrever e mandar uma mensagem.
// Chrome headless (puppeteer) contra o servidor FALSO (tests/fixtures/
// atendimento-servidor-falso.ts): as mesmas telas do painel, dados fictícios,
// HTML em pedaços (rede), foto do chat com URL assinada nova a cada pedido.
// Grava cada quadro pintado (CDP screencast) e calcula:
//   documento_trocado — a página inteira foi trocada (navegação)?
//   quadros_passagem  — quadros diferentes do "antes" E do "depois" (estados intermediários)
//   clarao_%          — maior fatia da tela que ficou bem MAIS CLARA que antes e depois
//   coluna_vazia      — quadros com a coluna do chat lisa (sem nada desenhado)
//   pulo_cls          — Cumulative Layout Shift, contando até o que vem logo após o clique
//   lista_rolagem     — a lista da esquerda ficou onde estava?
//   fotos_baixadas    — fotos do chat baixadas de novo durante a ação
//   baloes_trocados   — balões tirados do chat (innerHTML inteiro = todos)
//   pronto_ms         — do clique até o último quadro que mudou
// Uso:  npx tsx scripts/medir-leads-troca.ts [pasta-de-saida]
//   SERVIDOR_MS (250) · PEDACO_MS (40) · N (60) · MSGS (40)
import puppeteer, { type Page } from 'puppeteer';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { AddressInfo } from 'net';
import { criarServidorFalso, uuidFalso } from '../tests/fixtures/atendimento-servidor-falso.js';

const SAIDA = process.argv[2] ?? join(tmpdir(), 'medicao-leads-troca');
const W = 1440, H = 900;

interface Quadro { t: number; png: Buffer }
interface Caixa { x: number; y: number; w: number; h: number }

async function cinza(png: Buffer): Promise<{ px: Uint8Array; w: number; h: number }> {
  const img = sharp(png).resize(W / 4, H / 4, { fit: 'fill' }).grayscale().raw();
  const { data, info } = await img.toBuffer({ resolveWithObject: true });
  return { px: new Uint8Array(data), w: info.width, h: info.height };
}
function dentro(i: number, w: number, c: Caixa | null): boolean {
  if (!c) return true;
  const x = (i % w) * 4, y = Math.floor(i / w) * 4;
  return x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h;
}
function difere(a: Uint8Array, b: Uint8Array, w: number, c: Caixa | null = null): number {
  let n = 0, tot = 0;
  for (let i = 0; i < a.length; i++) { if (!dentro(i, w, c)) continue; tot++; if (Math.abs(a[i] - b[i]) > 24) n++; }
  return tot ? n / tot : 0;
}
function maisClaro(q: Uint8Array, a: Uint8Array, b: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < q.length; i++) if (q[i] - a[i] > 40 && q[i] - b[i] > 40) n++;
  return n / q.length;
}
function desvio(q: Uint8Array, w: number, c: Caixa): number {
  let s = 0, s2 = 0, n = 0;
  for (let i = 0; i < q.length; i++) { if (!dentro(i, w, c)) continue; s += q[i]; s2 += q[i] * q[i]; n++; }
  const m = s / n; return Math.sqrt(Math.max(0, s2 / n - m * m));
}

async function gravar(page: Page, acao: () => Promise<void>, esperaMs: number): Promise<{ quadros: Quadro[]; t0: number }> {
  const cdp = await page.createCDPSession();
  const quadros: Quadro[] = [];
  cdp.on('Page.screencastFrame', (f: any) => {
    quadros.push({ t: Date.now(), png: Buffer.from(f.data, 'base64') });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await new Promise((ok) => setTimeout(ok, 300));
  const t0 = Date.now();
  await acao();
  await new Promise((ok) => setTimeout(ok, esperaMs));
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  return { quadros, t0 };
}

async function analisar(nome: string, quadros: Quadro[], t0: number, chat: Caixa, pasta: string) {
  mkdirSync(pasta, { recursive: true });
  quadros.forEach((q, i) => writeFileSync(join(pasta, `${String(i).padStart(3, '0')}-${q.t - t0}ms.png`), q.png));
  const g = await Promise.all(quadros.map((q) => cinza(q.png)));
  const w = g[0].w;
  const primeiro = g[0].px, ultimo = g[g.length - 1].px;
  let passagem = 0, clarao = 0, vazia = 0, prontoMs = 0;
  const vazioAntes = desvio(primeiro, w, chat) < 6, vazioDepois = desvio(ultimo, w, chat) < 6;
  for (let i = 1; i < g.length; i++) {
    const q = g[i].px;
    if (difere(q, g[i - 1].px, w) > 0.002) prontoMs = Math.max(0, quadros[i].t - t0);
    if (i < g.length - 1 && difere(q, primeiro, w) > 0.005 && difere(q, ultimo, w) > 0.005) passagem++;
    clarao = Math.max(clarao, maisClaro(q, primeiro, ultimo));
    if (!vazioAntes && !vazioDepois && desvio(q, w, chat) < 6) vazia++;
  }
  return { nome, quadros: quadros.length, passagem, clarao: +(clarao * 100).toFixed(2), vazia, prontoMs };
}

async function medirLayoutShift(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__ls = 0; (window as any).__marca = 'mesmo-documento';
    new PerformanceObserver((l) => { for (const e of l.getEntries() as any[]) (window as any).__ls += e.value; }).observe({ type: 'layout-shift' });
    const c = document.getElementById('cc-at-msgs');
    (window as any).__tirados = 0;
    if (c) new MutationObserver((ms) => { for (const m of ms) (window as any).__tirados += m.removedNodes.length; }).observe(c, { childList: true });
  });
}
async function lerDepois(page: Page): Promise<{ mesmo: boolean; ls: number; tirados: number }> {
  return page.evaluate(() => new Promise<{ mesmo: boolean; ls: number; tirados: number }>((ok) => {
    const w = window as any;
    if (w.__marca === 'mesmo-documento') { ok({ mesmo: true, ls: w.__ls, tirados: w.__tirados }); return; }
    let soma = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries() as any[]) soma += e.value; }).observe({ type: 'layout-shift', buffered: true });
    setTimeout(() => ok({ mesmo: false, ls: soma, tirados: -1 }), 100);
  }));
}
async function caixa(page: Page, sel: string): Promise<Caixa> {
  return page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
}

async function main(): Promise<void> {
  mkdirSync(SAIDA, { recursive: true });
  const { app, estado } = criarServidorFalso({
    n: Number(process.env.N ?? 60), msgs: Number(process.env.MSGS ?? 40),
    servidorMs: Number(process.env.SERVIDOR_MS ?? 250), pedacoMs: Number(process.env.PEDACO_MS ?? 40),
  });
  const srv = app.listen(0);
  await new Promise((ok) => srv.once('listening', ok));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const linhas = ['acao;documento_trocado;quadros;quadros_passagem;clarao_%;coluna_vazia;pulo_cls;lista_rolagem;fotos_baixadas;baloes_trocados;pronto_ms'];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H });
    // aquece o cache (CSS, fontes) — o Junior já está com o painel aberto
    await page.goto(`${base}/dashboard/leads/${uuidFalso(0)}`, { waitUntil: 'networkidle0' });
    await page.goto(`${base}/dashboard/leads/${uuidFalso(1)}`, { waitUntil: 'networkidle0' });
    await new Promise((ok) => setTimeout(ok, 500));

    // ---- 1) TROCAR DE CONTATO: rola a lista até o meio e clica no 20º ----
    for (const [rodada, alvo] of [[1, 20], [2, 21]] as const) {
      await page.$eval('.cc-at-itens', (e, id) => {
        const it = e.querySelector(`.cc-at-item[href^="/dashboard/leads/${id}"]`) as HTMLElement;
        e.scrollTop = it.offsetTop - e.offsetTop - 160;
      }, uuidFalso(alvo));
      const rolagemAntes = await page.$eval('.cc-at-itens', (e) => e.scrollTop);
      const chat = await caixa(page, '.cc-at-chat');
      await medirLayoutShift(page);
      const fotos0 = estado.pedidosFoto;
      const { quadros, t0 } = await gravar(page, async () => {
        await page.click(`.cc-at-item[href^="/dashboard/leads/${uuidFalso(alvo)}"]`);
      }, 1800);
      const d = await lerDepois(page);
      const rolagemDepois = await page.$eval('.cc-at-itens', (e) => e.scrollTop);
      const r = await analisar(`trocar-contato-${rodada}`, quadros, t0, chat, join(SAIDA, `trocar-contato-${rodada}`));
      linhas.push([r.nome, d.mesmo ? 'nao' : 'SIM', r.quadros, r.passagem, r.clarao, r.vazia, d.ls.toFixed(3),
        rolagemDepois === rolagemAntes ? 'mantida' : `perdida (${rolagemAntes}→${rolagemDepois})`, estado.pedidosFoto - fotos0, d.tirados < 0 ? 'tudo (pagina nova)' : d.tirados, r.prontoMs].join(';'));
      console.log(linhas[linhas.length - 1]);
      await new Promise((ok) => setTimeout(ok, 400));
    }

    // ---- 2) ENVIAR (2 vezes seguidas) ----
    for (const rodada of [1, 2]) {
      await page.waitForSelector('#cc-at-texto');
      await page.focus('#cc-at-texto');
      await page.keyboard.type(`Oi! Segue o orçamento atualizado (${rodada}).`);
      const chat = await caixa(page, '.cc-at-chat');
      await medirLayoutShift(page);
      const fotos0 = estado.pedidosFoto;
      const { quadros, t0 } = await gravar(page, async () => { await page.click('form[data-envio] button[type=submit]'); }, 1500);
      const d = await lerDepois(page);
      const r = await analisar(`enviar-${rodada}`, quadros, t0, chat, join(SAIDA, `enviar-${rodada}`));
      linhas.push([r.nome, d.mesmo ? 'nao' : 'SIM', r.quadros, r.passagem, r.clarao, r.vazia, d.ls.toFixed(3), '-', estado.pedidosFoto - fotos0, d.tirados, r.prontoMs].join(';'));
      console.log(linhas[linhas.length - 1]);
    }
    await page.screenshot({ path: join(SAIDA, 'final.png') });
  } finally {
    await browser.close();
    srv.close();
  }
  writeFileSync(join(SAIDA, 'troca.csv'), linhas.join('\n'));
  console.log(`\n${linhas[0]}\nQuadros e resultado em ${SAIDA}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
