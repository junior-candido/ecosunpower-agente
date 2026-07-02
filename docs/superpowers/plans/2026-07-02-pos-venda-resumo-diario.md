# Resumo diário do pós-venda no zap — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o bombardeio de 1 mensagem por usina no zap do Junior por UM resumo diário (17h–18h BRT) nascido do mesmo motor de sugestões da tela do pós-venda; urgente (offline/integração) continua na hora.

**Architecture:** Função pura `montarResumoDiario` monta o texto a partir das sugestões (`listarClientesPosVenda` + `sugestaoProativa`, que já respeitam a memória 065). Um runner de I/O pega carona no cron de 15 min existente, com janela própria (17h–18h BRT) e porteiro CAS em `monitoring_config` ("só 1 por dia"). O dispatcher para de mandar individual não-urgente quando a autonomia do tipo está OFF (alerta marcado como absorvido). Pré-requisito: a tela passa a enxergar `monitoring_alerts` (hoje só lê `alertas_sistema`, tabela morta).

**Tech Stack:** TypeScript ESM (imports com `.js`), Supabase/Postgres, vitest. Spec: `docs/superpowers/specs/2026-07-02-pos-venda-resumo-diario-design.md`.

**Regras do repo:** branch `feat/pos-venda-resumo-diario` (já criada). `git add` por nome de arquivo (NUNCA `-A`/`.`). Commits terminam com `Co-Authored-By:`. Antes do PR: `npx tsc --noEmit` limpo + `npx vitest run` verde (2 falhas pré-existentes em `tests/supabase-vincular-novo.test.ts` NÃO são suas). Migration 066: avisar o número no grupo do WhatsApp.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/066_resumo_diario_pos_venda.sql` | criar | coluna `resumo_diario_enviado_em` em `monitoring_config` |
| `src/modules/dashboard/pos-venda-resumo-diario.ts` | criar | janela 17h–18h, início do dia BRT, montagem do texto (puras) + runner de I/O |
| `tests/pos-venda-resumo-diario.test.ts` | criar | testes das puras |
| `src/modules/dashboard/pos-venda-sugestao.ts` | modificar | sugerir `queda` também no amarelo |
| `tests/pos-venda-sugestao.test.ts` | modificar | teste do amarelo |
| `src/modules/dashboard/pos-venda-queries.ts` | modificar | ler `monitoring_alerts` abertos e juntar na saúde |
| `src/modules/supabase.ts` | modificar | `marcarAlertaAbsorvidoPorResumo` |
| `src/modules/monitoring/proactive-alerts/dispatcher.ts` | modificar | absorver queda/milestone em treino (auto OFF) |
| `tests/proactive-alerts-dispatcher.test.ts` | modificar | testes do absorvido |
| `src/index.ts` | modificar | wiring: `autonomiaOn` no ctx do dispatch + chamada do runner no cron de 15 min |

---

### Task 1: Migration 066

**Files:**
- Create: `supabase/migrations/066_resumo_diario_pos_venda.sql`

- [ ] **Step 1: Escrever a migration (additiva, idempotente)**

```sql
-- supabase/migrations/066_resumo_diario_pos_venda.sql
-- Resumo diário do pós-venda no zap: marca de "já mandei hoje" (porteiro CAS).
-- Spec: docs/superpowers/specs/2026-07-02-pos-venda-resumo-diario-design.md
ALTER TABLE monitoring_config
  ADD COLUMN IF NOT EXISTS resumo_diario_enviado_em timestamptz;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/066_resumo_diario_pos_venda.sql
git commit -m "feat(pos-venda): migration 066 - marca do resumo diario

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Nota pro Junior (não bloqueia as tasks seguintes — testes não usam banco): aplicar a 066 no SQL Editor do Supabase ANTES do deploy, e avisar no grupo que a 066 está usada.

---

### Task 2: Sugestão de queda também no amarelo

Hoje `sugestaoProativa` só sugere `queda` com saúde vermelha. Alerta de
`queda_geracao` deixa a saúde AMARELA (`pos-venda-saude.ts` linha 12) — sem
este ajuste a queda absorvida pelo dispatcher (Task 6) ficaria invisível.

