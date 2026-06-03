# Eva Analista de Campanhas (Peça 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Eva calcula custo por lead qualificado por campanha e manda ao Junior um resumo diário no WhatsApp com recomendação (escalar a boa, cortar a cara) — só leitura, sem mexer em verba.

**Architecture:** Função pura `campaign-quality.ts` (cálculo + ranking), função pura `campaign-recommender.ts` (texto), camada de dados `campaign-quality-data.ts` (junta gasto da Meta com leads qualificados do banco), e cron diário em `index.ts` que envia o resumo com botões informativos. Seção nova no dashboard de marketing.

**Tech Stack:** TypeScript + Vitest + Supabase (Postgres) + Express. Meta Ads data já coletada em `meta_ads_insights`.

---

## File Structure

- Create: `src/modules/marketing/campaign-quality.ts` — calculadora pura (cálculo + ranking + status)
- Create: `src/modules/marketing/campaign-recommender.ts` — monta o texto do resumo (PT-BR)
- Create: `src/modules/marketing/campaign-quality-data.ts` — busca gasto + leads qualificados por campanha (camada de dados)
- Create: `tests/campaign-quality.test.ts` — testa a calculadora
- Create: `tests/campaign-recommender.test.ts` — testa o texto
- Modify: `src/index.ts` — registra cron diário + envia resumo no WhatsApp
- Modify: `src/modules/dashboard/marketing-views.ts` — seção "Qualidade por Campanha"

Chave de ligação entre Meta e nossos leads: `marketing_campaigns.meta_campaign_id` (= `leads.ad_campaign_id`). Gasto: `meta_ads_insights.spend_cents` (FK `campaign_id` → `marketing_campaigns.id`).

---

## Task 0 (PRÉ-REQUISITO, operacional — não é código deste plano): Atribuição redonda

A branch `fix/atribuicao-canal-leads` (4 commits) precisa ir pra `main` + rodar backfill + Implantar, senão `leads.ad_campaign_id` não é confiável e a conta de custo-por-qualificado mente.

- [ ] **Step 1:** Junior autoriza o merge/push da branch `fix/atribuicao-canal-leads`.
- [ ] **Step 2:** Rodar o backfill descrito naquela branch (script de backfill de atribuição).
- [ ] **Step 3:** Implantar no Easypanel e confirmar atribuição no dashboard.

> Não bloqueia escrever/testar as Tasks 1–2 (funções puras). Bloqueia só o dado real no cron (Task 4) fazer sentido.

---

## Task 1: Calculadora pura `campaign-quality.ts`

