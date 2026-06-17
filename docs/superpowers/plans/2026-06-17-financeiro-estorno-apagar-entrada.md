# Estorno ao apagar entrada de venda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** Apagar uma entrada de venda pelo menu passa a DESFAZER o recebimento (conta + imposto + RBT12) automaticamente, em vez de travar — mantendo os números certos.

**Architecture:** Nova função `estornarRecebimento` (inverso de `registrarRecebimento`) + troca do guard `entrada+conta_id` no `apagar-menu.ts`. V1 só estorna quando a conta tem 1 recebimento (caso comum); parcial mantém trava com mensagem clara.

**Tech Stack:** TypeScript (Node ESM), Supabase, Vitest. Sem migration.

---

## File Structure

- `src/modules/financeiro/repo.ts` — `getRecebimentosDaConta`, `apagarRecebimento`, `reverterConta`.
- `src/modules/financeiro/contas.ts` — `estornarRecebimento` (orquestra o inverso).
- `src/modules/financeiro/apagar-menu.ts` — troca o guard por estorno + mensagens.
- `src/build-info.ts` — bump.
- `tests/financeiro-estorno.test.ts` (novo) + estender `tests/financeiro-apagar-menu.test.ts`.

---

## Task 1: Helpers de I/O no repo

**Files:** Modify `src/modules/financeiro/repo.ts`; Test `tests/financeiro-estorno.test.ts` (criar)

- [ ] **Step 1: Write the failing test**

```ts
// tests/financeiro-estorno.test.ts
import { describe, it, expect, vi } from 'vitest';
import { estornarRecebimento } from '../src/modules/financeiro/contas.js';
import * as repo from '../src/modules/financeiro/repo.js';

vi.mock('../src/modules/financeiro/repo.js', async (orig) => ({
  ...(await orig() as object),
  getContaReceber: vi.fn(),
  getRecebimentosDaConta: vi.fn(),
  apagarRecebimento: vi.fn(),
  reverterConta: vi.fn(),
  somarReceitaNoMes: vi.fn(),
}));

const client = {} as never;

describe('estornarRecebimento', () => {
  it('1 recebimento avulso → subtrai bucket, apaga recebimento, cancela conta', async () => {
    (repo.getContaReceber as any).mockResolvedValue({ id: 'c1', fechamento_id: null, atividade_id: 'a1' });
    (repo.getRecebimentosDaConta as any).mockResolvedValue([{ id: 'r1', valor: 2500, imposto: 200, competencia: '2026-06' }]);
    const res = await estornarRecebimento(client, 'c1');
    expect(res).toEqual({ ok: true, valorEstornado: 2500, impostoEstornado: 200 });
    expect(repo.somarReceitaNoMes).toHaveBeenCalledWith(client, '2026-06', 'a1', -2500); // subtrai
    expect(repo.apagarRecebimento).toHaveBeenCalledWith(client, 'r1');
    expect(repo.reverterConta).toHaveBeenCalledWith(client, 'c1', { avulsa: true });
  });
  it('venda real (fechamento_id set) → reverte conta pra pendente (avulsa:false)', async () => {
    (repo.getContaReceber as any).mockResolvedValue({ id: 'c1', fechamento_id: 'f1', atividade_id: 'a1' });
    (repo.getRecebimentosDaConta as any).mockResolvedValue([{ id: 'r1', valor: 1000, imposto: 80, competencia: '2026-06' }]);
    await estornarRecebimento(client, 'c1');
    expect(repo.reverterConta).toHaveBeenCalledWith(client, 'c1', { avulsa: false });
  });
  it('2 recebimentos (parcial) → não estorna', async () => {
    (repo.getContaReceber as any).mockResolvedValue({ id: 'c1', fechamento_id: null, atividade_id: 'a1' });
    (repo.getRecebimentosDaConta as any).mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
    const res = await estornarRecebimento(client, 'c1');
    expect(res).toEqual({ ok: false, motivo: 'parcial' });
    expect(repo.apagarRecebimento).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run tests/financeiro-estorno.test.ts`): `getRecebimentosDaConta`/`estornarRecebimento` não existem.

- [ ] **Step 3: Implement os helpers em `src/modules/financeiro/repo.ts`** (após `cancelarConta`):