**Files:**
- Modify: `src/modules/dashboard/pos-venda-sugestao.ts:28`
- Test: `tests/pos-venda-sugestao.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Abrir `tests/pos-venda-sugestao.test.ts`, achar o bloco `describe` existente e
adicionar estes dois testes (objeto inline, todos os campos de `LinhaSugestao`):

```ts
it('saude amarela (queda de geracao aberta) sugere queda', () => {
  const s = sugestaoProativa({
    saude: 'amarelo',
    ultimoContatoEm: null,
    elegivelUpgrade: false,
    dataInstalacao: null,
    gerouBem: false,
    ultimoContatoPositivoEm: null,
    snoozedTipos: new Set<string>(),
  }, new Date('2026-07-02T12:00:00Z'));
  expect(s?.tipo).toBe('queda');
});

it('saude amarela com queda snoozed NAO sugere queda', () => {
  const s = sugestaoProativa({
    saude: 'amarelo',
    ultimoContatoEm: null,
    elegivelUpgrade: false,
    dataInstalacao: null,
    gerouBem: false,
    ultimoContatoPositivoEm: null,
    snoozedTipos: new Set(['queda']),
  }, new Date('2026-07-02T12:00:00Z'));
  expect(s?.tipo).not.toBe('queda');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/pos-venda-sugestao.test.ts`
Expected: FAIL — o 1º teste novo recebe `null` (amarelo não sugere nada hoje).

- [ ] **Step 3: Implementação mínima**

Em `src/modules/dashboard/pos-venda-sugestao.ts`, trocar a condição da queda:

```ts
// ANTES:
  if (l.saude === 'vermelho' && !l.snoozedTipos.has('queda')) {
// DEPOIS (amarelo = alerta de queda aberto; vermelho = offline/zerada — nos
// dois casos a dica certa é oferecer revisão/limpeza):
  if ((l.saude === 'vermelho' || l.saude === 'amarelo') && !l.snoozedTipos.has('queda')) {
```

- [ ] **Step 4: Rodar e ver passar (o arquivo todo)**

Run: `npx vitest run tests/pos-venda-sugestao.test.ts`
Expected: PASS em todos (os antigos continuam verdes — vermelho segue sugerindo queda).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/pos-venda-sugestao.ts tests/pos-venda-sugestao.test.ts
git commit -m "feat(pos-venda): sugestao de queda tambem com saude amarela

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Tela enxerga `monitoring_alerts`

`listarClientesPosVenda` lê alertas só de `alertas_sistema` — tabela que nada
escreve. A queda/offline reais moram em `monitoring_alerts`. Juntar as duas
fontes na entrada de `saudeUsina` (os tipos já casam: `sistema_offline`,
`queda_geracao`).

**Files:**
- Modify: `src/modules/dashboard/pos-venda-queries.ts:70-80`

Arquivo de I/O — convenção do repo: sem teste unitário (comentário no topo do
próprio arquivo); validado por `tsc` + smoke.

- [ ] **Step 1: Adicionar a leitura e o merge**

Em `src/modules/dashboard/pos-venda-queries.ts`, logo DEPOIS do bloco "3)
alertas abertos por sistema" (que termina em `alertasPorSistema.set(...)`),
adicionar:

```ts
  // 3b) alertas do MONITORAMENTO (monitoring_alerts) — a fonte viva: queda/
  // offline detectados pelos adapters moram aqui, não em alertas_sistema.
  // Sem isso a saúde da tela não pinta e a queda some do resumo diário.
  const { data: monAlertas, error: e3b } = await client.from('monitoring_alerts')
    .select('sistema_id, tipo, severidade')
    .in('sistema_id', sistemaIds).is('resolved_at', null);
  if (e3b) throw new Error(`listarClientesPosVenda/monitoring_alerts: ${e3b.message}`);
  for (const a of (monAlertas ?? []) as any[]) {
    const arr = alertasPorSistema.get(a.sistema_id) ?? [];
    arr.push({ tipo: a.tipo, severidade: a.severidade ?? '' });
    alertasPorSistema.set(a.sistema_id, arr);
  }
```

- [ ] **Step 2: Conferir tipos e suíte**

Run: `npx tsc --noEmit`
Expected: limpo.

Run: `npx vitest run tests/pos-venda-saude.test.ts tests/pos-venda-views.test.ts`
Expected: PASS (nada desses arquivos muda de contrato).

- [ ] **Step 3: Commit**

```bash
git add src/modules/dashboard/pos-venda-queries.ts
git commit -m "fix(pos-venda): saude da tela le monitoring_alerts (alertas_sistema esta morta)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Módulo do resumo — funções puras

**Files:**
- Create: `src/modules/dashboard/pos-venda-resumo-diario.ts`
- Test: `tests/pos-venda-resumo-diario.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/pos-venda-resumo-diario.test.ts`:

```ts
// tests/pos-venda-resumo-diario.test.ts
import { describe, it, expect } from 'vitest';
import {
  dentroDaJanelaResumo, inicioDoDiaBrt, montarResumoDiario,
} from '../src/modules/dashboard/pos-venda-resumo-diario.js';

const LINK = 'https://dashboard.ecosunpower.eng.br/dashboard/pos-venda';

describe('dentroDaJanelaResumo', () => {
  // 17h BRT = 20h UTC (America/Sao_Paulo, sem DST desde 2019)
  it('quinta 17:10 BRT: dentro', () => {
    expect(dentroDaJanelaResumo(new Date('2026-07-02T20:10:00Z'))).toBe(true);
  });
  it('quinta 16:59 BRT: fora', () => {
    expect(dentroDaJanelaResumo(new Date('2026-07-02T19:59:00Z'))).toBe(false);
  });
  it('quinta 18:00 BRT: fora (janela fecha as 18)', () => {
    expect(dentroDaJanelaResumo(new Date('2026-07-02T21:00:00Z'))).toBe(false);
  });
  it('sabado 17:30 BRT: dentro (Junior trabalha sabado)', () => {
    expect(dentroDaJanelaResumo(new Date('2026-07-04T20:30:00Z'))).toBe(true);
  });
  it('domingo 17:30 BRT: fora', () => {
    expect(dentroDaJanelaResumo(new Date('2026-07-05T20:30:00Z'))).toBe(false);
  });
});

describe('inicioDoDiaBrt', () => {
  it('meio da tarde BRT -> 00:00 BRT = 03:00Z do mesmo dia', () => {
    expect(inicioDoDiaBrt(new Date('2026-07-02T20:10:00Z'))).toBe('2026-07-02T03:00:00.000Z');
  });
  it('01:00 BRT (04:00Z) -> ainda e o dia 02 em BRT', () => {
    expect(inicioDoDiaBrt(new Date('2026-07-02T04:00:00Z'))).toBe('2026-07-02T03:00:00.000Z');
  });
  it('23:30Z do dia 01 = 20:30 BRT do dia 01 -> inicio do dia 01', () => {
    expect(inicioDoDiaBrt(new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-01T03:00:00.000Z');
  });
});

describe('montarResumoDiario', () => {
  it('0 sugestoes -> null (dia sem nada = silencio)', () => {
    expect(montarResumoDiario([], LINK)).toBeNull();
  });

  it('agrupa por situacao na ordem de prioridade e traz o link', () => {
    const txt = montarResumoDiario([
      { nome: 'José Silva', tipo: 'upgrade' },
      { nome: 'Maria Souza', tipo: 'geracao_saudavel' },
      { nome: 'Denivaldo Alves', tipo: 'queda' },
      { nome: 'Sonia Lima', tipo: 'geracao_saudavel' },
    ], LINK)!;
    expect(txt).toContain('4 pedem atenção');
    // ordem: queda antes de boa notícia, que vem antes de upgrade
    const iQueda = txt.indexOf('📉');
    const iBoa = txt.indexOf('☀️ Boa notícia');
    const iUp = txt.indexOf('🔋');
    expect(iQueda).toBeGreaterThan(-1);
    expect(iBoa).toBeGreaterThan(iQueda);
    expect(iUp).toBeGreaterThan(iBoa);
    // primeiro nome só
    expect(txt).toContain('Denivaldo');
    expect(txt).not.toContain('Denivaldo Alves');
    expect(txt).toContain(LINK);
  });

  it('singular: 1 usina pede atencao', () => {
    const txt = montarResumoDiario([{ nome: 'Maria', tipo: 'queda' }], LINK)!;
    expect(txt).toContain('1 pede atenção');
  });

  it('mais de 3 no grupo vira (+n)', () => {
    const txt = montarResumoDiario([
      { nome: 'A', tipo: 'queda' }, { nome: 'B', tipo: 'queda' },
      { nome: 'C', tipo: 'queda' }, { nome: 'D', tipo: 'queda' },
      { nome: 'E', tipo: 'queda' },
    ], LINK)!;
    expect(txt).toContain('A, B, C (+2)');
  });

  it('grupo contato (sem falar ha tempo) aparece', () => {
    const txt = montarResumoDiario([{ nome: 'X', tipo: 'contato' }], LINK)!;
    expect(txt).toContain('📞 Sem falar há tempo: X');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/pos-venda-resumo-diario.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar as puras**

Criar `src/modules/dashboard/pos-venda-resumo-diario.ts`:

```ts
// src/modules/dashboard/pos-venda-resumo-diario.ts
// Resumo diário do pós-venda no zap do Junior (incremento 2 da memória de
// relacionamento). Puras: janela 17h-18h BRT, início do dia BRT e montagem do
// texto. O runner de I/O (rodarResumoDiario) fica no fim do arquivo.
// Spec: docs/superpowers/specs/2026-07-02-pos-venda-resumo-diario-design.md
import type { SupabaseClient } from '@supabase/supabase-js';
import { listarClientesPosVenda } from './pos-venda-queries.js';
import { sugestaoProativa } from './pos-venda-sugestao.js';

// Mesmo padrão Intl da janela geral (proactive-alerts/janela.ts): BRT sem DST.
function horaBrt(d: Date, tz: string): { dow: number; totalMin: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dow: dowMap[weekday] ?? -1, totalMin: (hour === 24 ? 0 : hour) * 60 + minute };
}

// Fim do dia: 17h-18h BRT, segunda a sábado (domingo a janela geral é fechada).
export function dentroDaJanelaResumo(d: Date, tz = 'America/Sao_Paulo'): boolean {
  const { dow, totalMin } = horaBrt(d, tz);
  if (dow === 0) return false;
  return totalMin >= 17 * 60 && totalMin < 18 * 60;
}

// 00:00 BRT do dia de `d` em ISO UTC (= 03:00Z; BRT é UTC-3 fixo desde 2019).
// Usado no CAS "só 1 resumo por dia".
export function inicioDoDiaBrt(d: Date): string {
  const diaBrt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d); // YYYY-MM-DD
  return `${diaBrt}T03:00:00.000Z`;
}

export interface ItemResumo { nome: string; tipo: string }

// Ordem de exibição = prioridade do motor (sugestaoProativa).
const GRUPOS: Array<{ tipo: string; rotulo: string }> = [
  { tipo: 'queda', rotulo: '📉 Queda' },
  { tipo: 'contato', rotulo: '📞 Sem falar há tempo' },
  { tipo: 'geracao_saudavel', rotulo: '☀️ Boa notícia pra dar' },
  { tipo: 'upgrade', rotulo: '🔋 Upgrade' },
];
const MAX_NOMES = 3;

const primeiroNome = (nome: string): string => nome.trim().split(/\s+/)[0] || nome;

// null = nada a dizer (não manda). Texto simples, sem botões — ação no painel.
export function montarResumoDiario(itens: ItemResumo[], linkPainel: string): string | null {
  if (itens.length === 0) return null;
  const linhas: string[] = [];
  const n = itens.length;
  linhas.push(`☀️ *Resumo das usinas — ${n} ${n === 1 ? 'pede' : 'pedem'} atenção*`);
  for (const g of GRUPOS) {
    const doGrupo = itens.filter((i) => i.tipo === g.tipo);
    if (doGrupo.length === 0) continue;
    const nomes = doGrupo.slice(0, MAX_NOMES).map((i) => primeiroNome(i.nome)).join(', ');
    const resto = doGrupo.length > MAX_NOMES ? ` (+${doGrupo.length - MAX_NOMES})` : '';
    linhas.push(`${g.rotulo}: ${nomes}${resto}`);
  }
  linhas.push(`👉 Resolver no painel: ${linkPainel}`);
  return linhas.join('\n');
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/pos-venda-resumo-diario.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/pos-venda-resumo-diario.ts tests/pos-venda-resumo-diario.test.ts
git commit -m "feat(pos-venda): puras do resumo diario (janela, dia BRT, montagem)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Runner de I/O do resumo (CAS + envio)

**Files:**
- Modify: `src/modules/dashboard/pos-venda-resumo-diario.ts` (adicionar no fim)

I/O fino (padrão *-queries: sem teste unitário; toda decisão está nas puras já
testadas). Ordem deliberada: **monta ANTES do CAS** — dia sem sugestão não
consome a marca (se uma sugestão nascer às 17h30, o ciclo seguinte ainda manda).
CAS **antes do envio** — nunca 2 resumos (lição do orquestrador); envio falhou =
sem resumo naquele dia, aceito.

- [ ] **Step 1: Adicionar o runner no fim do arquivo**

```ts
// ---------------------------------------------------------------------------
// Runner de I/O — chamado pelo cron de 15 min do index (junto do dispatch).
// ---------------------------------------------------------------------------

const ECOSUN = '00000000-0000-0000-0000-000000000001';

export interface ResumoDeps {
  client: SupabaseClient;
  sendText: (to: string, text: string) => Promise<void>;
  adminPhone: string;
  dryRun: boolean;
}

// CAS: grava a marca SE ainda não mandou hoje (BRT). true = ganhou a vez.
async function marcarResumoEnviadoHoje(client: SupabaseClient, agora: Date): Promise<boolean> {
  const { data, error } = await client.from('monitoring_config')
    .update({ resumo_diario_enviado_em: agora.toISOString(), updated_at: agora.toISOString() })
    .eq('id', 1)
    .or(`resumo_diario_enviado_em.is.null,resumo_diario_enviado_em.lt.${inicioDoDiaBrt(agora)}`)
    .select('id');
  if (error) throw new Error(`marcarResumoEnviadoHoje: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function rodarResumoDiario(deps: ResumoDeps, agora: Date): Promise<void> {
  try {
    if (!dentroDaJanelaResumo(agora)) return;

    const linhas = await listarClientesPosVenda(deps.client, ECOSUN);
    const itens: ItemResumo[] = [];
    for (const l of linhas) {
      const s = sugestaoProativa(l, agora);
      if (s) itens.push({ nome: l.nome, tipo: s.tipo });
    }
    const base = (process.env.DASHBOARD_BASE_URL ?? 'https://dashboard.ecosunpower.eng.br').replace(/\/$/, '');
    const texto = montarResumoDiario(itens, `${base}/dashboard/pos-venda`);
    if (!texto) return; // dia sem nada = silêncio (e não consome a marca)

    if (deps.dryRun) {
      console.log(`[resumo-diario] DRY: mandaria pro Junior:\n${texto}`);
      return; // dry não marca — o resumo real sai quando o dry desligar
    }
    // Porteiro CAS ANTES do envio: nunca 2 resumos no mesmo dia.
    if (!(await marcarResumoEnviadoHoje(deps.client, agora))) return;
    await deps.sendText(deps.adminPhone, texto);
    console.log(`[resumo-diario] enviado (${itens.length} sugestões)`);
  } catch (err) {
    // Falha nunca derruba o ciclo dos outros crons; tenta no próximo (15 min).
    console.error('[resumo-diario] falhou:', (err as Error).message);
  }
}
```

- [ ] **Step 2: Conferir tipos + suíte do módulo**

Run: `npx tsc --noEmit`
Expected: limpo.

Run: `npx vitest run tests/pos-venda-resumo-diario.test.ts`
Expected: PASS (puras intactas).

- [ ] **Step 3: Commit**

```bash
git add src/modules/dashboard/pos-venda-resumo-diario.ts
git commit -m "feat(pos-venda): runner do resumo diario (CAS so-1-por-dia + envio)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Dispatcher absorve queda/milestone em treino

**Files:**
- Modify: `src/modules/supabase.ts` (novo método, perto de `marcarAlertaEnviado`, ~linha 1198)
- Modify: `src/modules/monitoring/proactive-alerts/dispatcher.ts`
- Test: `tests/proactive-alerts-dispatcher.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/proactive-alerts-dispatcher.test.ts`, o `fakeCtx` (linha ~20) ganha o
mock do método novo — adicionar dentro de `supabase: { ... }`:

```ts
      marcarAlertaAbsorvidoPorResumo: vi.fn().mockResolvedValue(undefined),
```

E adicionar no fim do `describe('runDispatchCycle', ...)`:

```ts
  it('queda com dono + autonomia OFF: absorvida pelo resumo, nada individual', async () => {
    const ctx = fakeCtx({
      supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta({ tipo: 'queda_geracao', severidade: 'aviso' })]) },
      autonomiaOn: vi.fn().mockResolvedValue(false),
      proporAbordagem: vi.fn(),
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(ctx.sendAdminWithButtons).not.toHaveBeenCalled();
    expect(ctx.proporAbordagem).not.toHaveBeenCalled();
    expect(ctx.supabase.marcarAlertaAbsorvidoPorResumo).toHaveBeenCalledOnce();
    expect(r.enviados).toBe(0);
  });

  it('milestone com dono + autonomia OFF: absorvida (boa noticia vai no resumo)', async () => {
    const ctx = fakeCtx({
      supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta({ tipo: 'milestone_economia', severidade: 'info' })]) },
      autonomiaOn: vi.fn().mockResolvedValue(false),
      proporAbordagem: vi.fn(),
    });
    await runDispatchCycle(horaJanela, ctx as any);
    expect(ctx.proporAbordagem).not.toHaveBeenCalled();
    expect(ctx.supabase.marcarAlertaAbsorvidoPorResumo).toHaveBeenCalledOnce();
  });

  it('queda com autonomia ON: segue pro proporAbordagem (igual hoje)', async () => {
    const ctx = fakeCtx({
      supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta({ tipo: 'queda_geracao' })]) },
      autonomiaOn: vi.fn().mockResolvedValue(true),
      proporAbordagem: vi.fn().mockResolvedValue('enviada'),
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(ctx.proporAbordagem).toHaveBeenCalledOnce();
    expect(ctx.supabase.marcarAlertaAbsorvidoPorResumo).not.toHaveBeenCalled();
    expect(r.enviados).toBe(1);
  });

  it('offline ignora autonomiaOn: urgente continua individual', async () => {
    const ctx = fakeCtx({
      supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta({ tipo: 'sistema_offline' })]) },
      autonomiaOn: vi.fn().mockResolvedValue(false),
      proporAbordagem: vi.fn().mockResolvedValue('proposta'),
    });
    await runDispatchCycle(horaJanela, ctx as any);
    expect(ctx.proporAbordagem).toHaveBeenCalledOnce();
    expect(ctx.supabase.marcarAlertaAbsorvidoPorResumo).not.toHaveBeenCalled();
  });

  it('sem autonomiaOn no ctx (compat): tudo igual hoje', async () => {
    const ctx = fakeCtx({
      supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta({ tipo: 'queda_geracao' })]) },
      proporAbordagem: vi.fn().mockResolvedValue('proposta'),
    });
    await runDispatchCycle(horaJanela, ctx as any);
    expect(ctx.proporAbordagem).toHaveBeenCalledOnce();
  });

  it('queda absorvida em dry-run: nao marca, so simula', async () => {
    const ctx = fakeCtx({
      supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta({ tipo: 'queda_geracao' })]) },
      autonomiaOn: vi.fn().mockResolvedValue(false),
      dryRun: true,
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(ctx.supabase.marcarAlertaAbsorvidoPorResumo).not.toHaveBeenCalled();
    expect(r.dryRunSimulados).toBe(1);
  });

  it('queda SEM dono (orfa): alerta individual continua (cadastrar dono)', async () => {
    const ctx = fakeCtx({
      supabase: {
        getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta({ tipo: 'queda_geracao' })]),
        getSistemaById: vi.fn().mockResolvedValue({
          id: 'sid-1', apelido: 'Casa', potencia_kwp: 5, marca_inversor: 'deye', lead_id: null,
        }),
      },
      autonomiaOn: vi.fn().mockResolvedValue(false),
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(ctx.sendAdminWithButtons).toHaveBeenCalledOnce();
    expect(ctx.supabase.marcarAlertaAbsorvidoPorResumo).not.toHaveBeenCalled();
    expect(r.enviados).toBe(1);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/proactive-alerts-dispatcher.test.ts`
Expected: FAIL nos testes novos de absorção (hoje a queda vira proposta/alerta).

- [ ] **Step 3: Método novo em `src/modules/supabase.ts`**

Logo depois de `marcarAlertaEnviado` (~linha 1204):

```ts
  // Resumo diário do pós-venda: alerta não-urgente em treino não vira mensagem
  // individual — fica registrado como absorvido e não compete por 3 dias.
  async marcarAlertaAbsorvidoPorResumo(id: string, sentAt: string, nextSendAt: string): Promise<void> {
    const { error } = await this.client
      .from('monitoring_alerts')
      .update({
        acao_disparada: 'resumo_diario', acao_disparada_em: sentAt,
        last_sent_at: sentAt, next_send_at: nextSendAt,
      })
      .eq('id', id);
    if (error) console.error('[supabase] marcarAlertaAbsorvidoPorResumo:', error.message);
  }
```

- [ ] **Step 4: Mudança no dispatcher**

Em `src/modules/monitoring/proactive-alerts/dispatcher.ts`:

(a) No `DispatchCtx` (depois do campo `proporAbordagem`, ~linha 25), adicionar:

```ts
  // Resumo diário (incremento 2): com dono + autonomia OFF, queda/milestone
  // NÃO viram mensagem individual — o resumo diário cobre (ação no painel).
  // Campo opcional: sem ele, comportamento 100% atual (compat).
  autonomiaOn?: (tipo: 'queda' | 'parabens') => Promise<boolean>;
```

(b) Dentro do loop, ANTES do bloco `if (ctx.proporAbordagem && ...)` (~linha 60),
adicionar:

```ts
      // Resumo diário: não-urgente em treino é absorvido (sem mensagem
      // individual). Offline/erro_integracao/órfã NUNCA passam por aqui.
      if (ctx.autonomiaOn && lead && lead.phone &&
          (alerta.tipo === 'queda_geracao' || alerta.tipo === 'milestone_economia')) {
        const tipoFlag = alerta.tipo === 'queda_geracao' ? 'queda' : 'parabens';
        let auto = true; // erro na leitura da config → segue o fluxo atual (seguro)
        try { auto = await ctx.autonomiaOn(tipoFlag); } catch { auto = true; }
        if (!auto) {
          if (ctx.dryRun) {
            console.log(`[proactive-alerts] dispatch DRY: absorveria no resumo — alerta=${alerta.id} tipo=${alerta.tipo}`);
            await ctx.supabase.unlockAlerta(alerta.id, addDays(hoje, 3).toISOString());
            dryRunSimulados++;
            continue;
          }
          await ctx.supabase.marcarAlertaAbsorvidoPorResumo(
            alerta.id, hoje.toISOString(), addDays(hoje, 3).toISOString());
          console.log(`[proactive-alerts] dispatch: absorvido pelo resumo — alerta=${alerta.id} tipo=${alerta.tipo}`);
          continue;
        }
      }
```

Nota: `SupabaseService` é o tipo do ctx — o método novo do Step 3 já existe
nele, então o TypeScript compila sem cast.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/proactive-alerts-dispatcher.test.ts`
Expected: PASS em todos (antigos + novos).

Run: `npx tsc --noEmit`
Expected: limpo.

- [ ] **Step 6: Commit**

```bash
git add src/modules/supabase.ts src/modules/monitoring/proactive-alerts/dispatcher.ts tests/proactive-alerts-dispatcher.test.ts
git commit -m "feat(monitoring): dispatcher absorve queda/milestone em treino (resumo diario cobre)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Wiring no index (cron + autonomia)

**Files:**
- Modify: `src/index.ts` (~linha 8300-8355)

- [ ] **Step 1: `autonomiaOn` no ctx do dispatch**

Achar a montagem do `proactiveDispatchCtx` (objeto com `supabase`,
`sendAdminWithButtons`, `adminPhone`, `dryRun`, `proporAbordagem` — termina
~linha 8322). Adicionar o campo (dentro do objeto):

```ts
      // Resumo diário: em treino, queda/milestone não viram msg individual.
      autonomiaOn: async (tipo: 'queda' | 'parabens') => {
        const { getConfig } = await import('./modules/monitoring/abordagem/abordagens-repo.js');
        const cfg = await getConfig(supabase.getClient());
        return tipo === 'queda' ? cfg.queda_auto : cfg.parabens_auto;
      },
```

- [ ] **Step 2: Chamar o runner no cron de 15 min**

Em `runProactiveDispatch` (~linha 8334), DEPOIS do bloco do
`processarPendencias` (que fecha com `}` do `if (metaWaba)`), adicionar:

```ts
      // Resumo diário do pós-venda (17h-18h BRT): try/catch próprio — falha
      // nunca derruba dispatch nem pendências. O runner decide janela/CAS.
      try {
        const { rodarResumoDiario } = await import('./modules/dashboard/pos-venda-resumo-diario.js');
        await rodarResumoDiario({
          client: supabase.getClient(),
          sendText: async (to: string, t: string) => { await sendText(to, t); },
          adminPhone: config.engineerPhone,
          dryRun: process.env.PROACTIVE_ALERTS_DRY_RUN === '1',
        }, new Date());
      } catch (err) {
        console.error('[resumo-diario] cron falhou:', (err as Error).message);
      }
```

- [ ] **Step 3: Compilar e rodar a suíte inteira**

Run: `npx tsc --noEmit`
Expected: limpo.

Run: `npx vitest run`
Expected: verde (exceto as 2 falhas pré-existentes de `tests/supabase-vincular-novo.test.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(pos-venda): wiring do resumo diario no cron de 15min + autonomia no dispatch

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Review, PR e entrega

- [ ] **Step 1: Code review 3× do diff completo** (regra do Junior: três passadas, corrigindo achados entre elas)

Run: `git diff main...feat/pos-venda-resumo-diario`
Revisar: correção, contratos (nomes/tipos batendo entre módulos), erros engolidos, texto em português claro pro usuário. Corrigir achados e re-revisar (3 passadas no total).

- [ ] **Step 2: Suíte final + tsc**

Run: `npx tsc --noEmit && npx vitest run`
Expected: limpo / verde (menos as 2 pré-existentes).

- [ ] **Step 3: Push + PR**

```bash
git push origin feat/pos-venda-resumo-diario
gh pr create --title "Resumo diário do pós-venda no zap (incremento 2)" --body "Troca o bombardeio de 1 msg por usina por UM resumo diário 17h-18h BRT, nascido do mesmo motor da tela (memória 065). Urgente (offline/integração) continua na hora. Queda/milestone em treino são absorvidos (ação no painel). Fix de tabela morta: saúde da tela agora lê monitoring_alerts. Migration 066 (additiva). Spec: docs/superpowers/specs/2026-07-02-pos-venda-resumo-diario-design.md"
```

- [ ] **Step 4: Checklist de subida (Junior)**

1. Avisar no grupo: migration **066** usada.
2. Aplicar `066_resumo_diario_pos_venda.sql` no SQL Editor (projeto `kupnsoyymulbdzakqlqc`) ANTES do deploy.
3. Merge do PR (CI verde junta sozinho) → **Implantar** no EasyPanel.
4. Smoke: confirmar build novo no `/health`; às ~17h BRT conferir que chega 1 resumo (e que bate com a tela `/dashboard/pos-venda`); confirmar que queda nova NÃO vira mais mensagem individual.
