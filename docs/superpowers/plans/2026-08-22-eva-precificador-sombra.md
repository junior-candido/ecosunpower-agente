# Eva Precificador Sombra (fatia 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Eva passa a ter (1) uma máquina de estados de venda por lead alimentada pelos ganchos que já existem, (2) uma tabela de preços de kit que o Junior mantém pelo zap (`/tabela ...` ou print da loja) e (3) um precificador puro que monta duas opções (A/B) e manda um **card de sombra** pro Junior — **sem enviar nada ao cliente**. O Junior compara com a proposta que faria; quando bater, a fatia 3 liga o envio.

**Architecture:** Três módulos puros testáveis sem mock (`estado-venda-regras.ts`, `autonomia.ts`, `precificador.ts`) + dois serviços com I/O (`EstadoVendaService`, `TabelaPrecosService`) + um orquestrador (`SombraService`) que lê o lead, decide a faixa, precifica, grava `propostas_versoes` (autor `eva`, `sombra: true`) e manda o card. Nenhum número nasce na IA: kWp pela régua 3,75 kWh/kWp·dia, módulos/micros por aritmética sobre a tabela, serviço por faixa (0,95/0,80/0,70 R$/Wp), parcela por `parcelaCartaoSolar`, trava por `compararGreener` + teto 2,60 R$/Wp. A IA só aparece na leitura de print da loja (vision → JSON → Junior confirma).

**Tech Stack:** TypeScript (ESM, imports `.js`), Express, Supabase (Postgres), Anthropic SDK (Haiku `claude-haiku-4-5-20251001` para vision), vitest 4.

**Spec:** `docs/superpowers/specs/2026-08-21-eva-vendedora-autonoma-design.md` §2 (regras 1, 3, 6), §3 (estados), §4 (precificação), §5 (formato do card), §7 (componentes), §8, §9, §10 fatia 2.

---

## Mapa de arquivos

| Ação | Arquivo | Responsabilidade |
|---|---|---|
| Create | `supabase/migrations/103_estado_venda.sql` | `leads.estado_venda` + `estado_venda_em` · tabela `propostas_versoes` |
| Create | `supabase/migrations/104_tabela_precos.sql` | tabela `tabela_precos` |
| Create | `src/modules/vendas/estado-venda-regras.ts` | **puro**: estados, transições válidas, `transicaoValida` |
| Create | `src/modules/vendas/estado-venda.ts` | `EstadoVendaService.transicionar` (lê, valida, grava, Elo) |
| Create | `src/modules/vendas/autonomia.ts` | **puro**: consumo-alvo, faixa (autônoma / chama Junior / fluxo atual), R$/Wp do serviço |
| Create | `src/modules/vendas/tabela-precos-parser.ts` | **puro**: `/tabela ...` → comando estruturado |
| Create | `src/modules/vendas/tabela-precos.ts` | `TabelaPrecosService` (listar, atualizar, itens ativos) + `makeTabelaHandler` |
| Create | `src/modules/vendas/tabela-precos-print.ts` | leitura de print da loja (vision → itens) + confirmação "ok tabela" |
| Create | `src/modules/vendas/precificador.ts` | **puro**: dimensiona, cota, serviço, trava, A/B, parcela |
| Create | `src/modules/vendas/card-sombra.ts` | **puro**: texto do card |
| Create | `src/modules/vendas/sombra.ts` | `SombraService.rodarParaLead` + `makeSombraHandler` (`/sombra <nome>`) |
| Modify | `src/index.ts` | instâncias, 2 handlers, gate de mídia, gancho automático no `update_lead`, ganchos de estado |
| Test | `tests/estado-venda-regras.test.ts`, `tests/estado-venda.test.ts`, `tests/autonomia.test.ts`, `tests/tabela-precos-parser.test.ts`, `tests/tabela-precos.test.ts`, `tests/tabela-precos-print.test.ts`, `tests/precificador.test.ts`, `tests/card-sombra.test.ts`, `tests/sombra.test.ts` | |

Convenções do repo (iguais à fatia 1): testes em `tests/*.test.ts`, **sem `vi.mock`** — deps injetadas no construtor, supabase falso com `from()` chainable; tempo **injetado** (`agoraMs`), nunca `Date.now()` dentro do módulo. Logs `console.*` com prefixo `[sombra]` / `[tabela]` / `[estado-venda]`. Elo: `registrarEvento(client, { tipo: 'comercial:...', ... })` de `src/modules/elo/eventos.ts` (nunca lança). IA medida com `medirIa` de `src/modules/custos/ia-metering.ts`. Migrations: **⚠️ combinar os números 103/104 no grupo do WhatsApp antes de aplicar** (CLAUDE.md). Handlers admin: assinatura `(from: string, text: string) => Promise<boolean>`, primeira linha `if (!isAdminPhone(from)) return false;`.

Decisões fechadas neste plano (para não reabrir):
- Lead **não tem** telhado nem fase no banco. Sombra assume `telhado = 'ceramico'` e escreve no card "telhado: assumido cerâmico". Fase não entra na fatia 2.
- Micros: cada linha de micro na `tabela_precos` tem `modulos_por_unidade` informado pelo Junior (nunca inferido).
- Estrutura: linha `estrutura` por tipo de telhado, preço **por módulo**. Cabos/proteção: linha `cabos_protecao`, preço **por kWp**.
- Estado inicial de um lead sem `estado_venda` = `'NOVO'` (não está na spec, mas a máquina precisa de um ponto de partida). `QUALIFICADO` é atingido quando o lead ganha `consumption_kwh`.
- A sombra **não** mexe no `estado_venda` (fica pra fatia 3, que liga PRECIFICANDO → AGUARDANDO_OK). Ela só grava `propostas_versoes` e manda o card.
- Uma sombra automática por lead (a primeira vez que `consumption_kwh` chega). `/sombra <nome>` roda quantas vezes quiser (nova versão).

---

### Task 1: Migrations 103 e 104

**Files:**
- Create: `supabase/migrations/103_estado_venda.sql`
- Create: `supabase/migrations/104_tabela_precos.sql`

- [ ] **Step 1: Escrever a migration de estado de venda + versões**

```sql
-- 103_estado_venda.sql
-- Esteira de estados por lead + versões de proposta (spec 2026-08-21 §3).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS estado_venda text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS estado_venda_em timestamptz;
CREATE INDEX IF NOT EXISTS idx_leads_estado_venda ON public.leads (estado_venda) WHERE estado_venda IS NOT NULL;

-- Toda proposta que a Eva monta (sombra ou real) ou que o Junior ajusta vira uma versão.
CREATE TABLE IF NOT EXISTS public.propostas_versoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Fundação multi-tenant (079/089): nasce carimbada EcoSun; tenant real
  -- entra quando vendas virar módulo do cardápio dos tenants.
  company_id     uuid REFERENCES public.companies(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  lead_id        uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  versao         integer NOT NULL,
  autor          text NOT NULL,             -- eva | junior
  sombra         boolean NOT NULL DEFAULT true,
  pedido_texto   text,                      -- o que o Junior escreveu pra gerar esta versão
  params_json    jsonb NOT NULL DEFAULT '{}',
  resultado_json jsonb NOT NULL DEFAULT '{}',
  enviada_em     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, versao)
);
CREATE INDEX IF NOT EXISTS idx_propostas_versoes_lead ON public.propostas_versoes (lead_id, versao DESC);

-- RLS: política padrão da casa (079/089/092/098). O app usa service role
-- (bypassa RLS); a política protege acesso direto com JWT de tenant.
ALTER TABLE public.propostas_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propostas_versoes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.propostas_versoes;
CREATE POLICY company_isolation ON public.propostas_versoes
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));
```

- [ ] **Step 2: Escrever a migration da tabela de preços**

```sql
-- 104_tabela_precos.sql
-- Tabela de preços do Junior (spec §4.2): item, modelo, preço unitário, fonte, atualizado_em.
-- Atualizada pelo zap (/tabela ...) ou por print da loja (Belenus/Sol Fácil) lido pela Eva.
CREATE TABLE IF NOT EXISTS public.tabela_precos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Fundação multi-tenant (079/089): nasce carimbada EcoSun; tenant real
  -- entra quando vendas virar módulo do cardápio dos tenants.
  company_id           uuid REFERENCES public.companies(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  tipo                 text NOT NULL,        -- modulo | micro | estrutura | cabos_protecao
  marca                text NOT NULL,        -- JA | Risen | Hoymiles | GoodWe | Sungrow | (estrutura: ceramico|fibrocimento|metalico|laje) | (cabos: geral)
  modelo               text NOT NULL,        -- "625" | "HMS-2000-4T" | "ceramico" | "geral"
  potencia_w           integer,              -- módulo: Wp · micro: W de saída (informativo)
  modulos_por_unidade  integer,              -- micro: quantos módulos cada micro aceita (Junior informa, nunca inferido)
  preco_unitario       numeric(12,2) NOT NULL,
  unidade              text NOT NULL,        -- un | modulo | kwp
  fonte                text,                 -- belenus | solfacil | junior
  ativo                boolean NOT NULL DEFAULT true,
  atualizado_em        timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, tipo, marca, modelo)
);
CREATE INDEX IF NOT EXISTS idx_tabela_precos_ativos ON public.tabela_precos (company_id, tipo) WHERE ativo;

-- RLS: política padrão da casa (079/089/092/098). O app usa service role
-- (bypassa RLS); a política protege acesso direto com JWT de tenant.
ALTER TABLE public.tabela_precos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tabela_precos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.tabela_precos;
CREATE POLICY company_isolation ON public.tabela_precos
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));
```

- [ ] **Step 3: Rodar a guarda de migrations**

Run: `npx vitest run tests/migrations-tenant-guard.test.ts`
Expected: PASS (as duas tabelas têm `company_id` + `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` no mesmo arquivo).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/103_estado_venda.sql supabase/migrations/104_tabela_precos.sql
git commit -m "feat(vendas): migrations estado_venda + propostas_versoes + tabela_precos"
```

---

### Task 2: Regras puras da máquina de estados

**Files:**
- Create: `src/modules/vendas/estado-venda-regras.ts`
- Test: `tests/estado-venda-regras.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/estado-venda-regras.test.ts
import { describe, it, expect } from 'vitest';
import { ESTADOS_VENDA, TRANSICOES, transicaoValida, estadoOuNovo } from '../src/modules/vendas/estado-venda-regras.js';

