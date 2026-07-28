# Alerta com MOTIVO + filtro por status — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Painel de Operação com colunas clicáveis (ver só um status) e alerta de usina parada dizendo o MOTIVO (sem comunicação × falha × parada comunicando), usando o `statusInversor` que os adapters já devolvem.

**Architecture:** Tudo server-rendered como já é. (A) view `renderMonitoramentoPage` ganha `q.painel` e renderiza só a coluna pedida; router repassa `req.query.painel`. (B) migration 084 adiciona `status_inversor(+_em)` em `sistemas_clientes`; o sync grava; `classificarSistema` ganha input opcional e muda só o TEXTO do alerta (tipo continua `sistema_offline`).

**Tech Stack:** TypeScript ESM (imports `.js`), Express server-rendered, Supabase, vitest.

**Spec:** `docs/superpowers/specs/2026-07-28-alerta-motivo-filtro-status-design.md`

---

### Task 1: Filtro por status no board (view + router)

**Files:**
- Modify: `src/modules/dashboard/views.ts` (assinatura ~767, `colunaStatus`/`boardHtml` ~868-887, `chipOrbita` ~911)
- Modify: `src/modules/dashboard/router.ts` (~2939 monta `qf`)
- Test: `tests/painel-filtro-status.test.ts` (novo)

- [ ] **Step 1: teste falhando** — `tests/painel-filtro-status.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderMonitoramentoPage } from '../src/modules/dashboard/views.js';

const row = (over: any = {}) => ({
  id: 'u1', apelido: 'Usina A', marca_inversor: 'deye', ativo: true,
  potencia_kwp: 5, uf: 'DF', cidade: 'Brasília', nivel: 'urgente',
  alertaTexto: 'Sem geração há 7 dias.', geracao_hoje_kwh: 0,
  geracao_mes_kwh: 0, geracao_7d_kwh: 0, ultima_sincronizacao: new Date().toISOString(),
  ...over,
});

describe('board filtrado por ?painel= (pedido do Thiago)', () => {
  it('painel=falha renderiza SÓ a coluna Falha + link ver tudo', () => {
    const html = renderMonitoramentoPage([row()], { painel: 'falha' });
    expect(html).toContain('Falha');
    expect(html).not.toContain('Gerando OK');
    expect(html).not.toContain('Aguardando dados');
    expect(html).toContain('ver tudo');
  });
  it('sem painel (ou inválido) renderiza as 4 colunas', () => {
    for (const q of [{}, { painel: 'xyz' }]) {
      const html = renderMonitoramentoPage([row()], q as any);
      for (const t of ['Falha', 'Atenção', 'Gerando OK', 'Aguardando dados']) expect(html).toContain(t);
    }
  });
  it('cabeçalho e chip da órbita são links com ?painel=', () => {
    const html = renderMonitoramentoPage([row()], {});
    expect(html).toContain('?painel=falha');
    expect(html).toContain('?painel=atencao');
    expect(html).toContain('?painel=ok');
    expect(html).toContain('?painel=aguardando');
  });
});
```

- [ ] **Step 2: rodar e ver falhar** — `npx vitest run tests/painel-filtro-status.test.ts` → FAIL (painel ignorado / links ausentes).

- [ ] **Step 3: implementação mínima em `views.ts`:**
  - Assinatura: `q: { q?: string; marca?: string; cidade?: string; status?: string; ord?: string; painel?: string }`.
  - Depois de montar `falhas/atencoes/saudaveis/aguardando` (~866):

```ts
  // [Filtro do board — pedido do Thiago 28/07: "clicar e entrar só no status"]
  const PAINEIS = {
    falha: { titulo: 'Falha', icone: '🔴', lista: falhas },
    atencao: { titulo: 'Atenção', icone: '🟡', lista: atencoes },
    ok: { titulo: 'Gerando OK', icone: '🟢', lista: saudaveis },
    aguardando: { titulo: 'Aguardando dados', icone: '⚪', lista: aguardando },
  } as const;
  type PainelKey = keyof typeof PAINEIS;
  const painelAtivo: PainelKey | null =
    q.painel && q.painel in PAINEIS ? (q.painel as PainelKey) : null;
```

  - `colunaStatus` ganha o parâmetro `chave: PainelKey` e o cabeçalho vira link: se `painelAtivo === chave`, href = `/dashboard/monitoramento` com texto extra `✕ ver tudo`; senão href = `/dashboard/monitoramento?painel=${chave}`. Título e contagem dentro do `<a>`.
  - `boardHtml`: se `painelAtivo`, renderiza só `colunaStatus` da chave ativa (grid de 1 coluna: `grid-cols-1`); senão as 4 como hoje.
  - `chipOrbita`: envolver o conteúdo em `<a href="/dashboard/monitoramento?painel=<chave>">` (passar a chave por parâmetro).

