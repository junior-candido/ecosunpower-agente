# Financeiro Peça 2 — Imposto "tem nota?" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Entradas são "com nota" por padrão (taxadas como hoje); quando o Junior fala "sem nota", a entrada vira caixa-only (sem imposto/RBT12) e o painel mostra caixa real × faturado.

**Architecture:** Uma coluna `tem_nota` (default true). "Sem nota" desvia a entrada PJ do motor de imposto pelo caminho de confirmação simples que JÁ existe — o motor da Fatia 2 não muda. O painel soma as entradas sem nota de volta no "entrou (caixa real)".

**Tech Stack:** TypeScript ESM, Vitest (`npm test`), Supabase. Migration aplicada manualmente pelo Junior (MCP aponta pro projeto errado).

Spec: `docs/superpowers/specs/2026-06-16-financeiro-imposto-tem-nota-design.md`

---

## Estrutura de arquivos
- `supabase/migrations/051_financeiro_tem_nota.sql` (novo) + cópia `Desktop\migration-051-tem-nota.sql`.
- `src/modules/financeiro/extrator-lancamento.ts` — campo `tem_nota` + parse + prompt.
- `src/modules/financeiro/lancamentos-repo.ts` — `tem_nota` em `LancamentoRow`/`COLS`/`criarPendente`.
- `src/modules/financeiro/caixa-entrada.ts` — `entradaPrecisaImposto` (puro) + roteamento + mensagem.
- `src/modules/dashboard/caixa-kpis.ts` — `tem_nota` em `LancamentoKpi` + caixa real × faturado + lucro.
- `src/modules/dashboard/financeiro-queries.ts` — passar `tem_nota` no lancMes; expor faturado/entrou/diferença.
- `src/modules/dashboard/financeiro-views.ts` — mostrar os 2 números + selo "sem nota".
- Testes: `financeiro-extrator.test.ts`, `financeiro-caixa-planejar.test.ts` (ou novo `financeiro-entrada-imposto.test.ts`), `financeiro-caixa-kpis.test.ts`.

---

## Task 1: Migration 051 (coluna tem_nota)

**Files:** Create `supabase/migrations/051_financeiro_tem_nota.sql`

- [ ] **Step 1: Criar o arquivo de migration** com:
```sql
-- 051_financeiro_tem_nota.sql
-- Peça 2: entrada "sem nota" = caixa apenas, fora do imposto.
-- Default true => todo o histórico e o caminho padrão continuam "com nota".
ALTER TABLE financeiro_lancamentos
  ADD COLUMN IF NOT EXISTS tem_nota boolean NOT NULL DEFAULT true;
```

- [ ] **Step 2: Copiar pro Desktop** (linhas curtas, pro Junior colar no SQL Editor):
Criar `C:\Users\Meu Computador\Desktop\migration-051-tem-nota.sql` com o mesmo conteúdo.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/051_financeiro_tem_nota.sql
git commit -m "feat(financeiro): migration 051 coluna tem_nota (default true)"
```
(Junior aplica no SQL Editor do projeto `kupnsoyymulbdzakqlqc` ANTES do deploy.)

---

## Task 2: Extrator entende "sem nota"

**Files:** Modify `src/modules/financeiro/extrator-lancamento.ts`; Test `tests/financeiro-extrator.test.ts`

- [ ] **Step 1: Testes que falham** — adicionar em `tests/financeiro-extrator.test.ts` (no describe do parseLancamentos):
```ts
it('entrada "sem nota" → tem_nota false', () => {
  const r = parseLancamentos('{"financeiro":true,"intencao":"lancar","tipo":"entrada","valor":5000,"tem_nota":false}');
  expect(r[0].tem_nota).toBe(false);
});
it('entrada normal → tem_nota true (default)', () => {
  const r = parseLancamentos('{"financeiro":true,"intencao":"lancar","tipo":"entrada","valor":5000}');
  expect(r[0].tem_nota).toBe(true);
});
it('tem_nota só é false com false explícito (qualquer outra coisa = true)', () => {
  const r = parseLancamentos('{"financeiro":true,"intencao":"lancar","tipo":"entrada","valor":1,"tem_nota":"sei la"}');
  expect(r[0].tem_nota).toBe(true);
});
```
E um teste de prompt no describe de prompts:
```ts
it('prompt explica a regra de sem nota', () => {
  expect(montarPromptExtracaoTexto('x', '2026-06-16').toLowerCase()).toContain('sem nota');
});
```

- [ ] **Step 2: Rodar e ver falhar:** `npm test -- financeiro-extrator`.

- [ ] **Step 3: Implementar.**
(a) Na interface `ExtracaoLancamento`, adicionar campo: `tem_nota: boolean;` (logo após `relacionado`).
(b) Em `normalizarItem`, no objeto de retorno, adicionar: `tem_nota: obj.tem_nota === false ? false : true,` (default true; só false explícito vira false).
(c) Em `REGRAS_COMUNS`, dentro da lista de chaves do JSON, adicionar `"tem_nota"`: trocar a linha do `campos_faltando` para incluir antes dela:
```
 "tem_nota": true/false (só entradas; false quando a pessoa disser SEM NOTA / por fora / sem comprovante / não vou dar nota; senão true),
