# CRM Fase 2 — Funil Comercial Automatizado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a tela de leads num funil que anda sozinho: etapas avançam por evento, timeline e tarefas automáticas, SLA com aviso da Eva no WhatsApp, e cockpit do lead — tudo respeitando claim/permissões/auditoria/multi-tenant da Fase 1.

**Architecture:** Evoluir no lugar (Express server-rendered + Tailwind/JS leve via CDN, Supabase, Claude). Módulos novos pequenos e puros (`pipeline.ts`, `sla-rules.ts`) testados sem rede; camada de dados (`atividades.ts`, `tarefas.ts`) sobre o `supabaseService` existente; hooks aditivos nos fluxos atuais (save de proposta, scheduler, `/fechar`) que NÃO mudam a Eva de atendimento; aviso ao Junior reusa o padrão `proactive-alerts` + `eva-admin-buttons`.

**Tech Stack:** TypeScript (ESM, imports com `.js`), vitest, Supabase/Postgres (migrations SQL numeradas), Tailwind CDN, SortableJS CDN (kanban), Meta WABA (já configurado).

**Spec:** `docs/superpowers/specs/2026-06-24-fase2-crm-comercial-design.md`

**Pré-condições já existentes (confirmadas no código):**
- `propostas_publicas.lead_id` JÁ existe e é preenchido por `supabase.ts savePropostaPublica` (724+). Não recriar.
- Permissões: `dashboard/permissions.ts` (`can(user,area,nivel)`, `AREAS`, `NIVEIS`); rota usa `exigir(area,nivel)` em `dashboard/router.ts`.
- Claim/visibilidade: `dashboard/leads-queries.ts` (`podeVerLead`, `claimLead`, `STATUS_OPTIONS`).
- Render: `dashboard/leads-views.ts` (`renderLeadsListPage`, `renderLeadDetailPage`, `statusBadge`, `timeAgo`); layout em `dashboard/views.ts` (`renderLayout`).
- Auditoria: helper `audit(...)` (Fase 1, migration 056 `audit_log`).
- Scheduler periódico: `src/index.ts` ~linha 1820 `setInterval(...)` (roda cadência + `runDispatchCycle` de proactive-alerts).
- Alerta Eva→Junior + botões: `src/modules/monitoring/proactive-alerts/dispatcher.ts` (`runDispatchCycle`), `src/modules/eva-admin-buttons.ts` (callbacks de botão), `sendText(from, msg)`.
- Última migration: **056**. Esta fase cria a **057**.

**Convenções do projeto (OBRIGATÓRIO seguir):**
- TDD: teste primeiro, ver falhar, código mínimo, ver passar, commit. Funções puras testadas sem rede.
- Imports relativos terminam em `.js` (ESM). `tsc --noEmit` limpo antes de cada commit.
- `git add <paths específicos>` — NUNCA `-A`/`.`.
- Após cada fatia: review 3× + tsc limpo. Deploy só no fim, com OK do Junior.
- Mensagem de commit termina com a linha `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

**Criar:**
- `src/modules/dashboard/pipeline.ts` — etapas do funil: `ORDEM_ETAPAS`, `EtapaFunil`, `proximaEtapaPorEvento()`, `etapaLabel()`, `etapaCor()`. Puro.
- `src/modules/dashboard/sla-rules.ts` — regras de SLA puras: `regrasSlaParaLead()`, `seloSla()`. Puro.
- `src/modules/dashboard/atividades.ts` — `registrarAtividade()`, `listarTimeline()`, tipos. Camada de dados.
- `src/modules/dashboard/tarefas.ts` — CRUD de tarefa + `sincronizarTarefasSla()`, `tarefasPendentes()`, `proximaTarefa()`. Camada de dados.
- `src/modules/dashboard/sla-notifier.ts` — monta msg+botões e dispara aviso da Eva (usa notify existente).
- `src/modules/dashboard/kanban-views.ts` — `renderKanbanPage()` + JS Sortable.
- Testes: `tests/dashboard-pipeline.test.ts`, `tests/dashboard-sla-rules.test.ts`, `tests/dashboard-tarefas-sla.test.ts`, `tests/dashboard-atividades.test.ts`.
- Migration: `supabase/migrations/057_crm_fase2_funil.sql`.

**Modificar:**
- `src/modules/dashboard/router.ts` — rotas `/leads/kanban`, `/leads/:id/set-etapa`, `/leads/:id/tarefa` (criar/concluir), `/leads/:id/atividade` (nota/ligação), toggle.
- `src/modules/dashboard/leads-views.ts` — blocos timeline + tarefas no cockpit; toggle Lista/Kanban.
- `src/modules/dashboard/leads-queries.ts` — `dias na etapa`, agrupamento por etapa, selo SLA por lead na lista/kanban.
- `src/modules/supabase.ts` — `savePropostaPublica` chama hook (registrar atividade + avançar etapa + criar tarefa); incrementa de acesso da proposta chama hook `proposta_aberta`.
- `src/index.ts` — no `setInterval`, chamar o motor de SLA (`sincronizarTarefasSla` + `sla-notifier`); registrar callbacks dos botões de SLA.
- `src/modules/eva-admin-buttons.ts` — handlers dos botões `[Cobrar agora] [Eu falo] [Adiar 2 dias]`.
- Hook de fechamento: ponto do `/fechar`/contrato (achar no `closing`/`financeiro/engate-fechar.ts`) → atividade `ganho` + etapa `ganho`.

---

# FATIA 1 — Fundação do funil (migration + pipeline puro)

### Task 1: Migration 057 (enum +3 etapas, tabelas de atividade e tarefa)

**Files:**
- Create: `supabase/migrations/057_crm_fase2_funil.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- 057_crm_fase2_funil.sql — CRM Fase 2: funil automatizado (timeline + tarefas/SLA)
-- Depende de: 056 (companies, dashboard_users, audit_log, leads.claimed_by/last_contact_at)