- [ ] **Step 4: router** — em `router.ts` ~2939, incluir `painel` no `qf`:

```ts
const qf = { /* campos atuais */, painel: String((req.query.painel as string) ?? '') || undefined };
```

(`filtrarOrdenarSistemas` ignora campos extras — conferir que o tipo `FiltroQuery` não reclama; se reclamar, passar `painel` só no objeto da view.)

- [ ] **Step 5: rodar testes novos + antigos do painel** — `npx vitest run tests/painel-filtro-status.test.ts tests/painel-colunas.test.ts tests/monitoramento-render.test.ts` → PASS.

- [ ] **Step 6: commit** — `git add src/modules/dashboard/views.ts src/modules/dashboard/router.ts tests/painel-filtro-status.test.ts && git commit -m "feat: colunas do Painel de Operação clicáveis — ?painel= mostra só o status (pedido Thiago)"`

---

### Task 2: `classificarSistema` diz o motivo

**Files:**
- Modify: `src/modules/monitoring/classificacao.ts`
- Test: `tests/monitoramento-classificacao.test.ts` (novo describe no fim)

- [ ] **Step 1: teste falhando** (adicionar ao arquivo existente):

```ts
describe('motivo no alerta de usina parada (fatia 1 — statusInversor)', () => {
  const base = { ativo: true, ultimoErro: null, potenciaKwp: 5, uf: 'DF', diasSemGeracao: 7, realUltimos7: 0 };
  it('offline → sem comunicação (WiFi/internet)', () => {
    const c = classificarSistema({ ...base, statusInversor: 'offline' });
    expect(c.alerta!.tipo).toBe('sistema_offline');
    expect(c.alerta!.texto).toContain('Sem comunicação há 7 dias');
    expect(c.alerta!.texto).toContain('WiFi');
  });
  it('falha → falha reportada pelo inversor', () => {
    const c = classificarSistema({ ...base, statusInversor: 'falha' });
    expect(c.alerta!.texto).toContain('Falha reportada pelo inversor');
  });
  it('ok → parada mas comunicando (disjuntor/strings)', () => {
    const c = classificarSistema({ ...base, statusInversor: 'ok' });
    expect(c.alerta!.texto).toContain('comunicando, mas sem gerar');
  });
  it('desconhecido/ausente → texto antigo, zero regressão', () => {
    for (const s of ['desconhecido', undefined, null] as const) {
      const c = classificarSistema({ ...base, statusInversor: s as any });
      expect(c.alerta!.texto).toBe('Sem geração há 7 dias. Verificar inversor / conexão WiFi.');
    }
  });
});
```

- [ ] **Step 2: rodar e ver falhar** — `npx vitest run tests/monitoramento-classificacao.test.ts` → FAIL.

- [ ] **Step 3: implementação em `classificacao.ts`:**
  - `ClassificacaoInput` ganha `statusInversor?: 'ok' | 'offline' | 'falha' | 'desconhecido' | null;`
  - No bloco `diasSemGeracao >= 3` (linha ~54):

```ts
  if (i.diasSemGeracao >= 3) {
    const d = i.diasSemGeracao;
    // Fatia 1 do "alerta com motivo" (Thiago 28/07): o statusInversor que o
    // adapter devolve dá NOME ao problema. Sem status → texto antigo intacto.
    const texto =
      i.statusInversor === 'offline'
        ? `Sem comunicação há ${d} dias — o inversor não está enviando dados. Checar WiFi/internet da usina.`
        : i.statusInversor === 'falha'
          ? `Falha reportada pelo inversor há ${d} dias. Checar o equipamento.`
          : i.statusInversor === 'ok'
            ? `Parada há ${d} dias — comunicando, mas sem gerar. Checar disjuntor/strings.`
            : `Sem geração há ${d} dias. Verificar inversor / conexão WiFi.`;
    return { nivel: 'urgente', alerta: { tipo: 'sistema_offline', severidade: 'urgente', texto } };
  }
```

