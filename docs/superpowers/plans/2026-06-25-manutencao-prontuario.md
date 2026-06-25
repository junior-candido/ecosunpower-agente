# Gestão de Manutenção — peça 2a (Prontuário + Agenda) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a cada usina um prontuário (agenda + histórico de manutenções) com motor de recorrência, fazer toda usina funcionar SEM API (selo "sem API" + leitura de geração manual com feedback), tudo rastreável — repaginando `/dashboard/manutencao` e plugando no pós-venda.

**Architecture:** Funções puras (cadência, próxima data, feedback de leitura, status/ordenação da agenda, empurrão mensal) → migration 058 (`manutencoes` + flags na `sistemas_clientes`) → queries (agenda/prontuário/leituras pendentes + writes) → views (agenda + prontuário + selo) → rotas. Leitura manual entra em `geracao_diaria` (`fetched_source='manual'`) e reusa saúde/relatório existentes.

**Tech Stack:** TypeScript ESM (imports `.js`), Express server-rendered, Tailwind via CDN, vitest, Supabase/Postgres.

**Escopo:** peça 2a (fundação). FORA: OS técnica/fotos/PDF (2b), contrato recorrente pago (2c), portal cliente (3).

---

## File Structure

**Criar:**
- `src/modules/dashboard/manutencao-motor.ts` — puras: `cadenciaDaUsina`, `proximaData`, `feedbackLeitura`, `statusAgendaItem`, `ordenarAgenda`, `precisaLeituraDoMes` + tipos.
- `src/modules/dashboard/manutencao-queries.ts` — I/O: agenda, prontuário, leituras pendentes + writes (`criarManutencao`, `marcarManutencaoFeita`, `reagendarManutencao`, `registrarLeituraManual`).
- `src/modules/dashboard/manutencao-views.ts` — `renderManutencaoPage` (repaginada), `renderProntuario`, `seloSemApi`.
- `supabase/migrations/058_manutencao_prontuario.sql`.
- `tests/manutencao-motor.test.ts`.

**Modificar:**
- `src/modules/dashboard/router.ts` — rotas de manutenção + leitura; injetar prontuário no detalhe da usina.
- `src/modules/dashboard/pos-venda-views.ts` + `pos-venda-queries.ts` — selo "sem API" na linha + botão "📊 Registrar leitura".
- `src/modules/dashboard/views.ts` — (só se preciso) helper de badge.

---

## Tipos compartilhados (Task 1)

```ts
// manutencao-motor.ts
export type ManutencaoTipo = 'limpeza' | 'revisao_inversor' | 'revisao_eletrica' | 'corretiva' | 'inspecao';
export type ManutencaoStatus = 'agendada' | 'feita' | 'cancelada';
export type ManutencaoOrigem = 'regra' | 'alerta' | 'manual';
export interface FeedbackLeitura { status: 'ok' | 'baixo' | 'alto' | 'indefinido'; pctDesvio: number | null; sugestao: string }
```

---

## Task 1: Cadência + próxima data (puras)

**Files:**
- Create: `src/modules/dashboard/manutencao-motor.ts`
- Test: `tests/manutencao-motor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/manutencao-motor.test.ts
import { describe, it, expect } from 'vitest';
import { cadenciaDaUsina, proximaData, CADENCIA_PADRAO } from '../src/modules/dashboard/manutencao-motor.js';

describe('cadenciaDaUsina', () => {
  it('usa o padrão global quando não há override', () => {
    expect(cadenciaDaUsina('limpeza', null)).toBe(6);
    expect(cadenciaDaUsina('revisao_inversor', null)).toBe(12);
    expect(cadenciaDaUsina('corretiva', null)).toBeNull();
  });
  it('override da usina vence o padrão', () => {
    expect(cadenciaDaUsina('limpeza', { limpeza: 3 })).toBe(3);
  });
  it('override inválido (0/negativo) cai no padrão', () => {
    expect(cadenciaDaUsina('limpeza', { limpeza: 0 })).toBe(6);
  });
});

describe('proximaData', () => {
  it('soma os meses da cadência', () => {
    const r = proximaData(new Date('2026-01-15T00:00:00Z'), 6);
    expect(r?.toISOString().slice(0, 10)).toBe('2026-07-15');
  });
  it('null quando cadência é null (corretiva/inspeção não recorrem)', () => {
    expect(proximaData(new Date('2026-01-15T00:00:00Z'), null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/manutencao-motor.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/modules/dashboard/manutencao-motor.ts
export type ManutencaoTipo = 'limpeza' | 'revisao_inversor' | 'revisao_eletrica' | 'corretiva' | 'inspecao';
export type ManutencaoStatus = 'agendada' | 'feita' | 'cancelada';
export type ManutencaoOrigem = 'regra' | 'alerta' | 'manual';

// Cadência padrão (meses). null = não recorre (corretiva/inspeção são sob demanda).
export const CADENCIA_PADRAO: Record<ManutencaoTipo, number | null> = {
  limpeza: 6, revisao_inversor: 12, revisao_eletrica: 12, corretiva: null, inspecao: null,
};

export function cadenciaDaUsina(
  tipo: ManutencaoTipo,
  overrideUsina: Partial<Record<ManutencaoTipo, number>> | null,
  padrao: Record<ManutencaoTipo, number | null> = CADENCIA_PADRAO,
): number | null {
  const ov = overrideUsina?.[tipo];
  if (typeof ov === 'number' && ov > 0) return ov;
  return padrao[tipo];
}

// Próxima data = base + N meses. null se não recorre.
export function proximaData(base: Date, cadenciaMeses: number | null): Date | null {
  if (!cadenciaMeses || cadenciaMeses <= 0) return null;
  const d = new Date(base.getTime());
  d.setUTCMonth(d.getUTCMonth() + cadenciaMeses);
  return d;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/manutencao-motor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/manutencao-motor.ts tests/manutencao-motor.test.ts
git commit -m "feat(manutencao): cadencia por usina + proxima data (puras)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Feedback da leitura manual (pura)

**Files:**
- Modify: `src/modules/dashboard/manutencao-motor.ts`
- Test: `tests/manutencao-motor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// adicionar em tests/manutencao-motor.test.ts
import { feedbackLeitura } from '../src/modules/dashboard/manutencao-motor.js';