-- 1) Etapas novas no enum do funil (idempotente). Leads existentes mantêm o valor atual.
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'proposta_enviada';
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'negociacao';
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'ganho';

-- 2) Timeline do lead
CREATE TABLE IF NOT EXISTS lead_atividades (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  lead_id     uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo        text NOT NULL,
  titulo      text NOT NULL,
  descricao   text,
  automatica  boolean NOT NULL DEFAULT true,
  user_id     uuid REFERENCES dashboard_users(id) ON DELETE SET NULL,
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_atividades_lead ON lead_atividades(lead_id, created_at DESC);

-- 3) Tarefas / SLA do lead
CREATE TABLE IF NOT EXISTS lead_tarefas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  lead_id       uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  titulo        text NOT NULL,
  tipo          text NOT NULL DEFAULT 'custom',
  due_at        timestamptz,
  prioridade    text NOT NULL DEFAULT 'media',
  status        text NOT NULL DEFAULT 'pendente',
  automatica    boolean NOT NULL DEFAULT false,
  etapa_origem  text,
  assigned_to   uuid REFERENCES dashboard_users(id) ON DELETE SET NULL,
  created_by    uuid REFERENCES dashboard_users(id) ON DELETE SET NULL,
  completed_at  timestamptz,
  alert_sent_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_tarefas_lead   ON lead_tarefas(lead_id, status);
CREATE INDEX IF NOT EXISTS idx_lead_tarefas_due    ON lead_tarefas(status, due_at);
-- Idempotência de tarefa automática: 1 por (lead, tipo, etapa_origem) enquanto pendente
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_tarefa_auto
  ON lead_tarefas(lead_id, tipo, etapa_origem)
  WHERE automatica AND status = 'pendente';

-- 4) RLS (defesa em profundidade; app já filtra por company_id e o dashboard usa service-role)
ALTER TABLE lead_atividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_tarefas    ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Verificar SQL (sem aplicar)**

Confere visualmente: 3 `ADD VALUE IF NOT EXISTS`, 2 `CREATE TABLE IF NOT EXISTS`, índices, unique parcial de idempotência. A aplicação no Supabase é manual (passo de implantação, guiado pelo Junior) — NÃO aplicar agora.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/057_crm_fase2_funil.sql
git commit -m "feat(crm): migration 057 — etapas do funil + lead_atividades + lead_tarefas

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `pipeline.ts` — etapas e avanço por evento (puro)

**Files:**
- Create: `src/modules/dashboard/pipeline.ts`
- Test: `tests/dashboard-pipeline.test.ts`

- [ ] **Step 1: Escrever o teste (falhando)**

```typescript
import { describe, it, expect } from 'vitest';
import {
  ORDEM_ETAPAS,
  proximaEtapaPorEvento,
  etapaLabel,
  type EtapaFunil,
  type EventoFunil,
} from '../src/modules/dashboard/pipeline.js';

describe('pipeline — avanço por evento (só pra frente)', () => {
  it('proposta gerada move qualificado -> proposta_enviada', () => {
    expect(proximaEtapaPorEvento('qualificado', 'proposta_gerada')).toBe('proposta_enviada');
  });
  it('proposta aberta move proposta_enviada -> negociacao', () => {
    expect(proximaEtapaPorEvento('proposta_enviada', 'proposta_aberta')).toBe('negociacao');
  });
  it('fechamento move qualquer etapa ativa -> ganho', () => {
    expect(proximaEtapaPorEvento('negociacao', 'fechou')).toBe('ganho');
  });
  it('NUNCA recua: proposta_gerada quando já está em negociacao mantém negociacao', () => {
    expect(proximaEtapaPorEvento('negociacao', 'proposta_gerada')).toBe('negociacao');
  });
  it('evento sem regra mantém a etapa', () => {
    expect(proximaEtapaPorEvento('novo', 'proposta_aberta')).toBe('novo');
  });
  it('ORDEM_ETAPAS não inclui perdido (coluna terminal à parte) e tem 8 etapas ativas', () => {
    expect(ORDEM_ETAPAS).not.toContain('perdido');
    expect(ORDEM_ETAPAS.length).toBe(8);
  });
  it('etapaLabel traduz', () => {
    expect(etapaLabel('proposta_enviada')).toMatch(/proposta/i);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/dashboard-pipeline.test.ts`
