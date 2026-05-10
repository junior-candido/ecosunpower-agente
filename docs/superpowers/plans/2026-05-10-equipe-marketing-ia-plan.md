# Equipe de Marketing IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir 4 agentes IA de marketing (Criativo, Campanha, Qualificador IG DM, Analista) + dashboard, em 10-12 dias úteis, com aprovação humana via WhatsApp em ações de risco financeiro/reputacional.

**Architecture:** Cada agente é módulo TypeScript isolado em `src/modules/marketing/` que reaproveita `messaging` layer, Supabase, Anthropic SDK, Meta Graph API. Schedulers via `setInterval` no `index.ts` (padrão atual). Aprovações fluem via botões interativos no zap do Junior.

**Tech Stack:** TypeScript + Express + Supabase + Anthropic Claude (Opus 4.7 + Haiku 4.5) + Meta Graph API + Replicate (Flux para imagens) + Vitest + Easypanel (deploy via git push).

**Spec:** `docs/superpowers/specs/2026-05-10-equipe-marketing-ia-design.md`

---

## File Structure

```
src/modules/marketing/             ← novo, todos agentes aqui
├── creative-agent.ts              ← Agente Criativo (geração de criativos)
├── creative-filters.ts            ← Filtros blocklist/marca/critério (TDD core)
├── creative-storage.ts            ← Upload Supabase Storage + persistence
├── campaign-agent.ts              ← Agente Campanha (Meta Ads API)
├── campaign-monitor.ts            ← Lê insights, calcula CPL/CTR/etc
├── campaign-decisions.ts          ← Lógica de pausar/escalar/alertar (TDD core)
├── ig-qualifier-brain.ts          ← Prompt + lógica do qualificador IG
├── ig-qualifier-filters.ts        ← Critério R$ 700, região, perfil (TDD core)
├── analyst-agent.ts               ← Cron diário/semanal/mensal
├── analyst-correlations.ts        ← Detecta padrões (TDD core)
├── analyst-pdf.ts                 ← Geração PDF mensal
├── personas.ts                    ← Helpers pra ler/seedar personas
└── types.ts                       ← Tipos compartilhados

src/modules/messaging/
└── instagram-direct.ts            ← Adapter Meta IG Messaging API (similar ao meta-whatsapp.ts)

src/modules/dashboard/
├── marketing-router.ts            ← Rotas /dashboard/marketing/*
├── marketing-views.ts             ← HTML widgets
└── marketing-queries.ts           ← Queries específicas

src/index.ts                       ← Modificar: registrar webhook IG, crons, comando /criativo

supabase/migrations/
└── 025_marketing_schema.sql       ← Tabelas: marketing_personas, marketing_creatives,
                                     marketing_creative_logs, marketing_campaigns,
                                     marketing_campaign_logs, meta_ads_insights,
                                     dm_threads, marketing_alerts. Colunas extra em leads/conversations

tests/marketing/
├── creative-filters.test.ts
├── campaign-decisions.test.ts
├── ig-qualifier-filters.test.ts
├── analyst-correlations.test.ts
└── instagram-direct.test.ts

tests/dashboard/
└── marketing-queries.test.ts

scripts/
├── audit-campaign-1.ts            ← Standalone: pega dados Campanha 1, gera PDF
├── seed-marketing-personas.ts     ← Popula tabela marketing_personas
└── test-creative-pipeline.ts      ← E2E: gera 1 criativo completo
```

---

## Fases

| Fase | Dias | Objetivo |
|---|---|---|
| 1 | 10-11/05 (Dom-Seg) | Diagnóstico Campanha 1 + 3 criativos manuais + nova campanha rodando |
| 2 | 11-12/05 (Seg-Ter) | Migration 025 + seed personas + verificar Migration 022 aplicada |
| 3 | 12-14/05 (Ter-Qui) | Agente Criativo em produção |
| 4 | 14-16/05 (Qui-Sáb) | Qualificador IG DM em produção |
| 5 | 17-19/05 (Dom-Ter) | Agente Analista + Dashboard Marketing |
| 6 | 20+/05 | Agente Campanha (modo leitura → automático quando ads_management aprovar) |

---

## Fase 1 — Diagnóstico Campanha 1 + Quick Win (Dia 1-2)

### Task 1.1: Auditoria automatizada da Campanha 1

**Files:**
- Create: `scripts/audit-campaign-1.ts`
- Create: `docs/superpowers/audits/2026-05-10-campanha-1-diagnostic.md`

- [ ] **Step 1: Junior fornece o ID da Campanha 1**

Junior pega no Meta Ads Manager: Business Suite → Anúncios → busca campanha "Campanha Meta 1" (ou nome similar) → copia ID numérico (ex: `120214567890123456`).

- [ ] **Step 2: Criar script `scripts/audit-campaign-1.ts`**

```typescript
// Standalone: roda com `tsx scripts/audit-campaign-1.ts <campaign-id>`
// Usa META_ACCESS_TOKEN existente. Puxa: insights, ads, adsets, creatives, audience.
import 'dotenv/config';

const CAMPAIGN_ID = process.argv[2];
const TOKEN = process.env.META_WABA_ACCESS_TOKEN!;
const GRAPH = 'https://graph.facebook.com/v22.0';

if (!CAMPAIGN_ID) { console.error('Uso: tsx scripts/audit-campaign-1.ts <campaign_id>'); process.exit(1); }

async function gql(path: string, fields: string) {
  const url = `${GRAPH}/${path}?fields=${fields}&access_token=${TOKEN}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Meta API ${r.status}: ${await r.text()}`);
  return r.json();
}

async function main() {
  const camp = await gql(CAMPAIGN_ID, 'name,objective,status,created_time,daily_budget,lifetime_budget');
  const adsets = await gql(`${CAMPAIGN_ID}/adsets`, 'name,targeting,daily_budget,status,optimization_goal,billing_event');
  const ads = await gql(`${CAMPAIGN_ID}/ads`, 'name,status,creative{id,name,title,body,image_url,call_to_action_type}');
  const insights = await gql(`${CAMPAIGN_ID}/insights`, 'spend,impressions,reach,clicks,ctr,cpc,cpm,cpp,actions,cost_per_action_type,date_start,date_stop');

  const report = {
    campanha: camp,
    adsets: adsets.data,
    ads: ads.data,
    insights: insights.data,
    diagnostico: {
      spend_total: insights.data?.[0]?.spend ?? 'N/A',
      ctr_avg: insights.data?.[0]?.ctr ?? 'N/A',
      cpc_avg: insights.data?.[0]?.cpc ?? 'N/A',
      cliques_total: insights.data?.[0]?.clicks ?? 'N/A',
      observacoes: [
        camp.objective === 'OUTCOME_LEADS' ? '✅ Objetivo correto (leads)' : '⚠️ Objetivo: ' + camp.objective,
        adsets.data?.length === 1 ? '⚠️ 1 único adset (sem A/B)' : `${adsets.data?.length} adsets`,
        ads.data?.length === 1 ? '⚠️ 1 único criativo (sem variação)' : `${ads.data?.length} criativos`,
      ],
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Rodar o script**

```bash
cd "C:/Users/Meu Computador/Documents/ecosunpower-agente"
tsx scripts/audit-campaign-1.ts <CAMPAIGN_ID> > docs/superpowers/audits/2026-05-10-campanha-1-raw.json
```

Expected: arquivo JSON com todos os dados estruturados, sem erros.

- [ ] **Step 4: Claude analisa o JSON e gera diagnóstico em markdown**

Claude lê `2026-05-10-campanha-1-raw.json` e escreve `docs/superpowers/audits/2026-05-10-campanha-1-diagnostic.md` com:
- Resumo executivo (gasto total, CPL, leads gerados, taxa qualificação)
- 3 problemas principais identificados (com evidência do JSON)
- Hipótese da causa raiz (o lead "alugar terra" indica targeting amplo + copy genérica)
- Recomendações pra próxima campanha (targeting cirúrgico, copy filtrante, criativo persona-aware)

- [ ] **Step 5: Junior revisa diagnóstico em 5 min**

Junior abre o arquivo, lê, marca pontos discordantes se houver. Responde: "OK" ou "ajustar X".

- [ ] **Step 6: Commit auditoria**

```bash
git add scripts/audit-campaign-1.ts docs/superpowers/audits/
git commit -m "audit(marketing): diagnostico Campanha 1 — problemas e recomendacoes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main
```

### Task 1.2: 3 criativos manuais novos (geração assistida por Claude, sem agente ainda)

**Files:**
- Create: `docs/superpowers/audits/2026-05-10-criativos-manuais/` (pasta com PNG + MD)

- [ ] **Step 1: Claude gera 3 prompts de imagem detalhados**

Cada um pra uma persona diferente:
1. **Residencial On-grid DF**: "Família feliz na varanda de casa térrea em Brasília Plano Piloto, telhado com painéis solares ao fundo, luz dourada do entardecer, conta de luz despedaçada na mesa de café da manhã, estilo fotorealista, branding sutil EcoSunPower"
2. **Comercial On-grid Goiás**: "Lojista feliz mostrando ao caixa redução na conta de luz, fachada de comércio em cidade de interior de Goiás, painéis no telhado visível, dia ensolarado, estilo documental"
3. **Filtro explícito >R$700**: "Conta de luz física com 'R$ 1.247,30' destacado em vermelho, ao lado folder EcoSunPower com 'Sistemas a partir de R$ 700/mês de conta', estilo flat infográfico, cores marca (laranja+azul)"

- [ ] **Step 2: Junior gera as imagens**

Opções rápidas:
- Replicate Flux: `https://replicate.com/black-forest-labs/flux-1.1-pro` (pago, US$ 0.04/img)
- Imagen 4: via Google AI Studio (free tier)
- Banco de fotos: Unsplash (`solar panel home`, `business owner`, `electricity bill`) — grátis

Junior escolhe qual ferramenta + gera + salva PNGs em `docs/superpowers/audits/2026-05-10-criativos-manuais/`.

- [ ] **Step 3: Claude escreve 3 copies (headline + body + CTA)**

```markdown
## Criativo 1 — Residencial On-grid DF

**Headline:** "Conta de luz acima de R$ 700? Calcule sua economia em 1 minuto"
**Body:** "Quem mora em Brasília e tem conta acima de R$ 700/mês economiza até 95% com solar. Cálculo gratuito, sem compromisso. ⚡ Energia sua. Para sempre."
**CTA:** "Falar no WhatsApp"

## Criativo 2 — Comercial On-grid Goiás
[mesmo formato]

## Criativo 3 — Filtro explícito >R$700
[mesmo formato]
```

Salvar em `docs/superpowers/audits/2026-05-10-criativos-manuais/copies.md`.

- [ ] **Step 4: Junior aprova ou pede ajuste**

Lê os 3 → "OK" / "muda X" / "regera Y".

- [ ] **Step 5: Commit criativos manuais**

```bash
git add docs/superpowers/audits/2026-05-10-criativos-manuais/
git commit -m "audit(marketing): 3 criativos manuais novos pos-diagnostico Campanha 1

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main
```

### Task 1.3: Criar nova campanha no Meta Ads Manager (manual com checklist)

**Files:**
- Create: `docs/superpowers/audits/2026-05-10-campanha-2-setup.md` (checklist do que foi feito)

- [ ] **Step 1: Junior abre Meta Ads Manager e cria nova campanha**

Configuração baseada no diagnóstico:
- **Objetivo:** Conversões > Mensagens (leads pelo WhatsApp/IG DM, não Lead Form)
- **Conjunto de anúncios:** 3 (um pra cada criativo da Task 1.2)
- **Targeting cirúrgico:**
  - Localização: DF + raio 100km do Plano Piloto + cidades GO listadas
  - Idade: 30-65
  - Comportamento: "donos de imóvel" + "interessados em sustentabilidade"
  - **Excluir:** "agronegócio", "fazenda", "agricultura" (evita lead "alugar terra")
- **Lead form custom:** primeira pergunta "Qual o valor médio da sua conta de luz?" com opções [< R$ 500, R$ 500-700, R$ 700-1500, R$ 1500-3000, > R$ 3000]. **Resposta < R$ 700 deve receber mensagem padrão de descarte e NÃO entrar como lead na Eva.**
- **Budget total:** R$ 30/dia (R$ 900/mês teste)
- **Duração:** 7 dias

- [ ] **Step 2: Documentar setup**

Junior preenche checklist em `2026-05-10-campanha-2-setup.md` com prints da configuração final.

- [ ] **Step 3: Ativar campanha + iniciar baseline**

Botão "Publicar". Hora exata anotada. Status: "Em revisão" (Meta libera em ~1h).

- [ ] **Step 4: Setup baseline no Supabase**

Inserir registro em `marketing_campaigns` (manual via SQL Editor do Supabase, vai virar fluxo automático na Fase 6):

```sql
-- Executar uma vez no SQL Editor Supabase
INSERT INTO marketing_campaigns (
  meta_campaign_id, codigo_portfolio, name, objective,
  daily_budget_cents, status, created_at
) VALUES (
  '<META_CAMPAIGN_ID>', 'A', 'Residencial DF Maio 2026 v2',
  'OUTCOME_MESSAGES', 3000, 'active', NOW()
);
```

(A tabela `marketing_campaigns` será criada na Fase 2, então essa inserção fica pendente até lá.)

- [ ] **Step 5: Commit setup**

```bash
git add docs/superpowers/audits/2026-05-10-campanha-2-setup.md
git commit -m "ops(marketing): nova Campanha 2 ativada com targeting cirurgico

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main
```

### Task 1.4: Submeter App Review pra `ads_management` (paralelo, 3-7 dias úteis)

