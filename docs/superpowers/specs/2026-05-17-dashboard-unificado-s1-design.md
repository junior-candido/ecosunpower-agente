# Dashboard Unificado — S1 (Espinha de Atribuição + View de Canais) — Design Spec

**Data:** 2026-05-17
**Status:** Aprovado pelo Junior (brainstorm retomado). Próximo: writing-plans.
**Origem:** Junior quer "ver tudo num lugar só" — tráfego/conversão de site+blog + Meta + Google Ads num funil unificado. Projeto multi-subsistema, decomposto em S1–S5. Esta spec cobre **apenas o S1** (a espinha). S2/S3/S4/S5 têm ciclo próprio (spec→plano) depois.

## Decomposição (contexto — não é escopo desta spec)

| # | Sub-projeto | Depende |
|---|---|---|
| **S1** | Modelo de atribuição canônico + tabela única de métricas/dia + view de canais (Meta encaixado, slots google/blog vazios) | — |
| S2 | Analytics site/blog (beacon Astro + ingest) | S1 |
| S3 | Google Ads ingest (Google Ads API) | S1 + acesso à API (ação externa do Junior) |
| S4 | Encaixar Meta 100% no modelo S1 (refino) | S1 |
| S5 | Funil cruzado + comparativos + export avançado | S1–S4 |

Ordem: **S1** → S2/S4 → S3 (quando acesso Google sair) → S5.

## Objetivo

Criar a espinha de atribuição por canal e a view unificada de funil/custo por canal — **sem regredir** o funil/métricas de marketing que já existem (hoje só Meta) — de forma que adicionar Google Ads (S3) ou site/blog (S2) depois seja só "mais um canal + um adaptador", sem mexer no dashboard nem no funil.

## Princípio inegociável: zero regressão

S1 toca o pipeline de marketing/dashboard que está em produção. Preservar 100%, intocado:
- Funil atual e métricas Meta de `src/modules/dashboard/marketing-queries.ts` + `src/modules/marketing/insights-collector.ts` (spend/leads/CPL/impressões/cliques) — comportamento e números atuais idênticos.
- Atribuição existente: `leads.lead_source` / `origin` / `utm_campaign` / `ad_campaign_id` e o mapeamento CTWA referral → ad — lógica intacta.
- `/dashboard/marketing` atual (`marketing-views.ts` + `router.ts`): a nova seção "Canais" é ADITIVA; nada existente muda de layout/comportamento.
- Suítes verdes (só `cases-fetcher` pré-existente permitida).

## Arquitetura — 4 peças (reuso máximo do que já existe)

### Peça 1 — `resolveChannel(lead)` (função pura + coluna `channel` + backfill)
Função pura `resolveChannel(lead): Channel` onde `Channel = 'meta' | 'google' | 'blog' | 'direto' | 'indicacao' | 'outro'`.
Ordem de prioridade (primeiro que casar vence):
1. CTWA referral / `ad_campaign_id` presente → `meta` (é o caminho de anúncio Meta atual).
2. `lead_source` explícito (mapear valores conhecidos: ex. `google`/`gads` → `google`; `indicacao`/`indicação` → `indicacao`; `meta`/`facebook`/`instagram` → `meta`; `blog` → `blog`).
3. `origin` (mesmo mapeamento).
4. `utm_campaign` / `utm_source` (heurística: `utm_source=google` → `google`, etc.).
5. Referrer, se disponível (domínio google → `google`; domínio próprio/blog → `blog`).
6. Nada casou → `direto`. Valor irreconhecível mas presente → `outro`. **Nunca lança.**
Nova coluna `channel` em `leads` (preenchida na criação/atualização do lead a partir de `resolveChannel`). Backfill idempotente dos leads existentes (script/SQL). TDD exaustivo da função pura.

