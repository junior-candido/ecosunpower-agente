// Renovação do miolo — R23: Prédio Vivo e Cérebro dentro da casca (modo
// imersivo). Menu presente e aceso, sem rodapé, CSS só debaixo do contêiner
// (nada em html/body), 3D medindo o contêiner, tenant continua barrado.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CASOS_IMERSIVO } from './fixtures/casos-imersivo.js';

const cabeca = (h: string) => h.slice(0, h.indexOf('</head>'));
// O <style> da TELA (o da casca, com :root --marca, é da casca e fica de fora).
const estilosDaTela = (h: string) => (cabeca(h).match(/<style>[\s\S]*?<\/style>/g) ?? [])
  .filter((c) => /#(predio-vivo|cerebro)\b/.test(c)).join('\n');
const router = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');

describe('Prédio Vivo e Cérebro na casca', () => {
  for (const [nome, chave, raiz] of [['predio', 'predio', 'predio-vivo'], ['cerebro', 'cerebro', 'cerebro']] as const) {
    const h = CASOS_IMERSIVO[nome]();
    it(`${nome}: documento da casca, menu com o item aceso, modo imersivo e sem rodapé`, () => {
      expect(h).toMatch(/^<!doctype html>/i);
      expect(h).toContain('class="cc-sb');
      expect(h).toMatch(new RegExp(`<a href="/dashboard/${chave}" class="cc-on" aria-current="page">`));
      expect(h).toContain('cc-main cc-largo cc-imersivo');
      expect(h).not.toContain('class="cc-rodape"');
      expect(h).not.toContain('cdn.tailwindcss.com');
      expect(h).toContain(`<div id="${raiz}">`);
    });
    it(`${nome}: nenhum seletor html/body/:root no CSS da tela (fica sob #${raiz}) e o CSS está no <head>`, () => {
      const css = estilosDaTela(h);
      expect(css).toContain(`#${raiz}`);
      expect(css).not.toMatch(/(^|[\s,{}])(html|body|:root)\s*[,{]/);
      expect(h.slice(h.indexOf('<body'))).not.toContain('<style>');
    });
  }

  it('Prédio: o 3D mede o contêiner (ResizeObserver) e a mira é relativa ao canvas', () => {
    const h = CASOS_IMERSIVO.predio();
    expect(h).toContain('new ResizeObserver(redimensionar).observe(cont)');
    expect(h).toContain('getBoundingClientRect');
    expect(h).not.toMatch(/innerWidth|innerHeight/);
    expect(h).toContain("fetch('/dashboard/api/predio')");
  });
  it('Prédio (segurança): título de manutenção vindo do banco entra por textContent, nunca innerHTML', () => {
    const h = CASOS_IMERSIVO.predio();
    expect(h).not.toMatch(/innerHTML\s*=/);
    expect(h).toContain("String(m.titulo ?? '')");
  });
  it('Prédio: sai o "← voltar ao dashboard" (o menu está do lado); título sem emoji', () => {
    const h = CASOS_IMERSIVO.predio();
    expect(h).not.toContain('voltar ao dashboard');
    expect(h).toContain('<h1>Prédio Vivo</h1>');
  });
  it('Cérebro: #wrap em coluna dentro do contêiner (não mais fixo na janela), painéis por cima', () => {
    const h = CASOS_IMERSIVO.cerebro();
    const wrap = (estilosDaTela(h).match(/#wrap\s*\{[^}]*\}/) ?? [''])[0];
    expect(wrap).toMatch(/flex-direction:\s*column/);
    expect(wrap).not.toContain('position:fixed');
    for (const id of ['micBtn', 'voiceToggle', 'stageZone', 'askForm', 'cofreLock']) expect(h).toContain(`id="${id}"`);
    expect(h).toMatch(/SNAP\s*=/);
    expect(h).toMatch(/HOUSES\s*=/);
  });
  it('Cérebro: fala com </script> não fecha a tag do script', () => {
    const h = CASOS_IMERSIVO.cerebro();
    expect(h).not.toContain('</script><script>alert(1)');
  });
  it('tenant continua barrado: /predio só admin da casa, /cerebro sob soEcosunPorEnquanto', () => {
    const i = router.indexOf("router.get('/predio'");
    expect(router.slice(i, i + 200)).toContain('if (!ehAdminEcosun(req.dashUser)) { res.status(403)');
    expect(router).toContain("router.use('/cerebro', soEcosunPorEnquanto);");
    expect(router.indexOf("router.use('/cerebro', soEcosunPorEnquanto);")).toBeLessThan(router.indexOf("router.get('/cerebro'"));
  });
});