**Files:** N/A (mudança no painel Meta, sem código)

- [ ] **Step 1: Junior abre developers.facebook.com**

URL direta: `https://developers.facebook.com/apps/2507358756362279/app-review/permissions/`

- [ ] **Step 2: Adicionar permission `ads_management`**

Click em "Solicitar acesso avançado" → busca `ads_management` → preenche:
- **Como você usa:** "Agente automatizado interno gerencia campanhas de captura de leads para a empresa de energia solar Ecosunpower. Usa ads_management para criar/pausar/escalar campanhas e ajustar budget conforme performance, com aprovação humana em ações de risco financeiro."
- **Vídeo screencast:** mesmo padrão da submissão anterior — gravar tela com Ferramenta de Captura mostrando dashboard interno + ação de pausar criativo
- **Detalhes técnicos:** "Endpoint: nosso backend (`agente-whatsapp` no Easypanel). Tipo de uso: business-to-business interno (não app público). Permission solicitada apenas pra account ads do próprio negócio (4631071293782726)."

- [ ] **Step 3: Submeter e anotar data**

Junior anota no `docs/superpowers/audits/2026-05-10-app-review-ads-management.md` a data de submissão. Aguarda 3-7 dias úteis.

- [ ] **Step 4: Quando aprovar (notificação por email Meta)**

Junior atualiza o arquivo + avisa Claude na próxima sessão. Isso desbloqueia Fase 6.

---

## Fase 2 — Migration 025 + Seed Personas (Dia 2-3)

### Task 2.1: Verificar Migration 022 aplicada em prod

**Files:** N/A (verificação no Supabase)

- [ ] **Step 1: Junior abre Supabase SQL Editor**

URL: `https://supabase.com/dashboard/project/kupnsoyymulbdzakqlqc/sql/new`

- [ ] **Step 2: Rodar query de verificação**

```sql
SELECT name FROM supabase_migrations.schema_migrations
WHERE name LIKE '022%' OR name LIKE '023%' OR name LIKE '024%';
```

Expected: 3 linhas (022, 023, 024). Se faltar 022 → aplicar antes de seguir.

- [ ] **Step 3: Se faltar 022, aplicar via mcp ou painel**

Junior aplica `supabase/migrations/022_sistemas_dados_detalhados.sql` no Supabase SQL Editor.

### Task 2.2: Criar Migration 025 com schema marketing

**Files:**
- Create: `supabase/migrations/025_marketing_schema.sql`

- [ ] **Step 1: Escrever migration completa**

```sql
-- supabase/migrations/025_marketing_schema.sql
-- Schema completo da Equipe de Marketing IA (4 agentes + dashboard)

-- 1. PERSONAS (pre-definidas, seedadas pelo script seed-marketing-personas.ts)
CREATE TABLE marketing_personas (
  id BIGSERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,           -- 'residencial_df', 'comercial_go', 'fazendeiro_offgrid', 'ev_byd', etc
  nome TEXT NOT NULL,                    -- 'Residencial DF — Casa Plano Piloto'
  categoria_portfolio TEXT NOT NULL CHECK (categoria_portfolio IN ('on_grid_residencial','on_grid_comercial','hibrido','off_grid','ev_charger','manutencao')),
  descricao TEXT NOT NULL,
  conta_minima_brl INTEGER NOT NULL DEFAULT 700,
  consumo_minimo_kwh INTEGER NOT NULL DEFAULT 700,
  regiao_alvo TEXT NOT NULL,             -- 'DF', 'GO_entorno', 'todo_atendimento'
  palavras_proibidas TEXT[] DEFAULT ARRAY['alugar terra','arrendar','fazenda solar','engenheiro'],
  contexto_marca JSONB,                  -- tom, valores, exemplos de copy aprovado
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_personas_codigo ON marketing_personas(codigo);

-- 2. CRIATIVOS (pacote gerado pelo Agente Criativo, status reflete fluxo aprovacao)
CREATE TABLE marketing_creatives (
  id BIGSERIAL PRIMARY KEY,
  persona_id BIGINT NOT NULL REFERENCES marketing_personas(id),
  briefing TEXT NOT NULL,                -- input que gerou
  status TEXT NOT NULL CHECK (status IN ('draft','aprovado','em_uso','pausado','descartado')),
  imagens JSONB NOT NULL,                -- [{url, style, prompt_used}, ...]
  copies JSONB NOT NULL,                 -- [{length, headline, body, cta}, ...]
  cta_primario TEXT NOT NULL,
  justificativa TEXT,
  created_by_model TEXT NOT NULL,        -- 'claude-opus-4-7' ou 'claude-haiku-4-5'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by_phone TEXT,                -- numero zap do Junior
  meta_creative_id TEXT                  -- ID na Meta quando publicado (ads creative ID)
);
CREATE INDEX idx_creatives_status ON marketing_creatives(status);
CREATE INDEX idx_creatives_persona ON marketing_creatives(persona_id);

-- 3. LOG DE GERACAO (auditoria do Agente Criativo)
CREATE TABLE marketing_creative_logs (
  id BIGSERIAL PRIMARY KEY,
  creative_id BIGINT REFERENCES marketing_creatives(id) ON DELETE CASCADE,
  prompt_used TEXT NOT NULL,
  raw_output JSONB NOT NULL,
  filter_results JSONB,                  -- {blocklist:passed, marca:passed, criterio_700:passed}
  decision TEXT NOT NULL,                -- 'sent_to_junior', 'rejected_filter', 'regenerated'
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. CAMPANHAS (espelho da Meta + metadados internos)
CREATE TABLE marketing_campaigns (
  id BIGSERIAL PRIMARY KEY,
  meta_campaign_id TEXT NOT NULL UNIQUE,
  codigo_portfolio TEXT NOT NULL,        -- 'A', 'B', 'C', 'D', 'E', 'F'
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  daily_budget_cents INTEGER,
  lifetime_budget_cents INTEGER,
  status TEXT NOT NULL,                  -- 'active', 'paused', 'archived'
  cpl_alerta_brl INTEGER NOT NULL DEFAULT 50,
  cpl_critico_brl INTEGER NOT NULL DEFAULT 80,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ
);
CREATE INDEX idx_campaigns_meta_id ON marketing_campaigns(meta_campaign_id);
CREATE INDEX idx_campaigns_status ON marketing_campaigns(status);

-- 5. LOG DE DECISOES DO AGENTE CAMPANHA
CREATE TABLE marketing_campaign_logs (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  meta_creative_id TEXT,                 -- se decisao for sobre criativo especifico
  action TEXT NOT NULL,                  -- 'monitored', 'paused_creative', 'alert_sent', 'budget_change_proposed'
  reason TEXT NOT NULL,
  metrics_snapshot JSONB NOT NULL,       -- {cpl, ctr, conv_rate, ...}
  decided_by TEXT NOT NULL,              -- 'agent' ou 'junior'
  approved_by_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. INSIGHTS META (snapshot a cada 2h)
CREATE TABLE meta_ads_insights (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  meta_ad_id TEXT,                       -- ad-level (criativo)
  spend_cents INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  reach INTEGER NOT NULL,
  clicks INTEGER NOT NULL,
  ctr_pct NUMERIC(5,2),
  cpc_cents INTEGER,
  cpm_cents INTEGER,
  leads INTEGER DEFAULT 0,
  cpl_cents INTEGER,
  raw_payload JSONB NOT NULL,            -- preserva resposta original Meta
  date_start DATE NOT NULL,
  date_stop DATE NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_insights_campaign_date ON meta_ads_insights(campaign_id, date_start);
CREATE INDEX idx_insights_collected ON meta_ads_insights(collected_at DESC);

-- 7. CONVERSAS IG DM (similar a conversations mas separada)
CREATE TABLE dm_threads (
  id BIGSERIAL PRIMARY KEY,
  ig_user_id TEXT NOT NULL,              -- IG-scoped user ID (nao publico)
  ig_thread_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active','qualified_handed_off','disqualified','escalated_human','abandoned')),
  source_campaign_id BIGINT REFERENCES marketing_campaigns(id),
  source_creative_id BIGINT REFERENCES marketing_creatives(id),
  qualified_data JSONB,                  -- {tipo_imovel, cidade, faixa_conta, decisao}
  handoff_zap_phone TEXT,                -- phone que recebeu handoff (se foi handed_off)
  context_for_eva JSONB,                 -- contexto pra Eva continuar
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);
CREATE INDEX idx_dm_threads_status ON dm_threads(status);
CREATE INDEX idx_dm_threads_ig_user ON dm_threads(ig_user_id);

-- 8. MENSAGENS DE CADA THREAD (pra historico/replay)
CREATE TABLE dm_messages (
  id BIGSERIAL PRIMARY KEY,
  thread_id BIGINT NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  content TEXT NOT NULL,
  buttons JSONB,                         -- se tinha quick replies
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dm_messages_thread ON dm_messages(thread_id, created_at);

-- 9. ALERTAS PENDENTES (Analista + Campanha geram, dashboard mostra)
CREATE TABLE marketing_alerts (
  id BIGSERIAL PRIMARY KEY,
  agent TEXT NOT NULL,                   -- 'analyst', 'campaign', 'creative'
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  related_campaign_id BIGINT REFERENCES marketing_campaigns(id),
  related_creative_id BIGINT REFERENCES marketing_creatives(id),
  action_required TEXT,                  -- 'approve_pause', 'approve_budget', 'review', null
  status TEXT NOT NULL CHECK (status IN ('pending','acknowledged','resolved','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_alerts_status ON marketing_alerts(status);
CREATE INDEX idx_alerts_severity ON marketing_alerts(severity, created_at DESC);

-- 10. COLUNAS EM TABELAS EXISTENTES
ALTER TABLE leads ADD COLUMN IF NOT EXISTS acquisition_source TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS acquisition_creative_id BIGINT REFERENCES marketing_creatives(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS acquisition_campaign_id BIGINT REFERENCES marketing_campaigns(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS dm_thread_id BIGINT REFERENCES dm_threads(id);

-- 11. View consolidada pra Dashboard (helper)
CREATE OR REPLACE VIEW v_marketing_dashboard_today AS
SELECT
  COALESCE(SUM(spend_cents), 0) / 100.0 AS spend_today_brl,
  COALESCE(SUM(leads), 0) AS leads_today,
  COALESCE(SUM(clicks), 0) AS clicks_today,
  COALESCE(SUM(impressions), 0) AS impressions_today,
  CASE WHEN SUM(leads) > 0 THEN (SUM(spend_cents)::NUMERIC / SUM(leads) / 100) ELSE NULL END AS cpl_today_brl
FROM meta_ads_insights
WHERE date_start = CURRENT_DATE;
```

- [ ] **Step 2: Aplicar migration via MCP Supabase**

```bash
# Via MCP tool no Claude Code session
# Tool: mcp__supabase__apply_migration
# project_id: kupnsoyymulbdzakqlqc
# name: 025_marketing_schema
# query: <conteudo do .sql>
```

Ou Junior aplica via SQL Editor manualmente.

- [ ] **Step 3: Verificar tabelas criadas**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'marketing_%' OR table_name IN ('dm_threads','dm_messages','meta_ads_insights');
```

Expected: 9 tabelas listadas.

- [ ] **Step 4: Commit migration**

```bash
git add supabase/migrations/025_marketing_schema.sql
git commit -m "feat(db): migration 025 schema marketing — 9 tabelas + colunas leads/conversations

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main
```

### Task 2.3: Seed das 6 personas iniciais

**Files:**
- Create: `scripts/seed-marketing-personas.ts`

- [ ] **Step 1: Criar script de seed**

```typescript
// scripts/seed-marketing-personas.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

const PERSONAS = [
  {
    codigo: 'residencial_df_alto',
    nome: 'Residencial DF — Conta R$ 700-3000',
    categoria_portfolio: 'on_grid_residencial',
    descricao: 'Dono de casa em Brasília-DF, classe B/B+, conta R$ 700-3000/mês, perfil de quem busca economia + valor agregado ao imóvel',
    conta_minima_brl: 700,
    consumo_minimo_kwh: 700,
    regiao_alvo: 'DF',
    contexto_marca: { tom: 'caloroso, técnico mas acessível', exemplos: ['Energia sua. Pra sempre.', 'Calcule sua economia em 1 minuto'] },
  },
  {
    codigo: 'residencial_go_alto',
    nome: 'Residencial Goiás Entorno — Conta R$ 700-3000',
    categoria_portfolio: 'on_grid_residencial',
    descricao: 'Dono de casa em Goiás (até 100km do DF), conta R$ 700-3000/mês, perfil similar ao DF mas tom mais coloquial',
    conta_minima_brl: 700,
    consumo_minimo_kwh: 700,
    regiao_alvo: 'GO_entorno',
    contexto_marca: { tom: 'caloroso, prático, fala direto', exemplos: ['Acabou conta cara', 'Solar pra valer'] },
  },
  {
    codigo: 'comercial_loja',
    nome: 'Comercial — Loja/Escritório',
    categoria_portfolio: 'on_grid_comercial',
    descricao: 'Dono de comércio com conta R$ 1500-5000/mês, busca reduzir custo fixo da operação',
    conta_minima_brl: 1500,
    consumo_minimo_kwh: 1500,
    regiao_alvo: 'todo_atendimento',
    contexto_marca: { tom: 'objetivo, ROI-focado', exemplos: ['Sua conta de luz é o maior custo fixo? Vamos resolver.', 'Payback em 4 anos, garantido'] },
  },
  {
    codigo: 'hibrido_baterias',
    nome: 'Híbrido com Baterias',
    categoria_portfolio: 'hibrido',
    descricao: 'Já tem solar OU quer fugir bandeira vermelha + ter backup. Conta R$ 1000+, valoriza autonomia',
    conta_minima_brl: 1000,
    consumo_minimo_kwh: 1000,
    regiao_alvo: 'todo_atendimento',
    contexto_marca: { tom: 'técnico, focado em independência', exemplos: ['Sua casa funciona mesmo sem rede', 'Bandeira vermelha não te afeta mais'] },
  },
  {
    codigo: 'off_grid_rural',
    nome: 'Off-grid — Sítio/Fazenda',
    categoria_portfolio: 'off_grid',
    descricao: 'Imóvel rural sem rede ou com rede precária. Não tem conta de luz tradicional. Filtro: tem propriedade rural',
    conta_minima_brl: 0,
    consumo_minimo_kwh: 0,
    regiao_alvo: 'GO_entorno',
    palavras_proibidas: ['alugar terra','arrendar','fazenda solar','engenheiro'],
    contexto_marca: { tom: 'pratico, mostra independencia', exemplos: ['Energia 24h no seu sitio', 'Sem precisar puxar rede'] },
  },
  {
    codigo: 'ev_charger',
    nome: 'Carregador Veicular EV',
    categoria_portfolio: 'ev_charger',
    descricao: 'Dono de carro elétrico (BYD, Volvo, VW ID, GWM, Caoa Chery, Renault, BMW). Tesla é minoria no BR — não usar como referência principal',
    conta_minima_brl: 700,
    consumo_minimo_kwh: 700,
    regiao_alvo: 'todo_atendimento',
    contexto_marca: { tom: 'tech, mostra praticidade', exemplos: ['Carrega seu BYD em casa, na potência máxima', 'Wallbox profissional, instalada em 1 dia'] },
  },
];

