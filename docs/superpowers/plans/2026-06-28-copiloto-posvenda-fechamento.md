# Copiloto Pós-venda — fechamento · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os 4 itens do copiloto de pós-venda (agenda lateral com lembrete na mão, notas internas, sugestão proativa por regra, termômetro + repositório) reusando infra existente, sem tabela nova.

**Architecture:** 3 funções puras novas (`temperatura`, `sugestaoProativa`, `agruparAgenda`) testadas com vitest; 1 query nova (`listarAgendaPosVenda`); extensão da view `/dashboard/pos-venda` (layout 2 colunas + termômetro/chip/notas no card + agenda lateral); 5 endpoints novos no router reusando `lead_tarefas` (`tarefas.ts`) e `lead_atividades` (`atividades.ts`).

**Tech Stack:** TypeScript ESM (imports `.js`), Express server-rendered, Tailwind/JS via CDN, Supabase/Postgres, vitest.

**Spec:** `docs/superpowers/specs/2026-06-28-copiloto-posvenda-fechamento-design.md`

---

## File Structure

**Criar:**
- `src/modules/dashboard/pos-venda-termometro.ts` — `temperatura(linha, hoje)` (puro)
- `src/modules/dashboard/pos-venda-sugestao.ts` — `sugestaoProativa(linha, hoje)` (puro)
- `src/modules/dashboard/pos-venda-agenda.ts` — `agruparAgenda(tarefas, hoje)` (puro) + tipos
- `tests/pos-venda-termometro.test.ts`
- `tests/pos-venda-sugestao.test.ts`
- `tests/pos-venda-agenda.test.ts`

**Modificar:**
- `src/modules/dashboard/pos-venda-queries.ts` — add `elegivelUpgrade` à `PosVendaLinha`; nova `listarAgendaPosVenda`
- `src/modules/dashboard/pos-venda-views.ts` — termômetro + chip + painel notas/histórico no card; coluna da agenda; nova assinatura
- `tests/pos-venda-views.test.ts` — atualizar helper `linha()` (novo campo) + asserts novos
- `src/modules/dashboard/router.ts` — 5 endpoints + carregar agenda no GET

---

## Task 1: Termômetro (função pura)

**Files:**
- Create: `src/modules/dashboard/pos-venda-termometro.ts`
- Test: `tests/pos-venda-termometro.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/pos-venda-termometro.test.ts
import { describe, it, expect } from 'vitest';
import { temperatura } from '../src/modules/dashboard/pos-venda-termometro.js';

const HOJE = new Date('2026-06-28T12:00:00Z');
const diasAtras = (n: number) => new Date(HOJE.getTime() - n * 86400000).toISOString();

describe('temperatura', () => {
  it('morno quando nunca houve contato (sem histórico)', () => {
    expect(temperatura({ saude: 'verde', ultimoContatoEm: null, jaTeveDepoimento: false }, HOJE)).toBe('morno');
  });
  it('quente: contato recente (<30d) e saúde não-vermelha', () => {
    expect(temperatura({ saude: 'verde', ultimoContatoEm: diasAtras(10), jaTeveDepoimento: false }, HOJE)).toBe('quente');
  });
  it('quente: cliente que deu depoimento com contato até 60d', () => {
    expect(temperatura({ saude: 'amarelo', ultimoContatoEm: diasAtras(45), jaTeveDepoimento: true }, HOJE)).toBe('quente');
  });
  it('frio: mais de 90 dias sem contato', () => {
    expect(temperatura({ saude: 'verde', ultimoContatoEm: diasAtras(120), jaTeveDepoimento: true }, HOJE)).toBe('frio');
  });
  it('frio: saúde vermelha arrastando há mais de 30d', () => {
    expect(temperatura({ saude: 'vermelho', ultimoContatoEm: diasAtras(40), jaTeveDepoimento: false }, HOJE)).toBe('frio');
  });
  it('morno: contato entre 30 e 90 dias sem engajamento', () => {
    expect(temperatura({ saude: 'verde', ultimoContatoEm: diasAtras(50), jaTeveDepoimento: false }, HOJE)).toBe('morno');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pos-venda-termometro.test.ts`
Expected: FAIL — `Failed to resolve import ... pos-venda-termometro.js` (módulo ainda não existe).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/modules/dashboard/pos-venda-termometro.ts
// Função PURA: temperatura do relacionamento no pós-venda, por regras.
// Cortes isolados em constantes — ajuste numa linha quando quiser calibrar.
import type { Saude } from './pos-venda-saude.js';

export type Temperatura = 'quente' | 'morno' | 'frio';

export interface LinhaTemp {
  saude: Saude;
  ultimoContatoEm: string | null;
  jaTeveDepoimento: boolean;
}

const DIA = 86400000;
const QUENTE_DIAS = 30;   // contato mais recente que isto = quente (se saúde ok)
const ENGAJADO_DIAS = 60; // quem já deu depoimento segue quente até aqui
const FRIO_DIAS = 90;     // sem contato além disto = frio
const VERMELHO_FRIO_DIAS = 30; // problema técnico arrastando além disto = frio

const diasSem = (iso: string | null, hoje: Date): number | null =>
  iso ? Math.floor((hoje.getTime() - new Date(iso).getTime()) / DIA) : null;

