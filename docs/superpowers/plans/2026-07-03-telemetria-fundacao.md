# Fundação da Telemetria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coletar e guardar TODAS as grandezas de cada inversor (tensão/corrente/potência/energia/temp) de 15 em 15 min, com retenção e uma tela pra ver — piloto Sungrow.

**Architecture:** Modelo longo/genérico (`telemetria_medicoes` particionada por mês + `telemetria_catalogo` + `telemetria_resumo`). Coletor em cron de 15 min chama `adapter.fetchTelemetry` (novo, opcional) e faz UPSERT. Job diário resume o que passou de 6 meses e dropa partições. Tela "Dados" (aba na página da usina) plota uma grandeza no tempo.

**Tech Stack:** TypeScript ESM (imports `.js`), Supabase/Postgres (migrations numeradas), Express server-rendered + Chart.js via CDN, vitest.

Referência: `docs/superpowers/specs/2026-07-03-telemetria-fundacao-design.md`. Padrões a seguir: adapter Sungrow (`src/modules/monitoring/adapters/sungrow.ts`), `MonitoringService` (`src/modules/monitoring/service.ts`), aba Dia/Mês/Ano da tela de detalhe (`src/modules/dashboard/views.ts` + `router.ts`).

---

## File Structure

- Create `supabase/migrations/067_telemetria.sql` — 3 tabelas + partições + seed do catálogo Sungrow.
- Modify `src/modules/monitoring/types.ts` — tipos `TelemetryLeitura/TelemetryDevice/TelemetryResult` + `fetchTelemetry?` na interface.
- Modify `src/modules/monitoring/adapters/sungrow.ts` — `fetchTelemetry` + parse.
- Create `src/modules/monitoring/telemetria-service.ts` — `coletar()`, `resumirAntigos()`, `serieTelemetria()`, catálogo helpers.
- Modify `src/modules/monitoring/adapter-registry.ts` — nada (reusa registry). *(sem mudança; só leitura)*
- Modify `src/index.ts` (ou onde ficam os crons) — cron 15 min (coletar) + diário (resumir).
- Modify `src/modules/dashboard/router.ts` — rota da aba "Dados".
- Modify `src/modules/dashboard/views.ts` — render da aba "Dados".
- Create `tests/telemetria-sungrow.test.ts` — parse + fetchTelemetry mockado.
- Create `tests/telemetria-service.test.ts` — agregação do resumo (funções puras).

⚠️ **Antes da migration:** confirmar o número **067** no grupo do WhatsApp (regra do CLAUDE.md). Aplicar no SQL Editor do projeto `kupnsoyymulbdzakqlqc` antes do deploy.

---

## Task 1: Migration 067 (tabelas + partições + seed do catálogo)

