# Menu: botão Voltar + comandos soltos — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair a definição do menu do WhatsApp pra um módulo testável, adicionar uma linha "⬅️ Voltar" em cada submenu e colocar 6 comandos hoje soltos dentro do menu.

**Architecture:** Hoje `MENU_CATEGORIES` é um array embutido dentro de `tryHandleMenuCommand` em `src/index.ts`, com os handlers/ações em closure. Vamos extrair pra `src/modules/menu/menu.ts` uma fábrica `construirMenu(deps)` (recebe os handlers e as 2 ações por injeção) + helpers puros pra montar as rows (`rowsCategorias`, `rowsSubmenu` que já anexa o Voltar) + uma validação do limite de 10 linhas do WhatsApp. O `index.ts` passa a chamar a fábrica e os helpers.

**Tech Stack:** TypeScript (ESM, imports com sufixo `.js`), Vitest.

---

## Estrutura de arquivos

- **Criar:** `src/modules/menu/menu.ts` — tipos, fábrica `construirMenu(deps)`, helpers puros (`rowsCategorias`, `rowsSubmenu`, `categoriasAcimaDoLimite`), constantes (`VOLTAR_ROW`, `MAX_ROWS_LISTA`).
- **Criar:** `tests/menu.test.ts` — testes das invariantes (Voltar no fim de cada submenu, limite de 10, presença dos 6 itens novos nas categorias certas).
- **Modificar:** `src/index.ts` — substituir o array inline por `construirMenu({...})` e usar os helpers na navegação (níveis 1 e 2).

---

## Task 1: Módulo do menu com a estrutura ATUAL + helpers + Voltar

Cria o módulo replicando exatamente o menu de hoje (sem os 6 itens novos ainda) e já com o Voltar nos helpers. Lock do refactor por teste antes de tocar no `index.ts`.

**Files:**
- Create: `src/modules/menu/menu.ts`
- Test: `tests/menu.test.ts`

- [ ] **Step 1: Escrever o teste falhando**

Cria `tests/menu.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  construirMenu, rowsCategorias, rowsSubmenu, categoriasAcimaDoLimite,
  VOLTAR_ROW, MAX_ROWS_LISTA, type MenuDeps,
} from '../src/modules/menu/menu.js';

function depsStub(): MenuDeps {
  const h = () => vi.fn(async () => true);
  const a = () => vi.fn(async () => {});
  return {
    pricing: h(), proposal: h(), closing: h(), creative: h(), banner: h(),
    bannerKits: h(), reativarBase: h(), juniorBlog: h(), scheduling: h(),
    caseCreator: h(), testimonialAdmin: h(), relatorio: h(), resgatarForms: h(),
    googleAds: h(), acaoImposto: a(), acaoApagar: a(),
  };
}

describe('menu — estrutura', () => {
  it('tem as 6 categorias na ordem esperada', () => {
    const cats = construirMenu(depsStub());
    expect(cats.map(c => c.id)).toEqual([
      'propostas', 'fechamento', 'marketing', 'atendimento', 'financeiro', 'operacao',
    ]);
  });

  it('rowsCategorias devolve uma row por categoria com id menucat_*', () => {
    const cats = construirMenu(depsStub());
    const rows = rowsCategorias(cats);
    expect(rows).toHaveLength(6);
    expect(rows.every(r => r.id.startsWith('menucat_'))).toBe(true);
  });
});

describe('menu — Voltar', () => {
  it('todo submenu termina com a linha Voltar', () => {
    const cats = construirMenu(depsStub());
    for (const cat of cats) {
      const rows = rowsSubmenu(cat);
      expect(rows[rows.length - 1]).toEqual(VOLTAR_ROW);
    }
  });

  it('a row Voltar reabre o menu (id = "menu")', () => {
    expect(VOLTAR_ROW.id).toBe('menu');
  });
});

describe('menu — limite do WhatsApp', () => {
  it('nenhuma categoria passa de 10 rows (itens + Voltar)', () => {
    const cats = construirMenu(depsStub());
    expect(categoriasAcimaDoLimite(cats)).toEqual([]);
    expect(MAX_ROWS_LISTA).toBe(10);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/menu.test.ts`
