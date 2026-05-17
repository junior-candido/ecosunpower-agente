# Dashboard Unificado S1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Espinha de atribuição: classificar todo lead num `channel` canônico + tabela única `channel_daily_metrics` + funil/custo por canal no dashboard (Meta com números reais, google/blog slots vazios), sem regredir o funil/métricas Meta atuais.

**Architecture:** `resolveChannel` é função PURA (input de atribuição tipado → 1 de 6 canais), testada exaustivamente; um mapper fino traduz o lead real → esse input (desacopla da coluna). `channel_daily_metrics` (migration manual em prod) é o ponto único de spend/tráfego/dia. `fetchChannelFunnel` reusa o funil existente agrupado por `channel`. Seção "Canais" aditiva no `/dashboard/marketing`.

**Tech Stack:** TypeScript ESM, Node 20, Vitest, Supabase (Postgres), prompt/dashboard server-rendered.

**Spec:** `docs/superpowers/specs/2026-05-17-dashboard-unificado-s1-design.md`

---

## ⚠️ Regra de zero-regressão (vale em TODA task)

S1 toca pipeline marketing/dashboard EM PROD. Preservar, verificado por leitura do diff (deve ser ADITIVO):
- `fetchMarketingKpis` / `listActiveCampaigns` (`dashboard/marketing-queries.ts`) — assinatura e números atuais idênticos. `fetchChannelFunnel` é função NOVA, não substitui.
- `collectInsights` (`marketing/insights-collector.ts`) — a escrita atual em `meta_ads_insights` intacta; o upsert em `channel_daily_metrics` é ADITIVO (após o que já faz, best-effort, não bloqueia o cron).
- `renderMarketingPage` (`dashboard/marketing-views.ts`) — seções atuais inalteradas; "Canais" é seção NOVA.
- `upsertLead` (`supabase.ts`) — escrita de `channel` é aditiva; nenhum campo existente muda.
- Suítes verdes (só `cases-fetcher` pré-existente permitida). Migrations aplicadas MANUAL em prod (MCP Supabase aponta pro projeto errado — memória `supabase-mcp-mismatch`; o plano entrega o SQL).

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/modules/dashboard/resolve-channel.ts` | Função pura `resolveChannel(input)→Channel` + tipo `Channel` | Criar |
| `tests/resolve-channel.test.ts` | TDD exaustivo de `resolveChannel` | Criar |
| `migrations/031_channel_daily_metrics.sql` | Tabela única métricas/dia/canal | Criar |
| `migrations/032_leads_channel.sql` | Coluna `leads.channel` | Criar |
| `src/modules/dashboard/channel-mapper.ts` | `leadRowToChannelInput(row)` (lead real → input puro) | Criar |
| `tests/channel-mapper.test.ts` | TDD do mapper | Criar |
| `src/index.ts` / caminho de criação de lead | Persistir `channel` no upsert | Modificar |
| `src/modules/marketing/insights-collector.ts` | Upsert Meta → `channel_daily_metrics` | Modificar |
| `src/modules/dashboard/marketing-queries.ts` | `fetchChannelFunnel(supabase,periodo)` | Modificar (add export) |
| `tests/channel-funnel.test.ts` | TDD agregação por canal (fixtures) | Criar |
| `src/modules/dashboard/marketing-views.ts` | Seção "Canais" (aditiva) | Modificar |
| `src/modules/dashboard/router.ts` | Wire `fetchChannelFunnel` na rota | Modificar |
| `scripts/backfill-channel.ts` | Backfill idempotente de `leads.channel` | Criar |

---

## Task 1: `resolveChannel` — função pura (TDD)

**Files:** Create `src/modules/dashboard/resolve-channel.ts`; Create `tests/resolve-channel.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/resolve-channel.test.ts
import { describe, it, expect } from 'vitest';
import { resolveChannel } from '../src/modules/dashboard/resolve-channel.js';

