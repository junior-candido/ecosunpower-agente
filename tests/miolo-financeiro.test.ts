// Renovação do miolo — R10: Financeiro (visão) no padrão cc-, tema escuro,
// sem Tailwind. Contrato em miolo-financeiro-contrato.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { linhasComTailwind } from './helpers/teto-tailwind.js';
import { CASOS_FINANCEIRO } from './fixtures/casos-financeiro.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));

describe('Financeiro (visão) — tela nova', () => {
  const h = CASOS_FINANCEIRO.cheio();
  const m = miolo(h);

  it('cabeçalho Financeiro › Visão financeira, título sem emoji e sem o nome da casa', () => {
    expect(m).toContain('cc-crumb');
    expect(m).toContain('<h1>Financeiro</h1>');
  });

  it('KPIs só com FinanceiroData (8 números de hoje), em R$', () => {
    expect(m).toContain('cc-kstrip');
    for (const r of ['Recebido no mês', 'RBT12 (faixa 3)', 'Imposto a separar', 'A receber', 'Saiu no mês (PJ)', 'Lucro do mês', 'Entrou (caixa real)', 'Faturado (base imposto)']) {
      expect(m).toContain(`<div class="cc-lbl">${r}</div>`);
    }
    expect(m).toContain('48.250,50');
    expect(m).toContain('faltam R$');
    expect(m).toContain('Por fora (sem nota)');
  });

  it('ECharts com o tema cc (verde entrou, cinza saiu, dourado sobrou), mesmo CDN', () => {
    expect(h).toContain('echarts@5.5.0');
    expect(h).toContain("echarts.init(document.getElementById('graf'), 'cc')");
    expect(h).toContain("echarts.init(document.getElementById('pizza'), 'cc')");
    expect((h.match(/id="cc-tema-graficos"/g) ?? []).length).toBe(1);
    expect(h).toContain('T.ok');
    expect(h).toContain('T.off');
    expect(h).toContain('T.gold');
  });

  it('contas a receber e lançamentos em tabela cc- (cartão no celular), status em pílula', () => {
    expect(m).toContain('cc-tbl-cartoes');
    expect(m).toContain('>Pendente<');
    expect(m).toContain('cc-pill cc-s-warn');
    expect(m).toContain('Serviço &lt;b&gt;limpeza&lt;/b&gt;');
    expect(m).toContain('Bruno &lt;script&gt;');
  });

  it('filtros de lançamentos com os MESMOS links (?tipo= / ?pfpj=)', () => {
    for (const q of ['href="/dashboard/financeiro"', 'href="?tipo=despesa"', 'href="?tipo=entrada"', 'href="?pfpj=PJ"', 'href="?pfpj=PF"']) {
      expect(m).toContain(q);
    }
  });

  it('comprovante: link http vira 📎; javascript: some', () => {
    expect(m).toContain('href="https://exemplo.invalid/c1.pdf"');
    expect(m).not.toContain('href="javascript:');
  });

  it('vazio: estado vazio nas listas e na pizza, sem quebrar', () => {
    const v = miolo(CASOS_FINANCEIRO.vazio());
    expect(v).toContain('cc-empty');
    expect(v).toContain('Sem despesas no mês ainda');
    expect(v).toContain('última faixa');
  });

  it('tenant: escuro, sem nada da casa', () => {
    const t = CASOS_FINANCEIRO.tenant();
    expect(t).toContain('<div class="cc-shell cc-escuro">');
    expect(t).not.toContain('EcoSunPower');
    expect(t).not.toContain('CNPJ 33.020');
  });

  it('sem Tailwind (arquivo inteiro) e sem o CDN', () => {
    expect(h).not.toContain('cdn.tailwindcss.com');
    const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'financeiro-views.ts'), 'utf-8');
    expect(linhasComTailwind(fonte)).toEqual([]);
  });
});