Expected: FAIL ("Cannot find module .../pipeline.js").

- [ ] **Step 3: Implementar `pipeline.ts`**

```typescript
// src/modules/dashboard/pipeline.ts
// Etapas do funil comercial + avanço automático por evento. Puro (sem rede).
// Eva (atendimento) segue escrevendo novo/qualificando/qualificado/agendado/
// transferido; o SISTEMA seta proposta_enviada/negociacao/ganho via estes eventos.

export type EtapaFunil =
  | 'novo' | 'qualificando' | 'qualificado'
  | 'proposta_enviada' | 'negociacao' | 'agendado' | 'transferido' | 'ganho';

// Ordem do kanban (perdido é coluna terminal, tratada à parte).
export const ORDEM_ETAPAS: EtapaFunil[] = [
  'novo', 'qualificando', 'qualificado',
  'proposta_enviada', 'negociacao', 'agendado', 'transferido', 'ganho',
];

export type EventoFunil = 'proposta_gerada' | 'proposta_aberta' | 'agendou' | 'fechou';

// Para qual etapa cada evento empurra (sempre pra frente).
const ALVO_POR_EVENTO: Record<EventoFunil, EtapaFunil> = {
  proposta_gerada: 'proposta_enviada',
  proposta_aberta: 'negociacao',
  agendou: 'agendado',
  fechou: 'ganho',
};

function idx(e: string): number {
  const i = ORDEM_ETAPAS.indexOf(e as EtapaFunil);
  return i; // -1 quando não está na ordem (ex.: 'perdido')
}

// Retorna a nova etapa OU a mesma. Nunca recua. 'perdido' (idx -1) só avança via 'fechou'? Não:
// um lead perdido não é mexido por estes eventos automáticos -> mantém.
export function proximaEtapaPorEvento(atual: string, evento: EventoFunil): EtapaFunil | string {
  const alvo = ALVO_POR_EVENTO[evento];
  if (!alvo) return atual;
  if (atual === 'perdido') return atual; // não ressuscita lead perdido automaticamente
  return idx(alvo) > idx(atual) ? alvo : (ORDEM_ETAPAS.includes(atual as EtapaFunil) ? atual : alvo);
}

const LABEL: Record<EtapaFunil, string> = {
  novo: 'Novo', qualificando: 'Qualificando', qualificado: 'Qualificado',
  proposta_enviada: 'Proposta enviada', negociacao: 'Negociação',
  agendado: 'Agendado', transferido: 'Transferido', ganho: 'Ganho',
};
export function etapaLabel(e: string): string {
  return LABEL[e as EtapaFunil] ?? (e === 'perdido' ? 'Perdido' : e);
}

// Classe Tailwind por etapa (reusa a paleta do statusBadge atual).
const COR: Record<string, string> = {
  novo: 'bg-sky-100 text-sky-800', qualificando: 'bg-violet-100 text-violet-800',
  qualificado: 'bg-fuchsia-100 text-fuchsia-800', proposta_enviada: 'bg-blue-100 text-blue-800',
  negociacao: 'bg-amber-100 text-amber-800', agendado: 'bg-orange-100 text-orange-800',
  transferido: 'bg-emerald-100 text-emerald-800', ganho: 'bg-emerald-200 text-emerald-900',
  perdido: 'bg-rose-100 text-rose-800',
};
export function etapaCor(e: string): string {
  return COR[e] ?? 'bg-slate-100 text-slate-700';
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/dashboard-pipeline.test.ts`
Expected: PASS (7 testes). Depois `npx tsc --noEmit` → sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/pipeline.ts tests/dashboard-pipeline.test.ts
git commit -m "feat(crm): pipeline.ts — etapas do funil + avanço por evento (puro, TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# FATIA 2 — Timeline automática

### Task 3: `atividades.ts` — registrar e listar timeline

**Files:**
- Create: `src/modules/dashboard/atividades.ts`
- Test: `tests/dashboard-atividades.test.ts`

**Contexto a ler antes:** `src/modules/supabase.ts` (como `this.client` é exposto; `getClient()`), e como `leads-queries.ts` recebe o `SupabaseClient`. Seguir o MESMO estilo (funções recebem `client: SupabaseClient`).