**Files:**
- Create: `src/modules/marketing/campaign-quality.ts`
- Test: `tests/campaign-quality.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// tests/campaign-quality.test.ts
import { describe, it, expect } from 'vitest';
import { analyzeCampaignQuality } from '../src/modules/marketing/campaign-quality.js';

const spends = [
  { campaignId: 'A', name: 'Form GO', spendBrl: 280 },
  { campaignId: 'B', name: 'Form DF', spendBrl: 480 },
];
const leads = [
  { campaignId: 'A', qualified: 10, totalLeads: 20 },
  { campaignId: 'B', qualified: 5, totalLeads: 18 },
];

describe('analyzeCampaignQuality', () => {
  it('calcula custo por lead qualificado e rankeia campeã x cara', () => {
    const r = analyzeCampaignQuality(spends, leads, { minLeadsParaJulgar: 5, desvioPct: 0.4 });
    const a = r.rows.find((x) => x.campaignId === 'A')!;
    const b = r.rows.find((x) => x.campaignId === 'B')!;
    expect(a.costPerQualified).toBe(28);   // 280/10
    expect(b.costPerQualified).toBe(96);   // 480/5
    expect(a.status).toBe('campea');
    expect(b.status).toBe('cara');
    // média ponderada: (280+480)/(10+5) = 50.67
    expect(r.mediaCostPerQualified).toBeCloseTo(50.67, 1);
  });

  it('empate (mesmo custo) → ambas ok', () => {
    const r = analyzeCampaignQuality(
      [{ campaignId: 'A', name: 'A', spendBrl: 100 }, { campaignId: 'B', name: 'B', spendBrl: 100 }],
      [{ campaignId: 'A', qualified: 5, totalLeads: 10 }, { campaignId: 'B', qualified: 5, totalLeads: 10 }],
    );
    expect(r.rows.every((x) => x.status === 'ok')).toBe(true);
  });

  it('volume baixo (< min) → sem_dados, sem recomendação de corte', () => {
    const r = analyzeCampaignQuality(
      [{ campaignId: 'A', name: 'A', spendBrl: 50 }],
      [{ campaignId: 'A', qualified: 0, totalLeads: 2 }],
      { minLeadsParaJulgar: 5 },
    );
    expect(r.rows[0].status).toBe('sem_dados');
  });

  it('gastou e 0 qualificados (com volume) → cara, custo null', () => {
    const r = analyzeCampaignQuality(
      [{ campaignId: 'A', name: 'A', spendBrl: 300 }, { campaignId: 'B', name: 'B', spendBrl: 100 }],
      [{ campaignId: 'A', qualified: 0, totalLeads: 12 }, { campaignId: 'B', qualified: 5, totalLeads: 10 }],
      { minLeadsParaJulgar: 5 },
    );
    const a = r.rows.find((x) => x.campaignId === 'A')!;
    expect(a.costPerQualified).toBeNull();
    expect(a.status).toBe('cara');
  });

  it('média ignora campanhas sem_dados', () => {
    const r = analyzeCampaignQuality(
      [{ campaignId: 'A', name: 'A', spendBrl: 100 }, { campaignId: 'B', name: 'B', spendBrl: 999 }],
      [{ campaignId: 'A', qualified: 5, totalLeads: 10 }, { campaignId: 'B', qualified: 0, totalLeads: 1 }],
      { minLeadsParaJulgar: 5 },
    );
    // B é sem_dados (1 lead) → não entra na média; média = 100/5 = 20
    expect(r.mediaCostPerQualified).toBe(20);
  });

  it('campanha sem nenhum gasto registrado não quebra', () => {
    const r = analyzeCampaignQuality(
      [],
      [{ campaignId: 'A', qualified: 3, totalLeads: 8 }],
    );
    expect(r.rows[0].spendBrl).toBe(0);
    expect(r.rows[0].costPerQualified).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/campaign-quality.test.ts`
Expected: FAIL (`analyzeCampaignQuality is not a function` / módulo não existe)

- [ ] **Step 3: Implementar o mínimo**

```typescript
// src/modules/marketing/campaign-quality.ts
//
// Calculadora PURA: dado gasto por campanha + leads (qualificados/total) por
// campanha, devolve custo por lead qualificado de cada uma, a média ponderada
// e um status relativo (campea/ok/cara/sem_dados). Sem I/O — fácil de testar.

export interface CampaignSpend { campaignId: string; name: string; spendBrl: number; }
export interface CampaignLeads { campaignId: string; qualified: number; totalLeads: number; }
export interface CampaignQualityConfig { minLeadsParaJulgar?: number; desvioPct?: number; }

export type CampaignStatus = 'campea' | 'ok' | 'cara' | 'sem_dados';

export interface CampaignQualityRow {
  campaignId: string;
  name: string;
  spendBrl: number;
  qualified: number;
  totalLeads: number;
  costPerQualified: number | null;
  status: CampaignStatus;
}

export interface CampaignQualityReport {
  rows: CampaignQualityRow[];
  mediaCostPerQualified: number | null;
}

export function analyzeCampaignQuality(
  spends: CampaignSpend[],
  leads: CampaignLeads[],
  config: CampaignQualityConfig = {},
): CampaignQualityReport {
  const minLeads = config.minLeadsParaJulgar ?? 5;
  const desvio = config.desvioPct ?? 0.4;

  const spendByCampaign = new Map(spends.map((s) => [s.campaignId, s]));
  const leadByCampaign = new Map(leads.map((l) => [l.campaignId, l]));
  const allIds = new Set<string>([...spendByCampaign.keys(), ...leadByCampaign.keys()]);

  // 1ª passada: monta linhas com custo, sem status relativo ainda.
  const base = [...allIds].map((id) => {
    const s = spendByCampaign.get(id);
    const l = leadByCampaign.get(id);
    const spendBrl = s?.spendBrl ?? 0;
    const qualified = l?.qualified ?? 0;
    const totalLeads = l?.totalLeads ?? 0;
    const name = s?.name ?? id;
    const costPerQualified = qualified > 0 ? spendBrl / qualified : qualified === 0 && spendBrl === 0 ? 0 : null;
    return { campaignId: id, name, spendBrl, qualified, totalLeads, costPerQualified };
  });

  // Média ponderada só das campanhas COM dados suficientes e com qualificados.
  const comDados = base.filter((b) => b.totalLeads >= minLeads && b.qualified > 0);
  const totalSpend = comDados.reduce((acc, b) => acc + b.spendBrl, 0);
  const totalQualified = comDados.reduce((acc, b) => acc + b.qualified, 0);
  const media = totalQualified > 0 ? totalSpend / totalQualified : null;

  const rows: CampaignQualityRow[] = base.map((b) => {
    let status: CampaignStatus;
    if (b.totalLeads < minLeads) {
      status = 'sem_dados';
    } else if (b.qualified === 0) {
      status = 'cara'; // gastou e não trouxe lead bom
    } else if (media == null) {
      status = 'ok';
    } else if (b.costPerQualified! <= media * (1 - desvio)) {
      status = 'campea';
    } else if (b.costPerQualified! >= media * (1 + desvio)) {
      status = 'cara';
    } else {
      status = 'ok';
    }
    return { ...b, status };
  });

  return { rows, mediaCostPerQualified: media };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/campaign-quality.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add src/modules/marketing/campaign-quality.ts tests/campaign-quality.test.ts
git commit -m "feat(marketing): calculadora pura de custo por lead qualificado por campanha"
```

