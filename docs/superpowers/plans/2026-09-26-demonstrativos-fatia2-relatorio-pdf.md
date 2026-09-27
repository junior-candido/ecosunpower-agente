# Demonstrativos GD — Fatia 2: Relatório mensal em PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na tela do cliente de `/dashboard/demonstrativos`, um botão "📄 Gerar PDF" (só aceso com o mês 🟢) gera o relatório mensal da usina em PDF A4 de 2 páginas, com a marca da empresa do tenant, números exatos e fontes citadas.

**Architecture:** Motor PURO (`relatorio-motor.ts`) transforma demonstrativo + geração em `RelatorioGd`; `relatorio-html.ts` desenha o HTML A4 (Chart.js); `relatorio-pdf.ts` chama o `htmlToPdf` (Puppeteer) já existente e confere o PDF pronto (2 páginas + rodapé) antes de devolver; `relatorio-servico.ts` junta tudo com dependências injetadas (testável sem banco). A rota fica fina. Migration 132 cria `relatorios_gd_gerados` (rastreio) e `empresa_config.gd_tarifa_rs_kwh` (tarifa da economia estimada por empresa).

**Tech Stack:** TypeScript ESM (imports relativos terminam em `.js`), Express server-rendered, Supabase, vitest, Puppeteer (`src/modules/proposal/pdf-generator.ts`), `unpdf` (já usado em `demonstrativo-io.ts`), Chart.js 4.4.0 via CDN jsdelivr.

**Spec:** `docs/superpowers/specs/2026-09-23-demonstrativos-tela-relatorio-design.md` — seções "Relatório", "Dados", "Unidades de código", fatia 2.

**Regras do repo (CLAUDE.md):** branch `feat/demonstrativos-relatorio-pdf` (já criada a partir da `main` com #311); `git add` por nome de arquivo; `npx tsc --noEmit` limpo e `npx vitest run` verde (2 falhas pré-existentes em `tests/supabase-vincular-novo.test.ts` não são nossas); texto ao cliente em português simples; assinatura "Responsável Técnico", nunca "engenheiro"; commits terminam com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. **Migration 132: avisar o número no grupo do WhatsApp antes; aplicar em prod ANTES do deploy.**

---

## Mapa de arquivos

| Arquivo | Novo/Muda | Responsabilidade |
|---|---|---|
| `supabase/migrations/132_relatorios_gd.sql` | novo | tabela `relatorios_gd_gerados` + coluna `empresa_config.gd_tarifa_rs_kwh` |
| `src/modules/empresa-config.ts` | muda | campo `gdTarifaRsKwh` (padrão 0,99) |
| `src/modules/gd/relatorio-motor.ts` | novo | PURO: entrada → `RelatorioGd` (números, frase, 13 meses, créditos, rateio, desempenho, fontes) |
| `src/modules/gd/relatorio-html.ts` | novo | `RelatorioGd` + `MarcaRelatorio` → HTML A4 2 páginas |
| `src/modules/gd/relatorio-pdf.ts` | novo | HTML → PDF (deps injetadas) + conferência 2 páginas/rodapé |
| `src/modules/gd/relatorio-marca.ts` | novo | marca do tenant (logo segura, sem vazar a da EcoSun) |
| `src/modules/gd/relatorio-servico.ts` | novo | orquestra: lê dados, valida (só 🟢), monta relatório |
| `src/modules/gd/demonstrativos-tela-repo.ts` | muda | `registrarRelatorio()` |
| `src/modules/dashboard/demonstrativos-views.ts` | muda | botão Gerar PDF / Prévia |
| `src/modules/dashboard/router.ts` | muda | rotas `relatorio.pdf` e `relatorio.html`; tarifa da empresa na tela |
| `tests/gd-relatorio-*.test.ts` | novos | testes de cada unidade |

---

### Task 1: Migration 132 + tarifa na config da empresa

**Files:**
- Create: `supabase/migrations/132_relatorios_gd.sql`
- Modify: `src/modules/empresa-config.ts` (interface `EmpresaConfig`, `EMPRESA_DEFAULTS`, `normalizarEmpresaRow`)
- Test: `tests/empresa-config.test.ts`

- [ ] **Step 1: Write the failing test** — acrescentar ao fim de `tests/empresa-config.test.ts`:

```ts
describe('gdTarifaRsKwh (tarifa da economia estimada do relatorio GD)', () => {
  it('padrao 0,99 quando a coluna nao existe ou vem nula', () => {
    expect(normalizarEmpresaRow({}).gdTarifaRsKwh).toBe(0.99);
    expect(normalizarEmpresaRow({ gd_tarifa_rs_kwh: null }).gdTarifaRsKwh).toBe(0.99);
  });
  it('usa o valor da empresa quando vem numero valido (numeric chega como string)', () => {
    expect(normalizarEmpresaRow({ gd_tarifa_rs_kwh: '1.05' }).gdTarifaRsKwh).toBe(1.05);
  });
  it('valor absurdo (<=0) cai no padrao', () => {
    expect(normalizarEmpresaRow({ gd_tarifa_rs_kwh: 0 }).gdTarifaRsKwh).toBe(0.99);
  });
});
```

Se `normalizarEmpresaRow` e `describe` ainda não estiverem importados no arquivo, acrescente `normalizarEmpresaRow` ao import existente de `../src/modules/empresa-config.js`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/empresa-config.test.ts`
Expected: FAIL — `gdTarifaRsKwh` é `undefined`.

- [ ] **Step 3: Implementar**

Em `src/modules/empresa-config.ts`:

1. Na interface `EmpresaConfig`, logo depois de `reguaAtencaoPct: number;`:
```ts
  /** 132: tarifa (R$/kWh) da "economia estimada" do relatório de GD =
   *  compensado × tarifa. O demonstrativo não traz R$ e a Lei 14.300 cobra
   *  parte do Fio B, por isso é "estimada" e configurável por empresa. */
  gdTarifaRsKwh: number;
```
2. Em `EMPRESA_DEFAULTS`, depois de `reguaAtencaoPct: 70,`:
```ts
  gdTarifaRsKwh: 0.99,
```
3. Em `normalizarEmpresaRow`, depois da linha `reguaAtencaoPct: n(row.regua_atencao_pct, D.reguaAtencaoPct),`:
```ts
    gdTarifaRsKwh: (() => {
      const v = Number(row.gd_tarifa_rs_kwh);
      return row.gd_tarifa_rs_kwh !== null && row.gd_tarifa_rs_kwh !== undefined && Number.isFinite(v) && v > 0 && v < 10
        ? v : D.gdTarifaRsKwh;
    })(),
```

Criar `supabase/migrations/132_relatorios_gd.sql`:

```sql
-- 132_relatorios_gd.sql
--
-- RELATÓRIO MENSAL DA USINA (Junior 26/09/2026) — fatia 2 dos demonstrativos.
-- Ver docs/superpowers/specs/2026-09-23-demonstrativos-tela-relatorio-design.md.
--
-- 1) empresa_config.gd_tarifa_rs_kwh — tarifa da "economia estimada"
--    (compensado × tarifa). Padrão 0,99. Cada empresa ajusta a sua.
-- 2) relatorios_gd_gerados — cada PDF gerado fica registrado com os números
--    que saíram nele (rastreio: "o que mandamos pro cliente em agosto?").

alter table empresa_config
  add column if not exists gd_tarifa_rs_kwh numeric(6,3) not null default 0.99;

do $$ begin
  alter table empresa_config
    add constraint empresa_config_gd_tarifa_valida check (gd_tarifa_rs_kwh > 0 and gd_tarifa_rs_kwh < 10);
exception when duplicate_object then null; end $$;

create table if not exists relatorios_gd_gerados (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default '00000000-0000-0000-0000-000000000001',
  instalacao  text not null,
  referencia  date not null,                       -- 1º dia do mês do relatório
  gerado_por  uuid,
  gerado_em   timestamptz not null default now(),
  numeros     jsonb not null default '{}'::jsonb   -- o que saiu no PDF
);

create index if not exists relatorios_gd_gerados_empresa_inst
  on relatorios_gd_gerados (company_id, instalacao, referencia desc);

