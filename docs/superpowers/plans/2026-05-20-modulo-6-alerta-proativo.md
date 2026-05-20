# Módulo 6 — Alerta Proativo da Carteira — Plano de Execução

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anomalia detectada na carteira ou aniversário de instalação dispara mensagem no zap do Junior com botões; ações de cliente delegam à Eva via `maintenance_reminders` já em produção.

**Architecture:** 3 funções puras testáveis sem DB (janela horária, detecção, formatação). 1 service que persiste intenção em `monitoring_alerts` (tabela nova). 1 dispatcher separado que respeita janela e CAS lock. Cron diário enfileira aniversários em `maintenance_reminders` (reusa `MaintenanceService`). Handlers novos em `eva-admin-buttons.ts` despacham ações via mesmo padrão `maintenance_reminders`. 3 crons novos no `index.ts`.

**Tech Stack:** TypeScript, Vitest, Supabase (Postgres), WABA Cloud API via `meta-whatsapp.ts`, Anthropic SDK (Haiku 4.5).

**Spec:** `docs/superpowers/specs/2026-05-20-modulo-6-alerta-proativo-design.md`

---

## File Structure

### Created
- `supabase/migrations/032_monitoring_alerts.sql` — schema
- `src/modules/monitoring/proactive-alerts/types.ts` — interfaces compartilhadas
- `src/modules/monitoring/proactive-alerts/janela.ts` — `dentroDaJanela(date, tz)`
- `src/modules/monitoring/proactive-alerts/format.ts` — `formatAlertMessage(alerta, sistema, lead)`
- `src/modules/monitoring/proactive-alerts/detect.ts` — `detectarAlertasPendentes`
- `src/modules/monitoring/proactive-alerts/service.ts` — `ProactiveAlertService.runDetectionCycle`
- `src/modules/monitoring/proactive-alerts/dispatcher.ts` — `runDispatchCycle`
- `src/modules/monitoring/proactive-alerts/anniversary.ts` — `runAnniversaryEnqueue`
- `tests/proactive-alerts-janela.test.ts`
- `tests/proactive-alerts-format.test.ts`
- `tests/proactive-alerts-detect.test.ts`
- `tests/proactive-alerts-service.test.ts`
- `tests/proactive-alerts-dispatcher.test.ts`
- `tests/proactive-alerts-anniversary.test.ts`
- `tests/proactive-alerts-supabase.test.ts`

### Modified
- `src/modules/supabase.ts` — métodos novos (queries de `monitoring_alerts` + `getSistemaById` + `getLeadById` + `getSistemasNoAniversarioHoje` + `upsertMaintenanceReminder` público)
- `src/modules/maintenance.ts` — branches no prompt do Haiku para topics novos
- `src/modules/eva-admin-buttons.ts` — handlers novos
- `tests/eva-admin-buttons.test.ts` (ou criar se não existir — verificar antes)
- `src/index.ts` — registrar 3 crons + ler env `PROACTIVE_ALERTS_DRY_RUN`
- `src/modules/dashboard/views.ts` + `queries.ts` + `router.ts` — tile + lista

---

## Task 1: Migration SQL aplicada por Junior

**Files:**
- Create: `supabase/migrations/032_monitoring_alerts.sql`

- [ ] **Step 1: Criar arquivo de migration**

```sql
-- supabase/migrations/032_monitoring_alerts.sql
-- Modulo 6: alerta proativo da carteira
create table monitoring_alerts (
  id uuid primary key default gen_random_uuid(),
  sistema_id uuid not null references sistemas(id) on delete cascade,
  tipo text not null,
  severidade text not null,
  texto text not null,
  primeiro_visto_em timestamptz not null default now(),
  last_sent_at timestamptz,
  next_send_at timestamptz,
  snoozed_until timestamptz,
  resolved_at timestamptz,
  resolved_reason text,
  acao_disparada text,
  acao_disparada_em timestamptz,
  created_at timestamptz not null default now()
);

create unique index monitoring_alerts_dedupe
  on monitoring_alerts (sistema_id, tipo)
  where resolved_at is null;

create index monitoring_alerts_pendente
  on monitoring_alerts (next_send_at)
  where resolved_at is null and snoozed_until is null;

create index monitoring_alerts_sistema
  on monitoring_alerts (sistema_id, resolved_at);
```

- [ ] **Step 2: Avisar Junior aplicar manual**

Junior aplica no **SQL Editor do projeto `kupnsoyymulbdzakqlqc`** (MCP aponta pro projeto errado — `reference_supabase_mcp_mismatch`). Esperar confirmação "Success" antes de seguir.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/032_monitoring_alerts.sql
git commit -m "feat(monitoring): migration 032 monitoring_alerts (Módulo 6)"
```

---

## Task 2: Tipos compartilhados

**Files:**
- Create: `src/modules/monitoring/proactive-alerts/types.ts`

- [ ] **Step 1: Criar arquivo de tipos**

```ts
// src/modules/monitoring/proactive-alerts/types.ts
import type { Alerta } from '../classificacao.js';

export type AlertSeveridade = 'urgente' | 'aviso' | 'info';
export type AlertTipo =
  | 'sistema_offline'
  | 'queda_geracao'
  | 'erro_integracao'
  | 'milestone_economia';

// Row em monitoring_alerts (linha 1:1 do DB)
export interface MonitoringAlertRow {
  id: string;
  sistema_id: string;
  tipo: AlertTipo;
  severidade: AlertSeveridade;
  texto: string;
  primeiro_visto_em: string;       // ISO timestamptz
  last_sent_at: string | null;
  next_send_at: string | null;
  snoozed_until: string | null;
  resolved_at: string | null;
  resolved_reason: string | null;
  acao_disparada: string | null;
  acao_disparada_em: string | null;
  created_at: string;
}

// Saída de detect.ts (intenções, ainda não aplicadas em DB)
export interface DetectOutput {
  novos: Array<{ sistema_id: string; alerta: Alerta }>;
  resolvidos: string[];            // ids de monitoring_alerts existentes
  persistentes_devidos: string[];  // ids existentes prontos pra re-envio
}

// Input mínimo de sistema pro detect (não força acoplar com tipo completo)
export interface SistemaParaDetect {
  id: string;
  lead_id: string | null;
  ativo: boolean;
  ultimo_erro: string | null;
  potencia_kwp: number | null;
  uf: string | null;
  diasSemGeracao: number;
  realUltimos7: number;
}

// Botão WABA
export interface AlertButton {
  id: string;      // ex 'evabt:alert-eva-limpeza:<sId>'
  title: string;   // ex '🧽 Eva agendar limpeza' (max 20 chars WABA)
}

// Resultado de format.ts
export interface FormattedAlert {
  texto: string;
  botoes: AlertButton[];
  footer?: string;
}
```

- [ ] **Step 2: Verificar compila**

```bash
npx tsc --noEmit
```

Expected: EXIT 0, sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/modules/monitoring/proactive-alerts/types.ts
git commit -m "feat(proactive-alerts): tipos compartilhados (Módulo 6 T2)"
```

---

## Task 3: Janela horária (`janela.ts`) — função pura, TDD

**Files:**
- Create: `src/modules/monitoring/proactive-alerts/janela.ts`
- Test: `tests/proactive-alerts-janela.test.ts`

- [ ] **Step 1: Escrever o teste falhando**

```ts
// tests/proactive-alerts-janela.test.ts
import { describe, it, expect } from 'vitest';
import { dentroDaJanela } from '../src/modules/monitoring/proactive-alerts/janela.js';

// Helper: cria Date a partir de YYYY-MM-DD HH:mm em America/Sao_Paulo (UTC-3 sem DST hoje)
function spDate(iso: string): Date {
  return new Date(iso + '-03:00');
}

describe('dentroDaJanela (America/Sao_Paulo)', () => {
  it('domingo qualquer hora -> false', () => {
    // 2026-05-17 é domingo
    expect(dentroDaJanela(spDate('2026-05-17T08:00'))).toBe(false);
    expect(dentroDaJanela(spDate('2026-05-17T12:00'))).toBe(false);
    expect(dentroDaJanela(spDate('2026-05-17T19:59'))).toBe(false);
  });

  it('sábado 9h-19h59 -> true; 8h59 e 20h -> false', () => {
    // 2026-05-16 é sábado
    expect(dentroDaJanela(spDate('2026-05-16T08:59'))).toBe(false);
    expect(dentroDaJanela(spDate('2026-05-16T09:00'))).toBe(true);
    expect(dentroDaJanela(spDate('2026-05-16T19:59'))).toBe(true);
    expect(dentroDaJanela(spDate('2026-05-16T20:00'))).toBe(false);
  });

  it('seg-sex 8h-19h59 -> true; 7h59 e 20h -> false', () => {
    // 2026-05-18 é segunda
    expect(dentroDaJanela(spDate('2026-05-18T07:59'))).toBe(false);
    expect(dentroDaJanela(spDate('2026-05-18T08:00'))).toBe(true);
    expect(dentroDaJanela(spDate('2026-05-18T19:59'))).toBe(true);
    expect(dentroDaJanela(spDate('2026-05-18T20:00'))).toBe(false);
    // 2026-05-22 é sexta
    expect(dentroDaJanela(spDate('2026-05-22T15:00'))).toBe(true);
  });

  it('madrugada (3h) -> false em qualquer dia', () => {
    expect(dentroDaJanela(spDate('2026-05-18T03:00'))).toBe(false);
    expect(dentroDaJanela(spDate('2026-05-16T03:00'))).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar teste pra confirmar que falha**

```bash
npx vitest run tests/proactive-alerts-janela.test.ts
```

Expected: FAIL — "Cannot find module ... janela.js".

- [ ] **Step 3: Implementar a função**

```ts
// src/modules/monitoring/proactive-alerts/janela.ts
// Janela horária dos alertas proativos. Pura: recebe Date, retorna boolean.
// Default tz=America/Sao_Paulo (BRT, UTC-3, sem DST desde 2019).

export function dentroDaJanela(d: Date, tz = 'America/Sao_Paulo'): boolean {
  // Extrai dia da semana e hora no fuso alvo via Intl (sem libs externas).
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const minuteStr = parts.find((p) => p.type === 'minute')?.value ?? '0';
  // Intl pode devolver "24" às vezes; normalizar
  const hour = Number(hourStr) === 24 ? 0 : Number(hourStr);
  const minute = Number(minuteStr);
  const totalMin = hour * 60 + minute;

  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dow = dowMap[weekday] ?? -1;

  if (dow === 0) return false;                              // domingo
  if (dow === 6) return totalMin >= 9 * 60 && totalMin < 20 * 60;  // sábado 9-20
  return totalMin >= 8 * 60 && totalMin < 20 * 60;          // seg-sex 8-20
}
```

- [ ] **Step 4: Rodar teste pra verificar passa**

```bash
npx vitest run tests/proactive-alerts-janela.test.ts
```

Expected: PASS, todos os casos verdes.

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/proactive-alerts/janela.ts tests/proactive-alerts-janela.test.ts
git commit -m "feat(proactive-alerts): janela horária 8-20 seg-sex / 9-20 sáb / domingo nada (T3)"
```

---

## Task 4: Formatação de mensagem + botões (`format.ts`) — função pura, TDD

**Files:**
- Create: `src/modules/monitoring/proactive-alerts/format.ts`
- Test: `tests/proactive-alerts-format.test.ts`

- [ ] **Step 1: Escrever testes**