- [ ] **Step 1: Teste (puro, do tipo/dedupe — sem rede)**

```typescript
import { describe, it, expect } from 'vitest';
import { mesmoEvento, type AtividadeInput } from '../src/modules/dashboard/atividades.js';

describe('atividades — dedupe de evento automático', () => {
  const base: AtividadeInput = { company_id: 'c', lead_id: 'l', tipo: 'proposta_aberta', titulo: 'abriu', automatica: true };
  it('mesmo tipo+lead na mesma janela = duplicado', () => {
    expect(mesmoEvento(base, { ...base }, 60_000, 30_000)).toBe(true); // 30s de diferença, janela 60s
  });
  it('fora da janela não é duplicado', () => {
    expect(mesmoEvento(base, { ...base }, 60_000, 120_000)).toBe(false);
  });
  it('tipos diferentes nunca duplicam', () => {
    expect(mesmoEvento(base, { ...base, tipo: 'nota' }, 60_000, 1_000)).toBe(false);
  });
});
```

- [ ] **Step 2: Ver falhar** — `npx vitest run tests/dashboard-atividades.test.ts` → FAIL.

- [ ] **Step 3: Implementar `atividades.ts`**

```typescript
// src/modules/dashboard/atividades.ts
// Timeline do lead: registra eventos (automáticos ou manuais) e lê a linha do tempo.
import type { SupabaseClient } from '@supabase/supabase-js';

export type AtividadeTipo =
  | 'contato' | 'whatsapp' | 'ligacao' | 'email' | 'visita'
  | 'proposta_enviada' | 'proposta_aberta' | 'etapa_mudou'
  | 'cadencia' | 'tarefa_criada' | 'tarefa_concluida' | 'nota' | 'ganho' | 'perdido';

export interface AtividadeInput {
  company_id: string;
  lead_id: string;
  tipo: AtividadeTipo;
  titulo: string;
  descricao?: string;
  automatica?: boolean;
  user_id?: string | null;
  payload?: Record<string, unknown>;
}

export interface Atividade extends AtividadeInput { id: string; created_at: string; }

// Dois eventos automáticos do mesmo tipo/lead dentro da janela (ms) = duplicado.
export function mesmoEvento(a: AtividadeInput, b: AtividadeInput, janelaMs: number, deltaMs: number): boolean {
  return a.lead_id === b.lead_id && a.tipo === b.tipo && deltaMs <= janelaMs;
}

export async function registrarAtividade(client: SupabaseClient, input: AtividadeInput): Promise<void> {
  // Dedupe: pra tipos automáticos voláteis (proposta_aberta, cadencia), evita repetir na mesma hora.
  if (input.automatica !== false && (input.tipo === 'proposta_aberta' || input.tipo === 'cadencia')) {
    const desde = new Date(Date.now() - 60 * 60_000).toISOString();
    const { data } = await client.from('lead_atividades')
      .select('id').eq('lead_id', input.lead_id).eq('tipo', input.tipo)
      .gte('created_at', desde).limit(1);
    if (Array.isArray(data) && data.length > 0) return;
  }
  await client.from('lead_atividades').insert({
    company_id: input.company_id, lead_id: input.lead_id, tipo: input.tipo,
    titulo: input.titulo, descricao: input.descricao ?? null,
    automatica: input.automatica ?? true, user_id: input.user_id ?? null,
    payload: input.payload ?? null,
  });
}

export async function listarTimeline(client: SupabaseClient, leadId: string, limite = 50): Promise<Atividade[]> {
  const { data } = await client.from('lead_atividades')
    .select('*').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(limite);
  return (data ?? []) as Atividade[];
}
```

- [ ] **Step 4: Ver passar** — `npx vitest run tests/dashboard-atividades.test.ts` → PASS. `npx tsc --noEmit` limpo.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/atividades.ts tests/dashboard-atividades.test.ts
git commit -m "feat(crm): atividades.ts — timeline do lead (registrar/listar + dedupe)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Hooks de evento (proposta enviada/aberta + etapa + fechou)

**Files:**
- Modify: `src/modules/supabase.ts` (`savePropostaPublica` ~724; incremento de acesso da proposta ~`registrarAcessoProposta`/`proposta_visualizacoes` ~915)
- Modify: ponto do fechamento (`src/modules/financeiro/engate-fechar.ts` ou `src/modules/closing/*` — localizar onde o fechamento é confirmado)

**Contexto a ler antes:** `savePropostaPublica` (já tem `leadId`), e a função que incrementa acesso da proposta pública. Reusar `this.client` e `this.companyIdPadrao` (ou a constante `'00000000-0000-0000-0000-000000000001'`).

- [ ] **Step 1: Hook na geração da proposta**