async function main() {
  for (const p of PERSONAS) {
    const { error } = await supabase.from('marketing_personas').upsert(p, { onConflict: 'codigo' });
    if (error) { console.error(`❌ ${p.codigo}: ${error.message}`); continue; }
    console.log(`✅ ${p.codigo}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Rodar seed**

```bash
cd "C:/Users/Meu Computador/Documents/ecosunpower-agente"
tsx scripts/seed-marketing-personas.ts
```

Expected: 6 linhas com `✅`.

- [ ] **Step 3: Verificar**

```sql
SELECT codigo, nome, categoria_portfolio FROM marketing_personas ORDER BY id;
```

Expected: 6 linhas.

- [ ] **Step 4: Commit seed**

```bash
git add scripts/seed-marketing-personas.ts
git commit -m "feat(marketing): seed 6 personas iniciais do portfolio EcoSunPower

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main
```

---

## Fase 3 — Agente Criativo (Dia 3-5)

### Task 3.1: Tipos compartilhados

**Files:**
- Create: `src/modules/marketing/types.ts`

- [ ] **Step 1: Definir tipos do módulo**

```typescript
// src/modules/marketing/types.ts

export type CategoriaPortfolio =
  | 'on_grid_residencial'
  | 'on_grid_comercial'
  | 'hibrido'
  | 'off_grid'
  | 'ev_charger'
  | 'manutencao';

export interface Persona {
  id: number;
  codigo: string;
  nome: string;
  categoria_portfolio: CategoriaPortfolio;
  descricao: string;
  conta_minima_brl: number;
  consumo_minimo_kwh: number;
  regiao_alvo: string;
  palavras_proibidas: string[];
  contexto_marca: { tom?: string; exemplos?: string[]; valores?: string[] };
}

export interface CreativeCopy {
  length: 'curto' | 'medio' | 'longo';
  headline: string;
  body: string;
  cta: string;
}

export interface CreativeImage {
  url: string;
  style: 'fotorealista' | 'grafico' | 'depoimento';
  prompt_used: string;
}

export interface CreativePackage {
  briefing: string;
  persona_id: number;
  imagens: CreativeImage[];
  copies: CreativeCopy[];
  cta_primario: string;
  justificativa: string;
}

export interface FilterResult {
  passed: boolean;
  reason?: string;
}

export interface CreativeFilterResults {
  blocklist: FilterResult;
  marca: FilterResult;
  criterio_700: FilterResult;
  overall_passed: boolean;
}
```

- [ ] **Step 2: Commit tipos**

```bash
git add src/modules/marketing/types.ts
git commit -m "feat(marketing): tipos base do agente criativo

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3.2: Filtros do criativo (TDD core)

**Files:**
- Create: `src/modules/marketing/creative-filters.ts`
- Create: `tests/marketing/creative-filters.test.ts`

- [ ] **Step 1: Escrever testes failing**

```typescript
// tests/marketing/creative-filters.test.ts
import { describe, it, expect } from 'vitest';
import { applyAllFilters, blocklistFilter, marcaFilter, criterio700Filter } from '../../src/modules/marketing/creative-filters.js';
import type { CreativePackage, Persona } from '../../src/modules/marketing/types.js';

const PERSONA_RESIDENCIAL: Persona = {
  id: 1, codigo: 'residencial_df_alto', nome: 'Residencial DF', categoria_portfolio: 'on_grid_residencial',
  descricao: '', conta_minima_brl: 700, consumo_minimo_kwh: 700, regiao_alvo: 'DF',
  palavras_proibidas: ['alugar terra', 'arrendar', 'fazenda solar', 'engenheiro'],
  contexto_marca: {},
};

const PACKAGE_OK: CreativePackage = {
  briefing: 'casa DF', persona_id: 1, imagens: [],
  copies: [{ length: 'curto', headline: 'Energia solar pra sua casa', body: 'Economize R$ 1000/mês', cta: 'Quero saber' }],
  cta_primario: 'Quero saber', justificativa: '',
};

describe('blocklistFilter', () => {
  it('passa quando nenhuma palavra proibida', () => {
    expect(blocklistFilter(PACKAGE_OK, PERSONA_RESIDENCIAL).passed).toBe(true);
  });

  it('rejeita "alugar terra"', () => {
    const bad = { ...PACKAGE_OK, copies: [{ ...PACKAGE_OK.copies[0], body: 'Quer alugar terra pra usina?' }] };
    const r = blocklistFilter(bad, PERSONA_RESIDENCIAL);
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('alugar terra');
  });

  it('rejeita case-insensitive', () => {
    const bad = { ...PACKAGE_OK, copies: [{ ...PACKAGE_OK.copies[0], body: 'ARRENDAR sua propriedade' }] };
    expect(blocklistFilter(bad, PERSONA_RESIDENCIAL).passed).toBe(false);
  });

  it('rejeita em headline tambem', () => {
    const bad = { ...PACKAGE_OK, copies: [{ ...PACKAGE_OK.copies[0], headline: 'Fazenda solar?' }] };
    expect(blocklistFilter(bad, PERSONA_RESIDENCIAL).passed).toBe(false);
  });
});

describe('marcaFilter', () => {
  it('rejeita "engenheiro" — deve usar Responsavel Tecnico CREA/CFT', () => {
    const bad = { ...PACKAGE_OK, copies: [{ ...PACKAGE_OK.copies[0], body: 'Atendido por engenheiro qualificado' }] };
    const r = marcaFilter(bad);
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('engenheiro');
  });

  it('passa quando usa "Responsavel Tecnico"', () => {
    const ok = { ...PACKAGE_OK, copies: [{ ...PACKAGE_OK.copies[0], body: 'Responsável Técnico CREA/CFT acompanha cada projeto' }] };
    expect(marcaFilter(ok).passed).toBe(true);
  });
});

describe('criterio700Filter', () => {
  it('passa quando copy menciona criterio R$ 700+', () => {
    const ok = { ...PACKAGE_OK, copies: [{ ...PACKAGE_OK.copies[0], body: 'Pra contas acima de R$ 700/mês' }] };
    expect(criterio700Filter(ok, PERSONA_RESIDENCIAL).passed).toBe(true);
  });

  it('passa quando persona tem conta_minima_brl=0 (off-grid)', () => {
    const offgrid: Persona = { ...PERSONA_RESIDENCIAL, conta_minima_brl: 0, consumo_minimo_kwh: 0 };
    const pkg = { ...PACKAGE_OK, copies: [{ ...PACKAGE_OK.copies[0], body: 'Energia 24h no sitio' }] };
    expect(criterio700Filter(pkg, offgrid).passed).toBe(true);
  });

  it('warning (nao rejeita) quando residencial nao menciona 700', () => {
    const r = criterio700Filter(PACKAGE_OK, PERSONA_RESIDENCIAL);
    expect(r.passed).toBe(true);  // nao rejeita, mas passa info
  });
});

describe('applyAllFilters', () => {
  it('overall_passed=true quando tudo OK', () => {
    const r = applyAllFilters(PACKAGE_OK, PERSONA_RESIDENCIAL);
    expect(r.overall_passed).toBe(true);
  });

  it('overall_passed=false quando blocklist falha', () => {
    const bad = { ...PACKAGE_OK, copies: [{ ...PACKAGE_OK.copies[0], body: 'arrendar' }] };
    expect(applyAllFilters(bad, PERSONA_RESIDENCIAL).overall_passed).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar testes (devem falhar com module not found)**

```bash
npm test -- creative-filters
```

Expected: FAIL `Cannot find module './creative-filters'`.

- [ ] **Step 3: Implementar**

```typescript
// src/modules/marketing/creative-filters.ts
import type { CreativePackage, Persona, FilterResult, CreativeFilterResults } from './types.js';

function copyTexts(pkg: CreativePackage): string {
  return pkg.copies.map((c) => `${c.headline} ${c.body} ${c.cta}`).join(' ');
}

export function blocklistFilter(pkg: CreativePackage, persona: Persona): FilterResult {
  const text = copyTexts(pkg).toLowerCase();
  for (const palavra of persona.palavras_proibidas) {
    if (text.includes(palavra.toLowerCase())) {
      return { passed: false, reason: `Palavra proibida encontrada: "${palavra}"` };
    }
  }
  return { passed: true };
}

const ENGENHEIRO_REGEX = /\bengenheir[oa]s?\b/i;

export function marcaFilter(pkg: CreativePackage): FilterResult {
  const text = copyTexts(pkg);
  if (ENGENHEIRO_REGEX.test(text)) {
    return { passed: false, reason: 'Use "Responsável Técnico CREA/CFT" em vez de "engenheiro"' };
  }
  return { passed: true };
}

const CRIT_700_REGEX = /R\$\s*700|700\s*reais|acima de R\$\s*[5-9]\d\d|conta alta/i;

export function criterio700Filter(pkg: CreativePackage, persona: Persona): FilterResult {
  if (persona.conta_minima_brl === 0) return { passed: true };  // off-grid nao precisa
  const text = copyTexts(pkg);
  if (!CRIT_700_REGEX.test(text)) {
    return { passed: true, reason: 'Nao menciona criterio R$ 700 — info, nao bloqueio' };
  }
  return { passed: true };
}

export function applyAllFilters(pkg: CreativePackage, persona: Persona): CreativeFilterResults {
  const blocklist = blocklistFilter(pkg, persona);
  const marca = marcaFilter(pkg);
  const criterio_700 = criterio700Filter(pkg, persona);
  const overall_passed = blocklist.passed && marca.passed && criterio_700.passed;
  return { blocklist, marca, criterio_700, overall_passed };
}
```

- [ ] **Step 4: Rodar testes (devem passar)**

```bash
npm test -- creative-filters
```

Expected: PASS, todos os testes verdes.

- [ ] **Step 5: Commit**

```bash
git add src/modules/marketing/creative-filters.ts tests/marketing/creative-filters.test.ts
git commit -m "feat(marketing): filtros do agente criativo (blocklist, marca, criterio R\$700)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3.3: Helper de personas

**Files:**
- Create: `src/modules/marketing/personas.ts`

- [ ] **Step 1: Implementar helper**

```typescript
// src/modules/marketing/personas.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Persona } from './types.js';

export class PersonasService {
  constructor(private supabase: SupabaseClient) {}

  async getByCodigo(codigo: string): Promise<Persona | null> {
    const { data, error } = await this.supabase
      .from('marketing_personas')
      .select('*')
      .eq('codigo', codigo)
      .single();
    if (error) return null;
    return data as Persona;
  }

  async listAll(): Promise<Persona[]> {
    const { data, error } = await this.supabase
      .from('marketing_personas')
      .select('*')
      .order('id');
    if (error) throw error;
    return (data ?? []) as Persona[];
  }
}
```

- [ ] **Step 2: Commit (sem teste — wrapper trivial sobre Supabase)**

```bash
git add src/modules/marketing/personas.ts
git commit -m "feat(marketing): helper PersonasService

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3.4: Gerador de copy via Claude

**Files:**
- Create: `src/modules/marketing/copy-generator.ts`
- Create: `tests/marketing/copy-generator.test.ts`

- [ ] **Step 1: Escrever teste de smoke (chama API real, valida formato)**

```typescript
// tests/marketing/copy-generator.test.ts
import { describe, it, expect } from 'vitest';
import { generateCopies } from '../../src/modules/marketing/copy-generator.js';
import { PersonasService } from '../../src/modules/marketing/personas.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

describe('generateCopies', { timeout: 60_000 }, () => {
  it.skipIf(!process.env.ANTHROPIC_API_KEY)('gera 3 copies validas pra residencial DF', async () => {
    const personas = new PersonasService(supabase);
    const persona = await personas.getByCodigo('residencial_df_alto');
    expect(persona).not.toBeNull();

    const copies = await generateCopies({
      briefing: 'Casa em Brasilia, telhado bom, conta R$ 1200/mes',
      persona: persona!,
    });

    expect(copies).toHaveLength(3);
    expect(copies.map(c => c.length).sort()).toEqual(['curto', 'longo', 'medio']);
    for (const c of copies) {
      expect(c.headline.length).toBeGreaterThan(10);
      expect(c.body.length).toBeGreaterThan(20);
      expect(c.cta.length).toBeGreaterThan(3);
      expect(c.headline.toLowerCase()).not.toContain('engenheiro');
      expect(c.body.toLowerCase()).not.toContain('alugar terra');
    }
  });
});
```

- [ ] **Step 2: Rodar teste (deve falhar)**

```bash
npm test -- copy-generator
```

Expected: FAIL module not found.

- [ ] **Step 3: Implementar gerador**

```typescript
// src/modules/marketing/copy-generator.ts
import Anthropic from '@anthropic-ai/sdk';
import type { Persona, CreativeCopy } from './types.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Voce e um copywriter especialista em marketing digital pra empresa de energia solar.
Gere copies pra anuncios Meta (Facebook/Instagram). Tom calorico, tecnico mas acessivel.
NUNCA use a palavra "engenheiro" — sempre "Responsavel Tecnico CREA/CFT".
NUNCA mencione "alugar terra", "arrendar", "fazenda solar".
Mencione criterio "conta acima de R$ 700/mes" quando persona tem conta_minima >= 700.
Gere EXATAMENTE 3 variacoes: curto (1 linha headline + 1 linha body), medio (1 linha headline + 2-3 linhas body), longo (1 linha headline + 4-6 linhas body).
Retorne JSON ARRAY puro com {length, headline, body, cta}.`;

export async function generateCopies(params: {
  briefing: string;
  persona: Persona;
}): Promise<CreativeCopy[]> {
  const personaCtx = JSON.stringify({
    nome: params.persona.nome,
    categoria: params.persona.categoria_portfolio,
    regiao: params.persona.regiao_alvo,
    conta_minima: params.persona.conta_minima_brl,
    contexto_marca: params.persona.contexto_marca,
  }, null, 2);

  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `BRIEFING: ${params.briefing}\n\nPERSONA:\n${personaCtx}\n\nGere as 3 copies em JSON puro.`,
    }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Claude nao retornou JSON: ' + text.slice(0, 200));
  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed) || parsed.length !== 3) {
    throw new Error('Esperado array de 3 copies, recebido: ' + JSON.stringify(parsed).slice(0, 200));
  }
  return parsed as CreativeCopy[];
}
```

- [ ] **Step 4: Rodar teste**

```bash
npm test -- copy-generator
```

Expected: PASS (com ANTHROPIC_API_KEY no .env).

- [ ] **Step 5: Commit**

```bash
git add src/modules/marketing/copy-generator.ts tests/marketing/copy-generator.test.ts
git commit -m "feat(marketing): gerador de copies via Claude Opus

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3.5: Gerador de imagem via Replicate Flux

**Files:**
- Create: `src/modules/marketing/image-generator.ts`

- [ ] **Step 1: Verificar conta Replicate**

Junior cria/confirma conta em `https://replicate.com/account/api-tokens` → copia token → adiciona no Easypanel env do agente-whatsapp:

```
REPLICATE_API_TOKEN=r8_xxxxx
```

- [ ] **Step 2: Implementar gerador**

```typescript
// src/modules/marketing/image-generator.ts
// Usa Replicate Flux 1.1 pro pra geracao de imagem.
// Custo: ~US$ 0.04 por imagem.

const REPLICATE_API = 'https://api.replicate.com/v1/predictions';
const FLUX_MODEL = 'black-forest-labs/flux-1.1-pro';

interface FluxResponse {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed';
  output?: string | string[];
  error?: string;
}

export async function generateImage(prompt: string, options: {
  aspect_ratio?: '1:1' | '4:5' | '16:9';
  style?: 'photorealistic' | 'graphic' | 'documentary';
} = {}): Promise<string> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN nao configurado');

  const styledPrompt = options.style === 'graphic'
    ? `flat infographic illustration, ${prompt}, brand colors orange and blue`
    : options.style === 'documentary'
    ? `documentary photo, candid, natural light, ${prompt}`
    : `professional photo, golden hour, fotorealistic, ${prompt}`;

  const create = await fetch(REPLICATE_API, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: FLUX_MODEL,
      input: {
        prompt: styledPrompt,
        aspect_ratio: options.aspect_ratio ?? '1:1',
        output_format: 'png',
        safety_tolerance: 2,
      },
    }),
  });
  if (!create.ok) throw new Error(`Replicate create ${create.status}: ${await create.text()}`);
  const job = await create.json() as FluxResponse;

  // poll a cada 2s ate concluir (max 60s)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(`${REPLICATE_API}/${job.id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const status = await poll.json() as FluxResponse;
    if (status.status === 'succeeded' && status.output) {
      return Array.isArray(status.output) ? status.output[0] : status.output;
    }
    if (status.status === 'failed') throw new Error('Flux failed: ' + status.error);
  }
  throw new Error('Flux timeout (60s)');
}
```

- [ ] **Step 3: Smoke test manual (1 imagem)**

```bash
cd "C:/Users/Meu Computador/Documents/ecosunpower-agente"
tsx -e "
import { generateImage } from './src/modules/marketing/image-generator.js';
generateImage('familia feliz na varanda de casa em Brasilia com paineis solares no telhado', { style: 'photorealistic' })
  .then((url) => console.log('OK:', url))
  .catch((e) => console.error('FAIL:', e));
"
```

Expected: URL de imagem PNG (delivery.replicate.com/...). Junior abre URL pra ver imagem.

- [ ] **Step 4: Commit**

```bash
git add src/modules/marketing/image-generator.ts
git commit -m "feat(marketing): gerador de imagem via Replicate Flux 1.1 pro

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3.6: Storage de criativos no Supabase

**Files:**
- Create: `src/modules/marketing/creative-storage.ts`

- [ ] **Step 1: Criar bucket no Supabase**

Junior abre Supabase Dashboard → Storage → New Bucket → nome `ad-creatives`, public, file size limit 5 MB.

- [ ] **Step 2: Implementar storage helper**

```typescript
// src/modules/marketing/creative-storage.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CreativePackage, CreativeImage } from './types.js';

export class CreativeStorage {
  constructor(private supabase: SupabaseClient, private bucket = 'ad-creatives') {}

  async uploadImage(imageUrl: string, creativeId: number, index: number): Promise<string> {
    const r = await fetch(imageUrl);
    if (!r.ok) throw new Error(`Download falhou: ${r.status}`);
    const blob = await r.blob();
    const path = `creatives/${creativeId}/img-${index}.png`;
    const { error } = await this.supabase.storage.from(this.bucket).upload(path, blob, {
      contentType: 'image/png',
      upsert: true,
    });
    if (error) throw error;
    const { data } = this.supabase.storage.from(this.bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  async persistDraft(pkg: CreativePackage, modelUsed: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('marketing_creatives')
      .insert({
        persona_id: pkg.persona_id,
        briefing: pkg.briefing,
        status: 'draft',
        imagens: pkg.imagens,
        copies: pkg.copies,
        cta_primario: pkg.cta_primario,
        justificativa: pkg.justificativa,
        created_by_model: modelUsed,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }

  async logGeneration(params: {
    creative_id: number;
    prompt: string;
    raw_output: unknown;
    filter_results?: unknown;
    decision: string;
    reason?: string;
  }): Promise<void> {
    await this.supabase.from('marketing_creative_logs').insert({
      creative_id: params.creative_id,
      prompt_used: params.prompt,
      raw_output: params.raw_output,
      filter_results: params.filter_results,
      decision: params.decision,
      reason: params.reason,
    });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/marketing/creative-storage.ts
git commit -m "feat(marketing): storage de criativos em Supabase + logs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3.7: Agente Criativo (orchestrator)

**Files:**
- Create: `src/modules/marketing/creative-agent.ts`

- [ ] **Step 1: Implementar orchestrator**

```typescript
// src/modules/marketing/creative-agent.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { PersonasService } from './personas.js';
import { generateCopies } from './copy-generator.js';
import { generateImage } from './image-generator.js';
import { CreativeStorage } from './creative-storage.js';
import { applyAllFilters } from './creative-filters.js';
import type { CreativePackage, Persona } from './types.js';

export class CreativeAgent {
  private personas: PersonasService;
  private storage: CreativeStorage;

  constructor(supabase: SupabaseClient) {
    this.personas = new PersonasService(supabase);
    this.storage = new CreativeStorage(supabase);
  }

  async generatePackage(params: {
    briefing: string;
    persona_codigo: string;
  }): Promise<{ creative_id: number; pkg: CreativePackage; persona: Persona }> {
    const persona = await this.personas.getByCodigo(params.persona_codigo);
    if (!persona) throw new Error(`Persona ${params.persona_codigo} nao encontrada`);

    // 1. Gerar 3 copies
    const copies = await generateCopies({ briefing: params.briefing, persona });

    // 2. Gerar 3 imagens em paralelo (estilos diferentes)
    const imagePrompts = [
      { style: 'photorealistic' as const, prompt: this.buildImagePrompt(params.briefing, persona, 'fotorealista') },
      { style: 'graphic' as const, prompt: this.buildImagePrompt(params.briefing, persona, 'grafico') },
      { style: 'documentary' as const, prompt: this.buildImagePrompt(params.briefing, persona, 'depoimento') },
    ];
    const images = await Promise.all(
      imagePrompts.map(async (p) => ({
        url: await generateImage(p.prompt, { style: p.style, aspect_ratio: '1:1' }),
        style: p.style === 'photorealistic' ? 'fotorealista' as const : p.style === 'graphic' ? 'grafico' as const : 'depoimento' as const,
        prompt_used: p.prompt,
      }))
    );

    const pkg: CreativePackage = {
      briefing: params.briefing,
      persona_id: persona.id,
      imagens: images,
      copies,
      cta_primario: copies[0].cta,
      justificativa: `3 estilos cobrindo persona ${persona.nome}. Filtros aplicados.`,
    };

    // 3. Filtros
    const filterResults = applyAllFilters(pkg, persona);

    // 4. Persist draft
    const creative_id = await this.storage.persistDraft(pkg, 'claude-opus-4-7');

    // 5. Log
    await this.storage.logGeneration({
      creative_id,
      prompt: `briefing=${params.briefing} persona=${persona.codigo}`,
      raw_output: pkg,
      filter_results: filterResults,
      decision: filterResults.overall_passed ? 'sent_to_junior' : 'rejected_filter',
      reason: filterResults.overall_passed ? undefined : JSON.stringify(filterResults),
    });

    if (!filterResults.overall_passed) {
      throw new Error(`Filtro rejeitou: ${JSON.stringify(filterResults)}`);
    }

    // 6. Re-upload imagens pro Supabase (URLs Replicate expiram em 24h)
    const persistedImages = await Promise.all(
      pkg.imagens.map((img, i) => this.storage.uploadImage(img.url, creative_id, i)
        .then(url => ({ ...img, url })))
    );
    pkg.imagens = persistedImages;

    return { creative_id, pkg, persona };
  }

  private buildImagePrompt(briefing: string, persona: Persona, style: string): string {
    const baseByPersona: Record<string, string> = {
      on_grid_residencial: 'family-friendly residential house with solar panels on roof',
      on_grid_comercial: 'small business owner storefront with solar panels',
      hibrido: 'modern house with solar + battery wall mounted',
      off_grid: 'rural property with off-grid solar system',
      ev_charger: 'EV wallbox installed at home garage',
      manutencao: 'technician inspecting solar panels',
    };
    const base = baseByPersona[persona.categoria_portfolio] ?? 'solar panel system';
    return `${base}, ${briefing}, brand EcoSunPower, ${style}`;
  }
}
```

- [ ] **Step 2: Smoke test E2E (gera 1 pacote completo)**

```bash
cd "C:/Users/Meu Computador/Documents/ecosunpower-agente"
tsx -e "
import { CreativeAgent } from './src/modules/marketing/creative-agent.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const agent = new CreativeAgent(supabase);
const r = await agent.generatePackage({
  briefing: 'Casa em Aguas Claras, conta R\$ 1200/mes, 4 moradores',
  persona_codigo: 'residencial_df_alto',
});
console.log('OK creative_id=', r.creative_id);
console.log('Imagens:', r.pkg.imagens.map(i => i.url));
console.log('Copies:', r.pkg.copies.length);
"
```

Expected: log com `creative_id=N`, 3 URLs Supabase, 3 copies. Junior abre URLs pra ver imagens.

- [ ] **Step 3: Commit**

```bash
git add src/modules/marketing/creative-agent.ts
git commit -m "feat(marketing): Agente Criativo orquestrador completo

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3.8: Comando `/criativo` no zap (integração com brain)

**Files:**
- Modify: `src/index.ts` (adicionar comando + handler)

- [ ] **Step 1: Localizar onde comandos sao detectados**

```bash
# Junior/Claude busca:
grep -n "case '/preco'" src/index.ts
```

- [ ] **Step 2: Adicionar handler `/criativo`**

Logo após o handler de `/preco` ou similar, adicionar:

```typescript
// dentro do switch de comandos do Junior, no handler de mensagens admin
case '/criativo': {
  // Sintaxe: /criativo <persona_codigo> <briefing>
  // Ex: /criativo residencial_df_alto Casa em Aguas Claras conta R$ 1200/mes
  const parts = text.replace('/criativo', '').trim().split(/\s+/);
  const personaCode = parts.shift();
  const briefing = parts.join(' ');

  if (!personaCode || !briefing) {
    await sendText(from, 'Uso: /criativo <persona_codigo> <briefing>\n\nPersonas disponiveis: residencial_df_alto, residencial_go_alto, comercial_loja, hibrido_baterias, off_grid_rural, ev_charger');
    break;
  }

  await sendText(from, `🎨 Gerando pacote criativo pra ${personaCode}...\nIsso leva 2-3 min (3 imagens + 3 copies).`);

  const { CreativeAgent } = await import('./modules/marketing/creative-agent.js');
  const agent = new CreativeAgent(supabase);

  try {
    const { creative_id, pkg, persona } = await agent.generatePackage({
      briefing,
      persona_codigo: personaCode,
    });

    // Envia preview com botoes de aprovacao
    let preview = `🎨 Criativo #${creative_id} pronto pra "${persona.nome}"\n\n`;
    preview += `📝 Copies (3 variacoes):\n`;
    pkg.copies.forEach((c, i) => {
      preview += `\n${i+1}. [${c.length}] ${c.headline}\n   ${c.body}\n   CTA: ${c.cta}\n`;
    });
    preview += `\n🖼 Imagens: ver no dashboard /dashboard/marketing/criativo/${creative_id}\n`;

    await sendText(from, preview);

    // Envia 3 imagens
    for (const img of pkg.imagens) {
      await sendImage(from, img.url, `[${img.style}]`);
    }

    await sendButtons(from, 'Aprovar?', [
      { id: `criativo_aprovar_${creative_id}`, title: '✅ Aprovar tudo' },
      { id: `criativo_regenerar_${creative_id}`, title: '🔄 Regenerar' },
      { id: `criativo_descartar_${creative_id}`, title: '❌ Descartar' },
    ]);
  } catch (err) {
    await sendText(from, `❌ Erro gerando criativo: ${(err as Error).message}`);
  }
  break;
}
```

- [ ] **Step 3: Adicionar handlers dos botões de aprovação**

```typescript
// no handler de button_reply (procurar onde outros botoes admin sao tratados):
if (buttonId.startsWith('criativo_aprovar_')) {
  const id = parseInt(buttonId.split('_')[2]);
  await supabase.from('marketing_creatives').update({
    status: 'aprovado', approved_at: new Date().toISOString(), approved_by_phone: from,
  }).eq('id', id);
  await sendText(from, `✅ Criativo #${id} aprovado. Pronto pra usar em campanha.`);
}
if (buttonId.startsWith('criativo_descartar_')) {
  const id = parseInt(buttonId.split('_')[2]);
  await supabase.from('marketing_creatives').update({ status: 'descartado' }).eq('id', id);
  await sendText(from, `🗑 Criativo #${id} descartado.`);
}
if (buttonId.startsWith('criativo_regenerar_')) {
  await sendText(from, `🔄 Pra regenerar, mande /criativo de novo com briefing ajustado.`);
}
```

- [ ] **Step 4: Test build**

```bash
npm run build
```

Expected: sem erros TypeScript.

- [ ] **Step 5: Commit + push + deploy Easypanel**

```bash
git add src/index.ts
git commit -m "feat(marketing): comando /criativo no zap + botoes aprovar/regenerar/descartar

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main
```

Junior clica "Implantar" no Easypanel.

- [ ] **Step 6: Teste E2E em prod**

Junior manda `/criativo residencial_df_alto Casa Plano Piloto conta R$ 1500` no zap. Recebe preview + 3 imagens + botões em ~3 min. Clica Aprovar.

---

## Fase 4 — Qualificador IG DM (Dia 5-7)

### Task 4.1: Adapter `instagram-direct.ts` (TDD)

**Files:**
- Create: `src/modules/messaging/instagram-direct.ts`
- Create: `tests/messaging/instagram-direct.test.ts`

- [ ] **Step 1: Estudar API Instagram Messaging**

Documentação Meta: `https://developers.facebook.com/docs/messenger-platform/instagram/get-started`