describe('feedbackLeitura', () => {
  // esperado = kWp * HSP * dias * PR(0.78). Ex: 5kWp * 5.2 * 30 * 0.78 ≈ 608 kWh
  it('dentro de ±15% → ok', () => {
    const f = feedbackLeitura(600, 5, 5.2, 30);
    expect(f.status).toBe('ok');
  });
  it('25% abaixo → baixo, com sugestão de limpeza', () => {
    const f = feedbackLeitura(456, 5, 5.2, 30); // ~25% abaixo de 608
    expect(f.status).toBe('baixo');
    expect(f.pctDesvio).toBeLessThanOrEqual(-15);
    expect(f.sugestao.toLowerCase()).toContain('limpeza');
  });
  it('bem acima → alto', () => {
    const f = feedbackLeitura(750, 5, 5.2, 30);
    expect(f.status).toBe('alto');
  });
  it('sem dados da usina → indefinido (não chuta)', () => {
    expect(feedbackLeitura(500, 0, 5.2, 30).status).toBe('indefinido');
    expect(feedbackLeitura(500, 5, 0, 30).status).toBe('indefinido');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/manutencao-motor.test.ts`
Expected: FAIL — "feedbackLeitura is not a function".

- [ ] **Step 3: Write minimal implementation**

```ts
// adicionar em src/modules/dashboard/manutencao-motor.ts
export interface FeedbackLeitura { status: 'ok' | 'baixo' | 'alto' | 'indefinido'; pctDesvio: number | null; sugestao: string }

const PERFORMANCE_RATIO = 0.78; // perdas típicas (temperatura, cabeamento, inversor)

// Compara o kWh digitado com o esperado (kWp × HSP × dias × PR). Limiar ±15%.
export function feedbackLeitura(
  kwhDigitado: number, potenciaKwp: number, hspRegiao: number, diasNoMes: number,
): FeedbackLeitura {
  if (!(potenciaKwp > 0) || !(hspRegiao > 0) || !(diasNoMes > 0)) {
    return { status: 'indefinido', pctDesvio: null, sugestao: 'Faltam dados da usina (potência) pra comparar — leitura registrada mesmo assim.' };
  }
  const esperado = potenciaKwp * hspRegiao * diasNoMes * PERFORMANCE_RATIO;
  const pct = Math.round(((kwhDigitado - esperado) / esperado) * 100);
  if (pct <= -15) return { status: 'baixo', pctDesvio: pct, sugestao: `${Math.abs(pct)}% abaixo do esperado — vale oferecer limpeza ou checar o sistema.` };
  if (pct >= 15) return { status: 'alto', pctDesvio: pct, sugestao: `${pct}% acima do esperado — ótimo mês, tudo certo.` };
  return { status: 'ok', pctDesvio: pct, sugestao: 'Dentro do esperado ✅.' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/manutencao-motor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/manutencao-motor.ts tests/manutencao-motor.test.ts
git commit -m "feat(manutencao): feedbackLeitura (esperado x digitado, limiar 15%)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Status/ordenação da agenda + empurrão mensal (puras)

**Files:**
- Modify: `src/modules/dashboard/manutencao-motor.ts`
- Test: `tests/manutencao-motor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// adicionar em tests/manutencao-motor.test.ts
import { statusAgendaItem, ordenarAgenda, precisaLeituraDoMes } from '../src/modules/dashboard/manutencao-motor.js';

describe('statusAgendaItem', () => {
  const hoje = new Date('2026-06-25T12:00:00Z');
  it('data passada → vencida', () => { expect(statusAgendaItem('2026-06-01', hoje)).toBe('vencida'); });
  it('dentro de 30 dias → proxima', () => { expect(statusAgendaItem('2026-07-10', hoje)).toBe('proxima'); });
  it('longe → ok', () => { expect(statusAgendaItem('2026-12-01', hoje)).toBe('ok'); });
  it('sem data → ok', () => { expect(statusAgendaItem(null, hoje)).toBe('ok'); });
});

describe('ordenarAgenda', () => {
  it('vencidas primeiro, depois por data agendada crescente', () => {
    const hoje = new Date('2026-06-25T12:00:00Z');
    const itens = [
      { id: 'a', data_agendada: '2026-07-10' },
      { id: 'b', data_agendada: '2026-06-01' }, // vencida
      { id: 'c', data_agendada: '2026-06-20' }, // vencida
    ];
    expect(ordenarAgenda(itens, hoje).map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('precisaLeituraDoMes', () => {
  const hoje = new Date('2026-06-25T12:00:00Z');
  it('usina com API nunca entra no empurrão', () => {
    expect(precisaLeituraDoMes(true, null, hoje)).toBe(false);
  });
  it('usina sem API e sem leitura no mês → precisa', () => {
    expect(precisaLeituraDoMes(false, null, hoje)).toBe(true);
    expect(precisaLeituraDoMes(false, '2026-05-31T00:00:00Z', hoje)).toBe(true);
  });
  it('usina sem API já com leitura neste mês → não precisa', () => {
    expect(precisaLeituraDoMes(false, '2026-06-02T00:00:00Z', hoje)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/manutencao-motor.test.ts`
Expected: FAIL — funções não existem.

- [ ] **Step 3: Write minimal implementation**

```ts
// adicionar em src/modules/dashboard/manutencao-motor.ts
export function statusAgendaItem(dataAgendada: string | null, hoje: Date, janelaDias = 30): 'vencida' | 'proxima' | 'ok' {
  if (!dataAgendada) return 'ok';
  const d = new Date(dataAgendada + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return 'ok';
  const hojeUtc = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  const dias = Math.round((d.getTime() - hojeUtc) / 86400000);
  if (dias < 0) return 'vencida';
  if (dias <= janelaDias) return 'proxima';
  return 'ok';
}

export interface ItemAgenda { data_agendada: string | null }
// Vencidas primeiro; dentro do grupo, data mais antiga sobe.
export function ordenarAgenda<T extends ItemAgenda>(itens: T[], hoje: Date): T[] {
  const peso = (i: T) => (statusAgendaItem(i.data_agendada, hoje) === 'vencida' ? 0 : 1);
  const t = (i: T) => (i.data_agendada ? new Date(i.data_agendada + 'T00:00:00Z').getTime() : Infinity);
  return [...itens].sort((a, b) => peso(a) - peso(b) || t(a) - t(b));
}

// Empurrão mensal: SÓ usina sem API que ainda não teve leitura manual no mês corrente.
export function precisaLeituraDoMes(temApi: boolean, ultimaLeituraManualISO: string | null, hoje: Date): boolean {
  if (temApi) return false;
  if (!ultimaLeituraManualISO) return true;
  const d = new Date(ultimaLeituraManualISO);
  if (Number.isNaN(d.getTime())) return true;
  return !(d.getUTCFullYear() === hoje.getUTCFullYear() && d.getUTCMonth() === hoje.getUTCMonth());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/manutencao-motor.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/manutencao-motor.ts tests/manutencao-motor.test.ts
git commit -m "feat(manutencao): status/ordenacao da agenda + empurrao mensal (puras)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Migration 058 (tabela manutencoes + flags na usina)

**Files:**
- Create: `supabase/migrations/058_manutencao_prontuario.sql`

> ⚠️ Confirmar o número **058** no grupo do WhatsApp antes de aplicar (regra do CLAUDE.md). Aplicar no Supabase ANTES do deploy.

- [ ] **Step 1: Escrever a migration**

```sql
-- Migration 058: Gestão de Manutenção peça 2a — prontuário + agenda
-- Tabela manutencoes (agenda + histórico) + flags na sistemas_clientes
-- (usina sem API de 1ª classe + cadência editável por usina).

-- 1. Usina: modo de acompanhamento + override de cadência
ALTER TABLE sistemas_clientes
  ADD COLUMN IF NOT EXISTS acompanhamento TEXT NOT NULL DEFAULT 'api'
    CHECK (acompanhamento IN ('api', 'manual'));
ALTER TABLE sistemas_clientes
  ADD COLUMN IF NOT EXISTS manutencao_cadencia JSONB;  -- {"limpeza":3} sobrescreve o padrão global

COMMENT ON COLUMN sistemas_clientes.acompanhamento IS
  'api = sincroniza pelo cron; manual = leitura de geração digitada na mão (sem integração).';

-- 2. manutencoes — 1 linha por manutenção (agendada ou feita) = o prontuário
CREATE TABLE IF NOT EXISTS manutencoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema_id UUID NOT NULL REFERENCES sistemas_clientes(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  tipo TEXT NOT NULL CHECK (tipo IN (
    'limpeza', 'revisao_inversor', 'revisao_eletrica', 'corretiva', 'inspecao'
  )),
  status TEXT NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada', 'feita', 'cancelada')),
  origem TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('regra', 'alerta', 'manual')),

  data_agendada DATE,
  feita_em DATE,
  feito_por UUID,          -- dashboard_users.id (sem FK rígida: usuário pode sair)
  notas TEXT,
  alerta_id UUID REFERENCES alertas_sistema(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agenda: 1 manutenção ABERTA por (usina, tipo) — evita duplicar agendamento do
-- mesmo tipo na mesma usina (corrida entre auto-agenda e manual).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_manutencao_aberta_por_tipo
  ON manutencoes (sistema_id, tipo) WHERE status = 'agendada';

CREATE INDEX IF NOT EXISTS idx_manutencoes_agenda
  ON manutencoes (data_agendada) WHERE status = 'agendada';
CREATE INDEX IF NOT EXISTS idx_manutencoes_sistema
  ON manutencoes (sistema_id, created_at DESC);

COMMENT ON TABLE manutencoes IS
  'Manutenções por usina: agenda (status agendada) + histórico (status feita). Auto-agenda a próxima ao marcar feita.';
```

- [ ] **Step 2: Conferir que `geracao_diaria.fetched_source` aceita 'manual'**

Na migration 021, `fetched_source TEXT NOT NULL DEFAULT 'cron'` **sem CHECK** → 'manual' já é aceito. Nada a fazer (confirmado, não alterar).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/058_manutencao_prontuario.sql
git commit -m "feat(manutencao): migration 058 (tabela manutencoes + flags na usina)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Queries (agenda, prontuário, leituras pendentes + writes)

**Files:**
- Create: `src/modules/dashboard/manutencao-queries.ts`

I/O (sem teste unitário; tsc + smoke). Lê/escreve `manutencoes`, junta usina+lead, e a leitura manual vai pra `geracao_diaria`.

- [ ] **Step 1: Implementar**

```ts
// src/modules/dashboard/manutencao-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cadenciaDaUsina, proximaData, ordenarAgenda, precisaLeituraDoMes, feedbackLeitura,
  type ManutencaoTipo, type ManutencaoOrigem, type FeedbackLeitura,
} from './manutencao-motor.js';

const HSP_PADRAO = 5.2; // DF/GO (kWh/m²/dia) — esperado da leitura manual

function semApi(s: { acompanhamento?: string | null; api_credentials?: any }): boolean {
  if (s.acompanhamento === 'manual') return true;
  const cred = s.api_credentials;
  return !cred || (typeof cred === 'object' && Object.keys(cred).length === 0);
}

export interface AgendaItem {
  id: string; sistemaId: string; apelido: string; leadId: string | null;
  clienteNome: string | null; tipo: ManutencaoTipo; origem: ManutencaoOrigem;
  data_agendada: string | null; semApi: boolean;
}

// Agenda: manutenções agendadas (vencidas + próximas), guiada por atenção.
export async function listarAgenda(client: SupabaseClient): Promise<AgendaItem[]> {
  const { data, error } = await client.from('manutencoes')
    .select('id, sistema_id, lead_id, tipo, origem, data_agendada, sistemas_clientes!inner(apelido, acompanhamento, api_credentials, leads(name))')
    .eq('status', 'agendada')
    .limit(500);
  if (error) throw new Error(`listarAgenda: ${error.message}`);
  const itens: AgendaItem[] = (data ?? []).map((m: any) => ({
    id: m.id, sistemaId: m.sistema_id, leadId: m.lead_id,
    apelido: m.sistemas_clientes?.apelido ?? '(usina)',
    clienteNome: m.sistemas_clientes?.leads?.name ?? null,
    tipo: m.tipo, origem: m.origem, data_agendada: m.data_agendada,
    semApi: semApi(m.sistemas_clientes ?? {}),
  }));
  return ordenarAgenda(itens, new Date());
}

export interface ProntuarioManutencao {
  id: string; tipo: ManutencaoTipo; status: string; origem: ManutencaoOrigem;
  data_agendada: string | null; feita_em: string | null; notas: string | null;
}
// Prontuário de uma usina: agenda + histórico (mais recente primeiro).
export async function prontuarioUsina(client: SupabaseClient, sistemaId: string): Promise<ProntuarioManutencao[]> {
  const { data, error } = await client.from('manutencoes')
    .select('id, tipo, status, origem, data_agendada, feita_em, notas')
    .eq('sistema_id', sistemaId)
    .order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error(`prontuarioUsina: ${error.message}`);
  return (data ?? []) as ProntuarioManutencao[];
}

// Usinas sem API que estão sem leitura manual no mês corrente (empurrão mensal).
export interface LeituraPendente { sistemaId: string; apelido: string; leadId: string | null; clienteNome: string | null }
export async function listarLeiturasPendentes(client: SupabaseClient): Promise<LeituraPendente[]> {
  const { data: sistemas, error } = await client.from('sistemas_clientes')
    .select('id, apelido, lead_id, acompanhamento, api_credentials, leads(name)')
    .eq('ativo', true);
  if (error) throw new Error(`listarLeiturasPendentes: ${error.message}`);
  const manuais = (sistemas ?? []).filter((s: any) => semApi(s));
  if (manuais.length === 0) return [];

  // última leitura manual por sistema
  const ids = manuais.map((s: any) => s.id);
  const { data: leituras, error: e2 } = await client.from('geracao_diaria')
    .select('sistema_id, data').eq('fetched_source', 'manual').in('sistema_id', ids)
    .order('data', { ascending: false });
  if (e2) throw new Error(`listarLeiturasPendentes/leituras: ${e2.message}`);
  const ultima = new Map<string, string>();
  for (const l of (leituras ?? []) as any[]) if (!ultima.has(l.sistema_id)) ultima.set(l.sistema_id, l.data);

  const hoje = new Date();
  return manuais
    .filter((s: any) => precisaLeituraDoMes(false, ultima.get(s.id) ? ultima.get(s.id) + 'T00:00:00Z' : null, hoje))
    .map((s: any) => ({ sistemaId: s.id, apelido: s.apelido, leadId: s.lead_id, clienteNome: s.leads?.name ?? null }));
}

// ---- Writes ----

export async function criarManutencao(client: SupabaseClient, m: {
  sistemaId: string; leadId: string | null; tipo: ManutencaoTipo;
  origem: ManutencaoOrigem; dataAgendada: string; alertaId?: string | null;
}): Promise<string | null> {
  const { data, error } = await client.from('manutencoes').insert({
    sistema_id: m.sistemaId, lead_id: m.leadId, tipo: m.tipo, origem: m.origem,
    status: 'agendada', data_agendada: m.dataAgendada, alerta_id: m.alertaId ?? null,
  }).select('id').single();
  if (error) {
    if (error.code === '23505') return null; // já existe agendada do tipo nessa usina
    throw new Error(`criarManutencao: ${error.message}`);
  }
  return (data as { id: string }).id;
}

// Marca feita + auto-agenda a próxima do mesmo tipo (se recorrer) + resolve alerta.
export async function marcarManutencaoFeita(client: SupabaseClient, id: string, p: {
  feitaEm: string; feitoPor: string; notas?: string;
}): Promise<void> {
  const { data: m, error } = await client.from('manutencoes')
    .select('id, sistema_id, lead_id, tipo, alerta_id, sistemas_clientes(manutencao_cadencia)')
    .eq('id', id).maybeSingle();
  if (error) throw new Error(`marcarManutencaoFeita/get: ${error.message}`);
  if (!m) throw new Error('marcarManutencaoFeita: manutenção não encontrada');
  const row = m as any;

  const { error: e2 } = await client.from('manutencoes')
    .update({ status: 'feita', feita_em: p.feitaEm, feito_por: p.feitoPor, notas: p.notas ?? null, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'agendada');
  if (e2) throw new Error(`marcarManutencaoFeita/update: ${e2.message}`);

  // auto-agenda a próxima
  const cadencia = cadenciaDaUsina(row.tipo, row.sistemas_clientes?.manutencao_cadencia ?? null);
  const prox = proximaData(new Date(p.feitaEm + 'T00:00:00Z'), cadencia);
  if (prox) {
    await criarManutencao(client, {
      sistemaId: row.sistema_id, leadId: row.lead_id, tipo: row.tipo,
      origem: 'regra', dataAgendada: prox.toISOString().slice(0, 10),
    });
  }
  // resolve alerta manutencao_devida aberto da usina
  if (row.alerta_id) {
    await client.from('alertas_sistema').update({ resolved_at: new Date().toISOString() }).eq('id', row.alerta_id).is('resolved_at', null);
  }
}

export async function reagendarManutencao(client: SupabaseClient, id: string, novaData: string): Promise<void> {
  const { error } = await client.from('manutencoes')
    .update({ data_agendada: novaData, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'agendada');
  if (error) throw new Error(`reagendarManutencao: ${error.message}`);
}

// Leitura manual de geração do mês: grava em geracao_diaria (source manual,
// no 1º dia da competência) e devolve o feedback esperado×digitado.
export async function registrarLeituraManual(client: SupabaseClient, p: {
  sistemaId: string; competencia: string; kwh: number;  // competencia 'YYYY-MM'
}): Promise<FeedbackLeitura> {
  const dia = `${p.competencia}-01`;
  const ano = Number(p.competencia.slice(0, 4)), mes = Number(p.competencia.slice(5, 7));
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();

  const { error } = await client.from('geracao_diaria')
    .upsert({ sistema_id: p.sistemaId, data: dia, geracao_kwh: p.kwh, fetched_source: 'manual' }, { onConflict: 'sistema_id,data' });
  if (error) throw new Error(`registrarLeituraManual: ${error.message}`);

  const { data: s } = await client.from('sistemas_clientes').select('potencia_kwp').eq('id', p.sistemaId).maybeSingle();
  const kwp = (s as any)?.potencia_kwp != null ? Number((s as any).potencia_kwp) : 0;
  return feedbackLeitura(p.kwh, kwp, HSP_PADRAO, diasNoMes);
}
```

- [ ] **Step 2: Verificar build**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/modules/dashboard/manutencao-queries.ts
git commit -m "feat(manutencao): queries (agenda/prontuario/leituras pendentes + writes + auto-agenda)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: View da manutenção + prontuário + selo sem-API

**Files:**
- Create: `src/modules/dashboard/manutencao-views.ts`
- Test: `tests/manutencao-views.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/manutencao-views.test.ts
import { describe, it, expect } from 'vitest';
import { renderManutencaoPage, seloSemApi } from '../src/modules/dashboard/manutencao-views.js';
import type { AgendaItem, LeituraPendente } from '../src/modules/dashboard/manutencao-queries.js';

const item = (over: Partial<AgendaItem> = {}): AgendaItem => ({
  id: 'm1', sistemaId: 's1', apelido: 'Casa Antônio', leadId: 'l1', clienteNome: 'Antônio',
  tipo: 'limpeza', origem: 'regra', data_agendada: '2026-06-01', semApi: false, ...over,
});

describe('seloSemApi', () => {
  it('mostra o selo quando sem API', () => { expect(seloSemApi(true)).toContain('Sem API'); });
  it('vazio quando tem API', () => { expect(seloSemApi(false)).toBe(''); });
});

describe('renderManutencaoPage', () => {
  it('lista item da agenda com usina e tipo', () => {
    const html = renderManutencaoPage({ agenda: [item()], leiturasPendentes: [], usinas: [] }, undefined);
    expect(html).toContain('Casa Antônio');
    expect(html).toContain('data-manut-id="m1"');
  });
  it('escapa HTML (não injeta)', () => {
    const html = renderManutencaoPage({ agenda: [item({ apelido: '<b>x</b>' })], leiturasPendentes: [], usinas: [] }, undefined);
    expect(html).not.toContain('<b>x</b>');
  });
  it('mostra o selo sem-API na linha da usina manual', () => {
    const html = renderManutencaoPage({ agenda: [item({ semApi: true })], leiturasPendentes: [], usinas: [] }, undefined);
    expect(html).toContain('Sem API');
  });
  it('bloco de leituras pendentes aparece quando há', () => {
    const lp: LeituraPendente = { sistemaId: 's2', apelido: 'Sítio', leadId: 'l2', clienteNome: 'Maria' };
    const html = renderManutencaoPage({ agenda: [], leiturasPendentes: [lp], usinas: [] }, undefined);
    expect(html).toMatch(/leitura/i);
    expect(html).toContain('Sítio');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/manutencao-views.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/modules/dashboard/manutencao-views.ts
import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { AgendaItem, LeituraPendente } from './manutencao-queries.js';
import { statusAgendaItem, type ManutencaoTipo } from './manutencao-motor.js';

const TIPO_LABEL: Record<ManutencaoTipo, string> = {
  limpeza: '🧹 Limpeza', revisao_inversor: '🔌 Revisão inversor',
  revisao_eletrica: '⚡ Revisão elétrica', corretiva: '🔧 Corretiva', inspecao: '🔎 Inspeção',
};

export function seloSemApi(semApi: boolean): string {
  return semApi
    ? '<span class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">📵 Sem API · leitura manual</span>'
    : '';
}

interface UsinaOpt { id: string; apelido: string }
export interface ManutencaoPageData { agenda: AgendaItem[]; leiturasPendentes: LeituraPendente[]; usinas: UsinaOpt[] }

function corStatus(s: 'vencida' | 'proxima' | 'ok'): string {
  return s === 'vencida' ? 'border-l-rose-500' : s === 'proxima' ? 'border-l-amber-400' : 'border-l-slate-300';
}

function renderAgendaItem(i: AgendaItem, hoje: Date): string {
  const st = statusAgendaItem(i.data_agendada, hoje);
  const chip = st === 'vencida'
    ? '<span class="text-[10px] font-bold text-rose-700 bg-rose-100 rounded px-1">⚠ vencida</span>'
    : st === 'proxima' ? '<span class="text-[10px] font-bold text-amber-700 bg-amber-100 rounded px-1">⏳ próxima</span>' : '';
  return `
  <div class="bg-white border border-slate-200 border-l-4 ${corStatus(st)} rounded-md px-3 py-2 mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" data-manut-id="${escapeHtml(i.id)}">
    <span class="font-medium text-slate-800">${escapeHtml(i.apelido)}</span>
    ${seloSemApi(i.semApi)}
    <span class="text-xs text-slate-500">${escapeHtml(i.clienteNome ?? '')}</span>
    <span class="text-xs text-slate-600">${TIPO_LABEL[i.tipo] ?? i.tipo}</span>
    <span class="text-xs text-slate-400">${i.data_agendada ? i.data_agendada.split('-').reverse().join('/') : '—'}</span>
    ${chip}
    <span class="ml-auto flex gap-1">
      <form method="post" action="/dashboard/manutencao/${escapeHtml(i.id)}/feita" class="inline">
        <button class="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs">✓ Feita</button></form>
      <button class="pv-leitura px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs" data-sistema="${escapeHtml(i.sistemaId)}" data-apelido="${escapeHtml(i.apelido)}">📊 Leitura</button>
    </span>
  </div>`;
}

export function renderManutencaoPage(d: ManutencaoPageData, user?: DashUser): string {
  const hoje = new Date();
  const agenda = d.agenda.length
    ? d.agenda.map((i) => renderAgendaItem(i, hoje)).join('')
    : '<div class="text-slate-400 text-sm py-6 text-center">Nenhuma manutenção agendada.</div>';

  const pend = d.leiturasPendentes.length ? `
    <h2 class="text-sm font-bold text-amber-700 mt-6 mb-2">📵 Leituras do mês pendentes (usinas sem API)</h2>
    ${d.leiturasPendentes.map((l) => `
      <div class="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-1.5 flex items-center gap-3">
        <span class="font-medium text-slate-800">${escapeHtml(l.apelido)}</span>
        <span class="text-xs text-slate-500">${escapeHtml(l.clienteNome ?? '')}</span>
        <button class="pv-leitura ml-auto px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs" data-sistema="${escapeHtml(l.sistemaId)}" data-apelido="${escapeHtml(l.apelido)}">📊 Registrar leitura</button>
      </div>`).join('')}` : '';

  const opcoesUsina = d.usinas.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.apelido)}</option>`).join('');

  const body = `
  <div>
    <h1 class="text-xl font-bold text-slate-900 mb-1">🔧 Manutenção</h1>
    <p class="text-xs text-slate-500 mb-4">Agenda guiada por atenção — as <b class="text-rose-600">vencidas</b> primeiro.</p>
    <h2 class="text-sm font-bold text-slate-700 mb-2">Agenda</h2>
    ${agenda}
    ${pend}
    <details class="mt-6">
      <summary class="cursor-pointer text-sm text-slate-600">➕ Agendar manutenção manual</summary>
      <form method="post" action="/dashboard/manutencao/agendar" class="mt-2 flex flex-wrap gap-2 items-end">
        <select name="sistemaId" class="border rounded px-2 py-1 text-sm" required>${opcoesUsina}</select>
        <select name="tipo" class="border rounded px-2 py-1 text-sm">
          <option value="limpeza">🧹 Limpeza</option><option value="revisao_inversor">🔌 Revisão inversor</option>
          <option value="revisao_eletrica">⚡ Revisão elétrica</option><option value="corretiva">🔧 Corretiva</option>
          <option value="inspecao">🔎 Inspeção</option>
        </select>
        <input type="date" name="dataAgendada" class="border rounded px-2 py-1 text-sm" required>
        <button class="px-3 py-1 rounded bg-indigo-600 text-white text-sm">Agendar</button>
      </form>
    </details>
  </div>

  <div id="leitura-modal" class="fixed inset-0 bg-black/50 hidden items-center justify-center z-50 p-4">
    <form id="leitura-form" method="post" class="bg-white rounded-xl max-w-sm w-full p-4">
      <div class="text-sm font-semibold mb-2" id="leitura-title">Registrar leitura</div>
      <label class="block text-xs text-slate-500">Competência</label>
      <input type="month" name="competencia" class="w-full border rounded px-2 py-1 text-sm mb-2" required>
      <label class="block text-xs text-slate-500">kWh do mês (o que a plataforma de origem mostra)</label>
      <input type="number" step="0.1" name="kwh" class="w-full border rounded px-2 py-1 text-sm mb-3" required>
      <div id="leitura-fb" class="text-xs mb-2"></div>
      <div class="flex justify-end gap-2">
        <button type="button" id="leitura-cancel" class="px-3 py-1 rounded bg-slate-200 text-sm">Fechar</button>
        <button type="submit" class="px-3 py-1 rounded bg-emerald-600 text-white text-sm">Salvar</button>
      </div>
    </form>
  </div>`;

  const scripts = `<script>
  (function(){
    var modal=document.getElementById('leitura-modal'), form=document.getElementById('leitura-form');
    var title=document.getElementById('leitura-title'), fb=document.getElementById('leitura-fb');
    document.querySelectorAll('.pv-leitura').forEach(function(b){
      b.onclick=function(){
        form.action='/dashboard/usinas/'+b.dataset.sistema+'/leitura';
        title.textContent='Leitura · '+(b.dataset.apelido||'usina'); fb.textContent='';
        modal.classList.remove('hidden'); modal.classList.add('flex');
      };
    });
    document.getElementById('leitura-cancel').onclick=function(){ modal.classList.add('hidden'); modal.classList.remove('flex'); };
    form.onsubmit=async function(e){
      e.preventDefault();
      var r=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(new FormData(form)).toString()});
      var j=await r.json().catch(function(){return {};});
      fb.textContent=j.sugestao||'Salvo.';
      fb.className='text-xs mb-2 '+(j.status==='baixo'?'text-rose-600':j.status==='alto'?'text-emerald-600':'text-slate-600');
    };
  })();
  </script>`;

  return renderLayout({ active: 'manutencao', title: 'Manutenção', body, scripts, user });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/manutencao-views.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/manutencao-views.ts tests/manutencao-views.test.ts
git commit -m "feat(manutencao): tela repaginada (agenda + leituras pendentes + selo sem-API + modal leitura)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Rotas de manutenção + leitura

**Files:**
- Modify: `src/modules/dashboard/router.ts`

- [ ] **Step 1: Imports no topo (junto dos da peça 1)**

```ts
import { listarAgenda, prontuarioUsina, listarLeiturasPendentes, criarManutencao, marcarManutencaoFeita, reagendarManutencao, registrarLeituraManual } from './manutencao-queries.js';
import { renderManutencaoPage } from './manutencao-views.js';
import type { ManutencaoTipo } from './manutencao-motor.js';
```

> Remover/ajustar o import antigo de `renderManutencaoPage` das `./views.js` (a função foi reescrita no novo módulo). O `listManutencaoPendente`/`renderManutencaoPage` antigos saem do uso desta rota.

- [ ] **Step 2: Substituir a rota `GET /manutencao` (linha ~1612, a antiga read-only)**

```ts
  router.get('/manutencao', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const [agenda, leiturasPendentes, usinasRes] = await Promise.all([
        listarAgenda(supabase),
        listarLeiturasPendentes(supabase),
        supabase.from('sistemas_clientes').select('id, apelido').eq('ativo', true).order('apelido'),
      ]);
      const usinas = (usinasRes.data ?? []).map((u: any) => ({ id: u.id, apelido: u.apelido }));
      res.type('text/html').send(renderManutencaoPage({ agenda, leiturasPendentes, usinas }, req.dashUser));
    } catch (err) {
      console.error('[manutencao] GET falhou:', (err as Error).message);
      res.status(500).type('text/html').send('<h2>Erro ao carregar Manutenção</h2>');
    }
  });

  router.post('/manutencao/agendar', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const sistemaId = String(req.body.sistemaId ?? '');
      const tipo = String(req.body.tipo ?? '') as ManutencaoTipo;
      const dataAgendada = String(req.body.dataAgendada ?? '');
      const TIPOS = ['limpeza', 'revisao_inversor', 'revisao_eletrica', 'corretiva', 'inspecao'];
      if (!UUID_RE.test(sistemaId) || !TIPOS.includes(tipo) || !/^\d{4}-\d{2}-\d{2}$/.test(dataAgendada)) {
        res.status(400).send('dados inválidos'); return;
      }
      const { data: s } = await supabase.from('sistemas_clientes').select('lead_id').eq('id', sistemaId).maybeSingle();
      await criarManutencao(supabase, { sistemaId, leadId: (s as any)?.lead_id ?? null, tipo, origem: 'manual', dataAgendada });
      res.redirect('/dashboard/manutencao');
    } catch (err) {
      console.error('[manutencao] agendar falhou:', (err as Error).message);
      res.status(500).send('erro ao agendar');
    }
  });

  router.post('/manutencao/:id/feita', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) { res.status(400).send('id inválido'); return; }
      const hoje = new Date().toISOString().slice(0, 10);
      await marcarManutencaoFeita(supabase, id, {
        feitaEm: String(req.body.feitaEm ?? hoje), feitoPor: req.dashUser!.id, notas: req.body.notas ? String(req.body.notas) : undefined,
      });
      // timeline do lead (best-effort)
      const { data: m } = await supabase.from('manutencoes').select('lead_id, tipo').eq('id', id).maybeSingle();
      if ((m as any)?.lead_id) {
        await registrarAtividade(supabase, {
          company_id: req.dashUser!.companyId, lead_id: (m as any).lead_id, tipo: 'visita',
          titulo: `Manutenção feita: ${(m as any).tipo}`, automatica: false, user_id: req.dashUser!.id,
        });
      }
      res.redirect('/dashboard/manutencao');
    } catch (err) {
      console.error('[manutencao] feita falhou:', (err as Error).message);
      res.status(500).send('erro ao marcar feita');
    }
  });

  router.post('/manutencao/:id/reagendar', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const novaData = String(req.body.dataAgendada ?? '');
      if (!UUID_RE.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(novaData)) { res.status(400).send('dados inválidos'); return; }
      await reagendarManutencao(supabase, id, novaData);
      res.redirect('/dashboard/manutencao');
    } catch (err) {
      console.error('[manutencao] reagendar falhou:', (err as Error).message);
      res.status(500).send('erro ao reagendar');
    }
  });

  router.post('/usinas/:sistemaId/leitura', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const sistemaId = String(req.params.sistemaId);
      const competencia = String(req.body.competencia ?? '');
      const kwh = Number(req.body.kwh);
      if (!UUID_RE.test(sistemaId) || !/^\d{4}-\d{2}$/.test(competencia) || !(kwh >= 0)) {
        res.status(400).json({ error: 'dados inválidos' }); return;
      }
      const fb = await registrarLeituraManual(supabase, { sistemaId, competencia, kwh });
      res.json(fb);
    } catch (err) {
      console.error('[manutencao] leitura falhou:', (err as Error).message);
      res.status(500).json({ error: 'erro ao registrar leitura' });
    }
  });
