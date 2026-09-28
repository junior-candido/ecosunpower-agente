// Renovação do miolo — R11: Demonstrativos GD (6 telas) no padrão cc-, tema
// escuro (D4), sem Tailwind. Contrato em miolo-demonstrativos-contrato.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { linhasComTailwind } from './helpers/teto-tailwind.js';
import { CASOS_DEMONSTRATIVOS as C } from './fixtures/casos-demonstrativos.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
const ouros = (m: string) => (m.match(/cc-btn-gold/g) ?? []).length;

describe('Demonstrativos — lista', () => {
  const m = miolo(C.lista());
  it('cabeçalho Usinas › Demonstrativos GD, título sem emoji, "+ Enviar PDF" é o único dourado', () => {
    expect(m).toContain('cc-crumb');
    expect(m).toContain('<h1>Demonstrativos de GD</h1>');
    expect(ouros(m)).toBe(1);
    expect(m).toMatch(/cc-btn cc-btn-gold" href="\/dashboard\/demonstrativos\/enviar-pdf"/);
  });
  it('KPIs pela contagem dos estados que a lista já traz', () => {
    expect(m).toContain('cc-kstrip');
    expect(m).toMatch(/Prontos<\/div><div class="cc-val">1</);
    expect(m).toMatch(/Falta dado<\/div><div class="cc-val">1</);
  });
  it('tabela cc- (cartão no celular) com pílula de status pela mesma regra', () => {
    expect(m).toContain('cc-tbl-cartoes');
    expect(m).toContain('cc-pill cc-s-ok');
    expect(m).toContain('cc-pill cc-s-warn');
    expect(m).toContain('cc-pill cc-s-crit');
    expect(m).toContain('cc-pill cc-s-off');
    expect(m).toContain('cc-pill cc-s-watch'); // créditos a vencer = acompanhar
    expect(m).toContain('Bruno &lt;b&gt;Fictício&lt;/b&gt;');
  });
  it('aviso de sucesso e filtro cc-form', () => {
    expect(m).toContain('cc-aviso cc-aviso-ok');
    expect(m).toContain('class="cc-form');
  });
  it('vazio → estado vazio', () => {
    expect(miolo(C['lista-vazia']())).toContain('cc-empty');
  });
});

describe('Demonstrativos — cliente', () => {
  const h = C['cliente-pronto']();
  const m = miolo(h);
  it('cabeçalho com trilha, UC e pílula; KPIs; aviso de créditos a vencer', () => {
    expect(m).toContain('href="/dashboard/demonstrativos?mes=2026-07-01"');
    expect(m).toContain('Ana &lt;b&gt;Exemplo&lt;/b&gt; · UC 200002');
    expect(m).toContain('cc-kstrip');
    expect(m).toContain('120 kWh de crédito vencem em nov/2026');
  });
  it('Enviar ao cliente é o único dourado', () => {
    expect(ouros(m)).toBe(1);
    expect(m).toMatch(/cc-btn cc-btn-gold" href="\/dashboard\/demonstrativos\/200002\/enviar\?mes=2026-07-01"/);
  });
  it('gráfico com os mesmos arrays; só as cores trocadas (tema)', () => {
    expect(h).toContain('id="g13"');
    expect(h).toContain('["mai/2026","jun/2026","jul/2026","ago/2026"]');
    expect(h).toContain('[450,470,480,500]');
    expect((h.match(/id="cc-tema-graficos"/g) ?? []).length).toBe(1);
    expect(h).not.toContain("'#f59e0b'");
  });
  it('pendências em linhas de lista; formulário de geração com cc-form', () => {
    const f = miolo(C['cliente-falta']());
    expect(f).toContain('cc-li');
    expect(f).toMatch(/<form method="post" action="\/dashboard\/demonstrativos\/200002\/geracao" class="cc-form/);
  });
  it('sem cliente: candidatos para ligar', () => {
    const s = miolo(C['cliente-sem-cliente']());
    expect(s).toContain('Ligar a Maria Fictícia');
    expect(s).toContain('Ligar a sem nome');
  });
  it('tenant: escuro, "assistente" no lugar de Eva, nada da casa', () => {
    const t = C['cliente-tenant']();
    expect(t).toContain('<div class="cc-shell cc-escuro">');
    expect(miolo(t)).toContain('Enviar ao cliente pela assistente');
    expect(miolo(t)).not.toContain('Eva');
    expect(t).not.toContain('EcoSunPower');
  });
});

describe('Demonstrativos — enviar PDF, conferência, digitar, confirmar', () => {
  it('enviar PDF: cc-form multipart, botão largo dourado', () => {
    const m = miolo(C['enviar-pdf']());
    expect(m).toMatch(/enctype="multipart\/form-data" class="cc-form/);
    expect(ouros(m)).toBe(1);
  });
  it('conferência: cada PDF num painel; falha em aviso de erro', () => {
    const m = miolo(C.conferencia());
    expect(m).toContain('cc-panel');
    expect(m).toContain('cc-aviso cc-aviso-erro');
    expect(m).toContain('nao parece um demonstrativo');
  });
  it('digitar: erros num aviso; campos em grade cc-form; Conferir e gravar dourado', () => {
    const m = miolo(C['digitar-erro']());
    expect(m).toContain('cc-aviso cc-aviso-erro');
    expect(m).toContain('Injetado &lt;b&gt;obrigatório&lt;/b&gt;');
    expect(m).toMatch(/action="\/dashboard\/demonstrativos\/digitar" class="cc-form/);
    expect(ouros(m)).toBe(1);
  });
  it('confirmar: painéis WhatsApp / E-mail / Link; Confirmar dourado; já enviado em aviso', () => {
    const m = miolo(C.confirmar());
    for (const t of ['WhatsApp', 'E-mail', 'Link do relatório']) expect(m).toContain(`<h3>${t}</h3>`);
    expect(ouros(m)).toBe(1);
    expect(miolo(C['confirmar-reenviar']())).toContain('cc-aviso cc-aviso-atencao');
  });
  it('confirmar bloqueado: nada pode ser enviado, sem dourado', () => {
    const m = miolo(C['confirmar-bloqueado']());
    expect(m).toContain('Nada pode ser enviado');
    expect(ouros(m)).toBe(0);
  });
});

describe('Demonstrativos — sem Tailwind', () => {
  it('arquivo inteiro sem utilitário Tailwind; nenhuma tela carrega o CDN', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'demonstrativos-views.ts'), 'utf-8');
    expect(linhasComTailwind(fonte)).toEqual([]);
    for (const f of Object.values(C)) expect(f()).not.toContain('cdn.tailwindcss.com');
  });
});