describe('resolveChannel — prioridade determinística', () => {
  it('1) ad_campaign_id presente -> meta (CTWA/anúncio Meta)', () => {
    expect(resolveChannel({ adCampaignId: '120xyz' })).toBe('meta');
    expect(resolveChannel({ adCampaignId: '120xyz', leadSource: 'google' })).toBe('meta');
  });
  it('2) lead_source explícito', () => {
    expect(resolveChannel({ leadSource: 'google' })).toBe('google');
    expect(resolveChannel({ leadSource: 'gads' })).toBe('google');
    expect(resolveChannel({ leadSource: 'facebook' })).toBe('meta');
    expect(resolveChannel({ leadSource: 'instagram' })).toBe('meta');
    expect(resolveChannel({ leadSource: 'indicacao' })).toBe('indicacao');
    expect(resolveChannel({ leadSource: 'indicação' })).toBe('indicacao');
    expect(resolveChannel({ leadSource: 'blog' })).toBe('blog');
  });
  it('3) origin quando não há lead_source', () => {
    expect(resolveChannel({ origin: 'google' })).toBe('google');
    expect(resolveChannel({ origin: 'meta' })).toBe('meta');
  });
  it('4) utm_source/utm_campaign', () => {
    expect(resolveChannel({ utmSource: 'google' })).toBe('google');
    expect(resolveChannel({ utmSource: 'facebook' })).toBe('meta');
    expect(resolveChannel({ utmCampaign: 'blog-post-x' })).toBe('blog');
  });
  it('5) referrer', () => {
    expect(resolveChannel({ referrer: 'https://www.google.com/search' })).toBe('google');
    expect(resolveChannel({ referrer: 'https://ecosunpower.eng.br/blog/x' })).toBe('blog');
  });
  it('6) nada casa -> direto; presente mas irreconhecível -> outro; nunca lança', () => {
    expect(resolveChannel({})).toBe('direto');
    expect(resolveChannel(null as never)).toBe('direto');
    expect(resolveChannel(undefined as never)).toBe('direto');
    expect(resolveChannel({ leadSource: 'xyz-desconhecido' })).toBe('outro');
    expect(() => resolveChannel({ leadSource: 123 as never })).not.toThrow();
  });
});
```

- [ ] **Step 2: Rodar — espera FAIL**

Run: `npx vitest run tests/resolve-channel.test.ts`
Expected: FAIL (`resolveChannel` não existe).

- [ ] **Step 3: Implementar**

```ts
// src/modules/dashboard/resolve-channel.ts
export type Channel = 'meta' | 'google' | 'blog' | 'direto' | 'indicacao' | 'outro';

export interface ChannelInput {
  adCampaignId?: string | null;
  leadSource?: string | null;
  origin?: string | null;
  utmSource?: string | null;
  utmCampaign?: string | null;
  referrer?: string | null;
}