```

- [ ] **Step 3: Verificar build + testes**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc limpo; vitest verde (fora as 2 falhas pré-existentes).

- [ ] **Step 4: Commit**

```bash
git add src/modules/dashboard/router.ts
git commit -m "feat(manutencao): rotas (agenda/agendar/feita/reagendar/leitura manual)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Selo sem-API + botão de leitura no pós-venda

**Files:**
- Modify: `src/modules/dashboard/pos-venda-queries.ts` (campo `semApi` na linha)
- Modify: `src/modules/dashboard/pos-venda-views.ts` (selo + botão leitura)

- [ ] **Step 1: `semApi` na query do pós-venda**

Em `pos-venda-queries.ts`: no SELECT dos sistemas, adicionar `acompanhamento, api_credentials`; em `PosVendaLinha` adicionar `semApi: boolean`; computar:

```ts
// no select dos sistemas:
.select('id, lead_id, apelido, marca_inversor, potencia_kwp, data_instalacao, cidade, acompanhamento, api_credentials, ativo')
// no push da linha:
const semApi = s.acompanhamento === 'manual' || !s.api_credentials || (typeof s.api_credentials === 'object' && Object.keys(s.api_credentials).length === 0);
// ...adicionar `semApi,` no objeto da linha e no tipo PosVendaLinha
```