---

## Task 2: Recomendador (texto) `campaign-recommender.ts`

**Files:**
- Create: `src/modules/marketing/campaign-recommender.ts`
- Test: `tests/campaign-recommender.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// tests/campaign-recommender.test.ts
import { describe, it, expect } from 'vitest';
import { buildCampaignDigest } from '../src/modules/marketing/campaign-recommender.js';
import type { CampaignQualityReport } from '../src/modules/marketing/campaign-quality.js';

const report: CampaignQualityReport = {
  mediaCostPerQualified: 50.67,
  rows: [
    { campaignId: 'A', name: 'Form GO', spendBrl: 280, qualified: 10, totalLeads: 20, costPerQualified: 28, status: 'campea' },
    { campaignId: 'B', name: 'Form DF', spendBrl: 480, qualified: 5, totalLeads: 18, costPerQualified: 96, status: 'cara' },
  ],
};

describe('buildCampaignDigest', () => {
  it('cita a campeã e a pior, com os custos', () => {
    const txt = buildCampaignDigest(report, 14);
    expect(txt).toContain('Form GO');
    expect(txt).toContain('R$28');
    expect(txt).toContain('Form DF');
    expect(txt).toContain('R$96');
    expect(txt).toContain('escalar');
    expect(txt).toContain('cortar');
  });

  it('quando não há dados suficientes em nenhuma, avisa que está juntando dados', () => {
    const semDados: CampaignQualityReport = {
      mediaCostPerQualified: null,
      rows: [{ campaignId: 'A', name: 'A', spendBrl: 50, qualified: 0, totalLeads: 2, costPerQualified: null, status: 'sem_dados' }],
    };
    const txt = buildCampaignDigest(semDados, 14);
    expect(txt.toLowerCase()).toContain('juntando dados');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/campaign-recommender.test.ts`
Expected: FAIL (módulo não existe)

- [ ] **Step 3: Implementar o mínimo**

