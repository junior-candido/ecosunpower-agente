// Ficha do lead → tela de ATENDIMENTO (28/09/2026, decisão do Junior).
// Antes (R3): ficha de 2 colunas com faixa de números, copiloto IA e o bloco
// "Venda" sempre aberto. Agora: 3 colunas (conversas | chat | cockpit), só 3
// ações no topo (Cadenciar em destaque, Fechou! dourado com janelinha, ⋯ Mais),
// dados em português, lápis no nome. As asserções que continuam valendo foram
// mantidas (balões, escape, perdido, modal, tarefas .cc-form, tenant, Tailwind);
// as que descreviam o layout antigo foram TROCADAS pelas do layout novo.
// (O contrato — forms, campos, ids, confirm — está em miolo-lead-ficha-contrato.test.ts.)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderLeadDetailPage } from '../src/modules/dashboard/leads-views.js';
import { linhasComTailwind } from './helpers/teto-tailwind.js';
import { CASOS_FICHA } from './fixtures/casos-ficha-lead.js';
import { USER_CASA, USER_TENANT, leadDetalhe, LISTA_CONVERSAS } from './fixtures/miolo-leads.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
const acoes = (h: string) => { const i = h.indexOf('class="cc-at-acoes'); return h.slice(i, h.indexOf('<!-- /acoes -->', i)); };
const maisAcoes = (h: string) => { const i = h.indexOf('<details class="cc-mais'); return h.slice(i, h.indexOf('</details>', i)); };
const cockpit = (h: string) => h.slice(h.indexOf('class="cc-at-col cc-at-cockpit'), h.indexOf('</aside>', h.indexOf('class="cc-at-col cc-at-cockpit')));