- [ ] **Step 4: rodar** — `npx vitest run tests/monitoramento-classificacao.test.ts` → PASS (novos + zero-regressão antigos).

- [ ] **Step 5: commit** — `git add src/modules/monitoring/classificacao.ts tests/monitoramento-classificacao.test.ts && git commit -m "feat: alerta de usina parada diz o motivo (sem comunicação × falha × parada comunicando)"`

---

### Task 3: Migration 084 + sync grava o status + montadores repassam

**Files:**
- Create: `supabase/migrations/084_status_inversor.sql`
- Modify: `src/modules/monitoring/types.ts` (SistemaCliente), `src/modules/monitoring/service.ts` (atualizarStatusSistema + syncAll ~142 + sync single ~206/252 + montarKpisEAlertas + listarParaDashboard já flui via `select('*')`)
- Modify: `src/modules/monitoring/proactive-alerts/service.ts` + `types.ts` (SistemaParaDetect)
- Test: `tests/monitoramento-status-inversor-sync.test.ts` (novo)

- [ ] **Step 1: migration** — `supabase/migrations/084_status_inversor.sql`:

```sql
-- 084: fatia 1 do "alerta com motivo" (Thiago/Sabion 28/07).
-- O sync passa a GUARDAR o status que o adapter devolve (antes era descartado).
alter table sistemas_clientes add column if not exists status_inversor text;
alter table sistemas_clientes add column if not exists status_inversor_em timestamptz;
comment on column sistemas_clientes.status_inversor is 'ok|offline|falha|desconhecido — último status devolvido pelo adapter da marca';
```

- [ ] **Step 2: teste falhando** — `tests/monitoramento-status-inversor-sync.test.ts` (mock no estilo de `tests/monitoring-company-stamp.test.ts`): syncAll com adapter fake que devolve `statusInversor: 'offline'` → o update em `sistemas_clientes` contém `status_inversor: 'offline'` e `status_inversor_em`; adapter sem o campo → grava `'desconhecido'`. Rodar → FAIL.

- [ ] **Step 3: implementação:**
  - `types.ts` SistemaCliente: `status_inversor?: string | null; status_inversor_em?: string | null;`
  - `atualizarStatusSistema` fields: incluir `status_inversor: string` e `status_inversor_em: string` no Partial.
  - `syncAll` (sucesso, ~142) e o sync individual (~206) gravam `status_inversor: result.statusInversor ?? 'desconhecido', status_inversor_em: new Date().toISOString()`.
  - `montarKpisEAlertas` passa `statusInversor: (s.status_inversor as any) ?? null` pro `classificarSistema`.
  - `proactive-alerts/types.ts` SistemaParaDetect ganha `status_inversor?: string | null`; `detect.ts` repassa `statusInversor` no `classificarSistema`; `proactive-alerts/service.ts` mapeia `status_inversor: s.status_inversor ?? null` (flui do `select('*')` do listarParaDashboard).

- [ ] **Step 4: rodar** — novo teste + `tests/proactive-alerts-*.test.ts` + `tests/monitoramento-*.test.ts` → PASS.

- [ ] **Step 5: commit** — `git add supabase/migrations/084_status_inversor.sql src/modules/monitoring/types.ts src/modules/monitoring/service.ts src/modules/monitoring/proactive-alerts/types.ts src/modules/monitoring/proactive-alerts/detect.ts src/modules/monitoring/proactive-alerts/service.ts tests/monitoramento-status-inversor-sync.test.ts && git commit -m "feat: sync guarda status_inversor (084) e o radar usa pra dar motivo ao alerta"`

---

### Task 4: Verificação final + PR

- [ ] `npx tsc --noEmit` → limpo
- [ ] `npx vitest run` → suite inteira verde
- [ ] Code review do diff (3 passadas: texto legal/regressão · segurança/tenant · escopo)
- [ ] Push + `gh pr create` (base main) — corpo: pedido do Thiago, prints, fatia 1 vs fase 2, aviso: **aplicar 084 no SQL Editor ANTES do Implantar**