Expected: FAIL — `Cannot find module '../src/modules/menu/menu.js'`.

- [ ] **Step 3: Criar o módulo com o menu ATUAL**

Cria `src/modules/menu/menu.ts` (replica fiel do array de `index.ts` ~3311–3381, com handlers/ações vindos de `deps`):

```ts
// src/modules/menu/menu.ts
// Definição do menu interativo admin (WhatsApp). Extraído de index.ts pra ser
// testável. A fábrica recebe handlers e ações por injeção; helpers montam as
// rows (submenu já com a linha Voltar) e validam o limite de 10 linhas.

type Handler = (from: string, text: string) => Promise<boolean>;
type Acao = (to: string) => Promise<void>;

export type MenuItem = {
  id: string; title: string; description: string;
  trigger?: string; handler?: Handler; hint?: string; action?: Acao;
};
export type MenuCategoria = { id: string; title: string; description: string; items: MenuItem[] };
export type MenuRow = { id: string; title: string; description: string };

export interface MenuDeps {
  pricing: Handler; proposal: Handler; closing: Handler; creative: Handler;
  banner: Handler; bannerKits: Handler; reativarBase: Handler; juniorBlog: Handler;
  scheduling: Handler; caseCreator: Handler; testimonialAdmin: Handler; relatorio: Handler;
  resgatarForms: Handler; googleAds: Handler;
  acaoImposto: Acao; acaoApagar: Acao;
}

// Limite de linhas de uma lista interativa do WhatsApp.
export const MAX_ROWS_LISTA = 10;

// Linha "Voltar": usa id 'menu' pra reaproveitar o gatilho que reabre as
// categorias (isMenuTrigger no index.ts). Sem novo caminho de navegação.
export const VOLTAR_ROW: MenuRow = { id: 'menu', title: '⬅️ Voltar', description: 'Voltar pras categorias' };

export function construirMenu(deps: MenuDeps): MenuCategoria[] {
  return [
    {
      id: 'propostas', title: '💼 Propostas', description: 'Preço, gerar, ajustar, resgatar',
      items: [
        { id: 'menu_preco', title: '💰 Calcular preço', description: 'Simulação rápida de sistema', trigger: '/preco', handler: deps.pricing },
        { id: 'menu_proposta', title: '📋 Gerar proposta', description: 'PDF + link público', trigger: '/proposta', handler: deps.proposal },
        { id: 'menu_proposta_servico', title: '🔧 Proposta de serviço', description: 'Sem solar — valor único', hint: '🔧 *Proposta só de serviço* (sem painel solar): manda */proposta* e descreve as tarefas + um *valor total único*.\nEx: "proposta de serviço pro Thiago — desmontagem, transporte e reinstalação, total R$ 7.800"' },
        { id: 'menu_ajustar', title: '✏️ Ajustar proposta', description: 'Reabrir uma já enviada', hint: '✏️ Pra ajustar uma proposta enviada, manda:\n*ajustar nome do cliente*\n(ex: ajustar Olavo)' },
        { id: 'menu_clonar', title: '👥 Clonar p/ outro', description: 'Mesma proposta, novo cliente', hint: '👥 Pra clonar uma proposta pra outro cliente (mesmo kit), manda:\n*clonar nome do cliente base*\n(ex: clonar Marcio)' },
        { id: 'menu_abordar', title: '💬 Abordar cliente', description: 'Eva fala com quem já abriu a proposta', hint: '💬 Pra Eva abordar um cliente na hora (mesmo que ele já tenha aberto a proposta), manda:\n*abordar nome do cliente*\n(ex: abordar Jonnata)' },
        { id: 'menu_resgatar', title: '♻️ Resgatar antigas', description: 'Recuperar dados do Drive', hint: '♻️ Manda */resgatar-propostas* pra recuperar os dados das propostas antigas (do Drive).' },
        { id: 'menu_rascunho', title: '📝 Rascunho', description: 'Retomar a não terminada', hint: '📝 Manda *rascunho* pra voltar pra proposta que você não terminou.' },
      ],
    },
    {
      id: 'fechamento', title: '📝 Fechamento', description: 'Contrato e procuração',
      items: [
        { id: 'menu_fechar', title: '🤝 Fechar venda', description: 'Contrato + procuração', trigger: '/fechar', handler: deps.closing },
        { id: 'menu_contrato', title: '📄 Só contrato', description: 'Gera só o contrato', hint: '📄 Manda *contrato nome do cliente* (ex: contrato Marcio).' },
        { id: 'menu_procuracao', title: '🖊️ Só procuração', description: 'Gera só a procuração', hint: '🖊️ Manda *procuracao nome do cliente* (ex: procuracao Marcio).' },
      ],
    },
    {
      id: 'marketing', title: '📣 Marketing', description: 'Criativo, banner, base, blog',
      items: [
        { id: 'menu_criativo', title: '🎨 Gerar criativo', description: 'Anúncio 3 imagens + 3 copies', trigger: 'criativo', handler: deps.creative },
        { id: 'menu_banner', title: '🖼️ Banner promo', description: 'Kit + preço + foto inversor', trigger: '/banner', handler: deps.banner },
        { id: 'menu_reativar', title: '🔄 Reativar base', description: 'Template pros leads (10 por vez)', trigger: '/reativar-base 10', handler: deps.reativarBase },
        { id: 'menu_blog', title: '📝 Status blog', description: 'Drafts pendentes de aprovação', trigger: 'blog status', handler: deps.juniorBlog },
      ],
    },
    {
      id: 'atendimento', title: '📅 Atendimento', description: 'Agenda, cases, reviews',
      items: [
        { id: 'menu_agenda', title: '📅 Agendar reunião', description: 'Visita técnica ou Meet', trigger: '/agenda', handler: deps.scheduling },
        { id: 'menu_novo_case', title: '👤 Cadastrar case', description: 'Obra concluída (prova social)', trigger: '/novo-case', handler: deps.caseCreator },
        { id: 'menu_reviews', title: '✅ Aprovar reviews', description: 'Reviews públicos pendentes', trigger: '/reviews-pendentes', handler: deps.testimonialAdmin },
      ],
    },
    {
      id: 'financeiro', title: '💰 Financeiro', description: 'Relatório, imposto, gastos, painel',
      items: [
        { id: 'menu_fin_relatorio', title: '📊 Relatório do mês', description: 'Resumo do mês na hora', trigger: 'relatório', handler: deps.relatorio },
        { id: 'menu_fin_imposto', title: '🧾 Calcular imposto', description: 'Quanto separar de uma venda', action: deps.acaoImposto },
        { id: 'menu_fin_lancar', title: '💸 Lançar gasto/entrada', description: 'Foto, áudio ou texto', hint: '💸 Manda a foto/áudio do comprovante, ou escreve direto: *gastei 380 no posto* / *recebi 5000 do João*. Eu lanço e classifico sozinha.' },
        { id: 'menu_fin_painel', title: '📈 Abrir painel', description: 'Tela do financeiro', hint: '📈 Painel do financeiro: dashboard.ecosunpower.eng.br/dashboard/financeiro' },
        { id: 'menu_fin_apagar', title: '🗑️ Apagar lançamento', description: 'Apagar um gasto/entrada errado', action: deps.acaoApagar },
      ],
    },
    {
      id: 'operacao', title: '🔧 Operação', description: 'Usinas, monitoramento, manutenção',
      items: [
        { id: 'menu_monitoramento', title: '⚡ Monitoramento', description: 'Geração das usinas', hint: '⚡ Acompanhe a geração das usinas em dashboard.ecosunpower.eng.br/dashboard/monitoramento' },
        { id: 'menu_dono', title: '🏭 Dono de usina', description: 'Vincular dono à usina órfã', hint: '🏭 Cadastra o dono pelo alerta de usina órfã no zap (botão "Cadastrar dono") ou no editar usina do dashboard.' },
        { id: 'menu_manutencao', title: '🔧 Manutenção', description: 'Abrir/ver manutenção', hint: '🔧 Manda */manutencao* pra registrar/ver manutenção.' },
      ],
    },
  ];
}

export function rowsCategorias(cats: MenuCategoria[]): MenuRow[] {
  return cats.map(c => ({ id: `menucat_${c.id}`, title: c.title, description: c.description }));
}

// Rows de um submenu: os itens + a linha Voltar no fim.
export function rowsSubmenu(cat: MenuCategoria): MenuRow[] {
  return [...cat.items.map(i => ({ id: i.id, title: i.title, description: i.description })), VOLTAR_ROW];
}

// Ids das categorias cujo submenu (com Voltar) estoura o limite do WhatsApp.
export function categoriasAcimaDoLimite(cats: MenuCategoria[]): string[] {
  return cats.filter(c => rowsSubmenu(c).length > MAX_ROWS_LISTA).map(c => c.id);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/menu.test.ts`