```ts
export async function getRecebimentosDaConta(
  client: SupabaseClient, contaId: string,
): Promise<Array<{ id: string; valor: number; imposto: number; competencia: string }>> {
  const { data, error } = await client.from('financeiro_recebimentos')
    .select('id, valor, imposto, competencia').eq('conta_id', contaId);
  if (error) throw new Error(`getRecebimentosDaConta: ${error.message}`);
  return (data ?? []) as Array<{ id: string; valor: number; imposto: number; competencia: string }>;
}

export async function apagarRecebimento(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('financeiro_recebimentos').delete().eq('id', id);
  if (error) throw new Error(`apagarRecebimento: ${error.message}`);
}

// Reverte a conta no estorno: avulsa → 'cancelado'; venda real → 'pendente' (volta a "a receber").
// Zera recebido + imposto + datas do recebimento.
export async function reverterConta(
  client: SupabaseClient, id: string, opts: { avulsa: boolean },
): Promise<void> {
  const { error } = await client.from('financeiro_contas_a_receber')
    .update({
      status: opts.avulsa ? 'cancelado' : 'pendente',
      valor_recebido: 0,
      imposto_confirmado: 0,
      data_recebimento: null,
      competencia_recebimento: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`reverterConta: ${error.message}`);
}
```

- [ ] **Step 4: Implement `estornarRecebimento` em `src/modules/financeiro/contas.ts`** (após `registrarRecebimento`):

```ts
// Inverso de registrarRecebimento. V1: só estorna conta com 1 recebimento (caso
// comum "recebi X de instalação"). Parcial (varios recebimentos) → { ok:false }.
export async function estornarRecebimento(
  client: SupabaseClient, contaId: string,
): Promise<{ ok: true; valorEstornado: number; impostoEstornado: number } | { ok: false; motivo: 'parcial' }> {
  const conta = await getContaReceber(client, contaId);
  const recs = await getRecebimentosDaConta(client, contaId);
  if (recs.length > 1) return { ok: false, motivo: 'parcial' };
  let valorEstornado = 0;
  let impostoEstornado = 0;
  for (const r of recs) {
    // 1º tira do bucket RBT12 (valor negativo = subtrai)
    await somarReceitaNoMes(client, r.competencia, conta.atividade_id, -Number(r.valor));
    // 2º apaga o recebimento
    await apagarRecebimento(client, r.id);
    valorEstornado += Number(r.valor);
    impostoEstornado += Number(r.imposto);
  }
  // 3º reverte a conta (avulsa cancela; venda real volta pra a receber)
  await reverterConta(client, contaId, { avulsa: conta.fechamento_id == null });
  return { ok: true, valorEstornado, impostoEstornado };
}
```

Garantir imports em contas.ts: `getContaReceber, getRecebimentosDaConta, apagarRecebimento, reverterConta, somarReceitaNoMes` de `./repo.js` (alguns já importados).