```
e adicionar uma REGRA nova ao final dos bullets:
```
- tem_nota: padrão TRUE. Só marque FALSE numa ENTRADA quando a pessoa deixar claro que é "sem nota"/"por fora"/"sem comprovante"/"não vou dar nota". Despesa: ignore (deixe true).
```

- [ ] **Step 4: Rodar e ver passar:** `npm test -- financeiro-extrator` (novos + antigos verdes).

- [ ] **Step 5: Commit**
```bash
git add src/modules/financeiro/extrator-lancamento.ts tests/financeiro-extrator.test.ts
git commit -m "feat(financeiro): extrator entende entrada sem nota (tem_nota)"
```

---

## Task 3: Repo grava/lê tem_nota

**Files:** Modify `src/modules/financeiro/lancamentos-repo.ts`

(Camada I/O — verificação por tsc + suíte; sem teste unitário próprio.)

- [ ] **Step 1: `LancamentoRow`** — adicionar `tem_nota: boolean;` (após `conta_id`).
- [ ] **Step 2: `COLS`** — adicionar `tem_nota` na string de colunas.
- [ ] **Step 3: `criarPendente`** — no parâmetro objeto adicionar `temNota: boolean;` e no `.insert({...})` adicionar `tem_nota: l.temNota,`.
- [ ] **Step 4: Build:** `npx tsc --noEmit` (vai acusar `caixa-entrada.ts` em `criarPendente` faltando `temNota` — esperado, corrigido na Task 4).
- [ ] **Step 5: Commit**
```bash
git add src/modules/financeiro/lancamentos-repo.ts
git commit -m "feat(financeiro): persistir tem_nota no lançamento"
```

---

## Task 4: Roteamento "sem nota" no orquestrador

**Files:** Modify `src/modules/financeiro/caixa-entrada.ts`; Test `tests/financeiro-entrada-imposto.test.ts` (novo)

- [ ] **Step 1: Teste do helper puro** — criar `tests/financeiro-entrada-imposto.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { entradaPrecisaImposto } from '../src/modules/financeiro/caixa-entrada.js';