No fim de `savePropostaPublica`, depois do insert com sucesso e quando `leadId` existe, chamar (best-effort, try/catch que só loga):
```typescript
// hook funil: proposta enviada -> atividade + avança etapa + tarefa de cobrança (Task 8)
if (leadId) {
  try { await this.onPropostaEnviada(leadId, input.numeroProposta, data.id); }
  catch (e) { console.warn('[funil] onPropostaEnviada falhou:', (e as Error).message); }
}
```
Implementar `onPropostaEnviada(leadId, numero, propostaId)` em `supabase.ts`: registra atividade `proposta_enviada`, lê `leads.status`, calcula `proximaEtapaPorEvento(status,'proposta_gerada')`, e se mudou faz `update leads.status` + atividade `etapa_mudou`. (A criação da tarefa de cobrança entra na Task 8 — deixar um TODO marcado com referência à Task 8 e implementá-la lá.)

- [ ] **Step 2: Hook no acesso da proposta** — na função que incrementa `acessos`/grava `proposta_visualizacoes`, após gravar, se a proposta tem `lead_id`, chamar `onPropostaAberta(leadId)`: atividade `proposta_aberta` (dedupe cuida do spam) + `proximaEtapaPorEvento(status,'proposta_aberta')`.

- [ ] **Step 3: Hook no fechamento** — no ponto onde o fechamento é confirmado, chamar `onLeadGanho(leadId)`: atividade `ganho` + etapa `ganho`.

- [ ] **Step 4: Smoke manual (sem teste automático de rede)** — descrever no commit como validar: gerar proposta de teste → conferir `lead_atividades` e `leads.status='proposta_enviada'`. (Teste automatizado real fica no smoke pós-deploy.)

- [ ] **Step 5: tsc + Commit**

```bash
npx tsc --noEmit
git add src/modules/supabase.ts src/modules/financeiro/engate-fechar.ts
git commit -m "feat(crm): hooks de funil (proposta enviada/aberta, fechou) -> atividade + avança etapa

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Bloco Timeline no cockpit do lead

**Files:**
- Modify: `src/modules/dashboard/leads-views.ts` (`renderLeadDetailPage`)
- Modify: `src/modules/dashboard/leads-queries.ts` (`getLeadDetail` passa a trazer a timeline via `listarTimeline`)

**Contexto a ler antes:** como `renderLeadDetailPage` monta os blocos (conversa/cadência/anexos) e como `getLeadDetail` busca dados — seguir o mesmo padrão.

- [ ] **Step 1:** Em `getLeadDetail`, após buscar o lead, chamar `listarTimeline(client, id)` e anexar `timeline` ao objeto retornado (estender o tipo `LeadDetail`).

- [ ] **Step 2:** Em `renderLeadDetailPage`, adicionar bloco "Linha do tempo" antes do bloco de conversa: lista de atividades com ícone por `tipo` (mapa `tipo→emoji`), `titulo`, autor (Eva/sistema/vendedor por `automatica`/`user_id`) e `timeAgo(created_at)`. Sem JS novo (server-rendered).

- [ ] **Step 3: tsc + smoke visual** (abrir um lead com proposta no dashboard local, ver a timeline). Commit.

```bash
git add src/modules/dashboard/leads-views.ts src/modules/dashboard/leads-queries.ts
git commit -m "feat(crm): bloco timeline no cockpit do lead

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# FATIA 3 — Tarefas + SLA

### Task 6: `sla-rules.ts` — regras de SLA e selo (puro)

**Files:**
- Create: `src/modules/dashboard/sla-rules.ts`
- Test: `tests/dashboard-sla-rules.test.ts`

- [ ] **Step 1: Teste**

```typescript
import { describe, it, expect } from 'vitest';
import { regrasSlaParaLead, seloSla, type LeadSlaInput } from '../src/modules/dashboard/sla-rules.js';

const agora = Date.parse('2026-06-24T12:00:00Z');

describe('regrasSlaParaLead — qual tarefa criar', () => {
  it('novo sem contato gera tarefa ligar +24h do last_contact_at', () => {
    const lead: LeadSlaInput = { status: 'novo', last_contact_at: '2026-06-24T00:00:00Z', agendado_para: null };
    const regras = regrasSlaParaLead(lead, agora);
    const ligar = regras.find(r => r.tipo === 'ligar');
    expect(ligar).toBeTruthy();
    expect(Date.parse(ligar!.due_at)).toBe(Date.parse('2026-06-25T00:00:00Z'));
  });
  it('proposta_enviada gera cobrar_proposta +3 dias', () => {
    const lead: LeadSlaInput = { status: 'proposta_enviada', last_contact_at: '2026-06-24T00:00:00Z', agendado_para: null };
    const r = regrasSlaParaLead(lead, agora).find(x => x.tipo === 'cobrar_proposta');
    expect(r).toBeTruthy();
    expect(Date.parse(r!.due_at)).toBe(Date.parse('2026-06-27T00:00:00Z'));
  });
  it('ganho/perdido não geram tarefa', () => {
    expect(regrasSlaParaLead({ status: 'ganho', last_contact_at: null, agendado_para: null }, agora)).toEqual([]);
    expect(regrasSlaParaLead({ status: 'perdido', last_contact_at: null, agendado_para: null }, agora)).toEqual([]);
  });
});

describe('seloSla — cor pelo vencimento', () => {
  it('sem tarefa vencida = verde', () => expect(seloSla([], agora)).toBe('verde'));
  it('vence em <12h = ambar', () => expect(seloSla([{ due_at: '2026-06-24T18:00:00Z', status: 'pendente' }], agora)).toBe('ambar'));
  it('vencida = vermelho', () => expect(seloSla([{ due_at: '2026-06-24T06:00:00Z', status: 'pendente' }], agora)).toBe('vermelho'));
});
```

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: Implementar `sla-rules.ts`**