**Files:**
- Create: `supabase/migrations/067_telemetria.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- 067_telemetria.sql — Fundação da telemetria (piloto Sungrow)

-- Catálogo: mapeia o ponto nativo da marca -> código normalizado + rótulo/unidade.
CREATE TABLE IF NOT EXISTS telemetria_catalogo (
  marca         text NOT NULL,
  device_type   int  NOT NULL,
  ponto_nativo  text NOT NULL,          -- id do ponto na API (Sungrow: '24','13112'...)
  ponto         text NOT NULL,          -- normalizado ('potencia','tensao_cc_mppt1'...)
  rotulo        text NOT NULL,
  unidade       text NOT NULL,
  categoria     text NOT NULL,          -- tensao|corrente|potencia|energia|temperatura|outro
  PRIMARY KEY (marca, device_type, ponto_nativo)
);

-- Medições finas (15 min), PARTICIONADA POR MÊS em ts.
CREATE TABLE IF NOT EXISTS telemetria_medicoes (
  sistema_id  uuid NOT NULL REFERENCES sistemas_clientes(id) ON DELETE CASCADE,
  device_key  text NOT NULL,
  ponto       text NOT NULL,
  ts          timestamptz NOT NULL,
  valor       double precision NOT NULL,
  unidade     text NOT NULL,
  PRIMARY KEY (sistema_id, device_key, ponto, ts)
) PARTITION BY RANGE (ts);

CREATE INDEX IF NOT EXISTS idx_telemetria_med_lookup
  ON telemetria_medicoes (sistema_id, device_key, ponto, ts);

-- Partições dos meses de operação do piloto (jul/2026..dez/2026). Novos meses:
-- criados pelo coletor sob demanda (ver Task 3, garantirParticao).
CREATE TABLE IF NOT EXISTS telemetria_medicoes_2026_07 PARTITION OF telemetria_medicoes
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS telemetria_medicoes_2026_08 PARTITION OF telemetria_medicoes
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

-- Resumo diário (do que passou de 6 meses) — leve, pra sempre.
CREATE TABLE IF NOT EXISTS telemetria_resumo (
  sistema_id  uuid NOT NULL REFERENCES sistemas_clientes(id) ON DELETE CASCADE,
  device_key  text NOT NULL,
  ponto       text NOT NULL,
  dia         date NOT NULL,
  valor_min   double precision NOT NULL,
  valor_max   double precision NOT NULL,
  valor_med   double precision NOT NULL,
  unidade     text NOT NULL,
  PRIMARY KEY (sistema_id, device_key, ponto, dia)
);

-- Seed do catálogo Sungrow (inversor string, device_type=1). Pontos confirmados
-- ao vivo/documentados; a lista final é validada no Task 2 (fetchTelemetry live).
INSERT INTO telemetria_catalogo (marca, device_type, ponto_nativo, ponto, rotulo, unidade, categoria) VALUES
  ('sungrow', 1, '24', 'potencia',        'Potência ativa',      'kW',  'potencia'),
  ('sungrow', 1, '1',  'energia_dia',      'Geração do dia',      'kWh', 'energia'),
  ('sungrow', 1, '2',  'energia_total',    'Geração total',       'kWh', 'energia'),
  ('sungrow', 1, '14', 'potencia_cc',      'Potência CC total',   'kW',  'potencia'),
  ('sungrow', 1, '11', 'potencia_mppt1',   'Potência MPPT1',      'kW',  'potencia'),
  ('sungrow', 1, '12', 'potencia_mppt2',   'Potência MPPT2',      'kW',  'potencia')
ON CONFLICT DO NOTHING;
-- (tensão CC/CA e corrente por fase: acrescentadas após o Task 2 confirmar os ids nativos.)
```

- [ ] **Step 2: Aplicar e conferir (manual, via MCP execute_sql ou SQL Editor)**

Rodar a migration; conferir `SELECT count(*) FROM telemetria_catalogo;` (>= 6) e
`\d+ telemetria_medicoes` mostra particionada. Não há teste automatizado de schema
(padrão do repo: migrations validadas na aplicação).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/067_telemetria.sql
git commit -m "feat(telemetria): migration 067 (catalogo+medicoes particionada+resumo)"
```

---

## Task 2: Tipos + `fetchTelemetry` no adapter Sungrow

**Files:**
- Modify: `src/modules/monitoring/types.ts`
- Modify: `src/modules/monitoring/adapters/sungrow.ts`
- Test: `tests/telemetria-sungrow.test.ts`

- [ ] **Step 1: Escrever o teste do parse (falha)**

`tests/telemetria-sungrow.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseTelemetriaRealTime } from '../src/modules/monitoring/adapters/sungrow.js';

