# Inteligência de Materiais (Peça 4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando o admin registra uma compra de material (texto/foto/PDF/áudio), a Eva guarda material+loja+preço unitário; ao perguntar "preço do DPS" ela responde o ranking das lojas (mais barato → mais caro).

**Architecture:** Roda em cima da Caixa de Entrada existente — o extrator compartilhado ganha campos de material (vale pra todas as mídias). Ao CONFIRMAR um gasto de material, grava numa tabela nova `financeiro_materiais_compras`. Uma consulta de texto (antes do gate do caixa) responde o ranking. Pure functions testáveis; I/O isolado.

**Tech Stack:** TypeScript (Node ESM), Supabase (Postgres), Anthropic (extrator já existe), Vitest.

---

## File Structure

- `supabase/migrations/052_financeiro_materiais.sql` (+ `Desktop\migration-052-materiais.sql`) — tabela nova.
- `src/modules/financeiro/extrator-lancamento.ts` — 3 campos novos (material/quantidade/unidade) no schema + normalizarItem + prompt.
- `src/modules/financeiro/materiais.ts` (NOVO) — puras (normalizarMaterial, parseConsultaMaterial, precoUnitario, rankearLojas, formatarRanking) + I/O (inserirCompraMaterial, getComprasPorMaterialNorm) + orquestração (gravarCompraMaterialSeHouver, montarRankingMaterial, makeMaterialQueryHandler).
- `src/modules/financeiro/caixa-entrada.ts` — chamar gravarCompraMaterialSeHouver no confirmar (case `conf`).
- `src/index.ts` — instanciar e rotear a consulta de material antes do gate do caixa.
- `src/build-info.ts` — bump.
- `tests/financeiro-materiais.test.ts` (NOVO).

---

## Task 1: Migration 052 — tabela de compras de material

**Files:**
- Create: `supabase/migrations/052_financeiro_materiais.sql`
- Create: `C:\Users\Meu Computador\Desktop\migration-052-materiais.sql` (cópia pro Junior rodar)

- [ ] **Step 1: Criar a migration**

Escrever em `supabase/migrations/052_financeiro_materiais.sql`:

```sql
-- Peça 4: histórico de preço de material por loja (comparar onde tá mais barato).
create table if not exists financeiro_materiais_compras (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid references financeiro_lancamentos(id) on delete cascade,
  material text not null,
  material_norm text not null,
  loja text,
  quantidade numeric not null default 1,
  unidade text not null default 'un',
  valor_total numeric not null,
  preco_unitario numeric not null,
  data_evento date not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_materiais_norm on financeiro_materiais_compras (material_norm);
```

- [ ] **Step 2: Copiar pro Desktop (linhas curtas, pro Junior rodar no SQL Editor)**

Escrever o MESMO conteúdo em `C:\Users\Meu Computador\Desktop\migration-052-materiais.sql`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/052_financeiro_materiais.sql
git commit -m "feat(financeiro): migration 052 — tabela materiais_compras"
```

> Nota: a migration é aplicada manualmente pelo Junior no SQL Editor (projeto `kupnsoyymulbdzakqlqc`) ANTES de Implantar. Sem isso, gravar/consultar material dá erro (tabela não existe).

---

## Task 2: Extrator ganha material/quantidade/unidade

**Files:**
- Modify: `src/modules/financeiro/extrator-lancamento.ts`
- Test: `tests/financeiro-materiais.test.ts` (criar)

- [ ] **Step 1: Write the failing test**

Criar `tests/financeiro-materiais.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseLancamentos } from '../src/modules/financeiro/extrator-lancamento.js';