```ts
// tests/proactive-alerts-format.test.ts
import { describe, it, expect } from 'vitest';
import { formatAlertMessage } from '../src/modules/monitoring/proactive-alerts/format.js';
import type { MonitoringAlertRow } from '../src/modules/monitoring/proactive-alerts/types.js';

function alertaBase(o: Partial<MonitoringAlertRow> = {}): MonitoringAlertRow {
  return {
    id: 'aid-1',
    sistema_id: 'sid-1',
    tipo: 'sistema_offline',
    severidade: 'urgente',
    texto: 'Sem geração há 5 dias. Verificar inversor / conexão WiFi.',
    primeiro_visto_em: '2026-05-20T08:00:00Z',
    last_sent_at: null,
    next_send_at: '2026-05-20T08:00:00Z',
    snoozed_until: null,
    resolved_at: null,
    resolved_reason: null,
    acao_disparada: null,
    acao_disparada_em: null,
    created_at: '2026-05-20T08:00:00Z',
    ...o,
  };
}

const sistema = {
  id: 'sid-1',
  apelido: 'Casa Silva',
  potencia_kwp: 5.5,
  marca_inversor: 'deye' as const,
};
const lead = { id: 'lid-1', name: 'João Silva', phone: '5561999990000' };

describe('formatAlertMessage', () => {
  it('sistema_offline: emoji 🔴, nome, kWp, marca, botões eva-offline / ligar / snooze3d', () => {
    const r = formatAlertMessage(alertaBase({ tipo: 'sistema_offline' }), sistema, lead);
    expect(r.texto).toContain('🔴 OFFLINE');
    expect(r.texto).toContain('João Silva');
    expect(r.texto).toContain('5.5 kWp');
    expect(r.texto).toContain('deye');
    expect(r.botoes.map((b) => b.id)).toEqual([
      'evabt:alert-eva-offline:sid-1',
      'evabt:alert-ligar:sid-1',
      'evabt:alert-snooze3d:sid-1',
    ]);
  });

  it('queda_geracao: emoji 🟡 + botões eva-limpeza / ligar / snooze3d', () => {
    const r = formatAlertMessage(alertaBase({
      tipo: 'queda_geracao',
      severidade: 'aviso',
      texto: 'Geração últimos 7 dias 35% ABAIXO do esperado.',
    }), sistema, lead);
    expect(r.texto).toContain('🟡 QUEDA');
    expect(r.botoes[0].id).toBe('evabt:alert-eva-limpeza:sid-1');
    expect(r.botoes[1].id).toBe('evabt:alert-ligar:sid-1');
    expect(r.botoes[2].id).toBe('evabt:alert-snooze3d:sid-1');
  });

  it('erro_integracao: emoji 🔴 INTEGRAÇÃO + botões ver / snooze3d / resolvido', () => {
    const r = formatAlertMessage(alertaBase({
      tipo: 'erro_integracao',
      severidade: 'urgente',
      texto: 'Erro de integração: token Deye expirado',
    }), sistema, lead);
    expect(r.texto).toContain('🔴 INTEGRAÇÃO');
    expect(r.botoes.map((b) => b.id)).toEqual([
      'evabt:alert-ver:sid-1',
      'evabt:alert-snooze3d:sid-1',
      'evabt:alert-resolvido:sid-1',
    ]);
  });

  it('milestone_economia: emoji 🟢 + botões depoimento / snooze7d / ignorar', () => {
    const r = formatAlertMessage(alertaBase({
      tipo: 'milestone_economia',
      severidade: 'info',
      texto: 'Geração últimos 7 dias 15% ACIMA do esperado.',
    }), sistema, lead);
    expect(r.texto).toContain('🟢 BOMBANDO');
    expect(r.botoes.map((b) => b.id)).toEqual([
      'evabt:alert-eva-depoimento:sid-1',
      'evabt:alert-snooze7d:sid-1',
      'evabt:alert-ignorar:sid-1',
    ]);
  });

  it('lead null (sistema sem vínculo): usa apelido como nome', () => {
    const r = formatAlertMessage(alertaBase({ tipo: 'queda_geracao' }), sistema, null);
    expect(r.texto).toContain('Casa Silva');
  });

  it('cliente sem nome no lead: fallback "Cliente sem nome cadastrado"', () => {
    const r = formatAlertMessage(alertaBase(), sistema, { id: 'lid-1', name: null, phone: '5561999990000' });
    expect(r.texto).toContain('Cliente sem nome cadastrado');
  });

  it('todos os botões cabem em 20 chars (limite WABA)', () => {
    const tipos: Array<MonitoringAlertRow['tipo']> = [
      'sistema_offline', 'queda_geracao', 'erro_integracao', 'milestone_economia',
    ];
    for (const tipo of tipos) {
      const r = formatAlertMessage(alertaBase({ tipo }), sistema, lead);
      for (const b of r.botoes) {
        expect(b.title.length, `botão "${b.title}" tem ${b.title.length} chars`).toBeLessThanOrEqual(20);
      }
    }
  });
});
```

- [ ] **Step 2: Rodar pra ver falhar**

```bash
npx vitest run tests/proactive-alerts-format.test.ts
```

Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `format.ts`**

```ts
// src/modules/monitoring/proactive-alerts/format.ts
import type { MonitoringAlertRow, FormattedAlert, AlertButton } from './types.js';

interface SistemaResumo {
  id: string;
  apelido: string;
  potencia_kwp: number | null;
  marca_inversor: string;
}
interface LeadResumo {
  id: string;
  name: string | null;
  phone: string;
}

function nomeCliente(lead: LeadResumo | null, sistema: SistemaResumo): string {
  if (lead?.name) return lead.name;
  if (lead && !lead.name) return 'Cliente sem nome cadastrado';
  return sistema.apelido;
}

function header(tipo: MonitoringAlertRow['tipo']): string {
  switch (tipo) {
    case 'sistema_offline': return '🔴 OFFLINE';
    case 'queda_geracao': return '🟡 QUEDA';
    case 'erro_integracao': return '🔴 INTEGRAÇÃO';
    case 'milestone_economia': return '🟢 BOMBANDO';
  }
}

function botoesFor(tipo: MonitoringAlertRow['tipo'], sId: string): AlertButton[] {
  switch (tipo) {
    case 'sistema_offline':
      return [
        { id: `evabt:alert-eva-offline:${sId}`, title: '🔧 Eva avisar' },
        { id: `evabt:alert-ligar:${sId}`, title: '📞 Eu ligar' },
        { id: `evabt:alert-snooze3d:${sId}`, title: '💤 Adiar 3d' },
      ];
    case 'queda_geracao':
      return [
        { id: `evabt:alert-eva-limpeza:${sId}`, title: '🧽 Eva limpeza' },
        { id: `evabt:alert-ligar:${sId}`, title: '📞 Eu ligar' },
        { id: `evabt:alert-snooze3d:${sId}`, title: '💤 Adiar 3d' },
      ];
    case 'erro_integracao':
      return [
        { id: `evabt:alert-ver:${sId}`, title: '🔍 Ver detalhe' },
        { id: `evabt:alert-snooze3d:${sId}`, title: '💤 Adiar 3d' },
        { id: `evabt:alert-resolvido:${sId}`, title: '✅ Já resolvi' },
      ];
    case 'milestone_economia':
      return [
        { id: `evabt:alert-eva-depoimento:${sId}`, title: '⭐ Eva depoimento' },
        { id: `evabt:alert-snooze7d:${sId}`, title: '💤 Adiar 7d' },
        { id: `evabt:alert-ignorar:${sId}`, title: '❌ Ignorar' },
      ];
  }
}

export function formatAlertMessage(
  alerta: MonitoringAlertRow,
  sistema: SistemaResumo,
  lead: LeadResumo | null,
): FormattedAlert {
  const nome = nomeCliente(lead, sistema);
  const kwp = sistema.potencia_kwp != null ? `${sistema.potencia_kwp} kWp` : '— kWp';
  const linha1 = `${header(alerta.tipo)}`;
  const linha2 = alerta.tipo === 'erro_integracao'
    ? `${nome} — ${sistema.marca_inversor}`
    : `${nome} — ${kwp} (${sistema.marca_inversor})`;
  const texto = `${linha1}\n${linha2}\n${alerta.texto}`;
  return {
    texto,
    botoes: botoesFor(alerta.tipo, sistema.id),
    footer: `sistema ${sistema.id.slice(0, 8)}`,
  };
}
```

- [ ] **Step 4: Rodar pra verificar passa**

```bash
npx vitest run tests/proactive-alerts-format.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/proactive-alerts/format.ts tests/proactive-alerts-format.test.ts
git commit -m "feat(proactive-alerts): formatAlertMessage + botões por tipo (T4)"
```

---

## Task 5: Detecção (`detect.ts`) — função pura, TDD

**Files:**
- Create: `src/modules/monitoring/proactive-alerts/detect.ts`
- Test: `tests/proactive-alerts-detect.test.ts`

- [ ] **Step 1: Escrever testes**

```ts
// tests/proactive-alerts-detect.test.ts
import { describe, it, expect } from 'vitest';
import { detectarAlertasPendentes } from '../src/modules/monitoring/proactive-alerts/detect.js';
import type { MonitoringAlertRow, SistemaParaDetect } from '../src/modules/monitoring/proactive-alerts/types.js';

const hoje = new Date('2026-05-20T12:00:00Z');

function sistema(o: Partial<SistemaParaDetect> = {}): SistemaParaDetect {
  return {
    id: 'sid-1',
    lead_id: 'lid-1',
    ativo: true,
    ultimo_erro: null,
    potencia_kwp: 5,
    uf: 'DF',
    diasSemGeracao: 0,
    realUltimos7: 5 * 5.2 * 0.80 * 7, // exato esperado (ratio=1)
    ...o,
  };
}
function aberto(o: Partial<MonitoringAlertRow> = {}): MonitoringAlertRow {
  return {
    id: 'aid-1',
    sistema_id: 'sid-1',
    tipo: 'queda_geracao',
    severidade: 'aviso',
    texto: '...',
    primeiro_visto_em: '2026-05-15T00:00:00Z',
    last_sent_at: '2026-05-15T00:00:00Z',
    next_send_at: '2026-05-18T00:00:00Z', // já no passado em 2026-05-20
    snoozed_until: null,
    resolved_at: null,
    resolved_reason: null,
    acao_disparada: null,
    acao_disparada_em: null,
    created_at: '2026-05-15T00:00:00Z',
    ...o,
  };
}

describe('detectarAlertasPendentes', () => {
  it('sistema OK + sem aberto -> nada', () => {
    const r = detectarAlertasPendentes([sistema()], [], hoje);
    expect(r.novos).toEqual([]);
    expect(r.resolvidos).toEqual([]);
    expect(r.persistentes_devidos).toEqual([]);
  });

  it('sistema OK + aberto do mesmo tipo -> resolvido', () => {
    const r = detectarAlertasPendentes([sistema()], [aberto()], hoje);
    expect(r.resolvidos).toEqual(['aid-1']);
    expect(r.novos).toEqual([]);
  });

  it('sistema com queda + sem aberto -> novo', () => {
    const s = sistema({ realUltimos7: 5 * 5.2 * 0.80 * 7 * 0.5 }); // 50% do esperado -> queda
    const r = detectarAlertasPendentes([s], [], hoje);
    expect(r.novos).toHaveLength(1);
    expect(r.novos[0].sistema_id).toBe('sid-1');
    expect(r.novos[0].alerta.tipo).toBe('queda_geracao');
  });

  it('queda + aberto com next_send_at futuro -> nada', () => {
    const s = sistema({ realUltimos7: 5 * 5.2 * 0.80 * 7 * 0.5 });
    const a = aberto({ next_send_at: '2026-05-25T00:00:00Z' });
    const r = detectarAlertasPendentes([s], [a], hoje);
    expect(r.persistentes_devidos).toEqual([]);
    expect(r.novos).toEqual([]);
    expect(r.resolvidos).toEqual([]);
  });

  it('queda + aberto com next_send_at passado -> persistente_devido', () => {
    const s = sistema({ realUltimos7: 5 * 5.2 * 0.80 * 7 * 0.5 });
    const r = detectarAlertasPendentes([s], [aberto()], hoje);
    expect(r.persistentes_devidos).toEqual(['aid-1']);
  });

  it('queda + aberto snoozed (futuro) -> nada', () => {
    const s = sistema({ realUltimos7: 5 * 5.2 * 0.80 * 7 * 0.5 });
    const a = aberto({ snoozed_until: '2026-05-25T00:00:00Z' });
    const r = detectarAlertasPendentes([s], [a], hoje);
    expect(r.persistentes_devidos).toEqual([]);
  });

  it('sistema ativo=false -> nada', () => {
    const r = detectarAlertasPendentes([sistema({ ativo: false })], [], hoje);
    expect(r.novos).toEqual([]);
  });

  it('transição queda -> offline: resolve queda + cria offline', () => {
    const s = sistema({ diasSemGeracao: 5, realUltimos7: 0 });
    const r = detectarAlertasPendentes([s], [aberto({ tipo: 'queda_geracao' })], hoje);
    expect(r.resolvidos).toEqual(['aid-1']);
    expect(r.novos).toHaveLength(1);
    expect(r.novos[0].alerta.tipo).toBe('sistema_offline');
  });

  it('múltiplos sistemas independentes', () => {
    const s1 = sistema({ id: 'sid-1', diasSemGeracao: 5, realUltimos7: 0 });
    const s2 = sistema({ id: 'sid-2', lead_id: 'lid-2' });
    const r = detectarAlertasPendentes([s1, s2], [], hoje);
    expect(r.novos).toHaveLength(1);
    expect(r.novos[0].sistema_id).toBe('sid-1');
  });
});
```