-- ISOLAMENTO POR EMPRESA — mesmo padrão da 123/130/131.
ALTER TABLE public.relatorios_gd_gerados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relatorios_gd_gerados FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.relatorios_gd_gerados;
CREATE POLICY company_isolation ON public.relatorios_gd_gerados
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/empresa-config.test.ts` → PASS. Run: `npx tsc --noEmit` → sem erros (se algum teste/fixture monta `EmpresaConfig` literal completo e reclamar do campo novo, acrescente `gdTarifaRsKwh: 0.99` nele).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/132_relatorios_gd.sql src/modules/empresa-config.ts tests/empresa-config.test.ts
git commit -m "feat(gd): migration 132 (relatorios_gd_gerados + tarifa GD por empresa)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Motor puro do relatório

**Files:**
- Create: `src/modules/gd/relatorio-motor.ts`
- Test: `tests/gd-relatorio-motor.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/gd-relatorio-motor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { montarRelatorio, mesExtenso, type EntradaRelatorio } from '../src/modules/gd/relatorio-motor.js';
import type { LinhaDemonstrativo } from '../src/modules/gd/demonstrativos-tela-repo.js';

const linha = (over: Partial<LinhaDemonstrativo> = {}): LinhaDemonstrativo => ({
  id: 'D1', lead_id: 'L1', cliente_nome: 'JOAO TESTE', codigo_cliente: '2870620', instalacao: '351534',
  referencia: '2026-08-01', injetado_kwh: 222, consumo_kwh: 480, credito_utilizado_kwh: 380,
  credito_restante_kwh: 100, saldo_acumulado_kwh: 1240, proximo_expirar_kwh: 50, ciclo_expirar: '2027-03-01',
  historico: [
    { mes: '2026-07-01', consumida: 500, injetada: 200, faturada: 120, compensado: 380, credito: 90 },
    { mes: '2026-08-01', consumida: 480, injetada: 222, faturada: 100, compensado: 380, credito: 100 },
  ],
  unidades: [], inconsistencias: [], origem: 'email', origem_verificada: true,
  recebido_em: '2026-09-02T10:00:00Z', conferido_em: null, ...over,
});

const entrada = (over: Partial<EntradaRelatorio> = {}): EntradaRelatorio => ({
  linha: linha(), geracaoKwh: 612, origemGeracao: 'api',
  geracaoPorMes: { '2026-07-01': 590, '2026-08-01': 612 },
  potenciaKwp: 5.5, esperadoMesKwh: 640, tarifaRsKwh: 0.99, ...over,
});

describe('mesExtenso', () => {
  it('escreve o mes por extenso', () => {
    expect(mesExtenso('2026-08-01')).toBe('agosto de 2026');
    expect(mesExtenso('2027-03-01')).toBe('março de 2027');
  });
});