```typescript
// src/modules/dashboard/sla-rules.ts
// Regras de SLA do funil (v1 fixas no código; configuráveis numa fase futura). Puras.
export type TarefaTipo = 'ligar' | 'cobrar_proposta' | 'confirmar_visita' | 'follow_up' | 'custom';

export interface LeadSlaInput {
  status: string;
  last_contact_at: string | null;
  agendado_para: string | null; // data/hora da visita (se houver)
}
export interface RegraSla { tipo: TarefaTipo; titulo: string; due_at: string; prioridade: 'baixa'|'media'|'alta'; }

const H = 3600_000, D = 24 * 3600_000;
const ATIVAS_PARA_FOLLOWUP = ['novo','qualificando','qualificado','proposta_enviada','negociacao','agendado','transferido'];

export function regrasSlaParaLead(lead: LeadSlaInput, agora: number): RegraSla[] {
  if (lead.status === 'ganho' || lead.status === 'perdido') return [];
  const out: RegraSla[] = [];
  const base = lead.last_contact_at ? Date.parse(lead.last_contact_at) : agora;

  if (lead.status === 'novo' || lead.status === 'qualificando') {
    out.push({ tipo: 'ligar', titulo: 'Ligar pro lead (primeiro contato)', due_at: new Date(base + 24 * H).toISOString(), prioridade: 'alta' });
  }
  if (lead.status === 'proposta_enviada') {
    out.push({ tipo: 'cobrar_proposta', titulo: 'Cobrar retorno da proposta', due_at: new Date(base + 3 * D).toISOString(), prioridade: 'alta' });
  }
  if (lead.status === 'agendado' && lead.agendado_para) {
    out.push({ tipo: 'confirmar_visita', titulo: 'Confirmar a visita', due_at: new Date(Date.parse(lead.agendado_para) - 24 * H).toISOString(), prioridade: 'media' });
  }
  if (ATIVAS_PARA_FOLLOWUP.includes(lead.status)) {
    out.push({ tipo: 'follow_up', titulo: 'Dar andamento (sem atualização)', due_at: new Date(base + 48 * H).toISOString(), prioridade: 'media' });
  }
  return out;
}

export function seloSla(tarefas: Array<{ due_at: string | null; status: string }>, agora: number): 'verde'|'ambar'|'vermelho' {
  const pend = tarefas.filter(t => t.status === 'pendente' && t.due_at);
  if (pend.some(t => Date.parse(t.due_at!) < agora)) return 'vermelho';
  if (pend.some(t => Date.parse(t.due_at!) - agora < 12 * H)) return 'ambar';
  return 'verde';
}
```

- [ ] **Step 4: Ver passar + tsc.** **Step 5: Commit** (`git add src/modules/dashboard/sla-rules.ts tests/dashboard-sla-rules.test.ts`).

---

### Task 7: `tarefas.ts` — CRUD + sincronização idempotente das tarefas de SLA

**Files:**
- Create: `src/modules/dashboard/tarefas.ts`
- Test: `tests/dashboard-tarefas-sla.test.ts`

- [ ] **Step 1: Teste da lógica de diff (puro): quais tarefas FALTAM criar**