export function temperatura(l: LinhaTemp, hoje: Date): Temperatura {
  const d = diasSem(l.ultimoContatoEm, hoje);
  if (d === null) return 'morno';                                   // ainda sem histórico → neutro
  if (d > FRIO_DIAS) return 'frio';
  if (l.saude === 'vermelho' && d > VERMELHO_FRIO_DIAS) return 'frio';
  if (d <= QUENTE_DIAS && l.saude !== 'vermelho') return 'quente';
  if (l.jaTeveDepoimento && d <= ENGAJADO_DIAS) return 'quente';
  return 'morno';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pos-venda-termometro.test.ts`
Expected: PASS (6 testes verdes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/pos-venda-termometro.ts tests/pos-venda-termometro.test.ts
git commit -m "feat(pos-venda): termometro do relacionamento (funcao pura + testes)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Sugestão proativa (função pura)

**Files:**
- Create: `src/modules/dashboard/pos-venda-sugestao.ts`
- Test: `tests/pos-venda-sugestao.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/pos-venda-sugestao.test.ts
import { describe, it, expect } from 'vitest';
import { sugestaoProativa, type LinhaSugestao } from '../src/modules/dashboard/pos-venda-sugestao.js';

const HOJE = new Date('2026-06-28T12:00:00Z');
const diasAtras = (n: number) => new Date(HOJE.getTime() - n * 86400000).toISOString();
const base: LinhaSugestao = {
  saude: 'verde', ultimoContatoEm: diasAtras(10), jaTeveDepoimento: true,
  elegivelUpgrade: false, dataInstalacao: '2026-06-01',
};

describe('sugestaoProativa', () => {
  it('saúde vermelha tem prioridade: oferece revisão', () => {
    const s = sugestaoProativa({ ...base, saude: 'vermelho' }, HOJE);
    expect(s?.texto).toMatch(/revis/i);
    expect(s?.pedidoEva).toMatch(/revis/i);
  });
  it('mais de 90 dias sem falar: sugere reativar', () => {
    const s = sugestaoProativa({ ...base, ultimoContatoEm: diasAtras(120) }, HOJE);
    expect(s?.texto).toMatch(/sem falar/i);
  });
  it('elegível a upgrade: sonda ampliação', () => {
    const s = sugestaoProativa({ ...base, elegivelUpgrade: true }, HOJE);
    expect(s?.texto).toMatch(/upgrade|crescer/i);
  });
  it('sem depoimento + verde + instalado há 2+ meses: pede depoimento', () => {
    const s = sugestaoProativa({ ...base, jaTeveDepoimento: false, dataInstalacao: '2026-03-01' }, HOJE);
    expect(s?.texto).toMatch(/depoimento/i);
  });
  it('nada a sugerir agora retorna null', () => {
    const s = sugestaoProativa(base, HOJE);
    expect(s).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pos-venda-sugestao.test.ts`
Expected: FAIL — import não resolve.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/modules/dashboard/pos-venda-sugestao.ts
// Função PURA: o atalho mais útil agora pro cliente (1 só, por prioridade).
// Devolve o texto do chip + o pedido que pré-preenche o chat da Eva no clique.
// Não chama IA: é regra. A IA só escreve a mensagem quando o operador clica.
import type { Saude } from './pos-venda-saude.js';

export interface LinhaSugestao {
  saude: Saude;
  ultimoContatoEm: string | null;
  jaTeveDepoimento: boolean;
  elegivelUpgrade: boolean;
  dataInstalacao: string | null;
}

export interface Sugestao { texto: string; pedidoEva: string }

const DIA = 86400000;
const SEM_FALAR_DIAS = 90;
const DEPOIMENTO_MESES = 2;

const diasSem = (iso: string | null, hoje: Date): number | null =>
  iso ? Math.floor((hoje.getTime() - new Date(iso).getTime()) / DIA) : null;

const mesesDesde = (iso: string | null, hoje: Date): number | null => {
  if (!iso) return null;
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : ''));
  return Number.isNaN(d.getTime()) ? null : (hoje.getTime() - d.getTime()) / (30 * DIA);
};

export function sugestaoProativa(l: LinhaSugestao, hoje: Date): Sugestao | null {
  if (l.saude === 'vermelho') {
    return {
      texto: '💡 Geração caiu — ofereça revisão',
      pedidoEva: 'Escreve um aviso gentil que notei a geração caindo na usina dele e ofereço uma revisão técnica.',
    };
  }
  const d = diasSem(l.ultimoContatoEm, hoje);
  if (d !== null && d > SEM_FALAR_DIAS) {
    return {
      texto: `💡 ${d} dias sem falar — manda um oi`,
      pedidoEva: 'Escreve um oi leve pra reativar o contato com o cliente, sem cobrança.',
    };
  }
  if (l.elegivelUpgrade) {
    return {
      texto: '💡 Pode crescer o sistema — sonde upgrade',
      pedidoEva: 'Escreve uma sondagem leve sobre ampliar o sistema solar dele.',
    };
  }
  const meses = mesesDesde(l.dataInstalacao, hoje);
  if (!l.jaTeveDepoimento && l.saude === 'verde' && meses !== null && meses >= DEPOIMENTO_MESES) {
    return {
      texto: '💡 Bom momento pra pedir depoimento',
      pedidoEva: 'Escreve um pedido de depoimento simpático pro cliente.',
    };
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pos-venda-sugestao.test.ts`
Expected: PASS (5 testes verdes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/pos-venda-sugestao.ts tests/pos-venda-sugestao.test.ts
git commit -m "feat(pos-venda): sugestao proativa por regra (funcao pura + testes)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Agrupamento da agenda (função pura)

**Files:**
- Create: `src/modules/dashboard/pos-venda-agenda.ts`
- Test: `tests/pos-venda-agenda.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/pos-venda-agenda.test.ts
import { describe, it, expect } from 'vitest';
import { agruparAgenda, type TarefaAgenda } from '../src/modules/dashboard/pos-venda-agenda.js';

const HOJE = new Date('2026-06-28T12:00:00Z');
const t = (id: string, dueAt: string | null): TarefaAgenda => ({ id, leadId: 'l' + id, nomeCliente: 'Cliente ' + id, titulo: 'Ligar', dueAt });

describe('agruparAgenda', () => {
  it('separa atrasados, hoje e próximos 7 dias', () => {
    const r = agruparAgenda([
      t('a', '2026-06-20T00:00:00Z'), // atrasado
      t('b', '2026-06-28T09:00:00Z'), // hoje
      t('c', '2026-07-02T00:00:00Z'), // dentro de 7 dias
    ], HOJE);
    expect(r.atrasados.map((x) => x.id)).toEqual(['a']);
    expect(r.hoje.map((x) => x.id)).toEqual(['b']);
    expect(r.semana.map((x) => x.id)).toEqual(['c']);
  });
  it('tarefa sem data entra em "próximos" sem urgência', () => {
    const r = agruparAgenda([t('z', null)], HOJE);
    expect(r.semana.map((x) => x.id)).toEqual(['z']);
  });
  it('tarefa além de 7 dias fica fora da janela', () => {
    const r = agruparAgenda([t('f', '2026-07-20T00:00:00Z')], HOJE);
    expect(r.atrasados).toHaveLength(0);
    expect(r.hoje).toHaveLength(0);
    expect(r.semana).toHaveLength(0);
  });
  it('ordena cada grupo por data crescente', () => {
    const r = agruparAgenda([t('a2', '2026-06-15T00:00:00Z'), t('a1', '2026-06-10T00:00:00Z')], HOJE);
    expect(r.atrasados.map((x) => x.id)).toEqual(['a1', 'a2']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pos-venda-agenda.test.ts`
Expected: FAIL — import não resolve.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/modules/dashboard/pos-venda-agenda.ts
// Função PURA: agrupa as tarefas pendentes em Atrasados / Hoje / Próximos 7 dias.
// Sem I/O. A query (listarAgendaPosVenda) entrega as TarefaAgenda já com o nome do cliente.

export interface TarefaAgenda {
  id: string;
  leadId: string;
  nomeCliente: string;
  titulo: string;
  dueAt: string | null;
}

export interface AgendaAgrupada {
  atrasados: TarefaAgenda[];
  hoje: TarefaAgenda[];
  semana: TarefaAgenda[];
}

const DIA = 86400000;
const diaUTC = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export function agruparAgenda(tarefas: TarefaAgenda[], hoje: Date): AgendaAgrupada {
  const hojeDia = diaUTC(hoje);
  const out: AgendaAgrupada = { atrasados: [], hoje: [], semana: [] };
  for (const tarefa of tarefas) {
    if (!tarefa.dueAt) { out.semana.push(tarefa); continue; } // sem data = sem urgência
    const due = new Date(tarefa.dueAt);
    if (Number.isNaN(due.getTime())) { out.semana.push(tarefa); continue; }
    const dueDia = diaUTC(due);
    if (dueDia < hojeDia) out.atrasados.push(tarefa);
    else if (dueDia === hojeDia) out.hoje.push(tarefa);
    else if (dueDia <= hojeDia + 7 * DIA) out.semana.push(tarefa);
    // além de 7 dias: fora da janela, não entra
  }
  const ord = (a: TarefaAgenda, b: TarefaAgenda) =>
    (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity);
  out.atrasados.sort(ord); out.hoje.sort(ord); out.semana.sort(ord);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pos-venda-agenda.test.ts`
Expected: PASS (4 testes verdes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/pos-venda-agenda.ts tests/pos-venda-agenda.test.ts
git commit -m "feat(pos-venda): agrupamento da agenda (funcao pura + testes)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Query da agenda + campo `elegivelUpgrade` na linha

**Files:**
- Modify: `src/modules/dashboard/pos-venda-queries.ts`

Validação desta camada de dados = `tsc --noEmit` limpo + smoke (padrão das `*-queries.ts`, sem teste unitário).

- [ ] **Step 1: Adicionar `elegivelUpgrade` à interface `PosVendaLinha`**

Em `pos-venda-queries.ts`, dentro de `export interface PosVendaLinha {` adicione a linha (logo após `jaTeveDepoimento: boolean;`):

```ts
  elegivelUpgrade: boolean;
```

- [ ] **Step 2: Preencher `elegivelUpgrade` no push da linha**

Em `listarClientesPosVenda`, no objeto passado pra `linhas.push({ ... })`, adicione `elegivelUpgrade: elegivel,` logo após `jaTeveDepoimento: jaTeve,`. A variável `elegivel` já existe nesse escopo (linha ~106).

```ts
      saude, ultimoContatoEm: contato, jaTeveDepoimento: jaTeve,
      elegivelUpgrade: elegivel,
      semApi: semApiUsina(s),
```

- [ ] **Step 3: Adicionar a query `listarAgendaPosVenda` no fim do arquivo**

```ts
import { agruparAgenda, type AgendaAgrupada, type TarefaAgenda } from './pos-venda-agenda.js';

// Tarefas pendentes (lembretes) dos clientes que estão no pós-venda, agrupadas
// pra agenda lateral. Reusa lead_tarefas. Multi-tenant: só leads da company.
export async function listarAgendaPosVenda(client: SupabaseClient, companyId: string): Promise<AgendaAgrupada> {
  // 1) leads no pós-venda (mesma regra dura da lista): usina ativa em etapa_obra='pos_venda'
  const { data: sistemas } = await client.from('sistemas_clientes')
    .select('lead_id').eq('ativo', true).not('lead_id', 'is', null).eq('etapa_obra', 'pos_venda');
  const leadIds = [...new Set((sistemas ?? []).map((s: any) => s.lead_id))];
  if (leadIds.length === 0) return { atrasados: [], hoje: [], semana: [] };

  // 2) nomes (e filtro de company aqui)
  const { data: leadsData } = await client.from('leads')
    .select('id, name').in('id', leadIds).eq('company_id', companyId);
  const nomes = new Map((leadsData ?? []).map((l: any) => [l.id, l.name as string | null]));
  const idsDaCompany = [...nomes.keys()];
  if (idsDaCompany.length === 0) return { atrasados: [], hoje: [], semana: [] };

  // 3) tarefas pendentes desses leads
  const { data: tarefasData } = await client.from('lead_tarefas')
    .select('id, lead_id, titulo, due_at')
    .in('lead_id', idsDaCompany).eq('status', 'pendente');
  const tarefas: TarefaAgenda[] = (tarefasData ?? []).map((t: any) => ({
    id: t.id, leadId: t.lead_id, titulo: t.titulo,
    nomeCliente: nomes.get(t.lead_id) ?? 'Cliente', dueAt: t.due_at ?? null,
  }));
  return agruparAgenda(tarefas, new Date());
}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erro novo. (Os testes de view vão falhar até a Task 6 atualizar o helper — isso é esperado e tratado lá; rode só o tsc aqui.)

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/pos-venda-queries.ts
git commit -m "feat(pos-venda): query da agenda + elegivelUpgrade na linha

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: View — termômetro + chip de sugestão no card

**Files:**
- Modify: `src/modules/dashboard/pos-venda-views.ts`
- Test: `tests/pos-venda-views.test.ts`

- [ ] **Step 1: Atualizar o helper `linha()` do teste (novo campo) e escrever os asserts**

Em `tests/pos-venda-views.test.ts`, no objeto do helper `linha`, adicione `elegivelUpgrade: false,` após `jaTeveDepoimento: false,`. Depois acrescente este bloco de testes ao arquivo:

```ts
describe('termômetro e sugestão no card', () => {
  const recente = new Date(Date.now() - 5 * 86400000).toISOString();
  const antigo = new Date(Date.now() - 200 * 86400000).toISOString();

  it('mostra termômetro quente pra contato recente e saúde verde', () => {
    const html = renderPosVendaPage([linha({ ultimoContatoEm: recente, saude: 'verde' })], undefined);
    expect(html).toContain('🔥');
  });
  it('mostra chip de sugestão de reativação pra quem sumiu', () => {
    const html = renderPosVendaPage([linha({ ultimoContatoEm: antigo, saude: 'verde' })], undefined);
    expect(html).toContain('🧊');
    expect(html).toMatch(/sem falar/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/pos-venda-views.test.ts`
Expected: FAIL — `🔥` / `sem falar` não estão no HTML ainda.

- [ ] **Step 3: Implementar termômetro + chip na view**

No topo de `pos-venda-views.ts`, adicione os imports:

```ts
import { temperatura } from './pos-venda-termometro.js';
import { sugestaoProativa } from './pos-venda-sugestao.js';
```

Adicione o mapa de ícone do termômetro logo após `const SEMAFORO`:

```ts
const TERMOMETRO: Record<'quente' | 'morno' | 'frio', { ico: string; txt: string }> = {
  quente: { ico: '🔥', txt: 'Relacionamento quente' },
  morno: { ico: '🌤️', txt: 'Relacionamento morno' },
  frio: { ico: '🧊', txt: 'Relacionamento frio — atenção' },
};
```

Dentro de `renderLinha(l)`, no começo da função (antes do `return`), calcule:

```ts
  const agora = new Date();
  const temp = TERMOMETRO[temperatura(l, agora)];
  const sug = sugestaoProativa(l, agora);
  const chip = sug
    ? `<button type="button" class="pv-sugestao-btn block mt-1 text-left text-xs text-indigo-300 hover:text-indigo-100" data-lead-id="${escapeHtml(l.leadId)}" data-pedido="${escapeHtml(sug.pedidoEva)}">${escapeHtml(sug.texto)}</button>`
    : '';
```

No cabeçalho do card (a `<div class="flex flex-wrap items-center gap-x-3 gap-y-1">`), adicione o termômetro logo após o semáforo `<span ...>${s.dot}</span>`:

```ts
      <span class="text-lg" title="${temp.txt}">${temp.ico}</span>
```

E logo após a div da próxima ação (`<div class="mt-1 text-xs text-amber-300">...</div>`), insira o chip:

```ts
    ${chip}
```

- [ ] **Step 4: Implementar o clique do chip (pré-preenche o chat da Eva)**

No bloco de `<script>` que trata `.pv-copiloto-btn` (primeiro IIFE), adicione dentro do IIFE, antes do fechamento `})();`:

```ts
    document.querySelectorAll('.pv-sugestao-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var leadId = btn.dataset.leadId;
        var chat = document.querySelector('.pv-chat[data-lead-id="' + leadId + '"]');
        if (!chat) return;
        chat.classList.remove('hidden');
        var inp = chat.querySelector('.pv-chat-in');
        inp.value = btn.dataset.pedido || '';
        chat.querySelector('.pv-chat-send').click();
      });
    });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/pos-venda-views.test.ts`
Expected: PASS (incluindo os testes antigos + os 2 novos).

- [ ] **Step 6: Commit**

```bash
git add src/modules/dashboard/pos-venda-views.ts tests/pos-venda-views.test.ts
git commit -m "feat(pos-venda): termometro + chip de sugestao no card

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: View — agenda lateral (layout 2 colunas) + nova assinatura

**Files:**
- Modify: `src/modules/dashboard/pos-venda-views.ts`
- Test: `tests/pos-venda-views.test.ts`

- [ ] **Step 1: Escrever o teste da agenda na view**

Acrescente a `tests/pos-venda-views.test.ts`:

```ts
import type { AgendaAgrupada } from '../src/modules/dashboard/pos-venda-agenda.js';

const agendaVazia: AgendaAgrupada = { atrasados: [], hoje: [], semana: [] };

describe('agenda lateral', () => {
  it('renderiza a coluna da agenda com os grupos', () => {
    const agenda: AgendaAgrupada = {
      atrasados: [{ id: 't1', leadId: 'l1', nomeCliente: 'João', titulo: 'Ligar pro João', dueAt: '2026-06-20T00:00:00Z' }],
      hoje: [], semana: [],
    };
    const html = renderPosVendaPage([linha()], undefined, agenda);
    expect(html).toMatch(/Agenda/i);
    expect(html).toContain('Ligar pro João');
    expect(html).toMatch(/Atrasados/i);
  });
  it('funciona sem agenda (compatível com chamada antiga)', () => {
    const html = renderPosVendaPage([linha()], undefined);
    expect(html).toContain('Antonio Carlos');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/pos-venda-views.test.ts`
Expected: FAIL — `renderPosVendaPage` ainda só aceita 2 args / não rende "Agenda".

- [ ] **Step 3: Mudar a assinatura e montar a coluna da agenda**

Troque a assinatura e o corpo de `renderPosVendaPage`. O 3º parâmetro `agenda` é **opcional** (não quebra chamadas antigas). Importe os tipos no topo:

```ts
import type { AgendaAgrupada, TarefaAgenda } from './pos-venda-agenda.js';
```

Adicione um helper de render da agenda antes de `renderPosVendaPage`:

```ts
function renderTarefaAgenda(t: TarefaAgenda): string {
  const data = t.dueAt ? new Date(t.dueAt).toLocaleDateString('pt-BR') : 'sem data';
  return `
  <div class="flex items-start gap-2 text-xs py-1 border-b border-[#1b2040]" data-tarefa-id="${escapeHtml(t.id)}">
    <div class="flex-1">
      <a href="/dashboard/leads/${escapeHtml(t.leadId)}" class="text-cyan-200 hover:underline">${escapeHtml(t.nomeCliente)}</a>
      <div class="text-slate-300">${escapeHtml(t.titulo)} <span class="text-slate-500">· ${escapeHtml(data)}</span></div>
    </div>
    <button type="button" class="pv-tarefa-ok text-emerald-300 hover:text-emerald-100" data-tarefa-id="${escapeHtml(t.id)}" title="Concluir">✓</button>
    <button type="button" class="pv-tarefa-adiar text-slate-400 hover:text-slate-200" data-tarefa-id="${escapeHtml(t.id)}" data-dias="1" title="Adiar 1 dia">+1d</button>
    <button type="button" class="pv-tarefa-adiar text-slate-400 hover:text-slate-200" data-tarefa-id="${escapeHtml(t.id)}" data-dias="7" title="Adiar 7 dias">+7d</button>
  </div>`;
}

function grupoAgenda(titulo: string, cor: string, itens: TarefaAgenda[]): string {
  if (itens.length === 0) return '';
  return `<div class="mb-3"><div class="text-xs font-semibold ${cor} mb-1">${titulo} (${itens.length})</div>${itens.map(renderTarefaAgenda).join('')}</div>`;
}

function renderAgenda(agenda: AgendaAgrupada): string {
  const vazia = !agenda.atrasados.length && !agenda.hoje.length && !agenda.semana.length;
  const corpo = vazia
    ? `<div class="text-xs text-slate-500 py-4">Nenhum lembrete por aqui. Use ➕ Lembrete num cliente.</div>`
    : grupoAgenda('🔴 Atrasados', 'text-rose-300', agenda.atrasados)
      + grupoAgenda('🟡 Hoje', 'text-amber-300', agenda.hoje)
      + grupoAgenda('🔵 Próximos 7 dias', 'text-cyan-300', agenda.semana);
  return `
  <aside class="pv-agenda bg-[#0b0e1f] border border-[#1b2040] rounded-xl p-3 lg:sticky lg:top-4 lg:w-80 lg:shrink-0">
    <h2 class="text-sm font-bold text-cyan-300 mb-2">🗓️ Agenda</h2>
    ${corpo}
  </aside>`;
}
```

Reescreva `renderPosVendaPage` assim (assinatura + body em 2 colunas):

```ts
export function renderPosVendaPage(linhas: PosVendaLinha[], user?: DashUser, agenda?: AgendaAgrupada): string {
  const lista = linhas.length
    ? linhas.map(renderLinha).join('')
    : `<div class="text-slate-400 text-center py-16">Nenhum cliente com usina ainda. Quando houver usinas vinculadas, eles aparecem aqui.</div>`;
  const agendaHtml = renderAgenda(agenda ?? { atrasados: [], hoje: [], semana: [] });

  const body = `
  <style>
    @keyframes pvPulse { 0%,100%{box-shadow:0 0 0 0 rgba(244,63,94,0)} 50%{box-shadow:0 0 0 3px rgba(244,63,94,.35)} }
    .pv-urgent{ animation:pvPulse 1.8s ease-in-out infinite }
    @media (prefers-reduced-motion: reduce){ .pv-urgent{ animation:none; box-shadow:0 0 0 2px rgba(244,63,94,.4) } }
  </style>
  <div>
    <h1 class="text-xl font-bold text-cyan-300 mb-1">❤️ Pós-venda / Relacionamento</h1>
    <p class="text-xs text-slate-400 mb-4">Os que <b class="text-rose-400">pulsam em vermelho</b> precisam de atenção. O botão destacado é a próxima ação sugerida.</p>
    <div class="flex flex-col lg:flex-row gap-4 items-start">
      <div class="flex-1 min-w-0 order-2 lg:order-1">${lista}</div>
      <div class="w-full lg:w-auto order-1 lg:order-2">${agendaHtml}</div>
    </div>
  </div>`;
```

(O restante de `renderPosVendaPage` — as `const scripts` e o `return renderLayout(...)` — fica como está.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/pos-venda-views.test.ts`
Expected: PASS (todos, incluindo os de agenda).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/pos-venda-views.ts tests/pos-venda-views.test.ts
git commit -m "feat(pos-venda): agenda lateral (layout 2 colunas)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: View — painel de notas + histórico + botão Lembrete no card

**Files:**
- Modify: `src/modules/dashboard/pos-venda-views.ts`
- Test: `tests/pos-venda-views.test.ts`

- [ ] **Step 1: Escrever o teste dos novos botões no card**

Acrescente a `tests/pos-venda-views.test.ts`:

```ts
describe('notas/histórico e lembrete no card', () => {
  it('card tem botão de notas e de lembrete', () => {
    const html = renderPosVendaPage([linha()], undefined);
    expect(html).toMatch(/Notas/i);
    expect(html).toMatch(/Lembrete/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pos-venda-views.test.ts`
Expected: FAIL — "Notas" / "Lembrete" ainda não no HTML.

- [ ] **Step 3: Adicionar os botões + painéis no card (em `renderLinha`)**

Logo após o botão `pv-copiloto-btn` (a linha `<button ...>💬 Eva (copiloto)</button>`), insira:

```ts
    <button type="button" class="pv-notas-btn text-xs text-amber-200 hover:text-amber-100 mt-1 ml-2" data-lead-id="${escapeHtml(l.leadId)}">📓 Notas / Histórico</button>
    <button type="button" class="pv-lembrete-btn text-xs text-cyan-200 hover:text-cyan-100 mt-1 ml-2" data-lead-id="${escapeHtml(l.leadId)}">➕ Lembrete</button>
    <div class="pv-lembrete-form hidden mt-2 bg-[#0b0e1f] border border-[#1b2040] rounded-lg p-2" data-lead-id="${escapeHtml(l.leadId)}">
      <input type="text" class="pv-lembrete-titulo w-full text-xs bg-[#11152e] text-slate-100 border border-[#1b2040] rounded p-1.5" placeholder="Ex: ligar pro cliente sobre a revisão" maxlength="200" />
      <div class="flex items-center gap-2 mt-1">
        <input type="date" class="pv-lembrete-data text-xs bg-[#11152e] text-slate-100 border border-[#1b2040] rounded p-1" />
        <button type="button" class="pv-lembrete-salvar text-xs bg-cyan-600 text-white rounded px-2 py-1 hover:bg-cyan-500">Salvar</button>
        <span class="pv-lembrete-status text-xs"></span>
      </div>
    </div>
    <div class="pv-notas hidden mt-2 bg-[#0b0e1f] border border-amber-600/30 rounded-lg p-2" data-lead-id="${escapeHtml(l.leadId)}">
      <textarea class="pv-nota-in w-full text-xs bg-[#11152e] text-slate-100 border border-[#1b2040] rounded p-1.5" rows="2" placeholder="Nota interna (não vai pro cliente). Ex: prefere ser contactado de manhã" maxlength="1000"></textarea>
      <div class="flex items-center gap-2 mt-1">
        <button type="button" class="pv-nota-salvar text-xs bg-amber-600 text-white rounded px-2 py-1 hover:bg-amber-500">Salvar nota</button>
        <span class="pv-nota-status text-xs"></span>
      </div>
      <div class="text-[11px] text-slate-400 mt-2 mb-1">Histórico</div>
      <div class="pv-historico text-xs text-slate-300">Carregando…</div>
    </div>
```

- [ ] **Step 4: Adicionar o JS dos botões (novo bloco `<script>` no fim de `scripts`)**

No fim da string `scripts` (antes do `` ` `` que a fecha), adicione mais um bloco:

```ts
  <script>
(function () {
  function toggle(sel, leadId) { var el = document.querySelector(sel + '[data-lead-id="' + leadId + '"]'); if (el) el.classList.toggle('hidden'); return el; }
  document.querySelectorAll('.pv-lembrete-btn').forEach(function (b) {
    b.addEventListener('click', function () { toggle('.pv-lembrete-form', b.dataset.leadId); });
  });
  document.querySelectorAll('.pv-lembrete-salvar').forEach(function (b) {
    b.addEventListener('click', function () {
      var form = b.closest('.pv-lembrete-form'); var leadId = form.dataset.leadId;
      var titulo = (form.querySelector('.pv-lembrete-titulo').value || '').trim();
      var data = form.querySelector('.pv-lembrete-data').value || '';
      var status = form.querySelector('.pv-lembrete-status');
      if (!titulo) { status.textContent = 'Escreva o lembrete.'; status.className = 'pv-lembrete-status text-xs text-rose-300'; return; }
      b.disabled = true; status.textContent = 'Salvando…'; status.className = 'pv-lembrete-status text-xs text-slate-300';
      fetch('/dashboard/pos-venda/' + leadId + '/lembrete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: titulo, dueAt: data || null })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) { status.textContent = '✅ Na agenda! Recarregue pra ver.'; status.className = 'pv-lembrete-status text-xs text-emerald-300'; }
        else { status.textContent = d.erro || 'erro'; status.className = 'pv-lembrete-status text-xs text-rose-300'; b.disabled = false; }
      }).catch(function () { status.textContent = 'Falha de conexão.'; b.disabled = false; });
    });
  });
  document.querySelectorAll('.pv-notas-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var painel = toggle('.pv-notas', b.dataset.leadId);
      if (painel && !painel.classList.contains('hidden')) carregarHistorico(b.dataset.leadId, painel);
    });
  });
  function carregarHistorico(leadId, painel) {
    var alvo = painel.querySelector('.pv-historico');
    fetch('/dashboard/pos-venda/' + leadId + '/historico').then(function (r) { return r.json(); }).then(function (d) {
      var itens = (d && d.itens) || [];
      if (!itens.length) { alvo.textContent = 'Sem histórico ainda.'; return; }
      alvo.innerHTML = itens.map(function (i) {
        var data = new Date(i.created_at).toLocaleDateString('pt-BR');
        return '<div class="py-0.5 border-b border-[#1b2040]"><span class="text-slate-500">' + data + '</span> · ' +
          (i.titulo ? i.titulo.replace(/</g,'&lt;') : '') + (i.descricao ? ' — ' + i.descricao.replace(/</g,'&lt;') : '') + '</div>';
      }).join('');
    }).catch(function () { alvo.textContent = 'Falha ao carregar histórico.'; });
  }
  document.querySelectorAll('.pv-nota-salvar').forEach(function (b) {
    b.addEventListener('click', function () {
      var painel = b.closest('.pv-notas'); var leadId = painel.dataset.leadId;
      var texto = (painel.querySelector('.pv-nota-in').value || '').trim();
      var status = painel.querySelector('.pv-nota-status');
      if (!texto) { status.textContent = 'Escreva a nota.'; status.className = 'pv-nota-status text-xs text-rose-300'; return; }
      b.disabled = true; status.textContent = 'Salvando…'; status.className = 'pv-nota-status text-xs text-slate-300';
      fetch('/dashboard/pos-venda/' + leadId + '/nota', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: texto })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) { status.textContent = '✅ Salva!'; status.className = 'pv-nota-status text-xs text-emerald-300'; painel.querySelector('.pv-nota-in').value = ''; carregarHistorico(leadId, painel); }
        else { status.textContent = d.erro || 'erro'; status.className = 'pv-nota-status text-xs text-rose-300'; b.disabled = false; }
      }).catch(function () { status.textContent = 'Falha de conexão.'; b.disabled = false; })
        .finally(function () { b.disabled = false; });
    });
  }
  document.querySelectorAll('.pv-tarefa-ok').forEach(function (b) {
    b.addEventListener('click', function () {
      b.disabled = true;
      fetch('/dashboard/pos-venda/tarefa/' + b.dataset.tarefaId + '/concluir', { method: 'POST' })
        .then(function (r) { return r.json(); }).then(function (d) {
          if (d.ok) { var row = b.closest('[data-tarefa-id]'); if (row) row.remove(); } else b.disabled = false;
        }).catch(function () { b.disabled = false; });
    });
  });
  document.querySelectorAll('.pv-tarefa-adiar').forEach(function (b) {
    b.addEventListener('click', function () {
      b.disabled = true;
      fetch('/dashboard/pos-venda/tarefa/' + b.dataset.tarefaId + '/adiar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dias: Number(b.dataset.dias) || 1 })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) { var row = b.closest('[data-tarefa-id]'); if (row) row.remove(); } else b.disabled = false;
      }).catch(function () { b.disabled = false; });
    });
  });
})();
  </script>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/pos-venda-views.test.ts`
Expected: PASS (todos).

- [ ] **Step 6: Commit**

```bash
git add src/modules/dashboard/pos-venda-views.ts tests/pos-venda-views.test.ts
git commit -m "feat(pos-venda): painel de notas/historico + botao lembrete no card

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Router — endpoints (lembrete, concluir, adiar, nota, histórico) + carregar agenda no GET

**Files:**
- Modify: `src/modules/dashboard/router.ts`

Validação: `tsc --noEmit` limpo + smoke (padrão dos endpoints existentes do pós-venda).

- [ ] **Step 1: Carregar a agenda no `GET /pos-venda`**

No handler `router.get('/pos-venda', ...)` (linha ~1334), troque o corpo do `try` por:

```ts
      const { listarAgendaPosVenda } = await import('./pos-venda-queries.js');
      const [linhas, agenda] = await Promise.all([
        listarClientesPosVenda(supabase, req.dashUser!.companyId),
        listarAgendaPosVenda(supabase, req.dashUser!.companyId),
      ]);
      res.type('text/html').send(renderPosVendaPage(linhas, req.dashUser, agenda));
```

- [ ] **Step 2: Adicionar os 5 endpoints (logo após o handler `/pos-venda/:leadId/acao`)**

Cole este bloco depois do fechamento do handler `acao` (procure pelo `});` que fecha `router.post('/pos-venda/:leadId/acao', ...)`). Usa helpers já importados no arquivo (`registrarAtividade`, `UUID_RE`) e os de `tarefas.ts`/`atividades.ts` via import dinâmico:

```ts
  // Cria um lembrete na agenda do cliente (lead_tarefas, tipo custom).
  router.post('/pos-venda/:leadId/lembrete', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    const leadId = String(req.params.leadId);
    if (!UUID_RE.test(leadId)) return res.status(400).json({ erro: 'id inválido' });
    const titulo = String(req.body?.titulo ?? '').trim().slice(0, 200);
    if (!titulo) return res.status(400).json({ erro: 'Título vazio.' });
    const dueRaw = req.body?.dueAt ? String(req.body.dueAt) : null;
    const dueAt = dueRaw ? new Date(dueRaw + (dueRaw.length === 10 ? 'T12:00:00Z' : '')).toISOString() : null;
    try {
      const companyId = req.dashUser!.companyId;
      const { data: lead } = await supabase.from('leads').select('id')
        .eq('id', leadId).eq('company_id', companyId).maybeSingle();
      if (!lead) return res.status(404).json({ erro: 'Cliente não encontrado.' });
      const { criarTarefa } = await import('./tarefas.js');
      await criarTarefa(supabase, {
        company_id: companyId, lead_id: leadId, titulo, tipo: 'custom',
        due_at: dueAt, prioridade: 'media', automatica: false, created_by: req.dashUser!.id,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[pos-venda/lembrete]', err);
      res.status(500).json({ erro: 'Falha ao salvar lembrete.' });
    }
  });

  // Conclui um lembrete da agenda. Anti-IDOR: a tarefa precisa ser de um lead do pós-venda da company.
  router.post('/pos-venda/tarefa/:id/concluir', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).json({ erro: 'id inválido' });
    try {
      const leadId = await leadDaTarefaNaCompany(supabase, id, req.dashUser!.companyId);
      if (!leadId) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
      const { concluirTarefa } = await import('./tarefas.js');
      await concluirTarefa(supabase, id, req.dashUser!.id, leadId);
      res.json({ ok: true });
    } catch (err) {
      console.error('[pos-venda/tarefa/concluir]', err);
      res.status(500).json({ erro: 'Falha ao concluir.' });
    }
  });

  // Adia um lembrete (+N dias). Mesmo anti-IDOR.
  router.post('/pos-venda/tarefa/:id/adiar', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).json({ erro: 'id inválido' });
    const dias = Math.min(Math.max(Number(req.body?.dias) || 1, 1), 30);
    try {
      const leadId = await leadDaTarefaNaCompany(supabase, id, req.dashUser!.companyId);
      if (!leadId) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
      const { adiarTarefa } = await import('./tarefas.js');
      await adiarTarefa(supabase, id, dias, leadId);
      res.json({ ok: true });
    } catch (err) {
      console.error('[pos-venda/tarefa/adiar]', err);
      res.status(500).json({ erro: 'Falha ao adiar.' });
    }
  });

  // Grava uma nota interna do cliente (lead_atividades tipo nota). NÃO vai pro cliente.
  router.post('/pos-venda/:leadId/nota', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    const leadId = String(req.params.leadId);
    if (!UUID_RE.test(leadId)) return res.status(400).json({ erro: 'id inválido' });
    const texto = String(req.body?.texto ?? '').trim().slice(0, 1000);
    if (!texto) return res.status(400).json({ erro: 'Nota vazia.' });
    try {
      const companyId = req.dashUser!.companyId;
      const { data: lead } = await supabase.from('leads').select('id')
        .eq('id', leadId).eq('company_id', companyId).maybeSingle();
      if (!lead) return res.status(404).json({ erro: 'Cliente não encontrado.' });
      await registrarAtividade(supabase, {
        company_id: companyId, lead_id: leadId, tipo: 'nota',
        titulo: 'Nota interna', descricao: texto, automatica: false, user_id: req.dashUser!.id,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[pos-venda/nota]', err);
      res.status(500).json({ erro: 'Falha ao salvar nota.' });
    }
  });

  // Linha do tempo (repositório) do cliente: notas + envios + contatos.
  router.get('/pos-venda/:leadId/historico', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    const leadId = String(req.params.leadId);
    if (!UUID_RE.test(leadId)) return res.status(400).json({ erro: 'id inválido' });
    try {
      const companyId = req.dashUser!.companyId;
      const { data: lead } = await supabase.from('leads').select('id')
        .eq('id', leadId).eq('company_id', companyId).maybeSingle();
      if (!lead) return res.status(404).json({ erro: 'Cliente não encontrado.' });
      const { listarTimeline } = await import('./atividades.js');
      const itens = await listarTimeline(supabase, leadId, 50);
      res.json({ itens });
    } catch (err) {
      console.error('[pos-venda/historico]', err);
      res.status(500).json({ erro: 'Falha ao carregar histórico.' });
    }
  });
```

- [ ] **Step 3: Adicionar o helper anti-IDOR `leadDaTarefaNaCompany`**

No mesmo arquivo `router.ts`, fora dos handlers (perto do topo do módulo, junto de outros helpers, ou logo antes da função que registra as rotas), adicione:

```ts
// Retorna o lead_id da tarefa SE ela pertence a um lead da company; senão null.
async function leadDaTarefaNaCompany(supabase: SupabaseClient, tarefaId: string, companyId: string): Promise<string | null> {
  const { data: tarefa } = await supabase.from('lead_tarefas').select('lead_id').eq('id', tarefaId).maybeSingle();
  const leadId = (tarefa as { lead_id: string } | null)?.lead_id;
  if (!leadId) return null;
  const { data: lead } = await supabase.from('leads').select('id').eq('id', leadId).eq('company_id', companyId).maybeSingle();
  return lead ? leadId : null;
}
```

Se `SupabaseClient` ainda não estiver importado em `router.ts`, adicione ao import de `@supabase/supabase-js`: `import type { SupabaseClient } from '@supabase/supabase-js';`

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erro novo.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/router.ts
git commit -m "feat(pos-venda): endpoints de lembrete, agenda, nota e historico

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Verificação final + PR

**Files:** nenhum novo — verificação.

- [ ] **Step 1: tsc limpo**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 2: Suíte completa verde**

Run: `npx vitest run`
Expected: tudo verde, **exceto** as 2 falhas pré-existentes em `tests/supabase-vincular-novo.test.ts` (documentadas no CLAUDE.md, não são nossas).

- [ ] **Step 3: Code review do diff (3 passadas — preferência do Junior)**

Rode 3 revisões do diff (`git diff main...HEAD`) procurando: multi-tenant (todo acesso filtra company?), anti-IDOR nos endpoints de tarefa, escape de HTML na view, nenhum texto interno vazando pro cliente. Corrija o que achar e recommite.

- [ ] **Step 4: Push + abrir PR (só com OK do Junior)**

```bash
git push origin feat/copiloto-posvenda-fechamento
gh pr create --title "Copiloto pós-venda: agenda, notas, sugestão proativa, termômetro/repositório" --body "Fecha os 4 itens finais do copiloto. Sem tabela nova (reusa lead_tarefas e lead_atividades). Spec e plano em docs/superpowers/."
```

**Lembrete:** não pushar sem o Junior autorizar. Deploy é manual no EasyPanel (publica a `main`).

---

## Self-Review (preenchido na escrita do plano)

- **Cobertura do spec:** agenda (Tasks 3,4,6,8) · lembrete na mão (7,8) · notas (7,8) · sugestão proativa (2,5) · termômetro (1,5) · repositório/histórico (7,8) · layout 2 colunas (6) · só no pós-venda (sem mudança em /leads). ✓
- **Sem tabela nova:** confirmado — só `lead_tarefas` e `lead_atividades`. ✓
- **Consistência de tipos:** `PosVendaLinha.elegivelUpgrade` (Task 4) consumido por `sugestaoProativa` via `LinhaSugestao` (Task 2/5); `AgendaAgrupada`/`TarefaAgenda` definidos na Task 3 e usados em 4,6,8; `temperatura` retorna `'quente'|'morno'|'frio'` casado com o mapa `TERMOMETRO` (Task 5). ✓
- **Sem placeholders:** todos os steps têm código real. ✓