describe('montarRelatorio', () => {
  it('os 4 numeros grandes vem do demonstrativo + geracao', () => {
    const r = montarRelatorio(entrada());
    expect(r.gerouKwh).toBe(612);
    expect(r.consumiuKwh).toBe(480);
    expect(r.creditosKwh).toBe(1240);
    expect(r.economiaRs).toBe(376.2); // compensado 380 × 0,99
  });

  it('frase simples com autoconsumo = gerou - injetado', () => {
    const r = montarRelatorio(entrada());
    expect(r.autoconsumoKwh).toBe(390);
    expect(r.frase).toBe(
      'Em agosto de 2026 sua usina gerou 612 kWh. Você usou 390 kWh direto do sol e mandou 222 kWh pra rede, que viraram créditos. Neste mês, 380 kWh de créditos abateram a sua conta.',
    );
  });

  it('sem injetado nem compensado a frase fica so na geracao', () => {
    const r = montarRelatorio(entrada({ linha: linha({ injetado_kwh: null, historico: [] }) }));
    expect(r.frase).toBe('Em agosto de 2026 sua usina gerou 612 kWh.');
    expect(r.autoconsumoKwh).toBeNull();
    expect(r.economiaRs).toBeNull();
  });

  it('grafico: no maximo 13 meses, em ordem, com a geracao de cada mes quando houver', () => {
    const hist = Array.from({ length: 15 }, (_, i) => {
      const d = new Date(Date.UTC(2025, 5 + i, 1)).toISOString().slice(0, 10);
      return { mes: d, consumida: 100 + i, injetada: 50, faturada: 0, compensado: 40, credito: 0 };
    });
    const r = montarRelatorio(entrada({ linha: linha({ historico: [...hist].reverse() }), geracaoPorMes: { '2026-08-01': 612 } }));
    expect(r.meses).toHaveLength(13);
    expect(r.meses[0].mes < r.meses[12].mes).toBe(true);
    expect(r.meses[12].mes).toBe('2026-08-01');
    expect(r.meses[12].geracao).toBe(612);
    expect(r.meses[0].geracao).toBeNull();
    expect(r.meses[12].rotulo).toBe('ago/2026');
  });

  it('creditos: saldo, usados no mes e a vencer com mes', () => {
    const r = montarRelatorio(entrada());
    expect(r.creditos).toEqual({ saldoKwh: 1240, usadosNoMesKwh: 380, aVencerKwh: 50, venceEm: 'mar/2027' });
  });

  it('rateio so aparece com mais de uma unidade', () => {
    expect(montarRelatorio(entrada()).rateio).toEqual([]);
    const un = [{ codigoCliente: 'A', percentual: 60, saldo: 10 }, { codigoCliente: 'B', percentual: 40, saldo: 5 }];
    expect(montarRelatorio(entrada({ linha: linha({ unidades: un }) })).rateio).toEqual([
      { codigoCliente: 'A', percentual: 60, saldoKwh: 10 }, { codigoCliente: 'B', percentual: 40, saldoKwh: 5 },
    ]);
  });

  it('desempenho = gerou / esperado', () => {
    expect(montarRelatorio(entrada()).desempenho).toEqual({ esperadoKwh: 640, percentual: 96, potenciaKwp: 5.5 });
    expect(montarRelatorio(entrada({ esperadoMesKwh: null, potenciaKwp: null })).desempenho)
      .toEqual({ esperadoKwh: null, percentual: null, potenciaKwp: null });
  });

  it('fontes citam de onde veio cada numero e a formula da economia', () => {
    const f = montarRelatorio(entrada()).fontes.join(' | ');
    expect(f).toMatch(/demonstrativo da concessionária.*e-mail.*assinatura conferida/);
    expect(f).toMatch(/Geração: monitoramento da usina/);
    expect(f).toMatch(/R\$ 0,99\/kWh/);
    const g = montarRelatorio(entrada({ origemGeracao: 'manual', linha: linha({ origem: 'pdf_manual', origem_verificada: false }) })).fontes.join(' | ');
    expect(g).toMatch(/PDF enviado/);
    expect(g).toMatch(/informada e conferida pela equipe/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gd-relatorio-motor.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar** — `src/modules/gd/relatorio-motor.ts`:

```ts
// Motor PURO do relatório mensal da usina (fatia 2 dos demonstrativos).
// Recebe o demonstrativo do mês (o que a concessionária mediu) + a geração
// (monitoramento ou informada e conferida) e devolve tudo o que o PDF mostra.
// Sem banco, sem HTML: o mesmo motor serve a tela, o PDF e, depois, o
// programa Windows do Thiago. Ver
// docs/superpowers/specs/2026-09-23-demonstrativos-tela-relatorio-design.md.

import type { LinhaDemonstrativo } from './demonstrativos-tela-repo.js';
import { mesCurto } from './demonstrativo-cruzamento.js';

export interface EntradaRelatorio {
  /** Linha do mês do relatório (já validada 🟢 por quem chama). */
  linha: LinhaDemonstrativo;
  geracaoKwh: number;
  origemGeracao: 'manual' | 'api';
  /** Geração por mês (YYYY-MM-01) pro gráfico; mês sem dado = null/ausente. */
  geracaoPorMes: Record<string, number | null>;
  potenciaKwp: number | null;
  esperadoMesKwh: number | null;
  tarifaRsKwh: number;
}

export interface MesGrafico {
  mes: string;
  rotulo: string;
  geracao: number | null;
  consumo: number;
  injetado: number;
  compensado: number;
}

export interface RelatorioGd {
  cliente: string;
  instalacao: string;
  referencia: string;
  mesExtenso: string;
  gerouKwh: number;
  consumiuKwh: number | null;
  economiaRs: number | null;
  creditosKwh: number | null;
  autoconsumoKwh: number | null;
  injetadoKwh: number | null;
  compensadoKwh: number | null;
  frase: string;
  meses: MesGrafico[];
  creditos: { saldoKwh: number | null; usadosNoMesKwh: number | null; aVencerKwh: number | null; venceEm: string | null };
  rateio: Array<{ codigoCliente: string; percentual: number; saldoKwh: number }>;
  desempenho: { esperadoKwh: number | null; percentual: number | null; potenciaKwp: number | null };
  fontes: string[];
  tarifaRsKwh: number;
}

const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function mesExtenso(iso: string): string {
  const [a, m] = iso.split('-').map(Number);
  return `${MESES_LONGOS[m - 1]} de ${a}`;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const r2 = (v: number) => Math.round(v * 100) / 100;
const numOuNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const ORIGEM_DEMONSTRATIVO: Record<string, string> = {
  email: 'e-mail da concessionária',
  pdf_manual: 'PDF enviado pela equipe',
  digitado: 'digitado pela equipe a partir do demonstrativo',
};

export function montarRelatorio(e: EntradaRelatorio): RelatorioGd {
  const l = e.linha;
  const doMes = l.historico.find((h) => h.mes === l.referencia);
  const compensadoKwh = doMes ? numOuNull(doMes.compensado) : null;
  const injetadoKwh = l.injetado_kwh;
  const autoconsumoKwh = injetadoKwh === null ? null : r2(Math.max(0, e.geracaoKwh - injetadoKwh));
  const economiaRs = compensadoKwh === null ? null : r2(compensadoKwh * e.tarifaRsKwh);
  const mesTxt = mesExtenso(l.referencia);

  let frase = `Em ${mesTxt} sua usina gerou ${fmt(e.geracaoKwh)} kWh.`;
  if (injetadoKwh !== null && autoconsumoKwh !== null) {
    frase += ` Você usou ${fmt(autoconsumoKwh)} kWh direto do sol e mandou ${fmt(injetadoKwh)} kWh pra rede, que viraram créditos.`;
  }
  if (compensadoKwh !== null && compensadoKwh > 0) {
    frase += ` Neste mês, ${fmt(compensadoKwh)} kWh de créditos abateram a sua conta.`;
  }

  const meses: MesGrafico[] = [...l.historico]
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .slice(-13)
    .map((h) => ({
      mes: h.mes,
      rotulo: mesCurto(h.mes),
      geracao: numOuNull(e.geracaoPorMes[h.mes]),
      consumo: Number(h.consumida) || 0,
      injetado: Number(h.injetada) || 0,
      compensado: Number(h.compensado) || 0,
    }));

  const rateio = l.unidades.length > 1
    ? l.unidades.map((u) => ({ codigoCliente: u.codigoCliente, percentual: u.percentual, saldoKwh: u.saldo }))
    : [];

  const percentual = e.esperadoMesKwh && e.esperadoMesKwh > 0
    ? Math.round((e.geracaoKwh / e.esperadoMesKwh) * 100) : null;

  const fontes = [
    `Consumo, injetado e créditos: demonstrativo da concessionária (${ORIGEM_DEMONSTRATIVO[l.origem] ?? l.origem}${l.origem_verificada ? ', assinatura conferida' : ''}).`,
    e.origemGeracao === 'api'
      ? 'Geração: monitoramento da usina (soma dos dias do mês).'
      : 'Geração: informada e conferida pela equipe.',
    `Economia estimada = créditos compensados × R$ ${e.tarifaRsKwh.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/kWh (tarifa média; a Lei 14.300 cobra parte do Fio B, por isso é estimada).`,
  ];

  return {
    cliente: l.cliente_nome,
    instalacao: l.instalacao,
    referencia: l.referencia,
    mesExtenso: mesTxt,
    gerouKwh: e.geracaoKwh,
    consumiuKwh: l.consumo_kwh,
    economiaRs,
    creditosKwh: l.saldo_acumulado_kwh,
    autoconsumoKwh,
    injetadoKwh,
    compensadoKwh,
    frase,
    meses,
    creditos: {
      saldoKwh: l.saldo_acumulado_kwh,
      usadosNoMesKwh: l.credito_utilizado_kwh,
      aVencerKwh: l.proximo_expirar_kwh,
      venceEm: l.ciclo_expirar ? mesCurto(l.ciclo_expirar) : null,
    },
    rateio,
    desempenho: { esperadoKwh: e.esperadoMesKwh, percentual, potenciaKwp: e.potenciaKwp },
    fontes,
    tarifaRsKwh: e.tarifaRsKwh,
  };
}
```

Nota: `mesCurto('2026-08-01')` devolve `ago/2026` (conferido em `demonstrativo-cruzamento.ts`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/gd-relatorio-motor.test.ts` → PASS. Se a frase falhar só por espaço/pontuação, ajuste o CÓDIGO para bater com o teste (o teste é a especificação).

- [ ] **Step 5: Commit**

```bash
git add src/modules/gd/relatorio-motor.ts tests/gd-relatorio-motor.test.ts
git commit -m "feat(gd): motor puro do relatorio mensal da usina

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Marca do tenant no relatório (sem vazar a da EcoSun)

**Files:**
- Create: `src/modules/gd/relatorio-marca.ts`
- Test: `tests/gd-relatorio-marca.test.ts`

Contexto: `obterLogoBase64` (`src/modules/proposal/assets/logo-base64.ts`) lê `empresa()` do contexto (AsyncLocalStorage) e, em qualquer falha, devolve a logo da EcoSun — num tenant isso é vazamento de marca. O painel (`src/modules/dashboard/marca-empresa.ts`) aceita logo como URL http(s). Aqui: URL → usa direto; caminho de bucket → baixa via função injetada; sem logo ou falha num tenant → `null` (o HTML escreve o nome da empresa).

- [ ] **Step 1: Write the failing test** — `tests/gd-relatorio-marca.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { marcaDoRelatorio } from '../src/modules/gd/relatorio-marca.js';
import { EMPRESA_DEFAULTS } from '../src/modules/empresa-config.js';
import { LOGO_ECOSUNPOWER_BRANCO_BASE64 } from '../src/modules/proposal/assets/logo-base64.js';

const ecosun = { ...EMPRESA_DEFAULTS };
const tenant = { ...EMPRESA_DEFAULTS, companyId: 'T1', nomeFantasia: 'Conquista Solar', email: 'c@x.com',
  siteUrl: 'https://conquista.com', telefoneAtendente: '5571999990000', rtNome: 'JIMENA X', rtTitulo: 'Responsável Técnico', rtRegistro: '123', logoStoragePath: null, corMarca: '#112233' };

describe('marcaDoRelatorio', () => {
  it('EcoSun sem logo configurada usa a logo da casa', async () => {
    const m = await marcaDoRelatorio(ecosun as any, { baixarLogo: vi.fn() });
    expect(m.logoSrc).toBe(LOGO_ECOSUNPOWER_BRANCO_BASE64);
    expect(m.nomeFantasia).toBe('EcoSunPower');
  });
  it('tenant sem logo NAO herda a logo da EcoSun', async () => {
    const m = await marcaDoRelatorio(tenant as any, { baixarLogo: vi.fn() });
    expect(m.logoSrc).toBeNull();
    expect(m.nomeFantasia).toBe('Conquista Solar');
    expect(m.cor).toBe('#112233');
  });
  it('logo em URL http(s) vai direto; javascript: e recusado', async () => {
    expect((await marcaDoRelatorio({ ...tenant, logoStoragePath: 'https://cdn.x/logo.png' } as any, { baixarLogo: vi.fn() })).logoSrc)
      .toBe('https://cdn.x/logo.png');
    const baixar = vi.fn().mockResolvedValue(null);
    expect((await marcaDoRelatorio({ ...tenant, logoStoragePath: 'javascript:alert(1)' } as any, { baixarLogo: baixar })).logoSrc)
      .toBeNull();
  });
  it('caminho de bucket: baixa; falha no tenant vira null (nunca a logo da EcoSun)', async () => {
    const ok = vi.fn().mockResolvedValue('data:image/png;base64,AAA');
    expect((await marcaDoRelatorio({ ...tenant, logoStoragePath: 't1/logo.png' } as any, { baixarLogo: ok })).logoSrc)
      .toBe('data:image/png;base64,AAA');
    expect(ok).toHaveBeenCalledWith('t1/logo.png');
    const falha = vi.fn().mockResolvedValue(LOGO_ECOSUNPOWER_BRANCO_BASE64);
    expect((await marcaDoRelatorio({ ...tenant, logoStoragePath: 't1/logo.png' } as any, { baixarLogo: falha })).logoSrc)
      .toBeNull();
  });
  it('contato e RT do tenant', async () => {
    const m = await marcaDoRelatorio(tenant as any, { baixarLogo: vi.fn() });
    expect(m.telefone).toBe('(71) 99999-0000');
    expect(m.rodapeRt).toBe('JIMENA X — Responsável Técnico — registro 123');
  });
});
```

(Se `EMPRESA_DEFAULTS` não for exportado de `empresa-config.ts`, exporte-o — `export const EMPRESA_DEFAULTS` — sem mudar mais nada.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gd-relatorio-marca.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar** — `src/modules/gd/relatorio-marca.ts`:

```ts
// Marca da empresa no relatório de GD. Cada tenant sai com a SUA marca: logo
// da EcoSun só aparece no PDF da própria EcoSun (vazamento de marca foi o
// problema de set/2026 — ver dashboard/marca-empresa.ts).

import type { EmpresaConfig } from '../empresa-config.js';
import { ehEcosun } from '../empresa-config.js';
import { LOGO_ECOSUNPOWER_BRANCO_BASE64 } from '../proposal/assets/logo-base64.js';

export interface MarcaRelatorio {
  nomeFantasia: string;
  /** data: URI ou URL http(s); null = escrever o nome da empresa. */
  logoSrc: string | null;
  cor: string;
  telefone: string | null;
  email: string;
  site: string;
  rodapeRt: string;
}

const HEX = /^#[0-9a-f]{6}$/i;
const COR_PADRAO = '#16304F';

export function telefoneBonito(t: string | null): string | null {
  if (!t) return null;
  const d = t.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

export async function marcaDoRelatorio(
  e: EmpresaConfig,
  deps: { baixarLogo: (caminho: string) => Promise<string | null> },
): Promise<MarcaRelatorio> {
  const casa = ehEcosun(e);
  const caminho = (e.logoStoragePath ?? '').trim();
  let logoSrc: string | null = null;
  if (/^https?:\/\//i.test(caminho)) {
    logoSrc = caminho;
  } else if (caminho && !/^[a-z]+:/i.test(caminho)) {
    const baixada = await deps.baixarLogo(caminho);
    // obterLogoBase64 devolve a logo da EcoSun quando falha: num tenant isso é vazamento.
    logoSrc = baixada && (casa || baixada !== LOGO_ECOSUNPOWER_BRANCO_BASE64) ? baixada : null;
  } else if (!caminho && casa) {
    logoSrc = LOGO_ECOSUNPOWER_BRANCO_BASE64;
  }
  const cor = HEX.test((e.corMarca ?? '').trim()) ? (e.corMarca as string).trim() : COR_PADRAO;
  const rt = [e.rtNome, e.rtTitulo, e.rtRegistro ? `registro ${e.rtRegistro}` : null].filter(Boolean).join(' — ');
  return {
    nomeFantasia: e.nomeFantasia,
    logoSrc,
    cor,
    telefone: telefoneBonito(e.telefoneAtendente),
    email: e.email,
    site: e.siteUrl.replace(/^https?:\/\//, ''),
    rodapeRt: rt,
  };
}
```

Confira que `ehEcosun(e)` aceita o objeto por parâmetro (assinatura `ehEcosun(e: Readonly<EmpresaConfig> = empresa())` — sim).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/gd-relatorio-marca.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/gd/relatorio-marca.ts tests/gd-relatorio-marca.test.ts src/modules/empresa-config.ts
git commit -m "feat(gd): marca do tenant no relatorio sem vazar a logo da EcoSun

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: HTML A4 de 2 páginas

**Files:**
- Create: `src/modules/gd/relatorio-html.ts`
- Test: `tests/gd-relatorio-html.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/gd-relatorio-html.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderRelatorioHtml, RODAPE_CONFERENCIA } from '../src/modules/gd/relatorio-html.js';
import type { RelatorioGd } from '../src/modules/gd/relatorio-motor.js';
import type { MarcaRelatorio } from '../src/modules/gd/relatorio-marca.js';

const rel = (over: Partial<RelatorioGd> = {}): RelatorioGd => ({
  cliente: 'JOAO <script>x</script>', instalacao: '351534', referencia: '2026-08-01', mesExtenso: 'agosto de 2026',
  gerouKwh: 612, consumiuKwh: 480, economiaRs: 376.2, creditosKwh: 1240, autoconsumoKwh: 390, injetadoKwh: 222,
  compensadoKwh: 380, frase: 'Em agosto de 2026 sua usina gerou 612 kWh.',
  meses: [{ mes: '2026-08-01', rotulo: 'ago/2026', geracao: 612, consumo: 480, injetado: 222, compensado: 380 }],
  creditos: { saldoKwh: 1240, usadosNoMesKwh: 380, aVencerKwh: 50, venceEm: 'mar/2027' },
  rateio: [], desempenho: { esperadoKwh: 640, percentual: 96, potenciaKwp: 5.5 },
  fontes: ['Geração: monitoramento da usina (soma dos dias do mês).'], tarifaRsKwh: 0.99, ...over,
});
const marca: MarcaRelatorio = { nomeFantasia: 'Conquista Solar', logoSrc: null, cor: '#112233', telefone: '(71) 99999-0000',
  email: 'c@x.com', site: 'conquista.com', rodapeRt: 'JIMENA X — Responsável Técnico' };

describe('renderRelatorioHtml', () => {
  it('duas paginas A4, escapa o nome do cliente', () => {
    const h = renderRelatorioHtml(rel(), marca);
    expect(h.match(/class="pagina"/g)).toHaveLength(2);
    expect(h).toContain('JOAO &lt;script&gt;x&lt;/script&gt;');
    expect(h).not.toContain('<script>x</script>');
  });
  it('4 numeros grandes, frase e grafico com os 13 meses', () => {
    const h = renderRelatorioHtml(rel(), marca);
    expect(h).toContain('612');
    expect(h).toContain('R$ 376,20');
    expect(h).toContain('1.240');
    expect(h).toContain('Em agosto de 2026 sua usina gerou 612 kWh.');
    expect(h).toContain('"ago/2026"');
    expect(h).toContain('chart.umd.min.js');
    expect(h).toContain('animation: false');
  });
  it('sem logo escreve o nome da empresa; nunca menciona EcoSun num tenant', () => {
    const h = renderRelatorioHtml(rel(), marca);
    expect(h).toContain('Conquista Solar');
    expect(h).not.toMatch(/ecosun/i);
  });
  it('creditos a vencer em destaque; rateio so com mais de uma unidade', () => {
    expect(renderRelatorioHtml(rel(), marca)).toMatch(/vencem em <b>mar\/2027<\/b>/);
    expect(renderRelatorioHtml(rel(), marca)).not.toContain('Rateio dos créditos');
    const h = renderRelatorioHtml(rel({ rateio: [{ codigoCliente: 'A', percentual: 60, saldoKwh: 10 }, { codigoCliente: 'B', percentual: 40, saldoKwh: 5 }] }), marca);
    expect(h).toContain('Rateio dos créditos');
    expect(h).toContain('60%');
  });
  it('rodape com fontes, RT e a marca de conferencia', () => {
    const h = renderRelatorioHtml(rel(), marca);
    expect(h).toContain('JIMENA X — Responsável Técnico');
    expect(h).toContain('Geração: monitoramento da usina');
    expect(h).toContain(RODAPE_CONFERENCIA);
    expect(h).not.toMatch(/engenheiro/i);
  });
  it('glossario curto', () => {
    const h = renderRelatorioHtml(rel(), marca);
    for (const t of ['Injetado', 'Compensado', 'Crédito', 'Rateio']) expect(h).toContain(t);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gd-relatorio-html.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar** — `src/modules/gd/relatorio-html.ts`:

```ts
// HTML A4 (2 páginas) do relatório mensal da usina. Letra grande, cores da
// marca do tenant, gráfico Chart.js (sem animação, pro Puppeteer capturar
// pronto). Cada página tem altura FIXA de A4 e o gerador de PDF confere que
// saíram exatamente 2 páginas.

import type { RelatorioGd } from './relatorio-motor.js';
import type { MarcaRelatorio } from './relatorio-marca.js';

/** Texto fixo do rodapé que o gerador de PDF procura pra saber que nada cortou. */
export const RODAPE_CONFERENCIA = 'Relatório gerado a partir do demonstrativo da concessionária';

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const kwh = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kWh`);
const brl = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' '));
/** JSON dentro de <script>: impede fechar a tag. */
const jsonSeguro = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

export function renderRelatorioHtml(r: RelatorioGd, m: MarcaRelatorio): string {
  const cab = `
<header class="cab">
  ${m.logoSrc ? `<img class="logo" src="${esc(m.logoSrc)}" alt="${esc(m.nomeFantasia)}">` : `<div class="nome-empresa">${esc(m.nomeFantasia)}</div>`}
  <div class="cab-dir"><div class="titulo">Relatório da sua usina solar</div>
  <div class="sub">${esc(r.cliente)} · UC ${esc(r.instalacao)} · ${esc(r.mesExtenso)}</div></div>
</header>`;
  const card = (icone: string, rot: string, valor: string) =>
    `<div class="card"><div class="rot">${icone} ${rot}</div><div class="valor">${valor}</div></div>`;
  const rodape = (n: number) => `
<footer class="rod">
  <div>${esc(m.nomeFantasia)}${m.telefone ? ` · ${esc(m.telefone)}` : ''} · ${esc(m.email)} · ${esc(m.site)}</div>
  <div>${esc(m.rodapeRt)}</div>
  <div class="conf">${RODAPE_CONFERENCIA} · página ${n} de 2</div>
</footer>`;

  const rateio = r.rateio.length > 1 ? `
<section class="bloco"><h2>Rateio dos créditos</h2>
<table><tr><th>Unidade (código do cliente)</th><th>Parte</th><th>Saldo</th></tr>
${r.rateio.map((u) => `<tr><td>${esc(u.codigoCliente)}</td><td>${u.percentual}%</td><td>${kwh(u.saldoKwh)}</td></tr>`).join('')}
</table></section>` : '';

  const venc = r.creditos.aVencerKwh && r.creditos.aVencerKwh > 0 && r.creditos.venceEm
    ? `<p class="alerta">⏰ ${kwh(r.creditos.aVencerKwh)} de créditos vencem em <b>${esc(r.creditos.venceEm)}</b>. Use antes disso.</p>` : '';

  const desempenho = r.desempenho.percentual !== null ? `
<section class="bloco"><h2>Desempenho da usina</h2>
<p class="grande">Gerou <b>${kwh(r.gerouKwh)}</b> de <b>${kwh(r.desempenho.esperadoKwh)}</b> esperados
(<b>${r.desempenho.percentual}%</b>)${r.desempenho.potenciaKwp ? ` para uma usina de ${r.desempenho.potenciaKwp.toLocaleString('pt-BR')} kWp` : ''}.</p>
<p class="nota">O esperado considera o tamanho da usina, a média de sol da região e os dias do mês. Meses com mais chuva ficam abaixo; é normal variar.</p>
</section>` : '';

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório ${esc(r.mesExtenso)}</title>
<style>
@page{size:A4;margin:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:15px}
.pagina{width:210mm;height:297mm;padding:14mm 14mm 10mm;position:relative;overflow:hidden;page-break-after:always}
.pagina:last-child{page-break-after:auto}
.cab{display:flex;align-items:center;gap:16px;border-bottom:4px solid ${esc(m.cor)};padding-bottom:10px;margin-bottom:12px}
.logo{max-height:70px;max-width:230px}
.nome-empresa{font-size:26px;font-weight:bold;color:${esc(m.cor)}}
.titulo{font-size:22px;font-weight:bold;color:${esc(m.cor)}}
.sub{font-size:15px;color:#4b5563}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0}
.card{border:1px solid #e5e7eb;border-left:6px solid ${esc(m.cor)};border-radius:8px;padding:10px 12px}
.rot{font-size:14px;color:#6b7280}.valor{font-size:28px;font-weight:bold}
.frase{font-size:17px;line-height:1.5;background:#f8fafc;border-radius:8px;padding:10px 14px;margin:8px 0}
h2{font-size:18px;color:${esc(m.cor)};margin:10px 0 6px}
.bloco{margin-bottom:8px}
.grafico{height:300px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #e5e7eb;padding:5px 8px;text-align:left}th{background:#f1f5f9}
.alerta{font-size:16px;background:#fef3c7;border-left:6px solid #f59e0b;padding:8px 12px;border-radius:6px}
.grande{font-size:16px}.nota{font-size:13px;color:#6b7280}
dl{margin:0;font-size:13.5px}dt{font-weight:bold;margin-top:4px}dd{margin:0 0 2px 0}
.fontes{font-size:11.5px;color:#6b7280;margin-top:6px}
.rod{position:absolute;left:14mm;right:14mm;bottom:8mm;border-top:1px solid #e5e7eb;padding-top:5px;font-size:11px;color:#6b7280}
.conf{margin-top:2px}
</style></head><body>

<div class="pagina">
${cab}
<div class="cards">
  ${card('☀', 'Sua usina gerou', kwh(r.gerouKwh))}
  ${card('🏠', 'Consumo medido pela concessionária', kwh(r.consumiuKwh))}
  ${card('💰', 'Economia estimada no mês', brl(r.economiaRs))}
  ${card('🔋', 'Seus créditos guardados', kwh(r.creditosKwh))}
</div>
<p class="frase">${esc(r.frase)}</p>
<h2>Últimos meses</h2>
<div class="grafico"><canvas id="g13"></canvas></div>
${rodape(1)}
</div>

<div class="pagina">
${cab}
<section class="bloco"><h2>Seus créditos</h2>
<table>
<tr><th>Saldo de créditos</th><td>${kwh(r.creditos.saldoKwh)}</td></tr>
<tr><th>Usados neste mês</th><td>${kwh(r.creditos.usadosNoMesKwh)}</td></tr>
</table>
${venc}
</section>
${rateio}
${desempenho}
<section class="bloco"><h2>Para entender</h2><dl>
<dt>Injetado</dt><dd>Energia que a usina mandou para a rede quando gerou mais do que a casa usava naquele momento.</dd>
<dt>Compensado</dt><dd>Créditos usados para abater o consumo da conta no mês.</dd>
<dt>Crédito</dt><dd>Energia injetada que sobrou e fica guardada para os próximos meses. Vale por 60 meses.</dd>
<dt>Rateio</dt><dd>Divisão dos créditos entre as unidades cadastradas, em porcentagem.</dd>
</dl></section>
<div class="fontes"><b>De onde vêm os números:</b><br>${r.fontes.map(esc).join('<br>')}</div>
${rodape(2)}
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script>
(function () {
  var meses = ${jsonSeguro(r.meses)};
  new Chart(document.getElementById('g13'), {
    type: 'bar',
    data: {
      labels: meses.map(function (m) { return m.rotulo; }),
      datasets: [
        { label: 'Geração (kWh)', data: meses.map(function (m) { return m.geracao; }), backgroundColor: '#f59e0b' },
        { label: 'Consumo (kWh)', data: meses.map(function (m) { return m.consumo; }), backgroundColor: '#64748b' },
        { label: 'Injetado (kWh)', data: meses.map(function (m) { return m.injetado; }), backgroundColor: '#22c55e' }
      ]
    },
    options: { animation: false, responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { size: 13 } } } },
      scales: { x: { ticks: { font: { size: 12 } } }, y: { beginAtZero: true, ticks: { font: { size: 12 } } } } }
  });
})();
</script>
</body></html>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/gd-relatorio-html.test.ts` → PASS. (O teste `animation: false` procura o texto literal — mantenha `animation: false,` com espaço depois dos dois pontos.)

- [ ] **Step 5: Commit**

```bash
git add src/modules/gd/relatorio-html.ts tests/gd-relatorio-html.test.ts
git commit -m "feat(gd): HTML A4 de 2 paginas do relatorio mensal

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: PDF com conferência (2 páginas + rodapé)

**Files:**
- Create: `src/modules/gd/relatorio-pdf.ts`
- Test: `tests/gd-relatorio-pdf.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/gd-relatorio-pdf.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { gerarRelatorioPdf } from '../src/modules/gd/relatorio-pdf.js';
import { RODAPE_CONFERENCIA } from '../src/modules/gd/relatorio-html.js';

const pdf = Buffer.from('%PDF-fake');

describe('gerarRelatorioPdf', () => {
  it('devolve o PDF quando sai com 2 paginas e o rodape', async () => {
    const htmlToPdf = vi.fn().mockResolvedValue(pdf);
    const ler = vi.fn().mockResolvedValue({ paginas: 2, texto: `... ${RODAPE_CONFERENCIA} · página 2 de 2` });
    expect(await gerarRelatorioPdf('<html>', { htmlToPdf, lerPdf: ler })).toBe(pdf);
    expect(htmlToPdf).toHaveBeenCalledWith('<html>', expect.objectContaining({ format: 'A4', marginMm: 0, printBackground: true }));
  });
  it('recusa PDF com 3 paginas (algo vazou) — nunca devolve pela metade', async () => {
    const ler = vi.fn().mockResolvedValue({ paginas: 3, texto: RODAPE_CONFERENCIA });
    await expect(gerarRelatorioPdf('<html>', { htmlToPdf: vi.fn().mockResolvedValue(pdf), lerPdf: ler }))
      .rejects.toThrow(/3 páginas/);
  });
  it('recusa PDF sem o rodape', async () => {
    const ler = vi.fn().mockResolvedValue({ paginas: 2, texto: 'sem rodape' });
    await expect(gerarRelatorioPdf('<html>', { htmlToPdf: vi.fn().mockResolvedValue(pdf), lerPdf: ler }))
      .rejects.toThrow(/rodapé/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gd-relatorio-pdf.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — `src/modules/gd/relatorio-pdf.ts`:

```ts
// HTML do relatório → PDF, CONFERIDO antes de sair: exatamente 2 páginas e o
// rodapé presente na última (se algo vazou pra 3ª página ou cortou, recusa —
// nunca entrega PDF pela metade). Dependências injetadas pra testar sem Chrome.

import type { PdfOptions } from '../proposal/pdf-generator.js';
import { RODAPE_CONFERENCIA } from './relatorio-html.js';

export interface DepsRelatorioPdf {
  htmlToPdf: (html: string, o?: PdfOptions) => Promise<Buffer>;
  lerPdf: (pdf: Buffer) => Promise<{ paginas: number; texto: string }>;
}

export async function gerarRelatorioPdf(html: string, deps: DepsRelatorioPdf): Promise<Buffer> {
  const pdf = await deps.htmlToPdf(html, { format: 'A4', marginMm: 0, printBackground: true, waitForChartMs: 800 });
  const { paginas, texto } = await deps.lerPdf(pdf);
  if (paginas !== 2) throw new Error(`o relatório saiu com ${paginas} páginas (esperado 2) — algum bloco não coube`);
  if (!texto.replace(/\s+/g, ' ').includes(RODAPE_CONFERENCIA)) throw new Error('o rodapé do relatório não apareceu no PDF');
  return pdf;
}

/** Leitura real com unpdf (mesma lib do leitor de demonstrativos). */
export async function lerPdfUnpdf(pdf: Buffer): Promise<{ paginas: number; texto: string }> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const { totalPages, text } = await extractText(doc, { mergePages: true });
  return { paginas: totalPages, texto: text };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/gd-relatorio-pdf.test.ts` → PASS. Run `npx tsc --noEmit` (confere que `PdfOptions` é exportado de `pdf-generator.ts` — é, linha 33).

- [ ] **Step 5: Commit**

```bash
git add src/modules/gd/relatorio-pdf.ts tests/gd-relatorio-pdf.test.ts
git commit -m "feat(gd): PDF do relatorio conferido (2 paginas + rodape)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Serviço que prepara o relatório + registro do PDF gerado

**Files:**
- Create: `src/modules/gd/relatorio-servico.ts`
- Modify: `src/modules/gd/demonstrativos-tela-repo.ts` (novo método `registrarRelatorio`)
- Test: `tests/gd-relatorio-servico.test.ts`, `tests/gd-demonstrativos-tela-repo.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/gd-relatorio-servico.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { prepararRelatorio, type DepsServicoRelatorio } from '../src/modules/gd/relatorio-servico.js';
import type { LinhaDemonstrativo } from '../src/modules/gd/demonstrativos-tela-repo.js';

const linha = (over: Partial<LinhaDemonstrativo> = {}): LinhaDemonstrativo => ({
  id: 'D1', lead_id: 'L1', cliente_nome: 'JOAO', codigo_cliente: '1', instalacao: '351534', referencia: '2026-08-01',
  injetado_kwh: 222, consumo_kwh: 480, credito_utilizado_kwh: 380, credito_restante_kwh: 0, saldo_acumulado_kwh: 1240,
  proximo_expirar_kwh: null, ciclo_expirar: null,
  historico: [
    { mes: '2026-07-01', consumida: 500, injetada: 200, faturada: 0, compensado: 380, credito: 0 },
    { mes: '2026-08-01', consumida: 480, injetada: 222, faturada: 0, compensado: 380, credito: 0 },
  ],
  unidades: [], inconsistencias: [], origem: 'email', origem_verificada: true, recebido_em: '', conferido_em: null, ...over,
});

function deps(over: Partial<DepsServicoRelatorio> = {}): DepsServicoRelatorio {
  return {
    historicoDaInstalacao: vi.fn().mockResolvedValue([linha()]),
    geracoesManuais: vi.fn().mockResolvedValue(new Map()),
    sistemaDoLead: vi.fn().mockResolvedValue({ potenciaKwp: 5, uf: 'DF' }),
    geracaoApiDoMes: vi.fn().mockImplementation(async (_l: string, ref: string) => (ref === '2026-08-01' ? 600 : 580)),
    tarifaRsKwh: 0.99,
    ...over,
  };
}

describe('prepararRelatorio', () => {
  it('mes pronto monta o relatorio com a geracao da API e a dos meses anteriores', async () => {
    const r = await prepararRelatorio('351534', '2026-08-01', deps());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.relatorio.gerouKwh).toBe(600);
    expect(r.relatorio.meses.map((m) => m.geracao)).toEqual([580, 600]);
    expect(r.relatorio.economiaRs).toBe(376.2);
  });
  it('geracao digitada tem prioridade sobre a API no grafico e no mes', async () => {
    const d = deps({
      geracoesManuais: vi.fn().mockResolvedValue(new Map([['351534|2026-08-01', { kwh: 610, origem: 'digitado', conferido_em: '' }]])),
    });
    const r = await prepararRelatorio('351534', '2026-08-01', d);
    expect(r.ok && r.relatorio.gerouKwh).toBe(610);
    expect(r.ok && r.relatorio.meses[1].geracao).toBe(610);
  });
  it('mes que nao existe → 404', async () => {
    const r = await prepararRelatorio('351534', '2026-05-01', deps());
    expect(r).toEqual({ ok: false, status: 404, motivo: 'não há demonstrativo desse mês para essa UC' });
  });
  it('mes que nao esta 🟢 → 409 com o motivo (so gera com tudo verde)', async () => {
    const r = await prepararRelatorio('351534', '2026-08-01', deps({ geracaoApiDoMes: vi.fn().mockResolvedValue(null) }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(409);
    expect(r.motivo).toMatch(/falta a geração/);
  });
  it('UC sem cliente → 409', async () => {
    const r = await prepararRelatorio('351534', '2026-08-01', deps({ historicoDaInstalacao: vi.fn().mockResolvedValue([linha({ lead_id: null })]) }));
    expect(r.ok).toBe(false);
  });
});
```

Acrescentar em `tests/gd-demonstrativos-tela-repo.test.ts` (dentro do `describe('criarRepoTelaGd'`):

```ts
  it('registrarRelatorio grava com a empresa da sessao e os numeros', async () => {
    const { db, chamadas } = fakeDb({ relatorios_gd_gerados: [{ data: null, error: null }] });
    await criarRepoTelaGd(db, 'E1').registrarRelatorio({ instalacao: '351534', referencia: '2026-08-01', geradoPor: 'U1', numeros: { gerouKwh: 612 } });
    const ins = chamadas.find((c) => c.tabela === 'relatorios_gd_gerados')!.ops.find((o) => o[0] === 'insert')!;
    expect(ins[1][0]).toEqual({ company_id: 'E1', instalacao: '351534', referencia: '2026-08-01', gerado_por: 'U1', numeros: { gerouKwh: 612 } });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/gd-relatorio-servico.test.ts tests/gd-demonstrativos-tela-repo.test.ts` → FAIL (módulo e método não existem).

- [ ] **Step 3: Implementar**

`src/modules/gd/relatorio-servico.ts`:

```ts
// Junta os dados do relatório de UMA UC e UM mês, com as mesmas travas da tela
// (só gera com o mês 🟢). Dependências injetadas: a rota passa o repo da tela,
// a geração da API e a tarifa da empresa; o teste passa fakes.

import type { LinhaDemonstrativo, GeracaoManual } from './demonstrativos-tela-repo.js';
import { validarMes } from './gd-validacao.js';
import { montarRelatorio, type RelatorioGd } from './relatorio-motor.js';

export interface DepsServicoRelatorio {
  historicoDaInstalacao: (instalacao: string) => Promise<LinhaDemonstrativo[]>;
  geracoesManuais: (instalacoes: string[], referencia?: string) => Promise<Map<string, GeracaoManual>>;
  sistemaDoLead: (leadId: string) => Promise<{ potenciaKwp: number | null; uf: string | null }>;
  geracaoApiDoMes: (leadId: string, referencia: string) => Promise<number | null>;
  tarifaRsKwh: number;
}

export type ResultadoPreparo =
  | { ok: true; relatorio: RelatorioGd }
  | { ok: false; status: 404 | 409; motivo: string };

export async function prepararRelatorio(instalacao: string, referencia: string, d: DepsServicoRelatorio): Promise<ResultadoPreparo> {
  const hist = await d.historicoDaInstalacao(instalacao);
  const l = hist.find((h) => h.referencia === referencia);
  if (!l) return { ok: false, status: 404, motivo: 'não há demonstrativo desse mês para essa UC' };

  const manuais = await d.geracoesManuais([instalacao]);
  const manualDoMes = manuais.get(`${instalacao}|${referencia}`)?.kwh ?? null;
  const sis = l.lead_id ? await d.sistemaDoLead(l.lead_id) : { potenciaKwp: null, uf: null };
  const apiDoMes = l.lead_id ? await d.geracaoApiDoMes(l.lead_id, referencia) : null;
  const v = validarMes({
    leadId: l.lead_id, referencia, injetadoKwh: l.injetado_kwh, inconsistenciasLeitura: l.inconsistencias,
    geracaoManualKwh: manualDoMes, geracaoApiKwh: apiDoMes, potenciaKwp: sis.potenciaKwp, uf: sis.uf,
  });
  if (v.estado !== 'pronto' || v.geracaoKwh === null || v.origemGeracao === null) {
    const motivo = [...v.bloqueios, ...v.pendencias][0] ?? 'o mês ainda não está pronto';
    return { ok: false, status: 409, motivo };
  }

  const geracaoPorMes: Record<string, number | null> = {};
  const mesesGrafico = [...l.historico].map((h) => h.mes).sort().slice(-13);
  for (const mes of mesesGrafico) {
    if (mes === referencia) { geracaoPorMes[mes] = v.geracaoKwh; continue; }
    const manual = manuais.get(`${instalacao}|${mes}`)?.kwh;
    geracaoPorMes[mes] = manual ?? (l.lead_id ? await d.geracaoApiDoMes(l.lead_id, mes) : null);
  }

  return {
    ok: true,
    relatorio: montarRelatorio({
      linha: l, geracaoKwh: v.geracaoKwh, origemGeracao: v.origemGeracao, geracaoPorMes,
      potenciaKwp: sis.potenciaKwp, esperadoMesKwh: v.esperadoMesKwh, tarifaRsKwh: d.tarifaRsKwh,
    }),
  };
}
```

Em `src/modules/gd/demonstrativos-tela-repo.ts`, dentro do objeto devolvido por `criarRepoTelaGd`, depois de `gravarManual`:

```ts
    /** Rastreio: cada PDF gerado fica registrado com os números que saíram nele. */
    async registrarRelatorio(p: { instalacao: string; referencia: string; geradoPor: string; numeros: Record<string, unknown> }): Promise<void> {
      const { error } = await db.from('relatorios_gd_gerados').insert({
        company_id: companyId,
        instalacao: p.instalacao,
        referencia: p.referencia,
        gerado_por: p.geradoPor,
        numeros: p.numeros,
      });
      if (error) throw new Error(`relatorios_gd_gerados (gravar): ${error.message}`);
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/gd-relatorio-servico.test.ts tests/gd-demonstrativos-tela-repo.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/gd/relatorio-servico.ts src/modules/gd/demonstrativos-tela-repo.ts tests/gd-relatorio-servico.test.ts tests/gd-demonstrativos-tela-repo.test.ts
git commit -m "feat(gd): servico do relatorio (so gera com o mes verde) + registro do PDF

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Botão na tela + rotas + tarifa da empresa

**Files:**
- Modify: `src/modules/dashboard/demonstrativos-views.ts` (fim de `renderDemonstrativoCliente`)
- Modify: `src/modules/dashboard/router.ts` (rota do cliente ~linha 4634; novas rotas logo depois dela)
- Test: `tests/gd-demonstrativos-views.test.ts`

- [ ] **Step 1: Write the failing test** — acrescentar no `describe('renderDemonstrativoCliente'` de `tests/gd-demonstrativos-views.test.ts`:

```ts
  it('mes 🟢 mostra Gerar PDF e Previa; fora disso o botao explica o que falta', () => {
    const base = {
      instalacao: '200002', clienteNome: 'JOAO', leadId: 'L1', meses: ['2026-08-01'], mes: '2026-08-01',
      consumoKwh: 480, injetadoKwh: 222, saldoKwh: 1240, compensadoKwh: 380, economiaRs: 376.2,
      proximoExpirar: null, historico: [], unidades: [], origemDemonstrativo: 'email', verificado: true,
      candidatos: [], msg: null,
    };
    const pronto = renderDemonstrativoCliente({ ...base,
      validacao: { estado: 'pronto', bloqueios: [], pendencias: [], avisos: [], geracaoKwh: 612, origemGeracao: 'api', esperadoMesKwh: 640 } });
    expect(pronto).toContain('href="/dashboard/demonstrativos/200002/relatorio.pdf?mes=2026-08-01"');
    expect(pronto).toContain('href="/dashboard/demonstrativos/200002/relatorio.html?mes=2026-08-01"');
    expect(pronto).not.toMatch(/próxima entrega/);
    const falta = renderDemonstrativoCliente({ ...base,
      validacao: { estado: 'falta_dado', bloqueios: [], pendencias: ['falta a geração do mês'], avisos: [], geracaoKwh: null, origemGeracao: null, esperadoMesKwh: 640 } });
    expect(falta).not.toContain('relatorio.pdf');
    expect(falta).toMatch(/Gerar PDF.*falta a geração do mês/s);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gd-demonstrativos-views.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

Em `src/modules/dashboard/demonstrativos-views.ts`, dentro de `renderDemonstrativoCliente`, trocar a linha:

```ts
<p class="text-sm text-slate-500 mt-3">O relatório em PDF para o cliente chega na próxima entrega (só com tudo 🟢).</p>
```

por:

```ts
${botaoRelatorio}
```

e, antes do `const body = \``, declarar:

```ts
  const motivoFalta = v.bloqueios[0] ?? v.pendencias[0] ?? 'o mês ainda não está pronto';
  const botaoRelatorio = v.estado === 'pronto'
    ? `<div class="flex gap-2 mt-4">
  <a href="/dashboard/demonstrativos/${esc(d.instalacao)}/relatorio.pdf?mes=${esc(d.mes)}" class="px-4 py-2 rounded bg-emerald-700 text-white">📄 Gerar PDF</a>
  <a href="/dashboard/demonstrativos/${esc(d.instalacao)}/relatorio.html?mes=${esc(d.mes)}" target="_blank" class="px-4 py-2 rounded bg-slate-700 text-white">👁 Prévia</a>
</div>`
    : `<p class="mt-4"><span class="px-4 py-2 rounded bg-slate-800 text-slate-500 cursor-not-allowed">📄 Gerar PDF</span>
  <span class="text-sm text-amber-300 ml-2">Só sai com tudo 🟢 — ${esc(motivoFalta)}</span></p>`;
```

Em `src/modules/dashboard/router.ts`:

1. Na rota `GET /demonstrativos/:instalacao` (≈ linha 4634), trocar `economiaEstimadaRs(compensado, TARIFA_PADRAO_RS_KWH)` por `economiaEstimadaRs(compensado, empresaDe(req.dashUser!.companyId).gdTarifaRsKwh)` e remover `TARIFA_PADRAO_RS_KWH` do import dinâmico daquela rota (se ficar sem uso em outras rotas; `grep -n TARIFA_PADRAO_RS_KWH src/modules/dashboard/router.ts` — trocar TODAS as ocorrências do router pela tarifa da empresa).

2. Logo DEPOIS dessa rota, acrescentar:

```ts
  /** Prepara o relatório (dados + marca). null = já respondeu erro. */
  async function relatorioDaRequisicao(req: AuthedRequest, res: Response) {
    const inst = String(req.params.instalacao);
    const mes = typeof req.query.mes === 'string' ? req.query.mes : '';
    if (!RE_UC.test(inst) || !RE_MES.test(mes)) { res.status(400).send('UC ou mês inválido'); return null; }
    const { companyId, tela, ing } = await depsGd(req);
    const cfg = empresaDe(companyId);
    const { prepararRelatorio } = await import('../gd/relatorio-servico.js');
    const r = await prepararRelatorio(inst, mes, {
      historicoDaInstalacao: (i) => tela.historicoDaInstalacao(i),
      geracoesManuais: (i, m) => tela.geracoesManuais(i, m),
      sistemaDoLead: (l) => tela.sistemaDoLead(l),
      geracaoApiDoMes: (l, m) => ing.geracaoDoMes(l, m),
      tarifaRsKwh: cfg.gdTarifaRsKwh,
    });
    if (!r.ok) {
      res.redirect(`/dashboard/demonstrativos/${inst}?mes=${encodeURIComponent(mes)}&msg=${encodeURIComponent(`Relatório não gerado: ${r.motivo}`)}`);
      return null;
    }
    const { marcaDoRelatorio } = await import('../gd/relatorio-marca.js');
    const { obterLogoBase64 } = await import('../proposal/assets/logo-base64.js');
    const { comEmpresaDe } = await import('../empresa-config.js');
    const db = bancoDoOperador(req, supabase);
    const marca = await marcaDoRelatorio(cfg, {
      // obterLogoBase64 lê a empresa do CONTEXTO — roda dentro da empresa do operador.
      baixarLogo: () => comEmpresaDe(companyId, () => obterLogoBase64(db)),
    });
    const { renderRelatorioHtml } = await import('../gd/relatorio-html.js');
    return { inst, mes, tela, relatorio: r.relatorio, html: renderRelatorioHtml(r.relatorio, marca) };
  }

  router.get('/demonstrativos/:instalacao/relatorio.html', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const p = await relatorioDaRequisicao(req, res);
      if (p) res.type('html').send(p.html);
    } catch (err) {
      console.error('[demonstrativos/relatorio.html]', err);
      res.status(500).send(`<h2>Erro ao montar o relatório</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  router.get('/demonstrativos/:instalacao/relatorio.pdf', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const p = await relatorioDaRequisicao(req, res);
      if (!p) return;
      const { gerarRelatorioPdf, lerPdfUnpdf } = await import('../gd/relatorio-pdf.js');
      const { htmlToPdf } = await import('../proposal/pdf-generator.js');
      const pdf = await gerarRelatorioPdf(p.html, { htmlToPdf, lerPdf: lerPdfUnpdf });
      const r = p.relatorio;
      await p.tela.registrarRelatorio({
        instalacao: p.inst, referencia: p.mes, geradoPor: req.dashUser!.id,
        numeros: { gerouKwh: r.gerouKwh, consumiuKwh: r.consumiuKwh, economiaRs: r.economiaRs, creditosKwh: r.creditosKwh, tarifaRsKwh: r.tarifaRsKwh },
      });
      const nome = `relatorio-${p.inst}-${p.mes.slice(0, 7)}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
      res.send(pdf);
    } catch (err) {
      console.error('[demonstrativos/relatorio.pdf]', err);
      const inst = String(req.params.instalacao);
      const mes = typeof req.query.mes === 'string' ? req.query.mes : '';
      if (!res.headersSent) {
        res.redirect(`/dashboard/demonstrativos/${RE_UC.test(inst) ? inst : ''}?mes=${encodeURIComponent(mes)}&msg=${encodeURIComponent(`Não consegui gerar o PDF: ${(err as Error).message}`)}`);
      }
    }
  });
```

IMPORTANTE (ordem das rotas no Express): `/demonstrativos/:instalacao/relatorio.pdf` tem 2 segmentos depois de `/demonstrativos`, então não colide com `/demonstrativos/:instalacao` — mas confira que nenhuma rota `/demonstrativos/:instalacao/:algo` genérica existe antes (as existentes são `/geracao` e `/ligar`, só POST).

`empresaDe` já é importado no topo do router (linha 31). `bancoDoOperador`, `supabase`, `escapeHtmlSimple`, `exigir`, `RE_UC`, `RE_MES`, `depsGd` já existem no escopo (usados pelas rotas da fatia 1).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/gd-demonstrativos-views.test.ts` → PASS. Run: `npx tsc --noEmit` → limpo.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/demonstrativos-views.ts src/modules/dashboard/router.ts tests/gd-demonstrativos-views.test.ts
git commit -m "feat(gd): botao Gerar PDF/Previa e rotas do relatorio; tarifa da empresa na tela

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Prévia visual real (aprovação por print) + verificação final

**Files:** nenhum arquivo do repo (script temporário no scratchpad da sessão, fora do git).

- [ ] **Step 1: Gerar o PDF de prévia com dados de exemplo** — criar no scratchpad `previa-relatorio.mts`:

```ts
import { writeFileSync } from 'node:fs';
import { montarRelatorio } from '<REPO>/src/modules/gd/relatorio-motor.ts';
import { renderRelatorioHtml } from '<REPO>/src/modules/gd/relatorio-html.ts';
import { gerarRelatorioPdf, lerPdfUnpdf } from '<REPO>/src/modules/gd/relatorio-pdf.ts';
import { htmlToPdf } from '<REPO>/src/modules/proposal/pdf-generator.ts';
import { LOGO_ECOSUNPOWER_BRANCO_BASE64 } from '<REPO>/src/modules/proposal/assets/logo-base64.ts';

const hist = Array.from({ length: 13 }, (_, i) => {
  const mes = new Date(Date.UTC(2025, 7 + i, 1)).toISOString().slice(0, 10);
  return { mes, consumida: 420 + (i % 4) * 30, injetada: 200 + (i % 5) * 15, faturada: 100, compensado: 330 + (i % 3) * 20, credito: 0 };
});
const r = montarRelatorio({
  linha: { id: 'X', lead_id: 'L', cliente_nome: 'CLIENTE DE EXEMPLO', codigo_cliente: '0000000', instalacao: '000000',
    referencia: '2026-08-01', injetado_kwh: 260, consumo_kwh: 480, credito_utilizado_kwh: 370, credito_restante_kwh: 0,
    saldo_acumulado_kwh: 1240, proximo_expirar_kwh: 55, ciclo_expirar: '2027-03-01', historico: hist,
    unidades: [{ codigoCliente: '111', percentual: 60, saldo: 800 }, { codigoCliente: '222', percentual: 40, saldo: 440 }],
    inconsistencias: [], origem: 'email', origem_verificada: true, recebido_em: '', conferido_em: null },
  geracaoKwh: 612, origemGeracao: 'api',
  geracaoPorMes: Object.fromEntries(hist.map((h, i) => [h.mes, 560 + (i % 5) * 20])),
  potenciaKwp: 5.5, esperadoMesKwh: 640, tarifaRsKwh: 0.99,
});
const html = renderRelatorioHtml(r, { nomeFantasia: 'EcoSunPower', logoSrc: LOGO_ECOSUNPOWER_BRANCO_BASE64, cor: '#16304F',
  telefone: '(61) 99697-8781', email: 'junior@ecosunpower.eng.br', site: 'ecosunpower.eng.br',
  rodapeRt: 'ANTONIO CANDIDO RODRIGUES JUNIOR — Responsável Técnico CREA/CFT' });
const pdf = await gerarRelatorioPdf(html, { htmlToPdf, lerPdf: lerPdfUnpdf });
writeFileSync('previa-relatorio-gd.pdf', pdf);
console.log('ok', pdf.length);
```

Rodar com `npx tsx previa-relatorio.mts` a partir do scratchpad (trocar `<REPO>` pelo caminho absoluto do repo). Números são de EXEMPLO (nada de dado real de cliente no repositório). Esperado: `ok <bytes>`; se lançar "3 páginas", enxugar o bloco que vazou no `relatorio-html.ts` (altura do gráfico, tamanho de fonte) e repetir.

- [ ] **Step 2: Conferir o visual** — renderizar as 2 páginas em PNG (PyMuPDF `fitz`) e olhar: logo grande, 4 números, frase, gráfico com 13 meses, página 2 com créditos/vencimento/rateio/desempenho/glossário/rodapé; nada cortado. Mostrar o print ao Junior para aprovação (regra: aprovar visual pelo print do real).

- [ ] **Step 3: Verificação final**

Run: `npx tsc --noEmit` → limpo.
Run: `npx vitest run` → verde (exceto as 2 falhas pré-existentes de `tests/supabase-vincular-novo.test.ts`).

- [ ] **Step 4: Code review 3× do diff** (regra do Junior) e corrigir o que aparecer.

- [ ] **Step 5: Entrega** — pedir autorização ao Junior antes do `git push`. Depois: `git push origin feat/demonstrativos-relatorio-pdf`, abrir PR e entregar os comandos:
  1. **Aplicar a migration 132 no Supabase (SQL Editor) ANTES** — senão `empresa_config.gd_tarifa_rs_kwh` não existe (cai no padrão, ok) mas `relatorios_gd_gerados` falta e o PDF dá erro ao registrar.
  2. `gh pr merge <N> --squash --delete-branch` + Implantar no EasyPanel.
  3. Testar no ar com um cliente 🟢 (ex.: João Rangel depois de ligar a UC ao cliente e ter a geração do mês).
</content>
</invoke>