```typescript
// src/modules/marketing/campaign-recommender.ts
//
// Monta o texto PT-BR do resumo diário a partir do relatório da calculadora.
// Separa geração de texto do cálculo puro.

import type { CampaignQualityReport, CampaignQualityRow } from './campaign-quality.js';

const ICON: Record<CampaignQualityRow['status'], string> = {
  campea: '🟢',
  ok: '⚪',
  cara: '🔴',
  sem_dados: '🟡',
};

function brl(v: number | null): string {
  return v == null ? '—' : `R$${Math.round(v)}`;
}

export function buildCampaignDigest(report: CampaignQualityReport, janelaDias: number): string {
  const { rows, mediaCostPerQualified } = report;
  const comDados = rows.filter((r) => r.status !== 'sem_dados');

  if (comDados.length === 0) {
    return `📊 *Campanhas (últimos ${janelaDias} dias)*\n\n🟡 Ainda juntando dados — poucas conversas pra opinar com segurança. Volto amanhã.`;
  }

  const ordenadas = [...comDados].sort((a, b) => {
    const ca = a.costPerQualified ?? Infinity;
    const cb = b.costPerQualified ?? Infinity;
    return ca - cb;
  });
  const campea = ordenadas[0];
  const pior = ordenadas[ordenadas.length - 1];

  const linhas = rows.map((r) => {
    const custo = r.status === 'sem_dados' ? 'juntando dados' : `${brl(r.costPerQualified)}/lead bom`;
    return `${ICON[r.status]} ${r.name} — ${custo}`;
  });

  let acao = '';
  if (campea.campaignId !== pior.campaignId) {
    acao = `\n\n💡 Sugiro *escalar* a ${campea.name} e *cortar verba* da ${pior.name}.`;
  } else {
    acao = `\n\n💡 ${campea.name} é a melhor no momento — manter.`;
  }

  const media = mediaCostPerQualified != null ? `\n_Média geral: ${brl(mediaCostPerQualified)}/lead bom_` : '';

  return `📊 *Campanhas (últimos ${janelaDias} dias)*\n\n${linhas.join('\n')}${media}${acao}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/campaign-recommender.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/modules/marketing/campaign-recommender.ts tests/campaign-recommender.test.ts
git commit -m "feat(marketing): texto PT-BR do resumo diário de qualidade de campanha"
```

---

## Task 3: Camada de dados `campaign-quality-data.ts`

Junta gasto da Meta (`meta_ads_insights`) com leads qualificados do banco (`leads`), na janela, e devolve os arrays que a calculadora consome. Regra da "janela justa": lead com `created_at` < 48h só conta no total se já estiver qualificado (não penaliza campanha por lead novo que ainda pode responder).

**Files:**
- Create: `src/modules/marketing/campaign-quality-data.ts`

- [ ] **Step 1: Implementar a busca**

```typescript
// src/modules/marketing/campaign-quality-data.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CampaignSpend, CampaignLeads } from './campaign-quality.js';

const MS_DIA = 24 * 60 * 60 * 1000;