describe('entradaPrecisaImposto', () => {
  it('entrada PJ com nota e sem conta → precisa imposto (atividade)', () => {
    expect(entradaPrecisaImposto({ tipo: 'entrada', pf_pj: 'PJ', conta_id: null, tem_nota: true })).toBe(true);
  });
  it('entrada PJ SEM nota → não precisa (caixa apenas)', () => {
    expect(entradaPrecisaImposto({ tipo: 'entrada', pf_pj: 'PJ', conta_id: null, tem_nota: false })).toBe(false);
  });
  it('despesa nunca precisa', () => {
    expect(entradaPrecisaImposto({ tipo: 'despesa', pf_pj: 'PJ', conta_id: null, tem_nota: true })).toBe(false);
  });
  it('entrada PF nunca precisa', () => {
    expect(entradaPrecisaImposto({ tipo: 'entrada', pf_pj: 'PF', conta_id: null, tem_nota: true })).toBe(false);
  });
  it('entrada já vinculada a conta não precisa de novo gate', () => {
    expect(entradaPrecisaImposto({ tipo: 'entrada', pf_pj: 'PJ', conta_id: 'x', tem_nota: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar:** `npm test -- financeiro-entrada-imposto`.

- [ ] **Step 3: Implementar o helper puro** — em `caixa-entrada.ts`, perto de `planejarCaptura`:
```ts
// PURO: uma entrada PJ com nota, ainda sem conta, precisa passar pelo motor de imposto (atividade).
// Sem nota / despesa / PF / já vinculada → não passa (vira só caixa, ou já tratada).
export function entradaPrecisaImposto(row: { tipo: 'despesa' | 'entrada'; pf_pj: 'PF' | 'PJ' | null; conta_id: string | null; tem_nota: boolean }): boolean {
  return row.tipo === 'entrada' && row.pf_pj === 'PJ' && !row.conta_id && row.tem_nota !== false;
}
```

- [ ] **Step 4: `criarPendenteEFalar` passa a flag** — na chamada `criarPendente(deps.supabase, {...})`, adicionar `temNota: e.tem_nota,` ao objeto.

- [ ] **Step 5: `mandarResumo` não oferece vínculo/atividade quando sem nota** — no início do bloco `if (row.tipo === 'entrada' && row.pf_pj === 'PJ') {` (linha ~130), trocar a condição para `if (row.tipo === 'entrada' && row.pf_pj === 'PJ' && row.tem_nota !== false) {` — assim a entrada sem nota cai direto no card de confirmação simples (montarResumoPendente).

- [ ] **Step 6: gate do `conf` usa o helper** — em `handleFinlanButton` caso `conf`, trocar a linha `if (row.tipo === 'entrada' && row.pf_pj === 'PJ' && !row.conta_id) {` por `if (entradaPrecisaImposto(row)) {`.

- [ ] **Step 7: mensagem de confirmação sem nota** — na linha do `sendText` de confirmação do `conf` (a que diz `💰 Entrada lançada: ...`), trocar por:
```ts
if (ok) {
  const msgEntrada = row.tem_nota === false
    ? `💰 Entrada lançada: ${brl(Number(row.valor))} (sem nota — fora do imposto).`
    : `💰 Entrada lançada: ${brl(Number(row.valor))}.`;
  await deps.sendText(from, row.tipo === 'despesa' ? `💸 Lançado: ${brl(Number(row.valor))}. Tá no caixa.` : msgEntrada);
} else await deps.sendText(from, 'Esse lançamento já tinha sido processado.');
```

- [ ] **Step 8: Build + testes:** `npx tsc --noEmit` (zero erros agora) e `npm test -- financeiro-entrada-imposto` (verde). Suíte cheia: só as 2 falhas pré-existentes.

- [ ] **Step 9: Commit**
```bash
git add src/modules/financeiro/caixa-entrada.ts tests/financeiro-entrada-imposto.test.ts
git commit -m "feat(financeiro): entrada sem nota vira caixa-only (desvia do motor de imposto)"
```

---

## Task 5: Painel mostra caixa real × faturado

**Files:** Modify `src/modules/dashboard/caixa-kpis.ts`, `src/modules/dashboard/financeiro-queries.ts`, `src/modules/dashboard/financeiro-views.ts`; Test `tests/financeiro-caixa-kpis.test.ts`

- [ ] **Step 1: Testes que falham** — adicionar em `tests/financeiro-caixa-kpis.test.ts`:
```ts
it('entrada PJ sem nota soma no caixa real e no lucro, mas não no faturado', () => {
  const k = calcularKpisCaixa({
    recebidoMesPj: 10000, impostoMes: 850,
    lancamentosMes: [
      { tipo: 'entrada', valor: 3000, pf_pj: 'PJ', tem_nota: false, categoriaNome: null, categoriaSlug: null },
      { tipo: 'despesa', valor: 1000, pf_pj: 'PJ', tem_nota: true, categoriaNome: 'Material', categoriaSlug: 'material' },
    ],
  });
  expect(k.faturadoMesPj).toBe(10000);          // só com nota
  expect(k.entrouMesPjCaixa).toBe(13000);       // faturado + sem nota
  expect(k.entrouSemNotaPj).toBe(3000);
  expect(k.lucroMes).toBe(11150);               // 13000 - 1000 - 850
});
it('entrada PJ COM nota não soma de novo no caixa (já está em recebidoMesPj)', () => {
  const k = calcularKpisCaixa({
    recebidoMesPj: 5000, impostoMes: 0,
    lancamentosMes: [{ tipo: 'entrada', valor: 5000, pf_pj: 'PJ', tem_nota: true, categoriaNome: null, categoriaSlug: null }],
  });
  expect(k.entrouMesPjCaixa).toBe(5000);
  expect(k.entrouSemNotaPj).toBe(0);
});
```

- [ ] **Step 2: Rodar e ver falhar:** `npm test -- financeiro-caixa-kpis`.

- [ ] **Step 3: Implementar em `caixa-kpis.ts`.**
(a) `LancamentoKpi` ganha `tem_nota: boolean;`.
(b) `KpisCaixa` ganha `faturadoMesPj: number; entrouMesPjCaixa: number; entrouSemNotaPj: number;`.
(c) No corpo, após calcular `saiuParaLucro`:
```ts
  const entrouSemNotaPj = r2(args.lancamentosMes
    .filter((l) => l.tipo === 'entrada' && l.pf_pj === 'PJ' && l.tem_nota === false)
    .reduce((s, l) => s + Number(l.valor), 0));
  const entrouMesPjCaixa = r2(args.recebidoMesPj + entrouSemNotaPj);
```
(d) Trocar o `lucroMes` para usar o caixa real: `lucroMes: r2(entrouMesPjCaixa - saiuParaLucro - args.impostoMes),`.
(e) Adicionar ao objeto retornado: `faturadoMesPj: r2(args.recebidoMesPj), entrouMesPjCaixa, entrouSemNotaPj,`.

- [ ] **Step 4: Rodar e ver passar:** `npm test -- financeiro-caixa-kpis`.

- [ ] **Step 5: `financeiro-queries.ts` passa tem_nota.** No select de `lancMes` (linha ~85) adicionar `tem_nota`:
`.select('tipo, valor, pf_pj, tem_nota, financeiro_categorias(nome, slug)')`
e no `.map` incluir `tem_nota: Boolean((x as any).tem_nota)` no objeto (e tipar o `x` com `tem_nota: boolean`). Garantir que `calcularKpisCaixa` recebe os novos campos (já recebe via lancMes). Expor no retorno de `getFinanceiroData` os novos KPIs (`faturadoMesPj`, `entrouMesPjCaixa`, `entrouSemNotaPj`) — adicioná-los ao objeto retornado (ler o `caixa` que já é desestruturado/retornado e incluir os novos campos no tipo `FinanceiroData`).

- [ ] **Step 6: `financeiro-views.ts` mostra os números.** Localizar onde os KPIs de entrada/faturamento são renderizados e adicionar dois cartões/linhas: **💰 Entrou (caixa real)** = `entrouMesPjCaixa`; **🧾 Faturado (base imposto)** = `faturadoMesPj`; e, se `entrouSemNotaPj > 0`, uma linha **"Por fora (sem nota): R$ X"**. Seguir o estilo dark-neon dos cartões existentes (copiar o markup de um KPI vizinho). LER a view antes pra casar o padrão.

- [ ] **Step 7: Build + suíte:** `npx tsc --noEmit` zero; `npm test` só as 2 falhas pré-existentes.

- [ ] **Step 8: Commit**
```bash
git add src/modules/dashboard/caixa-kpis.ts src/modules/dashboard/financeiro-queries.ts src/modules/dashboard/financeiro-views.ts tests/financeiro-caixa-kpis.test.ts
git commit -m "feat(financeiro): painel mostra caixa real × faturado (entradas sem nota)"
```

---

## Task 6: Build marker + revisão final + smoke

- [ ] **Step 1:** Bumpar `src/build-info.ts` → `IMPOSTO-TEM-NOTA-2026-06-16`. Commit.
- [ ] **Step 2:** Revisão final do conjunto (correção/regressão), aplicar achados.
- [ ] **Step 3 (Junior, pós-deploy):** aplicar migration 051; Implantar; `curl /health` = IMPOSTO-TEM-NOTA-2026-06-16; smoke:
  - "recebi 5000 do fulano sem nota" → confirma "(sem nota — fora do imposto)", NÃO pede atividade, NÃO cobra imposto.
  - "recebi 5000 do fulano" → pede atividade e cobra imposto (igual hoje).
  - Painel: Entrou (caixa real) > Faturado quando houver sem nota; lucro usa o caixa real.

---

## Self-review (cobertura do spec)
- Flag tem_nota default true: Task 1, 2, 3. ✓
- Detecção "sem nota": Task 2. ✓
- Caixa-only sem tocar motor: Task 4 (entradaPrecisaImposto desvia pro confirm simples). ✓
- Painel caixa real × faturado + lucro no caixa real: Task 5. ✓
- Vinculada/PF nunca sem nota: Task 4 helper (conta_id / pf_pj). ✓
- Migration antes do deploy: Task 1 + Task 6 Step 3. ✓