```typescript
import { describe, it, expect } from 'vitest';
import { tarefasFaltantes } from '../src/modules/dashboard/tarefas.js';

describe('tarefasFaltantes — idempotência por (tipo, etapa)', () => {
  const etapa = 'proposta_enviada';
  const regras = [{ tipo: 'cobrar_proposta', titulo: 'x', due_at: '2026-06-27T00:00:00Z', prioridade: 'alta' as const }];
  it('cria quando não existe pendente do mesmo tipo+etapa', () => {
    expect(tarefasFaltantes(regras, [], etapa).map(t => t.tipo)).toEqual(['cobrar_proposta']);
  });
  it('NÃO duplica quando já há pendente do mesmo tipo+etapa', () => {
    const existentes = [{ tipo: 'cobrar_proposta', etapa_origem: etapa, status: 'pendente' }];
    expect(tarefasFaltantes(regras, existentes, etapa)).toEqual([]);
  });
  it('recria se a anterior foi concluída (não está mais pendente)', () => {
    const existentes = [{ tipo: 'cobrar_proposta', etapa_origem: etapa, status: 'concluida' }];
    expect(tarefasFaltantes(regras, existentes, etapa).length).toBe(1);
  });
});
```

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: Implementar `tarefas.ts`** — `tarefasFaltantes(regras, existentesPendentes, etapa)` puro (filtra regras cuja `tipo`+`etapa_origem` já têm pendente); + funções de dados `sincronizarTarefasSla(client, lead)`, `tarefasPendentes(client, leadId)`, `proximaTarefa(client, leadId)`, `criarTarefa(client, input)`, `concluirTarefa(client, id, userId)`, `cancelarTarefa`, `adiarTarefa(client, id, dias)`. A `sincronizarTarefasSla` lê pendentes + chama `regrasSlaParaLead` + `tarefasFaltantes` + insere as faltantes (respeitando o unique parcial da migration).

- [ ] **Step 4: Ver passar + tsc.** **Step 5: Commit.**

---

### Task 8: Tarefa de cobrança no hook de proposta + motor de SLA no scheduler

**Files:**
- Modify: `src/modules/supabase.ts` (`onPropostaEnviada` cria a tarefa `cobrar_proposta` — completa o TODO da Task 4)
- Modify: `src/index.ts` (`setInterval` ~1820: chamar o ciclo de SLA)

**Contexto a ler antes:** `src/index.ts` ~1820 — como o `setInterval` chama `runDispatchCycle`/cadência. Adicionar uma chamada `runSlaCycle(...)` no mesmo intervalo (ou num intervalo próprio maior, ex.: a cada 15 min), best-effort com try/catch.

- [ ] **Step 1:** Completar `onPropostaEnviada` criando a tarefa `cobrar_proposta` via `criarTarefa` (assigned_to = `claimed_by` do lead).
- [ ] **Step 2:** Criar `runSlaCycle(client)` (em `tarefas.ts` ou `sla-notifier.ts`): busca leads ativos (status ∈ ativas), chama `sincronizarTarefasSla` em cada (idempotente). Marca nada além de criar tarefas faltantes.
- [ ] **Step 3:** Plugar `runSlaCycle` no `setInterval` do `index.ts` (best-effort).
- [ ] **Step 4: tsc + smoke** (rodar local, ver tarefas criadas). **Step 5: Commit.**

---

### Task 9: Bloco Tarefas no cockpit + painel "Precisam de atenção"

**Files:**
- Modify: `src/modules/dashboard/leads-views.ts` (bloco tarefas no detalhe)
- Modify: `src/modules/dashboard/router.ts` (`POST /leads/:id/tarefa`, `POST /leads/:id/tarefa/:tid/concluir`, `POST /leads/:id/atividade`)
- Modify: `src/modules/dashboard/leads-queries.ts` (selo SLA + próxima tarefa por lead na lista) e a página de leads ganha um aviso/atalho "Precisam de atenção" (filtro `?atencao=1` = leads com tarefa vencida)

- [ ] **Step 1:** Rotas: criar tarefa manual, concluir tarefa, registrar nota/ligação (todas `exigir('leads','editar')`, gravam atividade + audit; nota/ligação atualizam `last_contact_at`).
- [ ] **Step 2:** Bloco "Tarefas" no cockpit: pendentes (com prazo + selo) e concluídas; botões concluir/adiar. Bloco "Ações rápidas" ganha "Nova tarefa" e "Registrar ligação/nota".
- [ ] **Step 3:** Selo SLA na lista de leads (coluna) + filtro `?atencao=1` (leads com tarefa pendente vencida) com badge de contagem no topo.
- [ ] **Step 4: tsc + smoke.** **Step 5: Commit.**

---

# FATIA 4 — Eva avisa no WhatsApp

### Task 10: `sla-notifier.ts` — monta msg + botões e dispara aviso

**Files:**
- Create: `src/modules/dashboard/sla-notifier.ts`
- Modify: `src/index.ts` (ciclo de SLA dispara o aviso pras tarefas vencidas sem `alert_sent_at`)

**Contexto a ler antes:** `src/modules/monitoring/proactive-alerts/dispatcher.ts` (`runDispatchCycle`) e `format.ts` — COMO uma mensagem com botões interativos é montada e enviada pro Junior; reusar a MESMA função de envio (não criar canal novo). Ver `eva-admin-buttons.ts` pra o formato dos `button id`.

