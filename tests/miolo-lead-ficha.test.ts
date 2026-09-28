// Renovação do miolo — R3: ficha do lead, tela nova no padrão cc-.
// (O contrato — forms, campos, fetch, ids, confirm — está em miolo-lead-ficha-contrato.test.ts.)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderLeadDetailPage } from '../src/modules/dashboard/leads-views.js';
import { corpoDaFuncao, linhasComTailwind } from './helpers/teto-tailwind.js';
import { CASOS_FICHA } from './fixtures/casos-ficha-lead.js';
import { USER_TENANT, leadDetalhe } from './fixtures/miolo-leads.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
const acoes = (h: string) => { const i = h.indexOf('class="cc-lead-acoes'); return h.slice(i, h.indexOf('<!-- /acoes -->', i)); };
const maisAcoes = (h: string) => { const i = h.indexOf('<details class="cc-mais'); return h.slice(i, h.indexOf('</details>', i)); };

describe('Ficha do lead — tela nova', () => {
  const h = miolo(CASOS_FICHA.normal());

  it('design system: trilha Comercial › Leads › nome, KPIs e duas colunas', () => {
    expect(h).toContain('class="cc-root cc-ficha"');
    expect(h).toContain('cc-crumb');
    expect(h).toMatch(/<a href="\/dashboard\/leads">Leads<\/a>/);
    expect(h).toContain('cc-kstrip');
    expect(h).toContain('cc-ficha-grid');
    expect(h).toContain('cc-et-negociacao');
  });

  it('Fechou! é o ÚNICO botão dourado, e é o submit do form de venda', () => {
    expect((h.match(/cc-btn-gold/g) ?? []).length).toBe(1);
    const f = h.slice(h.indexOf('/fechou"'), h.indexOf('</form>', h.indexOf('/fechou"')));
    expect(f).toMatch(/<button type="submit" class="cc-btn cc-btn-gold"[^>]*>[^<]*Fechou!/);
  });

  it('venda já registrada: sem dourado e sem o form de fechar', () => {
    const v = miolo(CASOS_FICHA.venda());
    expect(v).not.toContain('cc-btn-gold');
    expect(v).not.toContain('/fechou"');
    expect(v).toContain('Venda registrada');
  });

  it('à vista: Pausar Eva (ou Retomar), Nova tarefa e "Mais ações"', () => {
    const a = acoes(h);
    expect(a).toContain('/pause-eva"');
    expect(a).toContain('href="#tarefas"');
    expect(a).toContain('<details class="cc-mais');
    const p = acoes(miolo(CASOS_FICHA.semCadencia()));
    expect(p).toContain('/resume-eva"');
    expect(p).not.toContain('/pause-eva"');
  });

  it('o resto das ações mora no "Mais ações", com os MESMOS forms', () => {
    const m = maisAcoes(h);
    for (const a of ['/start-cadence"', '/opt-out"', '/arquivar"', '/delete"']) expect(m).toContain(a);
    expect(m).toContain("document.getElementById('modal-marcar-perdido')");
    expect(maisAcoes(miolo(CASOS_FICHA.pausada()))).toContain('/cancel-cadence"');
    expect(maisAcoes(miolo(CASOS_FICHA.pausada()))).toContain('/desarquivar"');
    expect(maisAcoes(miolo(CASOS_FICHA.pausada()))).toContain('/opt-in"');
  });

  it('conversa em balões: cliente à esquerda, Eva à direita; HTML da mensagem escapado', () => {
    expect(h).toContain('cc-balao cc-balao-cli');
    expect(h).toContain('cc-balao cc-balao-eva');
    expect(h).toContain('&lt;b&gt;ok&lt;/b&gt;');
    expect(h).not.toContain('<b>ok</b>');
  });

  it('nenhum <b> na página (regra de contrato-bloqueio-views)', () => {
    for (const c of Object.values(CASOS_FICHA)) expect(miolo(c())).not.toContain('<b>');
  });

  it('lead perdido: pílula, motivo e só "Reabrir" (sem o modal de marcar perdido)', () => {
    const p = miolo(CASOS_FICHA.perdido());
    expect(p).toContain('cc-et-perdido');
    expect(p).toContain('Fechou com concorrente');
    expect(p).toContain('proposta 15% mais barata');
    expect(p).toContain('/unmark-lost"');
    expect(p).not.toContain('id="modal-marcar-perdido"');
  });

  it('modal de perdido no padrão, escondido por padrão (classe hidden de sempre)', () => {
    expect(h).toMatch(/<div id="modal-marcar-perdido" class="cc-modal hidden"/);
  });

  it('tarefas e formulários com .cc-form', () => {
    expect(h).toMatch(/<form class="cc-form[^"]*" method="POST" action="\/dashboard\/leads\/[^"]+\/tarefa"/);
    expect(h).toContain('id="tarefas"');
    expect(h).toContain('Ligar pra confirmar visita');
  });

  it('sem conversa → estado vazio curto', () => {
    expect(miolo(CASOS_FICHA.vazio())).toContain('Nenhuma mensagem ainda');
  });

  it('miolo sem Tailwind', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'leads-views.ts'), 'utf-8');
    for (const fn of ['renderLeadDetailPage', 'renderTarefas', 'renderTimeline', 'renderAnexoCard', 'renderMsgCopiloto']) {
      expect(linhasComTailwind(corpoDaFuncao(fonte, fn)), fn).toEqual([]);
    }
  });

  it('tenant: rótulos com "Assistente", sem "EcoSunPower" no miolo', () => {
    const t = miolo(renderLeadDetailPage(leadDetalhe(), [], '', '', [], USER_TENANT));
    expect(t).not.toContain('EcoSunPower');
    expect(t).toContain('Pausar assistente');
    expect(t).not.toContain('Pausar Eva');
  });
});