- [ ] **Step 2: Selo + botão na view do pós-venda**

Em `pos-venda-views.ts`, importar o selo e mostrá-lo na linha + adicionar o botão de leitura (reusa o `data-sistema`):

```ts
import { seloSemApi } from './manutencao-views.js';
// na renderLinha, após o nome/usina:
//   ${seloSemApi(l.semApi)}
// e nos botões, quando semApi, um atalho (opcional) que leva pra /manutencao
```

> Mínimo viável: mostrar `seloSemApi(l.semApi)` na linha. O botão de leitura completo já vive na tela de Manutenção (Task 6); aqui basta o selo pra o time entender. (YAGNI: não duplicar o modal no pós-venda.)

- [ ] **Step 3: Verificar build + testes**

Run: `npx tsc --noEmit && npx vitest run tests/pos-venda-views.test.ts`
Expected: tsc limpo; pós-venda verde (o `linha()` do teste não passa `semApi` → ajustar o helper do teste pra incluir `semApi: false`).

- [ ] **Step 4: Atualizar o teste do pós-venda**

Em `tests/pos-venda-views.test.ts`, adicionar `semApi: false` no objeto `linha()` base. Rodar de novo: verde.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/pos-venda-queries.ts src/modules/dashboard/pos-venda-views.ts tests/pos-venda-views.test.ts
git commit -m "feat(manutencao): selo 'sem API' na linha do pos-venda

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Prontuário no detalhe da usina

