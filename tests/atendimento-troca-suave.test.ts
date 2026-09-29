// Troca suave (Junior 28/09: "ao clicar noutro contato a tela pisca"). Teste no
// Chrome DE VERDADE (puppeteer do projeto) contra o servidor falso com as telas
// reais do painel: trocar de contato NÃO troca o documento — só as colunas do
// chat e do resumo; a lista fica (rolagem, destaque), o endereço/título mudam,
// voltar/avançar funcionam, um relógio só, e qualquer erro vira navegação normal.
// Sem Chrome instalado (máquina sem o download do puppeteer) o bloco é pulado.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'fs';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { criarServidorFalso, uuidFalso } from './fixtures/atendimento-servidor-falso.js';

const temChrome = (() => { try { return existsSync(puppeteer.executablePath()); } catch { return false; } })();
const FALHA = uuidFalso(13);

describe.skipIf(!temChrome)('troca de contato sem recarregar (Chrome)', { timeout: 30_000 }, () => {
  let browser: Browser, srv: Server, base = '', page: Page;
  const f = criarServidorFalso({ n: 30, msgs: 12, servidorMs: 20, pedacoMs: 0, fotoMs: 5, envioMs: 20, falhar: (id) => id === FALHA });

  beforeAll(async () => {
    srv = f.app.listen(0);
    await new Promise((ok) => srv.once('listening', ok));
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    // conta os relógios de 8 s (atualização da conversa) — tem que haver UM só
    await page.evaluateOnNewDocument(() => {
      const w = window as any; w.__relogios = 0; const orig = window.setInterval.bind(window);
      (window as any).setInterval = (fn: any, ms?: number, ...r: any[]) => { if (ms === 8000) w.__relogios++; return orig(fn, ms, ...r); };
    });
    await page.goto(`${base}/dashboard/leads/${uuidFalso(0)}`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => { (window as any).__marca = 'mesmo-documento'; });
  }, 60_000);
  afterAll(async () => { srv?.closeAllConnections(); srv?.close(); await browser?.close(); }, 60_000);

  const marca = () => page.evaluate(() => (window as any).__marca ?? null);
  const nome = () => page.$eval('.cc-at-chat .cc-at-chat-nome strong', (e) => e.textContent);
  async function clicar(i: number) {
    await page.$eval('.cc-at-itens', (e, id) => {
      const it = e.querySelector(`.cc-at-item[href^="/dashboard/leads/${id}"]`) as HTMLElement;
      e.scrollTop = it.offsetTop - e.offsetTop - 100;
    }, uuidFalso(i));
    await page.click(`.cc-at-item[href^="/dashboard/leads/${uuidFalso(i)}"]`);
    await page.waitForFunction((n) => document.querySelector('.cc-at-chat .cc-at-chat-nome strong')?.textContent === n, {}, `Lead Fictício ${i}`);
  }

  it('clicar noutro contato: mesmo documento, só o miolo buscado, lista parada, endereço/título/foco/rolagem certos', async () => {
    const paginas = f.estado.pedidosPagina;
    await page.$eval('.cc-at-itens', (e) => { e.scrollTop = 0; });
    await clicar(9);
    const rolagem = await page.$eval('.cc-at-itens', (e) => e.scrollTop);
    await clicar(10);
    expect(await marca()).toBe('mesmo-documento');
    expect(f.estado.pedidosPagina).toBe(paginas);
    expect(f.estado.pedidosMiolo).toBeGreaterThanOrEqual(2);
    expect(page.url()).toBe(`${base}/dashboard/leads/${uuidFalso(10)}`);
    expect(await page.title()).toMatch(/^Conversa: Lead Fictício 10 · /);
    expect(await page.$eval('.cc-at-itens', (e) => e.scrollTop)).toBeGreaterThan(0);
    expect(Math.abs((await page.$eval('.cc-at-itens', (e) => e.scrollTop)) - rolagem)).toBeLessThan(200);
    const ativos = await page.$$eval('.cc-at-item.cc-on', (as) => as.map((a) => a.getAttribute('href')));
    expect(ativos).toEqual([`/dashboard/leads/${uuidFalso(10)}`]);
    expect(await page.evaluate(() => document.activeElement?.classList.contains('cc-at-chat-topo'))).toBe(true);
    expect(await page.$eval('#cc-at-msgs', (c) => c.scrollHeight - c.scrollTop - c.clientHeight)).toBeLessThan(4);
    expect(await page.$eval('.cc-at-cockpit h2', (e) => e.textContent)).toBe('Lead Fictício 10');
    expect(await page.$$eval('.cc-at-chat', (x) => x.length)).toBe(1);
    expect(await page.$$eval('.cc-at-cockpit', (x) => x.length)).toBe(1);
    expect(await page.$$eval('#modal-fechou', (x) => x.length)).toBe(1);
    expect(await page.evaluate(() => (window as any).__relogios)).toBe(1);
  });

  it('voltar e avançar do navegador trocam o contato sem recarregar', async () => {
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('.cc-at-chat .cc-at-chat-nome strong')?.textContent === 'Lead Fictício 9');
    expect(await marca()).toBe('mesmo-documento');
    await page.goForward();
    await page.waitForFunction(() => document.querySelector('.cc-at-chat .cc-at-chat-nome strong')?.textContent === 'Lead Fictício 10');
    expect(await marca()).toBe('mesmo-documento');
    expect(await page.$$eval('.cc-at-item.cc-on', (as) => as.length)).toBe(1);
  });

  it('cliques rápidos: vale o ÚLTIMO (o pedido anterior é cancelado)', async () => {
    await page.evaluate((a, b) => {
      (document.querySelector(`.cc-at-item[href^="/dashboard/leads/${a}"]`) as HTMLElement).click();
      (document.querySelector(`.cc-at-item[href^="/dashboard/leads/${b}"]`) as HTMLElement).click();
    }, uuidFalso(3), uuidFalso(4));
    await page.waitForFunction(() => document.querySelector('.cc-at-chat .cc-at-chat-nome strong')?.textContent === 'Lead Fictício 4');
    await new Promise((ok) => setTimeout(ok, 150));
    expect(await nome()).toBe('Lead Fictício 4');
    expect(page.url()).toContain(uuidFalso(4));
  });

  it('Ctrl+clique / botão do meio: comportamento normal (não intercepta)', async () => {
    const barrado = await page.evaluate((id) => {
      const a = document.querySelector(`.cc-at-item[href^="/dashboard/leads/${id}"]`) as HTMLElement;
      let prevenido = false;
      const olhar = (e: Event) => { prevenido = e.defaultPrevented; e.preventDefault(); };
      window.addEventListener('click', olhar, { once: true });
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
      return prevenido;
    }, uuidFalso(5));
    expect(barrado).toBe(false);
    expect(await nome()).toBe('Lead Fictício 4');
  });

  it('enviar depois de trocar: vai para o contato NOVO e o balão entra sem refazer o chat', async () => {
    await clicar(6);
    const primeiro = await page.$eval('#cc-at-msgs', (c) => { (c.firstElementChild as any).__velho = true; return c.children.length; });
    await page.type('#cc-at-texto', 'Olá, Lead 6!');
    await page.click('form[data-envio] button[type=submit]');
    await page.waitForFunction(() => [...document.querySelectorAll('#cc-at-msgs .cc-at-msg')].some((m) => !m.classList.contains('cc-at-msg-otimista') && m.textContent?.includes('Olá, Lead 6!')));
    expect(f.estado.envios.at(-1)).toBe('Olá, Lead 6!');
    expect(f.estado.mensagens.get(uuidFalso(6))!.at(-1)!.content).toBe('Olá, Lead 6!');
    expect(await page.$eval('#cc-at-msgs', (c) => (c.firstElementChild as any).__velho === true)).toBe(true);
    expect(await page.$eval('#cc-at-msgs', (c) => c.children.length)).toBeGreaterThan(primeiro);
    expect(await marca()).toBe('mesmo-documento');
  });

  it('deu erro (500): navegação normal para o endereço clicado', async () => {
    await page.$eval('.cc-at-itens', (e, id) => {
      const it = e.querySelector(`.cc-at-item[href^="/dashboard/leads/${id}"]`) as HTMLElement;
      e.scrollTop = it.offsetTop - e.offsetTop - 100;
    }, FALHA);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.click(`.cc-at-item[href^="/dashboard/leads/${FALHA}"]`),
    ]);
    expect(page.url()).toBe(`${base}/dashboard/leads/${FALHA}`);
    expect(await marca()).toBeNull();
  });
});
