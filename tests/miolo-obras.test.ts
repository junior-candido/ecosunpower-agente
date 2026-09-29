// Renovação do miolo — R15: Quadro de Obras + Vincular usinas no padrão cc-,
// tema escuro (D4), sem Tailwind. Contrato em miolo-obras-contrato.test.ts.
// D7 ainda não decidida → como o Funil (R4): sem "Mover para…" no cartão,
// colunas com rolagem horizontal e encaixe no celular.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ETAPAS_USINA } from '../src/modules/usina-etapas.js';
import { linhasComTailwind } from './helpers/teto-tailwind.js';
import { CASOS_OBRAS as C } from './fixtures/casos-obras.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
const ouros = (m: string) => (m.match(/cc-btn-gold/g) ?? []).length;
const semScript = (h: string) => h.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');

describe('Quadro de Obras — tela nova', () => {
  const h = miolo(C.quadro());

  it('cabeçalho Instalações › Quadro de Obras, título sem emoji, UMA ação dourada (Vincular)', () => {
    expect(h).toContain('cc-crumb');
    expect(h).toContain('<h1>Quadro de Obras</h1>');
    expect(ouros(h)).toBe(1);
    expect(h).toMatch(/<a class="cc-btn cc-btn-gold[^"]*" href="\/dashboard\/usinas\/vincular"/);
    expect(h).toMatch(/<a class="cc-chip" href="\/dashboard\/monitoramento">Lista<\/a>/);
    expect(h).toMatch(/cc-chip cc-chip-on" href="\/dashboard\/usinas\/kanban"/);
    expect(semScript(h)).not.toMatch(/[☑️🔗ℹ️]/u);
  });

  it('faixa "Pipeline técnico": uma caixa por etapa com a contagem já agrupada (pos_venda fica fora)', () => {
    expect(h).toContain('Pipeline técnico');
    const faixa = h.slice(h.indexOf('Pipeline técnico'), h.indexOf('cc-kb kanban-board'));
    const contagens = [...faixa.matchAll(/<div class="cc-lbl">([^<]+)<\/div><div class="cc-val">(\d+)/g)].map((m) => [m[1], m[2]]);
    expect(contagens).toEqual([['Projeto', '2'], ['Aprovação', '1'], ['Instalação', '2'], ['Vistoria', '0'], ['Homologação', '1'], ['Operação', '1']]);
    expect(faixa).toContain('média 24 dias'); // projeto: 2 e 45 dias
  });

  it('uma coluna cc-kb por etapa, na ordem, com data-etapa + data-ordem na lista (base do retrocesso)', () => {
    const ordem = [...h.matchAll(/class="cc-kb-lista kanban-list" data-etapa="([a-z_]+)" data-ordem="(\d)"/g)].map((m) => m[1]);
    expect(ordem).toEqual(ETAPAS_USINA.map((e) => e.slug));
    expect(h).toMatch(/<h3>Projeto<\/h3>/);
    expect(h).toContain('cc-kb-n kanban-count');
    expect(h).toContain('cc-kb-vazio');
  });

  it('cartão: classe-gancho, data-usina-id, nome escapado, link do detalhe, caixinha e botão de contato', () => {
    expect(h).toMatch(/class="cc-kb-card[^"]* kanban-card" data-usina-id="11111111-1111-4111-8111-000000000002" data-apelido="Bruno &lt;script&gt;x&lt;\/script&gt; D&#039;Ávila"/);
    expect(h).not.toContain('<script>x</script>');
    expect(h).toContain('Vila &lt;b&gt;Teste&lt;/b&gt;');
    expect(h).toContain('href="/dashboard/monitoramento/11111111-1111-4111-8111-000000000001" draggable="false"');
    expect(h).toMatch(/<input type="checkbox"[^>]*class="kanban-check"[^>]*data-usina-id="11111111-1111-4111-8111-000000000001"/);
    expect(h).toMatch(/<button type="button"[^>]*class="cc-ob-info kanban-info"[^>]*data-usina-id="11111111-1111-4111-8111-000000000001" data-apelido="Usina Ana Exemplo"/);
  });

  it('trilha de etapas em miniatura no cartão (etapa atual marcada)', () => {
    const card = h.slice(h.indexOf('data-usina-id="11111111-1111-4111-8111-000000000004"'));
    expect(card.slice(0, card.indexOf('<ol class="cc-trl'))).toContain('cc-ob-trl');
    const trilha = card.slice(card.indexOf('<ol class="cc-trl'), card.indexOf('</ol>'));
    expect((trilha.match(/cc-trl-feita/g) ?? []).length).toBe(2);
    expect(trilha).toMatch(/cc-trl-atual" aria-current="step"><span>Instalação/);
  });

  it('"dias na etapa": o número que já existe, em atenção quando passa da média da etapa (sem prazo novo)', () => {
    // Projeto: 2 e 45 dias → média 24 (a do Pipeline técnico) → 45 em atenção, 2 normal.
    // "hoje" e Operação (última etapa, não é obra parada) → normal.
    expect(h).toMatch(/data-usina-id="11111111-1111-4111-8111-000000000001"[\s\S]*?cc-ob-dias"[^>]*>2 d</);
    expect(h).toMatch(/class="cc-kb-card cc-kb-warn kanban-card" data-usina-id="11111111-1111-4111-8111-000000000002"/);
    expect(h).toMatch(/data-usina-id="11111111-1111-4111-8111-000000000002"[\s\S]*?cc-ob-dias cc-ob-parada"[^>]*>45 d</);
    expect(h).toMatch(/data-usina-id="11111111-1111-4111-8111-000000000004"[\s\S]*?cc-ob-dias"[^>]*>hoje</);
    expect(h).toMatch(/data-usina-id="11111111-1111-4111-8111-000000000007"[\s\S]*?cc-ob-dias"[^>]*>3 d</);
    // sem data → "—"
    expect(h).toMatch(/data-usina-id="11111111-1111-4111-8111-000000000003"[\s\S]*?cc-ob-dias"[^>]*>—</);
  });

  it('sem dado → "—" (apelido, cidade, kWp)', () => {
    const card = h.slice(h.indexOf('data-usina-id="11111111-1111-4111-8111-000000000003"'));
    expect(card).toContain('>Sem apelido<');
    expect(card.slice(0, 1500)).toMatch(/— · —/);
  });

  it('Sortable igual (mesmo CDN, draggable, filter, group) e nenhuma URL nova; sem "Mover para…" no cartão (D7)', () => {
    expect(h).toContain("draggable: '.kanban-card'");
    expect(h).toContain("group: 'obras'");
    expect(h).toContain("filter: '.kanban-info, .kanban-check'");
    expect(h).toContain('sortablejs@1.15.6');
    expect((h.match(/fetch\(/g) ?? []).length).toBe(3);
    // "Mover para…" só existe na barra de lote (já existia), nunca no cartão
    expect((h.match(/Mover para/g) ?? []).length).toBe(1);
    expect(h.slice(h.indexOf('lote-bar') - 200)).toContain('Mover para');
  });

  it('painel de contato: mesmos ids, sem classe Tailwind no HTML montado pelo script', () => {
    for (const id of ['contato-overlay', 'contato-drawer', 'contato-titulo', 'contato-fechar', 'contato-corpo']) expect(h).toContain(`id="${id}"`);
    expect(h).toContain('cc-ob-drawer');
    expect(h).toContain("'/dashboard/usinas/' + id + '/contato'");
    expect(h).not.toMatch(/text-(slate|indigo|rose)-\d/);
  });

  it('seleção em lote: botão, barra e ids iguais; modo seleção sem classe Tailwind', () => {
    for (const id of ['btn-selecionar', 'lote-bar', 'lote-count', 'lote-etapa', 'lote-mover', 'lote-limpar', 'filtro-kanban']) expect(h).toContain(`id="${id}"`);
    expect(h).not.toContain("'bg-indigo-600'");
    expect(h).toContain("classList.toggle('cc-ob-on'");
  });

  it('vazio: colunas vazias + aviso', () => {
    const v = miolo(C['quadro-vazio']());
    expect(v).toContain('cc-kb-vazio');
    expect(v).toContain('cc-empty');
  });

  it('tenant: escuro, sem EcoSunPower/CNPJ da casa/Eva', () => {
    const t = C['quadro-tenant']();
    expect(t).toContain('<div class="cc-shell cc-escuro">');
    expect(miolo(t)).not.toContain('EcoSunPower');
    expect(t).not.toContain('33.020');
    expect(miolo(t)).not.toMatch(/\bEva\b/);
  });
});

describe('Vincular usinas — tela nova', () => {
  it('cabeçalho, tabela cc- (cartão no celular), form igual com cc-form, Confirmar dourado único', () => {
    const m = miolo(C.vincular());
    expect(m).toContain('cc-crumb');
    expect(m).toContain('<h1>Vincular usinas ao cliente</h1>');
    expect(m).toContain('cc-tbl');
    expect(m).toMatch(/<form method="post" action="\/dashboard\/usinas\/vincular" class="cc-form/);
    expect(ouros(m)).toBe(1);
    expect(m).toMatch(/<button type="submit" class="cc-btn cc-btn-gold[^"]*">Confirmar vínculos<\/button>/);
    expect(m).toContain('name="U1"');
    expect(m).toContain('value="L1" selected');
    expect(m).toContain('Bruno &lt;script&gt;');
    expect(m).toContain('Carla &lt;b&gt;Fictícia&lt;/b&gt;');
    expect(m).toContain('href="/dashboard/usinas/kanban"');
  });
  it('vazio: estado vazio sem emoji', () => {
    const m = miolo(C['vincular-vazio']());
    expect(m).toContain('cc-empty');
    expect(m).toContain('Nenhuma usina pendente');
    expect(m).not.toContain('🎉');
  });
  it('tenant: escuro e sem marca da casa', () => {
    const t = C['vincular-tenant']();
    expect(t).toContain('<div class="cc-shell cc-escuro">');
    expect(miolo(t)).not.toContain('EcoSunPower');
  });
});

describe('Quadro de Obras + Vincular — sem Tailwind', () => {
  it('arquivos inteiros sem utilitário Tailwind; nenhuma tela carrega o CDN', () => {
    for (const arq of ['usinas-kanban-views.ts', 'vincular-usinas-views.ts']) {
      const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', arq), 'utf-8');
      expect(linhasComTailwind(fonte), arq).toEqual([]);
    }
    for (const f of Object.values(C)) expect(f()).not.toContain('cdn.tailwindcss.com');
  });
});
