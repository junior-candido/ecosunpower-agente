# Tela de Usinas "Painel de Triagem" (S1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar `/dashboard/monitoramento` num "Painel de Triagem" — radar de problemas + lista filtrável/buscável + KPIs + cronômetro de garantia + tema escuro — que escala pra 100+ usinas.

**Architecture:** Funções puras isoladas (`classificarSistema`, `garantiaInfo`, helper de esperado), extração da regra de alerta hoje embutida em `getDetalheSistema` (zero-regressão via guard), 1 query agregada estendida (sem N+1), view server-rendered reescrita, tema escuro no layout compartilhado. Sem SPA, sem framework novo.

**Tech Stack:** TypeScript Node16 ESM (imports `.js`), Express, Supabase JS, HTML server-rendered + Tailwind, Vitest. Testes em `tests/`.

Spec: `docs/superpowers/specs/2026-05-18-tela-usinas-painel-triagem-design.md`

---

### Task 1: `garantia.ts` — função pura `garantiaInfo()` (S2 embutido)

**Files:**
- Create: `src/modules/monitoring/garantia.ts`
- Test: `tests/monitoramento-garantia.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/monitoramento-garantia.test.ts
import { describe, it, expect } from 'vitest';
import { garantiaInfo } from '../src/modules/monitoring/garantia.js';

const HOJE = new Date('2026-05-18T12:00:00Z');

describe('garantiaInfo', () => {
  it('sem data_instalacao -> tudo indefinido, não inventa', () => {
    const r = garantiaInfo({ data_instalacao: null, marca_inversor: 'deye', painel_marca: null }, HOJE);
    expect(r.idadeTexto).toBe('—');
    expect(r.ecosun.status).toBe('indefinida');
    expect(r.fabricanteInversor).toBe('informar equipamento');
  });

  it('instalada há 5 meses -> garantia EcoSun vigente, 7 meses restantes', () => {
    const r = garantiaInfo({ data_instalacao: '2025-12-18', marca_inversor: 'deye', painel_marca: 'Trina Solar' }, HOJE);
    expect(r.idadeTexto).toBe('5 meses');
    expect(r.ecosun.status).toBe('vigente');
    expect(r.ecosun.mesesRestantes).toBe(7);
  });

  it('instalada há 20 meses -> garantia EcoSun encerrada há 8 meses', () => {
    const r = garantiaInfo({ data_instalacao: '2024-09-18', marca_inversor: 'solaredge', painel_marca: 'LONGi' }, HOJE);
    expect(r.ecosun.status).toBe('encerrada');
    expect(r.ecosun.mesesDesdeFim).toBe(8);
    expect(r.idadeTexto).toBe('1 ano 8 meses');
  });

  it('marca de inversor conhecida na tabela -> anos do fabricante; desconhecida -> consultar', () => {
    const r1 = garantiaInfo({ data_instalacao: '2025-01-01', marca_inversor: 'solaredge', painel_marca: null }, HOJE);
    expect(r1.fabricanteInversor).toBe('12 anos');
    expect(r1.fabricantePainel).toBe('informar equipamento');
    const r2 = garantiaInfo({ data_instalacao: '2025-01-01', marca_inversor: 'marcaX', painel_marca: 'Jinko Solar' }, HOJE);
    expect(r2.fabricanteInversor).toBe('consultar fabricante');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/monitoramento-garantia.test.ts`
Expected: FAIL — `garantiaInfo` não existe (Cannot find module).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/modules/monitoring/garantia.ts
// S2 — Cronômetro de garantia/vida útil. Função PURA (testável isolada).
// Regra fixa EcoSunPower: 12 meses de garantia de mão de obra/instalação
// (memória project_garantia_ecosunpower). Equipamento segue fabricante.
// NUNCA inventa prazo: sem dado do equipamento -> "informar equipamento";
// marca fora da tabela -> "consultar fabricante".

export interface GarantiaInput {
  data_instalacao: string | null;
  marca_inversor: string | null;
  painel_marca: string | null;
}

export interface GarantiaResult {
  idadeTexto: string;
  ecosun:
    | { status: 'vigente'; mesesRestantes: number }
    | { status: 'encerrada'; mesesDesdeFim: number }
    | { status: 'indefinida' };
  fabricanteInversor: string;
  fabricantePainel: string;
}

const ECOSUN_GARANTIA_MESES = 12;

// Valores PADRÃO de referência (anos). Junior valida/ajusta. Marca ausente
// => "consultar fabricante" (não inventa). Só preenchidas marcas com prazo
// padrão amplamente documentado; demais ficam fora de propósito.
const GARANTIA_INVERSOR_ANOS: Record<string, number> = {
  solaredge: 12,
  deye: 5,
};
const GARANTIA_PAINEL_ANOS_PRODUTO: Record<string, number> = {
  // preenchível depois; vazio agora => "consultar fabricante"
};

function diffMeses(de: Date, ate: Date): number {
  return (ate.getFullYear() - de.getFullYear()) * 12 + (ate.getMonth() - de.getMonth())
    - (ate.getDate() < de.getDate() ? 1 : 0);
}

