# Gráfico Dia/Mês/Ano da usina — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar os períodos corridos (30d/90d/…) da tela de detalhe da usina por navegação de calendário Dia/Mês/Ano com setas ◀▶, com a curva do Dia buscada ao vivo (GoodWe/Solis).

**Architecture:** Funções puras montam as séries de calendário (Mês=diária, Ano=mensal) a partir de `geracao_diaria` do banco. Uma capacidade nova opcional do adapter (`fetchIntraday`) busca a curva de potência do dia ao vivo (implementada em GoodWe e Solis; demais degradam pro total do dia). A rota passa `?vista&ref`; a view server-rendered mostra abas + setas + Chart.js.

**Tech Stack:** TypeScript ESM (`.js` nos imports), Supabase, Express server-rendered, Chart.js (canvas, já em uso), vitest.

**Spec:** `docs/superpowers/specs/2026-07-01-monitoring-grafico-dia-mes-ano-design.md`. Branch `feat/monitoring-grafico-dia-mes-ano` (já criada). Sem migration.

---

## File Structure

- **Create** `src/modules/monitoring/detalhe-series.ts` — puro: séries de calendário + navegação.
- **Create** `tests/detalhe-series.test.ts`.
- **Modify** `src/modules/monitoring/types.ts` — `IntradayResult` + `fetchIntraday?` no `MonitoringAdapter`.
- **Modify** `src/modules/monitoring/adapters/goodwe.ts` — `fetchIntraday` + parse.
- **Modify** `src/modules/monitoring/adapters/solis.ts` — `fetchIntraday` + parse.
- **Modify** `tests/goodwe-adapter.test.ts`, `tests/solis-adapter.test.ts` — parse intraday (puro).
- **Modify** `src/modules/monitoring/service.ts` — método `getDetalheCalendario(id, {vista, ref})`.
- **Modify** `src/modules/dashboard/router.ts` — rota `/monitoramento/:id` usa `vista/ref` + intraday ao vivo.
- **Modify** `src/modules/dashboard/views.ts` — `renderDetalheSistemaPage`: abas + setas + gráfico por vista; remove presets.

---

## Task 1: Séries de calendário + navegação (puro)

**Files:**
- Create: `src/modules/monitoring/detalhe-series.ts`
- Test: `tests/detalhe-series.test.ts`

- [ ] **Step 1: Escrever os testes (falham)**

```ts
// tests/detalhe-series.test.ts
import { describe, it, expect } from 'vitest';
import { serieMesDiaria, serieAnoMensal, navegacao } from '../src/modules/monitoring/detalhe-series.js';

const ger = [
  { data: '2026-06-29', geracao_kwh: 40 },
  { data: '2026-07-01', geracao_kwh: 42 },
  { data: '2026-07-03', geracao_kwh: 38 },
];

describe('serieMesDiaria', () => {
  it('devolve um ponto por dia do mês, 0 nos sem dado', () => {
    const s = serieMesDiaria(ger, 2026, 7); // julho tem 31 dias
    expect(s.length).toBe(31);
    expect(s[0]).toEqual({ data: '2026-07-01', kwh: 42 });
    expect(s[1]).toEqual({ data: '2026-07-02', kwh: 0 });
    expect(s[2]).toEqual({ data: '2026-07-03', kwh: 38 });
    expect(s[30].data).toBe('2026-07-31');
  });
  it('fevereiro bissexto tem 29 dias (2028)', () => {
    expect(serieMesDiaria([], 2028, 2).length).toBe(29);
  });
});

describe('serieAnoMensal', () => {
  it('12 meses, somando por mês; meses sem dado = 0', () => {
    const s = serieAnoMensal(ger, 2026);
    expect(s.length).toBe(12);
    expect(s[5]).toEqual({ mes: '2026-06', kwh: 40 });  // junho
    expect(s[6]).toEqual({ mes: '2026-07', kwh: 80 });  // julho 42+38
    expect(s[0]).toEqual({ mes: '2026-01', kwh: 0 });
  });
});

describe('navegacao', () => {
  const hoje = new Date('2026-07-15T00:00:00Z');
  it('mes: label pt-BR e setas; nao passa do mes de hoje', () => {
    const n = navegacao('mes', '2026-07-15', hoje, '2025-01-01');
    expect(n.label).toBe('julho de 2026');
    expect(n.anterior).toBe('2026-06-15');
    expect(n.proximo).toBeNull(); // julho é o mês corrente → sem "próximo"
  });
  it('ano: label e setas; nao passa do ano de hoje', () => {
    const n = navegacao('ano', '2026-03-01', hoje, '2025-01-01');
    expect(n.label).toBe('2026');
    expect(n.anterior).toBe('2025-03-01');
    expect(n.proximo).toBeNull();
  });
  it('dia: nao passa de hoje; label dd/mm/aaaa', () => {
    const n = navegacao('dia', '2026-07-15', hoje, '2025-01-01');
    expect(n.label).toBe('15/07/2026');
    expect(n.proximo).toBeNull();
    expect(n.anterior).toBe('2026-07-14');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/detalhe-series.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar `detalhe-series.ts`**

```ts
// src/modules/monitoring/detalhe-series.ts
// PURO: monta as séries de calendário (mês=diária, ano=mensal) e calcula a
// navegação Dia/Mês/Ano (setas + rótulo). Sem I/O — testável.