### Peça 2 — Migration `channel_daily_metrics`
Tabela `channel_daily_metrics(channel TEXT, date DATE, spend_cents BIGINT, clicks INT, impressions INT, source TEXT, updated_at TIMESTAMPTZ)`, **PK/único `(channel, date)`** (upsert idempotente). É o ÚNICO lugar de spend/tráfego de qualquer canal. `source` registra de onde veio o número (ex.: `meta_insights`, `google_ads`, `manual`). S1 popula só `channel='meta'` (adaptador no `insights-collector.ts` faz o upsert no mesmo cron que já roda). google/blog não recebem linha em S1 (slots ficam vazios — dashboard mostra "—").
Migration aplicada **manual em prod** via SQL Editor (MCP Supabase aponta pro projeto errado — ver memória `supabase-mcp-mismatch`; o plano entrega o SQL pronto pro Junior rodar).

### Peça 3 — `fetchChannelFunnel(periodo)`
Estende `dashboard/marketing-queries.ts` (não substitui as queries atuais). Retorna o MESMO funil já usado (leads criados → qualificado → agendado) + CPL, agrupado **por canal**, cruzado com `channel_daily_metrics` pra custo por agendamento/lead por canal. Reusa a lógica de período/funil existente; só adiciona o agrupamento por `channel` e o join de custo.

### Peça 4 — Seção "Canais" em `/dashboard/marketing`
Aditiva em `marketing-views.ts`. Tabela canal × funil × custo (linhas: meta, google, blog, direto, indicacao, outro) + barra de funil + filtro de período (reusa o filtro existente) + export CSV + PT-BR (memória `dashboard_pt_br`). Canais sem dado aparecem com "—" (linha pronta pra quando S2/S3 popularem). Observabilidade obrigatória (memória `observabilidade-obrigatoria`): KPIs, comparação por período.

## Fluxo de dados

1. Lead chega/atualiza → `resolveChannel(lead)` grava `leads.channel`.
2. Cron Meta (já existente, `insights-collector.ts`) → além do que já faz, faz upsert em `channel_daily_metrics` (`channel='meta'`, `source='meta_insights'`).
3. `/dashboard/marketing` → `fetchChannelFunnel(periodo)` junta funil-por-channel (de `leads.channel`) + custo (de `channel_daily_metrics`) e renderiza a seção Canais.

## Erro / edge cases

- `resolveChannel`: entrada nula/lixo/desconhecida → `direto` (presente mas irreconhecível → `outro`); nunca lança.
- Backfill idempotente: rodar 2× não duplica nem corrompe.
- `channel_daily_metrics` upsert por `(channel,date)`: reprocessar o cron não duplica linha.
- Canal sem métrica no período → "—" no dashboard (não zero enganoso, não erro).
- Migration: SQL idempotente (`create table if not exists`, índice/único explícito).

## Testes

- TDD exaustivo de `resolveChannel` (todos os ramos de prioridade + nulos/lixo + desconhecido→direto/outro), função pura, sem mock — estilo da suíte (ex.: `hot-lead-alert.test.ts`).
- Agregação `fetchChannelFunnel` testada com fixtures (funil por canal + custo cruzado), sem depender de prod.
- Verificação de não-regressão: as queries/métricas Meta atuais continuam idênticas (teste/inspeção).
- `npx tsc` EXIT 0 + suíte verde (só `cases-fetcher`).

## Fora de escopo (sub-projetos próprios)

- S2: beacon de analytics no site/blog (Astro) + ingest.
- S3: Google Ads API ingest (adaptador que popula `channel_daily_metrics` com `source='google'`). **Long-pole externo: Junior abrir acesso à Google Ads API (dev token) — ação dele, paralela, destrava S3.**
- S4: refinar/encaixar 100% do Meta no modelo.
- S5: funil cruzado avançado, comparativos, export sofisticado.
- Multi-touch attribution (S1 é last/first-touch determinístico via prioridade). YAGNI.

## Critério de sucesso

Dashboard mostra funil + custo por canal (Meta com números reais, idênticos aos de hoje; google/blog como linhas vazias prontas), `resolveChannel` classifica todo lead de forma determinística e testada, `channel_daily_metrics` é o ponto único de métricas/dia — e adicionar Google Ads (S3) depois é só um adaptador, sem tocar dashboard/funil. Zero regressão no que já existe.