Expected: PASS (todos os testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/menu/menu.ts tests/menu.test.ts
git commit -m "feat(menu): extrai definição do menu pra módulo testável + helper Voltar"
```

---

## Task 2: Adicionar os 6 comandos soltos no menu

**Files:**
- Modify: `src/modules/menu/menu.ts`
- Test: `tests/menu.test.ts`

- [ ] **Step 1: Escrever os testes falhando**

Adiciona em `tests/menu.test.ts` (novo bloco no fim):

```ts
describe('menu — comandos novos', () => {
  const cats = construirMenu(depsStub());
  const item = (id: string) => cats.flatMap(c => c.items).find(i => i.id === id);
  const catDoItem = (id: string) => cats.find(c => c.items.some(i => i.id === id))?.id;

  it('comparador de material está no Financeiro como dica', () => {
    expect(catDoItem('menu_fin_material')).toBe('financeiro');
    expect(item('menu_fin_material')?.hint).toContain('preço do');
  });

  it('marcar como fechado está em Propostas como dica', () => {
    expect(catDoItem('menu_fechei')).toBe('propostas');
    expect(item('menu_fechei')?.hint).toContain('fechei');
  });

  it('resgatar leads de formulário está em Marketing com trigger /resgatar-forms', () => {
    expect(catDoItem('menu_resgatar_forms')).toBe('marketing');
    expect(item('menu_resgatar_forms')?.trigger).toBe('/resgatar-forms');
    expect(item('menu_resgatar_forms')?.handler).toBeTypeOf('function');
  });

  it('resumo Google Ads está em Marketing com trigger /google', () => {
    expect(catDoItem('menu_google')).toBe('marketing');
    expect(item('menu_google')?.trigger).toBe('/google');
    expect(item('menu_google')?.handler).toBeTypeOf('function');
  });

  it('banner tabela kits está em Marketing com trigger /banner-kits', () => {
    expect(catDoItem('menu_banner_kits')).toBe('marketing');
    expect(item('menu_banner_kits')?.trigger).toBe('/banner-kits');
    expect(item('menu_banner_kits')?.handler).toBeTypeOf('function');
  });

  it('cadastrar email do lead está em Atendimento como dica', () => {
    expect(catDoItem('menu_email')).toBe('atendimento');
    expect(item('menu_email')?.hint).toContain('email');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/menu.test.ts`
Expected: FAIL — itens novos não existem (`catDoItem(...)` retorna `undefined`).

- [ ] **Step 3: Adicionar os itens na fábrica**

Em `src/modules/menu/menu.ts`, dentro de `construirMenu`:

Em **Propostas** (`id: 'propostas'`), adiciona como ÚLTIMO item (mantém o total em 9 itens → 10 com Voltar):

```ts
        { id: 'menu_fechei', title: '✅ Marcar como fechado', description: 'Tira o lead da cadência', hint: '✅ Pra marcar um lead como fechado (sai da cadência), manda:\n*fechei nome ou telefone*\n(ex: fechei Edimilson)' },
```

Em **Marketing** (`id: 'marketing'`), adiciona estes 3 itens ao fim:

```ts
        { id: 'menu_resgatar_forms', title: '♻️ Resgatar leads de form', description: 'Dispara template pros leads do Meta', trigger: '/resgatar-forms', handler: deps.resgatarForms },
        { id: 'menu_google', title: '📊 Resumo Google Ads', description: 'Gasto, cliques, CPC, CTR', trigger: '/google', handler: deps.googleAds },
        { id: 'menu_banner_kits', title: '🖼️ Banner tabela (kits)', description: 'Tabela premium com kits OnGrid', trigger: '/banner-kits', handler: deps.bannerKits },
```

Em **Atendimento** (`id: 'atendimento'`), adiciona ao fim:

```ts
        { id: 'menu_email', title: '📧 Cadastrar email do lead', description: 'Adiciona/atualiza email', hint: '📧 Pra cadastrar o email de um lead, manda:\n*email telefone email*\n(ex: email 61999998888 cliente@gmail.com)' },
```

Em **Financeiro** (`id: 'financeiro'`), adiciona o comparador LOGO APÓS `menu_fin_lancar` (agrupando os de gasto/preço):

```ts
        { id: 'menu_fin_material', title: '💰 Comparar preço de material', description: 'Onde está mais barato', hint: '💰 Pra comparar onde um material está mais barato, pergunta o preço dele:\n*preço do cabo 6mm*\n(eu já te mostro o ranking das lojas)' },
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/menu.test.ts`
Expected: PASS (incluindo o teste de limite — Propostas fica em 10, no limite, e `categoriasAcimaDoLimite` continua `[]`).

- [ ] **Step 5: Commit**

```bash
git add src/modules/menu/menu.ts tests/menu.test.ts
git commit -m "feat(menu): adiciona comparador material, /fechei, /resgatar-forms, /google, /banner-kits e /email"
```

---

## Task 3: Ligar o `index.ts` ao módulo

Substitui o array inline pela fábrica e usa os helpers na navegação (níveis 1 e 2), com o Voltar entrando automático no nível 2.

**Files:**
- Modify: `src/index.ts` (import no topo; bloco do menu ~3307–3413)

- [ ] **Step 1: Adicionar o import**

No topo de `src/index.ts`, junto dos outros imports de módulos, adiciona:

```ts
import { construirMenu, rowsCategorias, rowsSubmenu, type MenuItem } from './modules/menu/menu.js';
```

- [ ] **Step 2: Substituir o array inline pela fábrica**

Em `tryHandleMenuCommand`, remove a declaração `type MenuItem = {...}` (linha ~3310) e TODO o array `const MENU_CATEGORIES: Array<...> = [ ... ];` (linhas ~3311–3381). No lugar, coloca:

```ts
    const MENU_CATEGORIES = construirMenu({
      pricing: tryHandlePricingCommand,
      proposal: tryHandleProposalCommand,
      closing: tryHandleClosingCommand,
      creative: tryHandleCreativeCommand,
      banner: tryHandleBannerCommand,
      bannerKits: tryHandleBannerKitsCommand,
      reativarBase: tryHandleReativarBaseCommand,
      juniorBlog: tryHandleJuniorBlogCommand,
      scheduling: tryHandleSchedulingCommand,
      caseCreator: tryHandleCaseCreatorCommand,
      testimonialAdmin: tryHandleTestimonialAdminCommand,
      relatorio: tryHandleRelatorioCommand,
      resgatarForms: tryHandleResgatarFormsCommand,
      googleAds: tryHandleGoogleAdsCommand,
      acaoImposto: async (to: string) => {
        await setImpostoAwait(to);
        await sendText(to, '🧾 Qual o valor da venda? Manda só o número (ex: *30000* ou *30 mil*).');
      },
      acaoApagar: async (to: string) => {
        const { montarListaApagar } = await import('./modules/financeiro/apagar-menu.js');
        const lista = await montarListaApagar(supabase.getClient());
        if (!lista) { await sendText(to, 'Nenhum lançamento nos últimos 30 dias. 👍'); return; }
        if (metaWaba) {
          const footer = lista.total >= 10 ? 'Os 10 mais recentes' : 'Toque pra escolher';
          await metaWaba.sendInteractiveList(to, { header: '🗑️ Apagar', body: 'Qual lançamento você quer apagar?', buttonText: 'Escolher', sections: [{ title: 'Últimos 30 dias', rows: lista.rows }], footer });
        } else {
          await sendText(to, 'Apaga pelo painel: dashboard.ecosunpower.eng.br/dashboard/financeiro');
        }
      },
    });
```

- [ ] **Step 3: Usar os helpers na navegação**

Nível 1 (`if (isMenuTrigger)`, ~3397) — troca a montagem das rows:

```ts
    if (isMenuTrigger) {
      const rows = rowsCategorias(MENU_CATEGORIES);
      await enviarLista('⚙️ Menu', 'Escolha uma categoria:', rows, 'Categorias');
      return true;
    }
```

Nível 2 (`if (catClick)`, ~3404) — troca a montagem das rows pra incluir o Voltar:

```ts
    if (catClick) {
      const cat = MENU_CATEGORIES.find(c => c.id === catClick[1]);
      if (!cat) {
        await sendText(from, '⚠️ Categoria não encontrada. Manda *menu* de novo.');
        return true;
      }
      const rows = rowsSubmenu(cat);
      await enviarLista(cat.title, 'O que você quer fazer?', rows, cat.title.replace(/^\S+\s/, ''));
      return true;
    }
```

Nível 3 (`if (itemClick)`) — NÃO muda (continua achando o item por `menu_<modo>` e executando action/hint/handler).

- [ ] **Step 4: Typecheck + testes + build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npx vitest run`
Expected: toda a suíte passa (incluindo `tests/menu.test.ts`).

- [ ] **Step 5: Conferência manual da navegação (leitura de código)**

Confirma no `index.ts`:
- a row Voltar tem `id: 'menu'` → cai em `isMenuTrigger` → reabre categorias (sem loop, pois reabrir categorias não dispara handler).
- o nível 3 (`menu_<modo>`) ainda casa com os ids dos 6 itens novos (`menu_fechei`, `menu_resgatar_forms`, `menu_google`, `menu_banner_kits`, `menu_email`, `menu_fin_material`).

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "refactor(menu): index.ts usa o módulo do menu + rows com Voltar"
```

---

## Pós-implementação (fora dos commits acima)

- Rodar **code review 3×** (regra do projeto), corrigindo achados a cada passada.
- Pedir autorização de **push** (branch `feat/menu-voltar-comandos-soltos`).
- Depois do push: **Implantar** no Easypanel + **smoke** do Junior (abrir `menu`, entrar numa categoria, tocar Voltar, e testar os 6 itens novos).

## Notas / invariantes

- Sem migration, sem mudança de banco.
- 💼 Propostas fica exatamente em **10 rows** (8 atuais + `/fechei` + Voltar). É o teto do WhatsApp — qualquer item novo ali no futuro exige reorganizar.
- O Voltar reaproveita o gatilho `menu`; não cria caminho de navegação novo.