- [ ] **Step 1:** `montarAvisoSla(lead, tarefa)` (puro, testável) → `{ texto, botoes: [{id,title}] }` com ids `sla_cobrar:<tarefaId>`, `sla_eufalo:<tarefaId>`, `sla_adiar:<tarefaId>`. Teste do texto/ids.
- [ ] **Step 2:** `notificarSlaVencidos(client, enviar)` — busca tarefas `pendente && due_at<agora && alert_sent_at IS NULL`, monta o aviso, chama `enviar(...)` (injeção da função de envio existente), grava `alert_sent_at`. Anti-spam: no máx. 1 aviso por tarefa; resumo 1×/dia por lead.
- [ ] **Step 3:** Plugar no ciclo de SLA do `index.ts` passando a função de envio real. Respeitar `DRY_RUN` se o projeto usar (ver proactive-alerts).
- [ ] **Step 4: tsc + teste do montarAviso.** **Step 5: Commit.**

---

### Task 11: Callbacks dos botões `[Cobrar agora] [Eu falo] [Adiar 2 dias]`

**Files:**
- Modify: `src/modules/eva-admin-buttons.ts` (ou onde os `button_reply` do Junior são roteados)

**Contexto a ler antes:** como `eva-admin-buttons.ts` roteia o `id` do botão pra um handler.

- [ ] **Step 1:** Handler `sla_cobrar:<tid>` → dispara um toque de cobrança (reusa cadência/mensagem) + marca a tarefa concluída + atividade.
- [ ] **Step 2:** `sla_eufalo:<tid>` → atribui ao Junior (`assigned_to`), silencia (mantém `alert_sent_at`), atividade.
- [ ] **Step 3:** `sla_adiar:<tid>` → `adiarTarefa(client, tid, 2)` + zera `alert_sent_at` (volta a cobrar depois) + atividade.
- [ ] **Step 4: tsc + smoke** (simular clique). **Step 5: Commit.**

---

# FATIA 5 — Kanban

### Task 12: `kanban-views.ts` — render do kanban + drag-drop

**Files:**
- Create: `src/modules/dashboard/kanban-views.ts`
- Modify: `src/modules/dashboard/router.ts` (`GET /leads/kanban`, `POST /leads/:id/set-etapa`)
- Modify: `src/modules/dashboard/leads-queries.ts` (`leadsAgrupadosPorEtapa(client, user)` respeitando claim)
- Modify: `src/modules/dashboard/leads-views.ts` (toggle "Lista | Kanban")

**Contexto a ler antes:** como `cockpit-views.ts` injeta JS via `<script type="application/json">` + `<script>` inline e usa CDN (padrão pra SortableJS).

- [ ] **Step 1:** `leadsAgrupadosPorEtapa(client, user)` — busca leads visíveis (claim/permissão), agrupa por `status` nas colunas de `ORDEM_ETAPAS`, traz por card: nome, telefone, `dias na etapa`, selo SLA, próxima tarefa. Teste puro do agrupamento (dado um array de leads, retorna `Record<etapa, card[]>` na ordem certa, sem `perdido`).
- [ ] **Step 2:** `renderKanbanPage(grupos, user)` — colunas (Tailwind, scroll horizontal), cards arrastáveis, SortableJS via CDN; `onEnd` → `fetch POST /leads/:id/set-etapa {etapa}`.
- [ ] **Step 3:** Rota `GET /leads/kanban` (`exigir('leads','visualizar')`) + `POST /leads/:id/set-etapa` (`exigir('leads','editar')`: valida etapa ∈ ORDEM_ETAPAS, `update leads.status`, atividade `etapa_mudou` manual, audit). Toggle Lista/Kanban no topo da lista.
- [ ] **Step 4: tsc + smoke** (arrastar card, ver status mudar + atividade). **Step 5: Commit.**

---

## Fechamento da fase

- [ ] **Review 3×** (code-reviewer) sobre o diff `main..feat/crm-fase2`, corrigindo achados (padrão do projeto).
- [ ] **tsc --noEmit limpo** + **suíte vitest verde** (só as 2 falhas pré-existentes de supabase-vincular-novo).
- [ ] **Pedir OK do Junior** pra: merge → push → aplicar **migration 057** no Supabase → Implantar → smoke (criar lead → gerar proposta → card anda pra "Proposta enviada" → abrir proposta → "Negociação" → deixar vencer → aviso da Eva no zap com botões).
- [ ] Atualizar a memória (`project_crm_plataforma.md`) com o estado da Fase 2.

---

## Notas de execução
- **Não pausar entre fatias** (preferência do Junior): terminar fatia + commit → próxima direto, até o fim ou um bloqueio técnico.
- Hooks são **best-effort** (try/catch que loga) — uma falha de funil NUNCA pode quebrar o salvar-proposta nem o atendimento da Eva.
- Onde o teste exigir rede (Supabase), preferir extrair a **lógica pura** (diff/regra/dedupe/agrupamento) e testar essa; a parte de banco valida no smoke pós-deploy (padrão do projeto na Fase 1).