describe('estado-venda-regras', () => {
  it('lista os estados da spec §3 + NOVO', () => {
    expect(ESTADOS_VENDA).toEqual([
      'NOVO', 'QUALIFICADO', 'PRECIFICANDO', 'AGUARDANDO_OK', 'CHAMA_JUNIOR',
      'PROPOSTA_ENVIADA', 'FOLLOWUP_VIVO', 'AGENDADO', 'QUER_JUNIOR', 'FECHADO', 'PERDIDO',
    ]);
  });

  it('aceita as transições do desenho', () => {
    expect(transicaoValida('NOVO', 'QUALIFICADO')).toBe(true);
    expect(transicaoValida('QUALIFICADO', 'PRECIFICANDO')).toBe(true);
    expect(transicaoValida('QUALIFICADO', 'CHAMA_JUNIOR')).toBe(true);
    expect(transicaoValida('PRECIFICANDO', 'AGUARDANDO_OK')).toBe(true);
    expect(transicaoValida('AGUARDANDO_OK', 'PRECIFICANDO')).toBe(true); // ajuste → refaz
    expect(transicaoValida('AGUARDANDO_OK', 'PROPOSTA_ENVIADA')).toBe(true);
    expect(transicaoValida('CHAMA_JUNIOR', 'PROPOSTA_ENVIADA')).toBe(true);
    expect(transicaoValida('PROPOSTA_ENVIADA', 'FOLLOWUP_VIVO')).toBe(true);
    expect(transicaoValida('FOLLOWUP_VIVO', 'AGENDADO')).toBe(true);
    expect(transicaoValida('AGENDADO', 'FECHADO')).toBe(true);
    expect(transicaoValida('AGENDADO', 'FOLLOWUP_VIVO')).toBe(true); // visita sem fechamento volta pro ritmo
  });

  it('rejeita transições inválidas e estados terminais', () => {
    expect(transicaoValida('NOVO', 'PROPOSTA_ENVIADA')).toBe(false);
    expect(transicaoValida('FECHADO', 'FOLLOWUP_VIVO')).toBe(false);
    expect(transicaoValida('PERDIDO', 'QUALIFICADO')).toBe(false);
    expect(transicaoValida('QUALIFICADO', 'QUALIFICADO')).toBe(false);
  });

  it('QUER_JUNIOR e PERDIDO podem vir de qualquer estado vivo; FECHADO de qualquer estado pós-proposta', () => {
    for (const de of ['QUALIFICADO', 'PRECIFICANDO', 'AGUARDANDO_OK', 'PROPOSTA_ENVIADA', 'FOLLOWUP_VIVO', 'AGENDADO']) {
      expect(transicaoValida(de as any, 'QUER_JUNIOR')).toBe(true);
      expect(transicaoValida(de as any, 'PERDIDO')).toBe(true);
    }
    expect(transicaoValida('NOVO', 'PERDIDO')).toBe(true);
    expect(transicaoValida('PROPOSTA_ENVIADA', 'FECHADO')).toBe(true);
    expect(transicaoValida('QUER_JUNIOR', 'FECHADO')).toBe(true);
    expect(transicaoValida('QUER_JUNIOR', 'PROPOSTA_ENVIADA')).toBe(true); // Junior posta proposta depois do takeover
  });

  it('estadoOuNovo trata null/lixo como NOVO', () => {
    expect(estadoOuNovo(null)).toBe('NOVO');
    expect(estadoOuNovo(undefined)).toBe('NOVO');
    expect(estadoOuNovo('banana')).toBe('NOVO');
    expect(estadoOuNovo('FECHADO')).toBe('FECHADO');
  });

  it('TRANSICOES cobre todo estado', () => {
    for (const e of ESTADOS_VENDA) expect(Array.isArray(TRANSICOES[e])).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/estado-venda-regras.test.ts`
Expected: FAIL — `Cannot find module '../src/modules/vendas/estado-venda-regras.js'`

- [ ] **Step 3: Implementar**

```ts
// src/modules/vendas/estado-venda-regras.ts
// Esteira de estados por lead (spec 2026-08-21 §3). PURO: sem I/O.
// Transições só por função nomeada; qualquer outra é rejeitada.

export const ESTADOS_VENDA = [
  'NOVO', 'QUALIFICADO', 'PRECIFICANDO', 'AGUARDANDO_OK', 'CHAMA_JUNIOR',
  'PROPOSTA_ENVIADA', 'FOLLOWUP_VIVO', 'AGENDADO', 'QUER_JUNIOR', 'FECHADO', 'PERDIDO',
] as const;
export type EstadoVenda = typeof ESTADOS_VENDA[number];

const VIVOS_POS_QUALIFICACAO: EstadoVenda[] = [
  'QUALIFICADO', 'PRECIFICANDO', 'AGUARDANDO_OK', 'CHAMA_JUNIOR', 'PROPOSTA_ENVIADA', 'FOLLOWUP_VIVO', 'AGENDADO',
];

export const TRANSICOES: Record<EstadoVenda, EstadoVenda[]> = {
  NOVO:             ['QUALIFICADO', 'PERDIDO', 'QUER_JUNIOR'],
  QUALIFICADO:      ['PRECIFICANDO', 'CHAMA_JUNIOR', 'PROPOSTA_ENVIADA', 'QUER_JUNIOR', 'PERDIDO'],
  PRECIFICANDO:     ['AGUARDANDO_OK', 'CHAMA_JUNIOR', 'QUER_JUNIOR', 'PERDIDO'],
  AGUARDANDO_OK:    ['PRECIFICANDO', 'PROPOSTA_ENVIADA', 'CHAMA_JUNIOR', 'QUER_JUNIOR', 'PERDIDO'],
  CHAMA_JUNIOR:     ['PROPOSTA_ENVIADA', 'QUER_JUNIOR', 'PERDIDO'],
  PROPOSTA_ENVIADA: ['FOLLOWUP_VIVO', 'AGENDADO', 'QUER_JUNIOR', 'FECHADO', 'PERDIDO'],
  FOLLOWUP_VIVO:    ['AGENDADO', 'QUER_JUNIOR', 'FECHADO', 'PERDIDO', 'PROPOSTA_ENVIADA'],
  AGENDADO:         ['FOLLOWUP_VIVO', 'QUER_JUNIOR', 'FECHADO', 'PERDIDO'],
  QUER_JUNIOR:      ['PROPOSTA_ENVIADA', 'FOLLOWUP_VIVO', 'AGENDADO', 'FECHADO', 'PERDIDO'],
  FECHADO:          [],
  PERDIDO:          [],
};

export function estadoOuNovo(v: unknown): EstadoVenda {
  return (ESTADOS_VENDA as readonly string[]).includes(String(v)) ? (v as EstadoVenda) : 'NOVO';
}

export function transicaoValida(de: EstadoVenda, para: EstadoVenda): boolean {
  if (de === para) return false;
  return TRANSICOES[de]?.includes(para) ?? false;
}

// Guarda de sanidade: todo estado alcançável a partir de NOVO (usado só em teste/dev).
export function estadosAlcancaveis(): EstadoVenda[] {
  const vistos = new Set<EstadoVenda>(['NOVO']);
  const fila: EstadoVenda[] = ['NOVO'];
  while (fila.length) {
    const e = fila.shift()!;
    for (const p of TRANSICOES[e]) if (!vistos.has(p)) { vistos.add(p); fila.push(p); }
  }
  return [...vistos];
}

export { VIVOS_POS_QUALIFICACAO };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/estado-venda-regras.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add src/modules/vendas/estado-venda-regras.ts tests/estado-venda-regras.test.ts
git commit -m "feat(vendas): regras puras da esteira de estados de venda"
```

---

### Task 3: `EstadoVendaService` — transicionar com log

**Files:**
- Create: `src/modules/vendas/estado-venda.ts`
- Test: `tests/estado-venda.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/estado-venda.test.ts
import { describe, it, expect, vi } from 'vitest';
import { EstadoVendaService } from '../src/modules/vendas/estado-venda.js';

type Row = Record<string, any>;
function fakeDb() {
  const tabelas: Record<string, Row[]> = { leads: [], eventos_elo: [] };
  const from = (t: string) => {
    const filtros: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => { filtros.push(r => r[k] === v); return q; },
      maybeSingle: async () => ({ data: tabelas[t].find(r => filtros.every(f => f(r))) ?? null, error: null }),
      update: (p: Row) => { patch = p; return q; },
      insert: async (rows: Row | Row[]) => { tabelas[t].push(...(Array.isArray(rows) ? rows : [rows])); return { data: null, error: null }; },
      then: (res: any) => {
        if (patch) for (const r of tabelas[t]) if (filtros.every(f => f(r))) Object.assign(r, patch);
        return Promise.resolve({ data: null, error: null }).then(res);
      },
    };
    return q;
  };
  return { tabelas, client: { from } };
}
const T0 = Date.UTC(2026, 7, 24, 15, 0, 0);

describe('EstadoVendaService', () => {
  it('NOVO → QUALIFICADO grava estado, carimbo e evento no Elo', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', estado_venda: null, company_id: 'C1' });
    const svc = new EstadoVendaService({ client: db.client as any, registrarEvento: vi.fn().mockResolvedValue(undefined) });
    const r = await svc.transicionar({ leadId: 'L1', para: 'QUALIFICADO', motivo: 'consumo informado', autor: 'eva', agoraMs: T0 });
    expect(r).toEqual({ ok: true, de: 'NOVO', para: 'QUALIFICADO' });
    expect(db.tabelas.leads[0].estado_venda).toBe('QUALIFICADO');
    expect(db.tabelas.leads[0].estado_venda_em).toBe(new Date(T0).toISOString());
    expect((svc as any).deps.registrarEvento).toHaveBeenCalledWith(db.client, expect.objectContaining({
      tipo: 'comercial:estado_venda', leadId: 'L1', companyId: 'C1',
      payload: expect.objectContaining({ de: 'NOVO', para: 'QUALIFICADO', motivo: 'consumo informado', autor: 'eva' }),
    }));
  });

  it('rejeita transição inválida sem tocar no banco', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', estado_venda: 'FECHADO' });
    const reg = vi.fn();
    const svc = new EstadoVendaService({ client: db.client as any, registrarEvento: reg });
    const r = await svc.transicionar({ leadId: 'L1', para: 'FOLLOWUP_VIVO', motivo: 'x', autor: 'eva', agoraMs: T0 });
    expect(r).toEqual({ ok: false, de: 'FECHADO', para: 'FOLLOWUP_VIVO', erro: 'transicao_invalida' });
    expect(db.tabelas.leads[0].estado_venda).toBe('FECHADO');
    expect(reg).not.toHaveBeenCalled();
  });

  it('mesmo estado = no-op silencioso (idempotente)', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', estado_venda: 'FOLLOWUP_VIVO' });
    const reg = vi.fn();
    const svc = new EstadoVendaService({ client: db.client as any, registrarEvento: reg });
    const r = await svc.transicionar({ leadId: 'L1', para: 'FOLLOWUP_VIVO', motivo: 'x', autor: 'eva', agoraMs: T0 });
    expect(r).toEqual({ ok: true, de: 'FOLLOWUP_VIVO', para: 'FOLLOWUP_VIVO', noop: true });
    expect(reg).not.toHaveBeenCalled();
  });

  it('lead inexistente → erro lead_nao_encontrado', async () => {
    const db = fakeDb();
    const svc = new EstadoVendaService({ client: db.client as any, registrarEvento: vi.fn() });
    const r = await svc.transicionar({ leadId: 'X', para: 'QUALIFICADO', motivo: 'x', autor: 'eva', agoraMs: T0 });
    expect(r.ok).toBe(false);
    expect((r as any).erro).toBe('lead_nao_encontrado');
  });

  it('nunca lança: erro do banco vira {ok:false, erro:"banco"}', async () => {
    const client = { from: () => { throw new Error('boom'); } };
    const svc = new EstadoVendaService({ client: client as any, registrarEvento: vi.fn() });
    const r = await svc.transicionar({ leadId: 'L1', para: 'QUALIFICADO', motivo: 'x', autor: 'eva', agoraMs: T0 });
    expect(r).toEqual({ ok: false, de: 'NOVO', para: 'QUALIFICADO', erro: 'banco' });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/estado-venda.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar**

```ts
// src/modules/vendas/estado-venda.ts
// Máquina de estados de venda (spec §3). Toda mudança passa por transicionar(): valida, grava, loga no Elo.
// NUNCA lança — quem chama já está no meio de um fluxo (envio, resposta, takeover) e não pode cair por causa disso.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventoInput } from '../elo/eventos.js';
import { type EstadoVenda, estadoOuNovo, transicaoValida } from './estado-venda-regras.js';

export interface EstadoVendaDeps {
  client: SupabaseClient;
  registrarEvento: (client: any, ev: EventoInput) => Promise<void>;
}

export interface TransicaoInput {
  leadId: string;
  para: EstadoVenda;
  motivo: string;
  autor: 'eva' | 'junior' | 'sistema';
  agoraMs: number;
}

export type TransicaoResultado =
  | { ok: true; de: EstadoVenda; para: EstadoVenda; noop?: true }
  | { ok: false; de: EstadoVenda; para: EstadoVenda; erro: 'transicao_invalida' | 'lead_nao_encontrado' | 'banco' };

export class EstadoVendaService {
  constructor(private readonly deps: EstadoVendaDeps) {}

  async transicionar(t: TransicaoInput): Promise<TransicaoResultado> {
    let de: EstadoVenda = 'NOVO';
    try {
      const { data: lead } = await this.deps.client
        .from('leads').select('id, estado_venda, company_id').eq('id', t.leadId).maybeSingle();
      if (!lead) return { ok: false, de, para: t.para, erro: 'lead_nao_encontrado' };
      de = estadoOuNovo((lead as any).estado_venda);
      if (de === t.para) return { ok: true, de, para: t.para, noop: true };
      if (!transicaoValida(de, t.para)) {
        console.warn(`[estado-venda] transição inválida ${de} → ${t.para} (lead ${t.leadId}, ${t.motivo})`);
        return { ok: false, de, para: t.para, erro: 'transicao_invalida' };
      }
      const em = new Date(t.agoraMs).toISOString();
      await this.deps.client.from('leads').update({ estado_venda: t.para, estado_venda_em: em }).eq('id', t.leadId);
      await this.deps.registrarEvento(this.deps.client, {
        tipo: 'comercial:estado_venda',
        leadId: t.leadId,
        companyId: (lead as any).company_id ?? null,
        canal: 'sistema',
        origem: 'estado-venda',
        payload: { de, para: t.para, motivo: t.motivo, autor: t.autor, em },
      });
      console.log(`[estado-venda] ${de} → ${t.para} lead=${t.leadId} (${t.autor}: ${t.motivo})`);
      return { ok: true, de, para: t.para };
    } catch (e) {
      console.error('[estado-venda] erro', e instanceof Error ? e.message : e);
      return { ok: false, de, para: t.para, erro: 'banco' };
    }
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/estado-venda.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add src/modules/vendas/estado-venda.ts tests/estado-venda.test.ts
git commit -m "feat(vendas): EstadoVendaService.transicionar com validação e Elo"
```

---

### Task 4: Autonomia (faixa) — puro

**Files:**
- Create: `src/modules/vendas/autonomia.ts`
- Test: `tests/autonomia.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/autonomia.test.ts
import { describe, it, expect } from 'vitest';
import { consumoAlvo, decidirFaixa, servicoRsPorWp, FAIXA_AUTONOMA } from '../src/modules/vendas/autonomia.js';

describe('autonomia', () => {
  it('consumo-alvo = maior entre fatura atual e carga futura declarada (spec §2.3)', () => {
    expect(consumoAlvo({ consumoKwh: 600, cargaFuturaKwh: null })).toBe(600);
    expect(consumoAlvo({ consumoKwh: 400, cargaFuturaKwh: 800 })).toBe(800);
    expect(consumoAlvo({ consumoKwh: null, cargaFuturaKwh: 700 })).toBe(700);
    expect(consumoAlvo({ consumoKwh: null, cargaFuturaKwh: null })).toBeNull();
    expect(consumoAlvo({ consumoKwh: 0, cargaFuturaKwh: undefined })).toBeNull();
  });

  it('faixa 500–1.500 = autônoma; >1.500 = chama Junior; <500 = fluxo atual', () => {
    expect(FAIXA_AUTONOMA).toEqual({ min: 500, max: 1500 });
    expect(decidirFaixa(500)).toBe('autonoma');
    expect(decidirFaixa(1500)).toBe('autonoma');
    expect(decidirFaixa(1501)).toBe('chama_junior');
    expect(decidirFaixa(499)).toBe('fluxo_atual');
    expect(decidirFaixa(null)).toBe('sem_dados');
  });

  it('serviço por faixa: 0,95 / 0,80 / 0,70 R$/Wp (aprovado 21/08)', () => {
    expect(servicoRsPorWp(500)).toBe(0.95);
    expect(servicoRsPorWp(699)).toBe(0.95);
    expect(servicoRsPorWp(700)).toBe(0.80);
    expect(servicoRsPorWp(999)).toBe(0.80);
    expect(servicoRsPorWp(1000)).toBe(0.70);
    expect(servicoRsPorWp(1500)).toBe(0.70);
  });

  it('fora da faixa autônoma usa a ponta mais próxima (pra card de sombra acima de 1.500 ainda mostrar um número)', () => {
    expect(servicoRsPorWp(2000)).toBe(0.70);
    expect(servicoRsPorWp(300)).toBe(0.95);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/autonomia.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar**

```ts
// src/modules/vendas/autonomia.ts
// Decide a faixa de autonomia da Eva (spec §2.3, §4.3). PURO.
// Consumo-ALVO = fatura atual OU carga futura declarada — nunca corta pela fatura de hoje.

export const FAIXA_AUTONOMA = { min: 500, max: 1500 } as const;

export type Faixa = 'autonoma' | 'chama_junior' | 'fluxo_atual' | 'sem_dados';

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function consumoAlvo(p: { consumoKwh?: unknown; cargaFuturaKwh?: unknown }): number | null {
  const a = num(p.consumoKwh);
  const b = num(p.cargaFuturaKwh);
  if (a === null && b === null) return null;
  return Math.max(a ?? 0, b ?? 0);
}

export function decidirFaixa(consumoAlvoKwh: number | null): Faixa {
  if (consumoAlvoKwh === null) return 'sem_dados';
  if (consumoAlvoKwh < FAIXA_AUTONOMA.min) return 'fluxo_atual';
  if (consumoAlvoKwh > FAIXA_AUTONOMA.max) return 'chama_junior';
  return 'autonoma';
}

// Tabela de serviço aprovada 21/08 (referência Greener jun/2025).
const SERVICO_POR_FAIXA: ReadonlyArray<{ ateKwh: number; rsPorWp: number }> = [
  { ateKwh: 700,  rsPorWp: 0.95 },
  { ateKwh: 1000, rsPorWp: 0.80 },
  { ateKwh: Infinity, rsPorWp: 0.70 },
];

export function servicoRsPorWp(consumoAlvoKwh: number): number {
  return (SERVICO_POR_FAIXA.find(f => consumoAlvoKwh < f.ateKwh) ?? SERVICO_POR_FAIXA[SERVICO_POR_FAIXA.length - 1]).rsPorWp;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/autonomia.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add src/modules/vendas/autonomia.ts tests/autonomia.test.ts
git commit -m "feat(vendas): faixa de autonomia e serviço por faixa (puro)"
```

---

### Task 5: Parser do comando `/tabela` — puro

**Files:**
- Create: `src/modules/vendas/tabela-precos-parser.ts`
- Test: `tests/tabela-precos-parser.test.ts`

Gramática (texto livre do Junior, tudo case-insensitive; vírgula ou ponto nos decimais):
- `/tabela` → `{ acao: 'listar' }`
- `/tabela JA 625 = 980` → módulo JA 625 Wp a R$ 980/un
- `/tabela modulo Risen 715 = 1.050,00` (prefixo opcional `modulo`)
- `/tabela micro Hoymiles HMS-2000-4T 4 = 1450` → micro, 4 módulos por unidade, R$ 1.450/un
- `/tabela micro GoodWe GW2000-MIS = 1300` → sem módulos/unidade → `erro: 'micro_sem_modulos_por_unidade'`
- `/tabela estrutura ceramico = 95` → R$ 95 por módulo
- `/tabela estrutura fibrocimento = 80`
- `/tabela cabos = 420` → cabos/proteção R$ 420 por kWp
- `/tabela tira JA 625` → desativa
- `/tabela fonte belenus JA 625 = 980` → com fonte

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/tabela-precos-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseComandoTabela } from '../src/modules/vendas/tabela-precos-parser.js';

describe('parseComandoTabela', () => {
  it('ignora o que não é /tabela', () => {
    expect(parseComandoTabela('oi')).toBeNull();
    expect(parseComandoTabela('/tabelao')).toBeNull();
  });
  it('/tabela sozinho lista', () => {
    expect(parseComandoTabela('/tabela')).toEqual({ acao: 'listar' });
    expect(parseComandoTabela('tabela ')).toEqual({ acao: 'listar' });
  });
  it('módulo sem prefixo', () => {
    expect(parseComandoTabela('/tabela JA 625 = 980')).toEqual({
      acao: 'atualizar', item: { tipo: 'modulo', marca: 'JA', modelo: '625', potenciaW: 625, modulosPorUnidade: null, precoUnitario: 980, unidade: 'un', fonte: 'junior' },
    });
  });
  it('módulo com prefixo e preço com milhar/vírgula', () => {
    expect(parseComandoTabela('/tabela modulo Risen 715 = 1.050,00')?.item).toMatchObject({ tipo: 'modulo', marca: 'Risen', modelo: '715', potenciaW: 715, precoUnitario: 1050 });
  });
  it('micro com módulos por unidade', () => {
    expect(parseComandoTabela('/tabela micro Hoymiles HMS-2000-4T 4 = 1450')?.item).toEqual({
      tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T', potenciaW: null, modulosPorUnidade: 4, precoUnitario: 1450, unidade: 'un', fonte: 'junior',
    });
  });
  it('micro sem módulos por unidade é erro (nunca inferir)', () => {
    expect(parseComandoTabela('/tabela micro GoodWe GW2000-MIS = 1300')).toEqual({ acao: 'erro', erro: 'micro_sem_modulos_por_unidade' });
  });
  it('estrutura por tipo de telhado, preço por módulo', () => {
    expect(parseComandoTabela('/tabela estrutura ceramico = 95')?.item).toEqual({
      tipo: 'estrutura', marca: 'ceramico', modelo: 'ceramico', potenciaW: null, modulosPorUnidade: null, precoUnitario: 95, unidade: 'modulo', fonte: 'junior',
    });
    expect(parseComandoTabela('/tabela estrutura Fibrocimento = 80')?.item).toMatchObject({ marca: 'fibrocimento' });
    expect(parseComandoTabela('/tabela estrutura telha colonial = 95')).toEqual({ acao: 'erro', erro: 'telhado_desconhecido' });
  });
  it('cabos/proteção por kWp', () => {
    expect(parseComandoTabela('/tabela cabos = 420')?.item).toEqual({
      tipo: 'cabos_protecao', marca: 'geral', modelo: 'geral', potenciaW: null, modulosPorUnidade: null, precoUnitario: 420, unidade: 'kwp', fonte: 'junior',
    });
  });
  it('fonte opcional', () => {
    expect(parseComandoTabela('/tabela fonte belenus JA 625 = 980')?.item).toMatchObject({ fonte: 'belenus', marca: 'JA' });
    expect(parseComandoTabela('/tabela fonte solfacil micro Sungrow S2500S-L 4 = 1500')?.item).toMatchObject({ fonte: 'solfacil', tipo: 'micro' });
  });
  it('tira desativa', () => {
    expect(parseComandoTabela('/tabela tira JA 625')).toEqual({ acao: 'desativar', tipo: 'modulo', marca: 'JA', modelo: '625' });
    expect(parseComandoTabela('/tabela tira micro Hoymiles HMS-2000-4T')).toEqual({ acao: 'desativar', tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T' });
  });
  it('preço zero/negativo/ausente é erro', () => {
    expect(parseComandoTabela('/tabela JA 625 = 0')).toEqual({ acao: 'erro', erro: 'preco_invalido' });
    expect(parseComandoTabela('/tabela JA 625')).toEqual({ acao: 'erro', erro: 'formato' });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/tabela-precos-parser.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar**

```ts
// src/modules/vendas/tabela-precos-parser.ts
// Parser do comando /tabela (spec §4.2). PURO, sem IA: o Junior escreve, a gente lê.

export type TipoItem = 'modulo' | 'micro' | 'estrutura' | 'cabos_protecao';
export type FonteItem = 'junior' | 'belenus' | 'solfacil';
export const TELHADOS = ['ceramico', 'fibrocimento', 'metalico', 'laje'] as const;
export type Telhado = typeof TELHADOS[number];

export interface ItemTabela {
  tipo: TipoItem;
  marca: string;
  modelo: string;
  potenciaW: number | null;
  modulosPorUnidade: number | null;
  precoUnitario: number;
  unidade: 'un' | 'modulo' | 'kwp';
  fonte: FonteItem;
}

export type ComandoTabela =
  | { acao: 'listar' }
  | { acao: 'atualizar'; item: ItemTabela }
  | { acao: 'desativar'; tipo: TipoItem; marca: string; modelo: string }
  | { acao: 'erro'; erro: 'formato' | 'preco_invalido' | 'micro_sem_modulos_por_unidade' | 'telhado_desconhecido' };

export function parsePrecoBr(s: string): number | null {
  const limpo = s.trim().replace(/^r\$\s*/i, '');
  // "1.050,00" → 1050 · "980" → 980 · "1450.50" → 1450.5
  const norm = /,\d{1,2}$/.test(limpo) ? limpo.replace(/\./g, '').replace(',', '.') : limpo.replace(/,/g, '');
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

const normalizarTelhado = (s: string): Telhado | null => {
  const t = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return (TELHADOS as readonly string[]).includes(t) ? (t as Telhado) : null;
};

export function parseComandoTabela(texto: string): ComandoTabela | null {
  const m = /^\/?tabela(?:\s+(.*))?$/i.exec(texto.trim());
  if (!m) return null;
  let resto = (m[1] ?? '').trim();
  if (!resto) return { acao: 'listar' };

  let fonte: FonteItem = 'junior';
  const mf = /^fonte\s+(belenus|solfacil|sol\s*f[áa]cil)\s+/i.exec(resto);
  if (mf) { fonte = /belenus/i.test(mf[1]) ? 'belenus' : 'solfacil'; resto = resto.slice(mf[0].length); }

  const tira = /^tira\s+(.+)$/i.exec(resto);
  if (tira) {
    const alvo = tira[1].trim();
    const mm = /^micro\s+(\S+)\s+(\S+)$/i.exec(alvo);
    if (mm) return { acao: 'desativar', tipo: 'micro', marca: mm[1], modelo: mm[2] };
    const me = /^estrutura\s+(\S+)$/i.exec(alvo);
    if (me) { const t = normalizarTelhado(me[1]); return t ? { acao: 'desativar', tipo: 'estrutura', marca: t, modelo: t } : { acao: 'erro', erro: 'telhado_desconhecido' }; }
    if (/^cabos$/i.test(alvo)) return { acao: 'desativar', tipo: 'cabos_protecao', marca: 'geral', modelo: 'geral' };
    const mo = /^(?:modulo\s+)?(\S+)\s+(\d{3,4})$/i.exec(alvo);
    if (mo) return { acao: 'desativar', tipo: 'modulo', marca: mo[1], modelo: mo[2] };
    return { acao: 'erro', erro: 'formato' };
  }

  const partes = resto.split('=');
  if (partes.length !== 2) return { acao: 'erro', erro: 'formato' };
  const esquerda = partes[0].trim();
  const preco = parsePrecoBr(partes[1]);
  if (preco === null) return { acao: 'erro', erro: 'formato' };
  if (preco <= 0) return { acao: 'erro', erro: 'preco_invalido' };

  const base = { precoUnitario: preco, fonte };

  const micro = /^micro\s+(\S+)\s+(\S+)(?:\s+(\d{1,2}))?$/i.exec(esquerda);
  if (micro) {
    if (!micro[3]) return { acao: 'erro', erro: 'micro_sem_modulos_por_unidade' };
    return { acao: 'atualizar', item: { tipo: 'micro', marca: micro[1], modelo: micro[2], potenciaW: null, modulosPorUnidade: Number(micro[3]), unidade: 'un', ...base } };
  }
  const estr = /^estrutura\s+(.+)$/i.exec(esquerda);
  if (estr) {
    const t = normalizarTelhado(estr[1]);
    if (!t) return { acao: 'erro', erro: 'telhado_desconhecido' };
    return { acao: 'atualizar', item: { tipo: 'estrutura', marca: t, modelo: t, potenciaW: null, modulosPorUnidade: null, unidade: 'modulo', ...base } };
  }
  if (/^cabos$/i.test(esquerda)) {
    return { acao: 'atualizar', item: { tipo: 'cabos_protecao', marca: 'geral', modelo: 'geral', potenciaW: null, modulosPorUnidade: null, unidade: 'kwp', ...base } };
  }
  const mod = /^(?:modulo\s+)?(\S+)\s+(\d{3,4})$/i.exec(esquerda);
  if (mod) {
    return { acao: 'atualizar', item: { tipo: 'modulo', marca: mod[1], modelo: mod[2], potenciaW: Number(mod[2]), modulosPorUnidade: null, unidade: 'un', ...base } };
  }
  return { acao: 'erro', erro: 'formato' };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/tabela-precos-parser.test.ts`
Expected: PASS (11 testes)

- [ ] **Step 5: Commit**

```bash
git add src/modules/vendas/tabela-precos-parser.ts tests/tabela-precos-parser.test.ts
git commit -m "feat(vendas): parser puro do comando /tabela"
```

---

### Task 6: `TabelaPrecosService` + handler `/tabela`

**Files:**
- Create: `src/modules/vendas/tabela-precos.ts`
- Test: `tests/tabela-precos.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/tabela-precos.test.ts
import { describe, it, expect, vi } from 'vitest';
import { TabelaPrecosService, makeTabelaHandler, formatarListaTabela } from '../src/modules/vendas/tabela-precos.js';

type Row = Record<string, any>;
function fakeDb() {
  const tabelas: Record<string, Row[]> = { tabela_precos: [] };
  const from = (t: string) => {
    const filtros: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => { filtros.push(r => r[k] === v); return q; },
      order: () => q,
      update: (p: Row) => { patch = p; return q; },
      upsert: async (row: Row, opts: { onConflict: string }) => {
        const keys = opts.onConflict.split(',').map(s => s.trim());
        const ex = tabelas[t].find(r => keys.every(k => r[k] === row[k]));
        if (ex) Object.assign(ex, row); else tabelas[t].push({ ...row });
        return { data: null, error: null };
      },
      then: (res: any) => {
        if (patch) for (const r of tabelas[t]) if (filtros.every(f => f(r))) Object.assign(r, patch);
        const data = tabelas[t].filter(r => filtros.every(f => f(r)));
        return Promise.resolve({ data, error: null }).then(res);
      },
    };
    return q;
  };
  return { tabelas, client: { from } };
}
const T0 = Date.UTC(2026, 7, 24, 15, 0, 0);
const C1 = '00000000-0000-0000-0000-000000000001';

describe('TabelaPrecosService', () => {
  it('atualizar faz upsert pela chave natural e carimba atualizado_em', async () => {
    const db = fakeDb();
    const svc = new TabelaPrecosService({ client: db.client as any, companyId: C1 });
    await svc.atualizar({ tipo: 'modulo', marca: 'JA', modelo: '625', potenciaW: 625, modulosPorUnidade: null, precoUnitario: 980, unidade: 'un', fonte: 'junior' }, T0);
    await svc.atualizar({ tipo: 'modulo', marca: 'JA', modelo: '625', potenciaW: 625, modulosPorUnidade: null, precoUnitario: 950, unidade: 'un', fonte: 'belenus' }, T0 + 1000);
    expect(db.tabelas.tabela_precos).toHaveLength(1);
    expect(db.tabelas.tabela_precos[0]).toMatchObject({ company_id: C1, tipo: 'modulo', marca: 'JA', modelo: '625', preco_unitario: 950, fonte: 'belenus', ativo: true, atualizado_em: new Date(T0 + 1000).toISOString() });
  });

  it('desativar marca ativo=false; itensAtivos não devolve', async () => {
    const db = fakeDb();
    const svc = new TabelaPrecosService({ client: db.client as any, companyId: C1 });
    await svc.atualizar({ tipo: 'modulo', marca: 'JA', modelo: '625', potenciaW: 625, modulosPorUnidade: null, precoUnitario: 980, unidade: 'un', fonte: 'junior' }, T0);
    await svc.desativar({ tipo: 'modulo', marca: 'JA', modelo: '625' });
    expect(db.tabelas.tabela_precos[0].ativo).toBe(false);
    expect(await svc.itensAtivos()).toEqual([]);
  });

  it('itensAtivos devolve no formato do precificador (camelCase + atualizadoEmMs)', async () => {
    const db = fakeDb();
    const svc = new TabelaPrecosService({ client: db.client as any, companyId: C1 });
    await svc.atualizar({ tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T', potenciaW: null, modulosPorUnidade: 4, precoUnitario: 1450, unidade: 'un', fonte: 'junior' }, T0);
    expect(await svc.itensAtivos()).toEqual([{
      tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T', potenciaW: null, modulosPorUnidade: 4, precoUnitario: 1450, unidade: 'un', fonte: 'junior', atualizadoEmMs: T0,
    }]);
  });
});

describe('formatarListaTabela', () => {
  it('agrupa por tipo, marca preço velho (>15 d) e lista vazia', () => {
    const agora = T0;
    const velho = T0 - 16 * 86400_000;
    const txt = formatarListaTabela([
      { tipo: 'modulo', marca: 'JA', modelo: '625', potenciaW: 625, modulosPorUnidade: null, precoUnitario: 980, unidade: 'un', fonte: 'belenus', atualizadoEmMs: velho },
      { tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T', potenciaW: null, modulosPorUnidade: 4, precoUnitario: 1450, unidade: 'un', fonte: 'junior', atualizadoEmMs: agora },
      { tipo: 'estrutura', marca: 'ceramico', modelo: 'ceramico', potenciaW: null, modulosPorUnidade: null, precoUnitario: 95, unidade: 'modulo', fonte: 'junior', atualizadoEmMs: agora },
      { tipo: 'cabos_protecao', marca: 'geral', modelo: 'geral', potenciaW: null, modulosPorUnidade: null, precoUnitario: 420, unidade: 'kwp', fonte: 'junior', atualizadoEmMs: agora },
    ], agora);
    expect(txt).toContain('📋 Tabela de preços');
    expect(txt).toContain('Módulos');
    expect(txt).toContain('JA 625 — R$ 980,00/un ⚠️ 16 d (belenus)');
    expect(txt).toContain('Hoymiles HMS-2000-4T (4 mód.) — R$ 1.450,00/un');
    expect(txt).toContain('ceramico — R$ 95,00/módulo');
    expect(txt).toContain('cabos/proteção — R$ 420,00/kWp');
    expect(formatarListaTabela([], agora)).toContain('vazia');
  });
});

describe('makeTabelaHandler', () => {
  const mk = (db: ReturnType<typeof fakeDb>, admin = true) => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const svc = new TabelaPrecosService({ client: db.client as any, companyId: C1 });
    const h = makeTabelaHandler({ svc, isAdminPhone: () => admin, sendText, agoraMs: () => T0 });
    return { h, sendText };
  };
  it('não-admin não consome', async () => {
    const { h } = mk(fakeDb(), false);
    expect(await h('5561999990000', '/tabela')).toBe(false);
  });
  it('texto comum não consome', async () => {
    const { h } = mk(fakeDb());
    expect(await h('5561999990000', 'bom dia')).toBe(false);
  });
  it('/tabela JA 625 = 980 grava e confirma', async () => {
    const db = fakeDb(); const { h, sendText } = mk(db);
    expect(await h('5561999990000', '/tabela JA 625 = 980')).toBe(true);
    expect(db.tabelas.tabela_precos).toHaveLength(1);
    expect(sendText.mock.calls[0][1]).toContain('✅ JA 625 — R$ 980,00/un');
  });
  it('erro de formato explica a gramática', async () => {
    const { h, sendText } = mk(fakeDb());
    expect(await h('5561999990000', '/tabela micro GoodWe GW2000-MIS = 1300')).toBe(true);
    expect(sendText.mock.calls[0][1]).toContain('quantos módulos');
  });
  it('/tabela lista', async () => {
    const db = fakeDb(); const { h, sendText } = mk(db);
    await h('5561999990000', '/tabela cabos = 420');
    await h('5561999990000', '/tabela');
    expect(sendText.mock.calls[1][1]).toContain('📋 Tabela de preços');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/tabela-precos.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar**

```ts
// src/modules/vendas/tabela-precos.ts
// Tabela de preços do Junior (spec §4.2): CRUD + comando /tabela. Nada de IA aqui.
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseComandoTabela, type ItemTabela, type TipoItem } from './tabela-precos-parser.js';

export interface ItemPreco extends ItemTabela {
  atualizadoEmMs: number;
}

export const PRECO_VELHO_DIAS = 15;

export interface TabelaPrecosDeps {
  client: SupabaseClient;
  companyId: string;
}

export class TabelaPrecosService {
  constructor(private readonly deps: TabelaPrecosDeps) {}

  async atualizar(item: ItemTabela, agoraMs: number): Promise<void> {
    await this.deps.client.from('tabela_precos').upsert({
      company_id: this.deps.companyId,
      tipo: item.tipo, marca: item.marca, modelo: item.modelo,
      potencia_w: item.potenciaW, modulos_por_unidade: item.modulosPorUnidade,
      preco_unitario: item.precoUnitario, unidade: item.unidade, fonte: item.fonte,
      ativo: true, atualizado_em: new Date(agoraMs).toISOString(),
    }, { onConflict: 'company_id,tipo,marca,modelo' });
  }

  async desativar(chave: { tipo: TipoItem; marca: string; modelo: string }): Promise<void> {
    await this.deps.client.from('tabela_precos').update({ ativo: false })
      .eq('company_id', this.deps.companyId).eq('tipo', chave.tipo).eq('marca', chave.marca).eq('modelo', chave.modelo);
  }

  async itensAtivos(): Promise<ItemPreco[]> {
    const { data } = await this.deps.client.from('tabela_precos')
      .select('tipo, marca, modelo, potencia_w, modulos_por_unidade, preco_unitario, unidade, fonte, atualizado_em')
      .eq('company_id', this.deps.companyId).eq('ativo', true).order('tipo');
    return (data ?? []).map((r: any) => ({
      tipo: r.tipo, marca: r.marca, modelo: r.modelo,
      potenciaW: r.potencia_w ?? null, modulosPorUnidade: r.modulos_por_unidade ?? null,
      precoUnitario: Number(r.preco_unitario), unidade: r.unidade, fonte: r.fonte ?? 'junior',
      atualizadoEmMs: new Date(r.atualizado_em).getTime(),
    }));
  }
}

export const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const diasDesde = (ms: number, agoraMs: number) => Math.floor((agoraMs - ms) / 86400_000);

function linhaItem(i: ItemPreco, agoraMs: number): string {
  const dias = diasDesde(i.atualizadoEmMs, agoraMs);
  const velho = dias > PRECO_VELHO_DIAS ? ` ⚠️ ${dias} d` : '';
  const fonte = i.fonte && i.fonte !== 'junior' ? ` (${i.fonte})` : '';
  const un = i.unidade === 'kwp' ? 'kWp' : i.unidade === 'modulo' ? 'módulo' : 'un';
  const nome = i.tipo === 'micro' ? `${i.marca} ${i.modelo} (${i.modulosPorUnidade} mód.)`
    : i.tipo === 'estrutura' ? i.marca
    : i.tipo === 'cabos_protecao' ? 'cabos/proteção'
    : `${i.marca} ${i.modelo}`;
  return `• ${nome} — ${brl(i.precoUnitario)}/${un}${velho}${fonte}`;
}

export function formatarListaTabela(itens: ItemPreco[], agoraMs: number): string {
  if (!itens.length) return '📋 Tabela de preços vazia.\nExemplos:\n/tabela JA 625 = 980\n/tabela micro Hoymiles HMS-2000-4T 4 = 1450\n/tabela estrutura ceramico = 95\n/tabela cabos = 420';
  const grupo = (tipo: TipoItem, titulo: string) => {
    const lista = itens.filter(i => i.tipo === tipo);
    return lista.length ? `${titulo}\n${lista.map(i => linhaItem(i, agoraMs)).join('\n')}` : '';
  };
  return ['📋 Tabela de preços', grupo('modulo', 'Módulos'), grupo('micro', 'Microinversores'), grupo('estrutura', 'Estrutura (por módulo)'), grupo('cabos_protecao', 'Cabos/proteção (por kWp)')]
    .filter(Boolean).join('\n\n');
}

const AJUDA = 'Não entendi. Formatos:\n/tabela JA 625 = 980\n/tabela micro Hoymiles HMS-2000-4T 4 = 1450  (o 4 = quantos módulos por micro)\n/tabela estrutura ceramico|fibrocimento|metalico|laje = 95\n/tabela cabos = 420\n/tabela tira JA 625\n/tabela fonte belenus JA 625 = 980';

export function makeTabelaHandler(d: {
  svc: TabelaPrecosService;
  isAdminPhone: (from: string) => boolean;
  sendText: (to: string, text: string) => Promise<void>;
  agoraMs: () => number;
}): (from: string, text: string) => Promise<boolean> {
  return async (from, text) => {
    if (!d.isAdminPhone(from)) return false;
    const cmd = parseComandoTabela(text);
    if (!cmd) return false;
    const agora = d.agoraMs();
    try {
      if (cmd.acao === 'listar') {
        await d.sendText(from, formatarListaTabela(await d.svc.itensAtivos(), agora));
      } else if (cmd.acao === 'atualizar') {
        await d.svc.atualizar(cmd.item, agora);
        await d.sendText(from, `✅ ${linhaItem({ ...cmd.item, atualizadoEmMs: agora }, agora).slice(2)}`);
      } else if (cmd.acao === 'desativar') {
        await d.svc.desativar(cmd);
        await d.sendText(from, `🗑️ ${cmd.marca} ${cmd.modelo} saiu da tabela.`);
      } else if (cmd.erro === 'micro_sem_modulos_por_unidade') {
        await d.sendText(from, 'Faltou dizer quantos módulos cada micro aceita. Ex.: /tabela micro GoodWe GW2000-MIS 4 = 1300');
      } else if (cmd.erro === 'telhado_desconhecido') {
        await d.sendText(from, 'Telhado tem que ser: ceramico, fibrocimento, metalico ou laje.');
      } else if (cmd.erro === 'preco_invalido') {
        await d.sendText(from, 'Preço tem que ser maior que zero.');
      } else {
        await d.sendText(from, AJUDA);
      }
    } catch (e) {
      console.error('[tabela] erro', e instanceof Error ? e.message : e);
      await d.sendText(from, '⚠️ Não consegui gravar na tabela agora. Tenta de novo em instantes.');
    }
    return true;
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/tabela-precos.test.ts`
Expected: PASS (9 testes)

- [ ] **Step 5: Commit**

```bash
git add src/modules/vendas/tabela-precos.ts tests/tabela-precos.test.ts
git commit -m "feat(vendas): TabelaPrecosService + comando /tabela"
```

---

### Task 7: Leitura de print da loja (vision → itens → "ok tabela")

**Files:**
- Create: `src/modules/vendas/tabela-precos-print.ts`
- Test: `tests/tabela-precos-print.test.ts`

Fluxo: Junior manda foto com legenda contendo "tabela" (ex.: "tabela belenus") → Eva lê com vision (Haiku, JSON) → responde a lista de comandos `/tabela ...` que pretende rodar + "Responda *ok tabela* pra gravar" → guarda pendência por telefone (em memória, curta, só admin) → "ok tabela" grava tudo; qualquer outra mensagem de texto não mexe (a pendência expira em 30 min).

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/tabela-precos-print.test.ts
import { describe, it, expect, vi } from 'vitest';
import { parseItensDoPrint, montarPromptPrint, LeitorPrintTabela } from '../src/modules/vendas/tabela-precos-print.js';

const T0 = Date.UTC(2026, 7, 24, 15, 0, 0);

describe('parseItensDoPrint', () => {
  it('lê bloco json e descarta itens inválidos', () => {
    const raw = 'Segue:\n```json\n[{"tipo":"modulo","marca":"JA","modelo":"625","potencia_w":625,"preco":980},{"tipo":"micro","marca":"Hoymiles","modelo":"HMS-2000-4T","modulos_por_unidade":4,"preco":1450},{"tipo":"micro","marca":"GoodWe","modelo":"GW2000","preco":1300},{"tipo":"banana","preco":1}]\n```';
    const itens = parseItensDoPrint(raw, 'belenus');
    expect(itens.aceitos).toEqual([
      { tipo: 'modulo', marca: 'JA', modelo: '625', potenciaW: 625, modulosPorUnidade: null, precoUnitario: 980, unidade: 'un', fonte: 'belenus' },
      { tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T', potenciaW: null, modulosPorUnidade: 4, precoUnitario: 1450, unidade: 'un', fonte: 'belenus' },
    ]);
    expect(itens.rejeitados).toEqual(['GoodWe GW2000 (micro sem módulos por unidade)', 'tipo "banana" desconhecido']);
  });
  it('sem json → vazio', () => {
    expect(parseItensDoPrint('não achei nada', 'junior')).toEqual({ aceitos: [], rejeitados: [] });
  });
});

describe('montarPromptPrint', () => {
  it('pede só módulo/micro, preço à vista, e proíbe inventar', () => {
    const p = montarPromptPrint();
    expect(p).toMatch(/modulo|micro/);
    expect(p).toContain('NÃO invente');
    expect(p).toContain('modulos_por_unidade');
  });
});

describe('LeitorPrintTabela', () => {
  const mk = () => {
    const svc = { atualizar: vi.fn().mockResolvedValue(undefined) };
    const sendText = vi.fn().mockResolvedValue(undefined);
    const lerImagem = vi.fn().mockResolvedValue('```json\n[{"tipo":"modulo","marca":"JA","modelo":"625","potencia_w":625,"preco":980}]\n```');
    const leitor = new LeitorPrintTabela({ svc: svc as any, sendText, lerImagem, agoraMs: () => T0 });
    return { svc, sendText, lerImagem, leitor };
  };

  it('legenda sem "tabela" não consome', async () => {
    const { leitor } = mk();
    expect(await leitor.tratarImagem('556199', { base64: 'x', mimeType: 'image/jpeg', legenda: 'olha isso' })).toBe(false);
  });

  it('legenda "tabela belenus" → lê, propõe comandos e espera ok', async () => {
    const { leitor, sendText, lerImagem, svc } = mk();
    expect(await leitor.tratarImagem('556199', { base64: 'x', mimeType: 'image/jpeg', legenda: 'tabela belenus' })).toBe(true);
    expect(lerImagem).toHaveBeenCalledWith('x', 'image/jpeg', expect.stringContaining('NÃO invente'));
    expect(sendText.mock.calls[0][1]).toContain('/tabela fonte belenus JA 625 = 980');
    expect(sendText.mock.calls[0][1]).toContain('ok tabela');
    expect(svc.atualizar).not.toHaveBeenCalled();
    expect(await leitor.tratarTexto('556199', 'ok tabela')).toBe(true);
    expect(svc.atualizar).toHaveBeenCalledTimes(1);
    expect(svc.atualizar.mock.calls[0][0]).toMatchObject({ marca: 'JA', fonte: 'belenus' });
    expect(sendText.mock.calls[1][1]).toContain('✅ 1 item');
  });

  it('"ok tabela" sem pendência não consome; pendência expira em 30 min', async () => {
    const { leitor } = mk();
    expect(await leitor.tratarTexto('556199', 'ok tabela')).toBe(false);
    await leitor.tratarImagem('556199', { base64: 'x', mimeType: 'image/jpeg', legenda: 'tabela' });
    const tarde = new LeitorPrintTabela({ ...(leitor as any).d, agoraMs: () => T0 + 31 * 60_000 });
    (tarde as any).pendentes = (leitor as any).pendentes;
    expect(await tarde.tratarTexto('556199', 'ok tabela')).toBe(false);
  });

  it('print sem nada legível avisa e não cria pendência', async () => {
    const { leitor, sendText, lerImagem } = mk();
    lerImagem.mockResolvedValue('não consegui ler');
    await leitor.tratarImagem('556199', { base64: 'x', mimeType: 'image/jpeg', legenda: 'tabela' });
    expect(sendText.mock.calls[0][1]).toContain('não achei preço');
    expect(await leitor.tratarTexto('556199', 'ok tabela')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/tabela-precos-print.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar**

```ts
// src/modules/vendas/tabela-precos-print.ts
// Print da loja (Belenus / Sol Fácil) → vision → lista de /tabela → Junior confirma com "ok tabela".
// A IA só TRANSCREVE o que está na imagem; o que ela não viu, não entra.
import type { ItemTabela, FonteItem } from './tabela-precos-parser.js';
import type { TabelaPrecosService } from './tabela-precos.js';

export function montarPromptPrint(): string {
  return [
    'Esta imagem é um print de loja de equipamentos solares (lista de preços).',
    'Transcreva SOMENTE módulos fotovoltaicos e microinversores com preço visível.',
    'NÃO invente valores, modelos ou quantidades. Se não estiver legível, deixe de fora.',
    'Preço = valor à vista / Pix em reais, por unidade.',
    'Para microinversor, preencha modulos_por_unidade SÓ se o número de entradas/módulos estiver escrito na imagem (ex.: "4 módulos", "-4T"); senão omita o campo.',
    'Responda APENAS um bloco ```json``` com um array de objetos:',
    '{"tipo":"modulo"|"micro","marca":"JA","modelo":"625","potencia_w":625,"modulos_por_unidade":4,"preco":980.5}',
    'Array vazio [] se não houver nada legível.',
  ].join('\n');
}

export function parseItensDoPrint(raw: string, fonte: FonteItem): { aceitos: ItemTabela[]; rejeitados: string[] } {
  const m = /```json\s*([\s\S]*?)```/i.exec(raw);
  if (!m) return { aceitos: [], rejeitados: [] };
  let arr: any[];
  try { arr = JSON.parse(m[1]); } catch { return { aceitos: [], rejeitados: [] }; }
  if (!Array.isArray(arr)) return { aceitos: [], rejeitados: [] };
  const aceitos: ItemTabela[] = [];
  const rejeitados: string[] = [];
  for (const o of arr) {
    const preco = Number(o?.preco);
    const marca = String(o?.marca ?? '').trim();
    const modelo = String(o?.modelo ?? '').trim();
    if (o?.tipo === 'modulo') {
      const w = Number(o.potencia_w);
      if (!marca || !modelo || !(preco > 0) || !(w > 0)) { rejeitados.push(`${marca} ${modelo} (módulo incompleto)`.trim()); continue; }
      aceitos.push({ tipo: 'modulo', marca, modelo, potenciaW: w, modulosPorUnidade: null, precoUnitario: preco, unidade: 'un', fonte });
    } else if (o?.tipo === 'micro') {
      const mpu = Number(o.modulos_por_unidade);
      if (!marca || !modelo || !(preco > 0)) { rejeitados.push(`${marca} ${modelo} (micro incompleto)`.trim()); continue; }
      if (!(mpu > 0)) { rejeitados.push(`${marca} ${modelo} (micro sem módulos por unidade)`); continue; }
      aceitos.push({ tipo: 'micro', marca, modelo, potenciaW: null, modulosPorUnidade: mpu, precoUnitario: preco, unidade: 'un', fonte });
    } else {
      rejeitados.push(`tipo "${String(o?.tipo)}" desconhecido`);
    }
  }
  return { aceitos, rejeitados };
}

const comandoDe = (i: ItemTabela): string => {
  const fonte = i.fonte !== 'junior' ? `fonte ${i.fonte} ` : '';
  const preco = i.precoUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return i.tipo === 'micro'
    ? `/tabela ${fonte}micro ${i.marca} ${i.modelo} ${i.modulosPorUnidade} = ${preco}`
    : `/tabela ${fonte}${i.marca} ${i.modelo} = ${preco}`;
};

const PENDENCIA_MS = 30 * 60_000;

export interface LeitorPrintDeps {
  svc: Pick<TabelaPrecosService, 'atualizar'>;
  sendText: (to: string, text: string) => Promise<void>;
  lerImagem: (base64: string, mimeType: string, prompt: string) => Promise<string>;
  agoraMs: () => number;
}

export class LeitorPrintTabela {
  private pendentes = new Map<string, { itens: ItemTabela[]; criadoEmMs: number }>();
  constructor(private readonly d: LeitorPrintDeps) {}

  /** Imagem do admin com legenda contendo "tabela". Devolve true se consumiu. */
  async tratarImagem(from: string, img: { base64: string; mimeType: string; legenda?: string | null }): Promise<boolean> {
    const legenda = (img.legenda ?? '').toLowerCase();
    if (!/\btabela\b/.test(legenda)) return false;
    const fonte: FonteItem = /belenus/.test(legenda) ? 'belenus' : /sol\s*f[áa]cil|solfacil/.test(legenda) ? 'solfacil' : 'junior';
    let raw = '';
    try { raw = await this.d.lerImagem(img.base64, img.mimeType, montarPromptPrint()); }
    catch (e) { console.error('[tabela] vision falhou', e instanceof Error ? e.message : e); }
    const { aceitos, rejeitados } = parseItensDoPrint(raw, fonte);
    if (!aceitos.length) {
      await this.d.sendText(from, `🔍 Li o print mas não achei preço legível de módulo/micro.${rejeitados.length ? `\nDeixei de fora: ${rejeitados.join('; ')}` : ''}\nPode mandar no texto: /tabela JA 625 = 980`);
      return true;
    }
    this.pendentes.set(from, { itens: aceitos, criadoEmMs: this.d.agoraMs() });
    const linhas = aceitos.map(comandoDe).join('\n');
    const fora = rejeitados.length ? `\n\nDeixei de fora: ${rejeitados.join('; ')}` : '';
    await this.d.sendText(from, `🔍 Li no print (${fonte}):\n${linhas}${fora}\n\nResponda *ok tabela* pra gravar, ou mande os /tabela corrigidos.`);
    return true;
  }

  /** "ok tabela" do admin com pendência viva. Devolve true se consumiu. */
  async tratarTexto(from: string, text: string): Promise<boolean> {
    if (!/^ok\s+tabela$/i.test(text.trim())) return false;
    const p = this.pendentes.get(from);
    if (!p) return false;
    if (this.d.agoraMs() - p.criadoEmMs > PENDENCIA_MS) { this.pendentes.delete(from); return false; }
    this.pendentes.delete(from);
    const agora = this.d.agoraMs();
    for (const i of p.itens) await this.d.svc.atualizar(i, agora);
    await this.d.sendText(from, `✅ ${p.itens.length} ${p.itens.length === 1 ? 'item gravado' : 'itens gravados'} na tabela.`);
    return true;
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/tabela-precos-print.test.ts`
Expected: PASS (7 testes)

- [ ] **Step 5: Commit**

```bash
git add src/modules/vendas/tabela-precos-print.ts tests/tabela-precos-print.test.ts
git commit -m "feat(vendas): leitura de print da loja pra tabela de preços (vision + ok tabela)"
```

---

### Task 8: Precificador — puro

**Files:**
- Create: `src/modules/vendas/precificador.ts`
- Test: `tests/precificador.test.ts`

Regras (spec §4):
1. `kWpAlvo = consumoAlvo × 12 / (3,75 × 365)`.
2. Para cada módulo ativo: `modulos = ceil(kWpAlvo × 1000 / Wp)`, `kWpReal = modulos × Wp / 1000`.
3. Para cada micro ativo: `micros = ceil(modulos / modulosPorUnidade)`.
4. `kit = modulos × preçoMódulo + micros × preçoMicro + modulos × estrutura(telhado) + kWpReal × cabos`.
5. `servico = kWpReal × 1000 × servicoRsPorWp(consumoAlvo)`.
6. `total = kit + servico`; `rsPorWp = total / (kWpReal × 1000)`.
7. Avisos: item com >15 d → `preco_velho`; `rsPorWp > 2,60` → `acima_mercado` (+ rótulo do `compararGreener`).
8. Opção A = menor total; opção B = menor total com **marca de módulo diferente** de A. Se só há uma marca → só A + aviso `so_uma_marca`.
9. Parcela 18× via `parcelaCartaoSolar(total, 18, 'solfacil')` (null-safe).
10. Faltou estrutura do telhado, cabos, módulo ou micro → `{ ok: false, erro, faltando: [...] }`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/precificador.test.ts
import { describe, it, expect } from 'vitest';
import { precificar, PRODUTIVIDADE_KWH_KWP_DIA, TETO_RS_POR_WP, kwpAlvo } from '../src/modules/vendas/precificador.js';
import type { ItemPreco } from '../src/modules/vendas/tabela-precos.js';

const T0 = Date.UTC(2026, 7, 24, 15, 0, 0);
const item = (p: Partial<ItemPreco>): ItemPreco => ({
  tipo: 'modulo', marca: 'X', modelo: 'X', potenciaW: null, modulosPorUnidade: null, precoUnitario: 0, unidade: 'un', fonte: 'junior', atualizadoEmMs: T0, ...p,
});
const tabelaBase = (): ItemPreco[] => [
  item({ tipo: 'modulo', marca: 'Risen', modelo: '715', potenciaW: 715, precoUnitario: 980 }),
  item({ tipo: 'modulo', marca: 'JA', modelo: '625', potenciaW: 625, precoUnitario: 900 }),
  item({ tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T', modulosPorUnidade: 4, precoUnitario: 1450 }),
  item({ tipo: 'micro', marca: 'Sungrow', modelo: 'S2500S-L', modulosPorUnidade: 4, precoUnitario: 1500 }),
  item({ tipo: 'estrutura', marca: 'ceramico', modelo: 'ceramico', precoUnitario: 95, unidade: 'modulo' }),
  item({ tipo: 'cabos_protecao', marca: 'geral', modelo: 'geral', precoUnitario: 420, unidade: 'kwp' }),
];

describe('precificador', () => {
  it('constantes da spec', () => {
    expect(PRODUTIVIDADE_KWH_KWP_DIA).toBe(3.75);
    expect(TETO_RS_POR_WP).toBe(2.60);
  });

  it('kWp alvo pela régua 3,75: 734 kWh → 6,43 kWp', () => {
    expect(kwpAlvo(734)).toBeCloseTo(6.43, 2);
  });

  it('734 kWh, cerâmico: monta A (mais barata) e B (outra marca de módulo)', () => {
    const r = precificar({ consumoAlvoKwh: 734, telhado: 'ceramico', tabela: tabelaBase(), agoraMs: T0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.consumoAlvoKwh).toBe(734);
    expect(r.kwpAlvo).toBeCloseTo(6.43, 2);
    expect(r.servicoRsPorWp).toBe(0.80);
    // Risen 715: ceil(6434/715)=9 mód → 6,435 kWp → 3 micros → kit 9×980 + 3×1450 + 9×95 + 6,435×420 = 8820+4350+855+2702,7 = 16.727,70; serviço 6435×0,80 = 5.148 → 21.875,70
    // JA 625: ceil(6434/625)=11 mód → 6,875 kWp → 3 micros → kit 11×900 + 3×1450 + 11×95 + 6,875×420 = 9900+4350+1045+2887,5 = 18.182,50; serviço 6875×0,80 = 5.500 → 23.682,50
    expect(r.opcoes.map(o => o.rotulo)).toEqual(['A', 'B']);
    const [a, b] = r.opcoes;
    expect(a).toMatchObject({ moduloMarca: 'Risen', moduloModelo: '715', modulos: 9, kwpReal: 6.44, microMarca: 'Hoymiles', micros: 3 });
    expect(a.kit).toBeCloseTo(16727.7, 1);
    expect(a.servico).toBeCloseTo(5148, 1);
    expect(a.total).toBeCloseTo(21875.7, 1);
    expect(a.rsPorWp).toBeCloseTo(21875.7 / 6435, 3);
    expect(b).toMatchObject({ moduloMarca: 'JA', modulos: 11, micros: 3 });
    expect(b.total).toBeCloseTo(23682.5, 1);
    expect(a.parcela18x).toBeGreaterThan(a.total / 18);
    expect(r.avisos).toEqual([]);
  });

  it('micro: escolhe o mais barato por opção e respeita módulos por unidade', () => {
    const t = tabelaBase().filter(i => i.tipo !== 'micro');
    t.push(item({ tipo: 'micro', marca: 'GoodWe', modelo: 'GW2000-MIS', modulosPorUnidade: 2, precoUnitario: 900 }));
    t.push(item({ tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T', modulosPorUnidade: 4, precoUnitario: 1450 }));
    const r = precificar({ consumoAlvoKwh: 734, telhado: 'ceramico', tabela: t, agoraMs: T0 });
    if (!r.ok) throw new Error('esperava ok');
    // Risen 9 mód: GoodWe ceil(9/2)=5×900=4500 > Hoymiles 3×1450=4350 → Hoymiles
    expect(r.opcoes[0]).toMatchObject({ microMarca: 'Hoymiles', micros: 3 });
  });

  it('avisa preço velho (>15 d) e acima do mercado (>2,60 R$/Wp)', () => {
    const t = tabelaBase().map(i => i.tipo === 'modulo' && i.marca === 'Risen' ? { ...i, atualizadoEmMs: T0 - 20 * 86400_000, precoUnitario: 2000 } : i);
    const r = precificar({ consumoAlvoKwh: 600, telhado: 'ceramico', tabela: t, agoraMs: T0 });
    if (!r.ok) throw new Error('esperava ok');
    expect(r.avisos.some(a => a.tipo === 'preco_velho' && a.texto.includes('Risen 715') && a.texto.includes('20 d'))).toBe(true);
    const b = r.opcoes.find(o => o.moduloMarca === 'Risen')!;
    expect(b.rsPorWp).toBeGreaterThan(2.60);
    expect(r.avisos.some(a => a.tipo === 'acima_mercado' && a.texto.includes('B'))).toBe(true);
  });

  it('uma marca só → só A + aviso', () => {
    const t = tabelaBase().filter(i => !(i.tipo === 'modulo' && i.marca === 'JA'));
    const r = precificar({ consumoAlvoKwh: 734, telhado: 'ceramico', tabela: t, agoraMs: T0 });
    if (!r.ok) throw new Error('esperava ok');
    expect(r.opcoes).toHaveLength(1);
    expect(r.avisos.some(a => a.tipo === 'so_uma_marca')).toBe(true);
  });

  it('falta estrutura do telhado → erro com lista do que falta', () => {
    const r = precificar({ consumoAlvoKwh: 734, telhado: 'fibrocimento', tabela: tabelaBase(), agoraMs: T0 });
    expect(r).toEqual({ ok: false, erro: 'tabela_incompleta', faltando: ['estrutura fibrocimento'] });
  });

  it('tabela vazia → lista tudo que falta', () => {
    const r = precificar({ consumoAlvoKwh: 734, telhado: 'ceramico', tabela: [], agoraMs: T0 });
    expect(r).toEqual({ ok: false, erro: 'tabela_incompleta', faltando: ['módulo', 'micro', 'estrutura ceramico', 'cabos'] });
  });

  it('consumo inválido → erro', () => {
    expect(precificar({ consumoAlvoKwh: 0, telhado: 'ceramico', tabela: tabelaBase(), agoraMs: T0 })).toEqual({ ok: false, erro: 'consumo_invalido', faltando: [] });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/precificador.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar**

```ts
// src/modules/vendas/precificador.ts
// Precificador (spec §4). PURO: recebe consumo-alvo + tabela, devolve opções A/B.
// NENHUM número nasce aqui por achismo: régua 3,75 (golden PV*SOL DF/GO), tabela do Junior,
// serviço por faixa aprovada, parcela pela tabela oficial do cartão, trava Greener.
import { compararGreener } from '../proposal/calculator.js';
import { parcelaCartaoSolar } from '../proposal/cartao-solar.js';
import { servicoRsPorWp } from './autonomia.js';
import type { ItemPreco } from './tabela-precos.js';
import { PRECO_VELHO_DIAS, diasDesde } from './tabela-precos.js';
import type { Telhado } from './tabela-precos-parser.js';

export const PRODUTIVIDADE_KWH_KWP_DIA = 3.75;
export const TETO_RS_POR_WP = 2.60;

const r2 = (v: number) => Math.round(v * 100) / 100;

export function kwpAlvo(consumoAlvoKwh: number): number {
  return (consumoAlvoKwh * 12) / (PRODUTIVIDADE_KWH_KWP_DIA * 365);
}

export interface OpcaoPrecificada {
  rotulo: 'A' | 'B';
  moduloMarca: string; moduloModelo: string; moduloWp: number; modulos: number;
  microMarca: string; microModelo: string; micros: number;
  kwpReal: number;
  kit: number; servico: number; total: number; rsPorWp: number;
  parcela18x: number | null;
  greener: { rotulo: string; rsPorWpReferencia: number };
}

export interface Aviso { tipo: 'preco_velho' | 'acima_mercado' | 'so_uma_marca'; texto: string }

export type ResultadoPrecificacao =
  | { ok: true; consumoAlvoKwh: number; kwpAlvo: number; telhado: Telhado; servicoRsPorWp: number; opcoes: OpcaoPrecificada[]; avisos: Aviso[] }
  | { ok: false; erro: 'consumo_invalido' | 'tabela_incompleta'; faltando: string[] };

export interface PrecificarInput {
  consumoAlvoKwh: number;
  telhado: Telhado;
  tabela: ItemPreco[];
  agoraMs: number;
}

export function precificar(p: PrecificarInput): ResultadoPrecificacao {
  if (!Number.isFinite(p.consumoAlvoKwh) || p.consumoAlvoKwh <= 0) return { ok: false, erro: 'consumo_invalido', faltando: [] };

  const modulosTab = p.tabela.filter(i => i.tipo === 'modulo' && (i.potenciaW ?? 0) > 0 && i.precoUnitario > 0);
  const microsTab = p.tabela.filter(i => i.tipo === 'micro' && (i.modulosPorUnidade ?? 0) > 0 && i.precoUnitario > 0);
  const estrutura = p.tabela.find(i => i.tipo === 'estrutura' && i.marca === p.telhado);
  const cabos = p.tabela.find(i => i.tipo === 'cabos_protecao');
  const faltando: string[] = [];
  if (!modulosTab.length) faltando.push('módulo');
  if (!microsTab.length) faltando.push('micro');
  if (!estrutura) faltando.push(`estrutura ${p.telhado}`);
  if (!cabos) faltando.push('cabos');
  if (faltando.length) return { ok: false, erro: 'tabela_incompleta', faltando };

  const alvo = kwpAlvo(p.consumoAlvoKwh);
  const rsWpServico = servicoRsPorWp(p.consumoAlvoKwh);

  type Cand = Omit<OpcaoPrecificada, 'rotulo'> & { itensUsados: ItemPreco[] };
  const candidatos: Cand[] = modulosTab.map(mod => {
    const wp = mod.potenciaW!;
    const modulos = Math.ceil((alvo * 1000) / wp);
    const kwpRealExato = (modulos * wp) / 1000;
    // micro mais barato pra esse número de módulos
    const micro = microsTab
      .map(m => ({ m, qtd: Math.ceil(modulos / m.modulosPorUnidade!), custo: Math.ceil(modulos / m.modulosPorUnidade!) * m.precoUnitario }))
      .sort((x, y) => x.custo - y.custo)[0];
    const kit = modulos * mod.precoUnitario + micro.custo + modulos * estrutura!.precoUnitario + kwpRealExato * cabos!.precoUnitario;
    const servico = kwpRealExato * 1000 * rsWpServico;
    const total = kit + servico;
    const rsPorWp = total / (kwpRealExato * 1000);
    const g = compararGreener(kwpRealExato, rsPorWp);
    const parc = parcelaCartaoSolar(r2(total), 18, 'solfacil');
    return {
      moduloMarca: mod.marca, moduloModelo: mod.modelo, moduloWp: wp, modulos,
      microMarca: micro.m.marca, microModelo: micro.m.modelo, micros: micro.qtd,
      kwpReal: r2(kwpRealExato),
      kit: r2(kit), servico: r2(servico), total: r2(total), rsPorWp: Math.round(rsPorWp * 1000) / 1000,
      parcela18x: parc ? parc.parcela : null,
      greener: { rotulo: g.rotulo, rsPorWpReferencia: g.rsPorWpReferencia },
      itensUsados: [mod, micro.m, estrutura!, cabos!],
    };
  }).sort((x, y) => x.total - y.total);

  const a = candidatos[0];
  const b = candidatos.find(c => c.moduloMarca !== a.moduloMarca) ?? null;
  const escolhidos: Cand[] = b ? [a, b] : [a];
  const avisos: Aviso[] = [];
  if (!b) avisos.push({ tipo: 'so_uma_marca', texto: 'Só uma marca de módulo na tabela — sem opção B.' });

  const opcoes: OpcaoPrecificada[] = escolhidos.map((c, idx) => {
    const rotulo = idx === 0 ? 'A' : 'B';
    if (c.rsPorWp > TETO_RS_POR_WP) {
      avisos.push({ tipo: 'acima_mercado', texto: `${rotulo} a ${c.rsPorWp.toFixed(2)} R$/Wp — acima do teto ${TETO_RS_POR_WP.toFixed(2)} (Greener ${c.greener.rsPorWpReferencia.toFixed(2)}) ${c.greener.rotulo}` });
    }
    for (const i of c.itensUsados) {
      const d = diasDesde(i.atualizadoEmMs, p.agoraMs);
      const nome = i.tipo === 'estrutura' ? `estrutura ${i.marca}` : i.tipo === 'cabos_protecao' ? 'cabos' : `${i.marca} ${i.modelo}`;
      if (d > PRECO_VELHO_DIAS && !avisos.some(a => a.tipo === 'preco_velho' && a.texto.startsWith(nome))) {
        avisos.push({ tipo: 'preco_velho', texto: `${nome} com preço de ${d} d — confere na loja.` });
      }
    }
    const { itensUsados: _omit, ...resto } = c;
    return { rotulo, ...resto };
  });

  return { ok: true, consumoAlvoKwh: p.consumoAlvoKwh, kwpAlvo: r2(alvo), telhado: p.telhado, servicoRsPorWp: rsWpServico, opcoes, avisos };
}
```

Observação: `parcelaCartaoSolar` consulta `empresa().belenusAtivo` (módulo `empresa-config`). No teste isso resolve pro default EcoSun; se `parcelasMaxCartaoSolar('solfacil')` devolver 12 por `belenusAtivo=false` no ambiente de teste, `parcela18x` vem `null` — o teste acima cobre só `toBeGreaterThan` quando não-null; **se vier null no teste, trocar a asserção por `expect(a.parcela18x === null || a.parcela18x > a.total / 18).toBe(true)` e registrar no commit.**

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/precificador.test.ts`
Expected: PASS (9 testes). Se `kwpReal` da opção A vier `6.43` em vez de `6.44` (9 × 715 = 6,435 → arredonda pra 6,44 com `Math.round`), confira que `r2(6.435)` dá `6.44` no Node (ponto flutuante: `6.435*100 = 643.4999…` → **6.43**). Se der 6.43, ajuste o teste pra `6.43` — o número real continua sendo o exato (`kwpRealExato`) em todas as contas.

- [ ] **Step 5: Commit**

```bash
git add src/modules/vendas/precificador.ts tests/precificador.test.ts
git commit -m "feat(vendas): precificador puro (régua 3,75 + tabela + serviço por faixa + trava + A/B)"
```

---

### Task 9: Card de sombra — puro

**Files:**
- Create: `src/modules/vendas/card-sombra.ts`
- Test: `tests/card-sombra.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/card-sombra.test.ts
import { describe, it, expect } from 'vitest';
import { montarCardSombra, montarCardSombraErro } from '../src/modules/vendas/card-sombra.js';

const resultado = {
  ok: true as const, consumoAlvoKwh: 734, kwpAlvo: 6.43, telhado: 'ceramico' as const, servicoRsPorWp: 0.80,
  opcoes: [
    { rotulo: 'A' as const, moduloMarca: 'Risen', moduloModelo: '715', moduloWp: 715, modulos: 9, microMarca: 'Hoymiles', microModelo: 'HMS-2000-4T', micros: 3, kwpReal: 6.44, kit: 16727.7, servico: 5148, total: 21875.7, rsPorWp: 3.4, parcela18x: 1362.33, greener: { rotulo: '🚨 Muito acima do mercado', rsPorWpReferencia: 2.21 } },
    { rotulo: 'B' as const, moduloMarca: 'JA', moduloModelo: '625', moduloWp: 625, modulos: 11, microMarca: 'Sungrow', microModelo: 'S2500S-L', micros: 3, kwpReal: 6.88, kit: 18182.5, servico: 5500, total: 23682.5, rsPorWp: 3.445, parcela18x: null, greener: { rotulo: '🚨 Muito acima do mercado', rsPorWpReferencia: 2.21 } },
  ],
  avisos: [{ tipo: 'acima_mercado' as const, texto: 'A a 3.40 R$/Wp — acima do teto 2.60' }],
};

describe('montarCardSombra', () => {
  it('segue o formato da spec §5 com selo de sombra, telhado assumido e avisos', () => {
    const txt = montarCardSombra({
      nome: 'Joel', cidade: 'Lago Oeste', versao: 1, faixa: 'autonoma', telhadoAssumido: true,
      consumoFatura: 734, cargaFutura: null, resultado,
    });
    expect(txt).toContain('🕶️ SOMBRA v1 — Joel (Lago Oeste)');
    expect(txt).toContain('734 kWh · telhado: assumido cerâmico · 6,43 kWp alvo · serviço 0,80 R$/Wp');
    expect(txt).toContain('A) 9× Risen 715 + 3× Hoymiles HMS-2000-4T = 6,44 kWp');
    expect(txt).toContain('kit 16.727,70 + serv 5.148,00 = *21.875,70* (3,40 R$/Wp) · 18× 1.362,33');
    expect(txt).toContain('B) 11× JA 625 + 3× Sungrow S2500S-L = 6,88 kWp');
    expect(txt).toContain('kit 18.182,50 + serv 5.500,00 = *23.682,50* (3,45 R$/Wp)');
    expect(txt).not.toContain('18× null');
    expect(txt).toContain('⚠️ A a 3.40 R$/Wp');
    expect(txt).toContain('Nada foi enviado ao cliente');
    expect(txt).toContain('/tabela');
  });

  it('carga futura aparece quando é ela que manda', () => {
    const txt = montarCardSombra({ nome: 'Ana', cidade: null, versao: 2, faixa: 'autonoma', telhadoAssumido: false, consumoFatura: 400, cargaFutura: 800, resultado: { ...resultado, consumoAlvoKwh: 800 } });
    expect(txt).toContain('🕶️ SOMBRA v2 — Ana');
    expect(txt).toContain('800 kWh (fatura 400 + carga futura 800)');
    expect(txt).toContain('telhado: cerâmico');
  });

  it('faixa chama_junior vem sinalizada', () => {
    const txt = montarCardSombra({ nome: 'Big', cidade: null, versao: 1, faixa: 'chama_junior', telhadoAssumido: true, consumoFatura: 2000, cargaFutura: null, resultado: { ...resultado, consumoAlvoKwh: 2000 } });
    expect(txt).toContain('🙋 acima de 1.500 kWh — na vida real seria "preciso de você"');
  });
});

describe('montarCardSombraErro', () => {
  it('tabela incompleta lista o que falta com exemplo de comando', () => {
    const txt = montarCardSombraErro({ nome: 'Joel', erro: 'tabela_incompleta', faltando: ['estrutura fibrocimento', 'cabos'] });
    expect(txt).toContain('🕶️ SOMBRA — Joel');
    expect(txt).toContain('falta na tabela: estrutura fibrocimento, cabos');
    expect(txt).toContain('/tabela estrutura fibrocimento = ');
  });
  it('sem dados explica', () => {
    expect(montarCardSombraErro({ nome: 'Joel', erro: 'sem_dados', faltando: [] })).toContain('sem consumo');
    expect(montarCardSombraErro({ nome: 'Joel', erro: 'fluxo_atual', faltando: [] })).toContain('abaixo de 500');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/card-sombra.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar**

```ts
// src/modules/vendas/card-sombra.ts
// Texto do card de sombra pro Junior (spec §5, versão "nada enviado"). PURO.
import type { ResultadoPrecificacao, OpcaoPrecificada } from './precificador.js';
import type { Faixa } from './autonomia.js';
import { brl } from './tabela-precos.js';

const num = (v: number, casas = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const TELHADO_NOME: Record<string, string> = { ceramico: 'cerâmico', fibrocimento: 'fibrocimento', metalico: 'metálico', laje: 'laje' };

function linhaOpcao(o: OpcaoPrecificada): string {
  const parcela = o.parcela18x !== null ? ` · 18× ${num(o.parcela18x)}` : '';
  return `${o.rotulo}) ${o.modulos}× ${o.moduloMarca} ${o.moduloModelo} + ${o.micros}× ${o.microMarca} ${o.microModelo} = ${num(o.kwpReal)} kWp\n` +
    `   kit ${num(o.kit)} + serv ${num(o.servico)} = *${num(o.total)}* (${num(o.rsPorWp)} R$/Wp)${parcela}`;
}

export function montarCardSombra(p: {
  nome: string; cidade: string | null; versao: number; faixa: Faixa; telhadoAssumido: boolean;
  consumoFatura: number | null; cargaFutura: number | null;
  resultado: Extract<ResultadoPrecificacao, { ok: true }>;
}): string {
  const r = p.resultado;
  const titulo = `🕶️ SOMBRA v${p.versao} — ${p.nome}${p.cidade ? ` (${p.cidade})` : ''}`;
  const consumo = p.cargaFutura && p.cargaFutura > (p.consumoFatura ?? 0)
    ? `${r.consumoAlvoKwh} kWh (fatura ${p.consumoFatura ?? '?'} + carga futura ${p.cargaFutura})`
    : `${r.consumoAlvoKwh} kWh`;
  const telhado = `telhado: ${p.telhadoAssumido ? 'assumido ' : ''}${TELHADO_NOME[r.telhado] ?? r.telhado}`;
  const resumo = `${consumo} · ${telhado} · ${num(r.kwpAlvo)} kWp alvo · serviço ${num(r.servicoRsPorWp)} R$/Wp`;
  const faixa = p.faixa === 'chama_junior' ? '\n🙋 acima de 1.500 kWh — na vida real seria "preciso de você"' : '';
  const opcoes = r.opcoes.map(linhaOpcao).join('\n');
  const avisos = r.avisos.length ? '\n' + r.avisos.map(a => `⚠️ ${a.texto}`).join('\n') : '';
  return `${titulo}\n${resumo}${faixa}\n\n${opcoes}${avisos}\n\n_Nada foi enviado ao cliente._ Compara com a sua proposta; ajusta preço com /tabela e roda de novo com /sombra ${p.nome.split(' ')[0]}.`;
}

export function montarCardSombraErro(p: { nome: string; erro: 'tabela_incompleta' | 'consumo_invalido' | 'sem_dados' | 'fluxo_atual'; faltando: string[] }): string {
  const titulo = `🕶️ SOMBRA — ${p.nome}`;
  if (p.erro === 'tabela_incompleta') {
    const exemplos = p.faltando.map(f =>
      f === 'módulo' ? '/tabela JA 625 = 980'
      : f === 'micro' ? '/tabela micro Hoymiles HMS-2000-4T 4 = 1450'
      : f === 'cabos' ? '/tabela cabos = 420'
      : `/tabela ${f} = 95`).join('\n');
    return `${titulo}\nNão deu pra precificar — falta na tabela: ${p.faltando.join(', ')}.\n${exemplos}`;
  }
  if (p.erro === 'sem_dados') return `${titulo}\nLead sem consumo (kWh) nem carga futura — a Eva ainda não qualificou.`;
  if (p.erro === 'fluxo_atual') return `${titulo}\nConsumo abaixo de 500 kWh — fora da faixa autônoma (segue o fluxo de hoje).`;
  return `${titulo}\nConsumo inválido no cadastro.`;
}

export { brl };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/card-sombra.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add src/modules/vendas/card-sombra.ts tests/card-sombra.test.ts
git commit -m "feat(vendas): card de sombra (texto puro pro Junior)"
```

---

### Task 10: `SombraService` + handler `/sombra <nome>`

**Files:**
- Create: `src/modules/vendas/sombra.ts`
- Test: `tests/sombra.test.ts`

Responsabilidades:
- `rodarParaLead({ leadId, agoraMs, origem })`: lê lead (`name, city, energy_data, future_demand, company_id`), consumo-alvo (`energy_data.consumption_kwh` **ou** `consumo_kwh`, carga futura = número em `future_demand`), faixa, tabela, precificar, grava `propostas_versoes` (versão = max+1, `autor: 'eva'`, `sombra: true`, `params_json` = input, `resultado_json` = resultado), Elo `comercial:sombra_gerada`, manda card pro Junior. Nunca lança.
- `rodarSeNuncaRodou(leadId, agoraMs)`: gancho automático — só roda se não existe versão pra esse lead.
- `makeSombraHandler`: `/sombra <nome>` → acha lead por nome (`ilike` em `leads.name`, o mais recente), roda. `/sombra` sozinho = ajuda.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/sombra.test.ts
import { describe, it, expect, vi } from 'vitest';
import { SombraService, makeSombraHandler, cargaFuturaDe } from '../src/modules/vendas/sombra.js';
import type { ItemPreco } from '../src/modules/vendas/tabela-precos.js';

type Row = Record<string, any>;
function fakeDb() {
  const tabelas: Record<string, Row[]> = { leads: [], propostas_versoes: [] };
  const from = (t: string) => {
    const filtros: Array<(r: Row) => boolean> = [];
    let ordem: { k: string; asc: boolean } | null = null;
    let limite = Infinity;
    const rows = () => {
      let r = tabelas[t].filter(x => filtros.every(f => f(x)));
      if (ordem) r = [...r].sort((a, b) => (a[ordem!.k] > b[ordem!.k] ? 1 : -1) * (ordem!.asc ? 1 : -1));
      return r.slice(0, limite);
    };
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => { filtros.push(r => r[k] === v); return q; },
      ilike: (k: string, v: string) => { const s = v.replace(/%/g, '').toLowerCase(); filtros.push(r => String(r[k] ?? '').toLowerCase().includes(s)); return q; },
      is: (k: string, v: any) => { filtros.push(r => r[k] == v); return q; },
      order: (k: string, o?: { ascending?: boolean }) => { ordem = { k, asc: o?.ascending !== false }; return q; },
      limit: (n: number) => { limite = n; return q; },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      insert: async (row: Row) => { tabelas[t].push({ ...row }); return { data: null, error: null }; },
      then: (res: any) => Promise.resolve({ data: rows(), error: null }).then(res),
    };
    return q;
  };
  return { tabelas, client: { from } };
}
const T0 = Date.UTC(2026, 7, 24, 15, 0, 0);
const item = (p: Partial<ItemPreco>): ItemPreco => ({ tipo: 'modulo', marca: 'X', modelo: 'X', potenciaW: null, modulosPorUnidade: null, precoUnitario: 0, unidade: 'un', fonte: 'junior', atualizadoEmMs: T0, ...p });
const tabelaOk = (): ItemPreco[] => [
  item({ tipo: 'modulo', marca: 'Risen', modelo: '715', potenciaW: 715, precoUnitario: 980 }),
  item({ tipo: 'modulo', marca: 'JA', modelo: '625', potenciaW: 625, precoUnitario: 900 }),
  item({ tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T', modulosPorUnidade: 4, precoUnitario: 1450 }),
  item({ tipo: 'estrutura', marca: 'ceramico', modelo: 'ceramico', precoUnitario: 95, unidade: 'modulo' }),
  item({ tipo: 'cabos_protecao', marca: 'geral', modelo: 'geral', precoUnitario: 420, unidade: 'kwp' }),
];

const mk = (db: ReturnType<typeof fakeDb>, tabela: ItemPreco[] = tabelaOk()) => {
  const sendText = vi.fn().mockResolvedValue(undefined);
  const registrarEvento = vi.fn().mockResolvedValue(undefined);
  const svc = new SombraService({
    client: db.client as any, tabela: { itensAtivos: vi.fn().mockResolvedValue(tabela) } as any,
    sendText, registrarEvento, adminPhone: '5561999990000',
  });
  return { svc, sendText, registrarEvento };
};

describe('cargaFuturaDe', () => {
  it('extrai kWh de texto livre do future_demand', () => {
    expect(cargaFuturaDe('vou colocar ar e piscina, uns 900 kwh')).toBe(900);
    expect(cargaFuturaDe('1.200kWh/mês')).toBe(1200);
    expect(cargaFuturaDe('carro elétrico')).toBeNull();
    expect(cargaFuturaDe(null)).toBeNull();
  });
});

describe('SombraService.rodarParaLead', () => {
  it('lead qualificado: grava versão 1, loga no Elo e manda card ao Junior', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel Lima', city: 'Lago Oeste', company_id: 'C1', energy_data: { consumption_kwh: 734 }, future_demand: null });
    const { svc, sendText, registrarEvento } = mk(db);
    const r = await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'teste' });
    expect(r).toMatchObject({ ok: true, versao: 1 });
    expect(db.tabelas.propostas_versoes).toHaveLength(1);
    expect(db.tabelas.propostas_versoes[0]).toMatchObject({ lead_id: 'L1', company_id: 'C1', versao: 1, autor: 'eva', sombra: true });
    expect(db.tabelas.propostas_versoes[0].params_json).toMatchObject({ consumoAlvoKwh: 734, telhado: 'ceramico', telhadoAssumido: true, faixa: 'autonoma', origem: 'teste' });
    expect(db.tabelas.propostas_versoes[0].resultado_json.ok).toBe(true);
    expect(registrarEvento).toHaveBeenCalledWith(db.client, expect.objectContaining({ tipo: 'comercial:sombra_gerada', leadId: 'L1', companyId: 'C1' }));
    expect(sendText).toHaveBeenCalledWith('5561999990000', expect.stringContaining('🕶️ SOMBRA v1 — Joel Lima (Lago Oeste)'));
  });

  it('segunda rodada vira v2', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: 734 } });
    const { svc } = mk(db);
    await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'a' });
    const r = await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0 + 1, origem: 'b' });
    expect(r).toMatchObject({ ok: true, versao: 2 });
  });

  it('carga futura maior que a fatura manda no consumo-alvo', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Ana', energy_data: { consumption_kwh: 400 }, future_demand: 'piscina, uns 800 kwh' });
    const { svc, sendText } = mk(db);
    await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' });
    expect(sendText.mock.calls[0][1]).toContain('800 kWh (fatura 400 + carga futura 800)');
  });

  it('sem consumo → card de erro, sem versão', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Zé', energy_data: {} });
    const { svc, sendText } = mk(db);
    const r = await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' });
    expect(r).toEqual({ ok: false, erro: 'sem_dados' });
    expect(db.tabelas.propostas_versoes).toHaveLength(0);
    expect(sendText.mock.calls[0][1]).toContain('sem consumo');
  });

  it('abaixo de 500 → fluxo atual, sem versão e sem card no gancho automático (só no comando)', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Zé', energy_data: { consumption_kwh: 300 } });
    const { svc, sendText } = mk(db);
    expect(await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'auto', silencioso: true })).toEqual({ ok: false, erro: 'fluxo_atual' });
    expect(sendText).not.toHaveBeenCalled();
    await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'comando' });
    expect(sendText.mock.calls[0][1]).toContain('abaixo de 500');
  });

  it('tabela incompleta → card de erro com o que falta', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: 734 } });
    const { svc, sendText } = mk(db, []);
    const r = await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' });
    expect(r).toMatchObject({ ok: false, erro: 'tabela_incompleta' });
    expect(sendText.mock.calls[0][1]).toContain('falta na tabela: módulo, micro, estrutura ceramico, cabos');
  });

  it('nunca lança', async () => {
    const svc = new SombraService({ client: { from: () => { throw new Error('boom'); } } as any, tabela: {} as any, sendText: vi.fn(), registrarEvento: vi.fn(), adminPhone: 'x' });
    expect(await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' })).toEqual({ ok: false, erro: 'interno' });
  });
});

describe('SombraService.rodarSeNuncaRodou', () => {
  it('roda só na primeira vez', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: 734 } });
    const { svc, sendText } = mk(db);
    await svc.rodarSeNuncaRodou('L1', T0);
    await svc.rodarSeNuncaRodou('L1', T0 + 1);
    expect(db.tabelas.propostas_versoes).toHaveLength(1);
    expect(sendText).toHaveBeenCalledTimes(1);
  });
});

describe('makeSombraHandler', () => {
  const prep = (admin = true) => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel Lima', energy_data: { consumption_kwh: 734 }, created_at: '2026-08-01' });
    db.tabelas.leads.push({ id: 'L2', name: 'Joelma', energy_data: { consumption_kwh: 600 }, created_at: '2026-08-10' });
    const { svc, sendText } = mk(db);
    const h = makeSombraHandler({ svc, client: db.client as any, isAdminPhone: () => admin, sendText, agoraMs: () => T0 });
    return { h, sendText, db };
  };
  it('não-admin e texto comum não consomem', async () => {
    expect(await prep(false).h('x', '/sombra Joel')).toBe(false);
    expect(await prep().h('x', 'bom dia')).toBe(false);
  });
  it('/sombra sozinho = ajuda', async () => {
    const { h, sendText } = prep();
    expect(await h('x', '/sombra')).toBe(true);
    expect(sendText.mock.calls[0][1]).toContain('/sombra <nome>');
  });
  it('/sombra Joel Lima acha o lead e roda', async () => {
    const { h, sendText, db } = prep();
    expect(await h('x', '/sombra Joel Lima')).toBe(true);
    expect(db.tabelas.propostas_versoes[0].lead_id).toBe('L1');
    expect(sendText.mock.calls.at(-1)![1]).toContain('🕶️ SOMBRA v1 — Joel Lima');
  });
  it('nome ambíguo pega o mais recente e avisa', async () => {
    const { h, sendText, db } = prep();
    await h('x', '/sombra Joel');
    expect(db.tabelas.propostas_versoes[0].lead_id).toBe('L2');
    expect(sendText.mock.calls[0][1]).toContain('2 leads com "Joel"');
  });
  it('nome sem lead avisa', async () => {
    const { h, sendText } = prep();
    await h('x', '/sombra Ninguém');
    expect(sendText.mock.calls[0][1]).toContain('Não achei lead');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/sombra.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar**

```ts
// src/modules/vendas/sombra.ts
// Modo sombra (spec §10 fatia 2): a Eva precifica e mostra pro Junior. NADA vai pro cliente.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventoInput } from '../elo/eventos.js';
import { consumoAlvo, decidirFaixa } from './autonomia.js';
import { precificar, type ResultadoPrecificacao } from './precificador.js';
import { montarCardSombra, montarCardSombraErro } from './card-sombra.js';
import type { TabelaPrecosService } from './tabela-precos.js';
import type { Telhado } from './tabela-precos-parser.js';

export interface SombraDeps {
  client: SupabaseClient;
  tabela: Pick<TabelaPrecosService, 'itensAtivos'>;
  sendText: (to: string, text: string) => Promise<void>;
  registrarEvento: (client: any, ev: EventoInput) => Promise<void>;
  adminPhone: string;
}

export type SombraResultado =
  | { ok: true; versao: number; resultado: Extract<ResultadoPrecificacao, { ok: true }> }
  | { ok: false; erro: 'lead_nao_encontrado' | 'sem_dados' | 'fluxo_atual' | 'consumo_invalido' | 'tabela_incompleta' | 'interno' };

/** Tira um número de kWh de um texto livre ("uns 900 kwh", "1.200kWh/mês"). Sem kWh no texto → null. */
export function cargaFuturaDe(texto: unknown): number | null {
  if (typeof texto !== 'string') return null;
  const m = /(\d{1,3}(?:\.\d{3})*|\d+)\s*kwh/i.exec(texto);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const TELHADO_PADRAO: Telhado = 'ceramico';

export class SombraService {
  constructor(private readonly deps: SombraDeps) {}

  async rodarParaLead(p: { leadId: string; agoraMs: number; origem: string; silencioso?: boolean }): Promise<SombraResultado> {
    try {
      const { data: lead } = await this.deps.client.from('leads')
        .select('id, name, city, company_id, energy_data, future_demand').eq('id', p.leadId).maybeSingle();
      if (!lead) return { ok: false, erro: 'lead_nao_encontrado' };
      const l = lead as any;
      const nome: string = l.name || 'lead';
      const ed = (l.energy_data ?? {}) as Record<string, unknown>;
      const consumoFatura = Number(ed.consumption_kwh ?? ed.consumo_kwh) || null;
      const cargaFutura = cargaFuturaDe(l.future_demand);
      const alvo = consumoAlvo({ consumoKwh: consumoFatura, cargaFuturaKwh: cargaFutura });
      const faixa = decidirFaixa(alvo);

      const avisar = async (txt: string) => { if (!p.silencioso) await this.deps.sendText(this.deps.adminPhone, txt); };

      if (faixa === 'sem_dados') { await avisar(montarCardSombraErro({ nome, erro: 'sem_dados', faltando: [] })); return { ok: false, erro: 'sem_dados' }; }
      if (faixa === 'fluxo_atual') { await avisar(montarCardSombraErro({ nome, erro: 'fluxo_atual', faltando: [] })); return { ok: false, erro: 'fluxo_atual' }; }

      const tabela = await this.deps.tabela.itensAtivos();
      const telhado = TELHADO_PADRAO; // lead não tem telhado no banco (fatia 3 pergunta)
      const resultado = precificar({ consumoAlvoKwh: alvo!, telhado, tabela, agoraMs: p.agoraMs });
      if (!resultado.ok) {
        await avisar(montarCardSombraErro({ nome, erro: resultado.erro, faltando: resultado.faltando }));
        return { ok: false, erro: resultado.erro };
      }

      const { data: ultimas } = await this.deps.client.from('propostas_versoes')
        .select('versao').eq('lead_id', p.leadId).order('versao', { ascending: false }).limit(1);
      const versao = ((ultimas?.[0] as any)?.versao ?? 0) + 1;
      const params = { consumoAlvoKwh: alvo, consumoFatura, cargaFutura, telhado, telhadoAssumido: true, faixa, origem: p.origem };
      await this.deps.client.from('propostas_versoes').insert({
        lead_id: p.leadId, company_id: l.company_id ?? undefined, versao, autor: 'eva', sombra: true,
        pedido_texto: null, params_json: params, resultado_json: resultado,
        created_at: new Date(p.agoraMs).toISOString(),
      });
      await this.deps.registrarEvento(this.deps.client, {
        tipo: 'comercial:sombra_gerada', leadId: p.leadId, companyId: l.company_id ?? null, canal: 'sistema', origem: 'sombra',
        payload: { versao, faixa, consumoAlvoKwh: alvo, totais: resultado.opcoes.map(o => ({ [o.rotulo]: o.total })), avisos: resultado.avisos.map(a => a.tipo) },
      });
      const card = montarCardSombra({ nome, cidade: l.city ?? null, versao, faixa, telhadoAssumido: true, consumoFatura, cargaFutura, resultado });
      await this.deps.sendText(this.deps.adminPhone, card);
      console.log(`[sombra] v${versao} lead=${p.leadId} faixa=${faixa} A=${resultado.opcoes[0]?.total}`);
      return { ok: true, versao, resultado };
    } catch (e) {
      console.error('[sombra] erro', e instanceof Error ? e.message : e);
      return { ok: false, erro: 'interno' };
    }
  }

  /** Gancho automático: primeira vez que o lead ganha consumo. Silencioso fora da faixa. */
  async rodarSeNuncaRodou(leadId: string, agoraMs: number): Promise<void> {
    try {
      const { data } = await this.deps.client.from('propostas_versoes').select('versao').eq('lead_id', leadId).limit(1);
      if (data && data.length) return;
      await this.rodarParaLead({ leadId, agoraMs, origem: 'auto', silencioso: true });
    } catch (e) {
      console.error('[sombra] rodarSeNuncaRodou', e instanceof Error ? e.message : e);
    }
  }
}

export function makeSombraHandler(d: {
  svc: SombraService;
  client: SupabaseClient;
  isAdminPhone: (from: string) => boolean;
  sendText: (to: string, text: string) => Promise<void>;
  agoraMs: () => number;
}): (from: string, text: string) => Promise<boolean> {
  return async (from, text) => {
    if (!d.isAdminPhone(from)) return false;
    const m = /^\/?sombra(?:\s+(.+))?$/i.exec(text.trim());
    if (!m) return false;
    const nome = (m[1] ?? '').trim();
    if (!nome) { await d.sendText(from, '🕶️ Uso: /sombra <nome do lead> — a Eva monta a proposta e te mostra, sem enviar.'); return true; }
    try {
      const { data } = await d.client.from('leads').select('id, name, created_at')
        .ilike('name', `%${nome}%`).is('archived_at', null).order('created_at', { ascending: false }).limit(5);
      const leads = (data ?? []) as Array<{ id: string; name: string }>;
      if (!leads.length) { await d.sendText(from, `Não achei lead com "${nome}".`); return true; }
      if (leads.length > 1) await d.sendText(from, `${leads.length} leads com "${nome}" — usando o mais recente: ${leads[0].name}.`);
      await d.svc.rodarParaLead({ leadId: leads[0].id, agoraMs: d.agoraMs(), origem: 'comando' });
    } catch (e) {
      console.error('[sombra] handler', e instanceof Error ? e.message : e);
      await d.sendText(from, '⚠️ Deu erro ao rodar a sombra. Tenta de novo.');
    }
    return true;
  };
}
```

Nota para o fake do teste: o `.is('archived_at', null)` exige que o fake trate `is` com `== null` (já está no fake acima — `r[k] == v`).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/sombra.test.ts`
Expected: PASS (14 testes)

- [ ] **Step 5: Commit**

```bash
git add src/modules/vendas/sombra.ts tests/sombra.test.ts
git commit -m "feat(vendas): SombraService + comando /sombra (precifica e mostra, sem enviar)"
```

---

### Task 11: Wiring em `src/index.ts`

**Files:**
- Modify: `src/index.ts` — instâncias (perto de `FollowupVivoService`, ~L682-719), handlers admin (cadeia ~L4338-4362), gate de mídia do admin (~L5859-5872), ação `update_lead` (~L6160 / onde `energy_data` é persistido), ganchos de estado.

- [ ] **Step 1: Imports**

Junto dos imports de `./modules/vendas/followup-vivo.js`:

```ts
import { EstadoVendaService } from './modules/vendas/estado-venda.js';
import { TabelaPrecosService, makeTabelaHandler } from './modules/vendas/tabela-precos.js';
import { LeitorPrintTabela } from './modules/vendas/tabela-precos-print.js';
import { SombraService, makeSombraHandler } from './modules/vendas/sombra.js';
import { registrarEvento } from './modules/elo/eventos.js'; // se já não estiver importado
```

- [ ] **Step 2: Instâncias (logo após `const visitas = new VisitasService(...)`)**

```ts
// Fatia 2 — Eva Vendedora: estado de venda + tabela de preços + sombra (spec 2026-08-21 §10.2)
const ECOSUN_COMPANY_ID = '00000000-0000-0000-0000-000000000001';
const estadoVenda = new EstadoVendaService({ client: supabase.getClient(), registrarEvento });
const tabelaPrecos = new TabelaPrecosService({ client: supabase.getClient(), companyId: ECOSUN_COMPANY_ID });
const sombra = new SombraService({
  client: supabase.getClient(),
  tabela: tabelaPrecos,
  sendText,
  registrarEvento,
  adminPhone: config.engineerPhone,
});
const leitorPrintTabela = new LeitorPrintTabela({
  svc: tabelaPrecos,
  sendText,
  agoraMs: () => Date.now(),
  lerImagem: async (base64, mimeType, prompt) => {
    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 1500,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType as any, data: base64 } },
        { type: 'text', text: prompt },
      ] }],
    });
    medirIa({ modelo: 'claude-haiku-4-5-20251001', origem: 'tabela-precos-print', usage: r.usage });
    return r.content.map(c => (c.type === 'text' ? c.text : '')).join('');
  },
});
const tryHandleTabelaCommand = makeTabelaHandler({ svc: tabelaPrecos, isAdminPhone, sendText, agoraMs: () => Date.now() });
const tryHandleSombraCommand = makeSombraHandler({ svc: sombra, client: supabase.getClient(), isAdminPhone, sendText, agoraMs: () => Date.now() });
```

(`anthropic` = a instância `new Anthropic(...)` que já existe pro redator do follow-up; se o nome for outro, usar o mesmo. `Date.now()` só nas closures do index, nunca dentro dos módulos.)

- [ ] **Step 3: Handlers de texto na cadeia admin**

Logo **antes** de `if (await tryHandleFollowupVivoCommand(from, text)) return;`:

```ts
// "/tabela ..." — tabela de preços do Junior (fatia 2).
if (await tryHandleTabelaCommand(from, text)) return;
// "ok tabela" — confirma itens lidos de um print.
if (isAdminPhone(from) && await leitorPrintTabela.tratarTexto(from, text)) return;
// "/sombra <nome>" — Eva precifica e mostra, sem enviar.
if (await tryHandleSombraCommand(from, text)) return;
```

- [ ] **Step 4: Gate de mídia do admin**

No bloco onde hoje está `tryHandleFinanceiroMedia(getCaixaDeps(), from, { base64, mimeType, messageId }, 'imagem')` (imagem recebida de admin), **antes** dele:

```ts
if (isAdminPhone(from) && await leitorPrintTabela.tratarImagem(from, { base64, mimeType, legenda: caption ?? null })) return;
```

(`caption` = a legenda da mensagem de imagem; usar a variável que o bloco já tem — se não tiver, pegar de `message.caption`/`msg.imageMessage?.caption` conforme o adaptador de mensageria local. Se a legenda não estiver disponível nesse ponto, passar `null` e o Junior usa `/tabela` em texto — registrar isso no commit.)

- [ ] **Step 5: Gancho automático no `update_lead`**

Onde a ação da IA `update_lead` persiste `energy_data.consumption_kwh` (grep `consumption_kwh` em `src/index.ts`, ~L6160 e o trecho que faz `upsertLead`/`update` com esse campo), **depois** da gravação:

```ts
// Fatia 2: lead ganhou consumo → QUALIFICADO + sombra (uma vez, silenciosa fora da faixa).
if (leadId && Number(energyDataNovo?.consumption_kwh) > 0) {
  void estadoVenda.transicionar({ leadId, para: 'QUALIFICADO', motivo: 'consumo informado', autor: 'eva', agoraMs: Date.now() });
  void sombra.rodarSeNuncaRodou(leadId, Date.now());
}
```

(Usar os nomes reais das variáveis do trecho: o id do lead e o objeto `energy_data` recém-gravado.)

- [ ] **Step 6: Ganchos de estado nos pontos que já existem (fatia 1)**

Cada um é **uma linha** `void estadoVenda.transicionar(...)`, ao lado da chamada já existente — nunca antes dela, nunca com `await` que possa atrasar o fluxo:

| Onde (gancho da fatia 1) | Transição |
|---|---|
| `followupVivo.agendarParaProposta(...)` (envio pelo dashboard e `onPropostaEnviada`) — quando `leadId` existir | `{ para: 'PROPOSTA_ENVIADA', motivo: 'proposta enviada', autor: 'junior' }` e em seguida `{ para: 'FOLLOWUP_VIVO', motivo: 'follow-up agendado', autor: 'sistema' }` |
| `visitas.registrar(...)` (visita_agendada) | `{ para: 'AGENDADO', motivo: 'visita agendada', autor: 'eva' }` |
| `followupVivo.cancelarPorLead(leadId, 'opt_out')` / `'disqualify'` | `{ para: 'PERDIDO', motivo: <mesmo motivo>, autor: 'sistema' }` |
| `followupVivo.cancelarPorLead(leadId, 'eva_off')` / `'inativo'` / takeover (`takeover.pause`) | `{ para: 'QUER_JUNIOR', motivo: <mesmo motivo>, autor: 'junior' }` |
| `onLeadGanho` → `'fechou'` | `{ para: 'FECHADO', motivo: 'venda registrada', autor: 'junior' }` |

Transições inválidas (ex.: lead NOVO recebendo PROPOSTA_ENVIADA porque o Junior postou sem a Eva qualificar) são **rejeitadas com warn** — aceitável na fatia 2; a fatia 3 cobre o caminho QUALIFICADO explícito. Para não perder esses casos, em `agendarParaProposta` fazer antes `transicionar(QUALIFICADO, 'proposta sem qualificação prévia')` e só então PROPOSTA_ENVIADA (a primeira vira no-op se já estava qualificado ou falha silenciosa se já estava adiante).

- [ ] **Step 7: tsc + suíte completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc limpo; todos os testes verdes (2.737 + ~60 novos).

- [ ] **Step 8: Commit**

```bash
git add src/index.ts
git commit -m "feat(vendas): wiring fatia 2 — /tabela, print, /sombra, gancho automático e estados de venda"
```

---

### Task 12: Entrega — migrations, review, deploy, sombra com 3 leads reais

**Files:** nenhum novo.

- [ ] **Step 1: Review 3× (regra da casa)** — `superpowers:requesting-code-review` sobre o diff da branch; corrigir e commitar o que vier.
- [ ] **Step 2: Combinar números 103/104 no grupo** → Junior roda as duas no SQL Editor de prod (`kupnsoyymulbdzakqlqc`).
- [ ] **Step 3: Junior autoriza `git push`** → PR `feat(vendas): tabela de preços + precificador em modo sombra + estados de venda` → comando de merge na mesma mensagem → Implantar EasyPanel → `/health` com carimbo posterior ao merge.
- [ ] **Step 4: Junior alimenta a tabela** (mínimo pra rodar): 2 módulos de marcas diferentes, 1–2 micros com módulos/unidade, estrutura `ceramico` (e `fibrocimento`), cabos. Confere com `/tabela`.
- [ ] **Step 5: Sombra com 3 leads reais (spec §9):** `/sombra Nelson`, `/sombra Joel`, `/sombra Udson` — comparar com os fechamentos reais (5,72 kWp R$ 13.800 · 8,58 kWp R$ 19.200 · 8,75 kWp R$ 20.643,81). Meta: totais dentro de ±5% e R$/Wp entre 2,2 e 2,6. O que desviar → ajustar tabela (preço) ou faixa de serviço (spec) — **nunca** o motor na mão.
- [ ] **Step 6: Memória** — registrar resultado da comparação e o que ficou pra fatia 3 (telhado/fase na qualificação, card OK, envio).

---

## Self-review (feito ao escrever)

**Spec coverage.** §2.1 nenhum número na IA → precificador puro + tabela do Junior; vision só transcreve e exige "ok tabela" (T7). §2.3 consumo-alvo → `consumoAlvo` (T4) + `cargaFuturaDe` (T10). §2.6 auditável → `propostas_versoes` (T1/T10) + Elo `comercial:estado_venda`/`comercial:sombra_gerada` (T3/T10). §3 estados/transições/log → T2/T3/T11.6. §4.1 régua 3,75 + módulos → T8 (micros por `modulos_por_unidade` em vez de FDI: decisão registrada, sem datasheet não se infere). §4.2 tabela + 15 d + `/tabela` + print → T1/T5/T6/T7. §4.3 serviço por faixa → T4. §4.4 trava 2,60 + Greener → T8. §4.5 duas opções A/B marcas diferentes → T8; página `/propostas/<slug>` fica pra fatia 3 (sombra não publica). §5 formato do card → T9 (versão sombra). §8 motor falha → card "falta na tabela" (T9/T10); preço velho avisa sem bloquear (T8). §9 golden 3 casos reais → T12.5 (em prod, com a tabela real; não dá pra fixar em teste sem os preços reais). Fora da fatia: card OK/ajustes/envio (fatia 3), >1.500 handoff real (fatia 4) — a sombra só sinaliza.

**Placeholders.** Nenhum "TBD"; o único ponto aberto é a variável da legenda da imagem no index (T11.4), com fallback explícito.

**Consistência de tipos.** `ItemTabela` (parser) ⊂ `ItemPreco` (+`atualizadoEmMs`) usado por precificador/card; `Telhado` vem do parser; `ResultadoPrecificacao` usado por card e sombra; `Faixa` de autonomia usado no card; `EstadoVenda` das regras usado no service; handlers com `(from, text) => Promise<boolean>`; `registrarEvento(client, EventoInput)` conforme `elo/eventos.ts`.