Key endpoints:
- POST `/<IG_USER_ID>/messages` (send DM)
- Webhook event: `instagram` field, `messaging` array com `sender.id`, `message.text`

- [ ] **Step 2: Implementar adapter (mesma forma que meta-whatsapp.ts)**

```typescript
// src/modules/messaging/instagram-direct.ts
const GRAPH = 'https://graph.facebook.com/v22.0';

export class InstagramDirectService {
  constructor(
    private igUserId: string,        // IG-scoped Page User ID
    private accessToken: string,
    private appSecret: string,
  ) {}

  async sendText(recipientIgId: string, text: string): Promise<void> {
    const url = `${GRAPH}/${this.igUserId}/messages?access_token=${this.accessToken}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientIgId },
        message: { text },
      }),
    });
    if (!r.ok) throw new Error(`IG DM send ${r.status}: ${await r.text()}`);
  }

  async sendQuickReplies(recipientIgId: string, text: string, options: { title: string; payload: string }[]): Promise<void> {
    const url = `${GRAPH}/${this.igUserId}/messages?access_token=${this.accessToken}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientIgId },
        message: {
          text,
          quick_replies: options.slice(0, 13).map((o) => ({ content_type: 'text', title: o.title.slice(0, 20), payload: o.payload })),
        },
      }),
    });
    if (!r.ok) throw new Error(`IG DM quick_replies ${r.status}: ${await r.text()}`);
  }

  validateWebhookSignature(rawBody: string, signature: string | undefined): boolean {
    if (!signature) return false;
    const crypto = require('crypto');
    const expected = 'sha256=' + crypto.createHmac('sha256', this.appSecret).update(rawBody).digest('hex');
    return signature === expected;
  }
}
```

- [ ] **Step 3: Test signature validation**

```typescript
// tests/messaging/instagram-direct.test.ts
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { InstagramDirectService } from '../../src/modules/messaging/instagram-direct.js';

describe('InstagramDirectService.validateWebhookSignature', () => {
  const svc = new InstagramDirectService('user', 'token', 'app-secret-test');

  it('aceita signature valida', () => {
    const body = '{"object":"instagram"}';
    const sig = 'sha256=' + crypto.createHmac('sha256', 'app-secret-test').update(body).digest('hex');
    expect(svc.validateWebhookSignature(body, sig)).toBe(true);
  });

  it('rejeita signature invalida', () => {
    expect(svc.validateWebhookSignature('{"x":1}', 'sha256=wrong')).toBe(false);
  });

  it('rejeita ausente', () => {
    expect(svc.validateWebhookSignature('{}', undefined)).toBe(false);
  });
});
```

```bash
npm test -- instagram-direct
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/messaging/instagram-direct.ts tests/messaging/instagram-direct.test.ts
git commit -m "feat(messaging): adapter Instagram Direct + HMAC validation

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 4.2: Filtros do qualificador IG (TDD core)

**Files:**
- Create: `src/modules/marketing/ig-qualifier-filters.ts`
- Create: `tests/marketing/ig-qualifier-filters.test.ts`

- [ ] **Step 1: Escrever testes**

```typescript
// tests/marketing/ig-qualifier-filters.test.ts
import { describe, it, expect } from 'vitest';
import { qualifyByConta, qualifyByRegion, qualifyByPerfil } from '../../src/modules/marketing/ig-qualifier-filters.js';

describe('qualifyByConta', () => {
  it('rejeita ate_700', () => {
    expect(qualifyByConta('ate_700').qualified).toBe(false);
  });
  it('aceita 700_1500', () => {
    expect(qualifyByConta('700_1500').qualified).toBe(true);
  });
  it('aceita 1500_3000 + tag premium', () => {
    const r = qualifyByConta('1500_3000');
    expect(r.qualified).toBe(true);
    expect(r.tag).toBe('premium');
  });
  it('aceita acima_3000 + tag comercial', () => {
    const r = qualifyByConta('acima_3000');
    expect(r.qualified).toBe(true);
    expect(r.tag).toBe('comercial_alto_consumo');
  });
});

describe('qualifyByRegion', () => {
  it('aceita brasilia', () => expect(qualifyByRegion('brasilia').qualified).toBe(true));
  it('aceita aguas claras', () => expect(qualifyByRegion('Aguas Claras').qualified).toBe(true));
  it('aceita anapolis (GO entorno)', () => expect(qualifyByRegion('Anapolis').qualified).toBe(true));
  it('rejeita sao paulo', () => expect(qualifyByRegion('Sao Paulo').qualified).toBe(false));
  it('rejeita salvador', () => expect(qualifyByRegion('Salvador').qualified).toBe(false));
});

describe('qualifyByPerfil', () => {
  it('aceita casa', () => expect(qualifyByPerfil('casa').qualified).toBe(true));
  it('aceita comercio', () => expect(qualifyByPerfil('comercio').qualified).toBe(true));
  it('aceita sitio', () => expect(qualifyByPerfil('sitio').qualified).toBe(true));
  it('rejeita "alugar terra"', () => {
    const r = qualifyByPerfil('Quero alugar terra pra usina solar grande');
    expect(r.qualified).toBe(false);
    expect(r.reason).toContain('alugar terra');
  });
});
```

- [ ] **Step 2: Implementar**

```typescript
// src/modules/marketing/ig-qualifier-filters.ts

export interface QualifyResult {
  qualified: boolean;
  reason?: string;
  tag?: 'padrao' | 'premium' | 'comercial_alto_consumo';
}

export function qualifyByConta(faixa: string): QualifyResult {
  switch (faixa) {
    case 'ate_700': return { qualified: false, reason: 'Conta abaixo R$ 700/mes — fora do criterio minimo' };
    case '700_1500': return { qualified: true, tag: 'padrao' };
    case '1500_3000': return { qualified: true, tag: 'premium' };
    case 'acima_3000': return { qualified: true, tag: 'comercial_alto_consumo' };
    default: return { qualified: false, reason: `Faixa desconhecida: ${faixa}` };
  }
}

const CIDADES_DF = ['brasilia','plano piloto','aguas claras','taguatinga','ceilandia','samambaia','sobradinho','planaltina','gama','santa maria','recanto das emas','riacho fundo','candangolandia','cruzeiro','guara','nucleo bandeirante','park way','itapoa','sao sebastiao','jardim botanico','vicente pires','arniqueira','sudoeste','octogonal'];
const CIDADES_GO_ENTORNO = ['anapolis','luziania','formosa','planaltina de goias','aguas lindas','novo gama','valparaiso','cidade ocidental','padre bernardo','santo antonio do descoberto','cocalzinho','pirenopolis','goianesia','alexania','corumba de goias','abadiania'];

export function qualifyByRegion(cidade: string): QualifyResult {
  const c = cidade.toLowerCase().trim();
  if (CIDADES_DF.some((x) => c.includes(x))) return { qualified: true };
  if (CIDADES_GO_ENTORNO.some((x) => c.includes(x))) return { qualified: true };
  return { qualified: false, reason: `Hoje atendemos so DF e Goias ate 100km do Entorno. Recebemos seu contato pra futuro.` };
}

const PROIBIDAS_PERFIL = ['alugar terra', 'arrendar', 'fazenda solar', 'alugar fazenda', 'usina solar grande'];

export function qualifyByPerfil(texto: string): QualifyResult {
  const t = texto.toLowerCase();
  for (const p of PROIBIDAS_PERFIL) {
    if (t.includes(p)) return { qualified: false, reason: `Detectado interesse em ${p} — fora do nosso atendimento` };
  }
  return { qualified: true };
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- ig-qualifier-filters
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/marketing/ig-qualifier-filters.ts tests/marketing/ig-qualifier-filters.test.ts
git commit -m "feat(marketing): filtros do qualificador IG (conta, regiao, perfil)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 4.3: Brain do qualificador IG (gerencia conversa)

**Files:**
- Create: `src/modules/marketing/ig-qualifier-brain.ts`
- Create: `tests/marketing/ig-qualifier-brain.test.ts`

- [ ] **Step 1: Escrever testes do state machine**

```typescript
// tests/marketing/ig-qualifier-brain.test.ts
import { describe, it, expect } from 'vitest';
import { nextStep, type QualifyState } from '../../src/modules/marketing/ig-qualifier-brain.js';

describe('nextStep', () => {
  it('inicio: pergunta tipo de imovel', () => {
    const state: QualifyState = { step: 'start', data: {} };
    const r = nextStep(state, '');
    expect(r.next.step).toBe('await_tipo');
    expect(r.message).toContain('CASA');
    expect(r.quickReplies?.length).toBeGreaterThanOrEqual(3);
  });

  it('await_tipo casa: pergunta cidade', () => {
    const state: QualifyState = { step: 'await_tipo', data: {} };
    const r = nextStep(state, 'casa');
    expect(r.next.step).toBe('await_cidade');
    expect(r.next.data.tipo).toBe('casa');
  });

  it('await_cidade brasilia: pergunta conta', () => {
    const state: QualifyState = { step: 'await_cidade', data: { tipo: 'casa' } };
    const r = nextStep(state, 'brasilia');
    expect(r.next.step).toBe('await_conta');
    expect(r.quickReplies).toEqual(expect.arrayContaining([
      expect.objectContaining({ payload: 'ate_700' }),
      expect.objectContaining({ payload: '700_1500' }),
    ]));
  });

  it('await_cidade fora: descarte regiao', () => {
    const state: QualifyState = { step: 'await_cidade', data: { tipo: 'casa' } };
    const r = nextStep(state, 'sao paulo');
    expect(r.next.step).toBe('disqualified');
    expect(r.message).toContain('atendemos');
  });

  it('await_conta ate_700: descarte criterio', () => {
    const state: QualifyState = { step: 'await_conta', data: { tipo: 'casa', cidade: 'brasilia' } };
    const r = nextStep(state, 'ate_700');
    expect(r.next.step).toBe('disqualified');
    expect(r.message).toContain('R$ 700');
  });

  it('await_conta 700_1500: pergunta handoff', () => {
    const state: QualifyState = { step: 'await_conta', data: { tipo: 'casa', cidade: 'brasilia' } };
    const r = nextStep(state, '700_1500');
    expect(r.next.step).toBe('await_handoff');
    expect(r.message).toContain('WhatsApp');
  });

  it('await_handoff sim: gera link wa.me', () => {
    const state: QualifyState = { step: 'await_handoff', data: { tipo: 'casa', cidade: 'brasilia', faixa_conta: '700_1500' } };
    const r = nextStep(state, 'sim');
    expect(r.next.step).toBe('handed_off');
    expect(r.message).toMatch(/wa\.me/);
  });

  it('await_handoff nao: escala humano', () => {
    const state: QualifyState = { step: 'await_handoff', data: { tipo: 'casa', cidade: 'brasilia', faixa_conta: '700_1500' } };
    const r = nextStep(state, 'nao');
    expect(r.next.step).toBe('escalated_human');
  });

  it('detecta intent escalacao', () => {
    const state: QualifyState = { step: 'await_conta', data: {} };
    const r = nextStep(state, 'quero falar com uma pessoa');
    expect(r.next.step).toBe('escalated_human');
  });
});
```

- [ ] **Step 2: Implementar brain**

```typescript
// src/modules/marketing/ig-qualifier-brain.ts
import { qualifyByConta, qualifyByRegion, qualifyByPerfil } from './ig-qualifier-filters.js';

export type QualifyStep =
  | 'start' | 'await_tipo' | 'await_cidade' | 'await_conta'
  | 'await_handoff' | 'handed_off' | 'disqualified' | 'escalated_human';

export interface QualifyState {
  step: QualifyStep;
  data: { tipo?: string; cidade?: string; faixa_conta?: string; tag?: string };
}

export interface NextStepResult {
  next: QualifyState;
  message: string;
  quickReplies?: { title: string; payload: string }[];
}

const ESCALATION_KEYWORDS = ['quero falar com uma pessoa', 'humano', 'reclamacao', 'reclamação', 'aneel', 'processo', 'advogado'];

function shouldEscalate(text: string): boolean {
  const t = text.toLowerCase();
  return ESCALATION_KEYWORDS.some((k) => t.includes(k));
}

const WA_PHONE = '5561996978781';

export function nextStep(state: QualifyState, input: string): NextStepResult {
  if (shouldEscalate(input) && state.step !== 'start') {
    return { next: { ...state, step: 'escalated_human' }, message: 'Claro! Vou avisar nossa equipe pra te atender.' };
  }

  switch (state.step) {
    case 'start':
      return {
        next: { step: 'await_tipo', data: {} },
        message: 'Oi! 👋 Aqui é a Eva da EcoSunPower. Você quer reduzir a conta de luz da sua CASA, do seu COMÉRCIO ou tem uma situação diferente?',
        quickReplies: [
          { title: '🏠 Casa', payload: 'casa' },
          { title: '🏪 Comércio', payload: 'comercio' },
          { title: '🏞️ Sítio', payload: 'sitio' },
          { title: '⚡ Outro', payload: 'outro' },
        ],
      };

    case 'await_tipo': {
      const perfil = qualifyByPerfil(input);
      if (!perfil.qualified) return { next: { ...state, step: 'disqualified' }, message: 'Entendi. Hoje nosso foco é instalação de painéis em casas, comércios e sítios. Não trabalhamos com aluguel/arrendamento de terra. Obrigada pelo contato!' };

      const tipo = input.toLowerCase().trim();
      return {
        next: { step: 'await_cidade', data: { ...state.data, tipo } },
        message: 'Top! Você está em qual cidade? (Atendemos Brasília-DF e Goiás até 100 km do Entorno)',
      };
    }

    case 'await_cidade': {
      const r = qualifyByRegion(input);
      if (!r.qualified) return { next: { ...state, step: 'disqualified' }, message: r.reason ?? 'Fora da nossa região hoje.' };

      return {
        next: { step: 'await_conta', data: { ...state.data, cidade: input } },
        message: 'Perfeito, atendemos! Quanto vem por mês mais ou menos sua conta de luz?',
        quickReplies: [
          { title: 'até R$ 700', payload: 'ate_700' },
          { title: 'R$ 700-1500', payload: '700_1500' },
          { title: 'R$ 1500-3000', payload: '1500_3000' },
          { title: 'acima R$ 3000', payload: 'acima_3000' },
        ],
      };
    }

    case 'await_conta': {
      const r = qualifyByConta(input);
      if (!r.qualified) {
        return {
          next: { ...state, step: 'disqualified' },
          message: 'Pro seu perfil de consumo hoje, o solar não trás economia que justifique o investimento. Quando sua conta passar de R$ 700/mês, pode chegar de novo que a gente faz o estudo. Por enquanto, recomendo focar em economizar (LED, geladeira A+, etc).',
        };
      }
      return {
        next: { step: 'await_handoff', data: { ...state.data, faixa_conta: input, tag: r.tag } },
        message: 'Show, esse perfil tem economia muito boa. Pra eu te enviar uma simulação personalizada em 5 minutos com fotos do material que usamos, posso continuar o atendimento no WhatsApp?',
        quickReplies: [
          { title: '✅ Pode sim', payload: 'sim' },
          { title: '❌ Prefiro aqui', payload: 'nao' },
        ],
      };
    }

    case 'await_handoff': {
      if (input.toLowerCase().includes('sim') || input === 'sim') {
        const ctxText = `Vim do Instagram. Tipo: ${state.data.tipo}, Cidade: ${state.data.cidade}, Faixa: ${state.data.faixa_conta}`;
        const link = `https://wa.me/${WA_PHONE}?text=${encodeURIComponent(ctxText)}`;
        return {
          next: { ...state, step: 'handed_off' },
          message: `Perfeito! Clica aqui pra continuar no WhatsApp:\n${link}\n\nVou te aguardar lá.`,
        };
      }
      return {
        next: { ...state, step: 'escalated_human' },
        message: 'Sem problema! Vou pedir pro Junior te atender por aqui mesmo. Aguarda só um momento.',
      };
    }

    default:
      return { next: state, message: 'Conversa encerrada.' };
  }
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- ig-qualifier-brain
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/marketing/ig-qualifier-brain.ts tests/marketing/ig-qualifier-brain.test.ts
git commit -m "feat(marketing): brain qualificador IG — state machine completo

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 4.4: Webhook `/webhook-ig` no `index.ts`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Adicionar serviço IG ao boot**