describe('Atendimento — lead aberto (substitui a ficha)', () => {
  const h = miolo(CASOS_FICHA.normal());

  it('3 colunas: lista de conversas | chat | cockpit; trilha Comercial › Leads › Conversas', () => {
    expect(h).toContain('class="cc-root cc-at cc-at-com-lead"');
    expect(h).toContain('cc-at-lista');
    expect(h).toContain('id="conversa"');
    expect(h).toContain('id="resumo"');
    expect(h).toMatch(/<a href="\/dashboard\/leads">Leads<\/a>/);
    expect(h).toContain('cc-et-negociacao');
  });

  it('SAIU: Copiloto IA, quadro "IA Assistente" e faixa de números', () => {
    for (const c of Object.values(CASOS_FICHA)) {
      const x = miolo(c());
      expect(x).not.toContain('ia-copiloto');
      expect(x).not.toContain('Copiloto');
      expect(x).not.toContain('IA Assistente');
      expect(x).not.toContain('cc-kstrip');
    }
  });

  it('topo com só 3 ações: Cadenciar (destaque), Fechou! (o ÚNICO dourado) e ⋯ Mais', () => {
    const a = acoes(h);
    expect(a).toContain('/start-cadence"');
    expect(a).toContain('cc-at-cad');
    expect(a).toMatch(/class="cc-btn cc-btn-gold" onclick="document\.getElementById\('modal-fechou'\)/);
    expect(a).toContain('<details class="cc-mais');
    expect((h.match(/cc-btn-gold/g) ?? []).length).toBe(1);
    // sem "Nova tarefa"/"Nova proposta" soltos no topo
    expect(a.slice(0, a.indexOf('<details'))).not.toContain('propostas/novo');
  });

  it('Fechou! abre janelinha com tipo/valor/data (form de sempre), escondida por padrão', () => {
    expect(h).toMatch(/<div id="modal-fechou" class="cc-modal hidden"/);
    const f = h.slice(h.indexOf('/fechou"'), h.indexOf('</form>', h.indexOf('/fechou"')));
    for (const c of ['name="tipo"', 'name="valor"', 'name="data"']) expect(f).toContain(c);
    expect(f).toContain('type="submit"');
  });

  it('venda já registrada: sem dourado, sem janelinha, pílula "Venda registrada"', () => {
    const v = miolo(CASOS_FICHA.venda());
    expect(v).not.toContain('cc-btn-gold');
    expect(v).not.toContain('/fechou"');
    expect(v).not.toContain('modal-fechou');
    expect(v).toContain('Venda registrada');
  });

  it('Cadenciar: com cadência ativa ou "pediu pra parar" fica desligado (sem POST no topo)', () => {
    const p = acoes(miolo(CASOS_FICHA.pausada()));
    expect(p).not.toContain('/start-cadence"');
    expect(p).toContain('aria-disabled="true"');
  });

  it('⋯ Mais: pausar/retomar, nova proposta, contrato, perdido, arquivar, opt-out, excluir (MESMOS forms)', () => {
    const m = maisAcoes(h);
    for (const a of ['/pause-eva"', 'propostas/novo?lead_id=', '/contrato-form?tipo=fv', '/opt-out"', '/arquivar"', '/delete"']) expect(m).toContain(a);
    expect(m).toContain("document.getElementById('modal-marcar-perdido')");
    const pm = maisAcoes(miolo(CASOS_FICHA.pausada()));
    for (const a of ['/resume-eva"', '/cancel-cadence"', '/desarquivar"', '/opt-in"']) expect(pm).toContain(a);
    expect(pm).not.toContain('/pause-eva"');
    expect(m).not.toContain('/dashboard/clientes/');
  });

  it('conversa em balões: cliente à esquerda, Eva à direita; HTML da mensagem escapado', () => {
    expect(h).toContain('cc-at-msg cc-at-msg-cli');
    expect(h).toContain('cc-at-msg cc-at-msg-eva');
    expect(h).toContain('&lt;b&gt;ok&lt;/b&gt;');
    expect(h).not.toContain('<b>ok</b>');
  });

  it('dados do lead em PORTUGUÊS — nada de JSON cru', () => {
    const c = cockpit(h);
    expect(c).not.toContain('<pre');
    expect(c).not.toContain('{&quot;');
    expect(c).not.toContain('consumo_kwh');
    expect(c).toContain('Bateria (talvez)');
    expect(c).toContain('Origem: Indicação');
  });

  it('nome editável pelo lápis (form edit-name de sempre, dentro do <details>)', () => {
    const c = cockpit(h);
    expect(c).toMatch(/<details class="cc-at-lapis">\s*<summary[^>]*aria-label="Editar nome"/);
    expect(c).toMatch(/action="\/dashboard\/leads\/[^"]+\/edit-name"/);
  });

  it('tarefas: ✓ / ⏭ por tarefa e "+ tarefa" numa linha; linha do tempo com "+ registrar contato"', () => {
    expect(h).toContain('id="tarefas"');
    expect(h).toContain('Ligar pra confirmar visita');
    expect(h).toMatch(/<form class="cc-form cc-at-linha cc-at-linha-tarefa" method="POST" action="\/dashboard\/leads\/[^"]+\/tarefa"/);
    expect(h).toMatch(/\/tarefa\/t1\/concluir"><button type="submit" class="cc-ibtn cc-at-ok" title="Concluir"/);
    expect(h).toMatch(/\/tarefa\/t1\/adiar"><button[^>]*title="Adiar 2 dias"/);
    expect(h).toMatch(/<form class="cc-form cc-at-linha" method="POST" action="\/dashboard\/leads\/[^"]+\/atividade"/);
  });

  it('arquivos e serviços só aparecem quando existem', () => {
    expect(h).toContain('id="arquivos"');
    expect(h).toContain('Serviços de campo (1)');
    const v = miolo(CASOS_FICHA.vazio());
    expect(v).not.toContain('id="arquivos"');
    expect(v).not.toContain('Serviços de campo');
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

  it('sem conversa → estado vazio curto; ainda sem dados → pede a conta de luz', () => {
    const v = miolo(CASOS_FICHA.vazio());
    expect(v).toContain('Nenhuma mensagem ainda');
    expect(v).toContain('Peça a conta de luz');
  });

  it('celular: abas Conversas · Conversa · Resumo (âncora #resumo, sem JavaScript)', () => {
    expect(h).toContain('href="/dashboard/leads/conversas"');
    expect(h).toContain('href="#resumo"');
  });

  it('tema escuro (D4 = todas escuras)', () => {
    expect(CASOS_FICHA.normal()).toContain('ecosun-body-dark');
  });

  it('miolo sem Tailwind (arquivo da tela inteira)', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'atendimento-views.ts'), 'utf-8');
    expect(linhasComTailwind(fonte)).toEqual([]);
  });

  it('tenant: rótulos com "Assistente", sem "EcoSunPower"/CNPJ da casa na página', () => {
    const pagina = renderLeadDetailPage(leadDetalhe(), [], '', '', [], USER_TENANT, { lista: LISTA_CONVERSAS });
    const t = miolo(pagina);
    expect(t).not.toContain('EcoSunPower');
    expect(t).toContain('Pausar assistente');
    expect(t).not.toContain('Pausar Eva');
    expect(t).not.toMatch(/>Eva</);
    expect(pagina).not.toContain('33.020.459');
  });
});

describe('Atendimento — lista de conversas (coluna 1)', () => {
  const h = miolo(renderLeadDetailPage(leadDetalhe(), [], '', '', [], USER_CASA, { lista: LISTA_CONVERSAS, filtros: { filtro: 'aguardando', q: 'ana' } }));

  it('um item por conversa, com o lead aberto aceso e o filtro mantido no link', () => {
    expect((h.match(/class="cc-at-item( cc-on)?"/g) ?? []).length).toBe(3);
    expect(h).toMatch(/class="cc-at-item cc-on" href="\/dashboard\/leads\/11111111-1111-1111-1111-111111111111\?filtro=aguardando&amp;q=ana"/);
  });

  it('prévia com quem falou, bolinha de "aguardando resposta", etapa, Eva pausada e canal (quando existe)', () => {
    expect(h).toContain('Eva: Posso te mandar a proposta?');
    expect((h.match(/class="cc-at-espera"/g) ?? []).length).toBe(2);
    expect(h).toContain('cc-et-proposta_enviada');
    expect(h).toContain('Eva pausada');
    expect(h).toContain('WhatsApp oficial');
  });

  it('nome com <script> escapado', () => {
    expect(h).toContain('Bruno &lt;script&gt;');
    expect(h).not.toContain('<script>alert(1)');
  });

  it('chips com contagem (Todas · Aguardando resposta · Meus leads) e busca GET', () => {
    expect(h).toMatch(/Aguardando resposta <b>2<\/b>/);
    expect(h).toMatch(/<form class="cc-form cc-at-busca" action="\/dashboard\/leads\/conversas" method="get"/);
    expect(h).toContain('<input type="hidden" name="filtro" value="aguardando">');
  });
});