describe('extrator: campos de material', () => {
  it('extrai material, quantidade e unidade', () => {
    const raw = '```json\n[{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":400,"contraparte":"Loja Y","material":"cabo 6mm","quantidade":100,"unidade":"m"}]\n```';
    const e = parseLancamentos(raw)[0];
    expect(e.material).toBe('cabo 6mm');
    expect(e.quantidade).toBe(100);
    expect(e.unidade).toBe('m');
  });
  it('sem material → null/null/null', () => {
    const raw = '```json\n[{"financeiro":true,"tipo":"despesa","valor":50,"contraparte":"posto"}]\n```';
    const e = parseLancamentos(raw)[0];
    expect(e.material).toBeNull();
    expect(e.quantidade).toBeNull();
    expect(e.unidade).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/financeiro-materiais.test.ts`
Expected: FAIL — `e.material` é undefined (campo não existe).

- [ ] **Step 3: Implement — adicionar os campos**

Em `src/modules/financeiro/extrator-lancamento.ts`, no `interface ExtracaoLancamento` (após `descricao: string | null;`, linha ~18) adicionar:

```ts
  material: string | null;       // nome do material comprado (DPS, cabo 6mm) — só compra de material
  quantidade: number | null;     // quantos (100) — default 1 no consumo
  unidade: string | null;        // un, m, rolo...
```

No `normalizarItem` (no objeto de retorno, após `descricao: strOuNull(obj.descricao),`, linha ~61) adicionar:

```ts
    material: strOuNull(obj.material),
    quantidade: numeroOuNull(obj.quantidade),
    unidade: strOuNull(obj.unidade),
```

No prompt `REGRAS_COMUNS`, na linha do schema JSON (após `"obra_ref": ... "descricao": ... ou null,`, linha ~128) adicionar dentro do objeto:

```
 "material": "nome do material/produto comprado (DPS, cabo 6mm, disjuntor) ou null", "quantidade": número ou null, "unidade": "un"|"m"|"rolo"|... ou null,
```

E nas REGRAS (após a regra de categoria_slug, ~linha 137) adicionar:

```
- material/quantidade/unidade: SÓ quando for COMPRA DE MATERIAL/produto (despesa). material = o item ("DPS", "cabo 6mm"); quantidade/unidade quando a pessoa disser ("100m de cabo" → quantidade 100, unidade "m"; "5 disjuntores" → 5, "un"). Não disse quantidade → quantidade null (conta como 1). Não é compra de material → os três null.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/financeiro-materiais.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/extrator-lancamento.ts tests/financeiro-materiais.test.ts
git commit -m "feat(financeiro): extrator captura material/quantidade/unidade (todas as mídias)"
```

---

## Task 3: materiais.ts — funções puras (normalizar, parse, preço, ranking)

**Files:**
- Create: `src/modules/financeiro/materiais.ts`
- Test: `tests/financeiro-materiais.test.ts` (acrescentar)

- [ ] **Step 1: Write the failing tests**

Acrescentar em `tests/financeiro-materiais.test.ts`:

```ts
import {
  normalizarMaterial, parseConsultaMaterial, precoUnitario,
  rankearLojas, formatarRanking,
} from '../src/modules/financeiro/materiais.js';

describe('materiais: normalizarMaterial', () => {
  it('lowercase, trim, sem acento, espaços colapsados', () => {
    expect(normalizarMaterial('  DPS  40A ')).toBe('dps 40a');
    expect(normalizarMaterial('Disjuntôr')).toBe('disjuntor');
  });
});

describe('materiais: parseConsultaMaterial', () => {
  it('reconhece os padrões e extrai o termo', () => {
    expect(parseConsultaMaterial('preço do DPS')).toBe('DPS');
    expect(parseConsultaMaterial('preco do dps')).toBe('dps');
    expect(parseConsultaMaterial('onde tá mais barato o cabo 6mm')).toBe('cabo 6mm');
    expect(parseConsultaMaterial('onde ta mais barato cabo 6mm')).toBe('cabo 6mm');
    expect(parseConsultaMaterial('quanto custa o disjuntor 40A')).toBe('disjuntor 40A');
    expect(parseConsultaMaterial('qual o preço do DPS?')).toBe('DPS');
  });
  it('não-consulta → null', () => {
    expect(parseConsultaMaterial('gastei 380 no posto')).toBeNull();
    expect(parseConsultaMaterial('comprei DPS por 80')).toBeNull();
    expect(parseConsultaMaterial('preço')).toBeNull();
  });
});

describe('materiais: precoUnitario', () => {
  it('valor / quantidade', () => expect(precoUnitario(400, 100)).toBe(4));
  it('quantidade null → conta 1', () => expect(precoUnitario(80, null)).toBe(80));
  it('quantidade 0 → conta 1', () => expect(precoUnitario(80, 0)).toBe(80));
});

describe('materiais: rankearLojas', () => {
  it('por loja pega a mais recente e ordena por preço', () => {
    const rows = [
      { loja: 'Eletro X', preco_unitario: 75, data_evento: '2026-06-10' },
      { loja: 'Loja Y', preco_unitario: 82, data_evento: '2026-06-02' },
      { loja: 'Eletro X', preco_unitario: 90, data_evento: '2026-05-01' }, // antiga, ignora
    ];
    const r = rankearLojas(rows);
    expect(r.map(x => x.loja)).toEqual(['Eletro X', 'Loja Y']);
    expect(r[0].preco_unitario).toBe(75);
  });
});

describe('materiais: formatarRanking', () => {
  it('vazio → mensagem amigável', () => {
    expect(formatarRanking('DPS', [])).toContain('Ainda não tenho preço');
  });
  it('lista numerada com loja, preço, data', () => {
    const s = formatarRanking('DPS', [{ loja: 'Eletro X', preco_unitario: 75, data_evento: '2026-06-10' }]);
    expect(s).toContain('1º');
    expect(s).toContain('Eletro X');
    expect(s).toContain('10/06');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/financeiro-materiais.test.ts`
Expected: FAIL — módulo `materiais.js` não existe.

- [ ] **Step 3: Implement — criar `src/modules/financeiro/materiais.ts`**

```ts
// src/modules/financeiro/materiais.ts
// Peça 4: comparar preço de material entre lojas. Roda em cima da Caixa de Entrada.
import type { SupabaseClient } from '@supabase/supabase-js';
import { getLancamento } from './lancamentos-repo.js';

export interface CompraRow { loja: string | null; preco_unitario: number; data_evento: string; }

// Normaliza o nome do material pra agrupar (lowercase, sem acento, espaços colapsados).
export function normalizarMaterial(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Detecta uma CONSULTA de preço de material e devolve o termo (ou null).
export function parseConsultaMaterial(text: string): string | null {
  let t = text.trim().replace(/\?+\s*$/, '').trim();
  const gatilho = /^(onde\s+(?:t[aá]|est[aá])\s+mais\s+barat[oa]|qual\s+(?:o\s+)?pre[cç]o|pre[cç]o|quanto\s+custa|valor)\b/i;
  if (!gatilho.test(t)) return null;
  t = t.replace(gatilho, '').trim();
  t = t.replace(/^d[eo]s?\s+/i, '').replace(/^d[ao]s?\s+/i, '').trim(); // de/do/das/da
  t = t.replace(/^(?:o|a|os|as)\s+/i, '').trim();                       // artigo
  return t.length >= 2 ? t : null;
}

export function precoUnitario(valorTotal: number, quantidade: number | null): number {
  const q = quantidade && quantidade > 0 ? quantidade : 1;
  return Math.round((valorTotal / q) * 100) / 100;
}

// Por loja: pega a compra MAIS RECENTE (preço que vale hoje); ordena por preço asc.
export function rankearLojas(rows: CompraRow[]): Array<{ loja: string; preco_unitario: number; data_evento: string }> {
  const porLoja = new Map<string, { loja: string; preco_unitario: number; data_evento: string }>();
  for (const r of rows) {
    const loja = r.loja ?? '—';
    const atual = porLoja.get(loja.toLowerCase());
    if (!atual || r.data_evento > atual.data_evento) {
      porLoja.set(loja.toLowerCase(), { loja, preco_unitario: Number(r.preco_unitario), data_evento: r.data_evento });
    }
  }
  return [...porLoja.values()].sort((a, b) => a.preco_unitario - b.preco_unitario);
}

export function formatarRanking(termo: string, ranking: Array<{ loja: string; preco_unitario: number; data_evento: string }>): string {
  if (ranking.length === 0) return `Ainda não tenho preço de *${termo}* registrado. Compra uma vez que eu já guardo. 👍`;
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dm = (iso: string) => { const p = iso.slice(0, 10).split('-'); return `${p[2]}/${p[1]}`; };
  const linhas = ranking.map((r, i) => `${i + 1}º  ${r.loja} — ${brl(r.preco_unitario)} (${dm(r.data_evento)})`);
  return `💰 *${termo}* — onde tá mais barato:\n${linhas.join('\n')}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/financeiro-materiais.test.ts`
Expected: PASS (todos os blocos puros).

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/materiais.ts tests/financeiro-materiais.test.ts
git commit -m "feat(financeiro): materiais.ts — funções puras (normalizar/parse/ranking)"
```

---

## Task 4: materiais.ts — I/O + orquestração (gravar, consultar, handler)

**Files:**
- Modify: `src/modules/financeiro/materiais.ts`
- Test: `tests/financeiro-materiais.test.ts` (acrescentar, com repo mockado)

- [ ] **Step 1: Write the failing tests**

Acrescentar em `tests/financeiro-materiais.test.ts` (no topo do arquivo, junto dos outros imports/mocks):

```ts
import { vi } from 'vitest';
vi.mock('../src/modules/financeiro/lancamentos-repo.js', async (orig) => ({
  ...(await orig() as object),
  getLancamento: vi.fn(),
}));
```

E os testes:

```ts
import * as repo from '../src/modules/financeiro/lancamentos-repo.js';
import { gravarCompraMaterialSeHouver } from '../src/modules/financeiro/materiais.js';

describe('materiais: gravarCompraMaterialSeHouver', () => {
  const lancRow = (over = {}) => ({
    id: 'l1', tipo: 'despesa', status: 'confirmado', valor: 400, data_evento: '2026-06-17',
    contraparte: 'Loja Y', extracao: { material: 'cabo 6mm', quantidade: 100, unidade: 'm' }, ...over,
  });
  it('grava com preço unitário certo', async () => {
    (repo.getLancamento as any).mockResolvedValue(lancRow());
    const inserts: any[] = [];
    const client = { from: () => ({ insert: (v: any) => { inserts.push(v); return { error: null }; } }) } as any;
    const ok = await gravarCompraMaterialSeHouver(client, 'l1');
    expect(ok).toBe(true);
    expect(inserts[0].preco_unitario).toBe(4);
    expect(inserts[0].material_norm).toBe('cabo 6mm');
    expect(inserts[0].loja).toBe('Loja Y');
  });
  it('sem material → no-op (false)', async () => {
    (repo.getLancamento as any).mockResolvedValue(lancRow({ extracao: { material: null } }));
    const client = { from: () => ({ insert: () => ({ error: null }) }) } as any;
    expect(await gravarCompraMaterialSeHouver(client, 'l1')).toBe(false);
  });
  it('não confirmado → no-op', async () => {
    (repo.getLancamento as any).mockResolvedValue(lancRow({ status: 'pendente' }));
    const client = { from: () => ({ insert: () => ({ error: null }) }) } as any;
    expect(await gravarCompraMaterialSeHouver(client, 'l1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/financeiro-materiais.test.ts`
Expected: FAIL — `gravarCompraMaterialSeHouver` não existe.

- [ ] **Step 3: Implement — acrescentar em `src/modules/financeiro/materiais.ts`**

```ts
// --- I/O ---
export async function inserirCompraMaterial(client: SupabaseClient, c: {
  lancamento_id: string; material: string; material_norm: string; loja: string | null;
  quantidade: number; unidade: string; valor_total: number; preco_unitario: number; data_evento: string;
}): Promise<void> {
  const { error } = await client.from('financeiro_materiais_compras').insert(c);
  if (error) throw new Error(`inserirCompraMaterial: ${error.message}`);
}

export async function getComprasPorMaterialNorm(client: SupabaseClient, termoNorm: string): Promise<CompraRow[]> {
  const t = termoNorm.replace(/[%_]/g, '\\$&');
  const { data, error } = await client.from('financeiro_materiais_compras')
    .select('loja, preco_unitario, data_evento')
    .ilike('material_norm', `%${t}%`)
    .order('data_evento', { ascending: false }).limit(200);
  if (error) throw new Error(`getComprasPorMaterialNorm: ${error.message}`);
  return (data ?? []) as CompraRow[];
}

// --- Orquestração ---
// Grava a compra de material a partir de um lançamento JÁ confirmado. Retorna true se gravou.
export async function gravarCompraMaterialSeHouver(client: SupabaseClient, lancamentoId: string): Promise<boolean> {
  const row = await getLancamento(client, lancamentoId);
  if (!row || row.status !== 'confirmado' || row.tipo !== 'despesa') return false;
  const ex = (row.extracao ?? {}) as Record<string, unknown>;
  const material = typeof ex.material === 'string' && ex.material.trim() ? ex.material.trim() : null;
  if (!material) return false;
  const quantidade = typeof ex.quantidade === 'number' && ex.quantidade > 0 ? ex.quantidade : 1;
  const unidade = typeof ex.unidade === 'string' && ex.unidade.trim() ? ex.unidade.trim() : 'un';
  const valorTotal = Number(row.valor);
  await inserirCompraMaterial(client, {
    lancamento_id: lancamentoId, material, material_norm: normalizarMaterial(material),
    loja: row.contraparte ?? null, quantidade, unidade,
    valor_total: valorTotal, preco_unitario: precoUnitario(valorTotal, quantidade),
    data_evento: row.data_evento,
  });
  return true;
}

export async function montarRankingMaterial(client: SupabaseClient, termo: string): Promise<string> {
  const rows = await getComprasPorMaterialNorm(client, normalizarMaterial(termo));
  return formatarRanking(termo, rankearLojas(rows));
}

// Handler no formato dos comandos do index: (from, text) => Promise<boolean>.
export function makeMaterialQueryHandler(
  client: SupabaseClient,
  isAdminPhone: (p: string) => boolean,
  sendText: (to: string, body: string) => Promise<unknown>,
) {
  return async function tryHandleConsultaMaterial(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const termo = parseConsultaMaterial(text);
    if (!termo) return false;
    await sendText(from, await montarRankingMaterial(client, termo));
    return true;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/financeiro-materiais.test.ts`
Expected: PASS.

- [ ] **Step 5: Run tsc + commit**

Run: `npx tsc --noEmit` → exit 0.

```bash
git add src/modules/financeiro/materiais.ts tests/financeiro-materiais.test.ts
git commit -m "feat(financeiro): materiais I/O — gravar compra + ranking por loja"
```

---

## Task 5: Ligar no fluxo (gravar no confirmar + rotear consulta)

**Files:**
- Modify: `src/modules/financeiro/caixa-entrada.ts` (case `conf`, ~L349)
- Modify: `src/index.ts` (instanciar handler ~L681; rotear ~L3566)

- [ ] **Step 1: Importar e gravar no confirmar (caixa-entrada.ts)**

No topo de `src/modules/financeiro/caixa-entrada.ts`, junto dos imports do módulo, adicionar:

```ts
import { gravarCompraMaterialSeHouver } from './materiais.js';
```

No `case 'conf':`, trocar o bloco do `if (ok)` (linhas ~349-356) por:

```ts
        const ok = await mudarStatus(deps.supabase, id, 'pendente', 'confirmado');
        if (ok) {
          const salvouMaterial = await gravarCompraMaterialSeHouver(deps.supabase, id).catch(() => false);
          const sufMat = salvouMaterial ? '\n📦 Preço guardado pra comparar (manda "preço do <material>").' : '';
          const msgEntrada = row.tem_nota === false
            ? `💰 Entrada lançada: ${brl(Number(row.valor))} (sem nota — fora do imposto).`
            : `💰 Entrada lançada: ${brl(Number(row.valor))}.`;
          await deps.sendText(from, (row.tipo === 'despesa' ? `💸 Lançado: ${brl(Number(row.valor))}. Tá no caixa.` : msgEntrada) + sufMat);
        } else await deps.sendText(from, 'Esse lançamento já tinha sido processado.');
        return true;
```

- [ ] **Step 2: Instanciar o handler de consulta (index.ts)**

Em `src/index.ts`, na linha de import do comando-imposto (~L88), adicionar logo abaixo:

```ts
import { makeMaterialQueryHandler } from './modules/financeiro/materiais.js';
```

Perto de onde `tryHandleImpostoCommand` é criado (`const tryHandleImpostoCommand = makeImpostoHandler(...)`, ~L681), adicionar:

```ts
  const tryHandleConsultaMaterial = makeMaterialQueryHandler(supabase.getClient(), isAdminPhone, sendText);
```

- [ ] **Step 3: Rotear a consulta ANTES do gate do caixa (index.ts)**

Logo após `if (await tryHandleImpostoCommand(from, text)) return;` (~L3565), adicionar:

```ts
    // Consulta de preço de material ("preço do DPS") — antes do gate do caixa.
    if (await tryHandleConsultaMaterial(from, text)) return;
```

- [ ] **Step 4: Verificar compilação + suíte**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc limpo; suíte verde (só as 2 falhas pré-existentes `supabase-vincular-novo`).

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/caixa-entrada.ts src/index.ts
git commit -m "feat(financeiro): grava material no confirmar + roteia consulta de preço"
```

---

## Task 6: Build marker + verificação final

**Files:**
- Modify: `src/build-info.ts`

- [ ] **Step 1: Bump do build marker**

Em `src/build-info.ts`, trocar o valor da constante `BUILD_VERSION` para:

```
MATERIAIS-PRECO-2026-06-17
```

- [ ] **Step 2: Verificação final**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc limpo; suíte verde (menos as 2 pré-existentes).

- [ ] **Step 3: Commit**

```bash
git add src/build-info.ts
git commit -m "chore(financeiro): build marker MATERIAIS-PRECO-2026-06-17"
```

---

## Deploy (ordem OBRIGATÓRIA)

1. Aplicar a **migration 052** no SQL Editor (`kupnsoyymulbdzakqlqc`) — usar `Desktop\migration-052-materiais.sql` — ANTES de Implantar.
2. Push (com autorização) → Implantar → `curl https://propostas.ecosunpower.eng.br/health` = `MATERIAIS-PRECO-2026-06-17`.
3. Smoke do Junior:
   - "comprei 100m de cabo 6mm por 400 na Loja Y" → confirma no botão → "📦 Preço guardado".
   - "comprei DPS por 80 na Eletro X" → confirma.
   - "preço do cabo 6mm" → ranking (R$ 4/m na Loja Y).
   - "onde tá mais barato o DPS" → ranking.
   - Foto/áudio de uma compra → mesma coisa (mídia).

## Reviews (regra Junior: 3 code reviews antes do push)

3 passadas com lentes diferentes (correção / regressão / segurança), corrigindo os achados, antes de pedir autorização pra push.