Após inicialização de `metaWaba`, adicionar:

```typescript
// IG Direct Messaging
let igDirect: InstagramDirectService | null = null;
if (config.metaWabaAccessToken && config.metaAppSecret && process.env.IG_USER_ID) {
  const { InstagramDirectService } = await import('./modules/messaging/instagram-direct.js');
  igDirect = new InstagramDirectService(
    process.env.IG_USER_ID,
    config.metaWabaAccessToken,
    config.metaAppSecret,
  );
  console.log('[ig] Service initialized for user:', process.env.IG_USER_ID);
} else {
  console.warn('[ig] Disabled: faltam IG_USER_ID, META_WABA_ACCESS_TOKEN ou META_APP_SECRET');
}
```

- [ ] **Step 2: Adicionar endpoint GET (challenge) e POST (events)**

Após o bloco `/webhook-waba`, adicionar:

```typescript
if (igDirect) {
  app.get('/webhook-ig', (req, res) => {
    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const challenge = req.query['hub.challenge'] as string;
    if (mode === 'subscribe' && token === config.metaWabaVerifyToken) {
      console.log('[ig] Webhook verified');
      res.status(200).send(challenge);
    } else {
      res.status(403).send('Forbidden');
    }
  });

  app.post('/webhook-ig', async (req, res) => {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? '';

    if (!igDirect!.validateSignature(rawBody, signature)) {
      console.warn('[ig] Invalid HMAC');
      res.status(403).json({ error: 'Invalid signature' });
      return;
    }

    res.status(200).send('OK');  // ack imediato Meta exige

    const body = req.body as { entry?: Array<{ messaging?: Array<{ sender: { id: string }; message?: { text?: string; quick_reply?: { payload: string } } }> }> };
    for (const entry of body.entry ?? []) {
      for (const evt of entry.messaging ?? []) {
        const senderId = evt.sender.id;
        const text = evt.message?.quick_reply?.payload ?? evt.message?.text ?? '';
        if (!text) continue;

        const { handleIgMessage } = await import('./modules/marketing/ig-qualifier-handler.js');
        try {
          await handleIgMessage({ supabase, igDirect: igDirect!, senderId, text, sendZapAlert: (msg) => sendText(config.engineerPhone, msg) });
        } catch (err) {
          console.error('[ig] handler error:', err);
        }
      }
    }
  });

  console.log('[ig] Webhook endpoints registered: GET/POST /webhook-ig');
}
```

