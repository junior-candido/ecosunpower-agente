# Relatório de Geração da Usina (S3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar um relatório de geração branded por usina (HTML público `/r/:slug` + QR + PDF download), em 3 modos de tom, devolvendo um sinal de saúde — sem nunca enviar a cliente (isso é S4).

**Architecture:** Funções puras isoladas (`classificarGravidade`, `montarDadosRelatorio`, `renderRelatorioHtml`) + orquestrador `gerarRelatorio` reusando `proposal/pdf-generator` (htmlToPdf/QR) e as funções do S1 (`getDetalheSistema`, `garantiaInfo`, `classificarSistema`). Slug não-enumerável com TTL 60d numa tabela nova `relatorio_slugs`. Rota pública `/r/:slug` regenera o HTML fresco a cada acesso.

**Tech Stack:** TypeScript Node16 ESM (imports `.js`), Express, Supabase JS, puppeteer (via proposal/pdf-generator), Vitest. Testes em `tests/`.

Spec: `docs/superpowers/specs/2026-05-18-relatorio-geracao-usina-design.md`

**Escopo refinado vs spec:** PDF servido por download (buffer do `htmlToPdf`), NÃO empurrado pro Google Drive (o `DriveUploader` é modelado pra proposta — acoplar custa). Arquivamento Drive = fast-follow fora deste plano. Link público = entregável principal.

---

### Task 1: `relatorio/gravidade.ts` — `classificarGravidade` (sinal de saúde)

**Files:**
- Create: `src/modules/monitoring/relatorio/gravidade.ts`
- Test: `tests/relatorio-gravidade.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/relatorio-gravidade.test.ts
import { describe, it, expect } from 'vitest';
import { classificarGravidade } from '../src/modules/monitoring/relatorio/gravidade.js';

describe('classificarGravidade', () => {
  it('offline -> grave', () => {
    const r = classificarGravidade({ apelido: 'Casa Silva', offline: true, diasSemGeracao: 5, erro: false, ratio7d: 0 });
    expect(r.gravidade).toBe('grave');
    expect(r.descritivo).toBe('Casa Silva: parada há 5 dias, sem geração. Provável inversor desligado / sem internet.');
  });
  it('erro de integração -> grave', () => {
    const r = classificarGravidade({ apelido: 'Ana C', offline: false, diasSemGeracao: 0, erro: true, ratio7d: 0.9 });
    expect(r.gravidade).toBe('grave');
    expect(r.descritivo).toBe('Ana C: falha de integração com a API — não estamos lendo os dados da usina.');
  });
  it('ratio <= 0.50 -> grave', () => {
    const r = classificarGravidade({ apelido: 'Bar', offline: false, diasSemGeracao: 0, erro: false, ratio7d: 0.50 });
    expect(r.gravidade).toBe('grave');
    expect(r.descritivo).toBe('Bar: gerando só 50% do esperado (últimos 7 dias) — queda forte.');
  });
  it('0.50 < ratio < 0.70 -> medio', () => {
    const r = classificarGravidade({ apelido: 'Ana C', offline: false, diasSemGeracao: 0, erro: false, ratio7d: 0.62 });
    expect(r.gravidade).toBe('medio');
    expect(r.descritivo).toBe('Ana C: gerando ~62% do esperado (últimos 7 dias). Possível sujeira/sombra — candidata a limpeza.');
  });
  it('0.70 <= ratio < 0.85 -> leve', () => {
    const r = classificarGravidade({ apelido: 'Bar Rota', offline: false, diasSemGeracao: 0, erro: false, ratio7d: 0.80 });
    expect(r.gravidade).toBe('leve');
    expect(r.descritivo).toBe('Bar Rota: levemente abaixo (~80% do esperado, 7 dias). Só acompanhar, sem ação.');
  });
  it('ratio >= 0.85 -> null (não incomoda)', () => {
    expect(classificarGravidade({ apelido: 'X', offline: false, diasSemGeracao: 0, erro: false, ratio7d: 0.85 }).gravidade).toBeNull();
    expect(classificarGravidade({ apelido: 'X', offline: false, diasSemGeracao: 0, erro: false, ratio7d: 1.2 }).gravidade).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/relatorio-gravidade.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/modules/monitoring/relatorio/gravidade.ts
// Sinal de saúde do S3 (S4 usa pra alertar o Junior — S3 nunca envia).
// Tiers aprovados: grave (offline/erro/ratio<=0.50) · medio (0.50–0.70) ·
// leve (0.70–0.85) · null (>=0.85). Corte 0.70 = mesmo do radar S1.

export interface GravidadeInput {
  apelido: string;
  offline: boolean;
  diasSemGeracao: number;
  erro: boolean;
  ratio7d: number; // geração real 7d / esperado 7d
}

export type Gravidade = 'grave' | 'medio' | 'leve' | null;

export interface GravidadeResult {
  gravidade: Gravidade;
  descritivo: string;
}

export function classificarGravidade(i: GravidadeInput): GravidadeResult {
  if (i.offline) {
    return {
      gravidade: 'grave',
      descritivo: `${i.apelido}: parada há ${i.diasSemGeracao} dias, sem geração. Provável inversor desligado / sem internet.`,
    };
  }
  if (i.erro) {
    return {
      gravidade: 'grave',
      descritivo: `${i.apelido}: falha de integração com a API — não estamos lendo os dados da usina.`,
    };
  }
  const pct = Math.round(i.ratio7d * 100);
  if (i.ratio7d <= 0.50) {
    return { gravidade: 'grave', descritivo: `${i.apelido}: gerando só ${pct}% do esperado (últimos 7 dias) — queda forte.` };
  }
  if (i.ratio7d < 0.70) {
    return { gravidade: 'medio', descritivo: `${i.apelido}: gerando ~${pct}% do esperado (últimos 7 dias). Possível sujeira/sombra — candidata a limpeza.` };
  }
  if (i.ratio7d < 0.85) {
    return { gravidade: 'leve', descritivo: `${i.apelido}: levemente abaixo (~${pct}% do esperado, 7 dias). Só acompanhar, sem ação.` };
  }
  return { gravidade: null, descritivo: `${i.apelido}: operando dentro do esperado.` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/relatorio-gravidade.test.ts`