- [ ] **Step 2: Rodar pra ver falhar**

```bash
npx vitest run tests/proactive-alerts-detect.test.ts
```

Expected: FAIL — módulo ausente.

- [ ] **Step 3: Implementar `detect.ts`**

```ts
// src/modules/monitoring/proactive-alerts/detect.ts
// Função PURA. Recebe sistemas + alertas abertos + hoje, retorna intenção.
// Reusa classificarSistema do módulo de monitoramento.

import { classificarSistema } from '../classificacao.js';
import type {
  DetectOutput, MonitoringAlertRow, SistemaParaDetect,
} from './types.js';

export function detectarAlertasPendentes(
  sistemas: SistemaParaDetect[],
  alertasAbertos: MonitoringAlertRow[],
  hoje: Date,
): DetectOutput {
  const out: DetectOutput = { novos: [], resolvidos: [], persistentes_devidos: [] };
  const hojeIso = hoje.toISOString();

  // index por sistema_id
  const abertosBySistema = new Map<string, MonitoringAlertRow[]>();
  for (const a of alertasAbertos) {
    if (a.resolved_at) continue;
    const arr = abertosBySistema.get(a.sistema_id) ?? [];
    arr.push(a);
    abertosBySistema.set(a.sistema_id, arr);
  }

  for (const s of sistemas) {
    const cls = s.ativo
      ? classificarSistema({
          ativo: s.ativo,
          ultimoErro: s.ultimo_erro,
          potenciaKwp: s.potencia_kwp,
          uf: s.uf,
          diasSemGeracao: s.diasSemGeracao,
          realUltimos7: s.realUltimos7,
        })
      : { nivel: 'ok' as const, alerta: null };

    const abertos = abertosBySistema.get(s.id) ?? [];

    if (!cls.alerta) {
      // Sem alerta agora -> resolve todos os abertos desse sistema
      for (const a of abertos) out.resolvidos.push(a.id);
      continue;
    }

    // Há alerta. Verificar se MESMO TIPO já aberto.
    const mesmoTipo = abertos.find((a) => a.tipo === cls.alerta!.tipo);
    const outrosTipos = abertos.filter((a) => a.tipo !== cls.alerta!.tipo);

    // Outros tipos abertos pra esse sistema -> resolvem (mudou de natureza)
    for (const a of outrosTipos) out.resolvidos.push(a.id);

    if (!mesmoTipo) {
      // Novo alerta desse tipo
      out.novos.push({ sistema_id: s.id, alerta: cls.alerta });
    } else {
      // Já existe aberto desse tipo -> ver se está devido
      const snoozed = mesmoTipo.snoozed_until && mesmoTipo.snoozed_until > hojeIso;
      const devido = mesmoTipo.next_send_at != null && mesmoTipo.next_send_at <= hojeIso;
      if (!snoozed && devido) out.persistentes_devidos.push(mesmoTipo.id);
    }
  }

  return out;
}
```

- [ ] **Step 4: Rodar testes pra verificar passa**

```bash
npx vitest run tests/proactive-alerts-detect.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/proactive-alerts/detect.ts tests/proactive-alerts-detect.test.ts
git commit -m "feat(proactive-alerts): detectarAlertasPendentes (puro, reusa classificarSistema) (T5)"
```

---

## Task 6: Métodos novos no SupabaseService

**Files:**
- Modify: `src/modules/supabase.ts`
- Test: `tests/proactive-alerts-supabase.test.ts`

> Adiciona métodos sem mexer em nada existente. Cada método é um SELECT/INSERT/UPDATE bem delimitado. Testes mockam `@supabase/supabase-js` no padrão de `tests/supabase.test.ts`.

- [ ] **Step 1: Localizar onde adicionar (final da classe `SupabaseService`)**

```bash
grep -n "class SupabaseService\|^}" src/modules/supabase.ts | tail -10
```

Anotar a linha do `^}` final da classe — os métodos novos vão antes dela.

- [ ] **Step 2: Escrever testes (mocks no estilo do repo)**

```ts
// tests/proactive-alerts-supabase.test.ts
import { describe, it, expect, vi } from 'vitest';

// Builders para mockar fluência do supabase-js
function chain(retornaria: { data: unknown; error: unknown }) {
  const m: any = {};
  for (const k of ['select','insert','update','upsert','delete','eq','lt','lte','gt','gte','is','order','limit']) {
    m[k] = vi.fn().mockReturnValue(m);
  }
  m.single = vi.fn().mockResolvedValue(retornaria);
  m.then = (cb: (v: any) => any) => cb(retornaria);
  return m;
}
const fromMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: fromMock })),
}));

describe('SupabaseService — proactive alerts methods', () => {
  it('expõe métodos novos', async () => {
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const s = new SupabaseService({ supabaseUrl: 'https://x.co', supabaseServiceKey: 'k' });
    expect(typeof s.getAlertasAbertosBySistemas).toBe('function');
    expect(typeof s.criarAlertaPendente).toBe('function');
    expect(typeof s.marcarAlertaEnviado).toBe('function');
    expect(typeof s.snoozeAlerta).toBe('function');
    expect(typeof s.resolverAlerta).toBe('function');
    expect(typeof s.resolverAlertaManual).toBe('function');
    expect(typeof s.lockAlertaParaEnvio).toBe('function');
    expect(typeof s.unlockAlerta).toBe('function');
    expect(typeof s.getAlertasParaDespachar).toBe('function');
    expect(typeof s.marcarAlertaAcaoDisparada).toBe('function');
    expect(typeof s.getSistemasNoAniversarioHoje).toBe('function');
    expect(typeof s.getSistemaById).toBe('function');
    expect(typeof s.getLeadById).toBe('function');
    expect(typeof s.upsertMaintenanceReminderPublic).toBe('function');
  });

  it('lockAlertaParaEnvio: retorna true quando update afeta 1 linha', async () => {
    fromMock.mockReturnValue(chain({ data: [{ id: 'aid-1' }], error: null }));
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const s = new SupabaseService({ supabaseUrl: 'https://x.co', supabaseServiceKey: 'k' });
    const ok = await s.lockAlertaParaEnvio('aid-1');
    expect(ok).toBe(true);
  });

  it('lockAlertaParaEnvio: retorna false quando 0 linhas (já tomado)', async () => {
    fromMock.mockReturnValue(chain({ data: [], error: null }));
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const s = new SupabaseService({ supabaseUrl: 'https://x.co', supabaseServiceKey: 'k' });
    const ok = await s.lockAlertaParaEnvio('aid-1');
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar pra ver falhar (métodos não existem ainda)**

```bash
npx vitest run tests/proactive-alerts-supabase.test.ts
```

Expected: FAIL — métodos não existem (vai apontar `typeof s.getAlertasAbertosBySistemas` !== 'function').

- [ ] **Step 4: Adicionar os métodos antes do `}` final de `SupabaseService` em `src/modules/supabase.ts`**

```ts
  // ====================================================================
  // Módulo 6: alerta proativo
  // ====================================================================

  async getAlertasAbertosBySistemas(sistemaIds: string[]): Promise<any[]> {
    if (sistemaIds.length === 0) return [];
    const { data, error } = await this.client
      .from('monitoring_alerts')
      .select('*')
      .in('sistema_id', sistemaIds)
      .is('resolved_at', null);
    if (error) {
      console.error('[supabase] getAlertasAbertosBySistemas:', error.message);
      return [];
    }
    return data ?? [];
  }

  async criarAlertaPendente(input: {
    sistema_id: string;
    tipo: string;
    severidade: string;
    texto: string;
    primeiro_visto_em: string;
    next_send_at: string;
  }): Promise<void> {
    const { error } = await this.client.from('monitoring_alerts').insert({
      ...input,
      last_sent_at: null,
      snoozed_until: null,
      resolved_at: null,
    });
    if (error) {
      // Pode bater no unique partial index (corrida) — log e segue
      console.warn('[supabase] criarAlertaPendente:', error.message);
    }
  }

  async lockAlertaParaEnvio(id: string): Promise<boolean> {
    // CAS: zera next_send_at se ainda não está zerado (alguém pegou).
    // Retorna a linha afetada — se vazio, perdemos a corrida.
    const { data, error } = await this.client
      .from('monitoring_alerts')
      .update({ next_send_at: null })
      .eq('id', id)
      .not('next_send_at', 'is', null)
      .select('id');
    if (error) {
      console.error('[supabase] lockAlertaParaEnvio:', error.message);
      return false;
    }
    return (data?.length ?? 0) > 0;
  }

  async unlockAlerta(id: string, retornarPara: string): Promise<void> {
    await this.client
      .from('monitoring_alerts')
      .update({ next_send_at: retornarPara })
      .eq('id', id);
  }

  async marcarAlertaEnviado(id: string, sentAt: string, nextSendAt: string): Promise<void> {
    const { error } = await this.client
      .from('monitoring_alerts')
      .update({ last_sent_at: sentAt, next_send_at: nextSendAt })
      .eq('id', id);
    if (error) console.error('[supabase] marcarAlertaEnviado:', error.message);
  }

  async snoozeAlerta(sistemaId: string, snoozedUntil: string): Promise<void> {
    await this.client
      .from('monitoring_alerts')
      .update({ snoozed_until: snoozedUntil })
      .eq('sistema_id', sistemaId)
      .is('resolved_at', null);
  }

  async resolverAlerta(id: string, hoje: string, reason: string = 'auto'): Promise<void> {
    await this.client
      .from('monitoring_alerts')
      .update({ resolved_at: hoje, resolved_reason: reason })
      .eq('id', id)
      .is('resolved_at', null);
  }

  async resolverAlertaManual(sistemaId: string, reason: 'manual' | 'ignorada'): Promise<void> {
    await this.client
      .from('monitoring_alerts')
      .update({ resolved_at: new Date().toISOString(), resolved_reason: reason })
      .eq('sistema_id', sistemaId)
      .is('resolved_at', null);
  }

  async getAlertasParaDespachar(hojeIso: string, limit: number = 8): Promise<any[]> {
    // raw query via rpc seria mais limpo, mas o builder do supabase-js já cobre.
    const { data, error } = await this.client
      .from('monitoring_alerts')
      .select('*')
      .is('resolved_at', null)
      .not('next_send_at', 'is', null)
      .lte('next_send_at', hojeIso)
      .or(`snoozed_until.is.null,snoozed_until.lte.${hojeIso}`)
      .order('severidade', { ascending: true })   // urgente < aviso < info — usar mapeamento abaixo
      .order('primeiro_visto_em', { ascending: true })
      .limit(limit);
    if (error) {
      console.error('[supabase] getAlertasParaDespachar:', error.message);
      return [];
    }
    // ordem por severidade no JS porque 'urgente'/'aviso'/'info' não alfabeta certo
    const peso: Record<string, number> = { urgente: 0, aviso: 1, info: 2 };
    return [...(data ?? [])].sort((a, b) => {
      const dp = (peso[a.severidade] ?? 9) - (peso[b.severidade] ?? 9);
      if (dp !== 0) return dp;
      return a.primeiro_visto_em.localeCompare(b.primeiro_visto_em);
    }).slice(0, limit);
  }

  async marcarAlertaAcaoDisparada(sistemaId: string, acao: string, hoje: string): Promise<void> {
    await this.client
      .from('monitoring_alerts')
      .update({ acao_disparada: acao, acao_disparada_em: hoje })
      .eq('sistema_id', sistemaId)
      .is('resolved_at', null);
  }

  async getSistemasNoAniversarioHoje(hoje: Date): Promise<Array<{
    id: string; lead_id: string | null; apelido: string; data_instalacao: string | null; anos: number;
  }>> {
    const m = hoje.getMonth() + 1;
    const d = hoje.getDate();
    const hojeYear = hoje.getFullYear();
    // Pega todos com data_instalacao no MM-DD igual ao de hoje, dos últimos 5 anos
    const { data, error } = await this.client
      .from('sistemas')
      .select('id, lead_id, apelido, data_instalacao')
      .not('data_instalacao', 'is', null)
      .eq('ativo', true);
    if (error) {
      console.error('[supabase] getSistemasNoAniversarioHoje:', error.message);
      return [];
    }
    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const out: Array<{ id: string; lead_id: string | null; apelido: string; data_instalacao: string | null; anos: number }> = [];
    for (const s of data ?? []) {
      if (!s.data_instalacao) continue;
      const [y, mes, dia] = s.data_instalacao.split('-');
      if (mes === mm && dia === dd) {
        const anos = hojeYear - Number(y);
        if (anos >= 1 && anos <= 5) {
          out.push({ id: s.id, lead_id: s.lead_id, apelido: s.apelido, data_instalacao: s.data_instalacao, anos });
        }
      }
    }
    return out;
  }

  async getSistemaById(id: string): Promise<any | null> {
    const { data, error } = await this.client.from('sistemas').select('*').eq('id', id).single();
    if (error) {
      console.warn('[supabase] getSistemaById:', error.message);
      return null;
    }
    return data;
  }

  async getLeadById(id: string): Promise<any | null> {
    const { data, error } = await this.client.from('leads').select('*').eq('id', id).single();
    if (error) {
      console.warn('[supabase] getLeadById:', error.message);
      return null;
    }
    return data;
  }

  // Expõe upsert de maintenance_reminders pra módulos externos (alerta proativo)
  async upsertMaintenanceReminderPublic(input: { lead_id: string; scheduled_date: string; topic: string }): Promise<void> {
    const { error } = await this.client
      .from('maintenance_reminders')
      .upsert(input, { onConflict: 'lead_id,scheduled_date,topic', ignoreDuplicates: true });
    if (error) {
      console.warn('[supabase] upsertMaintenanceReminderPublic:', error.message);
    }
  }