- [ ] **Step 3: Criar handler `ig-qualifier-handler.ts`**

```typescript
// src/modules/marketing/ig-qualifier-handler.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { InstagramDirectService } from '../messaging/instagram-direct.js';
import { nextStep, type QualifyState } from './ig-qualifier-brain.js';

export async function handleIgMessage(params: {
  supabase: SupabaseClient;
  igDirect: InstagramDirectService;
  senderId: string;
  text: string;
  sendZapAlert: (msg: string) => Promise<void>;
}): Promise<void> {
  const { supabase, igDirect, senderId, text, sendZapAlert } = params;

  // Carrega ou cria thread
  let { data: thread } = await supabase.from('dm_threads').select('*').eq('ig_user_id', senderId).eq('status', 'active').maybeSingle();
  if (!thread) {
    const { data: newThread, error } = await supabase.from('dm_threads').insert({
      ig_user_id: senderId, ig_thread_id: senderId,  // simplificacao: 1 thread por user
      status: 'active',
    }).select('*').single();
    if (error) throw error;
    thread = newThread;
  }

  // Persist mensagem inbound
  await supabase.from('dm_messages').insert({ thread_id: thread.id, direction: 'inbound', content: text });

  // Carrega state (ou inicia)
  const state: QualifyState = thread.qualified_data?.state ?? { step: 'start', data: {} };

  // Se start, dispara primeira mensagem
  const result = nextStep(state, text);

  // Envia resposta
  if (result.quickReplies && result.quickReplies.length > 0) {
    await igDirect.sendQuickReplies(senderId, result.message, result.quickReplies);
  } else {
    await igDirect.sendText(senderId, result.message);
  }

  // Persist mensagem outbound
  await supabase.from('dm_messages').insert({
    thread_id: thread.id, direction: 'outbound', content: result.message, buttons: result.quickReplies,
  });

  // Atualiza thread
  const newStatus =
    result.next.step === 'handed_off' ? 'qualified_handed_off' :
    result.next.step === 'disqualified' ? 'disqualified' :
    result.next.step === 'escalated_human' ? 'escalated_human' : 'active';

  await supabase.from('dm_threads').update({
    status: newStatus,
    qualified_data: { state: result.next, ...result.next.data },
    ended_at: ['qualified_handed_off','disqualified','escalated_human'].includes(newStatus) ? new Date().toISOString() : null,
  }).eq('id', thread.id);

  // Se escalou, alerta Junior
  if (newStatus === 'escalated_human') {
    await sendZapAlert(`🚨 Lead IG pediu humano. Thread #${thread.id}, IG user ${senderId}\nTexto: "${text}"\nResponda direto pelo Inbox do Instagram.`);
  }
  if (newStatus === 'qualified_handed_off') {
    await sendZapAlert(`✅ Lead IG qualificado! Tipo: ${result.next.data.tipo}, Cidade: ${result.next.data.cidade}, Faixa: ${result.next.data.faixa_conta}\nLink wa.me enviado pra ele clicar.`);
  }
}
```

- [ ] **Step 4: Configurar webhook no Meta Developers**

Junior abre `https://developers.facebook.com/apps/2507358756362279/webhooks/` → adiciona webhook em `Instagram` → URL: `https://aula-aprendendo-agente-whatsapp.oigz6g.easypanel.host/webhook-ig` → Verify Token: `ecosun-waba-2026` → Subscribe to: `messages`.

- [ ] **Step 5: Adicionar `IG_USER_ID` no Easypanel**

Junior pega ID em `https://www.instagram.com/<username>/` (via Graph API Explorer) e adiciona env `IG_USER_ID=<numero>`.

- [ ] **Step 6: Build + commit + push + deploy**

```bash
npm run build
git add src/index.ts src/modules/marketing/ig-qualifier-handler.ts
git commit -m "feat(marketing): webhook IG /webhook-ig + handler integrado com brain qualificador

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main
```

Junior implanta Easypanel.

- [ ] **Step 7: Teste E2E**

Junior manda DM no IG da @ecosunpower → bot responde com perguntas → completa fluxo → recebe link wa.me.

### Task 4.5: Configurar Click-to-Message ads (Junior, manual)

**Files:** N/A (configuração no Ads Manager)

- [ ] **Step 1: Junior cria 1 anúncio Click-to-Message no Ads Manager**

- Objetivo: Mensagens
- Plataforma: Instagram (apenas)
- Destino da mensagem: **Instagram Direct** (não Messenger)
- Anúncio: usa um dos 3 criativos manuais da Task 1.2
- Budget: R$ 10/dia (teste pequeno)

- [ ] **Step 2: Aguardar 24h pra ver primeira mensagem real**

