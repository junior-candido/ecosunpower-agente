# Assinaturas — Fatia 1 (tabelas + tela + botões manuais + renovação no webhook)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela "📆 Assinaturas" no setor Financeiro do dashboard com lista + botões manuais (nova assinatura, gerar cobrança, liberar/travar, editar), e renovação automática do vencimento quando a cobrança da assinatura é paga (webhook já existente).

**Architecture:** Mesmo trio das telas recentes: `assinaturas-store.ts` (funções puras + acesso a banco com `SupabaseClient`), `assinaturas-views.ts` (`renderLayout`), rotas no `router.ts` com `exigir('financeiro', ...)`. Cobrança reusa `criarCobranca`/`criarLinkPagamento` (peça 1, no ar) — só ganha a amarra `assinatura_id`. O motor automático de avisos/travas é a Fatia 2; a ponte com a calculadora é a Fatia 3.

**Tech Stack:** TypeScript ESM (imports `.js`), Express server-rendered, Supabase, vitest.

**Spec:** `docs/superpowers/specs/2026-07-29-assinaturas-financeiro-design.md`

---

### Task 1: Migration 090 (tabelas + seed + amarra na cobrancas)

**Files:**
- Create: `supabase/migrations/090_assinaturas.sql`

⚠️ **Combinar o número 090 no grupo do WhatsApp antes do PR.** O Junior aplica no SQL Editor (prod `kupnsoyymulbdzakqlqc`) antes do deploy.

- [ ] **Step 1: Criar a migration**

```sql
-- Migration 090: assinaturas — central de mensalidades (Fase 1).
-- Spec: docs/superpowers/specs/2026-07-29-assinaturas-financeiro-design.md
-- Produtos com valor padrão + assinaturas com valor/limite próprios.
-- Cada renovação vira uma linha em cobrancas (089) amarrada por assinatura_id.
-- Aplicar no SQL Editor ANTES do deploy. Número 090 combinado no grupo.

CREATE TABLE IF NOT EXISTS assinatura_produtos (
  id text PRIMARY KEY,              -- slug legível: 'calculadora', 'monitoramento'
  nome text NOT NULL,
  valor_centavos_padrao integer NOT NULL CHECK (valor_centavos_padrao > 0),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO assinatura_produtos (id, nome, valor_centavos_padrao) VALUES
  ('calculadora', 'Calculadora Solar', 5700),        -- ~R$ 57 (Junior confirma na tela)
  ('monitoramento', 'Monitoramento de Usinas', 29700) -- R$ 297 (fundador Thiago, 110 usinas)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS assinaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id text NOT NULL REFERENCES assinatura_produtos(id),
  company_id uuid REFERENCES companies(id),  -- tenant assinante (monitoramento)
  lead_id uuid REFERENCES leads(id),         -- opcional: lead vinculado
  nome text NOT NULL,
  email text,
  telefone text,
  zap_confirmado boolean NOT NULL DEFAULT false,  -- confirmação por código = Fase 2
  valor_centavos integer NOT NULL CHECK (valor_centavos > 0),
  limite integer,                            -- ex: 110 usinas; null = sem limite
  vence_em date NOT NULL,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'travada', 'cancelada')),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assinaturas_vence ON assinaturas(vence_em);
CREATE INDEX IF NOT EXISTS idx_assinaturas_produto ON assinaturas(produto_id);

ALTER TABLE cobrancas ADD COLUMN IF NOT EXISTS assinatura_id uuid REFERENCES assinaturas(id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_assinatura ON cobrancas(assinatura_id);

-- Billing é assunto do admin da casa: só o service-role (BYPASS) mexe.
-- RLS ligada SEM política = negado pra qualquer client de tenant.
ALTER TABLE assinatura_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE assinatura_produtos FORCE ROW LEVEL SECURITY;
ALTER TABLE assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE assinaturas FORCE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/090_assinaturas.sql
git commit -m "db: 090 assinaturas — produtos + assinaturas + amarra assinatura_id na cobrancas"
```

---

### Task 2: Funções puras — situação e novo vencimento (TDD)

**Files:**
- Create: `src/modules/dashboard/assinaturas-store.ts` (só a parte pura nesta task)
- Test: `tests/assinaturas-store.test.ts`

- [ ] **Step 1: Escrever os testes que FALHAM**