function norm(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

// Mapeia um token textual -> canal conhecido, ou '' se não reconhecer.
function tokenToChannel(s: string): Channel | '' {
  if (!s) return '';
  if (/(^|[^a-z])(meta|facebook|instagram|fb|ig)([^a-z]|$)/.test(s)) return 'meta';
  if (/(^|[^a-z])(google|gads|adwords|google[_-]?ads)([^a-z]|$)/.test(s)) return 'google';
  if (/(^|[^a-z])(indica[cç][aã]o|indicacao|referral|indica)([^a-z]|$)/.test(s)) return 'indicacao';
  if (/(^|[^a-z])(blog|org[aâ]nico|organico|seo)([^a-z]|$)/.test(s)) return 'blog';
  return '';
}

export function resolveChannel(input: ChannelInput | null | undefined): Channel {
  const i = input ?? {};
  // 1) anúncio Meta (CTWA/ad) tem prioridade máxima
  if (norm(i.adCampaignId)) return 'meta';
  // 2-4) lead_source -> origin -> utm_source -> utm_campaign
  for (const raw of [i.leadSource, i.origin, i.utmSource, i.utmCampaign]) {
    const s = norm(raw);
    if (!s) continue;
    const c = tokenToChannel(s);
    if (c) return c;
    // presente mas irreconhecível: lembra que houve sinal (vira 'outro' no fim)
    (resolveChannel as unknown as { _seen?: boolean })._seen = true;
  }
  // 5) referrer
  const ref = norm(i.referrer);
  if (ref) {
    if (ref.includes('google.')) return 'google';
    if (ref.includes('ecosunpower.eng.br/blog') || ref.includes('/blog')) return 'blog';
  }
  // 6) houve sinal não reconhecido -> 'outro'; nada -> 'direto'
  const hadSignal = [i.leadSource, i.origin, i.utmSource, i.utmCampaign, i.referrer].some(v => norm(v));
  return hadSignal ? 'outro' : 'direto';
}
```
> Remover o hack `_seen` se desnecessário: o `hadSignal` final já cobre "presente mas irreconhecível → outro". Manter a função pura e sem estado — preferir `hadSignal`. (Executor: implemente direto com `hadSignal`, sem `_seen`.)

- [ ] **Step 4: Rodar — espera PASS**

Run: `npx vitest run tests/resolve-channel.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/resolve-channel.ts tests/resolve-channel.test.ts
git commit -m "feat(dashboard): resolveChannel puro (S1 — 6 canais, prioridade determinística)"
```

---

## Task 2: Migrations SQL (manual em prod)

**Files:** Create `migrations/031_channel_daily_metrics.sql`; Create `migrations/032_leads_channel.sql`

- [ ] **Step 1: Criar `migrations/031_channel_daily_metrics.sql`**

```sql
-- S1 dashboard unificado: ponto único de métricas/dia por canal.
create table if not exists channel_daily_metrics (
  channel      text        not null,
  date         date        not null,
  spend_cents  bigint      not null default 0,
  clicks       integer     not null default 0,
  impressions  integer     not null default 0,
  source       text        not null default 'manual',
  updated_at   timestamptz not null default now(),
  primary key (channel, date)
);
```

- [ ] **Step 2: Criar `migrations/032_leads_channel.sql`**

```sql
-- S1: canal canônico do lead (preenchido por resolveChannel).
alter table leads add column if not exists channel text;
create index if not exists idx_leads_channel on leads (channel);
```

- [ ] **Step 3: Verificar (sem aplicar automático — MCP aponta pro projeto errado)**

Não rodar via MCP. No commit, instruir o Junior: aplicar os 2 SQLs no **Supabase SQL Editor do projeto `kupnsoyymulbdzakqlqc`** (prod), idempotentes (pode rodar 2×). Verificação pós-aplicação: `select count(*) from channel_daily_metrics;` retorna 0 sem erro; `select channel from leads limit 1;` não dá erro de coluna.

- [ ] **Step 4: Commit**

```bash
git add migrations/031_channel_daily_metrics.sql migrations/032_leads_channel.sql
git commit -m "feat(db): migrations channel_daily_metrics + leads.channel (S1, aplicar manual prod)"
```

---

## Task 3: Mapper lead→input + persistir `channel` no upsert

**Files:** Create `src/modules/dashboard/channel-mapper.ts`; Create `tests/channel-mapper.test.ts`; Modify o caminho de criação/atualização de lead

- [ ] **Step 1: Ler o shape real do lead**

Run: `grep -n "interface LeadData" -A 25 src/modules/supabase.ts` e `grep -n "parseTrackingTag\|TrackingParsed\|lead_source\|utm" src/modules/tracking.ts | head`
Objetivo: anotar os nomes REAIS dos campos de atribuição disponíveis no lead/tracking (ex.: `origin`, `ad_campaign_id`, e onde `lead_source`/`utm_*`/`referrer` vivem — coluna, ou dentro de tracking parse). NÃO assumir; usar os nomes reais no Step 3.

- [ ] **Step 2: Escrever o teste que falha**

```ts
// tests/channel-mapper.test.ts
import { describe, it, expect } from 'vitest';
import { leadRowToChannelInput } from '../src/modules/dashboard/channel-mapper.js';

describe('leadRowToChannelInput', () => {
  it('extrai os campos de atribuição do lead real -> ChannelInput', () => {
    const row = { ad_campaign_id: '120abc', origin: 'google', lead_source: 'gads',
      utm_source: 'google', utm_campaign: 'c1', referrer: 'https://google.com' };
    expect(leadRowToChannelInput(row)).toEqual({
      adCampaignId: '120abc', leadSource: 'gads', origin: 'google',
      utmSource: 'google', utmCampaign: 'c1', referrer: 'https://google.com',
    });
  });
  it('campos ausentes viram undefined, não quebra', () => {
    expect(() => leadRowToChannelInput({})).not.toThrow();
    expect(leadRowToChannelInput({}).adCampaignId).toBeUndefined();
  });
});
```
> Ajustar as CHAVES de `row` no teste pros nomes REAIS lidos no Step 1 (ex.: se utm vive em `tracking.utm_source`, refletir isso). Manter `ChannelInput` (Task 1) como saída.

- [ ] **Step 3: Rodar (FAIL), implementar `channel-mapper.ts`, rodar (PASS)**

Run: `npx vitest run tests/channel-mapper.test.ts` → FAIL.
Implementar `leadRowToChannelInput(row): ChannelInput` lendo os campos REAIS (Step 1) e devolvendo o `ChannelInput` da Task 1. Run de novo → PASS.

- [ ] **Step 4: Ligar no upsert do lead**

Localizar onde o lead é criado/atualizado com `origin`/`ad_campaign_id` (grep `upsertLead(` e o handler de criação em `src/index.ts`). No ponto de criação/atualização, computar `resolveChannel(leadRowToChannelInput(row))` e gravar em `leads.channel` (incluir `channel` no objeto do upsert). ADITIVO — não alterar nenhum campo existente. Mostrar o trecho exato no commit.

- [ ] **Step 5: Build + suíte + commit**

Run: `npx tsc && npx vitest run`
Expected: EXIT 0; verde (só `cases-fetcher`).
```bash
git add src/modules/dashboard/channel-mapper.ts tests/channel-mapper.test.ts src/index.ts src/modules/supabase.ts
git commit -m "feat(dashboard): grava leads.channel no upsert (mapper + resolveChannel)"
```

---

## Task 4: Adaptador Meta → `channel_daily_metrics`

**Files:** Modify `src/modules/marketing/insights-collector.ts`

- [ ] **Step 1: Ler o trecho atual de escrita de insight**

Run: `grep -n "collectInsights\|spend_cents\|meta_ads_insights\|upsert\|insert" src/modules/marketing/insights-collector.ts | head -20`
Anotar como/onde a linha de insight Meta é gravada hoje (tabela, colunas spend_cents/clicks/impressions/date) e o client supabase usado.

- [ ] **Step 2: Adicionar upsert agregado em `channel_daily_metrics`**

Após a escrita existente (sem alterá-la), agregar por DIA (somando todas as campanhas Meta do dia) e fazer upsert único:
`upsert into channel_daily_metrics (channel,date,spend_cents,clicks,impressions,source,updated_at) values ('meta', <date>, <sum spend_cents>, <sum clicks>, <sum impressions>, 'meta_insights', now()) on conflict (channel,date) do update set ...`.
Best-effort: erro aqui NÃO bloqueia o cron (try/catch + `console.warn('[channel-metrics] ...')`, padrão da casa). Mostrar o trecho exato.

- [ ] **Step 3: Teste da agregação (helper puro)**

Extrair a soma diária num helper puro `aggregateMetaDaily(rows): {date,spend_cents,clicks,impressions}[]` e testar com fixture:
```ts
// tests/channel-funnel.test.ts (parte 1 — agregação meta)
import { aggregateMetaDaily } from '../src/modules/marketing/insights-collector.js';
it('soma spend/clicks/impressions por dia', () => {
  const out = aggregateMetaDaily([
    { date_start: '2026-05-17', spend_cents: 1000, clicks: 10, impressions: 100 },
    { date_start: '2026-05-17', spend_cents: 500,  clicks: 5,  impressions: 50  },
  ]);
  expect(out).toEqual([{ date: '2026-05-17', spend_cents: 1500, clicks: 15, impressions: 150 }]);
});
```
Run FAIL → implementar `aggregateMetaDaily` (export) e usar no Step 2 → run PASS.

- [ ] **Step 4: Build + suíte + commit**

Run: `npx tsc && npx vitest run` → EXIT 0; verde.
```bash
git add src/modules/marketing/insights-collector.ts tests/channel-funnel.test.ts
git commit -m "feat(dashboard): cron Meta popula channel_daily_metrics (channel=meta, aditivo)"
```

---

## Task 5: `fetchChannelFunnel(supabase, periodo)`

**Files:** Modify `src/modules/dashboard/marketing-queries.ts`; Modify `tests/channel-funnel.test.ts`

- [ ] **Step 1: Ler o funil/métrica existente**

Run: `grep -n "export async function fetchMarketingKpis\|qualificad\|agendad\|status\|date" src/modules/dashboard/marketing-queries.ts | head -20`
Anotar como o funil atual conta leads (criado→qualificado→agendado) e a janela de período, pra REUSAR a mesma lógica (não recontar diferente).

- [ ] **Step 2: Teste da agregação por canal (fixtures)**

```ts
// tests/channel-funnel.test.ts (parte 2 — funil por canal)
import { aggregateChannelFunnel } from '../src/modules/dashboard/marketing-queries.js';
it('agrupa funil por channel + custo do channel_daily_metrics', () => {
  const leads = [
    { channel: 'meta', status: 'agendado' }, { channel: 'meta', status: 'qualificado' },
    { channel: 'google', status: 'novo' }, { channel: null, status: 'novo' },
  ];
  const metrics = [{ channel: 'meta', spend_cents: 30000 }];
  const out = aggregateChannelFunnel(leads, metrics);
  const meta = out.find(r => r.channel === 'meta')!;
  expect(meta.total).toBe(2); expect(meta.agendado).toBe(1); expect(meta.spend_cents).toBe(30000);
  expect(out.find(r => r.channel === 'google')!.spend_cents).toBe(0); // slot vazio
  expect(out.find(r => r.channel === 'direto')).toBeTruthy(); // channel null -> direto
});
```
Run FAIL.

- [ ] **Step 3: Implementar `aggregateChannelFunnel` (puro) + `fetchChannelFunnel` (I/O fino)**

`aggregateChannelFunnel(leads, metrics)` puro: agrupa por `channel` (null/'' → 'direto'), conta funil reusando os MESMOS status do funil atual, junta `spend_cents` do metrics por canal (canal sem métrica → 0), calcula CPL/custo-por-agendamento por canal. `fetchChannelFunnel(supabase, periodo)`: busca leads do período + linhas de `channel_daily_metrics` do período, chama o helper puro. Reusa a mesma janela de período do funil atual (Step 1). Linhas garantidas pros 6 canais (slots vazios visíveis).
Run PASS.

- [ ] **Step 4: Build + suíte + commit**

Run: `npx tsc && npx vitest run` → EXIT 0; verde.
```bash
git add src/modules/dashboard/marketing-queries.ts tests/channel-funnel.test.ts
git commit -m "feat(dashboard): fetchChannelFunnel — funil+custo por canal (reusa funil atual)"
```

---

## Task 6: Seção "Canais" no dashboard (aditiva)

**Files:** Modify `src/modules/dashboard/marketing-views.ts`; Modify `src/modules/dashboard/router.ts`

- [ ] **Step 1: Ler o padrão de render + rota atuais**

Run: `grep -n "renderMarketingPage\|MarketingPageInput\|section\|<table\|filtro\|periodo\|csv\|export" src/modules/dashboard/marketing-views.ts | head` e `grep -n "marketing\|fetchMarketingKpis\|render" src/modules/dashboard/router.ts | head`
Anotar: shape de `MarketingPageInput`, como uma seção/tabela é renderada hoje, como o filtro de período e o CSV existentes funcionam (REUSAR, não reinventar).

- [ ] **Step 2: Estender input + render (ADITIVO)**

Adicionar `channels: ChannelFunnelRow[]` ao `MarketingPageInput`. Em `renderMarketingPage`, adicionar UMA seção nova "Canais" APÓS as seções existentes: tabela canal × (total/qualificado/agendado/CPL/custo-por-agendamento) + barra de funil + usa o filtro de período existente + botão CSV reusando o exportador existente. PT-BR (memória `dashboard_pt_br`). Canal sem dado → "—" (não 0 enganoso). NÃO alterar nenhuma seção/markup existente. Mostrar o diff (deve ser 1 bloco aditivo + 1 campo no input).

- [ ] **Step 3: Wire na rota**

Em `router.ts`, no handler de `/dashboard/marketing`, chamar `fetchChannelFunnel(supabase, periodo)` (mesmo `periodo` já usado pela página) e passar `channels` no input do `renderMarketingPage`. ADITIVO.

- [ ] **Step 4: Build + suíte + commit**

Run: `npx tsc && npx vitest run` → EXIT 0; verde. (Se houver teste de render, manter verde; senão, verificação visual fica no Step 3 da Task 7.)
```bash
git add src/modules/dashboard/marketing-views.ts src/modules/dashboard/router.ts
git commit -m "feat(dashboard): secao Canais no /dashboard/marketing (aditiva, PT-BR, CSV)"
```

---

## Task 7: Backfill + verificação + entrega

**Files:** Create `scripts/backfill-channel.ts`

- [ ] **Step 1: Script de backfill idempotente**

Criar `scripts/backfill-channel.ts`: lê todos os leads sem `channel` (ou todos), aplica `resolveChannel(leadRowToChannelInput(row))`, faz `update leads set channel=... where id=...`. Idempotente (rodar 2× = mesmo resultado). Log de quantos atualizados. Não cria nada, só preenche.

- [ ] **Step 2: Build + suíte completos**

Run: `npx tsc && npx vitest run`
Expected: EXIT 0; verde exceto `cases-fetcher`. Conferir verdes: `resolve-channel`, `channel-mapper`, `channel-funnel`, e os guards de hoje (`lead-disqualify`, `eva-alerts-escalonamento`, `system-blocks`, `cache-log`, `garantia-consistencia`).

- [ ] **Step 3: Code review holístico obrigatório**

Dispatch superpowers:requesting-code-review sobre o diff total das Tasks 1-6. Foco: zero-regressão (funil/métricas Meta atuais idênticos, tudo aditivo: `fetchMarketingKpis`/`collectInsights`/`renderMarketingPage` intactos), `resolveChannel` exaustivo e puro, `channel_daily_metrics` upsert idempotente, sem N+1 nas queries do dashboard, PT-BR. Corrigir Critical/Important; reavaliar.

- [ ] **Step 4: Junior aplica migrations + valida (interativo — precisa dele)**

Junior: rodar `migrations/031` e `032` no **Supabase SQL Editor (prod `kupnsoyymulbdzakqlqc`)**. Confirmar: `channel_daily_metrics` existe, `leads.channel` existe. Depois rodar o backfill (`scripts/backfill-channel.ts`). Abrir `/dashboard/marketing` → seção "Canais": Meta com números (≈ iguais ao funil atual), google/blog/direto com "—"/contagem coerente. Confirmar que o resto do dashboard está idêntico.

- [ ] **Step 5: Push + Implantar**

```bash
git push origin main
```
Junior: Implantar `agente-whatsapp` no Easypanel. Boot ok; cron Meta seguinte popula `channel_daily_metrics` (verificar 1 linha `channel=meta`).

- [ ] **Step 6: Commit do script + atualizar memória**

```bash
git add scripts/backfill-channel.ts
git commit -m "feat(dashboard): script backfill leads.channel (idempotente)"
```
Atualizar memória: S1 EM PROD; `channel_daily_metrics` = ponto único de métricas/dia; S2/S4 liberados; S3 (Google Ads) destravado tecnicamente (falta só acesso à API — pedido do Junior). Registrar `resolveChannel`/mapper/`fetchChannelFunnel`.

---

## Self-Review (preenchido)

**Spec coverage:** Peça 1 (resolveChannel + coluna + backfill) → Tasks 1, 3, 7-Step1. Peça 2 (channel_daily_metrics) → Task 2. Peça 3 (fetchChannelFunnel reusa funil) → Task 5. Peça 4 (seção Canais aditiva, PT-BR, CSV, filtro período) → Task 6. Fluxo de dados (lead→channel; cron→metrics; dashboard junta) → Tasks 3/4/5/6. Erro/edge (desconhecido→direto, sem métrica→"—", idempotente) → Task 1 (test), 2 (SQL idempotente), 4 (upsert on conflict), 5 (slots vazios), 7 (backfill idempotente). Testes (resolveChannel exaustivo, agregação com fixtures, não-regressão) → Tasks 1/4/5/7. Migration manual prod (MCP errado) → Task 2/7-Step4. Zero-regressão → regra global + review Task 7-Step3. Fora de escopo (S2/S3/S4/S5, multi-touch) → respeitado, nenhuma task. Sem gap.

**Placeholder scan:** os Steps "ler o shape real" (Tasks 3/4/5/6 Step 1) são ações concretas (grep exato + o que anotar + o que produzir), não TODO — necessárias porque o código é existente e os nomes reais devem ser confirmados, não inventados (escrever nome de coluna chutado seria pior). O hack `_seen` da Task 1 Step 3 vem com instrução explícita de implementar via `hadSignal` sem ele. Sem TBD/TODO de design.

**Type consistency:** `Channel` e `ChannelInput` (Task 1) usados em `channel-mapper` (Task 3), `resolveChannel` calls (Tasks 3/7). `aggregateMetaDaily` (Task 4) e `aggregateChannelFunnel`/`fetchChannelFunnel`/`ChannelFunnelRow` (Task 5) consistentes com a seção/render (Task 6) e o input do dashboard. `channel_daily_metrics` colunas idênticas entre Task 2 (SQL), Task 4 (upsert) e Task 5 (leitura).

**Escopo:** plano único S1, 7 tasks bite-sized, testável; S2–S5 fora.