**Files:**
- Modify: `src/modules/dashboard/router.ts` (rota `GET /monitoramento/:id`)
- Modify: `src/modules/dashboard/manutencao-views.ts` (`renderProntuario`)

- [ ] **Step 1: `renderProntuario` na view**

```ts
// adicionar em manutencao-views.ts
import type { ProntuarioManutencao } from './manutencao-queries.js';

export function renderProntuario(itens: ProntuarioManutencao[]): string {
  if (!itens.length) return '<div class="text-slate-400 text-sm">Sem manutenções registradas ainda.</div>';
  const linha = (m: ProntuarioManutencao) => {
    const quando = m.status === 'feita' ? (m.feita_em ?? '') : (m.data_agendada ?? '');
    const badge = m.status === 'feita' ? '✅' : m.status === 'cancelada' ? '✖' : '📅';
    return `<tr class="border-t border-slate-200">
      <td class="py-1">${badge} ${TIPO_LABEL[m.tipo] ?? m.tipo}</td>
      <td class="py-1 text-slate-500">${quando ? quando.split('-').reverse().join('/') : '—'}</td>
      <td class="py-1 text-slate-500">${m.status}</td>
      <td class="py-1 text-slate-500">${escapeHtml(m.notas ?? '')}</td>
    </tr>`;
  };
  return `<table class="w-full text-sm"><thead><tr class="text-slate-400 text-left text-xs">
    <th>Tipo</th><th>Quando</th><th>Status</th><th>Notas</th></tr></thead>
    <tbody>${itens.map(linha).join('')}</tbody></table>`;
}
```