```ts
// tests/assinaturas-store.test.ts
// Central de Assinaturas (fatia 1) — régua do Junior: aviso 8d antes,
// lembrete 2d antes, 3d de tolerância vencida, trava. Aqui: situação
// derivada (pra tela) e novo vencimento ao pagar (+1 mês).
import { describe, it, expect } from 'vitest';
import { situacaoDaAssinatura, novoVencimento } from '../src/modules/dashboard/assinaturas-store.js';

describe('situacaoDaAssinatura (badge da tela)', () => {
  const base = { status: 'ativa' as const, venceEm: '2026-08-20' };
  it('travada/cancelada ganham de tudo', () => {
    expect(situacaoDaAssinatura({ ...base, status: 'travada' }, '2026-08-01')).toBe('travada');
    expect(situacaoDaAssinatura({ ...base, status: 'cancelada' }, '2026-08-01')).toBe('cancelada');
  });
  it('longe do vencimento → ativa', () => {
    expect(situacaoDaAssinatura(base, '2026-08-01')).toBe('ativa');
  });
  it('faltando 8 dias ou menos → vencendo (régua do aviso)', () => {
    expect(situacaoDaAssinatura(base, '2026-08-12')).toBe('vencendo');
    expect(situacaoDaAssinatura(base, '2026-08-20')).toBe('vencendo'); // vence HOJE
    expect(situacaoDaAssinatura(base, '2026-08-11')).toBe('ativa');    // 9 dias
  });
  it('passou do vencimento → vencida', () => {
    expect(situacaoDaAssinatura(base, '2026-08-21')).toBe('vencida');
  });
});

describe('novoVencimento (pagou → +1 mês)', () => {
  it('pagou adiantado: soma 1 mês A PARTIR DO VENCIMENTO (não perde dias)', () => {
    expect(novoVencimento('2026-08-20', '2026-08-14')).toBe('2026-09-20');
  });
  it('pagou atrasado: soma 1 mês a partir de HOJE (não cobra retroativo)', () => {
    expect(novoVencimento('2026-08-20', '2026-09-02')).toBe('2026-10-02');
  });
  it('fim de mês não estoura: 31/jan → 28/fev, 31/dez vira 31/jan do ano seguinte', () => {
    expect(novoVencimento('2026-01-31', '2026-01-01')).toBe('2026-02-28');
    expect(novoVencimento('2026-12-31', '2026-12-01')).toBe('2027-01-31');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/assinaturas-store.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar o mínimo**

```ts
// src/modules/dashboard/assinaturas-store.ts
// Central de Assinaturas (fatia 1): situação derivada pra tela, novo
// vencimento ao pagar, e acesso a banco (service-role; RLS nega tenants).
// Régua do Junior: vencendo = faltam ≤8 dias (dia do 1º aviso automático).

export type StatusAssinatura = 'ativa' | 'travada' | 'cancelada';
export type Situacao = 'ativa' | 'vencendo' | 'vencida' | 'travada' | 'cancelada';

const DIAS_VENCENDO = 8;

/** Datas em 'YYYY-MM-DD' (comparação de string = comparação de data). */
export function situacaoDaAssinatura(
  a: { status: StatusAssinatura; venceEm: string },
  hoje: string,
): Situacao {
  if (a.status !== 'ativa') return a.status;
  if (hoje > a.venceEm) return 'vencida';
  const dias = Math.round((Date.parse(a.venceEm) - Date.parse(hoje)) / 86_400_000);
  return dias <= DIAS_VENCENDO ? 'vencendo' : 'ativa';
}