Expected: PASS (6).

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/relatorio/gravidade.ts tests/relatorio-gravidade.test.ts
git commit -m "feat(relatorio): classificarGravidade — sinal de saude grave/medio/leve (S3, TDD)"
```
End commit body: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

---

### Task 2: `relatorio/dados.ts` — `montarDadosRelatorio` + tarifa/economia

**Files:**
- Create: `src/modules/monitoring/relatorio/dados.ts`
- Test: `tests/relatorio-dados.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/relatorio-dados.test.ts
import { describe, it, expect } from 'vitest';
import { montarDadosRelatorio, TARIFA_ESTIMADA_KWH } from '../src/modules/monitoring/relatorio/dados.js';

const detalheFake = {
  sistema: { id: 's1', apelido: 'Casa Silva', cidade: 'Brasília', uf: 'DF', marca_inversor: 'deye',
    potencia_kwp: 10, data_instalacao: '2025-12-18', ativo: true, ultimo_erro: null,
    painel_marca: 'Trina Solar' },
  kpis: { hojeKwh: 30, mesKwh: 400, anoKwh: 5000, totalKwh: 12000, esperadoDiaKwh: 41.6, ratioUltimos7: 0.9 },
  serieMensalCompleta: [{ mes: '2026-04', kwh: 1100, esperado: 1248 }, { mes: '2026-05', kwh: 400, esperado: 1290 }],
  alertas: [],
};

function deps(detalhe: any) {
  return { getDetalhe: async (_id: string) => detalhe } as any;
}