- [ ] **Step 2: Injetar no `GET /monitoramento/:id`**

Localizar a rota `GET /monitoramento/:id` (que renderiza `renderDetalheSistemaPage`). Buscar o prontuário e passar pro template OU concatenar um bloco. Implementação mínima sem mexer no template existente — anexar o HTML do prontuário ao body via uma seção própria:

```ts
// dentro do handler, após obter `s.id`:
const prontuario = await prontuarioUsina(supabase, s.id);
// passar `renderProntuario(prontuario)` pro renderDetalheSistemaPage (novo param opcional)
// OU, se o template não aceitar, enviar o HTML existente + um <section> com o prontuário.
```

> O implementador escolhe o caminho menos invasivo: adicionar um parâmetro opcional `prontuarioHtml?: string` em `renderDetalheSistemaPage` e renderizar uma seção "🔧 Prontuário de manutenção". Importar `prontuarioUsina` e `renderProntuario`.

- [ ] **Step 3: Verificar build**

Run: `npx tsc --noEmit && npx vitest run`
Expected: limpo + verde.

- [ ] **Step 4: Commit**

```bash
git add src/modules/dashboard/manutencao-views.ts src/modules/dashboard/router.ts
git commit -m "feat(manutencao): prontuario na tela de detalhe da usina

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Revisão final + verificação

- [ ] **Step 1: Suite completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc limpo; vitest verde (exceto as 2 falhas pré-existentes de `tests/supabase-vincular-novo.test.ts`).

- [ ] **Step 2: Code review 3× do diff** (`git diff main...HEAD`):
1. Segurança/escopo: rotas com `exigir('usinas','visualizar')`; `UUID_RE` valida ids; `escapeHtml` em todo dado; leitura manual valida competência/kwh.
2. Consistência: tipos `ManutencaoTipo`/`AgendaItem`/`PosVendaLinha.semApi` batem entre módulos; `seloSemApi` importado onde usado; auto-agenda usa `cadenciaDaUsina`+`proximaData`; unique parcial casa com `criarManutencao` (23505→null).
3. Produto: selo "Sem API" visível; português claro; feedback de leitura sem prometer nada; nada de preço.

- [ ] **Step 3: Resumo pro Junior** — o que foi feito, lembrando:
  - **Migration 058** (confirmar nº no grupo) precisa ser aplicada ANTES do deploy.
  - Smoke: marcar uma usina como `acompanhamento='manual'` (ou usina sem credencial) → ver selo; registrar leitura → ver feedback; agendar manutenção + marcar feita → ver auto-agenda + prontuário; agenda guiada por atenção.
  - 2b (OS técnica) e 2c (contrato recorrente) são as próximas.

---

## Self-Review (feita ao escrever o plano)

**1. Cobertura da spec:**
- §3.1 modelo de manutenção → Task 4 (migration) + 5 (queries) ✅
- §3.2 motor de agenda (cadência+auto-agenda+alerta fura fila) → Tasks 1,5 (auto-agenda em `marcarManutencaoFeita`; alerta resolvido) ✅. *Obs: a CRIAÇÃO automática de manutenção a partir de um alerta `manutencao_devida` novo (alerta "fura a fila") fica no cron/orquestrador — nesta peça o alerta é resolvido ao marcar feita e a tela mostra os agendados; gerar manutenção a partir de alerta novo é um gancho pequeno (fast-follow) se o Junior quiser disparo automático. Agendamento manual + auto-agenda por cadência cobrem o uso imediato.*
- §3.3 usina sem API 1ª classe + selo → Tasks 4 (flag), 6/8 (selo) ✅
- §3.4 leitura manual (botão + empurrão + feedback) → Tasks 2,5,6,7 ✅
- §3.5 tela repaginada → Tasks 6,7 ✅
- §3.6 rastreabilidade → Task 7 (timeline) + writes gravam quem/quando ✅
- §6 funções puras → Tasks 1,2,3 ✅

**2. Placeholders:** sem TODO/TBD no código. As escolhas "menos invasivas" da Task 9 são contra o template existente, com caminho preferido indicado.

**3. Consistência de tipos:** `ManutencaoTipo` único; `AgendaItem`/`LeituraPendente`/`ProntuarioManutencao` definidos na Task 5 e consumidos nas 6/9; `seloSemApi(boolean)` mesma assinatura em 6 e 8; `cadenciaDaUsina`/`proximaData` usados em `marcarManutencaoFeita` com os tipos da Task 1.

**Gancho consciente fora de escopo:** disparo automático de manutenção a partir de alerta novo (cron) — marcado como fast-follow, não bloqueia a peça 2a.