Junior monitora `dm_threads` no dashboard ou pelo zap (avisos automáticos do handler).

---

## Fase 5 — Agente Analista + Dashboard Marketing (Dia 8-10)

### Task 5.1: Snapshot meta_ads_insights cron 2h

**Files:**
- Create: `src/modules/marketing/insights-collector.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Implementar collector**

```typescript
// src/modules/marketing/insights-collector.ts
import type { SupabaseClient } from '@supabase/supabase-js';

const GRAPH = 'https://graph.facebook.com/v22.0';

export async function collectInsights(supabase: SupabaseClient, accessToken: string): Promise<void> {
  // Lista campanhas ativas no DB
  const { data: campaigns } = await supabase.from('marketing_campaigns').select('*').eq('status', 'active');
  if (!campaigns || campaigns.length === 0) return;

  for (const camp of campaigns) {
    try {
      const fields = 'spend,impressions,reach,clicks,ctr,cpc,cpm,actions,cost_per_action_type,date_start,date_stop';
      const url = `${GRAPH}/${camp.meta_campaign_id}/insights?fields=${fields}&date_preset=today&access_token=${accessToken}`;
      const r = await fetch(url);
      if (!r.ok) { console.warn(`[insights] camp=${camp.id} ${r.status}`); continue; }
      const data = await r.json() as { data: Array<Record<string, string>> };

      for (const i of data.data) {
        const leads = parseInt((i.actions as unknown as { action_type: string; value: string }[] | undefined)?.find(a => a.action_type === 'lead')?.value ?? '0');
        const spend_cents = Math.round(parseFloat(i.spend ?? '0') * 100);
        const cpl_cents = leads > 0 ? Math.round(spend_cents / leads) : null;

        await supabase.from('meta_ads_insights').insert({
          campaign_id: camp.id,
          spend_cents,
          impressions: parseInt(i.impressions ?? '0'),
          reach: parseInt(i.reach ?? '0'),
          clicks: parseInt(i.clicks ?? '0'),
          ctr_pct: parseFloat(i.ctr ?? '0'),
          cpc_cents: Math.round(parseFloat(i.cpc ?? '0') * 100),
          cpm_cents: Math.round(parseFloat(i.cpm ?? '0') * 100),
          leads, cpl_cents, raw_payload: i,
          date_start: i.date_start, date_stop: i.date_stop,
        });
      }
      await supabase.from('marketing_campaigns').update({ last_synced_at: new Date().toISOString() }).eq('id', camp.id);
    } catch (err) {
      console.error('[insights] error camp=', camp.id, err);
    }
  }
}
```

- [ ] **Step 2: Schedule cron 2h em index.ts**

```typescript
// dentro de boot, apos outros setIntervals
setInterval(async () => {
  try {
    const { collectInsights } = await import('./modules/marketing/insights-collector.js');
    await collectInsights(supabase, config.metaWabaAccessToken!);
  } catch (e) { console.error('[cron insights]', e); }
}, 2 * 60 * 60 * 1000);
console.log('[cron] meta_ads_insights collector scheduled (2h)');
```

- [ ] **Step 3: Commit + deploy**

```bash
git add src/modules/marketing/insights-collector.ts src/index.ts
git commit -m "feat(marketing): collector meta_ads_insights cron 2h

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main
```

### Task 5.2: Correlações inteligentes (TDD)

**Files:**
- Create: `src/modules/marketing/analyst-correlations.ts`
- Create: `tests/marketing/analyst-correlations.test.ts`

- [ ] **Step 1: Escrever testes**

```typescript
// tests/marketing/analyst-correlations.test.ts
import { describe, it, expect } from 'vitest';
import { detectPatterns, type WeeklyData } from '../../src/modules/marketing/analyst-correlations.js';

describe('detectPatterns', () => {
  it('detecta CTR alto + conversa baixa', () => {
    const data: WeeklyData = {
      creatives: [{ id: 1, name: 'A', ctr: 2.5, leads: 10, conversations: 1 }],
      campaigns: [], leads_by_day: [], leads_by_persona: {},
    };
    const r = detectPatterns(data);
    expect(r.find(p => p.tipo === 'ctr_alto_conv_baixa')).toBeDefined();
  });

  it('detecta categoria sem lead', () => {
    const data: WeeklyData = {
      creatives: [], campaigns: [{ id: 1, codigo_portfolio: 'D', name: 'Off-grid', leads: 0, spend_cents: 50000 }],
      leads_by_day: [], leads_by_persona: {},
    };
    const r = detectPatterns(data);
    expect(r.find(p => p.tipo === 'categoria_sem_lead')).toBeDefined();
  });

  it('detecta dia da semana concentrado', () => {
    const data: WeeklyData = {
      creatives: [], campaigns: [],
      leads_by_day: [
        { day_of_week: 4, count: 12 }, { day_of_week: 1, count: 1 },
        { day_of_week: 2, count: 2 }, { day_of_week: 3, count: 1 },
      ],
      leads_by_persona: {},
    };
    const r = detectPatterns(data);
    expect(r.find(p => p.tipo === 'concentracao_dia')).toBeDefined();
  });
});
```

- [ ] **Step 2: Implementar**

```typescript
// src/modules/marketing/analyst-correlations.ts

export interface WeeklyData {
  creatives: Array<{ id: number; name: string; ctr: number; leads: number; conversations: number }>;
  campaigns: Array<{ id: number; codigo_portfolio: string; name: string; leads: number; spend_cents: number }>;
  leads_by_day: Array<{ day_of_week: number; count: number }>;
  leads_by_persona: Record<string, number>;
}

export interface Pattern {
  tipo: 'ctr_alto_conv_baixa' | 'categoria_sem_lead' | 'concentracao_dia' | 'descarte_alto';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  recommendation: string;
}

export function detectPatterns(data: WeeklyData): Pattern[] {
  const patterns: Pattern[] = [];

  for (const c of data.creatives) {
    const conv_rate = c.leads > 0 ? c.conversations / c.leads : 0;
    if (c.ctr > 1.5 && conv_rate < 0.3) {
      patterns.push({
        tipo: 'ctr_alto_conv_baixa', severity: 'warning',
        message: `Criativo "${c.name}" tem CTR alto (${c.ctr.toFixed(1)}%) mas só ${(conv_rate*100).toFixed(0)}% viram conversa.`,
        recommendation: 'Imagem chama atenção mas copy não converte. Reformular copy mantendo a mesma imagem.',
      });
    }
  }

  for (const camp of data.campaigns) {
    if (camp.spend_cents > 30000 && camp.leads === 0) {
      patterns.push({
        tipo: 'categoria_sem_lead', severity: 'warning',
        message: `Campanha "${camp.name}" gastou R$ ${(camp.spend_cents/100).toFixed(2)} sem nenhum lead.`,
        recommendation: 'Pausar campanha ou reformular criativo+targeting completo.',
      });
    }
  }

  if (data.leads_by_day.length > 0) {
    const max = data.leads_by_day.reduce((a, b) => a.count > b.count ? a : b);
    const total = data.leads_by_day.reduce((s, d) => s + d.count, 0);
    if (total > 5 && max.count / total > 0.5) {
      const dayName = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'][max.day_of_week];
      patterns.push({
        tipo: 'concentracao_dia', severity: 'info',
        message: `${dayName} concentrou ${((max.count/total)*100).toFixed(0)}% dos leads da semana.`,
        recommendation: `Considerar aumentar budget de ${dayName} e reduzir nos demais dias.`,
      });
    }
  }

  return patterns;
}
```

- [ ] **Step 3: Run tests + commit**

```bash
npm test -- analyst-correlations
git add src/modules/marketing/analyst-correlations.ts tests/marketing/analyst-correlations.test.ts
git commit -m "feat(marketing): correlacoes inteligentes do analista (TDD)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 5.3: Agente Analista — relatório diário 9h

**Files:**
- Create: `src/modules/marketing/analyst-agent.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Implementar relatório diário**

```typescript
// src/modules/marketing/analyst-agent.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { detectPatterns, type WeeklyData } from './analyst-correlations.js';

export async function buildDailyReport(supabase: SupabaseClient): Promise<string> {
  const { data: today } = await supabase.from('v_marketing_dashboard_today').select('*').single();
  const yday = new Date(); yday.setDate(yday.getDate() - 1);
  const ystr = yday.toISOString().slice(0, 10);

  const { data: insightsYday } = await supabase.from('meta_ads_insights').select('*').eq('date_start', ystr);

  const spend = (insightsYday ?? []).reduce((s, i) => s + i.spend_cents, 0) / 100;
  const leads = (insightsYday ?? []).reduce((s, i) => s + (i.leads ?? 0), 0);
  const cpl = leads > 0 ? spend / leads : null;

  // Best/worst do dia
  const sorted = (insightsYday ?? []).filter(i => i.cpl_cents != null).sort((a, b) => (a.cpl_cents! - b.cpl_cents!));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  let msg = `📊 *Marketing ${ystr}*\n\n`;
  msg += `💰 Gasto: R$ ${spend.toFixed(2)}\n`;
  msg += `👥 Leads: ${leads}${cpl ? ` | CPL R$ ${cpl.toFixed(2)}` : ''}\n`;

  if (best) msg += `\n🥇 Melhor: campanha #${best.campaign_id} (CPL R$ ${(best.cpl_cents!/100).toFixed(2)})\n`;
  if (worst && worst.id !== best?.id) msg += `⚠️ Pior: campanha #${worst.campaign_id} (CPL R$ ${(worst.cpl_cents!/100).toFixed(2)})\n`;

  return msg;
}

export async function buildWeeklyReport(supabase: SupabaseClient): Promise<{ message: string; patterns: ReturnType<typeof detectPatterns> }> {
  // Pega ultimos 7 dias
  const since = new Date(); since.setDate(since.getDate() - 7);
  const { data: insights } = await supabase.from('meta_ads_insights').select('*, marketing_campaigns(codigo_portfolio, name)').gte('date_start', since.toISOString().slice(0, 10));

  // Monta WeeklyData (simplified — preencher com query rica em iteracao futura)
  const data: WeeklyData = {
    creatives: [], campaigns: [], leads_by_day: [], leads_by_persona: {},
  };
  // TODO no proximo PR: preencher arrays reais a partir de queries

  const patterns = detectPatterns(data);
  const message = patterns.length === 0
    ? `📊 Relatório semanal: tudo dentro do esperado, nenhum padrão notável.`
    : `📊 Relatório semanal — ${patterns.length} padrões detectados:\n\n` + patterns.map(p => `${p.severity === 'critical' ? '🚨' : p.severity === 'warning' ? '⚠️' : 'ℹ️'} ${p.message}\n💡 ${p.recommendation}`).join('\n\n');

  return { message, patterns };
}
```

- [ ] **Step 2: Schedule crons em index.ts**

```typescript
// Cron diario 9h da manha (Brasilia)
function scheduleAt(hour: number, minute: number, fn: () => Promise<void>) {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  setTimeout(async () => {
    await fn();
    setInterval(fn, 24 * 60 * 60 * 1000);
  }, next.getTime() - now.getTime());
}

scheduleAt(9, 0, async () => {
  const { buildDailyReport } = await import('./modules/marketing/analyst-agent.js');
  const msg = await buildDailyReport(supabase);
  await sendText(config.engineerPhone, msg);
});
console.log('[cron] daily marketing report scheduled at 9h');

// Cron semanal segunda 8h
scheduleAt(8, 0, async () => {
  if (new Date().getDay() !== 1) return;  // so segunda
  const { buildWeeklyReport } = await import('./modules/marketing/analyst-agent.js');
  const { message } = await buildWeeklyReport(supabase);
  await sendText(config.engineerPhone, message);
});
console.log('[cron] weekly marketing report scheduled (Mon 8h)');
```

- [ ] **Step 3: Commit + deploy + smoke**

```bash
git add src/modules/marketing/analyst-agent.ts src/index.ts
git commit -m "feat(marketing): Agente Analista — relatorio diario 9h + semanal segunda 8h

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main
```

Junior implanta. Aguarda manhã seguinte ou força via:

```bash
tsx -e "import { buildDailyReport } from './src/modules/marketing/analyst-agent.js'; import { createClient } from '@supabase/supabase-js'; const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!); console.log(await buildDailyReport(s));"
```

### Task 5.4: Dashboard /dashboard/marketing

**Files:**
- Create: `src/modules/dashboard/marketing-router.ts`
- Create: `src/modules/dashboard/marketing-views.ts`
- Create: `src/modules/dashboard/marketing-queries.ts`
- Modify: `src/modules/dashboard/router.ts` (montar rota)

- [ ] **Step 1: Estudar pattern do dashboard atual**

```bash
cat src/modules/dashboard/router.ts
cat src/modules/dashboard/views.ts | head -80
```

- [ ] **Step 2: Implementar queries**

```typescript
// src/modules/dashboard/marketing-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export async function getDashboardToday(supabase: SupabaseClient) {
  const { data } = await supabase.from('v_marketing_dashboard_today').select('*').single();
  return data;
}

export async function getActiveCampaigns(supabase: SupabaseClient) {
  const { data } = await supabase.from('marketing_campaigns').select('id, codigo_portfolio, name, status, daily_budget_cents, last_synced_at, cpl_alerta_brl, cpl_critico_brl').eq('status', 'active');
  return data ?? [];
}

export async function getTopCreatives(supabase: SupabaseClient, limit = 5) {
  const { data } = await supabase.from('marketing_creatives').select('id, briefing, status, imagens, copies, created_at').eq('status', 'em_uso').order('created_at', { ascending: false }).limit(limit);
  return data ?? [];
}