function idadeTextoDe(meses: number): string {
  if (meses < 1) return 'menos de 1 mês';
  const anos = Math.floor(meses / 12);
  const m = meses % 12;
  if (anos === 0) return `${m} ${m === 1 ? 'mês' : 'meses'}`;
  const aTxt = `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
  return m === 0 ? aTxt : `${aTxt} ${m} ${m === 1 ? 'mês' : 'meses'}`;
}

export function garantiaInfo(i: GarantiaInput, hoje: Date = new Date()): GarantiaResult {
  const marca = (i.marca_inversor ?? '').trim().toLowerCase();
  const fabricanteInversor = !marca
    ? 'informar equipamento'
    : marca in GARANTIA_INVERSOR_ANOS
      ? `${GARANTIA_INVERSOR_ANOS[marca]} anos`
      : 'consultar fabricante';
  const painel = (i.painel_marca ?? '').trim();
  const fabricantePainel = !painel
    ? 'informar equipamento'
    : painel in GARANTIA_PAINEL_ANOS_PRODUTO
      ? `${GARANTIA_PAINEL_ANOS_PRODUTO[painel]} anos`
      : 'consultar fabricante';

  if (!i.data_instalacao) {
    return { idadeTexto: '—', ecosun: { status: 'indefinida' }, fabricanteInversor, fabricantePainel };
  }
  const di = new Date(i.data_instalacao + 'T00:00:00Z');
  if (isNaN(di.getTime())) {
    return { idadeTexto: '—', ecosun: { status: 'indefinida' }, fabricanteInversor, fabricantePainel };
  }
  const mesesIdade = Math.max(0, diffMeses(di, hoje));
  const ecosun = mesesIdade < ECOSUN_GARANTIA_MESES
    ? { status: 'vigente' as const, mesesRestantes: ECOSUN_GARANTIA_MESES - mesesIdade }
    : { status: 'encerrada' as const, mesesDesdeFim: mesesIdade - ECOSUN_GARANTIA_MESES };

  return { idadeTexto: idadeTextoDe(mesesIdade), ecosun, fabricanteInversor, fabricantePainel };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/monitoramento-garantia.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/garantia.ts tests/monitoramento-garantia.test.ts
git commit -m "feat(monitoring): garantiaInfo — cronometro garantia/vida util (S2, TDD)"
```

---

### Task 2: `classificacao.ts` — `classificarSistema()` + `esperadoDiaKwh()` (o radar)

**Files:**
- Create: `src/modules/monitoring/classificacao.ts`
- Test: `tests/monitoramento-classificacao.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/monitoramento-classificacao.test.ts
import { describe, it, expect } from 'vitest';
import { classificarSistema, esperadoDiaKwh } from '../src/modules/monitoring/classificacao.js';

describe('esperadoDiaKwh', () => {
  it('usa HSP 5.3 em GO e 5.2 fora, fator 0.80', () => {
    expect(esperadoDiaKwh(10, 'GO')).toBeCloseTo(10 * 5.3 * 0.8);
    expect(esperadoDiaKwh(10, 'DF')).toBeCloseTo(10 * 5.2 * 0.8);
    expect(esperadoDiaKwh(null, 'GO')).toBe(0);
  });
});

describe('classificarSistema', () => {
  const base = { ativo: true, ultimoErro: null, potenciaKwp: 10, uf: 'DF' as string | null };

  it('inativo -> ok, sem alerta (não polui radar)', () => {
    const r = classificarSistema({ ...base, ativo: false, diasSemGeracao: 30, realUltimos7: 0 });
    expect(r.nivel).toBe('ok');
    expect(r.alerta).toBeNull();
  });

  it('offline >=3 dias -> urgente com texto exato (zero-regressão)', () => {
    const r = classificarSistema({ ...base, diasSemGeracao: 5, realUltimos7: 0 });
    expect(r.nivel).toBe('urgente');
    expect(r.alerta).toEqual({
      tipo: 'sistema_offline', severidade: 'urgente',
      texto: 'Sem geração há 5 dias. Verificar inversor / conexão WiFi.',
    });
  });

  it('ultimo_erro setado -> urgente', () => {
    const r = classificarSistema({ ...base, ultimoErro: 'Deye 403', diasSemGeracao: 0, realUltimos7: 50 });
    expect(r.nivel).toBe('urgente');
    expect(r.alerta?.tipo).toBe('erro_integracao');
  });

  it('geração 7d <70% do esperado -> aviso (texto exato)', () => {
    // esperado7d = 10*5.2*0.8*7 = 291.2 ; 50% -> 145.6
    const r = classificarSistema({ ...base, diasSemGeracao: 0, realUltimos7: 145.6 });
    expect(r.nivel).toBe('aviso');
    expect(r.alerta).toEqual({
      tipo: 'queda_geracao', severidade: 'aviso',
      texto: 'Geração últimos 7 dias 50% ABAIXO do esperado. Pode ser sujeira/sombreamento — agendar limpeza.',
    });
  });

  it('geração 7d >110% -> info', () => {
    const r = classificarSistema({ ...base, diasSemGeracao: 0, realUltimos7: 291.2 * 1.2 });
    expect(r.nivel).toBe('info');
    expect(r.alerta?.tipo).toBe('milestone_economia');
  });

  it('dentro do esperado -> ok sem alerta', () => {
    const r = classificarSistema({ ...base, diasSemGeracao: 0, realUltimos7: 291.2 });
    expect(r.nivel).toBe('ok');
    expect(r.alerta).toBeNull();
  });

  it('sem potência -> ok (não classifica queda sem base)', () => {
    const r = classificarSistema({ ...base, potenciaKwp: null, diasSemGeracao: 0, realUltimos7: 0 });
    expect(r.nivel).toBe('ok');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/monitoramento-classificacao.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/modules/monitoring/classificacao.ts
// O RADAR. Função PURA. Regra extraída de getDetalheSistema (mesmos textos
// de alerta = zero-regressão). Lista e detalhe consomem a MESMA função.

export type NivelSistema = 'urgente' | 'aviso' | 'info' | 'ok';

export interface ClassificacaoInput {
  ativo: boolean;
  ultimoErro: string | null;
  potenciaKwp: number | null;
  uf: string | null;
  diasSemGeracao: number; // dias consecutivos sem geração>0 (detalhe: preciso; lista: proxy 7d=0 -> 7)
  realUltimos7: number;   // kWh somados nos últimos 7 dias
}

export interface Alerta {
  tipo: string;
  severidade: 'aviso' | 'urgente' | 'info';
  texto: string;
}

export interface Classificacao {
  nivel: NivelSistema;
  alerta: Alerta | null;
}

export function esperadoDiaKwh(potenciaKwp: number | null, uf: string | null): number {
  const hsp = uf === 'GO' ? 5.3 : 5.2;
  return Number(potenciaKwp ?? 0) * hsp * 0.80;
}

export function classificarSistema(i: ClassificacaoInput): Classificacao {
  if (!i.ativo) return { nivel: 'ok', alerta: null };

  if (i.ultimoErro) {
    return {
      nivel: 'urgente',
      alerta: { tipo: 'erro_integracao', severidade: 'urgente', texto: `Erro de integração: ${i.ultimoErro}` },
    };
  }

  if (i.diasSemGeracao >= 3) {
    return {
      nivel: 'urgente',
      alerta: {
        tipo: 'sistema_offline', severidade: 'urgente',
        texto: `Sem geração há ${i.diasSemGeracao} dias. Verificar inversor / conexão WiFi.`,
      },
    };
  }

  const kWp = Number(i.potenciaKwp ?? 0);
  const esperado7 = esperadoDiaKwh(i.potenciaKwp, i.uf) * 7;
  const ratio = esperado7 > 0 ? i.realUltimos7 / esperado7 : 1;

  if (kWp > 0 && ratio < 0.70 && i.realUltimos7 > 0) {
    const pct = Math.round((1 - ratio) * 100);
    return {
      nivel: 'aviso',
      alerta: {
        tipo: 'queda_geracao', severidade: 'aviso',
        texto: `Geração últimos 7 dias ${pct}% ABAIXO do esperado. Pode ser sujeira/sombreamento — agendar limpeza.`,
      },
    };
  }
  if (kWp > 0 && ratio > 1.10) {
    const pct = Math.round((ratio - 1) * 100);
    return {
      nivel: 'info',
      alerta: {
        tipo: 'milestone_economia', severidade: 'info',
        texto: `Geração últimos 7 dias ${pct}% ACIMA do esperado. Sistema operando excelente!`,
      },
    };
  }
  return { nivel: 'ok', alerta: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/monitoramento-classificacao.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/classificacao.ts tests/monitoramento-classificacao.test.ts
git commit -m "feat(monitoring): classificarSistema — radar de triagem (regra pura, TDD)"
```

---

### Task 3: Refatorar `getDetalheSistema` pra consumir `classificarSistema` (zero-regressão)

**Files:**
- Modify: `src/modules/monitoring/service.ts` (bloco de alertas dentro de `getDetalheSistema`, ~linhas 586-625; KPI `esperadoDia` ~linha 515-519)
- Test: `tests/monitoramento-classificacao.test.ts` (adiciona guard)

- [ ] **Step 1: Write the failing guard test (anexar ao arquivo existente)**

```typescript
// anexar em tests/monitoramento-classificacao.test.ts
describe('zero-regressão: textos batem com os literais antigos de getDetalheSistema', () => {
  it('offline 4 dias', () => {
    expect(classificarSistema({ ativo: true, ultimoErro: null, potenciaKwp: 5, uf: 'DF', diasSemGeracao: 4, realUltimos7: 0 }).alerta?.texto)
      .toBe('Sem geração há 4 dias. Verificar inversor / conexão WiFi.');
  });
  it('queda 35%', () => {
    const esperado7 = 5 * 5.2 * 0.8 * 7;
    expect(classificarSistema({ ativo: true, ultimoErro: null, potenciaKwp: 5, uf: 'DF', diasSemGeracao: 0, realUltimos7: esperado7 * 0.65 }).alerta?.texto)
      .toBe('Geração últimos 7 dias 35% ABAIXO do esperado. Pode ser sujeira/sombreamento — agendar limpeza.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npx vitest run tests/monitoramento-classificacao.test.ts`
Expected: PASS (a função já produz esses textos — este guard trava a regra antes do refactor do service).

- [ ] **Step 3: Refatorar `getDetalheSistema`**

Em `src/modules/monitoring/service.ts`, adicionar import no topo (junto aos outros imports `./...js`):

```typescript
import { classificarSistema, esperadoDiaKwh } from './classificacao.js';
```

Substituir o cálculo de `esperadoDia` (hoje `const hsp = ...; const fator = 0.80; const kWp = ...; const esperadoDia = kWp * hsp * fator;`) por:

```typescript
const kWp = Number(s.potencia_kwp ?? 0);
const esperadoDia = esperadoDiaKwh(s.potencia_kwp, s.uf);
```

Substituir o bloco que monta `const alertas: Array<...> = []; if (offlineHa >= 3) {...} else if (...) {...} else if (...) {...}` por:

```typescript
const alertas: Array<{ tipo: string; severidade: 'aviso' | 'urgente' | 'info'; texto: string }> = [];
const cls = classificarSistema({
  ativo: s.ativo,
  ultimoErro: s.ultimo_erro ?? null,
  potenciaKwp: s.potencia_kwp,
  uf: s.uf,
  diasSemGeracao: offlineHa,
  realUltimos7: realUltimos7,
});
if (cls.alerta) alertas.push(cls.alerta);
```

(Manter `offlineHa`, `realUltimos7`, `ratioUltimos7` como já calculados — só o bloco de decisão dos alertas muda.)

- [ ] **Step 4: Rodar typecheck + suite de monitoramento**

Run: `npx tsc --noEmit && npx vitest run tests/monitoramento-classificacao.test.ts`
Expected: tsc EXIT 0; testes PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/service.ts tests/monitoramento-classificacao.test.ts
git commit -m "refactor(monitoring): getDetalheSistema usa classificarSistema (DRY, zero-regressao guard)"
```

---

### Task 4: Estender `listarParaDashboard()` com soma 7 dias (1 query, sem N+1)

**Files:**
- Modify: `src/modules/monitoring/service.ts` (`listarParaDashboard`, ~linhas 695-729)
- Test: `tests/monitoramento-dashboard-7d.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/monitoramento-dashboard-7d.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MonitoringService } from '../src/modules/monitoring/service.js';