- [ ] **Step 5: Run → PASS** (`npx vitest run tests/financeiro-estorno.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/modules/financeiro/repo.ts src/modules/financeiro/contas.ts tests/financeiro-estorno.test.ts
git commit -m "feat(financeiro): estornarRecebimento — inverso do recebimento (bucket+conta+imposto)"
```

---

## Task 2: Trocar o guard por estorno no apagar-menu

**Files:** Modify `src/modules/financeiro/apagar-menu.ts`; Test: estender `tests/financeiro-apagar-menu.test.ts`

- [ ] **Step 1: Write the failing tests** (acrescentar em `tests/financeiro-apagar-menu.test.ts`)

```ts
// no topo do arquivo, junto do vi.mock existente do lancamentos-repo, adicionar mock do contas:
vi.mock('../src/modules/financeiro/contas.js', () => ({ estornarRecebimento: vi.fn() }));
import * as contas from '../src/modules/financeiro/contas.js';

describe('apagar-menu: estorno de entrada de venda', () => {
  it('entrada de venda 1-recebimento → estorna + apaga + msg com valor', async () => {
    (repo.getLancamento as any).mockResolvedValue(lancRow({ tipo: 'entrada', conta_id: 'c1', status: 'confirmado' }));
    (contas.estornarRecebimento as any).mockResolvedValue({ ok: true, valorEstornado: 2500, impostoEstornado: 200 });
    (repo.mudarStatus as any).mockResolvedValue(true);
    const msg = await executarApagarLancamento(client, 'l1');
    expect(contas.estornarRecebimento).toHaveBeenCalledWith(client, 'c1');
    expect(msg).toContain('estornado');
    expect(msg).toContain('2.500');
  });
  it('entrada de venda parcial → mensagem "me chama" (não apaga)', async () => {
    (repo.getLancamento as any).mockResolvedValue(lancRow({ tipo: 'entrada', conta_id: 'c1', status: 'confirmado' }));
    (contas.estornarRecebimento as any).mockResolvedValue({ ok: false, motivo: 'parcial' });
    const msg = await executarApagarLancamento(client, 'l1');
    expect(msg).toContain('parciais');
    expect(repo.mudarStatus).not.toHaveBeenCalled();
  });
});
```

> Nota: `lancRow` é o helper já existente no arquivo de teste. Reusar.

- [ ] **Step 2: Run → FAIL** (hoje retorna ENTRADA_LIGADA_MSG, não estorna).

- [ ] **Step 3: Implement em `src/modules/financeiro/apagar-menu.ts`**

(a) Import no topo:

```ts
import { estornarRecebimento } from './contas.js';
```

(b) Em `executarApagarLancamento`, trocar o guard atual:

```ts
  if (r.tipo === 'entrada' && r.conta_id) return ENTRADA_LIGADA_MSG;
```

por:

```ts
  if (r.tipo === 'entrada' && r.conta_id) {
    const est = await estornarRecebimento(client, r.conta_id);
    if (!est.ok) {
      return '⚠️ Essa venda tem pagamentos parciais — me chama que a gente acerta com cuidado.';
    }
    const ok = await mudarStatus(client, id, r.status, 'apagado');
    if (!ok) return 'Esse já tinha sido apagado.';
    return `🗑️ Apagado e estornado: tirei ${brl(est.valorEstornado)} do recebido e ${brl(est.impostoEstornado)} de imposto.`;
  }
```

> `brl` já existe no arquivo (helper de formatação). Se não, usar `Number(x).toLocaleString('pt-BR', {style:'currency',currency:'BRL'})`.

(c) Em `montarConfirmacaoApagarLancamento`: NÃO bloquear mais entrada de venda. Trocar:

```ts
  if (r.tipo === 'entrada' && r.conta_id) return { erro: ENTRADA_LIGADA_MSG };
```

por um aviso no corpo (deixa apagar, só avisa):

```ts
  const avisoVenda = (r.tipo === 'entrada' && r.conta_id)
    ? '\n⚠️ É de uma venda — vou estornar o recebimento e o imposto junto.'
    : '';
  // ... e concatenar avisoVenda no body da confirmação.
```

`ENTRADA_LIGADA_MSG` fica sem uso → remover a constante.

- [ ] **Step 4: Run → PASS** (`npx vitest run tests/financeiro-apagar-menu.test.ts tests/financeiro-estorno.test.ts`).

- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit   # exit 0
git add src/modules/financeiro/apagar-menu.ts tests/financeiro-apagar-menu.test.ts
git commit -m "feat(financeiro): apagar entrada de venda estorna (sem trava) — parcial mantém aviso"
```

---

## Task 3: Build marker + verificação

- [ ] **Step 1:** `src/build-info.ts` → `ESTORNO-APAGAR-2026-06-17`.
- [ ] **Step 2:** `npx tsc --noEmit && npx vitest run` → tsc limpo; suíte verde (só 2 pré-existentes).
- [ ] **Step 3:** commit `chore(financeiro): build marker ESTORNO-APAGAR-2026-06-17`.

---

## Smoke (Junior, pós-deploy)

1. Lança "recebi 2.500 de instalação" → confirma (vira entrada de venda).
2. `menu` → 💰 Financeiro → 🗑️ Apagar lançamento → toca o R$ 2.500 → confirma.
3. Esperado: *"🗑️ Apagado e estornado: tirei R$ 2.500 do recebido e R$ X de imposto."*
4. Conferir no /dashboard/financeiro: recebido/imposto/RBT12 voltaram ao certo, a venda sumiu (avulsa).
5. (O R$ 2.500 atual do Junior some por aqui — sem SQL.)

## Reviews
3 code reviews (correção/regressão/segurança) antes do push. Foco: não deixar número torto, não estornar 2x, parcial mantém trava, bucket subtrai certo.