export async function fetchCampaignQualityInputs(
  client: SupabaseClient,
  janelaDias: number,
  agora: Date = new Date(),
): Promise<{ spends: CampaignSpend[]; leads: CampaignLeads[] }> {
  const desde = new Date(agora.getTime() - janelaDias * MS_DIA).toISOString();
  const corte48h = new Date(agora.getTime() - 2 * MS_DIA).toISOString();

  // Campanhas (id interno -> meta_campaign_id + nome)
  const { data: camps } = await client
    .from('marketing_campaigns')
    .select('id, meta_campaign_id, name');
  const campById = new Map((camps ?? []).map((c: any) => [c.id, { metaId: c.meta_campaign_id as string, name: c.name as string }]));

  // Gasto por campanha na janela (soma spend_cents)
  const { data: insights } = await client
    .from('meta_ads_insights')
    .select('campaign_id, spend_cents, date_start')
    .gte('date_start', desde.slice(0, 10));
  const spendByMetaId = new Map<string, { name: string; cents: number }>();
  for (const row of (insights ?? []) as any[]) {
    const camp = campById.get(row.campaign_id);
    if (!camp) continue;
    const cur = spendByMetaId.get(camp.metaId) ?? { name: camp.name, cents: 0 };
    cur.cents += row.spend_cents ?? 0;
    spendByMetaId.set(camp.metaId, cur);
  }
  const spends: CampaignSpend[] = [...spendByMetaId.entries()].map(([campaignId, v]) => ({
    campaignId, name: v.name, spendBrl: v.cents / 100,
  }));

  // Leads por campanha na janela
  const { data: leadsRows } = await client
    .from('leads')
    .select('ad_campaign_id, status, created_at')
    .gte('created_at', desde)
    .not('ad_campaign_id', 'is', null);
  const leadAgg = new Map<string, { qualified: number; totalLeads: number }>();
  for (const l of (leadsRows ?? []) as any[]) {
    const id = l.ad_campaign_id as string;
    const isQualified = l.status === 'qualificado';
    const isFresh = l.created_at > corte48h;
    // Janela justa: lead novo (<48h) e ainda não qualificado não conta no total.
    if (isFresh && !isQualified) continue;
    const cur = leadAgg.get(id) ?? { qualified: 0, totalLeads: 0 };
    cur.totalLeads += 1;
    if (isQualified) cur.qualified += 1;
    leadAgg.set(id, cur);
  }
  const leads: CampaignLeads[] = [...leadAgg.entries()].map(([campaignId, v]) => ({
    campaignId, qualified: v.qualified, totalLeads: v.totalLeads,
  }));

  return { spends, leads };
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add src/modules/marketing/campaign-quality-data.ts
git commit -m "feat(marketing): camada de dados juntando gasto Meta + leads qualificados por campanha"
```

---

## Task 4: Cron diário + envio no WhatsApp

Registra um cron de manhã (segue o padrão dos outros crons em `index.ts`, ex.: proactive-alerts ~linha 6727) que monta o resumo e manda pro `engineerPhone` com botões informativos.

**Files:**
- Modify: `src/index.ts` (perto do bloco dos crons de proactive-alerts)

- [ ] **Step 1: Adicionar imports no topo de `index.ts`** (junto dos outros imports de marketing)

```typescript
import { analyzeCampaignQuality } from './modules/marketing/campaign-quality.js';
import { buildCampaignDigest } from './modules/marketing/campaign-recommender.js';
import { fetchCampaignQualityInputs } from './modules/marketing/campaign-quality-data.js';
```

- [ ] **Step 2: Adicionar o cron** (logo após o bloco `runProactiveDetect`/`setInterval` dos alertas, ~linha 6735)

```typescript
    // Eva Analista de Campanhas (Peça 1): 1x/dia de manhã, calcula custo por
    // lead qualificado por campanha e manda resumo + recomendação no WhatsApp.
    // SÓ LEITURA — não mexe em verba. Botões são informativos nesta peça.
    const JANELA_DIAS = 14;
    const runCampaignDigest = async () => {
      try {
        const { spends, leads } = await fetchCampaignQualityInputs(supabase.getClient(), JANELA_DIAS);
        const report = analyzeCampaignQuality(spends, leads);
        const texto = buildCampaignDigest(report, JANELA_DIAS);
        await sendAdminWithButtons(
          { metaWaba, sendText },
          config.engineerPhone,
          texto,
          [{ id: 'capi_dash', title: '📊 Ver painel' }],
          'Eva Analista — só leitura por enquanto',
        );
        console.log('[campaign-digest] resumo diário enviado');
      } catch (err) {
        console.error('[campaign-digest] cron falhou:', (err as Error).message);
      }
    };
    // Checa de hora em hora; dispara quando a hora local (BRT) = 8h.
    const checkCampaignDigestHour = () => {
      const h = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false });
      if (parseInt(h, 10) === 8) void runCampaignDigest();
    };
    setInterval(checkCampaignDigestHour, 60 * 60 * 1000);
```

- [ ] **Step 3: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 4: Rodar a suíte inteira (zero regressão)**

Run: `npx vitest run`
Expected: todos passam (incluindo os novos)

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(marketing): cron diário envia resumo de qualidade de campanha no WhatsApp"
```

---

## Task 5: Seção no dashboard de marketing

Mostra a tabela rankeada "Qualidade por Campanha" (PT-BR), reusando o estilo do `marketing-views.ts`.

**Files:**
- Modify: `src/modules/dashboard/marketing-views.ts` (adicionar função de render da seção)
- Modify: `src/modules/dashboard/router.ts` ou a query existente que alimenta a view de marketing (chamar `fetchCampaignQualityInputs` + `analyzeCampaignQuality` e passar pro render)

- [ ] **Step 1: Adicionar render da seção em `marketing-views.ts`**