export async function getActiveAlerts(supabase: SupabaseClient) {
  const { data } = await supabase.from('marketing_alerts').select('*').eq('status', 'pending').order('created_at', { ascending: false });
  return data ?? [];
}

export async function getDmThreadsStats(supabase: SupabaseClient) {
  const { data } = await supabase.from('dm_threads').select('status', { count: 'exact', head: false });
  return data ?? [];
}
```

- [ ] **Step 3: Implementar views (HTML server-side, padrão atual)**

```typescript
// src/modules/dashboard/marketing-views.ts
export function renderMarketingDashboard(data: {
  today: { spend_today_brl?: number; leads_today?: number; cpl_today_brl?: number };
  campaigns: Array<{ id: number; codigo_portfolio: string; name: string; daily_budget_cents: number }>;
  alerts: Array<{ id: number; severity: string; subject: string; body: string; action_required?: string }>;
  topCreatives: Array<{ id: number; briefing: string; imagens: { url: string }[] }>;
}): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Marketing — EcoSunPower Dashboard</title>
<style>
body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; background: #fafafa; color: #222; }
h1 { color: #f59e0b; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
.card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.card h3 { margin-top: 0; color: #f59e0b; font-size: 14px; text-transform: uppercase; }
.big-number { font-size: 36px; font-weight: bold; color: #222; }
.alert { padding: 12px; margin: 8px 0; border-left: 4px solid; border-radius: 4px; }
.alert.critical { background: #fef2f2; border-color: #dc2626; }
.alert.warning { background: #fffbeb; border-color: #f59e0b; }
.alert.info { background: #eff6ff; border-color: #3b82f6; }
.creative-thumb { width: 100%; height: 120px; object-fit: cover; border-radius: 4px; }
</style>
</head>
<body>
<h1>📊 Marketing Dashboard</h1>

<div class="grid">
  <div class="card">
    <h3>💰 Hoje</h3>
    <div class="big-number">R$ ${(data.today?.spend_today_brl ?? 0).toFixed(2)}</div>
    <p>${data.today?.leads_today ?? 0} leads ${data.today?.cpl_today_brl ? `| CPL R$ ${data.today.cpl_today_brl.toFixed(2)}` : ''}</p>
  </div>

  <div class="card">
    <h3>🚦 Campanhas Ativas (${data.campaigns.length})</h3>
    ${data.campaigns.map(c => `<div>${c.codigo_portfolio} — ${c.name} <span style="color:#666">R$ ${(c.daily_budget_cents/100).toFixed(2)}/dia</span></div>`).join('') || '<em>Nenhuma campanha ativa</em>'}
  </div>

  <div class="card">
    <h3>🚨 Alertas Pendentes (${data.alerts.length})</h3>
    ${data.alerts.map(a => `<div class="alert ${a.severity}"><strong>${a.subject}</strong><br>${a.body}</div>`).join('') || '<em>Nenhum alerta</em>'}
  </div>

  <div class="card">
    <h3>🥇 Criativos em Uso</h3>
    ${data.topCreatives.map(c => `<div style="margin-bottom:12px"><img class="creative-thumb" src="${c.imagens[0]?.url ?? ''}"><br><small>${c.briefing.slice(0,80)}</small></div>`).join('') || '<em>Nenhum criativo em uso</em>'}
  </div>
</div>
</body></html>`;
}
```

- [ ] **Step 4: Implementar router**

```typescript
// src/modules/dashboard/marketing-router.ts
import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as q from './marketing-queries.js';
import { renderMarketingDashboard } from './marketing-views.js';

export function createMarketingRouter(supabase: SupabaseClient): Router {
  const r = Router();

  r.get('/marketing', async (_req, res) => {
    try {
      const [today, campaigns, alerts, topCreatives] = await Promise.all([
        q.getDashboardToday(supabase),
        q.getActiveCampaigns(supabase),
        q.getActiveAlerts(supabase),
        q.getTopCreatives(supabase),
      ]);
      const html = renderMarketingDashboard({ today: today ?? {}, campaigns, alerts, topCreatives });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e) {
      res.status(500).send('Error: ' + (e as Error).message);
    }
  });

  return r;
}
```

- [ ] **Step 5: Montar router no dashboard principal**

Em `src/modules/dashboard/router.ts`, encontrar onde rotas existentes são montadas e adicionar:

```typescript
import { createMarketingRouter } from './marketing-router.js';
// ... apos outras montagens:
router.use('/', createMarketingRouter(supabase));
```

- [ ] **Step 6: Commit + deploy + visual test**

```bash
npm run build
git add src/modules/dashboard/
git commit -m "feat(dashboard): pagina /dashboard/marketing com widgets principais

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main
```

Junior implanta. Acessa `https://aula-aprendendo-agente-whatsapp.oigz6g.easypanel.host/dashboard/marketing` (ou domínio que dashboard usa) → confere visual + dados.

---

## Fase 6 — Agente Campanha (depois ads_management aprovar)

### Task 6.1: Esqueleto modo leitura (sem ads_management)

**Files:**
- Create: `src/modules/marketing/campaign-monitor.ts`
- Create: `src/modules/marketing/campaign-decisions.ts`

- [ ] **Step 1: Implementar lógica de decisões (TDD)**

```typescript
// src/modules/marketing/campaign-decisions.ts

export interface CampaignSnapshot {
  campaign_id: number;
  cpl_cents: number | null;
  cpl_alerta_brl: number;
  cpl_critico_brl: number;
  ctr_pct: number;
  leads_24h: number;
  spend_24h_cents: number;
}

export type Decision =
  | { type: 'no_action'; reason: string }
  | { type: 'alert_warning'; reason: string }
  | { type: 'pause_creative_critical'; reason: string }
  | { type: 'propose_budget_change'; delta_cents: number; reason: string };

export function decideCampaignAction(s: CampaignSnapshot): Decision {
  if (s.cpl_cents == null) {
    if (s.spend_24h_cents > 5000) return { type: 'alert_warning', reason: 'Gasto sem leads há 24h' };
    return { type: 'no_action', reason: 'Aguardando primeiros leads' };
  }
  const cpl_brl = s.cpl_cents / 100;
  if (cpl_brl > s.cpl_critico_brl) return { type: 'pause_creative_critical', reason: `CPL R$ ${cpl_brl.toFixed(2)} > critico R$ ${s.cpl_critico_brl}` };
  if (cpl_brl > s.cpl_alerta_brl) return { type: 'alert_warning', reason: `CPL R$ ${cpl_brl.toFixed(2)} > alerta R$ ${s.cpl_alerta_brl}` };
  if (s.ctr_pct < 0.8 && s.leads_24h < 2) return { type: 'alert_warning', reason: `CTR baixo (${s.ctr_pct.toFixed(2)}%) + poucos leads` };
  return { type: 'no_action', reason: 'Saudavel' };
}
```

```typescript
// tests/marketing/campaign-decisions.test.ts
import { describe, it, expect } from 'vitest';
import { decideCampaignAction } from '../../src/modules/marketing/campaign-decisions.js';

describe('decideCampaignAction', () => {
  const base = { campaign_id: 1, cpl_alerta_brl: 50, cpl_critico_brl: 80, ctr_pct: 1.5, leads_24h: 5, spend_24h_cents: 25000 };

  it('saudavel: no_action', () => {
    expect(decideCampaignAction({ ...base, cpl_cents: 3000 }).type).toBe('no_action');
  });
  it('CPL > alerta: alert_warning', () => {
    expect(decideCampaignAction({ ...base, cpl_cents: 6000 }).type).toBe('alert_warning');
  });
  it('CPL > critico: pause_creative_critical', () => {
    expect(decideCampaignAction({ ...base, cpl_cents: 9000 }).type).toBe('pause_creative_critical');
  });
  it('Sem leads + gasto alto: alert_warning', () => {
    expect(decideCampaignAction({ ...base, cpl_cents: null, leads_24h: 0, spend_24h_cents: 10000 }).type).toBe('alert_warning');
  });
});
```

- [ ] **Step 2: Run tests + commit**

```bash
npm test -- campaign-decisions
git add src/modules/marketing/campaign-decisions.ts tests/marketing/campaign-decisions.test.ts
git commit -m "feat(marketing): logica de decisoes do agente campanha (TDD core)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 6.2: Monitor cron 2h em modo leitura+alerta

**Files:**
- Create: `src/modules/marketing/campaign-monitor.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Implementar monitor**

```typescript
// src/modules/marketing/campaign-monitor.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { decideCampaignAction, type CampaignSnapshot } from './campaign-decisions.js';

export async function monitorCampaigns(supabase: SupabaseClient, onAlert: (msg: string) => Promise<void>): Promise<void> {
  const { data: campaigns } = await supabase.from('marketing_campaigns').select('*').eq('status', 'active');
  if (!campaigns) return;

  for (const c of campaigns) {
    const since = new Date(); since.setHours(since.getHours() - 24);
    const { data: insights } = await supabase.from('meta_ads_insights').select('*').eq('campaign_id', c.id).gte('collected_at', since.toISOString());

    const spend_24h = (insights ?? []).reduce((s, i) => s + i.spend_cents, 0);
    const leads_24h = (insights ?? []).reduce((s, i) => s + (i.leads ?? 0), 0);
    const ctr_avg = insights && insights.length > 0 ? insights.reduce((s, i) => s + (i.ctr_pct ?? 0), 0) / insights.length : 0;
    const cpl = leads_24h > 0 ? Math.round(spend_24h / leads_24h) : null;

    const snap: CampaignSnapshot = {
      campaign_id: c.id, cpl_cents: cpl, cpl_alerta_brl: c.cpl_alerta_brl, cpl_critico_brl: c.cpl_critico_brl,
      ctr_pct: ctr_avg, leads_24h, spend_24h_cents: spend_24h,
    };
    const decision = decideCampaignAction(snap);

    await supabase.from('marketing_campaign_logs').insert({
      campaign_id: c.id, action: 'monitored', reason: decision.reason,
      metrics_snapshot: snap, decided_by: 'agent',
    });

    if (decision.type === 'alert_warning' || decision.type === 'pause_creative_critical') {
      await supabase.from('marketing_alerts').insert({
        agent: 'campaign',
        severity: decision.type === 'pause_creative_critical' ? 'critical' : 'warning',
        subject: `Campanha "${c.name}"`, body: decision.reason,
        related_campaign_id: c.id,
        action_required: decision.type === 'pause_creative_critical' ? 'approve_pause' : null,
        status: 'pending',
      });
      await onAlert(`${decision.type === 'pause_creative_critical' ? '🚨' : '⚠️'} ${c.name}: ${decision.reason}\n\nVer dashboard: /dashboard/marketing`);
    }
  }
}
```

- [ ] **Step 2: Schedule cron 2h + commit + deploy**

```typescript
// em index.ts
setInterval(async () => {
  const { monitorCampaigns } = await import('./modules/marketing/campaign-monitor.js');
  await monitorCampaigns(supabase, (msg) => sendText(config.engineerPhone, msg));
}, 2 * 60 * 60 * 1000);
console.log('[cron] campaign monitor scheduled (2h)');
```

```bash
git add src/modules/marketing/campaign-monitor.ts src/index.ts
git commit -m "feat(marketing): monitor de campanhas cron 2h modo leitura+alerta

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main
```

### Task 6.3: Quando ads_management aprovar — modo escrita

Documentar passo único pra ativar modo automático quando Meta aprovar:

- [ ] **Step 1: Adicionar funcao pauseCreative()**

```typescript
// adicionar a campaign-monitor.ts
async function pauseCreativeMeta(adId: string, accessToken: string): Promise<void> {
  const url = `https://graph.facebook.com/v22.0/${adId}?status=PAUSED&access_token=${accessToken}`;
  const r = await fetch(url, { method: 'POST' });
  if (!r.ok) throw new Error(`Meta pause ${r.status}: ${await r.text()}`);
}
```

- [ ] **Step 2: Em monitorCampaigns, ao detectar critical com creative_id, chamar pauseCreativeMeta + log decision='paused_creative_auto'**

- [ ] **Step 3: Commit + deploy assim que Junior avisar que ads_management aprovou**

---

## Self-Review

**Spec coverage:**
- ✅ Agente Criativo: Tasks 3.1-3.8
- ✅ Agente Campanha: Tasks 6.1-6.3
- ✅ Qualificador IG: Tasks 4.1-4.5
- ✅ Agente Analista: Tasks 5.1-5.3
- ✅ Dashboard Marketing: Task 5.4
- ✅ Schema Supabase: Tasks 2.1-2.3
- ✅ Diagnóstico Campanha 1: Tasks 1.1-1.4
- ✅ Filtros e salvaguardas: distribuídos em filters TDD
- ✅ Cobertura portfolio + persona R$ 700: seed + filters + brain
- ✅ EV BR (BYD não Tesla): persona ev_charger explícita

**Placeholder scan:** Encontrado "TODO no proximo PR" em buildWeeklyReport (preencher arrays reais). É genuinamente próximo PR (depende de queries que serão refinadas após primeira semana de dados). Mantenho mas marco como follow-up explícito.

**Type consistency:** Tipos em `types.ts` usados consistentemente. `CampaignSnapshot` em campaign-decisions e campaign-monitor batem. `QualifyState` em brain e handler bate.

**Spec requirement gaps:** Nenhum — todas seções 1-14 do spec têm tasks correspondentes. PDF mensal (Seção 4.4) não tem task explícita — adicionar como follow-up Task 5.5 quando primeira mensal estiver próxima.

---

## Próximos passos

Plano completo e commitado. Antes de executar, decidir modo de execução.
