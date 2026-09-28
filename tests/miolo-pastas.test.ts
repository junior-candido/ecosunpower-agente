// Renovação do miolo — R12: Pasta do Cliente (lista, editor, prévia) no padrão
// cc-, tema escuro (D4), sem Tailwind. Contrato em miolo-pastas-contrato.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { linhasComTailwind } from './helpers/teto-tailwind.js';
import { CASOS_PASTAS as C } from './fixtures/casos-pastas.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
const ouros = (m: string) => (m.match(/cc-btn-gold/g) ?? []).length;

describe('Pasta do Cliente — lista', () => {
  const m = miolo(C.lista());
  it('cabeçalho Clientes › Pasta do Cliente, título sem emoji, Abrir pasta dourado único', () => {
    expect(m).toContain('cc-crumb');
    expect(m).toContain('<h1>Pasta do Cliente</h1>');
    expect(ouros(m)).toBe(1);
    expect(m).toMatch(/<form action="\/dashboard\/pastas" method="post" class="cc-form/);
  });
  it('tabela cc- (cartão no celular) com status em pílula', () => {
    expect(m).toContain('cc-tbl-cartoes');
    expect(m).toContain('>publicada<');
    expect(m).toContain('>rascunho<');
    expect(m).toContain('Bruno &lt;b&gt;');
  });
  it('vazia → estado vazio', () => {
    expect(miolo(C['lista-vazia']())).toContain('cc-empty');
  });
  it('tenant: sem "marca da casa" e sem nada da EcoSun', () => {
    const t = C['lista-tenant']();
    expect(t).toContain('<div class="cc-shell cc-escuro">');
    expect(t).not.toContain('marca da casa');
    expect(t).not.toContain('EcoSunPower');
  });
});

describe('Pasta do Cliente — editor', () => {
  it('rascunho incompleto: Publicar travado, aviso do que falta, Excluir no "⋯ Mais ações" com o MESMO confirm', () => {
    const m = miolo(C['editor-rascunho']());
    expect(m).toMatch(/<button[^>]*disabled[^>]*>Publicar<\/button>/);
    expect(m).toContain('cc-aviso cc-aviso-atencao');
    expect(m).toContain('Homologação · Manuais · Garantia');
    const mais = m.slice(m.indexOf('cc-mais'));
    expect(mais).toContain('/dashboard/pastas/p1/excluir');
    expect(mais).toContain("confirm('EXCLUIR a pasta inteira de Ana DÁvila &lt;b&gt;x&lt;/b&gt;?");
  });
  it('CONSERTO: o confirm do Excluir compila (sem quebra de linha crua dentro da string JS)', () => {
    const h = C['editor-publicada']();
    const on = (h.match(/onsubmit="return confirm\('EXCLUIR[^"]*"/) ?? [''])[0];
    expect(on).toContain('\\n\\n');
    expect(on).not.toMatch(/\n/);
    // e o JS do atributo é válido
    const js = on.slice('onsubmit="'.length, -1).replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    expect(() => new Function(js)).not.toThrow();
  });
  it('publicada: Enviar no zap é o único dourado; link do cliente com copiar', () => {
    const m = miolo(C['editor-publicada']());
    expect(ouros(m)).toBe(1);
    expect(m).toMatch(/<form action="\/dashboard\/pastas\/p1\/enviar"[^>]*>\s*<button type="submit" class="cc-btn cc-btn-gold/);
    expect(m).toContain('https://exemplo.invalid/pasta/ana-exemplo-x1');
  });
  it('seções em painéis cc- com upload multipart e dados em cc-form', () => {
    const m = miolo(C['editor-rascunho']());
    expect((m.match(/class="cc-panel/g) ?? []).length).toBeGreaterThanOrEqual(8);
    expect(m).toMatch(/<form action="\/dashboard\/pastas\/p1\/dados" method="post" class="cc-form/);
    expect(m).toContain('contrato &lt;b&gt;d&#39;ana&lt;/b&gt;.pdf');
  });
  it('declaração: exemplos genéricos (nada de TRT, UC ou cliente real no placeholder)', () => {
    const m = miolo(C['editor-rascunho']());
    expect(m).not.toContain('CFT2606128607');
    expect(m).not.toContain('564611');
    expect(m).not.toContain('2608124961');
    expect(m).not.toContain('20.702');
    expect(m).toContain('value="CFT0000000000"');
  });
  it('tenant: "assistente" no lugar de Eva, escuro', () => {
    const t = C['editor-tenant']();
    expect(t).toContain('<div class="cc-shell cc-escuro">');
    expect(miolo(t)).not.toContain('Eva');
  });
});

describe('Pasta do Cliente — prévia', () => {
  it('iframe da prévia num painel, com o HTML escapado no srcdoc', () => {
    const m = miolo(C.preview());
    expect(m).toContain('cc-panel');
    expect(m).toContain('srcdoc="&lt;html&gt;');
    expect(m).toContain('href="/dashboard/pastas/p1"');
  });
});

describe('Pasta do Cliente — sem Tailwind', () => {
  it('arquivo inteiro sem utilitário Tailwind; nenhuma tela carrega o CDN', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'pasta-views.ts'), 'utf-8');
    expect(linhasComTailwind(fonte)).toEqual([]);
    for (const f of Object.values(C)) expect(f()).not.toContain('cdn.tailwindcss.com');
  });
});