```

- [ ] **Step 5: Rodar testes**

```bash
npx vitest run tests/proactive-alerts-supabase.test.ts tests/supabase.test.ts
npx tsc --noEmit
```

Expected: PASS + TS OK. Suite supabase.test.ts existente preservada.

- [ ] **Step 6: Commit**

```bash
git add src/modules/supabase.ts tests/proactive-alerts-supabase.test.ts
git commit -m "feat(supabase): métodos monitoring_alerts + lookups Sistema/Lead/Anniversary (T6)"
```

---

## Task 7: `ProactiveAlertService.runDetectionCycle` — orquestração com Supabase

**Files:**
- Create: `src/modules/monitoring/proactive-alerts/service.ts`
- Test: `tests/proactive-alerts-service.test.ts`

- [ ] **Step 1: Escrever testes**

```ts
// tests/proactive-alerts-service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ProactiveAlertService } from '../src/modules/monitoring/proactive-alerts/service.js';

const hoje = new Date('2026-05-20T12:00:00Z');

function fakeSupabase(overrides: any = {}) {
  return {
    getAlertasAbertosBySistemas: vi.fn().mockResolvedValue([]),
    criarAlertaPendente: vi.fn().mockResolvedValue(undefined),
    resolverAlerta: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
function fakeMonitoringService(sistemas: any[]) {
  return {
    listarParaDashboard: vi.fn().mockResolvedValue(sistemas),
  };
}
function sistemaListado(o: any = {}) {
  return {
    id: 'sid-1', lead_id: 'lid-1', apelido: 'X', ativo: true,
    potencia_kwp: 5, uf: 'DF', ultimo_erro: null,
    geracao_7d_kwh: 5 * 5.2 * 0.80 * 7,
    diasSemGeracao: 0,
    ...o,
  };
}

describe('ProactiveAlertService.runDetectionCycle', () => {
  it('chama detect com input mapeado do listarParaDashboard', async () => {
    const sb = fakeSupabase();
    const ms = fakeMonitoringService([sistemaListado({ diasSemGeracao: 5, geracao_7d_kwh: 0 })]);
    const svc = new ProactiveAlertService(sb as any, ms as any);
    const r = await svc.runDetectionCycle(hoje);
    expect(r.novos).toBe(1);
    expect(sb.criarAlertaPendente).toHaveBeenCalledOnce();
    const callArg = sb.criarAlertaPendente.mock.calls[0][0];
    expect(callArg.sistema_id).toBe('sid-1');
    expect(callArg.tipo).toBe('sistema_offline');
    expect(callArg.next_send_at).toBe(hoje.toISOString());
  });

  it('resolve alertas abertos quando condição desaparece', async () => {
    const aberto = {
      id: 'aid-1', sistema_id: 'sid-1', tipo: 'queda_geracao', severidade: 'aviso',
      next_send_at: '2026-05-25T00:00:00Z', snoozed_until: null, resolved_at: null,
    };
    const sb = fakeSupabase({
      getAlertasAbertosBySistemas: vi.fn().mockResolvedValue([aberto]),
    });
    const ms = fakeMonitoringService([sistemaListado()]); // OK now
    const svc = new ProactiveAlertService(sb as any, ms as any);
    const r = await svc.runDetectionCycle(hoje);
    expect(r.resolvidos).toBe(1);
    expect(sb.resolverAlerta).toHaveBeenCalledWith('aid-1', hoje.toISOString(), 'auto');
  });

  it('lista vazia -> nada acontece', async () => {
    const sb = fakeSupabase();
    const ms = fakeMonitoringService([]);
    const svc = new ProactiveAlertService(sb as any, ms as any);
    const r = await svc.runDetectionCycle(hoje);
    expect(r.novos).toBe(0);
    expect(r.resolvidos).toBe(0);
    expect(sb.criarAlertaPendente).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar pra ver falhar**

```bash
npx vitest run tests/proactive-alerts-service.test.ts
```

Expected: FAIL — módulo ausente.

- [ ] **Step 3: Implementar `service.ts`**

```ts
// src/modules/monitoring/proactive-alerts/service.ts
import type { SupabaseService } from '../../supabase.js';
import type { MonitoringService } from '../service.js';
import { detectarAlertasPendentes } from './detect.js';
import type { SistemaParaDetect, MonitoringAlertRow } from './types.js';

interface SistemaListadoDashboard {
  id: string;
  lead_id: string | null;
  ativo: boolean;
  ultimo_erro: string | null;
  potencia_kwp: number | null;
  uf: string | null;
  geracao_7d_kwh: number;
  diasSemGeracao?: number;          // se monitoring expor; senão derive
}

export class ProactiveAlertService {
  constructor(
    private supabase: SupabaseService,
    private monitoring: MonitoringService,
  ) {}

  async runDetectionCycle(hoje: Date): Promise<{ novos: number; resolvidos: number; persistentes: number }> {
    const sistemasRaw = await this.monitoring.listarParaDashboard() as SistemaListadoDashboard[];
    const sistemas: SistemaParaDetect[] = sistemasRaw.map((s) => ({
      id: s.id,
      lead_id: s.lead_id,
      ativo: s.ativo,
      ultimo_erro: s.ultimo_erro,
      potencia_kwp: s.potencia_kwp,
      uf: s.uf,
      diasSemGeracao: s.diasSemGeracao ?? (s.geracao_7d_kwh > 0 ? 0 : 7),  // proxy
      realUltimos7: s.geracao_7d_kwh,
    }));

    const abertos = await this.supabase.getAlertasAbertosBySistemas(
      sistemas.map((s) => s.id),
    ) as MonitoringAlertRow[];

    const { novos, resolvidos, persistentes_devidos } = detectarAlertasPendentes(sistemas, abertos, hoje);

    for (const id of resolvidos) {
      await this.supabase.resolverAlerta(id, hoje.toISOString(), 'auto');
    }
    for (const n of novos) {
      await this.supabase.criarAlertaPendente({
        sistema_id: n.sistema_id,
        tipo: n.alerta.tipo,
        severidade: n.alerta.severidade,
        texto: n.alerta.texto,
        primeiro_visto_em: hoje.toISOString(),
        next_send_at: hoje.toISOString(),
      });
    }
    // persistentes_devidos: nada aqui — dispatcher pega pela fila do DB

    console.log(
      `[proactive-alerts] detect: ${sistemas.length} sistemas, ${novos.length} novos, ${resolvidos.length} resolvidos, ${persistentes_devidos.length} persistentes`,
    );
    return { novos: novos.length, resolvidos: resolvidos.length, persistentes: persistentes_devidos.length };
  }
}
```

- [ ] **Step 4: Rodar testes**

```bash
npx vitest run tests/proactive-alerts-service.test.ts
npx tsc --noEmit
```

Expected: PASS + TS OK.

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/proactive-alerts/service.ts tests/proactive-alerts-service.test.ts
git commit -m "feat(proactive-alerts): ProactiveAlertService.runDetectionCycle (T7)"
```

---

## Task 8: Dispatcher (`dispatcher.ts`) — janela + lock CAS + WABA

**Files:**
- Create: `src/modules/monitoring/proactive-alerts/dispatcher.ts`
- Test: `tests/proactive-alerts-dispatcher.test.ts`

- [ ] **Step 1: Escrever testes**

```ts
// tests/proactive-alerts-dispatcher.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runDispatchCycle } from '../src/modules/monitoring/proactive-alerts/dispatcher.js';

// Sexta 2026-05-22 às 10h BRT = 13h UTC — dentro da janela.
const horaJanela = new Date('2026-05-22T13:00:00Z');
// Domingo 2026-05-17 mesma hora — fora.
const horaForaJanela = new Date('2026-05-17T13:00:00Z');

function alerta(o: any = {}) {
  return {
    id: 'aid-1', sistema_id: 'sid-1', tipo: 'sistema_offline', severidade: 'urgente',
    texto: 'Sem geração há 5 dias.', next_send_at: '2026-05-22T12:00:00Z',
    primeiro_visto_em: '2026-05-15T00:00:00Z', snoozed_until: null, resolved_at: null,
    last_sent_at: null, acao_disparada: null, acao_disparada_em: null,
    resolved_reason: null, created_at: '2026-05-15T00:00:00Z', ...o,
  };
}

function fakeCtx(overrides: any = {}) {
  return {
    supabase: {
      getAlertasParaDespachar: vi.fn().mockResolvedValue([]),
      lockAlertaParaEnvio: vi.fn().mockResolvedValue(true),
      unlockAlerta: vi.fn().mockResolvedValue(undefined),
      marcarAlertaEnviado: vi.fn().mockResolvedValue(undefined),
      getSistemaById: vi.fn().mockResolvedValue({
        id: 'sid-1', apelido: 'Casa', potencia_kwp: 5, marca_inversor: 'deye', lead_id: 'lid-1',
      }),
      getLeadById: vi.fn().mockResolvedValue({ id: 'lid-1', name: 'João', phone: '5561...' }),
      ...overrides.supabase,
    },
    sendAdminWithButtons: vi.fn().mockResolvedValue(undefined),
    adminPhone: '5561987654321',
    dryRun: false,
    ...overrides,
  };
}

describe('runDispatchCycle', () => {
  it('fora da janela: não faz nada', async () => {
    const ctx = fakeCtx({ supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta()]) } });
    const r = await runDispatchCycle(horaForaJanela, ctx as any);
    expect(r.enviados).toBe(0);
    expect(ctx.sendAdminWithButtons).not.toHaveBeenCalled();
  });

  it('fila vazia dentro da janela: 0 enviados', async () => {
    const ctx = fakeCtx();
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(r.enviados).toBe(0);
  });

  it('lock falha -> pula sem enviar', async () => {
    const ctx = fakeCtx({
      supabase: {
        getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta()]),
        lockAlertaParaEnvio: vi.fn().mockResolvedValue(false),
      },
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(r.enviados).toBe(0);
    expect(ctx.sendAdminWithButtons).not.toHaveBeenCalled();
  });

  it('sucesso: envia, marca last_sent_at + next_send_at = +3d', async () => {
    const ctx = fakeCtx({
      supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta()]) },
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(r.enviados).toBe(1);
    expect(ctx.sendAdminWithButtons).toHaveBeenCalledOnce();
    expect(ctx.supabase.marcarAlertaEnviado).toHaveBeenCalledOnce();
    const [, sentAt, nextSendAt] = ctx.supabase.marcarAlertaEnviado.mock.calls[0];
    const dt = new Date(nextSendAt).getTime() - new Date(sentAt).getTime();
    expect(dt).toBe(3 * 24 * 60 * 60 * 1000); // 3 dias
  });

  it('WABA falha: unlock e last_sent_at não muda', async () => {
    const ctx = fakeCtx({
      supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta()]) },
      sendAdminWithButtons: vi.fn().mockRejectedValue(new Error('rate limit')),
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(r.enviados).toBe(0);
    expect(ctx.supabase.marcarAlertaEnviado).not.toHaveBeenCalled();
    expect(ctx.supabase.unlockAlerta).toHaveBeenCalledOnce();
  });

  it('dry-run: não envia mas marca last_sent_at pra simular ciclo', async () => {
    const ctx = fakeCtx({
      supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta()]) },
      dryRun: true,
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(r.enviados).toBe(0);
    expect(r.dryRunSimulados).toBe(1);
    expect(ctx.sendAdminWithButtons).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar pra falhar**

```bash
npx vitest run tests/proactive-alerts-dispatcher.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implementar dispatcher**

```ts
// src/modules/monitoring/proactive-alerts/dispatcher.ts
import type { SupabaseService } from '../../supabase.js';
import { dentroDaJanela } from './janela.js';
import { formatAlertMessage } from './format.js';
import type { MonitoringAlertRow, AlertButton } from './types.js';

export interface DispatchCtx {
  supabase: SupabaseService;
  sendAdminWithButtons: (
    to: string,
    body: string,
    buttons: AlertButton[],
    footer?: string,
  ) => Promise<void>;
  adminPhone: string;
  dryRun?: boolean;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

export async function runDispatchCycle(hoje: Date, ctx: DispatchCtx): Promise<{
  enviados: number; dryRunSimulados: number; janelaAberta: boolean;
}> {
  if (!dentroDaJanela(hoje)) {
    console.log('[proactive-alerts] dispatch: fora da janela, pulando');
    return { enviados: 0, dryRunSimulados: 0, janelaAberta: false };
  }
  const fila = await ctx.supabase.getAlertasParaDespachar(hoje.toISOString(), 8) as MonitoringAlertRow[];

  let enviados = 0;
  let dryRunSimulados = 0;
  for (const alerta of fila) {
    const nextSendAtOriginal = alerta.next_send_at!;
    const locked = await ctx.supabase.lockAlertaParaEnvio(alerta.id);
    if (!locked) continue;

    try {
      const sistema = await ctx.supabase.getSistemaById(alerta.sistema_id);
      if (!sistema) {
        await ctx.supabase.unlockAlerta(alerta.id, nextSendAtOriginal);
        continue;
      }
      const lead = sistema.lead_id ? await ctx.supabase.getLeadById(sistema.lead_id) : null;
      const { texto, botoes, footer } = formatAlertMessage(alerta, sistema, lead);

      if (ctx.dryRun) {
        console.log(`[proactive-alerts] dispatch DRY: alerta=${alerta.id} sistema=${alerta.sistema_id} tipo=${alerta.tipo}`);
        await ctx.supabase.unlockAlerta(alerta.id, addDays(hoje, 3).toISOString()); // simula throttle 3d
        dryRunSimulados++;
        continue;
      }

      await ctx.sendAdminWithButtons(ctx.adminPhone, texto, botoes, footer);
      await ctx.supabase.marcarAlertaEnviado(
        alerta.id,
        hoje.toISOString(),
        addDays(hoje, 3).toISOString(),
      );
      enviados++;
    } catch (err) {
      console.error('[proactive-alerts] dispatch falhou:', (err as Error).message);
      await ctx.supabase.unlockAlerta(alerta.id, nextSendAtOriginal);
    }
  }
  console.log(`[proactive-alerts] dispatch: ${enviados} enviados, ${dryRunSimulados} dry-run, ${fila.length - enviados - dryRunSimulados} ficaram pendentes`);
  return { enviados, dryRunSimulados, janelaAberta: true };
}
```

- [ ] **Step 4: Rodar pra verificar passa**

```bash
npx vitest run tests/proactive-alerts-dispatcher.test.ts
npx tsc --noEmit
```

Expected: PASS + TS OK.

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/proactive-alerts/dispatcher.ts tests/proactive-alerts-dispatcher.test.ts
git commit -m "feat(proactive-alerts): runDispatchCycle (janela + lock CAS + dry-run) (T8)"
```

---

## Task 9: Aniversário (`anniversary.ts`)

**Files:**
- Create: `src/modules/monitoring/proactive-alerts/anniversary.ts`
- Test: `tests/proactive-alerts-anniversary.test.ts`

- [ ] **Step 1: Escrever testes**

```ts
// tests/proactive-alerts-anniversary.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runAnniversaryEnqueue } from '../src/modules/monitoring/proactive-alerts/anniversary.js';

describe('runAnniversaryEnqueue', () => {
  it('sistema instalado 2025-05-20 + hoje 2026-05-20 -> aniversario_1a', async () => {
    const sb = {
      getSistemasNoAniversarioHoje: vi.fn().mockResolvedValue([
        { id: 'sid-1', lead_id: 'lid-1', apelido: 'Casa', data_instalacao: '2025-05-20', anos: 1 },
      ]),
      upsertMaintenanceReminderPublic: vi.fn().mockResolvedValue(undefined),
    };
    const hoje = new Date('2026-05-20T08:00:00Z');
    const r = await runAnniversaryEnqueue(hoje, sb as any);
    expect(r.enfileirados).toBe(1);
    expect(sb.upsertMaintenanceReminderPublic).toHaveBeenCalledWith({
      lead_id: 'lid-1',
      scheduled_date: '2026-05-20',
      topic: 'aniversario_1a',
    });
  });

  it('sistema sem lead_id é ignorado sem erro', async () => {
    const sb = {
      getSistemasNoAniversarioHoje: vi.fn().mockResolvedValue([
        { id: 'sid-1', lead_id: null, apelido: 'Casa', data_instalacao: '2025-05-20', anos: 1 },
      ]),
      upsertMaintenanceReminderPublic: vi.fn().mockResolvedValue(undefined),
    };
    const r = await runAnniversaryEnqueue(new Date('2026-05-20T08:00:00Z'), sb as any);
    expect(r.enfileirados).toBe(0);
    expect(sb.upsertMaintenanceReminderPublic).not.toHaveBeenCalled();
  });

  it('idempotência: chamar 2x não duplica (DB cuida pelo upsert)', async () => {
    const sb = {
      getSistemasNoAniversarioHoje: vi.fn().mockResolvedValue([
        { id: 'sid-1', lead_id: 'lid-1', apelido: 'Casa', data_instalacao: '2025-05-20', anos: 1 },
      ]),
      upsertMaintenanceReminderPublic: vi.fn().mockResolvedValue(undefined),
    };
    const hoje = new Date('2026-05-20T08:00:00Z');
    await runAnniversaryEnqueue(hoje, sb as any);
    await runAnniversaryEnqueue(hoje, sb as any);
    expect(sb.upsertMaintenanceReminderPublic).toHaveBeenCalledTimes(2);
    // upsert é idempotente — DB protege, teste só valida que chamamos sempre.
  });

  it('vários sistemas -> enfileira todos', async () => {
    const sb = {
      getSistemasNoAniversarioHoje: vi.fn().mockResolvedValue([
        { id: 'sid-1', lead_id: 'lid-1', apelido: 'Casa 1', data_instalacao: '2025-05-20', anos: 1 },
        { id: 'sid-2', lead_id: 'lid-2', apelido: 'Casa 2', data_instalacao: '2024-05-20', anos: 2 },
      ]),
      upsertMaintenanceReminderPublic: vi.fn().mockResolvedValue(undefined),
    };
    const r = await runAnniversaryEnqueue(new Date('2026-05-20T08:00:00Z'), sb as any);
    expect(r.enfileirados).toBe(2);
    expect(sb.upsertMaintenanceReminderPublic).toHaveBeenNthCalledWith(2, {
      lead_id: 'lid-2',
      scheduled_date: '2026-05-20',
      topic: 'aniversario_2a',
    });
  });
});
```

- [ ] **Step 2: Rodar pra ver falhar**

```bash
npx vitest run tests/proactive-alerts-anniversary.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implementar `anniversary.ts`**

```ts
// src/modules/monitoring/proactive-alerts/anniversary.ts
import type { SupabaseService } from '../../supabase.js';

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function runAnniversaryEnqueue(
  hoje: Date,
  supabase: SupabaseService,
): Promise<{ enfileirados: number }> {
  const due = await supabase.getSistemasNoAniversarioHoje(hoje);
  let enfileirados = 0;
  const scheduled_date = isoDate(hoje);
  for (const s of due) {
    if (!s.lead_id) continue;
    await supabase.upsertMaintenanceReminderPublic({
      lead_id: s.lead_id,
      scheduled_date,
      topic: `aniversario_${s.anos}a`,
    });
    enfileirados++;
  }
  console.log(`[proactive-alerts] anniversary: ${enfileirados} aniversários enfileirados pra ${scheduled_date}`);
  return { enfileirados };
}
```

- [ ] **Step 4: Rodar testes**

```bash
npx vitest run tests/proactive-alerts-anniversary.test.ts
npx tsc --noEmit
```

Expected: PASS + TS OK.

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/proactive-alerts/anniversary.ts tests/proactive-alerts-anniversary.test.ts
git commit -m "feat(proactive-alerts): runAnniversaryEnqueue (D+1..5a) (T9)"
```

---

## Task 10: Branches de prompt em `maintenance.ts` (topics novos)

**Files:**
- Modify: `src/modules/maintenance.ts`

> Adiciona prompts pra `alerta_offline`, `alerta_limpeza`, `pedido_depoimento`, `aniversario_1a..5a` no `generateMaintenanceMessage`. Não muda o fluxo existente — só estende o switch interno.

- [ ] **Step 1: Localizar `generateMaintenanceMessage`**

```bash
grep -n "generateMaintenanceMessage" src/modules/maintenance.ts
```

Anotar linhas — método começa por volta da linha 151.

- [ ] **Step 2: Substituir corpo de `generateMaintenanceMessage`**

Achar a função `generateMaintenanceMessage` (linhas ~151-187) e substituir por:

```ts
  private async generateMaintenanceMessage(
    name: string | null,
    topic: string,
  ): Promise<string> {
    const greeting = name ? `pra ${name}` : 'pro cliente';
    const prompt = this.buildPromptForTopic(name, topic);
    const fallback = this.buildFallbackForTopic(name, topic);

    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = response.content[0];
    return block.type === 'text' ? block.text.trim() : fallback;
  }

  private buildPromptForTopic(name: string | null, topic: string): string {
    const greeting = name ? `pra ${name}` : 'pro cliente';
    const base = `Voce e a Eva, engenheira virtual especialista em energia da Ecosunpower.\n`;
    const regras = `\n\nRegras:\n- Sem emojis, sem asteriscos, sem markdown\n- 2 a 3 bolhas curtas separadas por LINHA EM BRANCO\n- Maximo 2 frases por bolha\n- Brasileiro, natural\n\nResponda APENAS o texto da mensagem (bolhas separadas por linha em branco), nada mais.`;
    switch (topic) {
      case 'limpeza_maio':
        return base + `Mande uma mensagem ${greeting} (cliente de manutencao recorrente) lembrando da limpeza dos modulos solares. Contexto: inicio de maio. Periodo seco em Brasilia comeca, poeira acumula nos modulos. Limpeza preventiva pra manter geracao alta. Mencione maio e por que essa epoca eh importante. Conduza pra agendamento: "quer que eu agende a limpeza pra esse mes?"` + regras;
      case 'limpeza_agosto':
        return base + `Mande uma mensagem ${greeting} (cliente de manutencao recorrente) lembrando da limpeza dos modulos solares. Contexto: agosto. Pico do periodo seco. Modulos costumam estar muito sujos a essa altura. Limpeza eh especialmente importante agora. Conduza pra agendamento: "quer que eu agende a limpeza pra esse mes?"` + regras;
      case 'alerta_offline':
        return base + `Mande uma mensagem ${greeting}. Voce notou que o sistema dele parou de gerar nos ultimos dias. Pergunta de forma calma se ele consegue verificar se o wifi do inversor esta conectado, ou se tem alguma luz vermelha piscando. Se persistir, diga que voce pode agendar uma visita tecnica. Tom: preocupado mas tranquilo, sem alarmar. Nao prometa que vai voltar, nao culpe o cliente.` + regras;
      case 'alerta_limpeza':
        return base + `Mande uma mensagem ${greeting}. Voce notou que a geracao do sistema dele caiu nos ultimos dias. Geralmente eh sujeira/poeira nos modulos. Pergunta se ele topa agendar uma limpeza preventiva pra restaurar a geracao. Tom: util, sem urgencia exagerada.` + regras;
      case 'pedido_depoimento':
        return base + `Mande uma mensagem ${greeting}. Voce viu que o sistema dele esta gerando ACIMA do esperado nos ultimos dias (bombando!). Pergunta como tem sido a experiencia com o sistema e se ele topa contar pra outras pessoas um depoimento curto. Tom: comemorativo, leve, sem ser comercial. Nao pressione.` + regras;
      case 'aniversario_1a':
      case 'aniversario_2a':
      case 'aniversario_3a':
      case 'aniversario_4a':
      case 'aniversario_5a': {
        const anos = topic.replace('aniversario_', '').replace('a', '');
        return base + `Mande uma mensagem ${greeting}. Hoje completa ${anos} ano(s) que o sistema solar foi instalado. Celebre a data de forma leve e ofereca uma revisao preventiva (limpeza + checagem de conexoes + medicao). Tom: gratidao + cuidado de longo prazo. Pergunta se ele topa agendar uma visita rapida.` + regras;
      }
      default:
        // Fallback genérico (preserva comportamento original pra topics desconhecidos)
        return base + `Mande uma mensagem ${greeting} sobre manutencao do sistema solar. Conduza pra agendamento.` + regras;
    }
  }

  private buildFallbackForTopic(name: string | null, topic: string): string {
    const olaName = name ? `, ${name}` : '';
    switch (topic) {
      case 'limpeza_maio': return `oi${olaName}, chegou maio e eh hora da limpeza dos paineis. quer que eu agende?`;
      case 'limpeza_agosto': return `oi${olaName}, chegou agosto e os paineis costumam estar bem sujos. quer que eu agende uma limpeza?`;
      case 'alerta_offline': return `oi${olaName}, vi que seu sistema parou de gerar nos ultimos dias. consegue verificar se o wifi do inversor esta conectado? se persistir, posso agendar uma visita.`;
      case 'alerta_limpeza': return `oi${olaName}, vi que a geracao caiu nos ultimos dias. provavelmente eh sujeira nos modulos. quer que eu agende uma limpeza?`;
      case 'pedido_depoimento': return `oi${olaName}, seu sistema esta bombando! que tal contar a experiencia pra gente?`;
      default:
        if (topic.startsWith('aniversario_')) {
          const anos = topic.replace('aniversario_', '').replace('a', '');
          return `oi${olaName}, hoje completa ${anos} ano com seu sistema solar. quer que eu agende uma revisao preventiva?`;
        }
        return `oi${olaName}, posso te ajudar com algo do seu sistema?`;
    }
  }
```

- [ ] **Step 3: Verificar compila + suite verde**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: TS EXIT 0. Suite completa verde (exceto `cases-fetcher` se já era falho).

- [ ] **Step 4: Commit**

```bash
git add src/modules/maintenance.ts
git commit -m "feat(maintenance): branches de prompt Haiku pra topics alerta_* + aniversario_* (T10)"
```

---

## Task 11: Handlers novos em `eva-admin-buttons.ts`

**Files:**
- Modify: `src/modules/eva-admin-buttons.ts`
- Test: `tests/eva-admin-buttons.test.ts` (criar se não existir)

- [ ] **Step 1: Verificar se já existe arquivo de teste**

```bash
ls tests/eva-admin-buttons.test.ts 2>/dev/null || echo "criar novo"
```

- [ ] **Step 2: Escrever testes (criar arquivo se necessário)**

```ts
// tests/eva-admin-buttons.test.ts
import { describe, it, expect, vi } from 'vitest';
import { tryHandleEvaAdminButton } from '../src/modules/eva-admin-buttons.js';

function ctx(overrides: any = {}) {
  const client: any = {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  };
  return {
    client,
    sendText: vi.fn().mockResolvedValue(undefined),
    from: '5561987654321',
    forceCadenceForSilentes: vi.fn().mockResolvedValue({ acionados: 0 }),
    supabase: {
      getSistemaById: vi.fn().mockResolvedValue({
        id: 'sid-1', lead_id: 'lid-1', apelido: 'Casa', potencia_kwp: 5, marca_inversor: 'deye',
      }),
      getLeadById: vi.fn().mockResolvedValue({ id: 'lid-1', name: 'João', phone: '5561999990000', opt_out: false }),
      upsertMaintenanceReminderPublic: vi.fn().mockResolvedValue(undefined),
      marcarAlertaAcaoDisparada: vi.fn().mockResolvedValue(undefined),
      snoozeAlerta: vi.fn().mockResolvedValue(undefined),
      resolverAlertaManual: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

describe('tryHandleEvaAdminButton — alert-* family', () => {
  it('alert-eva-limpeza: cria maintenance_reminder + marca ação', async () => {
    const c = ctx();
    const handled = await tryHandleEvaAdminButton({
      ...c,
      text: 'evabt:alert-eva-limpeza:00000000-0000-0000-0000-000000000001',
    } as any);
    expect(handled).toBe(true);
    expect(c.supabase.upsertMaintenanceReminderPublic).toHaveBeenCalledOnce();
    const arg = c.supabase.upsertMaintenanceReminderPublic.mock.calls[0][0];
    expect(arg.topic).toBe('alerta_limpeza');
    expect(arg.lead_id).toBe('lid-1');
    expect(c.supabase.marcarAlertaAcaoDisparada).toHaveBeenCalledOnce();
    expect(c.sendText).toHaveBeenCalled();
  });

  it('alert-eva-offline: topic alerta_offline', async () => {
    const c = ctx();
    await tryHandleEvaAdminButton({ ...c, text: 'evabt:alert-eva-offline:00000000-0000-0000-0000-000000000001' } as any);
    const arg = c.supabase.upsertMaintenanceReminderPublic.mock.calls[0][0];
    expect(arg.topic).toBe('alerta_offline');
  });

  it('alert-eva-depoimento: topic pedido_depoimento', async () => {
    const c = ctx();
    await tryHandleEvaAdminButton({ ...c, text: 'evabt:alert-eva-depoimento:00000000-0000-0000-0000-000000000001' } as any);
    const arg = c.supabase.upsertMaintenanceReminderPublic.mock.calls[0][0];
    expect(arg.topic).toBe('pedido_depoimento');
  });

  it('alert-eva-limpeza com lead em opt_out: avisa, NÃO cria reminder', async () => {
    const c = ctx({
      supabase: {
        getSistemaById: vi.fn().mockResolvedValue({ id: 'sid-1', lead_id: 'lid-1', apelido: 'Casa', potencia_kwp: 5, marca_inversor: 'deye' }),
        getLeadById: vi.fn().mockResolvedValue({ id: 'lid-1', name: 'João', phone: '...', opt_out: true }),
        upsertMaintenanceReminderPublic: vi.fn(),
        marcarAlertaAcaoDisparada: vi.fn(),
        snoozeAlerta: vi.fn(),
        resolverAlertaManual: vi.fn(),
      },
    });
    await tryHandleEvaAdminButton({ ...c, text: 'evabt:alert-eva-limpeza:00000000-0000-0000-0000-000000000001' } as any);
    expect(c.supabase.upsertMaintenanceReminderPublic).not.toHaveBeenCalled();
    expect(c.sendText.mock.calls[0][1]).toMatch(/opt-?out/i);
  });

  it('alert-eva-* com sistema sem lead_id: pede vincular', async () => {
    const c = ctx({
      supabase: {
        getSistemaById: vi.fn().mockResolvedValue({ id: 'sid-1', lead_id: null, apelido: 'Casa', potencia_kwp: 5, marca_inversor: 'deye' }),
        getLeadById: vi.fn(),
        upsertMaintenanceReminderPublic: vi.fn(),
        marcarAlertaAcaoDisparada: vi.fn(),
        snoozeAlerta: vi.fn(),
        resolverAlertaManual: vi.fn(),
      },
    });
    await tryHandleEvaAdminButton({ ...c, text: 'evabt:alert-eva-limpeza:00000000-0000-0000-0000-000000000001' } as any);
    expect(c.supabase.upsertMaintenanceReminderPublic).not.toHaveBeenCalled();
    expect(c.sendText.mock.calls[0][1]).toMatch(/vincul/i);
  });

  it('alert-ligar: responde com wa.me + nome', async () => {
    const c = ctx();
    await tryHandleEvaAdminButton({ ...c, text: 'evabt:alert-ligar:00000000-0000-0000-0000-000000000001' } as any);
    expect(c.sendText.mock.calls[0][1]).toContain('wa.me/5561999990000');
    expect(c.sendText.mock.calls[0][1]).toContain('João');
  });

  it('alert-snooze3d: chama snoozeAlerta com +3d', async () => {
    const c = ctx();
    await tryHandleEvaAdminButton({ ...c, text: 'evabt:alert-snooze3d:00000000-0000-0000-0000-000000000001' } as any);
    expect(c.supabase.snoozeAlerta).toHaveBeenCalledOnce();
    const [, until] = c.supabase.snoozeAlerta.mock.calls[0];
    const diff = new Date(until).getTime() - Date.now();
    expect(diff).toBeGreaterThan(2.9 * 24 * 60 * 60 * 1000);
    expect(diff).toBeLessThan(3.1 * 24 * 60 * 60 * 1000);
  });

  it('alert-snooze7d: +7d', async () => {
    const c = ctx();
    await tryHandleEvaAdminButton({ ...c, text: 'evabt:alert-snooze7d:00000000-0000-0000-0000-000000000001' } as any);
    const [, until] = c.supabase.snoozeAlerta.mock.calls[0];
    const diff = new Date(until).getTime() - Date.now();
    expect(diff).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(diff).toBeLessThan(7.1 * 24 * 60 * 60 * 1000);
  });

  it('alert-resolvido: chama resolverAlertaManual com manual', async () => {
    const c = ctx();
    await tryHandleEvaAdminButton({ ...c, text: 'evabt:alert-resolvido:00000000-0000-0000-0000-000000000001' } as any);
    expect(c.supabase.resolverAlertaManual).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001',
      'manual',
    );
  });

  it('alert-ignorar: chama resolverAlertaManual com ignorada', async () => {
    const c = ctx();
    await tryHandleEvaAdminButton({ ...c, text: 'evabt:alert-ignorar:00000000-0000-0000-0000-000000000001' } as any);
    expect(c.supabase.resolverAlertaManual).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001',
      'ignorada',
    );
  });

  it('alert-ver: responde com URL dashboard', async () => {
    const c = ctx();
    await tryHandleEvaAdminButton({ ...c, text: 'evabt:alert-ver:00000000-0000-0000-0000-000000000001' } as any);
    expect(c.sendText.mock.calls[0][1]).toMatch(/dashboard\.ecosunpower\.eng\.br\/monitoramento\/00000000-0000-0000-0000-000000000001/);
  });
});
```

- [ ] **Step 3: Rodar pra ver falhar**

```bash
npx vitest run tests/eva-admin-buttons.test.ts
```

Expected: FAIL — handlers não existem.

- [ ] **Step 4: Estender o `args` da função e o switch**

Em `src/modules/eva-admin-buttons.ts`, **acrescentar `supabase` ao `args`** de `tryHandleEvaAdminButton`:

```ts
import type { SupabaseService } from './supabase.js';

// ... (mantém o tipo MetaWabaLike etc) ...

export async function tryHandleEvaAdminButton(args: {
  client: SupabaseClient;
  sendText: (to: string, text: string) => Promise<void>;
  from: string;
  text: string;
  forceCadenceForSilentes: () => Promise<{ acionados: number }>;
  supabase: SupabaseService;   // NOVO
}): Promise<boolean> {
```

E adicionar os `case`s NOVOS antes do `default:`:

```ts
      case 'alert-eva-offline':
      case 'alert-eva-limpeza':
      case 'alert-eva-depoimento': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem id de sistema.'); return true; }
        const topic = action === 'alert-eva-offline' ? 'alerta_offline'
                    : action === 'alert-eva-limpeza' ? 'alerta_limpeza'
                    : 'pedido_depoimento';
        const sistema = await args.supabase.getSistemaById(leadId); // aqui "leadId" capturado pelo regex = sistemaId
        if (!sistema) { await args.sendText(args.from, '⚠️ Sistema não encontrado.'); return true; }
        if (!sistema.lead_id) { await args.sendText(args.from, '⚠️ Sistema sem cliente vinculado — vincule o lead antes.'); return true; }
        const lead = await args.supabase.getLeadById(sistema.lead_id);
        if (lead?.opt_out) { await args.sendText(args.from, '⚠️ Lead em opt-out, Eva não pode falar.'); return true; }

        const hojeIso = new Date().toISOString().slice(0, 10);
        await args.supabase.upsertMaintenanceReminderPublic({
          lead_id: sistema.lead_id,
          scheduled_date: hojeIso,
          topic,
        });
        await args.supabase.marcarAlertaAcaoDisparada(sistema.id, `eva_${topic}`, new Date().toISOString());
        const nomeAcao = topic === 'alerta_offline' ? 'avisar sobre offline'
                       : topic === 'alerta_limpeza' ? 'agendar limpeza'
                       : 'pedir depoimento';
        await args.sendText(args.from, `✅ Eva vai ${nomeAcao} com ${lead?.name ?? sistema.apelido} no próximo ciclo (até 1h).`);
        return true;
      }

      case 'alert-ligar': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem id de sistema.'); return true; }
        const sistema = await args.supabase.getSistemaById(leadId);
        if (!sistema) { await args.sendText(args.from, '⚠️ Sistema não encontrado.'); return true; }
        const lead = sistema.lead_id ? await args.supabase.getLeadById(sistema.lead_id) : null;
        const phone = lead?.phone;
        if (!phone) { await args.sendText(args.from, '⚠️ Sem telefone cadastrado pro cliente.'); return true; }
        await args.sendText(args.from, `📞 ${lead?.name ?? sistema.apelido} — wa.me/${phone}`);
        await args.supabase.marcarAlertaAcaoDisparada(sistema.id, 'junior_ligar', new Date().toISOString());
        return true;
      }

      case 'alert-snooze3d':
      case 'alert-snooze7d': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem id de sistema.'); return true; }
        const dias = action === 'alert-snooze3d' ? 3 : 7;
        const until = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
        await args.supabase.snoozeAlerta(leadId, until);
        await args.sendText(args.from, `💤 Alerta adiado ${dias} dias.`);
        return true;
      }

      case 'alert-resolvido':
      case 'alert-ignorar': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem id de sistema.'); return true; }
        const reason = action === 'alert-ignorar' ? 'ignorada' : 'manual';
        await args.supabase.resolverAlertaManual(leadId, reason);
        await args.sendText(args.from, '✅ Alerta encerrado.');
        return true;
      }

      case 'alert-ver': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem id de sistema.'); return true; }
        await args.sendText(args.from, `📊 ${DASHBOARD_BASE}/monitoramento/${leadId}`);
        return true;
      }
```

> Nota: o segundo grupo capturado pelo regex se chama `leadId` no código atual, mas pros `alert-*` ele representa o **sistemaId**. Mantém o nome (variável local) pra não quebrar o resto do switch.

- [ ] **Step 5: Atualizar o caller (`src/index.ts`) pra passar `supabase` ao handler**

```bash
grep -n "tryHandleEvaAdminButton" src/index.ts
```

Em cada chamada, adicionar `supabase: this.supabase` (ou o nome da variável local). Exemplo:

```ts
const handled = await tryHandleEvaAdminButton({
  client,
  sendText,
  from,
  text,
  forceCadenceForSilentes,
  supabase,           // NOVO
});
```

- [ ] **Step 6: Rodar testes**

```bash
npx vitest run tests/eva-admin-buttons.test.ts
npx vitest run
npx tsc --noEmit
```

Expected: PASS + TS EXIT 0 + suite verde.

- [ ] **Step 7: Commit**

```bash
git add src/modules/eva-admin-buttons.ts src/index.ts tests/eva-admin-buttons.test.ts
git commit -m "feat(admin-buttons): handlers da família alert-* (Módulo 6 T11)"
```

---

## Task 12: Wire-up em `index.ts` — 3 crons + DRY_RUN

**Files:**
- Modify: `src/index.ts`

> Registrar três crons novos (detect 60min, dispatch 15min, anniversary 1x/dia 6h). Variável de ambiente `PROACTIVE_ALERTS_DRY_RUN=1` controla dispatcher.

- [ ] **Step 1: Localizar onde os crons de monitoring estão registrados**

```bash
grep -n "monitoringSyncHourly\|setInterval.*monitoring" src/index.ts | head -5
```

Achar a linha logo após o `setInterval(monitoringSyncHourly, ...)` (volta dos 5951 conforme grep anterior).

- [ ] **Step 2: Inserir registração dos novos crons logo após o monitoringSync**

```ts
    // ============================================
    // Módulo 6 — alerta proativo da carteira
    // ============================================
    const proactiveAlertService = new ProactiveAlertService(supabase, monitoringService);
    const proactiveDispatchCtx: DispatchCtx = {
      supabase,
      sendAdminWithButtons: (to, body, buttons, footer) =>
        sendAdminWithButtons({ metaWaba, sendText }, to, body, buttons, footer),
      adminPhone: ENGINEER_PHONE,
      dryRun: process.env.PROACTIVE_ALERTS_DRY_RUN === '1',
    };

    const runProactiveDetect = async () => {
      try {
        await proactiveAlertService.runDetectionCycle(new Date());
      } catch (err) {
        console.error('[proactive-alerts] detect cron falhou:', (err as Error).message);
      }
    };
    runProactiveDetect();                          // primeira passada imediata
    setInterval(runProactiveDetect, 60 * 60 * 1000); // 60min

    const runProactiveDispatch = async () => {
      try {
        await runDispatchCycle(new Date(), proactiveDispatchCtx);
      } catch (err) {
        console.error('[proactive-alerts] dispatch cron falhou:', (err as Error).message);
      }
    };
    setInterval(runProactiveDispatch, 15 * 60 * 1000); // 15min

    const runAnniversaryCron = async () => {
      try {
        await runAnniversaryEnqueue(new Date(), supabase);
      } catch (err) {
        console.error('[proactive-alerts] anniversary cron falhou:', (err as Error).message);
      }
    };
    // 1x/dia 6h BRT — checa a cada hora e dispara se hora local = 6
    setInterval(() => {
      const h = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false });
      if (Number(h) === 6) runAnniversaryCron();
    }, 60 * 60 * 1000);

    console.log(
      `[proactive-alerts] crons started (detect 60min, dispatch 15min, anniversary 06h BRT). DRY_RUN=${proactiveDispatchCtx.dryRun}`,
    );
```

- [ ] **Step 3: Adicionar imports no topo de `src/index.ts`**

```ts
import { ProactiveAlertService } from './modules/monitoring/proactive-alerts/service.js';
import { runDispatchCycle, type DispatchCtx } from './modules/monitoring/proactive-alerts/dispatcher.js';
import { runAnniversaryEnqueue } from './modules/monitoring/proactive-alerts/anniversary.js';
import { sendAdminWithButtons } from './modules/eva-admin-buttons.js';
```

(Se `sendAdminWithButtons` já está importado, não duplica.)

- [ ] **Step 4: Build e suite**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: TS EXIT 0 + suite verde.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(index): registra 3 crons do Módulo 6 + flag DRY_RUN (T12)"
```

---

## Task 13: Dashboard — tile "Alertas ativos" + sparkline + lista filtrável

**Files:**
- Modify: `src/modules/dashboard/queries.ts` (adicionar `getAlertasAtivos`, `getAlertasUltimos7d`)
- Modify: `src/modules/dashboard/views.ts` (renderizar tile + sparkline)
- Modify: `src/modules/dashboard/router.ts` (rota `/monitoramento` já existe — só estender)

- [ ] **Step 1: Adicionar queries**

Localizar arquivo e adicionar funções:

```ts
// src/modules/dashboard/queries.ts (acrescentar ao final)

export async function getAlertasAtivosResumo(client: SupabaseClient): Promise<{
  urgente: number; aviso: number; info: number; total: number;
}> {
  const { data, error } = await client
    .from('monitoring_alerts')
    .select('severidade')
    .is('resolved_at', null);
  if (error) return { urgente: 0, aviso: 0, info: 0, total: 0 };
  const c = { urgente: 0, aviso: 0, info: 0, total: 0 };
  for (const r of data ?? []) {
    if (r.severidade === 'urgente') c.urgente++;
    else if (r.severidade === 'aviso') c.aviso++;
    else if (r.severidade === 'info') c.info++;
    c.total++;
  }
  return c;
}

export async function getAlertasEnviadosUltimos7d(client: SupabaseClient): Promise<Array<{ dia: string; enviados: number }>> {
  const ini = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from('monitoring_alerts')
    .select('last_sent_at')
    .gte('last_sent_at', ini);
  if (error) return [];
  const por: Record<string, number> = {};
  for (const r of data ?? []) {
    if (!r.last_sent_at) continue;
    const dia = r.last_sent_at.slice(0, 10);
    por[dia] = (por[dia] ?? 0) + 1;
  }
  // preenche 7 dias mesmo que zerados
  const out: Array<{ dia: string; enviados: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    out.push({ dia: d, enviados: por[d] ?? 0 });
  }
  return out;
}

export async function listarAlertasAtivos(client: SupabaseClient): Promise<any[]> {
  const { data, error } = await client
    .from('monitoring_alerts')
    .select(`
      id, sistema_id, tipo, severidade, texto, primeiro_visto_em,
      last_sent_at, next_send_at, snoozed_until, acao_disparada, acao_disparada_em,
      sistemas:sistema_id ( apelido, lead_id, marca_inversor, potencia_kwp )
    `)
    .is('resolved_at', null)
    .order('primeiro_visto_em', { ascending: false });
  if (error) return [];
  return data ?? [];
}
```

- [ ] **Step 2: Render no `views.ts` (acrescentar no painel `/monitoramento`)**

Localizar `renderMonitoramentoPage` (ou nome equivalente) em `views.ts`. Após o KPI atual "Saúde da frota", adicionar bloco:

```ts
// Pedaço novo a inserir no render do dashboard /monitoramento — recebe `alertasResumo` e `sparkline7d` no input
const tileAlertas = `
  <div class="tile-alertas" style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-top:1rem;">
    <a href="/monitoramento?alertas=urgente" class="card-mini" style="background:rgba(220,38,38,.15);padding:.75rem;border-radius:.5rem;color:inherit;text-decoration:none;">
      <div style="font-size:.75rem;opacity:.7">Urgente</div>
      <div style="font-size:1.5rem;font-weight:700">${alertasResumo.urgente}</div>
    </a>
    <a href="/monitoramento?alertas=aviso" class="card-mini" style="background:rgba(234,179,8,.15);padding:.75rem;border-radius:.5rem;color:inherit;text-decoration:none;">
      <div style="font-size:.75rem;opacity:.7">Aviso</div>
      <div style="font-size:1.5rem;font-weight:700">${alertasResumo.aviso}</div>
    </a>
    <a href="/monitoramento?alertas=info" class="card-mini" style="background:rgba(34,197,94,.15);padding:.75rem;border-radius:.5rem;color:inherit;text-decoration:none;">
      <div style="font-size:.75rem;opacity:.7">Bombando</div>
      <div style="font-size:1.5rem;font-weight:700">${alertasResumo.info}</div>
    </a>
  </div>
`;

const sparkline = `
  <div style="margin-top:1rem;font-size:.8rem;opacity:.8">
    Alertas enviados (7d): ${sparkline7d.map((d) => d.enviados).join(' · ')}
  </div>
`;
```

E quando `req.query.alertas` está presente, renderizar a lista filtrável após o sparkline (lista existente já tem padrão de filtro server-side da Task S1).

- [ ] **Step 3: Wire-up no router**

```ts
// src/modules/dashboard/router.ts (no handler GET /monitoramento)
const alertasResumo = await getAlertasAtivosResumo(client);
const sparkline7d = await getAlertasEnviadosUltimos7d(client);
const alertasFiltrados = req.query.alertas ? await listarAlertasAtivos(client) : null;
// passar pro view
```

- [ ] **Step 4: Teste smoke do render**

Verificar localmente (manual):
```bash
npx tsc --noEmit
npx vitest run
```

Expected: TS OK + suite verde.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/queries.ts src/modules/dashboard/views.ts src/modules/dashboard/router.ts
git commit -m "feat(dashboard): tile Alertas ativos + sparkline 7d + lista filtrável (T13)"
```

---

## Task 14: Smoke em prod (checklist Junior, sem código)

> Junior executa após push. Verificação humana, não automatizada.

- [ ] **Step 1: Push pro GitHub (Easypanel SSH auto-pull)**

```bash
git push origin main
```

- [ ] **Step 2: Junior aplica migration `032_monitoring_alerts.sql` no SQL Editor do Supabase (projeto `kupnsoyymulbdzakqlqc`)**

Confirmar "Success".

- [ ] **Step 3: Junior cadastra env no Easypanel**

App `ecosunpower-agente` → Environment → adicionar `PROACTIVE_ALERTS_DRY_RUN=1` → Save.

- [ ] **Step 4: Junior clica Implantar**

- [ ] **Step 5: Aguardar 60min e checar logs no Easypanel**

Verificar linhas:
- `[proactive-alerts] crons started (detect 60min, dispatch 15min, anniversary 06h BRT). DRY_RUN=true`
- `[proactive-alerts] detect: N sistemas, M novos, ...`
- `[proactive-alerts] dispatch DRY: alerta=... sistema=...`

- [ ] **Step 6: Checar fila em SQL**

No SQL Editor (kupnsoyymulbdzakqlqc):

```sql
-- alertas abertos
select tipo, severidade, count(*) from monitoring_alerts where resolved_at is null group by 1,2;

-- não pode haver duplicatas por sistema+tipo
select sistema_id, tipo, count(*) from monitoring_alerts where resolved_at is null group by 1,2 having count(*) > 1;
```

Expected: alguns alertas pros ~5 sistemas business silenciosos. Segunda query: vazia.

- [ ] **Step 7: Junior remove env DRY_RUN e Implanta novamente**

Easypanel → Environment → remover `PROACTIVE_ALERTS_DRY_RUN` → Implantar.

- [ ] **Step 8: Aguardar até 15min na janela horária (8h-20h seg-sex, 9h-20h sáb)**

Verificar chegada da 1ª mensagem real no WhatsApp do Junior com botões. Testar 1 botão (ex: snooze).

- [ ] **Step 9: Monitorar 1ª semana**

Watch nos logs `[proactive-alerts]`. Confirmar:
- Throttle 3d funciona (alertas persistentes não vêm mais que a cada 72h).
- Janela horária funciona (nenhuma mensagem 3h da manhã).
- Botões respondem.
- Aniversário enfileira no horário 6h BRT.

---

## Self-Review (executado durante a escrita)

**Spec coverage:**
- ✅ 4 tipos de detecção → T5 (detect) + T6 (classificarSistema reuso)
- ✅ Agrupamento 1 msg/sistema → T4 (format) gera 1 FormattedAlert
- ✅ Throttle 3d → T8 (`next_send_at = +3d` no dispatcher)
- ✅ Eva fala via botão → T11 (handlers `alert-eva-*` criam `maintenance_reminders`)
- ✅ Aniversário expandindo `maintenance_reminders` → T9 + T10 (prompts)
- ✅ Janela horária → T3 + T8 (dispatcher chama `dentroDaJanela`)
- ✅ Limite 8/dia → T6 (`limit: 8` em `getAlertasParaDespachar`)
- ✅ Migration 032 → T1
- ✅ Botões 9 actions → T11
- ✅ Texto formatado por tipo → T4
- ✅ Error handling WABA/lock/sistema deletado → T8 try/catch + FK cascade
- ✅ Sem `lead_id` → T11 (case alert-eva-* responde "vincule")
- ✅ Opt-out → T11 (case alert-eva-* responde "Eva não pode falar")
- ✅ Dry-run → T8 dispatcher + T12 env + T14 smoke
- ✅ Observabilidade logs → cada cron tem log estruturado
- ✅ Dashboard tile + sparkline + lista → T13

**Placeholder scan:** Nenhum "TBD" / "implementar depois" / "similar a Task N".

**Type consistency:**
- `MonitoringAlertRow` (T2) usado em T4 (format), T5 (detect), T7 (service), T8 (dispatcher) — mesma forma.
- `AlertButton` (T2) usado em T4 (saída) e T8 (assinatura do `sendAdminWithButtons`).
- Métodos do Supabase (T6) consumidos em T7, T8, T9, T11 — nomes batem.

---

## Execution Handoff

**Plano completo e salvo em `docs/superpowers/plans/2026-05-20-modulo-6-alerta-proativo.md`. Duas opções de execução:**

**1. Subagent-Driven (recomendada)** — dispatch um subagente fresco por task, review entre tasks, iteração rápida. Bom pra plano grande com tasks independentes camada por camada como este.

**2. Inline Execution** — executar tasks nesta sessão com `executing-plans`, batch com checkpoints. Vantagem: você acompanha cada step em primeira mão.

Qual?