describe('parseTelemetriaRealTime', () => {
  it('mapeia pontos nativos -> leituras normalizadas (W->kW, mantém V/A/Wh)', () => {
    // catálogo: ponto nativo -> {ponto, unidade, fator}
    const cat = new Map([
      ['24', { ponto: 'potencia', unidade: 'kW', fator: 0.001 }],
      ['13112', { ponto: 'tensao_cc_mppt1', unidade: 'V', fator: 1 }],
    ]);
    const rd = { device_point_list: [
      { ps_key: 'K1', p24: '73000.0', p13112: '780.0', p999: '1' /* fora do catálogo: ignora */ },
    ] };
    const out = parseTelemetriaRealTime(rd, cat, '2026-07-03T17:15:00Z');
    expect(out).toEqual([
      { deviceKey: 'K1', leituras: [
        { ponto: 'potencia', valor: 73, unidade: 'kW', ts: '2026-07-03T17:15:00Z' },
        { ponto: 'tensao_cc_mppt1', valor: 780, unidade: 'V', ts: '2026-07-03T17:15:00Z' },
      ] },
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/telemetria-sungrow.test.ts`
Expected: FAIL (`parseTelemetriaRealTime` não existe).

- [ ] **Step 3: Adicionar os tipos em `types.ts`**

Após `IntradayResult`:
```ts
export interface TelemetryLeitura { ponto: string; valor: number; unidade: string; ts: string }
export interface TelemetryDevice { deviceKey: string; leituras: TelemetryLeitura[] }
export type TelemetryResult =
  | { ok: true; devices: TelemetryDevice[] }
  | { ok: false; reason: string; invalidCredentials?: boolean };
```
Na interface `MonitoringAdapter`, após `fetchIntraday?`:
```ts
  // Opcional: foto ATUAL de todas as grandezas catalogadas por dispositivo.
  // `catalogo` = ponto_nativo -> { ponto, unidade, fator }. `ts` = horário da foto (ISO).
  fetchTelemetry?(
    credenciais: Record<string, unknown>,
    catalogo: Map<string, { ponto: string; unidade: string; fator: number }>,
    ts: string,
    ctx?: AdapterContext,
  ): Promise<TelemetryResult>;
```

- [ ] **Step 4: Implementar `parseTelemetriaRealTime` (puro) + `fetchTelemetry` no `sungrow.ts`**

Import `TelemetryResult, TelemetryDevice` de `../types.js`. Adicionar:
```ts
export function parseTelemetriaRealTime(
  resultData: unknown,
  catalogo: Map<string, { ponto: string; unidade: string; fator: number }>,
  ts: string,
): TelemetryDevice[] {
  if (!resultData || typeof resultData !== 'object') return [];
  const list = (resultData as Record<string, unknown>).device_point_list;
  if (!Array.isArray(list)) return [];
  const out: TelemetryDevice[] = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const deviceKey = String(o.ps_key ?? o.device_sn ?? '');
    if (!deviceKey) continue;
    const leituras = [];
    for (const [nativo, meta] of catalogo) {
      const raw = o[`p${nativo}`];
      const n = typeof raw === 'string' ? Number(raw) : (raw as number);
      if (!Number.isFinite(n)) continue;
      leituras.push({ ponto: meta.ponto, valor: Number((n * meta.fator).toFixed(4)), unidade: meta.unidade, ts });
    }
    if (leituras.length > 0) out.push({ deviceKey, leituras });
  }
  return out;
}
```
E o método no objeto `sungrowAdapter` (usa `listarDeviceKeys` já existente + `authPost`):
```ts
  async fetchTelemetry(credenciais, catalogo, ts, ctx): Promise<TelemetryResult> {
    const parsed = parseCreds(credenciais);
    if ('error' in parsed) return { ok: false, reason: parsed.error, invalidCredentials: true };
    if (!parsed.siteId) return { ok: false, reason: 'Sungrow fetchTelemetry precisa de site_id' };
    const dev = await listarDeviceKeys(parsed, ctx);
    if (!dev.ok) return { ok: false, reason: dev.reason, invalidCredentials: dev.invalidCredentials };
    if (dev.keys.length === 0) return { ok: true, devices: [] };
    const pontos = [...catalogo.keys()];
    // getDeviceRealTimeData exige device_type; os keys de tipos diferentes seriam
    // consultados juntos — pra simplificar o piloto, consulta os inversores string (type 1).
    const r = await authPost<unknown>(parsed, '/openapi/platform/getDeviceRealTimeData',
      { ps_key_list: dev.keys, device_type: 1, point_id_list: pontos, is_get_point_dict: '0' }, ctx);
    if (!r.ok) return { ok: false, reason: r.reason, invalidCredentials: r.invalidCredentials };
    return { ok: true, devices: parseTelemetriaRealTime(r.data, catalogo, ts) };
  },
```

- [ ] **Step 5: Rodar o teste (passa) + tsc**

Run: `npx vitest run tests/telemetria-sungrow.test.ts && npx tsc --noEmit`
Expected: PASS + tsc limpo.

- [ ] **Step 6: Validar AO VIVO (script no scratchpad) e completar o catálogo**

Gerar token (fluxo OAuth já conhecido), chamar `getDeviceRealTimeData` com um leque
de pontos nativos (24,1,2,14,11,12 + candidatos de tensão/corrente CA por fase e CC
por MPPT) na Usina Planaltina. Anotar os `ponto_nativo` que retornam valor e
acrescentá-los ao seed do catálogo (Task 1) numa migration de complemento OU no
próprio 067 se ainda não aplicada. Commit do catálogo completo.

- [ ] **Step 7: Commit**

```bash
git add src/modules/monitoring/types.ts src/modules/monitoring/adapters/sungrow.ts tests/telemetria-sungrow.test.ts
git commit -m "feat(telemetria): fetchTelemetry Sungrow + tipos + parse"
```

---

## Task 3: `TelemetriaService.coletar()` + cron 15 min

**Files:**
- Create: `src/modules/monitoring/telemetria-service.ts`
- Modify: `src/index.ts` (registro do cron)
- Test: `tests/telemetria-service.test.ts` (parte pura; coleta testada com supabase mock)

- [ ] **Step 1: Teste da leitura do catálogo (falha)**

`tests/telemetria-service.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { montarCatalogo } from '../src/modules/monitoring/telemetria-service.js';

describe('montarCatalogo', () => {
  it('vira Map ponto_nativo -> {ponto,unidade,fator} (kW=fator 0.001)', () => {
    const rows = [
      { ponto_nativo: '24', ponto: 'potencia', unidade: 'kW', categoria: 'potencia' },
      { ponto_nativo: '13112', ponto: 'tensao_cc_mppt1', unidade: 'V', categoria: 'tensao' },
    ];
    const m = montarCatalogo(rows);
    expect(m.get('24')).toEqual({ ponto: 'potencia', unidade: 'kW', fator: 0.001 });
    expect(m.get('13112')).toEqual({ ponto: 'tensao_cc_mppt1', unidade: 'V', fator: 1 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/telemetria-service.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar `telemetria-service.ts`**

```ts
import type { SupabaseService } from '../supabase.js';
import { getAdapter } from './adapter-registry.js';
import type { SistemaCliente } from './types.js';

// A API Sungrow devolve W/Wh; o catálogo diz kW/kWh -> fator 0.001. V/A/°C = 1.
export function fatorDaUnidade(unidade: string, categoria: string): number {
  if (unidade === 'kW' || unidade === 'kWh') return 0.001;
  return 1;
}

export function montarCatalogo(
  rows: Array<{ ponto_nativo: string; ponto: string; unidade: string; categoria: string }>,
): Map<string, { ponto: string; unidade: string; fator: number }> {
  const m = new Map<string, { ponto: string; unidade: string; fator: number }>();
  for (const r of rows) m.set(r.ponto_nativo, { ponto: r.ponto, unidade: r.unidade, fator: fatorDaUnidade(r.unidade, r.categoria) });
  return m;
}

export class TelemetriaService {
  constructor(private supabase: SupabaseService, private monitoring: { buildAdapterContext(s: SistemaCliente): any }) {}

  async coletar(agoraIso: string): Promise<{ sistemas: number; medicoes: number; falhas: number }> {
    const client = this.supabase.getClient();
    const { data: sistemas } = await client.from('sistemas_clientes').select('*').eq('ativo', true);
    let medicoes = 0, falhas = 0, n = 0;
    for (const s of (sistemas ?? []) as SistemaCliente[]) {
      const adapter = getAdapter(s.marca_inversor);
      if (!adapter?.fetchTelemetry) continue;
      const { data: cat } = await client.from('telemetria_catalogo').select('ponto_nativo,ponto,unidade,categoria').eq('marca', s.marca_inversor).eq('device_type', 1);
      if (!cat || cat.length === 0) continue;
      const catalogo = montarCatalogo(cat as any);
      n++;
      try {
        const r = await adapter.fetchTelemetry(s.api_credentials, catalogo, agoraIso, this.monitoring.buildAdapterContext(s));
        if (!r.ok) { falhas++; continue; }
        const rows = r.devices.flatMap((d) => d.leituras.map((l) => ({
          sistema_id: s.id, device_key: d.deviceKey, ponto: l.ponto, ts: l.ts, valor: l.valor, unidade: l.unidade,
        })));
        if (rows.length === 0) continue;
        await this.garantirParticao(agoraIso);
        const { error } = await client.from('telemetria_medicoes').upsert(rows, { onConflict: 'sistema_id,device_key,ponto,ts' });
        if (error) { falhas++; continue; }
        medicoes += rows.length;
      } catch { falhas++; }
    }
    return { sistemas: n, medicoes, falhas };
  }

  // Cria a partição do mês do `ts` se não existir (idempotente).
  async garantirParticao(tsIso: string): Promise<void> {
    const d = tsIso.slice(0, 7); // YYYY-MM
    const [y, m] = d.split('-').map(Number);
    const ini = `${y}-${String(m).padStart(2, '0')}-01`;
    const proxM = m === 12 ? 1 : m + 1, proxY = m === 12 ? y + 1 : y;
    const fim = `${proxY}-${String(proxM).padStart(2, '0')}-01`;
    const nome = `telemetria_medicoes_${y}_${String(m).padStart(2, '0')}`;
    await this.supabase.getClient().rpc('exec_sql', {
      sql: `CREATE TABLE IF NOT EXISTS ${nome} PARTITION OF telemetria_medicoes FOR VALUES FROM ('${ini}') TO ('${fim}')`,
    }).catch(() => {}); // se não houver rpc exec_sql, as partições são criadas na migration/manual
  }
}
```
> Nota de execução: se o projeto não tiver `rpc('exec_sql')`, criar as partições dos
> próximos meses na migration 067 (2026-07..2027-06) e transformar `garantirParticao`
> num no-op. Decidir no Task 1 conforme o que o Supabase do projeto permite.

- [ ] **Step 4: Rodar o teste puro (passa)**

Run: `npx vitest run tests/telemetria-service.test.ts && npx tsc --noEmit` → PASS + limpo.

- [ ] **Step 5: Registrar o cron de 15 min**

Em `src/index.ts`, onde os outros crons de monitoramento são agendados, adicionar
um a cada 15 min que instancia `TelemetriaService` e chama `coletar(new Date().toISOString())`,
logando o retorno. Seguir o padrão do cron de `syncAll` já existente (mesmo
agendador/lib). Em modo DRY (env), só logar.

- [ ] **Step 6: Commit**

```bash
git add src/modules/monitoring/telemetria-service.ts tests/telemetria-service.test.ts src/index.ts
git commit -m "feat(telemetria): coletor (coletar + cron 15min)"
```

---

## Task 4: Retenção — `resumirAntigos()` + cron diário

**Files:**
- Modify: `src/modules/monitoring/telemetria-service.ts` *(mesmo arquivo do Task 3)*
- Modify: `src/index.ts` (cron diário)
- Test: `tests/telemetria-service.test.ts`

- [ ] **Step 1: Teste da agregação (falha)**

Adicionar em `tests/telemetria-service.test.ts`:
```ts
import { agregarDia } from '../src/modules/monitoring/telemetria-service.js';
describe('agregarDia', () => {
  it('min/max/média por (device,ponto,dia)', () => {
    const rows = [
      { device_key: 'K', ponto: 'potencia', ts: '2026-01-01T09:00:00Z', valor: 10, unidade: 'kW' },
      { device_key: 'K', ponto: 'potencia', ts: '2026-01-01T12:00:00Z', valor: 30, unidade: 'kW' },
    ];
    expect(agregarDia(rows)).toEqual([
      { device_key: 'K', ponto: 'potencia', dia: '2026-01-01', valor_min: 10, valor_max: 30, valor_med: 20, unidade: 'kW' },
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** → `npx vitest run tests/telemetria-service.test.ts` FAIL.

- [ ] **Step 3: Implementar `agregarDia` (puro) + `resumirAntigos` no service**

```ts
export function agregarDia(
  rows: Array<{ device_key: string; ponto: string; ts: string; valor: number; unidade: string }>,
): Array<{ device_key: string; ponto: string; dia: string; valor_min: number; valor_max: number; valor_med: number; unidade: string }> {
  const g = new Map<string, { device_key: string; ponto: string; dia: string; unidade: string; vs: number[] }>();
  for (const r of rows) {
    const dia = r.ts.slice(0, 10);
    const k = `${r.device_key}|${r.ponto}|${dia}`;
    if (!g.has(k)) g.set(k, { device_key: r.device_key, ponto: r.ponto, dia, unidade: r.unidade, vs: [] });
    g.get(k)!.vs.push(r.valor);
  }
  return [...g.values()].map((x) => ({
    device_key: x.device_key, ponto: x.ponto, dia: x.dia, unidade: x.unidade,
    valor_min: Math.min(...x.vs), valor_max: Math.max(...x.vs),
    valor_med: Number((x.vs.reduce((a, b) => a + b, 0) / x.vs.length).toFixed(4)),
  }));
}
```
`resumirAntigos(corteIso)`: lê `telemetria_medicoes` com `ts < corte`, agrega com
`agregarDia`, UPSERT em `telemetria_resumo` (onConflict `sistema_id,device_key,ponto,dia`),
e dropa as partições de mês inteiramente < corte (`DROP TABLE IF EXISTS telemetria_medicoes_YYYY_MM`).
Corte = hoje − 6 meses.

- [ ] **Step 4: Rodar teste (passa)** → PASS + `npx tsc --noEmit` limpo.

- [ ] **Step 5: Cron diário** em `src/index.ts` (junto do syncAll ~3h BRT) chamando `resumirAntigos`.

- [ ] **Step 6: Commit**

```bash
git add src/modules/monitoring/telemetria-service.ts tests/telemetria-service.test.ts src/index.ts
git commit -m "feat(telemetria): retencao (resumo diario do antigo + drop de particao)"
```

---

## Task 5: Tela "Dados" (aba + gráfico)

**Files:**
- Modify: `src/modules/monitoring/telemetria-service.ts` (`serieTelemetria`)
- Modify: `src/modules/dashboard/router.ts` (rota/branch da aba)
- Modify: `src/modules/dashboard/views.ts` (render)
- Test: `tests/telemetria-service.test.ts` (montagem da série — se houver função pura)

- [ ] **Step 1: `serieTelemetria(sistemaId, deviceKey, ponto, periodo)`**

No service: lê `telemetria_medicoes` (período recente) OU `telemetria_resumo`
(período antigo, usa `valor_med`) e devolve `{ ts, valor }[]` ordenado. Também
expõe `listarDevicesEPontos(sistemaId)` → dispositivos e grandezas disponíveis
(distinct de `telemetria_medicoes`/`telemetria_resumo`) pra popular os seletores.

- [ ] **Step 2: Rota**

Em `router.ts`, na rota de detalhe (ou nova `/monitoramento/:id/dados`), aceitar
`?device=&ponto=&periodo=` e montar os dados via `serieTelemetria`. Adicionar a aba
**"Dados"** ao lado de Dia/Mês/Ano (mesmo padrão dos `tab(...)`).

- [ ] **Step 3: Render**

Em `views.ts`, quando a aba for "dados": seletores (device, grandeza, período) +
`<canvas>` com Chart.js (linha da grandeza no tempo), degradando com aviso se sem
dados. Reusar o padrão do `graficoDia`.

- [ ] **Step 4: tsc + suíte** → `npx tsc --noEmit && npx vitest run` limpo/verde.

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/telemetria-service.ts src/modules/dashboard/router.ts src/modules/dashboard/views.ts
git commit -m "feat(telemetria): tela Dados (aba + grafico por grandeza)"
```

---

## Fechamento

- [ ] `npx tsc --noEmit` limpo + `npx vitest run` verde.
- [ ] **Code review 3×** do diff (regra do repo).
- [ ] Validação AO VIVO: coletar 1 foto real da Usina Planaltina, conferir que
      apareceu em `telemetria_medicoes` e que a aba "Dados" plota a grandeza.
- [ ] PR. Antes de aplicar: **confirmar a migration 067 no grupo** e aplicar no
      SQL Editor. Depois Implantar (EasyPanel) → smoke.