function maisUmMes(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const ano = m === 12 ? y! + 1 : y!;
  const mes = m === 12 ? 1 : m! + 1;
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate(); // dia 0 do mês seguinte
  const dia = Math.min(d!, ultimoDia);
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Pagou: renova a partir do vencimento (adiantado) ou de hoje (atrasado). */
export function novoVencimento(venceEm: string, hoje: string): string {
  return maisUmMes(venceEm >= hoje ? venceEm : hoje);
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run tests/assinaturas-store.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/assinaturas-store.ts tests/assinaturas-store.test.ts
git commit -m "feat(assinaturas): situacao derivada + novo vencimento (regua 8d, +1 mes sem estourar fim de mes)"
```

---

### Task 3: Store — acesso a banco

**Files:**
- Modify: `src/modules/dashboard/assinaturas-store.ts` (acrescentar no fim)
- Test: `tests/assinaturas-store.test.ts` (acrescentar)

- [ ] **Step 1: Testes que FALHAM (mock chainable, mesmo estilo de empresas-store)**

```ts
// acrescentar em tests/assinaturas-store.test.ts:
import { listarAssinaturas, criarAssinatura, renovarAssinatura } from '../src/modules/dashboard/assinaturas-store.js';
import { vi } from 'vitest';

function mockClient(respostas: Record<string, any[]>) {
  const inserts: Record<string, any[]> = {};
  const updates: Record<string, any[]> = {};
  const client = {
    from(tabela: string) {
      const resposta = () => (respostas[tabela] ?? []).shift() ?? { data: null, error: null };
      const chain: any = {
        insert(row: any) { (inserts[tabela] ??= []).push(row); return chain; },
        update(row: any) { (updates[tabela] ??= []).push(row); return chain; },
        select() { return chain; }, eq() { return chain; }, order() { return chain; },
        single() { return Promise.resolve(resposta()); },
        maybeSingle() { return Promise.resolve(resposta()); },
        then(res: any, rej: any) { return Promise.resolve(resposta()).then(res, rej); },
      };
      return chain;
    },
  };
  return { client: client as any, inserts, updates };
}

describe('listarAssinaturas', () => {
  it('devolve a lista com o nome do produto embutido', async () => {
    const { client } = mockClient({
      assinaturas: [{ data: [{ id: 'a1', produto_id: 'monitoramento', nome: 'Sabion', email: 't@x.com', telefone: null, zap_confirmado: false, valor_centavos: 29700, limite: 110, vence_em: '2026-08-29', status: 'ativa', assinatura_produtos: { nome: 'Monitoramento de Usinas' } }], error: null }],
    });
    const lista = await listarAssinaturas(client);
    expect(lista).toEqual([{ id: 'a1', produtoId: 'monitoramento', produtoNome: 'Monitoramento de Usinas', nome: 'Sabion', email: 't@x.com', telefone: null, zapConfirmado: false, valorCentavos: 29700, limite: 110, venceEm: '2026-08-29', status: 'ativa' }]);
  });
});

describe('criarAssinatura', () => {
  it('insere com os campos certos e devolve o id', async () => {
    const { client, inserts } = mockClient({ assinaturas: [{ data: { id: 'a2' }, error: null }] });
    const id = await criarAssinatura(client, { produtoId: 'calculadora', nome: 'Fulano', email: 'f@x.com', telefone: '61999998888', valorCentavos: 5700, limite: null, venceEm: '2026-08-29' });
    expect(id).toBe('a2');
    expect(inserts.assinaturas?.[0]).toMatchObject({ produto_id: 'calculadora', nome: 'Fulano', valor_centavos: 5700, vence_em: '2026-08-29' });
  });
});

describe('renovarAssinatura', () => {
  it('pagou → vence_em +1 mês e status volta pra ativa', async () => {
    const { client, updates } = mockClient({
      assinaturas: [
        { data: { vence_em: '2026-08-20' }, error: null },  // leitura
        { data: null, error: null },                         // update
      ],
    });
    await renovarAssinatura(client, 'a1', '2026-08-14');
    expect(updates.assinaturas?.[0]).toEqual({ vence_em: '2026-09-20', status: 'ativa' });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/assinaturas-store.test.ts` → FAIL

- [ ] **Step 3: Implementar**

```ts
// acrescentar em src/modules/dashboard/assinaturas-store.ts:
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AssinaturaRow {
  id: string; produtoId: string; produtoNome: string; nome: string;
  email: string | null; telefone: string | null; zapConfirmado: boolean;
  valorCentavos: number; limite: number | null; venceEm: string; status: StatusAssinatura;
}

export async function listarAssinaturas(client: SupabaseClient): Promise<AssinaturaRow[]> {
  const { data, error } = await client
    .from('assinaturas')
    .select('id, produto_id, nome, email, telefone, zap_confirmado, valor_centavos, limite, vence_em, status, assinatura_produtos(nome)')
    .order('vence_em', { ascending: true });
  if (error) throw new Error(`listarAssinaturas: ${error.message}`);
  return (data ?? []).map((r: any) => ({
    id: r.id, produtoId: r.produto_id, produtoNome: r.assinatura_produtos?.nome ?? r.produto_id,
    nome: r.nome, email: r.email, telefone: r.telefone, zapConfirmado: r.zap_confirmado,
    valorCentavos: r.valor_centavos, limite: r.limite, venceEm: r.vence_em, status: r.status,
  }));
}

export interface ProdutoRow { id: string; nome: string; valorCentavosPadrao: number }

export async function listarProdutos(client: SupabaseClient): Promise<ProdutoRow[]> {
  const { data, error } = await client
    .from('assinatura_produtos').select('id, nome, valor_centavos_padrao').eq('ativo', true).order('nome');
  if (error) throw new Error(`listarProdutos: ${error.message}`);
  return (data ?? []).map((p: any) => ({ id: p.id, nome: p.nome, valorCentavosPadrao: p.valor_centavos_padrao }));
}

export async function criarAssinatura(client: SupabaseClient, d: {
  produtoId: string; nome: string; email?: string | null; telefone?: string | null;
  valorCentavos: number; limite?: number | null; venceEm: string; companyId?: string | null; leadId?: string | null;
}): Promise<string> {
  const { data, error } = await client.from('assinaturas').insert({
    produto_id: d.produtoId, nome: d.nome, email: d.email ?? null, telefone: d.telefone ?? null,
    valor_centavos: d.valorCentavos, limite: d.limite ?? null, vence_em: d.venceEm,
    company_id: d.companyId ?? null, lead_id: d.leadId ?? null,
  }).select('id').single();
  if (error) throw new Error(`criarAssinatura: ${error.message}`);
  return (data as { id: string }).id;
}

export async function getAssinatura(client: SupabaseClient, id: string): Promise<AssinaturaRow | null> {
  const { data } = await client
    .from('assinaturas')
    .select('id, produto_id, nome, email, telefone, zap_confirmado, valor_centavos, limite, vence_em, status, assinatura_produtos(nome)')
    .eq('id', id).maybeSingle();
  if (!data) return null;
  const r = data as any;
  return {
    id: r.id, produtoId: r.produto_id, produtoNome: r.assinatura_produtos?.nome ?? r.produto_id,
    nome: r.nome, email: r.email, telefone: r.telefone, zapConfirmado: r.zap_confirmado,
    valorCentavos: r.valor_centavos, limite: r.limite, venceEm: r.vence_em, status: r.status,
  };
}

export async function editarAssinatura(client: SupabaseClient, id: string, campos: {
  valorCentavos?: number; telefone?: string | null; limite?: number | null; venceEm?: string;
}): Promise<void> {
  const row: Record<string, unknown> = {};
  if (campos.valorCentavos !== undefined) row.valor_centavos = campos.valorCentavos;
  if (campos.telefone !== undefined) row.telefone = campos.telefone;
  if (campos.limite !== undefined) row.limite = campos.limite;
  if (campos.venceEm !== undefined) row.vence_em = campos.venceEm;
  if (Object.keys(row).length === 0) return;
  const { error } = await client.from('assinaturas').update(row).eq('id', id);
  if (error) throw new Error(`editarAssinatura: ${error.message}`);
}

export async function setStatusAssinatura(client: SupabaseClient, id: string, status: StatusAssinatura): Promise<void> {
  const { error } = await client.from('assinaturas').update({ status }).eq('id', id);
  if (error) throw new Error(`setStatusAssinatura: ${error.message}`);
}

/** Pagamento confirmado: vence_em anda 1 mês e a assinatura volta pra ativa. */
export async function renovarAssinatura(client: SupabaseClient, id: string, hoje: string): Promise<void> {
  const { data } = await client.from('assinaturas').select('vence_em').eq('id', id).maybeSingle();
  if (!data) return;
  const venceEm = (data as { vence_em: string }).vence_em;
  const { error } = await client.from('assinaturas')
    .update({ vence_em: novoVencimento(venceEm, hoje), status: 'ativa' }).eq('id', id);
  if (error) throw new Error(`renovarAssinatura: ${error.message}`);
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run tests/assinaturas-store.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/assinaturas-store.ts tests/assinaturas-store.test.ts
git commit -m "feat(assinaturas): store — listar/criar/editar/status/renovar (service-role)"
```

---

### Task 4: Amarra na cobrança (supabase.ts) + renovação no webhook

**Files:**
- Modify: `src/modules/supabase.ts:1331-1354` (criarCobranca + getCobrancaByOrderNsu)
- Modify: `src/index.ts` (webhook `/webhook/infinitepay`, ~linha 6612)

- [ ] **Step 1: criarCobranca aceita assinaturaId; getCobrancaByOrderNsu devolve**

Em `criarCobranca`, trocar a assinatura do método e o insert:

```ts
async criarCobranca(dados: { companyId: string | null; leadId?: string | null; assinaturaId?: string | null; descricao: string; valorCentavos: number }): Promise<{ id: string; orderNsu: string }> {
  const { data, error } = await this.getClient()
    .from('cobrancas')
    .insert({ company_id: dados.companyId, lead_id: dados.leadId ?? null, assinatura_id: dados.assinaturaId ?? null, descricao: dados.descricao, valor_centavos: dados.valorCentavos })
    .select('id, order_nsu')
    .single();
  if (error) throw new Error(`criarCobranca: ${error.message}`);
  return { id: data.id as string, orderNsu: data.order_nsu as string };
}
```

Em `getCobrancaByOrderNsu`, incluir `assinatura_id`:

```ts
async getCobrancaByOrderNsu(orderNsu: string): Promise<{ id: string; valorCentavos: number; status: string; companyId: string | null; leadId: string | null; assinaturaId: string | null } | null> {
  const { data } = await this.getClient()
    .from('cobrancas').select('id, valor_centavos, status, company_id, lead_id, assinatura_id')
    .eq('order_nsu', orderNsu).maybeSingle();
  if (!data) return null;
  return { id: data.id, valorCentavos: data.valor_centavos, status: data.status, companyId: data.company_id, leadId: data.lead_id, assinaturaId: data.assinatura_id ?? null };
}
```

- [ ] **Step 2: Webhook renova a assinatura ao confirmar**

Em `src/index.ts`, dentro do `if (marcou) { ... }` do webhook (depois do `console.log`), acrescentar:

```ts
if (cob.assinaturaId) {
  // Mensalidade: pagou → vencimento anda 1 mês e destrava se estava travada.
  try {
    const { renovarAssinatura } = await import('./modules/dashboard/assinaturas-store.js');
    const hoje = new Date().toISOString().slice(0, 10);
    await renovarAssinatura(supabaseClient, cob.assinaturaId, hoje);
  } catch (err) {
    console.error('[infinitepay] renovarAssinatura falhou:', (err as Error).message);
  }
}
```

⚠️ `supabaseClient` = o client service-role que o `index.ts` já tem em escopo (conferir o
nome da variável no arquivo — é o mesmo client que o `supabase` wrapper usa; se só o
wrapper existir em escopo, expor um `getRawClient()` no wrapper é aceitável).

- [ ] **Step 3: `npx tsc --noEmit` limpo + suíte** — `npx vitest run` → verde

- [ ] **Step 4: Commit**

```bash
git add src/modules/supabase.ts src/index.ts
git commit -m "feat(assinaturas): cobranca amarrada por assinatura_id + webhook renova vencimento ao pagar"
```

---

### Task 5: Views — a tela (TDD leve de render)

**Files:**
- Create: `src/modules/dashboard/assinaturas-views.ts`
- Modify: `src/modules/dashboard/views.ts:88` (union do `active` ganha `'assinaturas'`) e `views.ts:161-165` (item no setor Financeiro)
- Test: `tests/dashboard-assinaturas.test.ts`

- [ ] **Step 1: Teste que FALHA**

```ts
// tests/dashboard-assinaturas.test.ts
// Tela 📆 Assinaturas (Financeiro): lista com situação + botões manuais.
import { describe, it, expect } from 'vitest';
import { renderAssinaturasPage } from '../src/modules/dashboard/assinaturas-views.js';
import { renderLayout } from '../src/modules/dashboard/views.js';

const PRODUTOS = [
  { id: 'calculadora', nome: 'Calculadora Solar', valorCentavosPadrao: 5700 },
  { id: 'monitoramento', nome: 'Monitoramento de Usinas', valorCentavosPadrao: 29700 },
];
const ASSINATURAS = [
  { id: 'a1', produtoId: 'monitoramento', produtoNome: 'Monitoramento de Usinas', nome: 'Sabion Solar', email: 't@x.com', telefone: '5521999998888', zapConfirmado: false, valorCentavos: 29700, limite: 110, venceEm: '2026-08-29', status: 'ativa' as const },
];

describe('renderAssinaturasPage', () => {
  const html = renderAssinaturasPage(PRODUTOS, ASSINATURAS, '2026-07-29', undefined, undefined);
  it('mostra assinante, produto, valor em reais e vencimento', () => {
    expect(html).toContain('Sabion Solar');
    expect(html).toContain('Monitoramento de Usinas');
    expect(html).toContain('297,00');
    expect(html).toContain('29/08/2026');
  });
  it('tem os botões manuais e o form de nova assinatura', () => {
    expect(html).toContain('Gerar cobrança');
    expect(html).toContain('Travar');
    expect(html).toContain('/dashboard/assinaturas/nova');
  });
  it('mostra o limite do plano (110 usinas)', () => {
    expect(html).toContain('110');
  });
});

describe('menu lateral', () => {
  it('o link /dashboard/assinaturas aparece no setor Financeiro', () => {
    const html = renderLayout({ active: 'assinaturas', title: 'X', body: '' } as any);
    expect(html).toContain('href="/dashboard/assinaturas"');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/dashboard-assinaturas.test.ts` → FAIL

- [ ] **Step 3: Implementar a view**

```ts
// src/modules/dashboard/assinaturas-views.ts
// Tela "📆 Assinaturas" (setor Financeiro) — lista + botões manuais.
// Automático (avisos/trava) é a Fatia 2; aqui é o posto de comando do Junior.
import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import { situacaoDaAssinatura, type AssinaturaRow, type ProdutoRow, type Situacao } from './assinaturas-store.js';

const reais = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const dataBr = (iso: string) => iso.split('-').reverse().join('/');

const BADGE: Record<Situacao, string> = {
  ativa: '<span class="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">🟢 ativa</span>',
  vencendo: '<span class="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">🟡 vencendo</span>',
  vencida: '<span class="px-2 py-0.5 rounded-full text-xs bg-rose-100 text-rose-700">🔴 vencida</span>',
  travada: '<span class="px-2 py-0.5 rounded-full text-xs bg-slate-200 text-slate-700">⛔ travada</span>',
  cancelada: '<span class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-500">cancelada</span>',
};

export function renderAssinaturasPage(
  produtos: ProdutoRow[],
  assinaturas: AssinaturaRow[],
  hoje: string,
  user: DashUser | undefined,
  aviso?: { tipo: 'ok' | 'erro'; texto: string; link?: string },
): string {
  const linhas = assinaturas.map((a) => {
    const sit = situacaoDaAssinatura({ status: a.status, venceEm: a.venceEm }, hoje);
    const acaoStatus = a.status === 'travada'
      ? `<form method="post" action="/dashboard/assinaturas/${a.id}/status" class="inline"><input type="hidden" name="status" value="ativa"><button class="px-2 py-1 rounded bg-emerald-600 text-white text-xs">Liberar</button></form>`
      : `<form method="post" action="/dashboard/assinaturas/${a.id}/status" class="inline"><input type="hidden" name="status" value="travada"><button class="px-2 py-1 rounded bg-rose-600 text-white text-xs">Travar</button></form>`;
    return `<tr class="border-b border-slate-100 hover:bg-slate-50">
      <td class="px-4 py-3 font-medium">${escapeHtml(a.nome)}<div class="text-xs text-slate-400">${escapeHtml(a.email ?? '')}</div></td>
      <td class="px-4 py-3 text-sm">${escapeHtml(a.produtoNome)}</td>
      <td class="px-4 py-3 text-sm">R$ ${reais(a.valorCentavos)}</td>
      <td class="px-4 py-3 text-sm">${a.limite !== null ? `${a.limite} usinas` : '—'}</td>
      <td class="px-4 py-3 text-sm">${dataBr(a.venceEm)}</td>
      <td class="px-4 py-3">${BADGE[sit]}</td>
      <td class="px-4 py-3 text-sm">${a.telefone ? (a.zapConfirmado ? '✅ zap' : '📱 sem confirmar') : '—'}</td>
      <td class="px-4 py-3 whitespace-nowrap space-x-1">
        <form method="post" action="/dashboard/assinaturas/${a.id}/cobrar" class="inline"><button class="px-2 py-1 rounded bg-sky-600 text-white text-xs">Gerar cobrança</button></form>
        ${acaoStatus}
        <details class="inline-block align-middle"><summary class="cursor-pointer text-xs text-slate-500">✏️</summary>
          <form method="post" action="/dashboard/assinaturas/${a.id}/editar" class="mt-2 p-3 bg-slate-50 rounded-lg space-y-2 text-xs w-56">
            <label class="block">Valor (R$)<input name="valor" value="${reais(a.valorCentavos)}" class="w-full border rounded px-2 py-1"></label>
            <label class="block">Telefone (zap)<input name="telefone" value="${escapeHtml(a.telefone ?? '')}" class="w-full border rounded px-2 py-1"></label>
            <label class="block">Limite (usinas)<input name="limite" value="${a.limite ?? ''}" class="w-full border rounded px-2 py-1"></label>
            <label class="block">Vence em<input type="date" name="vence_em" value="${a.venceEm}" class="w-full border rounded px-2 py-1"></label>
            <button class="px-3 py-1 rounded bg-amber-400 text-slate-900 font-semibold">Salvar</button>
          </form>
        </details>
      </td>
    </tr>`;
  }).join('\n');

  const avisoHtml = aviso
    ? `<div class="mb-4 px-4 py-3 rounded-xl text-sm ${aviso.tipo === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}">${escapeHtml(aviso.texto)}${aviso.link ? ` <a href="${escapeHtml(aviso.link)}" target="_blank" class="underline break-all">${escapeHtml(aviso.link)}</a>` : ''}</div>`
    : '';

  const opcoesProduto = produtos.map((p) =>
    `<option value="${escapeHtml(p.id)}" data-valor="${reais(p.valorCentavosPadrao)}">${escapeHtml(p.nome)} — R$ ${reais(p.valorCentavosPadrao)}</option>`).join('');

  const body = `
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-slate-800">📆 Assinaturas</h1>
    <p class="text-sm text-slate-500 mt-1">Mensalidades dos produtos (calculadora, monitoramento). O aviso/trava automático entra na próxima fatia — aqui é o posto de comando manual.</p>
  </div>
  ${avisoHtml}
  <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto mb-8">
    <table class="w-full text-left">
      <thead class="text-xs uppercase tracking-wide text-slate-500 bg-slate-50"><tr>
        <th class="px-4 py-3">Assinante</th><th class="px-4 py-3">Produto</th><th class="px-4 py-3">Valor</th>
        <th class="px-4 py-3">Limite</th><th class="px-4 py-3">Vence</th><th class="px-4 py-3">Situação</th>
        <th class="px-4 py-3">Zap</th><th class="px-4 py-3">Ações</th>
      </tr></thead>
      <tbody>${linhas || '<tr><td colspan="8" class="px-4 py-8 text-center text-slate-400">Nenhuma assinatura ainda — crie a primeira aqui embaixo.</td></tr>'}</tbody>
    </table>
  </div>
  <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 max-w-xl">
    <h2 class="text-lg font-semibold text-slate-800 mb-1">➕ Nova assinatura</h2>
    <p class="text-xs text-slate-500 mb-4">O valor vem preenchido com o padrão do produto — pode mudar (negociado).</p>
    <form method="post" action="/dashboard/assinaturas/nova" class="space-y-3">
      <label class="block text-sm">Produto<select name="produto" required class="w-full border border-slate-300 rounded-lg px-3 py-2">${opcoesProduto}</select></label>
      <label class="block text-sm">Nome do assinante<input name="nome" required maxlength="80" class="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="Ex.: Sabion Solar"></label>
      <div class="grid grid-cols-2 gap-3">
        <label class="block text-sm">E-mail<input name="email" type="email" class="w-full border border-slate-300 rounded-lg px-3 py-2"></label>
        <label class="block text-sm">Telefone (zap)<input name="telefone" class="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="5561999998888"></label>
      </div>
      <div class="grid grid-cols-3 gap-3">
        <label class="block text-sm">Valor (R$)<input name="valor" required class="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="297,00"></label>
        <label class="block text-sm">Limite (usinas)<input name="limite" class="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="110"></label>
        <label class="block text-sm">1º vencimento<input type="date" name="vence_em" required class="w-full border border-slate-300 rounded-lg px-3 py-2"></label>
      </div>
      <button type="submit" class="px-4 py-2 rounded-lg bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300 transition">Criar assinatura</button>
    </form>
  </div>`;

  return renderLayout({ active: 'assinaturas', title: 'Assinaturas', body, user });
}
```

Em `views.ts`: acrescentar `'assinaturas'` na union do `active` (linha 88) e o item no setor Financeiro:

```ts
{ href: '/dashboard/assinaturas', key: 'assinaturas', label: '📆 Assinaturas', area: 'financeiro' },
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run tests/dashboard-assinaturas.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/assinaturas-views.ts src/modules/dashboard/views.ts tests/dashboard-assinaturas.test.ts
git commit -m "feat(assinaturas): tela no Financeiro — lista com situacao + botoes manuais + nova assinatura"
```

---

### Task 6: Rotas no router

**Files:**
- Modify: `src/modules/dashboard/router.ts` (depois do bloco de cobranças, ~linha 370)

- [ ] **Step 1: Implementar as rotas** (padrão empresas: dynamic import de store/views; gate `exigir('financeiro', ...)`; parse de valor pt-BR igual ao POST /cobrancas)

```ts
// ----- ASSINATURAS (central de mensalidades — spec 2026-07-29) -----
const parseReais = (v: unknown): number => Math.round(Number(String(v ?? '').replace(/\./g, '').replace(',', '.')) * 100);
const hojeISO = () => new Date().toISOString().slice(0, 10);

router.get('/assinaturas', exigir('financeiro', 'visualizar'), async (req: AuthedRequest, res) => {
  const { listarAssinaturas, listarProdutos } = await import('./assinaturas-store.js');
  const { renderAssinaturasPage } = await import('./assinaturas-views.js');
  const [produtos, assinaturas] = await Promise.all([listarProdutos(supabase), listarAssinaturas(supabase)]);
  const q = req.query as Record<string, string | undefined>;
  const aviso = q.ok ? { tipo: 'ok' as const, texto: q.ok, link: q.link } : q.erro ? { tipo: 'erro' as const, texto: q.erro } : undefined;
  res.type('html').send(renderAssinaturasPage(produtos, assinaturas, hojeISO(), req.dashUser, aviso));
});

router.post('/assinaturas/nova', exigir('financeiro', 'editar'), async (req: AuthedRequest, res) => {
  try {
    const { criarAssinatura } = await import('./assinaturas-store.js');
    const b = req.body ?? {};
    const valorCentavos = parseReais(b.valor);
    if (!b.produto || !String(b.nome ?? '').trim() || !(valorCentavos > 0) || !b.vence_em) {
      res.redirect('/dashboard/assinaturas?erro=' + encodeURIComponent('Preencha produto, nome, valor e vencimento.')); return;
    }
    await criarAssinatura(supabase, {
      produtoId: String(b.produto), nome: String(b.nome).trim(),
      email: String(b.email ?? '').trim() || null, telefone: String(b.telefone ?? '').replace(/\D/g, '') || null,
      valorCentavos, limite: b.limite ? Number(b.limite) : null, venceEm: String(b.vence_em),
    });
    res.redirect('/dashboard/assinaturas?ok=' + encodeURIComponent('Assinatura criada.'));
  } catch (err) {
    console.error('[assinaturas/nova]', err);
    res.redirect('/dashboard/assinaturas?erro=' + encodeURIComponent('Falha ao criar assinatura.'));
  }
});

router.post('/assinaturas/:id/cobrar', exigir('financeiro', 'editar'), async (req: AuthedRequest, res) => {
  try {
    const handle = options.infinitepayHandle;
    if (!handle) { res.redirect('/dashboard/assinaturas?erro=' + encodeURIComponent('Falta INFINITEPAY_HANDLE.')); return; }
    const { getAssinatura } = await import('./assinaturas-store.js');
    const a = await getAssinatura(supabase, String(req.params.id));
    if (!a) { res.redirect('/dashboard/assinaturas?erro=' + encodeURIComponent('Assinatura não achada.')); return; }
    const descricao = `${a.produtoNome} — mensalidade (${a.nome})`;
    const cob = await supabaseService.criarCobranca({ companyId: req.dashUser!.companyId, leadId: null, assinaturaId: a.id, descricao, valorCentavos: a.valorCentavos });
    const { criarLinkPagamento } = await import('../infinitepay.js');
    const base = (options.appBaseUrl ?? '').replace(/\/$/, '');
    const r = await criarLinkPagamento({
      handle, orderNsu: cob.orderNsu, itens: [{ descricao, valorCentavos: a.valorCentavos }],
      redirectUrl: base ? `${base}/pago` : undefined,
      webhookUrl: base ? `${base}/webhook/infinitepay` : undefined,
      cliente: { nome: a.nome, email: a.email ?? undefined, telefone: a.telefone ?? undefined },
    });
    if (!r.ok) { res.redirect('/dashboard/assinaturas?erro=' + encodeURIComponent(`Falha ao gerar link: ${r.reason}`)); return; }
    await supabaseService.salvarLinkCobranca(cob.id, r.url);
    res.redirect('/dashboard/assinaturas?ok=' + encodeURIComponent('Link gerado — manda pro assinante:') + '&link=' + encodeURIComponent(r.url));
  } catch (err) {
    console.error('[assinaturas/cobrar]', err);
    res.redirect('/dashboard/assinaturas?erro=' + encodeURIComponent('Falha ao gerar cobrança.'));
  }
});

router.post('/assinaturas/:id/status', exigir('financeiro', 'editar'), async (req: AuthedRequest, res) => {
  try {
    const status = String(req.body?.status ?? '');
    if (!['ativa', 'travada', 'cancelada'].includes(status)) { res.redirect('/dashboard/assinaturas?erro=' + encodeURIComponent('Status inválido.')); return; }
    const { setStatusAssinatura } = await import('./assinaturas-store.js');
    await setStatusAssinatura(supabase, String(req.params.id), status as 'ativa' | 'travada' | 'cancelada');
    res.redirect('/dashboard/assinaturas?ok=' + encodeURIComponent(status === 'travada' ? 'Assinatura travada.' : 'Assinatura liberada.'));
  } catch (err) {
    console.error('[assinaturas/status]', err);
    res.redirect('/dashboard/assinaturas?erro=' + encodeURIComponent('Falha ao mudar o status.'));
  }
});

router.post('/assinaturas/:id/editar', exigir('financeiro', 'editar'), async (req: AuthedRequest, res) => {
  try {
    const { editarAssinatura } = await import('./assinaturas-store.js');
    const b = req.body ?? {};
    const campos: { valorCentavos?: number; telefone?: string | null; limite?: number | null; venceEm?: string } = {};
    if (b.valor) { const v = parseReais(b.valor); if (v > 0) campos.valorCentavos = v; }
    if (b.telefone !== undefined) campos.telefone = String(b.telefone).replace(/\D/g, '') || null;
    if (b.limite !== undefined) campos.limite = b.limite ? Number(b.limite) : null;
    if (b.vence_em) campos.venceEm = String(b.vence_em);
    await editarAssinatura(supabase, String(req.params.id), campos);
    res.redirect('/dashboard/assinaturas?ok=' + encodeURIComponent('Assinatura atualizada.'));
  } catch (err) {
    console.error('[assinaturas/editar]', err);
    res.redirect('/dashboard/assinaturas?erro=' + encodeURIComponent('Falha ao salvar.'));
  }
});
```

⚠️ Conferir no router: o middleware de permissão pode se chamar `exigir` ou outro nome —
usar o MESMO que a rota `/financeiro` (linha 4723) usa. `supabase` = client que as rotas
de empresas já passam pros stores; `supabaseService` = wrapper com `criarCobranca`
(mesmos nomes já usados no POST /cobrancas, ~linha 300).

- [ ] **Step 2: `npx tsc --noEmit` limpo + `npx vitest run`** → verde

- [ ] **Step 3: Commit**

```bash
git add src/modules/dashboard/router.ts
git commit -m "feat(assinaturas): rotas — pagina, nova, cobrar agora, liberar/travar, editar"
```

---

### Task 7: Verificação final

- [ ] **Step 1:** `npx tsc --noEmit` → limpo
- [ ] **Step 2:** `npx vitest run` → suíte INTEIRA verde
- [ ] **Step 3:** Revisar o diff completo (`git diff main...HEAD`) com olho de reviewer
- [ ] **Step 4:** Push + PR **somente com ok do Junior** (avisar que a migration 090 precisa ser aplicada ANTES do deploy e o número combinado no grupo)