export interface GeracaoDia { data: string; geracao_kwh: number }
export type Vista = 'dia' | 'mes' | 'ano';

const MESES_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate(); // mes 1-based; dia 0 = último do mês anterior
}

// Um ponto por dia do mês; kWh do banco ou 0 se não houver dado no dia.
export function serieMesDiaria(geracoes: GeracaoDia[], ano: number, mes: number): Array<{ data: string; kwh: number }> {
  const porDia = new Map<string, number>();
  for (const g of geracoes) porDia.set(g.data, (porDia.get(g.data) ?? 0) + Number(g.geracao_kwh));
  const out: Array<{ data: string; kwh: number }> = [];
  const n = diasNoMes(ano, mes);
  const mm = String(mes).padStart(2, '0');
  for (let d = 1; d <= n; d++) {
    const data = `${ano}-${mm}-${String(d).padStart(2, '0')}`;
    out.push({ data, kwh: Number((porDia.get(data) ?? 0).toFixed(1)) });
  }
  return out;
}

// 12 meses do ano; soma a geração diária de cada mês.
export function serieAnoMensal(geracoes: GeracaoDia[], ano: number): Array<{ mes: string; kwh: number }> {
  const porMes = new Map<string, number>();
  for (const g of geracoes) {
    if (g.data.slice(0, 4) !== String(ano)) continue;
    const mes = g.data.slice(0, 7); // YYYY-MM
    porMes.set(mes, (porMes.get(mes) ?? 0) + Number(g.geracao_kwh));
  }
  const out: Array<{ mes: string; kwh: number }> = [];
  for (let m = 1; m <= 12; m++) {
    const mes = `${ano}-${String(m).padStart(2, '0')}`;
    out.push({ mes, kwh: Number((porMes.get(mes) ?? 0).toFixed(1)) });
  }
  return out;
}

