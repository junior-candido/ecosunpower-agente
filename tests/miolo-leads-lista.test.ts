// Renovação do miolo — R2: Leads (lista). VISUAL: a tela nova no padrão cc-.
// (O contrato — o que não pode mudar — está em miolo-leads-lista-contrato.test.ts.)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderLeadsListPage } from '../src/modules/dashboard/leads-views.js';
import { corpoDaFuncao, linhasComTailwind } from './helpers/teto-tailwind.js';
import {
  USER_CASA, USER_TENANT, LINHAS_LEADS, FILTROS_CHEIOS, FILTROS_ALERTAS, FILTROS_ATENCAO,
} from './fixtures/miolo-leads.js';

const CASOS = {
  cheio: () => renderLeadsListPage(LINHAS_LEADS, FILTROS_CHEIOS, USER_CASA),
  alertas: () => renderLeadsListPage(LINHAS_LEADS, FILTROS_ALERTAS, USER_CASA),
  atencao: () => renderLeadsListPage(LINHAS_LEADS, FILTROS_ATENCAO, USER_CASA),
  vazio: () => renderLeadsListPage([], { total: 0 }, USER_CASA),
};

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));

describe('Leads (lista) — tela nova', () => {
  const h = miolo(CASOS.cheio());

  it('usa o design system: cabeçalho com trilha, faixa de KPIs, painel e tabela cc-', () => {
    expect(h).toContain('class="cc-root');
    expect(h).toContain('cc-crumb');
    expect(h).toContain('>Comercial<');
    expect(h).toContain('cc-kstrip');
    expect(h).toContain('cc-panel');
    expect(h).toContain('class="cc-tbl"');
    expect(h).toContain('cc-tbl-cartoes');
  });

  it('KPIs só com números que a tela já tem', () => {
    expect(h).toMatch(/Leads<\/div><div class="cc-val">45</);
    expect(h).toMatch(/Precisam de atenção<\/div><div class="cc-val">3</);
  });

  it('chips com contagem de countByStatus; chip ativo segue o status; q preservado', () => {
    expect(h).toMatch(/<a class="cc-chip" href="\/dashboard\/leads\?status=novo&amp;q=ana%20%26%20cia">Novos <b>12<\/b><\/a>/);
    expect(h).toMatch(/<a class="cc-chip cc-chip-on" href="\/dashboard\/leads\?status=negociacao&amp;q=ana%20%26%20cia" aria-current="true">Negociação <b>4<\/b>/);
    const alertas = miolo(CASOS.alertas());
    expect(alertas).toMatch(/cc-chip cc-chip-on[^>]*href="\/dashboard\/leads\?only_alerts=1"/);
    const atencao = miolo(CASOS.atencao());
    expect(atencao).toMatch(/cc-chip cc-chip-on[^>]*href="\/dashboard\/leads\?atencao=1"/);
  });

  it('linha: nome + telefone (celulaDupla), etapa em pílula, SLA com o mesmo title de hoje, Eva', () => {
    expect(h).toContain('cc-dupla');
    expect(h).toContain('cc-et-negociacao');
    expect(h).toContain('title="Tarefa vencida"');
    expect(h).toContain('title="Tarefa vence em breve"');
    expect(h).toContain('title="Tarefas em dia"');
    expect(h).toMatch(/cc-pill[^>]*>ativa</);
    expect(h).toMatch(/cc-pill[^>]*>pausada</);
    expect(h).toMatch(/cc-pill[^>]*>Parou</);
  });

  it('perdido mostra o motivo; ganho leva para a ficha do cliente', () => {
    expect(h).toContain('Concorrente');
    expect(h).toContain('title="fechou com outro"');
    expect(h).toContain('href="/dashboard/clientes/44444444-4444-4444-4444-444444444444"');
  });

  it('insights da IA num painel com cc-ev; sem insights → nada', () => {
    expect(h).toContain('cc-ev cc-ev-critico');
    expect(h).toContain('3 leads sem resposta há mais de 24 h.');
    expect(miolo(CASOS.alertas())).not.toContain('cc-ev ');
    expect(miolo(CASOS.alertas())).not.toContain('em construção');
  });

  it('nome com <script> escapado', () => {
    expect(h).not.toContain('<script>alert(1)</script>');
    expect(h).toContain('Bruno &lt;script&gt;');
  });

  it('paginação no padrão cc-', () => {
    expect(h).toContain('class="cc-pg"');
    expect(h).toContain('Página 2 de 5');
  });

  it('total 0 → estado vazio "Nenhum lead por aqui"', () => {
    const v = miolo(CASOS.vazio());
    expect(v).toContain('cc-empty');
    expect(v).toContain('Nenhum lead por aqui');
  });

  it('busca no padrão (.cc-form) com o mesmo GET', () => {
    expect(h).toMatch(/<form class="cc-form cc-busca" action="\/dashboard\/leads" method="get">/);
  });

  it('miolo sem Tailwind', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'leads-views.ts'), 'utf-8');
    expect(linhasComTailwind(corpoDaFuncao(fonte, 'renderLeadsListPage'))).toEqual([]);
  });

  it('tenant: sem texto da casa (nem "Eva") no miolo', () => {
    const t = miolo(renderLeadsListPage(LINHAS_LEADS, FILTROS_CHEIOS, USER_TENANT));
    expect(t).not.toContain('EcoSunPower');
    expect(t).not.toContain('Eva');
    expect(t).toContain('Assistente');
  });
});