describe('montarDadosRelatorio', () => {
  it('TARIFA_ESTIMADA_KWH é 1.00', () => {
    expect(TARIFA_ESTIMADA_KWH).toBe(1.00);
  });

  it('monta dados + economia estimada (kWh total × tarifa) + sinal saudável', async () => {
    const r = await montarDadosRelatorio(deps(detalheFake), 's1', 'acompanhamento');
    expect('erro' in r).toBe(false);
    if (!('erro' in r)) {
      expect(r.apelido).toBe('Casa Silva');
      expect(r.modo).toBe('acompanhamento');
      expect(r.economiaEstimadaReais).toBe(12000 * 1.00);
      expect(r.garantia.ecosun.status).toBe('vigente'); // instalada há ~5 meses
      expect(r.sinal.gravidade).toBeNull(); // ratio 0.9 saudável
      expect(r.serieMensal.length).toBe(2);
      expect(r.semDados).toBe(false);
    }
  });

  it('sistema sem geração -> semDados true (boas_vindas não quebra)', async () => {
    const vazio = { ...detalheFake, kpis: { ...detalheFake.kpis, totalKwh: 0, mesKwh: 0, anoKwh: 0 }, serieMensalCompleta: [] };
    const r = await montarDadosRelatorio(deps(vazio), 's1', 'boas_vindas');
    if (!('erro' in r)) expect(r.semDados).toBe(true);
  });

  it('detalhe null -> { erro }', async () => {
    const r = await montarDadosRelatorio(deps(null), 'x', 'acompanhamento');
    expect('erro' in r).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/relatorio-dados.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/modules/monitoring/relatorio/dados.ts
import { garantiaInfo, type GarantiaResult } from '../garantia.js';
import { classificarSistema } from '../classificacao.js';
import { classificarGravidade, type GravidadeResult } from './gravidade.js';

// Tarifa default p/ economia ESTIMADA (Junior ajusta depois). Nunca promete
// número fechado pro cliente — sempre rotular "economia estimada (base R$ 1,00/kWh)".
export const TARIFA_ESTIMADA_KWH = 1.00;

export type ModoRelatorio = 'boas_vindas' | 'manutencao' | 'acompanhamento';

export interface RelatorioDeps {
  // injeta MonitoringService.getDetalheSistema (testável sem banco)
  getDetalhe: (sistemaId: string) => Promise<any | null>;
}

export interface RelatorioData {
  modo: ModoRelatorio;
  apelido: string;
  cidade: string | null;
  uf: string | null;
  marcaInversor: string;
  potenciaKwp: number | null;
  kpis: { hojeKwh: number | null; mesKwh: number; anoKwh: number; totalKwh: number };
  serieMensal: { mes: string; kwh: number; esperado: number }[];
  economiaEstimadaReais: number;
  garantia: GarantiaResult;
  sinal: GravidadeResult & { ratio7d: number };
  semDados: boolean;
}

export async function montarDadosRelatorio(
  deps: RelatorioDeps,
  sistemaId: string,
  modo: ModoRelatorio,
): Promise<RelatorioData | { erro: string }> {
  const d = await deps.getDetalhe(sistemaId);
  if (!d || !d.sistema) return { erro: 'Sistema não encontrado' };
  const s = d.sistema;

  const ratio7d = Number(d.kpis?.ratioUltimos7 ?? 1);
  const cls = classificarSistema({
    ativo: s.ativo,
    ultimoErro: s.ultimo_erro ?? null,
    potenciaKwp: s.potencia_kwp,
    uf: s.uf,
    diasSemGeracao: cls0DiasSemGeracao(d),
    realUltimos7: ratio7d * (Number(d.kpis?.esperadoDiaKwh ?? 0) * 7),
  });
  const offline = cls.alerta?.tipo === 'sistema_offline';
  const erro = cls.alerta?.tipo === 'erro_integracao';
  const grav = classificarGravidade({
    apelido: s.apelido, offline, diasSemGeracao: cls0DiasSemGeracao(d), erro, ratio7d,
  });

  const garantia = garantiaInfo({
    data_instalacao: s.data_instalacao,
    marca_inversor: s.marca_inversor,
    painel_marca: s.painel_marca ?? null,
  });

  const totalKwh = Number(d.kpis?.totalKwh ?? 0);
  return {
    modo,
    apelido: s.apelido,
    cidade: s.cidade ?? null,
    uf: s.uf ?? null,
    marcaInversor: s.marca_inversor,
    potenciaKwp: s.potencia_kwp ?? null,
    kpis: {
      hojeKwh: d.kpis?.hojeKwh ?? null,
      mesKwh: Number(d.kpis?.mesKwh ?? 0),
      anoKwh: Number(d.kpis?.anoKwh ?? 0),
      totalKwh,
    },
    serieMensal: (d.serieMensalCompleta ?? []) as { mes: string; kwh: number; esperado: number }[],
    economiaEstimadaReais: totalKwh * TARIFA_ESTIMADA_KWH,
    garantia,
    sinal: { ...grav, ratio7d },
    semDados: totalKwh <= 0 && (d.serieMensalCompleta ?? []).length === 0,
  };
}

// getDetalheSistema não expõe offlineHa diretamente; derivamos de alertas[].
// Se houver alerta sistema_offline, extrai o nº de dias do texto; senão 0.
function cls0DiasSemGeracao(d: any): number {
  const a = (d.alertas ?? []).find((x: any) => x.tipo === 'sistema_offline');
  if (!a) return 0;
  const m = String(a.texto).match(/há (\d+) dias/);
  return m ? Number(m[1]) : 3;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/relatorio-dados.test.ts`
Expected: PASS (4). Then `npx tsc --noEmit` → no new error from these files.

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/relatorio/dados.ts tests/relatorio-dados.test.ts
git commit -m "feat(relatorio): montarDadosRelatorio + tarifa estimada (S3, TDD)"
```
End body: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

---

### Task 3: `relatorio/template.ts` — `renderRelatorioHtml(data, modo)` branded

**Files:**
- Create: `src/modules/monitoring/relatorio/template.ts`
- Test: `tests/relatorio-template.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/relatorio-template.test.ts
import { describe, it, expect } from 'vitest';
import { renderRelatorioHtml } from '../src/modules/monitoring/relatorio/template.js';

const base: any = {
  modo: 'acompanhamento', apelido: 'Casa Silva', cidade: 'Brasília', uf: 'DF',
  marcaInversor: 'deye', potenciaKwp: 10,
  kpis: { hojeKwh: 30, mesKwh: 400, anoKwh: 5000, totalKwh: 12000 },
  serieMensal: [{ mes: '2026-04', kwh: 1100, esperado: 1248 }],
  economiaEstimadaReais: 12000,
  garantia: { idadeTexto: '5 meses', ecosun: { status: 'vigente', mesesRestantes: 7 },
    fabricanteInversor: '5 anos', fabricantePainel: 'consultar fabricante' },
  sinal: { gravidade: null, descritivo: 'ok', ratio7d: 0.9 },
  semDados: false,
};

describe('renderRelatorioHtml', () => {
  it('contém branding EcoSunPower + Responsável Técnico, NUNCA "engenheiro"', () => {
    const html = renderRelatorioHtml(base, 'acompanhamento');
    expect(html).toContain('ECOSUNPOWER');
    expect(html).toContain('Responsável Técnico');
    expect(html.toLowerCase()).not.toContain('engenheiro');
    expect(html).toContain('Casa Silva');
    expect(html).toContain('economia estimada');
  });
  it('modo manutencao mostra diagnóstico vs esperado; boas_vindas NÃO', () => {
    const manut = renderRelatorioHtml({ ...base, sinal: { gravidade: 'medio', descritivo: 'd', ratio7d: 0.6 } }, 'manutencao');
    expect(manut).toContain('vs esperado');
    const bv = renderRelatorioHtml(base, 'boas_vindas');
    expect(bv).not.toContain('vs esperado');
    expect(bv).toContain('Bem-vindo');
  });
  it('semDados -> bloco "dados em breve", não quebra', () => {
    const html = renderRelatorioHtml({ ...base, semDados: true }, 'boas_vindas');
    expect(html).toContain('dados em breve');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/relatorio-template.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/modules/monitoring/relatorio/template.ts
// Relatório branded. Reusa o logo oficial base64 do Proposta v2 e a paleta
// de cores (mesmos tokens --primary/--accent). Cliente-facing: SEMPRE
// "Responsável Técnico CREA/CFT", NUNCA "engenheiro".
import { LOGO_ECOSUNPOWER_BRANCO_BASE64 } from '../../proposal/assets/logo-base64.js';
import type { RelatorioData, ModoRelatorio } from './dados.js';

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function renderRelatorioHtml(data: RelatorioData, modo: ModoRelatorio): string {
  const C = `--primary-600:#0E7CB8;--primary-700:#0B5A87;--accent-500:#FFC72C;--dark:#0F172A;--muted:#64748B`;
  const local = [data.cidade, data.uf].filter(Boolean).join('/') || '—';

  const saudacao = modo === 'boas_vindas'
    ? `<div style="background:#E6F7FD;border-radius:12px;padding:18px;margin:16px 0;color:#0B5A87"><b>Bem-vindo à geração solar!</b> Seu sistema está ativo. Acompanhe aqui a energia que ele produz.</div>`
    : '';

  const semDados = data.semDados
    ? `<div style="background:#FFF7E6;border-radius:12px;padding:18px;margin:16px 0;color:#7a5b00">Sistema recém-instalado — os dados de geração aparecem aqui em breve.</div>`
    : '';

  // Diagnóstico vs esperado: só em 'manutencao' (e nunca em boas_vindas).
  const diag = (modo === 'manutencao' && !data.semDados)
    ? `<div style="border:1px solid #E2E8F0;border-radius:12px;padding:18px;margin:16px 0">
         <b>Desempenho vs esperado</b>
         <p style="color:var(--muted);font-size:14px;margin:6px 0 0">
           ${data.sinal.gravidade
             ? `Identificamos que a geração está abaixo do previsto. Recomendamos uma revisão/limpeza preventiva — entre em contato para agendarmos.`
             : `Seu sistema está gerando dentro do previsto. Tudo certo!`}
         </p>
       </div>`
    : '';

  const linhasMensais = (data.serieMensal.length
    ? data.serieMensal.map((m) => `<tr><td style="padding:6px 10px">${esc(m.mes)}</td><td style="padding:6px 10px;text-align:right">${m.kwh.toFixed(0)} kWh</td></tr>`).join('')
    : `<tr><td colspan="2" style="padding:10px;color:var(--muted)">—</td></tr>`);

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório da Usina · ${esc(data.apelido)} · EcoSunPower</title>
<style>:root{${C}} body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#F8FAFC;color:var(--dark)}
.wrap{max-width:760px;margin:0 auto;background:#fff}
.hero{background:linear-gradient(135deg,#1FB8E8 0%,#0E7CB8 60%,#0F172A 100%);color:#fff;padding:28px 24px;position:relative}
.kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;padding:20px 24px}
.kpi{background:#F8FAFC;border-radius:12px;padding:16px}.kpi b{font-size:24px;color:var(--primary-700)}
table{width:100%;border-collapse:collapse;font-size:14px}
.foot{padding:20px 24px;color:var(--muted);font-size:12px;border-top:1px solid #E2E8F0}
img.logo{height:34px;width:auto;background:#fff;border-radius:8px;padding:5px}</style></head>
<body><div class="wrap">
  <div class="hero">
    <img class="logo" src="${LOGO_ECOSUNPOWER_BRANCO_BASE64}" alt="EcoSunPower">
    <div style="font-weight:700;letter-spacing:.04em;margin-top:10px">ECOSUNPOWER · RELATÓRIO DA USINA</div>
    <div style="font-size:20px;font-weight:700;margin-top:6px">${esc(data.apelido)}</div>
    <div style="opacity:.85;font-size:13px">${esc(local)} · ${esc(data.marcaInversor)} · ${data.potenciaKwp ?? '—'} kWp · idade ${esc(data.garantia.idadeTexto)}</div>
  </div>
  ${saudacao}${semDados}
  <div class="kpis">
    <div class="kpi"><div>Geração no mês</div><b>${data.kpis.mesKwh.toFixed(0)} kWh</b></div>
    <div class="kpi"><div>Geração no ano</div><b>${data.kpis.anoKwh.toFixed(0)} kWh</b></div>
    <div class="kpi"><div>Geração total</div><b>${data.kpis.totalKwh.toFixed(0)} kWh</b></div>
    <div class="kpi"><div>Economia estimada</div><b>${brl(data.economiaEstimadaReais)}</b><div style="font-size:11px;color:var(--muted)">base R$ 1,00/kWh</div></div>
  </div>
  ${diag}
  <div style="padding:0 24px 8px"><b>Histórico mês a mês</b></div>
  <div style="padding:0 24px 16px"><table><tbody>${linhasMensais}</tbody></table></div>
  <div style="padding:0 24px 16px;font-size:13px;color:var(--muted)">
    <b>Garantias:</b> Instalação/mão de obra EcoSunPower: ${data.garantia.ecosun.status === 'vigente' ? `vigente (${(data.garantia.ecosun as any).mesesRestantes} meses restantes)` : data.garantia.ecosun.status === 'encerrada' ? `encerrada` : 'a confirmar'}.
    Inversor (fabricante): ${esc(data.garantia.fabricanteInversor)}. Painel: ${esc(data.garantia.fabricantePainel)}.
  </div>
  <div class="foot">
    EcoSunPower Energia Solar · CNPJ 33.020.459/0001-06 · Brasília-DF<br>
    Projeto e instalação sob responsabilidade do nosso <b>Responsável Técnico (ART CREA / TRT CFT)</b>. Conforme ABNT NBR 5410, NBR 16690, NBR 16149/16150 e NR-10.
  </div>
</div></body></html>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/relatorio-template.test.ts`
Expected: PASS (3). Then `npx tsc --noEmit` (confirm `LOGO_ECOSUNPOWER_BRANCO_BASE64` import path resolves — it's used by `proposal/template.ts:6` as `./assets/logo-base64.js`; from `monitoring/relatorio/` the path is `../../proposal/assets/logo-base64.js`. If tsc errors on the path, fix the relative path to the real location of `logo-base64.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/relatorio/template.ts tests/relatorio-template.test.ts
git commit -m "feat(relatorio): renderRelatorioHtml branded, 3 modos, Responsavel Tecnico (S3, TDD)"
```
End body: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

---

### Task 4: Migration `031_relatorio_slugs.sql` + métodos de slug no SupabaseService

**Files:**
- Create: `supabase/migrations/031_relatorio_slugs.sql`
- Modify: `src/modules/supabase.ts` (2 métodos novos)
- Test: `tests/relatorio-slug.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/relatorio-slug.test.ts
import { describe, it, expect } from 'vitest';
import { SupabaseService } from '../src/modules/supabase.js';

function fakeSb(rowBySlug: any) {
  const calls: any[] = [];
  return {
    svc: new SupabaseService({ supabaseUrl: 'http://x', supabaseServiceKey: 'k' }),
    patch(svc: SupabaseService) {
      (svc as any).getClient = () => ({
        from() {
          return {
            insert(v: any) { calls.push(['insert', v]); return Promise.resolve({ error: null }); },
            select() { return this; },
            eq(_c: string, _v: string) { return this; },
            maybeSingle() { return Promise.resolve({ data: rowBySlug, error: null }); },
          };
        },
      });
      return calls;
    },
  };
}

describe('relatorio slug', () => {
  it('criarRelatorioSlug gera slug 16-32 urlsafe e insere com expira_em ~60d', async () => {
    const f = fakeSb(null); const calls = f.patch(f.svc);
    const slug = await f.svc.criarRelatorioSlug('sis-1');
    expect(slug).toMatch(/^[A-Za-z0-9_-]{16,32}$/);
    expect(calls[0][0]).toBe('insert');
    expect(calls[0][1].sistema_id).toBe('sis-1');
    expect(new Date(calls[0][1].expira_em).getTime()).toBeGreaterThan(Date.now() + 59 * 864e5);
  });
  it('getRelatorioSlug devolve row; expirado -> null', async () => {
    const ativo = { sistema_id: 'sis-1', expira_em: new Date(Date.now() + 864e5).toISOString() };
    const f1 = fakeSb(ativo); f1.patch(f1.svc);
    expect(await f1.svc.getRelatorioSlug('abcdefghijklmnop')).toEqual(ativo);
    const exp = { sistema_id: 'sis-1', expira_em: new Date(Date.now() - 864e5).toISOString() };
    const f2 = fakeSb(exp); f2.patch(f2.svc);
    expect(await f2.svc.getRelatorioSlug('abcdefghijklmnop')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/relatorio-slug.test.ts`
Expected: FAIL (`criarRelatorioSlug` not a function).

- [ ] **Step 3a: Create migration**

`supabase/migrations/031_relatorio_slugs.sql`:

```sql
-- Slugs de relatório de usina (link público /r/:slug, TTL 60 dias).
create table if not exists relatorio_slugs (
  slug text primary key,
  sistema_id uuid not null references sistemas_clientes(id) on delete cascade,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null
);
create index if not exists idx_relatorio_slugs_sistema on relatorio_slugs(sistema_id);
```

- [ ] **Step 3b: Add SupabaseService methods**

In `src/modules/supabase.ts`, add `import crypto from 'crypto';` if not present, and add to the `SupabaseService` class:

```typescript
  async criarRelatorioSlug(sistemaId: string): Promise<string> {
    const slug = crypto.randomBytes(18).toString('base64url').slice(0, 24);
    const expira = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    await this.getClient().from('relatorio_slugs').insert({
      slug, sistema_id: sistemaId, expira_em: expira,
    });
    return slug;
  }

  async getRelatorioSlug(slug: string): Promise<{ sistema_id: string; expira_em: string } | null> {
    const { data } = await this.getClient()
      .from('relatorio_slugs')
      .select('sistema_id, expira_em')
      .eq('slug', slug)
      .maybeSingle();
    if (!data) return null;
    if (new Date((data as any).expira_em).getTime() < Date.now()) return null;
    return data as { sistema_id: string; expira_em: string };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/relatorio-slug.test.ts`
Expected: PASS (2). Then `npx tsc --noEmit` → no new error.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/031_relatorio_slugs.sql src/modules/supabase.ts tests/relatorio-slug.test.ts
git commit -m "feat(relatorio): tabela relatorio_slugs + criar/getRelatorioSlug TTL 60d (S3, TDD)"
```
End body: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

**GATE HUMANO:** Junior aplica `031_relatorio_slugs.sql` manual no Supabase prod `kupnsoyymulbdzakqlqc` (MCP aponta projeto errado — dar o SQL pra ele colar no SQL Editor).

---

### Task 5: `relatorio/gerar.ts` — orquestrador `gerarRelatorio`

**Files:**
- Create: `src/modules/monitoring/relatorio/gerar.ts`
- Test: `tests/relatorio-gerar.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/relatorio-gerar.test.ts
import { describe, it, expect, vi } from 'vitest';
import { gerarRelatorio } from '../src/modules/monitoring/relatorio/gerar.js';

const detalhe = {
  sistema: { id: 's1', apelido: 'Casa Silva', cidade: 'Brasília', uf: 'DF', marca_inversor: 'deye',
    potencia_kwp: 10, data_instalacao: '2025-12-18', ativo: true, ultimo_erro: null, painel_marca: null },
  kpis: { hojeKwh: 30, mesKwh: 400, anoKwh: 5000, totalKwh: 12000, esperadoDiaKwh: 41.6, ratioUltimos7: 0.9 },
  serieMensalCompleta: [{ mes: '2026-05', kwh: 400, esperado: 1290 }],
  alertas: [],
};

describe('gerarRelatorio', () => {
  it('gera publicUrl + qr + sinal; pdf via htmlToPdf', async () => {
    const deps = {
      getDetalhe: async () => detalhe,
      criarSlug: vi.fn(async () => 'SLUG123abcSLUG123abc'),
      htmlToPdf: vi.fn(async () => Buffer.from('PDF')),
      gerarQr: vi.fn(async () => 'data:image/png;base64,QR'),
      baseUrl: 'https://propostas.ecosunpower.eng.br',
    };
    const r = await gerarRelatorio(deps as any, 's1', 'acompanhamento');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.publicUrl).toBe('https://propostas.ecosunpower.eng.br/r/SLUG123abcSLUG123abc');
      expect(r.qrDataUrl).toBe('data:image/png;base64,QR');
      expect(r.sinal.gravidade).toBeNull();
      expect(Buffer.isBuffer(r.pdfBuffer)).toBe(true);
      expect(deps.htmlToPdf).toHaveBeenCalledOnce();
    }
  });
  it('detalhe null -> ok:false', async () => {
    const deps = { getDetalhe: async () => null, criarSlug: async () => 's', htmlToPdf: async () => Buffer.from(''), gerarQr: async () => 'x', baseUrl: 'b' };
    const r = await gerarRelatorio(deps as any, 'x', 'acompanhamento');
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/relatorio-gerar.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/modules/monitoring/relatorio/gerar.ts
import { montarDadosRelatorio, type ModoRelatorio } from './dados.js';
import { renderRelatorioHtml } from './template.js';
import type { GravidadeResult } from './gravidade.js';

export interface GerarDeps {
  getDetalhe: (sistemaId: string) => Promise<any | null>;
  criarSlug: (sistemaId: string) => Promise<string>;
  htmlToPdf: (html: string) => Promise<Buffer>;
  gerarQr: (url: string) => Promise<string>;
  baseUrl: string; // ex: https://propostas.ecosunpower.eng.br
}

export type GerarResult =
  | { ok: true; publicUrl: string; qrDataUrl: string; pdfBuffer: Buffer; sinal: GravidadeResult & { ratio7d: number } }
  | { ok: false; reason: string };

export async function gerarRelatorio(
  deps: GerarDeps,
  sistemaId: string,
  modo: ModoRelatorio,
): Promise<GerarResult> {
  const dados = await montarDadosRelatorio({ getDetalhe: deps.getDetalhe }, sistemaId, modo);
  if ('erro' in dados) return { ok: false, reason: dados.erro };

  const html = renderRelatorioHtml(dados, modo);
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await deps.htmlToPdf(html);
  } catch (e) {
    return { ok: false, reason: `PDF: ${(e as Error).message}` };
  }
  const slug = await deps.criarSlug(sistemaId);
  const publicUrl = `${deps.baseUrl}/r/${slug}`;
  const qrDataUrl = await deps.gerarQr(publicUrl);
  return { ok: true, publicUrl, qrDataUrl, pdfBuffer, sinal: dados.sinal };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/relatorio-gerar.test.ts`
Expected: PASS (2). `npx tsc --noEmit` → no new error.

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/relatorio/gerar.ts tests/relatorio-gerar.test.ts
git commit -m "feat(relatorio): gerarRelatorio orquestrador (dados->html->pdf->slug->qr) (S3, TDD)"
```
End body: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

---

### Task 6: Rota pública `/r/:slug` + rota dashboard `POST /monitoramento/:id/relatorio`

**Files:**
- Modify: `src/index.ts` (nova rota `app.get('/r/:slug')` perto da `app.get('/p/:slug')` ~linha 5152)
- Modify: `src/modules/dashboard/router.ts` (nova rota `POST /monitoramento/:id/relatorio`)
- Test: `tests/relatorio-rota.test.ts` (testa o handler de slug isolado via função extraída)

- [ ] **Step 1: Write the failing test**

```typescript
// tests/relatorio-rota.test.ts
import { describe, it, expect } from 'vitest';
import { resolverRelatorioSlug } from '../src/modules/monitoring/relatorio/resolver.js';

describe('resolverRelatorioSlug', () => {
  it('slug inválido -> not_found', async () => {
    const r = await resolverRelatorioSlug({ getSlug: async () => null }, 'curto');
    expect(r).toEqual({ status: 'invalido' });
  });
  it('slug não existe/expirado -> expirado', async () => {
    const r = await resolverRelatorioSlug({ getSlug: async () => null }, 'abcdefghijklmnopqrst');
    expect(r).toEqual({ status: 'expirado' });
  });
  it('slug válido -> sistema_id', async () => {
    const r = await resolverRelatorioSlug({ getSlug: async () => ({ sistema_id: 's1', expira_em: 'x' }) }, 'abcdefghijklmnopqrst');
    expect(r).toEqual({ status: 'ok', sistemaId: 's1' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/relatorio-rota.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3a: Create the pure resolver**

```typescript
// src/modules/monitoring/relatorio/resolver.ts
// Lógica pura do /r/:slug (testável sem Express). Mesma regra de slug do /p/:slug.
const SLUG_RE = /^[A-Za-z0-9_-]{16,32}$/;

export interface ResolverDeps {
  getSlug: (slug: string) => Promise<{ sistema_id: string; expira_em: string } | null>;
}

export async function resolverRelatorioSlug(
  deps: ResolverDeps,
  slug: string,
): Promise<{ status: 'invalido' } | { status: 'expirado' } | { status: 'ok'; sistemaId: string }> {
  if (!SLUG_RE.test(slug)) return { status: 'invalido' };
  const row = await deps.getSlug(slug);
  if (!row) return { status: 'expirado' };
  return { status: 'ok', sistemaId: row.sistema_id };
}
```

- [ ] **Step 3b: Wire the public route in `src/index.ts`**

Locate `app.get('/p/:slug', ...)` (~line 5152). Immediately AFTER that route's closing `});`, add (use the `supabase`, `monitoringService` instances already in scope at that point — confirm their identifiers by reading nearby code; reuse `htmlToPdf`/`gerarQrCodeDataUrl` from `./modules/proposal/pdf-generator.js` and `gerarRelatorio` from `./modules/monitoring/relatorio/gerar.js`, and `resolverRelatorioSlug` from `./modules/monitoring/relatorio/resolver.js` — add imports at top of index.ts alongside other module imports):

```typescript
  app.get('/r/:slug', async (req, res) => {
    try {
      const slug = String(req.params.slug ?? '');
      const r = await resolverRelatorioSlug({ getSlug: (s) => supabase.getRelatorioSlug(s) }, slug);
      if (r.status !== 'ok') {
        return res.status(404).type('text/html').send(propostaErrorHtml(r.status === 'expirado' ? 'expired' : 'not_found'));
      }
      const result = await gerarRelatorio({
        getDetalhe: (id) => monitoringService.getDetalheSistema(id),
        criarSlug: async () => slug, // já temos o slug; regenera HTML fresco
        htmlToPdf,
        gerarQr: gerarQrCodeDataUrl,
        baseUrl: `${req.protocol}://${req.get('host')}`,
      }, r.sistemaId, 'acompanhamento');
      if (!result.ok) return res.status(500).type('text/html').send(propostaErrorHtml('error'));
      if (req.query.pdf === '1') {
        res.type('application/pdf').set('Content-Disposition', 'inline; filename="relatorio.pdf"').send(result.pdfBuffer);
        return;
      }
      // regenera só o HTML (sem custo de PDF) p/ a página
      const dados = await monitoringService.getDetalheSistema(r.sistemaId);
      const { renderRelatorioHtml } = await import('./modules/monitoring/relatorio/template.js');
      const { montarDadosRelatorio } = await import('./modules/monitoring/relatorio/dados.js');
      const d = await montarDadosRelatorio({ getDetalhe: async () => dados }, r.sistemaId, 'acompanhamento');
      if ('erro' in d) return res.status(500).type('text/html').send(propostaErrorHtml('error'));
      res.type('text/html').send(renderRelatorioHtml(d, 'acompanhamento'));
    } catch (err) {
      console.error('[relatorio-publico]', err);
      res.status(500).type('text/html').send(propostaErrorHtml('error'));
    }
  });
```
(If `propostaErrorHtml` only accepts `'not_found'|'expired'`, pass `'expired'` for the error case too — read its signature near line 53. Match the actual `supabase`/`monitoringService` variable names in index.ts.)

- [ ] **Step 3c: Wire the dashboard route in `src/modules/dashboard/router.ts`**

Near the other `router.post('/monitoramento/:id/...')` routes, add (reuse `monitoringService`, `Request`/`Response` as the file does; import `gerarRelatorio`, `htmlToPdf`, `gerarQrCodeDataUrl` and the `supabaseService` instance available to the router):

```typescript
  router.post('/monitoramento/:id/relatorio', async (req: Request, res: Response) => {
    try {
      const { gerarRelatorio } = await import('../monitoring/relatorio/gerar.js');
      const { htmlToPdf, gerarQrCodeDataUrl } = await import('../proposal/pdf-generator.js');
      const id = String(req.params.id ?? '');
      const r = await gerarRelatorio({
        getDetalhe: (sid) => monitoringService.getDetalheSistema(sid),
        criarSlug: (sid) => supabaseService.criarRelatorioSlug(sid),
        htmlToPdf,
        gerarQr: gerarQrCodeDataUrl,
        baseUrl: process.env.PUBLIC_BASE_URL ?? 'https://propostas.ecosunpower.eng.br',
      }, id, 'acompanhamento');
      if (!r.ok) {
        return res.status(500).send(`<h2>Erro ao gerar relatório</h2><pre>${r.reason}</pre><a href="/dashboard/monitoramento">← voltar</a>`);
      }
      res.type('text/html').send(`<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;max-width:520px;margin:40px auto;text-align:center">
        <h2>Relatório gerado ✅</h2>
        <p>Link público (TTL 60 dias):</p>
        <p><a href="${r.publicUrl}">${r.publicUrl}</a></p>
        <img src="${r.qrDataUrl}" alt="QR" style="width:180px;height:180px">
        <p><a href="${r.publicUrl}?pdf=1">Baixar PDF</a></p>
        <p style="color:#64748b;font-size:13px">Este relatório NÃO foi enviado a ninguém — é só pra você. (Envio ao cliente = S4)</p>
        <p><a href="/dashboard/monitoramento">← voltar ao monitoramento</a></p></body>`);
    } catch (err) {
      console.error('[dashboard/relatorio]', err);
      res.status(500).send(`<h2>Erro</h2><pre>${(err as Error).message}</pre>`);
    }
  });
```
(Confirm `supabaseService` is the SupabaseService instance available in the router factory — read the top of router.ts; in S1 Task 5 it was the `createDashboardRouter(supabaseService, monitoringService, ...)` signature.)

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run tests/relatorio-rota.test.ts && npx tsc --noEmit`
Expected: resolver tests PASS (3); tsc EXIT 0 (no new errors in index.ts/router.ts).

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/relatorio/resolver.ts src/index.ts src/modules/dashboard/router.ts tests/relatorio-rota.test.ts
git commit -m "feat(relatorio): rota publica /r/:slug + botao dashboard gera link+QR (S3, TDD)"
```
End body: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

---

### Task 7: Verificação final + push

**Files:** nenhum (verificação)

- [ ] **Step 1:** `npx tsc --noEmit` → EXIT 0.
- [ ] **Step 2:** `npx vitest run 2>&1 | tail -8` → todos PASS exceto as 2 falhas PRÉ-EXISTENTES de `tests/cases-fetcher.test.ts` (não relacionadas — não atribuir a este trabalho). Nenhuma falha nova.
- [ ] **Step 3:** Self-review do controller (reviews via subagente desligados a pedido do Junior): conferir diffs cirúrgicos, nada cliente-facing enviado pelo S3, "engenheiro" ausente do template.
- [ ] **Step 4:** `git push`. Avisar Junior: aplicar `031_relatorio_slugs.sql` no Supabase prod + Implantar Easypanel pra ativar `/r/:slug` e o botão.
- [ ] **Step 5:** Relatar: o que entrou, suite verde (ressalva cases-fetcher), o gate da migration, e que S4 (Eva envia + aprovação) é o próximo.

---

## Self-Review (checklist do autor)

**1. Spec coverage:**
- Destino PDF+link público+QR+TTL60d → Task 4 (slug/TTL) + Task 5 (gerar/QR/pdf) + Task 6 (/r/:slug, ?pdf=1) ✓ (Drive arquivamento explicitamente fora — refino registrado no header)
- Relatório único sempre atualizado → /r/:slug regenera HTML fresco (Task 6) ✓
- 3 modos de tom → `ModoRelatorio` (Task 2) + render condicional (Task 3) ✓
- Regra de gravidade (50/70/85, offline/erro) → Task 1 ✓
- Sinal devolvido, S3 nunca envia → `gerarRelatorio` retorna `sinal`, nenhuma chamada de envio (Task 5); dashboard route diz "não foi enviado" (Task 6) ✓
- Branding + "Responsável Técnico" nunca "engenheiro" → Task 3 + teste que falha se "engenheiro" aparecer ✓
- Economia estimada tarifa default → `TARIFA_ESTIMADA_KWH=1.00` (Task 2) + label "base R$ 1,00/kWh" (Task 3) ✓
- Casos de borda (semDados, detalhe null, pdf fail, slug expirado) → Tasks 2/5/6 ✓
- Migration manual no projeto certo → Task 4 GATE HUMANO ✓

**2. Placeholder scan:** sem TBD/TODO; código completo por step. Pontos que dependem de identificadores reais do codebase (nomes `supabase`/`monitoringService`/`supabaseService` em index.ts/router.ts, assinatura de `propostaErrorHtml`, caminho de `logo-base64`) estão marcados com instrução explícita de "confirmar lendo o arquivo" — não são placeholders de lógica, são pontos de integração num codebase existente, com fallback indicado.

**3. Type consistency:** `RelatorioData`/`ModoRelatorio` (Task 2) consumidos em Task 3/5; `GravidadeResult` (Task 1) usado em Task 2/5; `gerarRelatorio` deps (`getDetalhe`/`criarSlug`/`htmlToPdf`/`gerarQr`/`baseUrl`) consistentes entre Task 5 (def) e Task 6 (uso real com `supabase.getRelatorioSlug`/`criarRelatorioSlug` da Task 4 e `htmlToPdf`/`gerarQrCodeDataUrl` reais). `resolverRelatorioSlug` (Task 6) usa `getRelatorioSlug` (Task 4). Slug regex idêntico ao do `/p/:slug` real.