// Setas + rótulo. `ref` é uma data YYYY-MM-DD dentro do período mostrado.
// Não deixa ir pra frente além do período de hoje. `anterior`/`proximo` são a
// mesma `ref` deslocada 1 dia/mês/ano (ou null se bater no limite).
export function navegacao(
  vista: Vista,
  ref: string,
  hoje: Date,
  _dataInstalacao: string | null,
): { anterior: string; proximo: string | null; label: string } {
  const [y, m, d] = ref.split('-').map(Number);
  const iso = (yy: number, mm: number, dd: number) => `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const hy = hoje.getUTCFullYear(), hm = hoje.getUTCMonth() + 1, hd = hoje.getUTCDate();

  if (vista === 'ano') {
    return {
      anterior: iso(y - 1, m, d),
      proximo: y < hy ? iso(y + 1, m, d) : null,
      label: `${y}`,
    };
  }
  if (vista === 'mes') {
    const antMes = m === 1 ? { yy: y - 1, mm: 12 } : { yy: y, mm: m - 1 };
    const proxMes = m === 12 ? { yy: y + 1, mm: 1 } : { yy: y, mm: m + 1 };
    const noFuturo = proxMes.yy > hy || (proxMes.yy === hy && proxMes.mm > hm);
    return {
      anterior: iso(antMes.yy, antMes.mm, 1),
      proximo: noFuturo ? null : iso(proxMes.yy, proxMes.mm, 1),
      label: `${MESES_PT[m - 1]} de ${y}`,
    };
  }
  // dia
  const base = new Date(Date.UTC(y, m - 1, d));
  const ant = new Date(base); ant.setUTCDate(ant.getUTCDate() - 1);
  const prox = new Date(base); prox.setUTCDate(prox.getUTCDate() + 1);
  const proxIso = prox.toISOString().slice(0, 10);
  const hojeIso = iso(hy, hm, hd);
  return {
    anterior: ant.toISOString().slice(0, 10),
    proximo: proxIso > hojeIso ? null : proxIso,
    label: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/detalhe-series.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/detalhe-series.ts tests/detalhe-series.test.ts
git commit -m "feat(monitoring): series de calendario (mes/ano) + navegacao Dia/Mes/Ano"
```

---

## Task 2: Tipo `IntradayResult` + `fetchIntraday?` no adapter

**Files:**
- Modify: `src/modules/monitoring/types.ts`

- [ ] **Step 1: Adicionar os tipos**

No fim de `types.ts`, antes/depois de `MonitoringAdapter` (colocar a interface e estender):

```ts
// Um ponto da curva intradiária de potência.
export interface IntradayPonto { hora: string; kw: number }

export type IntradayResult =
  | { ok: true; pontos: IntradayPonto[] }
  | { ok: false; reason: string };
```

E dentro da interface `MonitoringAdapter`, adicionar o método opcional:

```ts
  // Opcional: curva intradiária de POTÊNCIA (kW) de um dia (YYYY-MM-DD). Ao vivo.
  // Adapter sem suporte não implementa — a tela degrada pro total do dia.
  fetchIntraday?(
    credenciais: Record<string, unknown>,
    dia: string,
  ): Promise<IntradayResult>;
```

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit` → limpo (adição de tipo opcional não quebra nada).

- [ ] **Step 3: Commit**

```bash
git add src/modules/monitoring/types.ts
git commit -m "feat(monitoring): tipo IntradayResult + fetchIntraday opcional no adapter"
```

---

## Task 3: `fetchIntraday` no GoodWe

**Files:**
- Modify: `src/modules/monitoring/adapters/goodwe.ts`
- Test: `tests/goodwe-adapter.test.ts`

Contexto: o GoodWe já tem `semsPostAuth(path, body, creds)` e `parseCreds`. O endpoint da curva do dia (validado ao vivo 01/07): `POST /api/v2/Charts/GetPlantPowerChart` body `{ id, date, full_script:false }` → `data.lines[]` com `xy:[{x:"00:05", y:<W>}]`; a linha da potência PV tem `name:"PCurve_Power_PV"` / `unit:"W"`.

- [ ] **Step 1: Teste do parser (puro)**

Adicionar em `tests/goodwe-adapter.test.ts`:

```ts
import { parseIntradayGoodwe } from '../src/modules/monitoring/adapters/goodwe.js';

describe('parseIntradayGoodwe', () => {
  it('pega a linha PCurve_Power_PV e converte W→kW', () => {
    const data = { lines: [
      { name: 'PCurve_Power_PV', unit: 'W', xy: [{ x: '06:00', y: 0 }, { x: '12:00', y: 17281 }, { x: '18:00', y: null }] },
      { name: 'Consumption', unit: 'W', xy: [{ x: '12:00', y: 5 }] },
    ] };
    const r = parseIntradayGoodwe(data);
    expect(r).toEqual([{ hora: '06:00', kw: 0 }, { hora: '12:00', kw: 17.281 }]);
  });
  it('sem linha de potencia → vazio', () => {
    expect(parseIntradayGoodwe({})).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/goodwe-adapter.test.ts` → FAIL (`parseIntradayGoodwe` não existe).

- [ ] **Step 3: Implementar o parser + o método no adapter**

Adicionar a função pura (perto dos outros parsers) em `goodwe.ts`:

```ts
interface ChartLineIntra { name?: string; unit?: string; xy?: Array<{ x?: string; y?: number | null }> }

// GetPlantPowerChart → curva de potência do dia (W → kW). Descarta pontos sem leitura.
export function parseIntradayGoodwe(data: { lines?: ChartLineIntra[] }): Array<{ hora: string; kw: number }> {
  const lines = Array.isArray(data?.lines) ? data.lines : [];
  const line = lines.find((l) => l.name === 'PCurve_Power_PV')
    ?? lines.find((l) => (l.unit ?? '').toUpperCase() === 'W')
    ?? lines[0];
  const xy = line && Array.isArray(line.xy) ? line.xy : [];
  const out: Array<{ hora: string; kw: number }> = [];
  for (const p of xy) {
    const hora = (p?.x ?? '').trim();
    if (!hora) continue;
    if (typeof p.y !== 'number' || !Number.isFinite(p.y)) continue;
    out.push({ hora, kw: Number((p.y / 1000).toFixed(3)) });
  }
  return out;
}
```

No objeto `goodweAdapter`, adicionar o método (usa `semsPostAuth` já existente):

```ts
  async fetchIntraday(credenciais, dia) {
    const parsed = parseCreds(credenciais);
    if ('error' in parsed) return { ok: false, reason: parsed.error };
    if (!parsed.siteId) return { ok: false, reason: 'GoodWe fetchIntraday precisa de site_id' };
    const r = await semsPostAuth<{ lines?: ChartLineIntra[] }>(
      '/api/v2/Charts/GetPlantPowerChart',
      { id: parsed.siteId, date: dia, full_script: false },
      parsed,
    );
    if (!r.ok) return { ok: false, reason: r.reason };
    return { ok: true, pontos: parseIntradayGoodwe(r.data) };
  },
```
(garanta que o tipo de retorno casa com `IntradayResult` importado de `../types.js`.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/goodwe-adapter.test.ts` → PASS. Depois `npx tsc --noEmit` → limpo.

- [ ] **Step 5: Teste AO VIVO (manual, não commitado)**

Criar um script temporário que chama `goodweAdapter.fetchIntraday({email,password,site_id}, '2026-07-01')` com a conta real (credenciais na Área de Trabalho do Junior / memória) e confirmar `pontos.length > 0` num dia com sol. Apagar o script depois. (Se o Junior não fornecer credencial aqui, pular e validar no deploy.)

- [ ] **Step 6: Commit**

```bash
git add src/modules/monitoring/adapters/goodwe.ts tests/goodwe-adapter.test.ts
git commit -m "feat(monitoring): fetchIntraday do GoodWe (curva de potencia do dia)"
```

---

## Task 4: `fetchIntraday` no Solis

**Files:**
- Modify: `src/modules/monitoring/adapters/solis.ts`
- Test: `tests/solis-adapter.test.ts`

Contexto: o Solis tem `solisPost(parsed, resource, body)` (já com throttle 1/s e assinatura) e `parseCreds`. Endpoint da curva do dia: `POST /v1/api/stationDay` body `{ id, time: dia, timeZone: -3, money: 'BRL' }` → `data` é um ARRAY de pontos do dia. **IMPORTANTE: os nomes dos campos de hora/potência precisam ser confirmados na resposta real** — no passo 3 o implementador deve rodar 1 chamada ao vivo e inspecionar as chaves antes de fixar o parser (padrões Solis comuns: `time`/`timeStr` pra hora e `pac`/`power` em W).

- [ ] **Step 1: Teste do parser (puro) — usa o shape confirmado**

Adicionar em `tests/solis-adapter.test.ts` (ajustar os nomes de campo ao confirmado no passo 3, mantendo o comportamento W→kW e descarte de não-numérico):

```ts
import { parseIntradaySolis } from '../src/modules/monitoring/adapters/solis.js';

describe('parseIntradaySolis', () => {
  it('mapeia hora + converte W→kW, descarta invalido', () => {
    const data = [
      { timeStr: '06:00', pac: 0 },
      { timeStr: '12:00', pac: 25850 },
      { timeStr: '18:00', pac: null },
    ];
    expect(parseIntradaySolis(data)).toEqual([{ hora: '06:00', kw: 0 }, { hora: '12:00', kw: 25.85 }]);
  });
  it('nao-array → vazio', () => expect(parseIntradaySolis(null)).toEqual([]));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/solis-adapter.test.ts` → FAIL.

- [ ] **Step 3: Confirmar shape AO VIVO + implementar parser + método**

Rodar 1 chamada real `solisPost(parsed, '/v1/api/stationDay', { id, time:'2026-07-01', timeZone:-3, money:'BRL' })` e inspecionar as chaves de um ponto. Fixar o parser (ajustando `timeStr`/`pac` pros nomes reais):

```ts
interface SolisDayPonto { time?: string; timeStr?: string; pac?: number | string; power?: number | string }

export function parseIntradaySolis(data: unknown): Array<{ hora: string; kw: number }> {
  const arr = Array.isArray(data) ? (data as SolisDayPonto[]) : [];
  const out: Array<{ hora: string; kw: number }> = [];
  for (const p of arr) {
    const hora = (p.timeStr ?? p.time ?? '').toString().trim();
    if (!hora) continue;
    const raw = p.pac ?? p.power;
    const w = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof w !== 'number' || !Number.isFinite(w)) continue;
    out.push({ hora, kw: Number((w / 1000).toFixed(3)) });
  }
  return out;
}
```

No objeto `solisAdapter`, adicionar:

```ts
  async fetchIntraday(credenciais, dia) {
    const parsed = parseCreds(credenciais);
    if ('error' in parsed) return { ok: false, reason: parsed.error };
    if (!parsed.siteId) return { ok: false, reason: 'Solis fetchIntraday precisa de site_id' };
    const r = await solisPost<unknown>(parsed, '/v1/api/stationDay', { id: parsed.siteId, time: dia, timeZone: -3, money: 'BRL' });
    if (!r.ok) return { ok: false, reason: r.reason };
    return { ok: true, pontos: parseIntradaySolis(r.data) };
  },
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/solis-adapter.test.ts` → PASS. `npx tsc --noEmit` → limpo.

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/adapters/solis.ts tests/solis-adapter.test.ts
git commit -m "feat(monitoring): fetchIntraday do Solis (curva de potencia do dia)"
```

---

## Task 5: Service — `getDetalheCalendario(id, {vista, ref})`

**Files:**
- Modify: `src/modules/monitoring/service.ts`

LER a `getDetalheSistema` primeiro pra reusar: como lê `geracao_diaria` do sistema, os KPIs (hoje/mês/ano/total), alertas e `serieMensalCompleta`. A ideia é um método novo que reaproveita a MESMA carga de KPIs/alertas mas monta a `serie` por vista.

- [ ] **Step 1: Adicionar o método**

Adicionar na classe `MonitoringService` um método que:
1. carrega o sistema + TODA a geração diária dele (ou o suficiente: o ano do `ref` inteiro + o mês do `ref`); reaproveita a query existente de geração.
2. monta a `serie` conforme `vista` usando `serieMesDiaria`/`serieAnoMensal` (import de `./detalhe-series.js`); pra `dia`, a `serie` fica vazia aqui (a curva vem ao vivo na rota) e devolve `totalDiaKwh` daquele dia (do banco) pro fallback.
3. calcula `navegacao(vista, ref, hoje, dataInstalacao)`.
4. devolve os MESMOS KPIs/alertas de hoje + `{ vista, ref, nav, serie, totalDiaKwh }`.

```ts
import { serieMesDiaria, serieAnoMensal, navegacao, type Vista } from './detalhe-series.js';

async getDetalheCalendario(id: string, opts: { vista: Vista; ref: string }): Promise<DetalheCalendario | null> {
  const s = await this.supabase.getSistemaById(id);
  if (!s) return null;
  const hoje = new Date();
  const [y] = opts.ref.split('-').map(Number);
  // geração do ano do ref (cobre mês e ano). Reusar o método que já lê geracao_diaria.
  const geracoes = await this.supabase.getGeracaoDiariaPorSistema(id, `${y}-01-01`, `${y}-12-31`);
  const nav = navegacao(opts.vista, opts.ref, hoje, s.data_instalacao ?? null);

  let serie: Array<{ x: string; kwh: number }> = [];
  let totalDiaKwh: number | null = null;
  if (opts.vista === 'mes') {
    const [, mes] = opts.ref.split('-').map(Number);
    serie = serieMesDiaria(geracoes, y, mes).map((p) => ({ x: p.data, kwh: p.kwh }));
  } else if (opts.vista === 'ano') {
    serie = serieAnoMensal(geracoes, y).map((p) => ({ x: p.mes, kwh: p.kwh }));
  } else {
    // dia: curva vem ao vivo na rota; aqui só o total do dia pro fallback
    const doDia = geracoes.find((g) => g.data === opts.ref);
    totalDiaKwh = doDia ? Number(doDia.geracao_kwh) : null;
  }

  const kpis = await this.calcularKpis(s, geracoes, hoje); // reusar o cálculo de KPIs existente
  const alertas = await this.carregarAlertas(id);          // reusar
  return { sistema: s, kpis, alertas, vista: opts.vista, ref: opts.ref, nav, serie, totalDiaKwh };
}
```
(ADAPTAR aos nomes REAIS: o método de ler geração, o de KPIs e o de alertas já existem dentro de `getDetalheSistema` — extrair/reusar. Se não houver `getGeracaoDiariaPorSistema`, usar a mesma query que `getDetalheSistema` usa. Definir a interface `DetalheCalendario` exportada com os campos acima; `serie: { x: string; kwh: number }[]`.)

- [ ] **Step 2: tsc + suíte**

Run: `npx tsc --noEmit` (limpo) e `npx vitest run` (verde — nada quebrou).

- [ ] **Step 3: Commit**

```bash
git add src/modules/monitoring/service.ts
git commit -m "feat(monitoring): getDetalheCalendario (serie por vista Dia/Mes/Ano)"
```

---

## Task 6: Router — `?vista&ref` + curva do Dia ao vivo

**Files:**
- Modify: `src/modules/dashboard/router.ts` (rota `GET /monitoramento/:id`, ~1922-1958)

- [ ] **Step 1: Trocar o parsing de período pela vista/ref + fetch intraday**

Substituir o corpo que hoje resolve `preset|inicio/fim` por:

```ts
import { getAdapter } from '../monitoring/adapter-registry.js';
// ...
const vistasOk = ['dia', 'mes', 'ano'] as const;
const vista = (vistasOk as readonly string[]).includes(String(req.query.vista)) ? String(req.query.vista) as 'dia'|'mes'|'ano' : 'mes';
const refQ = typeof req.query.ref === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.ref) ? req.query.ref : new Date().toISOString().slice(0, 10);

const detalhe = await monitoringService.getDetalheCalendario(id, { vista, ref: refQ });
if (!detalhe) return res.status(404).send('<h2>Sistema nao encontrado</h2><a href="/dashboard/monitoramento">← voltar</a>');

// Curva do Dia: ao vivo, best-effort. Falha/sem suporte → curvaDia=null (view usa totalDiaKwh).
let curvaDia: import('../monitoring/types.js').IntradayPonto[] | null = null;
let curvaMsg: string | null = null;
if (vista === 'dia') {
  const adapter = getAdapter(detalhe.sistema.marca_inversor);
  if (adapter?.fetchIntraday) {
    try {
      const r = await adapter.fetchIntraday(detalhe.sistema.api_credentials, refQ);
      if (r.ok && r.pontos.length > 0) curvaDia = r.pontos;
      else curvaMsg = 'Sem curva pra esse dia.';
    } catch { curvaMsg = 'Não consegui buscar a curva agora.'; }
  } else {
    curvaMsg = 'Curva minuto a minuto não disponível para este inversor.';
  }
}
```
Depois passar `detalhe`, `curvaDia`, `curvaMsg` pro `renderDetalheSistemaPage` (ver Task 7 pra a nova assinatura). Manter o resto (dono, timeline, prontuário) igual.

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit` — vai acusar a assinatura de `renderDetalheSistemaPage` até a Task 7 (esperado). Se estiver isolado nisso, seguir; senão corrigir.

- [ ] **Step 3: Commit** (junto com a Task 7, já que a assinatura muda nas duas — commitar após a view compilar).

---

## Task 7: View — abas Dia/Mês/Ano + setas + gráfico por vista

**Files:**
- Modify: `src/modules/dashboard/views.ts` (`renderDetalheSistemaPage`, ~902-1063 e o `<script>` do Chart.js)

- [ ] **Step 1: Nova assinatura + abas/setas no lugar do seletor de período**

Ajustar a assinatura de `renderDetalheSistemaPage` pra receber `detalhe` (com `vista/ref/nav/serie/totalDiaKwh`), `curvaDia`, `curvaMsg`. Substituir a `<section>` do "📅 Período" (linhas ~1029-1044) por abas + setas:

```ts
const tab = (v: 'dia'|'mes'|'ano', txt: string) =>
  `<a href="/dashboard/monitoramento/${escapeHtml(s.id)}?vista=${v}&ref=${escapeHtml(d.ref)}" class="px-3 py-1.5 rounded-md text-sm ${d.vista === v ? 'bg-sky-700 text-white font-semibold' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">${txt}</a>`;
const seta = (destino: string | null, simbolo: string) =>
  destino
    ? `<a href="/dashboard/monitoramento/${escapeHtml(s.id)}?vista=${d.vista}&ref=${destino}" class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700">${simbolo}</a>`
    : `<span class="px-2 py-1 rounded bg-slate-50 text-slate-300">${simbolo}</span>`;
// ...
`<section class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
  <div class="flex flex-wrap items-center gap-2">
    ${tab('dia','Dia')} ${tab('mes','Mês')} ${tab('ano','Ano')}
    <div class="ml-auto flex items-center gap-2">
      ${seta(d.nav.anterior, '◀')}
      <span class="text-sm font-semibold text-slate-700 min-w-[8rem] text-center">${escapeHtml(d.nav.label)}</span>
      ${seta(d.nav.proximo, '▶')}
    </div>
  </div>
</section>`
```

- [ ] **Step 2: O gráfico por vista**

Trocar a `<section>` do `graficoPeriodo` pra um bloco que:
- `vista==='dia'` e `curvaDia` → canvas `graficoDia` (linha kW). Sem curva → mostra `curvaMsg` + "Geração do dia: ${d.totalDiaKwh ?? '—'} kWh".
- `vista==='mes'|'ano'` → canvas `graficoPeriodo` (barras). Série vazia (tudo 0) → "sem geração registrada nesse período".

No `<script>` do Chart.js, montar o chart conforme `d.vista`: `type:'line'` pra dia (labels = horas, dados = kW), `type:'bar'` pra mês/ano (labels = dias/meses, dados = kWh). Injetar os dados via `JSON.stringify`. Reusar o estilo/config do chart que já existe (cores, options). O `graficoMensal` (histórico completo) pode PERMANECER como está (não faz parte desta troca).

- [ ] **Step 3: tsc + render**

Run: `npx tsc --noEmit` (limpo) e `npx vitest run` (verde). Renderizar a página localmente (ou via teste de smoke de render, se houver) pra conferir que as 3 vistas montam sem erro.

- [ ] **Step 4: Commit** (Task 6 + 7 juntas)

```bash
git add src/modules/dashboard/router.ts src/modules/dashboard/views.ts
git commit -m "feat(monitoring): tela de detalhe com abas Dia/Mes/Ano + setas + curva ao vivo"
```

---

## Task 8: Fechamento

- [ ] **Step 1:** `npx tsc --noEmit` limpo + `npx vitest run` verde (suíte completa; se algo do monitoramento quebrou, é regressão — corrigir).
- [ ] **Step 2:** Code review 3× do diff (foco: séries corretas nas bordas de mês/ano; curva do Dia degrada sem quebrar; presets antigos removidos sem deixar link morto; KPIs/alertas/timeline intactos).
- [ ] **Step 3:** Validação ao vivo: abrir uma usina GoodWe e uma Solis → conferir Dia (curva), Mês (barras diárias do mês certo), Ano (barras mensais), setas ◀▶ e o "não passa de hoje".
- [ ] **Step 4:** PR (Junior autoriza push). Sem migration. Depois Implantar.

---

## Notas de escopo

Sem migration (a curva do Dia é ao vivo). KPIs, alertas, prontuário, timeline, auto-refresh e o cron ficam intactos. O `graficoMensal` "histórico completo" permanece. Removidos: os presets `30d/90d/6m/1a/2a/5a/tudo` e o range custom da tela de detalhe (substituídos pelas abas).