```typescript
// Adicionar export. Recebe o relatório já calculado (mesma calculadora pura).
import type { CampaignQualityReport } from '../marketing/campaign-quality.js';

const QUAL_ICON: Record<string, string> = { campea: '🟢', ok: '⚪', cara: '🔴', sem_dados: '🟡' };

export function renderCampaignQualitySection(report: CampaignQualityReport): string {
  const linhas = report.rows.map((r) => {
    const custo = r.status === 'sem_dados' ? 'juntando dados' : (r.costPerQualified == null ? '—' : `R$${Math.round(r.costPerQualified)}`);
    return `<tr>
      <td class="px-4 py-3 text-sm">${QUAL_ICON[r.status]} ${escapeHtml(r.name)}</td>
      <td class="px-4 py-3 text-sm">R$${Math.round(r.spendBrl)}</td>
      <td class="px-4 py-3 text-sm">${r.qualified}</td>
      <td class="px-4 py-3 text-sm font-semibold">${custo}</td>
    </tr>`;
  }).join('');
  const media = report.mediaCostPerQualified != null ? `R$${Math.round(report.mediaCostPerQualified)}/lead qualificado` : '—';
  return `<section class="mt-8">
    <h2 class="text-lg font-bold text-slate-800 mb-2">Qualidade por Campanha</h2>
    <p class="text-sm text-slate-500 mb-3">Custo por lead qualificado (últimos 14 dias). Média geral: ${media}.</p>
    <table class="min-w-full divide-y divide-slate-200">
      <thead><tr>
        <th class="px-4 py-2 text-left text-xs text-slate-500">Campanha</th>
        <th class="px-4 py-2 text-left text-xs text-slate-500">Gasto</th>
        <th class="px-4 py-2 text-left text-xs text-slate-500">Qualificados</th>
        <th class="px-4 py-2 text-left text-xs text-slate-500">Custo/lead bom</th>
      </tr></thead>
      <tbody class="divide-y divide-slate-100">${linhas}</tbody>
    </table>
  </section>`;
}
```

> Nota: usar o helper `escapeHtml` já existente no arquivo (conferir o nome exato e importar/usar igual às outras funções de `marketing-views.ts`).

- [ ] **Step 2: Ligar na rota do dashboard de marketing**

Na função que monta a página de marketing (em `dashboard/router.ts` ou equivalente que já renderiza `marketing-views`), antes de renderizar:

```typescript
import { fetchCampaignQualityInputs } from '../marketing/campaign-quality-data.js';
import { analyzeCampaignQuality } from '../marketing/campaign-quality.js';
import { renderCampaignQualitySection } from './marketing-views.js';
// ...
const { spends, leads } = await fetchCampaignQualityInputs(supabaseClient, 14);
const qualityReport = analyzeCampaignQuality(spends, leads);
const qualityHtml = renderCampaignQualitySection(qualityReport);
// injetar qualityHtml no corpo da página de marketing
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 4: Commit**

```bash
git add src/modules/dashboard/marketing-views.ts src/modules/dashboard/router.ts
git commit -m "feat(dashboard): seção Qualidade por Campanha (custo por lead qualificado)"
```

---

## Task 6: Code review + deploy

- [ ] **Step 1: Rodar code review** (regra do Junior — review antes de feature nova)

Invocar a skill `code-review` em effort `high` sobre o diff.

- [ ] **Step 2: Suíte completa + tipos**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tudo verde

- [ ] **Step 3: Pedir autorização de push ao Junior** (regra: nunca pushar `main` sem ok explícito)

- [ ] **Step 4: Push + Junior Implanta no Easypanel**

- [ ] **Step 5: Verificar em prod:** log `[campaign-digest] resumo diário enviado` no horário (8h BRT) e a seção no dashboard.

---

## Self-Review (cobertura da spec)

- Cálculo custo/lead qualificado por campanha → Task 1 ✅
- Lógica relativa (vs média, ±40%) → Task 1 ✅
- Volume mínimo / sem_dados → Task 1 ✅
- Janela justa (lead <48h não penaliza) → Task 3 ✅
- Texto PT-BR + recomendação → Task 2 ✅
- Entrega WhatsApp com botões → Task 4 ✅
- Seção dashboard → Task 5 ✅
- Atribuição como pré-requisito → Task 0 ✅
- Só leitura, zero risco de verba → nenhuma chamada de escrita na Meta em nenhuma task ✅
- Testes (TDD) das funções puras → Tasks 1 e 2 ✅