function fakeSupabase(sistemas: any[], geracoes: any[]) {
  return {
    getClient() {
      return {
        from(tabela: string) {
          const q: any = {
            _t: tabela,
            select() { return q; },
            eq() { return q; },
            in() { return q; },
            gte() { return q; },
            order() { return q; },
            then(res: any) {
              if (tabela === 'sistemas_clientes') return res({ data: sistemas, error: null });
              return res({ data: geracoes, error: null });
            },
          };
          return q;
        },
      };
    },
  } as any;
}

describe('listarParaDashboard inclui geracao_7d_kwh', () => {
  it('soma janela 7d separada de hoje/mes', async () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const ha5 = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
    const svc = new MonitoringService(fakeSupabase(
      [{ id: 's1', apelido: 'A', marca_inversor: 'deye', ativo: true, potencia_kwp: 10, uf: 'DF' }],
      [
        { sistema_id: 's1', data: hoje, geracao_kwh: 8 },
        { sistema_id: 's1', data: ha5, geracao_kwh: 20 },
      ],
    ));
    const rows = await svc.listarParaDashboard();
    expect(rows[0].geracao_hoje_kwh).toBe(8);
    expect(rows[0].geracao_7d_kwh).toBe(28);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/monitoramento-dashboard-7d.test.ts`
Expected: FAIL — `geracao_7d_kwh` undefined.

- [ ] **Step 3: Implement**

Em `listarParaDashboard()`: trocar o filtro de data pra pegar o menor entre início do mês e (hoje-7d), e somar as duas janelas.

Substituir o trecho:

```typescript
    const hoje = isoDate(new Date());
    const inicioMes = isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const ids = sistemas.map((s) => s.id);
    const { data: geracoes } = await this.supabase.getClient()
      .from('geracao_diaria')
      .select('sistema_id, data, geracao_kwh')
      .in('sistema_id', ids)
      .gte('data', inicioMes);

    const porSistema = new Map<string, { hoje: number | null; mes: number }>();
    for (const sid of ids) porSistema.set(sid, { hoje: null, mes: 0 });

    for (const g of geracoes ?? []) {
      const acc = porSistema.get(g.sistema_id);
      if (!acc) continue;
      const kwh = Number(g.geracao_kwh) || 0;
      acc.mes += kwh;
      if (g.data === hoje) acc.hoje = kwh;
    }

    return sistemas.map((s) => ({
      ...s,
      geracao_hoje_kwh: porSistema.get(s.id)?.hoje ?? null,
      geracao_mes_kwh: porSistema.get(s.id)?.mes ?? 0,
    }));
```

por:

```typescript
    const hoje = isoDate(new Date());
    const inicioMes = isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const ha7 = isoDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const desde = inicioMes < ha7 ? inicioMes : ha7;
    const ids = sistemas.map((s) => s.id);
    const { data: geracoes } = await this.supabase.getClient()
      .from('geracao_diaria')
      .select('sistema_id, data, geracao_kwh')
      .in('sistema_id', ids)
      .gte('data', desde);

    const porSistema = new Map<string, { hoje: number | null; mes: number; ult7: number }>();
    for (const sid of ids) porSistema.set(sid, { hoje: null, mes: 0, ult7: 0 });

    for (const g of geracoes ?? []) {
      const acc = porSistema.get(g.sistema_id);
      if (!acc) continue;
      const kwh = Number(g.geracao_kwh) || 0;
      if (g.data >= inicioMes) acc.mes += kwh;
      if (g.data >= ha7) acc.ult7 += kwh;
      if (g.data === hoje) acc.hoje = kwh;
    }

    return sistemas.map((s) => ({
      ...s,
      geracao_hoje_kwh: porSistema.get(s.id)?.hoje ?? null,
      geracao_mes_kwh: porSistema.get(s.id)?.mes ?? 0,
      geracao_7d_kwh: porSistema.get(s.id)?.ult7 ?? 0,
    }));
```

Atualizar a assinatura de retorno do método `listarParaDashboard` (o `Promise<Array<SistemaCliente & { ... }>>`) pra incluir `geracao_7d_kwh: number`.

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run tests/monitoramento-dashboard-7d.test.ts && npx tsc --noEmit`
Expected: PASS; tsc EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/service.ts tests/monitoramento-dashboard-7d.test.ts
git commit -m "feat(monitoring): listarParaDashboard inclui geracao_7d_kwh (1 query, sem N+1)"
```

---

### Task 5: `excluirSistema()` + rota `POST /monitoramento/:id/excluir`

**Files:**
- Modify: `src/modules/monitoring/service.ts` (novo método), `src/modules/dashboard/router.ts` (nova rota)
- Test: `tests/monitoramento-excluir.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/monitoramento-excluir.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MonitoringService } from '../src/modules/monitoring/service.js';

describe('excluirSistema', () => {
  it('deleta geracao_diaria e depois o sistema; ok=true', async () => {
    const calls: string[] = [];
    const supa = {
      getClient() {
        return {
          from(t: string) {
            return {
              delete() { calls.push(`delete:${t}`); return this; },
              eq() { return Promise.resolve({ error: null }); },
            };
          },
        };
      },
    } as any;
    const svc = new MonitoringService(supa);
    const r = await svc.excluirSistema('sis-1');
    expect(r.ok).toBe(true);
    expect(calls).toEqual(['delete:geracao_diaria', 'delete:sistemas_clientes']);
  });

  it('erro ao deletar sistema -> ok=false com reason', async () => {
    const supa = {
      getClient() {
        return {
          from(t: string) {
            return {
              delete() { return this; },
              eq() {
                return Promise.resolve({ error: t === 'sistemas_clientes' ? { message: 'fk' } : null });
              },
            };
          },
        };
      },
    } as any;
    const svc = new MonitoringService(supa);
    const r = await svc.excluirSistema('sis-1');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('fk');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/monitoramento-excluir.test.ts`
Expected: FAIL — `excluirSistema` não existe.

- [ ] **Step 3: Implement service method**

Adicionar em `MonitoringService` (perto de `atualizarSistema`):

```typescript
  // EXCLUIR de vez (D1a): apaga geração + a linha do sistema. Operação
  // destrutiva — o front exige confirmação dupla. "Pausar" (ativo=false)
  // continua sendo a opção branda/reversível via atualizarSistema.
  async excluirSistema(id: string): Promise<{ ok: boolean; reason?: string }> {
    const c = this.supabase.getClient();
    const delGer = await c.from('geracao_diaria').delete().eq('sistema_id', id);
    if (delGer.error) return { ok: false, reason: `geracao_diaria: ${delGer.error.message}` };
    const delSis = await c.from('sistemas_clientes').delete().eq('id', id);
    if (delSis.error) return { ok: false, reason: `sistemas_clientes: ${delSis.error.message}` };
    return { ok: true };
  }
```

- [ ] **Step 4: Run service test**

Run: `npx vitest run tests/monitoramento-excluir.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the route**

Em `src/modules/dashboard/router.ts`, perto das outras rotas `monitoramento/:id/...`:

```typescript
  router.post('/monitoramento/:id/excluir', async (req: Request, res: Response) => {
    try {
      const r = await monitoringService.excluirSistema(req.params.id);
      if (!r.ok) {
        return res.status(500).send(`<h2>Erro ao excluir</h2><pre>${r.reason ?? ''}</pre><a href="/dashboard/monitoramento">← voltar</a>`);
      }
      return res.redirect('/dashboard/monitoramento');
    } catch (err) {
      console.error('[dashboard/monitoramento/excluir]', err);
      return res.status(500).send(`<h2>Erro ao excluir</h2><pre>${(err as Error).message}</pre>`);
    }
  });
```

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

```bash
git add src/modules/monitoring/service.ts src/modules/dashboard/router.ts tests/monitoramento-excluir.test.ts
git commit -m "feat(monitoring): excluirSistema + rota POST /:id/excluir (D1a, TDD)"
```

---

### Task 6: Helper puro `filtrarOrdenarSistemas()` (busca/filtro/ordenação server-side)

**Files:**
- Create: `src/modules/monitoring/filtro.ts`
- Test: `tests/monitoramento-filtro.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/monitoramento-filtro.test.ts
import { describe, it, expect } from 'vitest';
import { filtrarOrdenarSistemas } from '../src/modules/monitoring/filtro.js';

const rows = [
  { apelido: 'Casa Silva', cidade: 'Brasília', marca_inversor: 'deye',      nivel: 'urgente', geracao_hoje_kwh: 0 },
  { apelido: 'Bar Rota',   cidade: 'Correntina', marca_inversor: 'solaredge', nivel: 'ok',     geracao_hoje_kwh: 30 },
  { apelido: 'Ana C',      cidade: 'Brasília', marca_inversor: 'deye',      nivel: 'aviso',   geracao_hoje_kwh: 5 },
] as any[];

describe('filtrarOrdenarSistemas', () => {
  it('busca por nome/cidade (case-insensitive)', () => {
    expect(filtrarOrdenarSistemas(rows, { q: 'silva' }).map(r => r.apelido)).toEqual(['Casa Silva']);
    expect(filtrarOrdenarSistemas(rows, { q: 'brasil' }).map(r => r.apelido).sort()).toEqual(['Ana C', 'Casa Silva']);
  });
  it('filtra por marca e por status(nivel)', () => {
    expect(filtrarOrdenarSistemas(rows, { marca: 'deye' }).length).toBe(2);
    expect(filtrarOrdenarSistemas(rows, { status: 'urgente' }).map(r => r.apelido)).toEqual(['Casa Silva']);
  });
  it('ordena por severidade (urgente>aviso>info>ok) por padrão', () => {
    expect(filtrarOrdenarSistemas(rows, {}).map(r => r.nivel)).toEqual(['urgente', 'aviso', 'ok']);
  });
  it('ord=geracao_desc ordena por geração de hoje desc', () => {
    expect(filtrarOrdenarSistemas(rows, { ord: 'geracao_desc' }).map(r => r.geracao_hoje_kwh)).toEqual([30, 5, 0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/monitoramento-filtro.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implement**

```typescript
// src/modules/monitoring/filtro.ts
// Busca/filtro/ordenação server-side da lista de usinas. Função PURA.
import type { NivelSistema } from './classificacao.js';

export interface FiltroQuery {
  q?: string;
  marca?: string;
  cidade?: string;
  status?: string; // 'urgente'|'aviso'|'info'|'ok'
  ord?: string;    // 'severidade'(default) | 'geracao_desc' | 'nome'
}

interface LinhaFiltravel {
  apelido: string;
  cidade: string | null;
  marca_inversor: string;
  nivel: NivelSistema;
  geracao_hoje_kwh: number | null;
}

const PESO: Record<string, number> = { urgente: 0, aviso: 1, info: 2, ok: 3 };

export function filtrarOrdenarSistemas<T extends LinhaFiltravel>(rows: T[], qf: FiltroQuery): T[] {
  let out = rows.slice();
  const q = (qf.q ?? '').trim().toLowerCase();
  if (q) {
    out = out.filter((r) =>
      r.apelido.toLowerCase().includes(q) || (r.cidade ?? '').toLowerCase().includes(q));
  }
  if (qf.marca) out = out.filter((r) => r.marca_inversor === qf.marca);
  if (qf.cidade) out = out.filter((r) => (r.cidade ?? '') === qf.cidade);
  if (qf.status) out = out.filter((r) => r.nivel === qf.status);

  const ord = qf.ord ?? 'severidade';
  if (ord === 'geracao_desc') {
    out.sort((a, b) => (b.geracao_hoje_kwh ?? 0) - (a.geracao_hoje_kwh ?? 0));
  } else if (ord === 'nome') {
    out.sort((a, b) => a.apelido.localeCompare(b.apelido, 'pt-BR'));
  } else {
    out.sort((a, b) => (PESO[a.nivel] ?? 9) - (PESO[b.nivel] ?? 9)
      || a.apelido.localeCompare(b.apelido, 'pt-BR'));
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/monitoramento-filtro.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/filtro.ts tests/monitoramento-filtro.test.ts
git commit -m "feat(monitoring): filtrarOrdenarSistemas — busca/filtro/ordenacao pura (TDD)"
```

---

### Task 7: Reescrever `renderMonitoramentoPage` (Painel de Triagem) + fiar querystring no router

**Files:**
- Modify: `src/modules/dashboard/views.ts` (`renderMonitoramentoPage`, ~linhas 517-635; tipo `SistemaMonitorRow`)
- Modify: `src/modules/dashboard/router.ts` (rota GET `/monitoramento` ~linhas 530-552: ler querystring, mapear nivel/garantia)
- Test: `tests/monitoramento-render.test.ts` (smoke)

- [ ] **Step 1: Write the failing smoke test**

```typescript
// tests/monitoramento-render.test.ts
import { describe, it, expect } from 'vitest';
import { renderMonitoramentoPage } from '../src/modules/dashboard/views.js';

const rows = [
  { id: '1', apelido: 'Casa Silva', cidade: 'Brasília', uf: 'DF', marca_inversor: 'deye',
    potencia_kwp: 10, geracao_hoje_kwh: 0, geracao_mes_kwh: 0, geracao_7d_kwh: 0,
    ativo: true, ultimo_erro: null, ultima_sincronizacao: null,
    nivel: 'urgente', alertaTexto: 'Sem geração há 5 dias. Verificar inversor / conexão WiFi.',
    garantiaIdade: '1 ano 2 meses', garantiaEcosun: 'encerrada há 2 meses' },
  { id: '2', apelido: 'Bar Rota', cidade: 'Correntina', uf: 'BA', marca_inversor: 'solaredge',
    potencia_kwp: 7, geracao_hoje_kwh: 25, geracao_mes_kwh: 400, geracao_7d_kwh: 150,
    ativo: true, ultimo_erro: null, ultima_sincronizacao: new Date().toISOString(),
    nivel: 'ok', alertaTexto: null, garantiaIdade: '3 meses', garantiaEcosun: 'vigente (9 meses)' },
] as any[];

describe('renderMonitoramentoPage (smoke)', () => {
  it('renderiza bloco de ação só com o urgente, lista com todos, e tema escuro', () => {
    const html = renderMonitoramentoPage(rows, {});
    expect(html).toContain('Precisa de ação');
    expect(html).toContain('Casa Silva');         // urgente -> no bloco
    expect(html).toContain('Bar Rota');            // ok -> só na lista
    expect(html).toContain('Saúde da frota');
    expect(html).toContain('/dashboard/monitoramento/1/excluir'); // botão excluir
    expect(html).toContain('1 ano 2 meses');       // cronômetro garantia
    expect(html).toContain('bg-slate-900');        // marcador de tema escuro
  });
  it('lista vazia -> estado vazio', () => {
    expect(renderMonitoramentoPage([], {})).toContain('Nenhum sistema');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/monitoramento-render.test.ts`
Expected: FAIL — assinatura atual é `renderMonitoramentoPage(rows)` sem 2º arg e sem os campos novos.

- [ ] **Step 3: Substituir `renderMonitoramentoPage` em `views.ts`**

Atualizar o tipo `SistemaMonitorRow` (onde declarado em views.ts) pra incluir: `geracao_7d_kwh: number; nivel: 'urgente'|'aviso'|'info'|'ok'; alertaTexto: string | null; garantiaIdade: string; garantiaEcosun: string;`.

Substituir TODA a função `export function renderMonitoramentoPage(...) { ... }` por:

```typescript
export function renderMonitoramentoPage(
  rows: SistemaMonitorRow[],
  q: { q?: string; marca?: string; cidade?: string; status?: string; ord?: string },
): string {
  const ativos = rows.filter((r) => r.ativo);
  const totalKwp = ativos.reduce((s, r) => s + (r.potencia_kwp ?? 0), 0);
  const totalHoje = rows.reduce((s, r) => s + (r.geracao_hoje_kwh ?? 0), 0);
  const totalMes = rows.reduce((s, r) => s + r.geracao_mes_kwh, 0);
  const okCount = ativos.filter((r) => r.nivel === 'ok' || r.nivel === 'info').length;
  const marcas = new Set(rows.map((r) => r.marca_inversor)).size;
  const problemas = rows.filter((r) => r.nivel === 'urgente' || r.nivel === 'aviso');

  const kpi = (t: string, v: string, sub: string, cor: string) => `
    <div class="bg-slate-800/60 backdrop-blur rounded-xl border border-slate-700 p-5 shadow-lg">
      <div class="text-xs uppercase tracking-wider text-slate-400 font-semibold">${escapeHtml(t)}</div>
      <div class="text-3xl font-bold ${cor} mt-2">${escapeHtml(v)}</div>
      <div class="text-xs text-slate-500 mt-1">${escapeHtml(sub)}</div>
    </div>`;

  const saudeCor = okCount === ativos.length ? 'text-emerald-400'
    : problemas.some((p) => p.nivel === 'urgente') ? 'text-rose-400' : 'text-amber-400';

  const cardProblema = (r: SistemaMonitorRow) => {
    const cor = r.nivel === 'urgente' ? 'border-rose-500/60 bg-rose-500/10' : 'border-amber-500/60 bg-amber-500/10';
    return `
    <div class="rounded-xl border ${cor} p-4 flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <a href="/dashboard/monitoramento/${escapeHtml(r.id)}" class="font-semibold text-sky-300 hover:underline">${escapeHtml(r.apelido)}</a>
        ${marcaBadge(r.marca_inversor)}
      </div>
      <div class="text-xs text-slate-400">${escapeHtml([r.cidade, r.uf].filter(Boolean).join('/') || '—')}</div>
      <div class="text-sm ${r.nivel === 'urgente' ? 'text-rose-300' : 'text-amber-300'}">${escapeHtml(r.alertaTexto ?? '')}</div>
      <div class="text-xs text-slate-500">⏱ ${escapeHtml(r.garantiaIdade)} · garantia EcoSun: ${escapeHtml(r.garantiaEcosun)}</div>
      <div class="flex flex-wrap gap-2 mt-1">
        <form action="/dashboard/monitoramento/${escapeHtml(r.id)}/sync" method="post"><button class="px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold">🔄 Sincronizar</button></form>
        <a href="/dashboard/monitoramento/${escapeHtml(r.id)}" class="px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-semibold">🔎 Detalhe</a>
        <a href="/dashboard/monitoramento/${escapeHtml(r.id)}/relatorio" class="px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold">📄 Gerar relatório</a>
        <form action="/dashboard/monitoramento/${escapeHtml(r.id)}/excluir" method="post" onsubmit="return confirm('EXCLUIR a usina ${escapeHtml(r.apelido)} de vez? Isso apaga todo o histórico de geração. Esta ação não tem volta.') && confirm('Confirma de novo: excluir ${escapeHtml(r.apelido)} permanentemente?')"><button class="px-3 py-1.5 rounded-md bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold">🗑 Excluir</button></form>
      </div>
    </div>`;
  };

  const sincOk = (r: SistemaMonitorRow) => r.ultima_sincronizacao
    && (Date.now() - new Date(r.ultima_sincronizacao).getTime() < 36 * 60 * 60 * 1000);
  const statusPill = (r: SistemaMonitorRow) => !r.ativo
    ? '<span class="px-2 py-1 rounded text-xs bg-slate-700 text-slate-400">⏸ Pausado</span>'
    : r.nivel === 'urgente'
      ? '<span class="px-2 py-1 rounded text-xs bg-rose-500/20 text-rose-300">⚠️ Urgente</span>'
      : r.nivel === 'aviso'
        ? '<span class="px-2 py-1 rounded text-xs bg-amber-500/20 text-amber-300">⚠️ Atenção</span>'
        : r.nivel === 'info'
          ? '<span class="px-2 py-1 rounded text-xs bg-sky-500/20 text-sky-300">🌟 Acima</span>'
          : sincOk(r)
            ? '<span class="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-300">✅ OK</span>'
            : '<span class="px-2 py-1 rounded text-xs bg-amber-500/20 text-amber-300">⏳ Aguardando</span>';

  const linha = (r: SistemaMonitorRow) => `
    <tr class="hover:bg-slate-800/50 cursor-pointer" onclick="window.location='/dashboard/monitoramento/${escapeHtml(r.id)}'">
      <td class="px-4 py-3 text-sm">
        <a href="/dashboard/monitoramento/${escapeHtml(r.id)}" class="font-medium text-sky-300 hover:underline">${escapeHtml(r.apelido)}</a>
        <div class="text-xs text-slate-500">${escapeHtml([r.cidade, r.uf].filter(Boolean).join('/') || '—')}</div>
      </td>
      <td class="px-4 py-3 text-sm">${marcaBadge(r.marca_inversor)}</td>
      <td class="px-4 py-3 text-sm text-slate-300">${r.potencia_kwp ? `${r.potencia_kwp.toFixed(2)} kWp` : '—'}</td>
      <td class="px-4 py-3 text-sm text-amber-300 font-bold">${r.geracao_hoje_kwh !== null ? `${r.geracao_hoje_kwh.toFixed(1)} kWh` : '—'}</td>
      <td class="px-4 py-3 text-sm text-emerald-300">${r.geracao_mes_kwh > 0 ? `${r.geracao_mes_kwh.toFixed(0)} kWh` : '—'}</td>
      <td class="px-4 py-3 text-sm">${statusPill(r)}</td>
      <td class="px-4 py-3 text-xs text-slate-400">⏱ ${escapeHtml(r.garantiaIdade)}</td>
      <td class="px-4 py-3 text-right whitespace-nowrap" onclick="event.stopPropagation()">
        <form action="/dashboard/monitoramento/${escapeHtml(r.id)}/excluir" method="post" class="inline" onsubmit="return confirm('EXCLUIR ${escapeHtml(r.apelido)} de vez? Apaga todo o histórico. Sem volta.') && confirm('Confirma de novo: excluir ${escapeHtml(r.apelido)} permanentemente?')">
          <button class="px-2.5 py-1.5 rounded-md bg-rose-700 hover:bg-rose-800 text-white text-xs">🗑</button>
        </form>
      </td>
    </tr>`;

  const opt = (v: string, label: string, sel?: string) =>
    `<option value="${escapeHtml(v)}" ${sel === v ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  const marcasUnicas = [...new Set(rows.map((r) => r.marca_inversor))].sort();
  const cidadesUnicas = [...new Set(rows.map((r) => r.cidade).filter(Boolean) as string[])].sort();

  const body = `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-100">⚡ Painel de Triagem — Usinas</h1>
      <p class="text-slate-400 text-sm">Primeiro o que precisa de ação. Depois a carteira inteira, filtrável.</p>
    </div>

    <section class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
      ${kpi('Usinas ativas', String(ativos.length), `${totalKwp.toFixed(1)} kWp total`, 'text-amber-400')}
      ${kpi('Geração hoje', `${totalHoje.toFixed(1)} kWh`, 'somatório', 'text-sky-300')}
      ${kpi('Geração mês', `${totalMes.toFixed(0)} kWh`, 'mês corrente', 'text-emerald-300')}
      ${kpi('Saúde da frota', `${okCount}/${ativos.length}`, 'usinas OK', saudeCor)}
      ${kpi('Marcas', String(marcas), 'integradas', 'text-violet-300')}
    </section>

    <section class="mb-8">
      <h2 class="text-lg font-bold text-slate-200 mb-3">⚠️ Precisa de ação ${problemas.length ? `<span class="text-rose-400">(${problemas.length})</span>` : ''}</h2>
      ${problemas.length === 0
        ? '<div class="rounded-xl border border-emerald-600/40 bg-emerald-500/10 p-6 text-emerald-300 text-center font-medium">✅ Tudo certo — nenhuma usina precisando de ação agora.</div>'
        : `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${problemas.map(cardProblema).join('')}</div>`}
    </section>

    <form method="get" action="/dashboard/monitoramento" class="mb-4 flex flex-wrap gap-2 items-center">
      <input name="q" value="${escapeHtml(q.q ?? '')}" placeholder="🔎 cliente ou cidade" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">
      <select name="marca" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">${opt('', 'Todas as marcas', q.marca)}${marcasUnicas.map((m) => opt(m, m, q.marca)).join('')}</select>
      <select name="cidade" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">${opt('', 'Todas as cidades', q.cidade)}${cidadesUnicas.map((c) => opt(c, c, q.cidade)).join('')}</select>
      <select name="status" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">${opt('', 'Todos os status', q.status)}${['urgente', 'aviso', 'info', 'ok'].map((s) => opt(s, s, q.status)).join('')}</select>
      <select name="ord" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">${opt('severidade', 'Ordenar: severidade', q.ord)}${opt('geracao_desc', 'Ordenar: geração ↓', q.ord)}${opt('nome', 'Ordenar: nome', q.ord)}</select>
      <button class="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold">Filtrar</button>
      <a href="/dashboard/monitoramento" class="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">Limpar</a>
      <span class="ml-auto flex gap-2">
        <a href="/dashboard/monitoramento/importar" class="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold">📥 Importar</a>
        ${rows.length ? `<form action="/dashboard/monitoramento/sync-todos" method="post"><button class="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold">🔄 Atualizar todas</button></form>` : ''}
      </span>
    </form>

    ${rows.length === 0 ? `
    <section class="bg-slate-800/60 rounded-xl border border-slate-700 p-8 text-center">
      <div class="text-5xl mb-3">⚡</div>
      <div class="text-slate-200 font-medium mb-2">Nenhum sistema cadastrado ainda.</div>
      <a href="/dashboard/monitoramento/importar" class="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold">📥 Importar agora</a>
    </section>` : `
    <section class="bg-slate-800/60 rounded-xl border border-slate-700 overflow-x-auto">
      <table class="w-full min-w-[820px]">
        <thead class="bg-slate-900/80 border-b border-slate-700">
          <tr class="text-left text-xs uppercase tracking-wider text-slate-400">
            <th class="px-4 py-3 font-semibold">Sistema</th><th class="px-4 py-3 font-semibold">Marca</th>
            <th class="px-4 py-3 font-semibold">Potência</th><th class="px-4 py-3 font-semibold">Hoje</th>
            <th class="px-4 py-3 font-semibold">Mês</th><th class="px-4 py-3 font-semibold">Status</th>
            <th class="px-4 py-3 font-semibold">Idade</th><th class="px-4 py-3 font-semibold text-right">Excluir</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800">${rows.map(linha).join('')}</tbody>
      </table>
    </section>
    <div class="mt-4 text-xs text-slate-500 text-center">💡 Sincronização automática a cada <strong>15 min</strong>. Página atualiza sozinha a cada <strong>30s</strong>.</div>`}
  `;
  const scripts = `<script>setTimeout(() => location.reload(), 30000);</script>`;
  return renderLayout({ active: 'monitoramento', title: 'Monitoramento', body, scripts });
}
```

- [ ] **Step 4: Fiar a querystring + nivel/garantia no router**

Em `src/modules/dashboard/router.ts`, na rota `GET '/monitoramento'`, adicionar imports no topo do arquivo (junto aos demais):

```typescript
import { classificarSistema } from '../monitoring/classificacao.js';
import { garantiaInfo } from '../monitoring/garantia.js';
import { filtrarOrdenarSistemas } from '../monitoring/filtro.js';
```

Substituir o corpo da rota `GET '/monitoramento'` por:

```typescript
  router.get('/monitoramento', async (req: Request, res: Response) => {
    try {
      const sistemas = await monitoringService.listarParaDashboard();
      const hoje = new Date();
      const enriched = sistemas.map((s) => {
        const cls = classificarSistema({
          ativo: s.ativo,
          ultimoErro: s.ultimo_erro ?? null,
          potenciaKwp: s.potencia_kwp,
          uf: s.uf,
          diasSemGeracao: (s.geracao_7d_kwh ?? 0) === 0 && s.ativo ? 7 : 0,
          realUltimos7: s.geracao_7d_kwh ?? 0,
        });
        const g = garantiaInfo(
          { data_instalacao: s.data_instalacao, marca_inversor: s.marca_inversor, painel_marca: s.painel_marca ?? null },
          hoje,
        );
        const ecosunTxt = g.ecosun.status === 'vigente' ? `vigente (${g.ecosun.mesesRestantes} meses)`
          : g.ecosun.status === 'encerrada' ? `encerrada há ${g.ecosun.mesesDesdeFim} meses` : 'indefinida';
        return {
          ...s,
          nivel: cls.nivel,
          alertaTexto: cls.alerta?.texto ?? null,
          garantiaIdade: g.idadeTexto,
          garantiaEcosun: ecosunTxt,
        };
      });
      const qf = {
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        marca: typeof req.query.marca === 'string' ? req.query.marca : undefined,
        cidade: typeof req.query.cidade === 'string' ? req.query.cidade : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        ord: typeof req.query.ord === 'string' ? req.query.ord : undefined,
      };
      const rows = filtrarOrdenarSistemas(enriched as any, qf);
      res.send(renderMonitoramentoPage(rows as any, qf));
    } catch (err) {
      console.error('[dashboard/monitoramento]', err);
      res.status(500).send(`<h2>Erro ao listar monitoramento</h2><pre>${(err as Error).message}</pre>`);
    }
  });
```

- [ ] **Step 5: Run smoke test + typecheck**

Run: `npx vitest run tests/monitoramento-render.test.ts && npx tsc --noEmit`
Expected: PASS; tsc EXIT 0.

- [ ] **Step 6: Commit**

```bash
git add src/modules/dashboard/views.ts src/modules/dashboard/router.ts tests/monitoramento-render.test.ts
git commit -m "feat(dashboard): Painel de Triagem — radar + lista filtravel + cronometro (S1)"
```

---

### Task 8: Tema escuro no layout compartilhado (`renderLayout`)

**Files:**
- Modify: `src/modules/dashboard/views.ts` (`renderLayout` — wrapper de body/bg)
- Test: `tests/monitoramento-render.test.ts` (já cobre `bg-slate-900` no smoke; adicionar checagem no layout)

- [ ] **Step 1: Write the failing test (anexar)**

```typescript
// anexar em tests/monitoramento-render.test.ts
import { renderLayout } from '../src/modules/dashboard/views.js';
describe('renderLayout tema escuro', () => {
  it('aplica fundo escuro no body (não branco)', () => {
    const html = renderLayout({ active: 'home', title: 'X', body: '<p>oi</p>' });
    expect(html).toMatch(/bg-slate-9\d0|bg-\[#0|from-slate-900/);
    expect(html).toContain('<p>oi</p>');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/monitoramento-render.test.ts`
Expected: FAIL no novo teste (layout hoje é claro).

- [ ] **Step 3: Implement — escurecer `renderLayout`**

Em `renderLayout`, localizar o elemento raiz que hoje usa fundo claro (ex.: `<body class="bg-slate-50 ...">` ou um wrapper `<div class="min-h-screen bg-slate-50">`). Trocar a classe de fundo clara por tema escuro estilo cockpit:

- `bg-slate-50` → `bg-slate-950`
- adicionar no mesmo elemento: `text-slate-100` e o glow sutil via classe utilitária inline: `style="background:radial-gradient(1200px 600px at 50% -10%, rgba(56,189,248,0.08), transparent), #020617;"`
- nav/header claros → `bg-slate-900/80 border-slate-800` (ajuste mínimo só o suficiente pra contraste; ajuste fino das demais telas é follow-up declarado).

(Mostrar exatamente: substituir a string de classe do container raiz por `class="min-h-screen bg-slate-950 text-slate-100"` e injetar o `style` do gradiente nesse mesmo elemento.)

- [ ] **Step 4: Run test + full typecheck**

Run: `npx vitest run tests/monitoramento-render.test.ts && npx tsc --noEmit`
Expected: PASS; tsc EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/views.ts tests/monitoramento-render.test.ts
git commit -m "feat(dashboard): tema escuro futurista no layout (estilo cockpit) — S1"
```

---

### Task 9: Verificação final (suite completa + typecheck + push)

**Files:** nenhum (verificação)

- [ ] **Step 1: Suite completa**

Run: `npx vitest run`
Expected: todos PASS exceto as 2 falhas PRÉ-EXISTENTES de `tests/cases-fetcher.test.ts` (não relacionadas — falham isoladas sem este código; não atribuir a este trabalho). Nenhuma falha nova.

- [ ] **Step 2: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 3: Code review (regra Junior: review antes de finalizar lógica nova)**

Dispatch superpowers:code-reviewer no diff `4d32b45..HEAD` (ou desde o início do S1). Aplicar Critical/Important; registrar deferidos.

- [ ] **Step 4: Push**

```bash
git push
```

Expected: `main` atualizado no GitHub. (Easypanel deploya do GitHub — Junior clica Implantar quando quiser ver em prod.)

- [ ] **Step 5: Reportar**

Resumo factual: o que entrou, suite verde (com a ressalva cases-fetcher pré-existente), o que ficou de follow-up (tema fino das outras telas, S3 relatório, S4 Eva).

---

## Self-Review (checklist do autor)

**1. Spec coverage:**
- Radar/classificação → Task 2 + 3 ✓
- Cronômetro garantia (S2) → Task 1 ✓
- Sem N+1 / 7d → Task 4 ✓
- Excluir D1a (hard delete + confirm duplo) → Task 5 (service) + Task 7 (confirm duplo no front) ✓
- Busca/filtro/ordenação → Task 6 + fiação Task 7 ✓
- KPIs + bloco ação + lista compacta + selo "acima" (D3a) + gancho relatório (D2a) → Task 7 ✓
- Tema escuro (fundo a, escopo a) → Task 8 ✓
- Zero-regressão `getDetalheSistema` → Task 3 guard ✓
- Casos de borda (sem data_instalacao, sem equipamento, marca futura, lista vazia, filtro vazio) → cobertos em garantiaInfo (Task 1) / classificarSistema inativo (Task 2) / render estado vazio (Task 7) ✓

**2. Placeholder scan:** sem TBD/TODO; código completo em cada step; Task 8 step 3 descreve a substituição exata de classe (não é placeholder — é instrução concreta sobre um elemento que varia conforme o `renderLayout` atual, com as classes-alvo dadas). ✓

**3. Type consistency:** `geracao_7d_kwh` (Task 4) consumido em Task 7; `NivelSistema`/`classificarSistema`/`esperadoDiaKwh` (Task 2) reusados em Task 3 e Task 7; `garantiaInfo`/`GarantiaResult` (Task 1) consumidos no router (Task 7); `filtrarOrdenarSistemas` (Task 6) consome `nivel` adicionado em Task 7. Assinatura `renderMonitoramentoPage(rows, q)` consistente entre Task 7 (impl) e o smoke test. ✓

Observação de risco controlado: Task 8 step 3 depende do markup atual de `renderLayout` (não lido linha-a-linha aqui) — instrução é "trocar a classe de fundo clara do container raiz pelas classes-alvo dadas + injetar o gradiente"; o executor confirma o seletor real ao abrir o arquivo. Aceito (mudança de 1 classe, com teste guarda).
