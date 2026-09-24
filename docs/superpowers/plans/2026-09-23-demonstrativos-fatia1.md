# Demonstrativos GD — Fatia 1 (tela, PDF manual, digitar, travas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela `/dashboard/demonstrativos` (lista + cliente + conferência) com envio manual de PDF, digitação do demonstrativo e da geração, travas de exatidão, e a Eva deixando de avisar de novo um mês que chegou igual.

**Architecture:** Três módulos **puros** (`gd-validacao.ts`, `gd-formulario.ts`, `demonstrativos-tela.ts`) carregam as regras e são testados sem banco. Um repositório (`demonstrativos-tela-repo.ts`) faz as leituras/gravações sempre filtrando `company_id`. As telas (`demonstrativos-views.ts`) só desenham. O leitor do PDF é o que já existe (`demonstrativo-parser.ts`); o registro gravado é montado por uma função única (`montarRegistro`) usada pelo e-mail, pelo PDF manual e pela digitação.

**Tech Stack:** TypeScript (ESM), Express 5, multer (memória), Supabase JS, `unpdf`, vitest, Tailwind CDN + Chart.js CDN (padrão do dashboard).

**Spec:** `docs/superpowers/specs/2026-09-23-demonstrativos-tela-relatorio-design.md` (fatias 2 e 3 — relatório PDF e OCR — ficam FORA deste plano).

**Regras do projeto:** `git add` só dos arquivos da tarefa (nunca `git add .`); não fazer `push` sem o Junior pedir; migration de produção é aplicada pelo Junior no SQL Editor do projeto **kupnsoyymulbdzakqlqc**; `npx tsc --noEmit` e `npx vitest run` verdes antes de dizer pronto.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/131_demonstrativos_tela.sql` | Criar | colunas `origem`, `assinatura`, `conferido_*` em `demonstrativos_gd`; tabela `geracao_mensal_gd` com RLS |
| `src/modules/gd/gd-validacao.ts` | Criar | **Puro.** Travas → estado 🟢🟡🔴⚪ + motivos |
| `src/modules/gd/gd-formulario.ts` | Criar | **Puro.** Número digitado → número; campos digitados → `DemonstrativoGd` |
| `src/modules/gd/demonstrativo-ingestao.ts` | Modificar | `montarRegistro`, `assinaturaDemonstrativo`, status `repetido`, `origem` |
| `src/modules/gd/demonstrativo-repo.ts` | Modificar | `assinaturaGravada()` |
| `src/modules/gd/demonstrativos-tela-repo.ts` | Criar | leituras/gravações da tela (lista, histórico, geração manual, ligar cliente, gravar manual) |
| `src/modules/gd/demonstrativos-tela.ts` | Criar | **Puro.** Linha do banco + validação → item da lista; alerta de vencimento; filtro; compensado do mês |
| `src/modules/dashboard/demonstrativos-views.ts` | Criar | telas A (lista), B (cliente), C (conferência do PDF), digitar |
| `src/modules/dashboard/router.ts` | Modificar | rotas `/demonstrativos*` |
| `src/modules/dashboard/views.ts` | Modificar | item de menu + chave `demonstrativos` no `LayoutInput` |
| `tests/gd-validacao.test.ts`, `tests/gd-formulario.test.ts`, `tests/gd-demonstrativos-tela.test.ts`, `tests/gd-demonstrativos-tela-repo.test.ts`, `tests/gd-demonstrativos-views.test.ts` | Criar | testes |
| `tests/gd-demonstrativo-ingestao.test.ts`, `tests/gd-demonstrativo-repo.test.ts` | Modificar | casos novos |

---

### Task 1: Migration 131

**Files:**
- Create: `supabase/migrations/131_demonstrativos_tela.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- 131_demonstrativos_tela.sql
--
-- TELA DE DEMONSTRATIVOS (Junior 23/09/2026) — fatia 1.
-- Ver docs/superpowers/specs/2026-09-23-demonstrativos-tela-relatorio-design.md.
--
-- 1) demonstrativos_gd ganha:
--    origem      — de onde veio: e-mail da concessionária, PDF enviado na tela ou digitado.
--    assinatura  — resumo dos números do mês; e-mail repetido com os MESMOS números
--                  não gera aviso novo no WhatsApp.
--    conferido_* — quem confirmou na tela (PDF manual/digitado) e quando.
-- 2) geracao_mensal_gd — geração do mês informada à mão (digitada; na fatia 3,
--    também por print). A geração da API NÃO é copiada pra cá: é lida da
--    geracao_diaria na hora, pra nunca ficar velha.

alter table demonstrativos_gd
  add column if not exists origem text not null default 'email',
  add column if not exists assinatura text,
  add column if not exists conferido_por uuid,
  add column if not exists conferido_em timestamptz;

do $$ begin
  alter table demonstrativos_gd
    add constraint demonstrativos_gd_origem_valida check (origem in ('email', 'pdf_manual', 'digitado'));
exception when duplicate_object then null; end $$;

create table if not exists geracao_mensal_gd (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null default '00000000-0000-0000-0000-000000000001',
  lead_id        uuid references leads(id) on delete set null,
  instalacao     text not null,
  referencia     date not null,                       -- 1º dia do mês
  kwh            numeric(12,2) not null check (kwh >= 0),
  origem         text not null check (origem in ('print', 'digitado')),
  fonte          jsonb not null default '{}'::jsonb,  -- arquivo / modelo de tela / observação
  conferido_por  uuid,
  conferido_em   timestamptz not null default now(),
  constraint geracao_mensal_gd_unico unique (company_id, instalacao, referencia)
);

create index if not exists geracao_mensal_gd_empresa_inst
  on geracao_mensal_gd (company_id, instalacao, referencia desc);

-- ISOLAMENTO POR EMPRESA — mesmo padrão da 123/130.
ALTER TABLE public.geracao_mensal_gd ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geracao_mensal_gd FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.geracao_mensal_gd;
CREATE POLICY company_isolation ON public.geracao_mensal_gd
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Conferir se os testes de guarda de migration passam**

Run: `npx vitest run tests/ -t "migration"`
Expected: PASS (as guardas ≥080 exigem `company_id` + FORCE RLS + policy — todas presentes).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/131_demonstrativos_tela.sql
git commit -m "feat(gd): migration 131 — origem/assinatura do demonstrativo e geracao_mensal_gd"
```

---

### Task 2: Travas de exatidão (`gd-validacao.ts`)

**Files:**
- Create: `src/modules/gd/gd-validacao.ts`
- Test: `tests/gd-validacao.test.ts`

- [ ] **Step 1: Escrever os testes**

```ts
import { describe, it, expect } from 'vitest';
import { validarMes, esperadoMes, diasNoMes, type EntradaValidacao } from '../src/modules/gd/gd-validacao.js';

// 5 kWp no DF: esperadoDiaKwh = 5 × HSP_DF × 0,8. Os testes usam esperadoMes()
// pra não depender do valor da tabela de HSP.
const base: EntradaValidacao = {
  leadId: 'L1',
  referencia: '2026-08-01',
  injetadoKwh: 200,
  inconsistenciasLeitura: [],
  geracaoManualKwh: null,
  geracaoApiKwh: null,
  potenciaKwp: 5,
  uf: 'DF',
};
const plausivel = () => Math.round(esperadoMes(5, 'DF', '2026-08-01')!);

describe('diasNoMes / esperadoMes', () => {
  it('conta os dias do mês', () => {
    expect(diasNoMes('2026-02-01')).toBe(28);
    expect(diasNoMes('2026-08-01')).toBe(31);
  });
  it('sem kWp não há esperado', () => {
    expect(esperadoMes(null, 'DF', '2026-08-01')).toBeNull();
    expect(esperadoMes(0, 'DF', '2026-08-01')).toBeNull();
  });
});

describe('validarMes', () => {
  it('tudo certo com geração da API → pronto', () => {
    const r = validarMes({ ...base, geracaoApiKwh: plausivel() });
    expect(r.estado).toBe('pronto');
    expect(r.origemGeracao).toBe('api');
    expect(r.bloqueios).toEqual([]);
  });

  it('sem geração → falta_dado', () => {
    const r = validarMes(base);
    expect(r.estado).toBe('falta_dado');
    expect(r.pendencias.join(' ')).toMatch(/falta a geração/);
  });

  it('sem cliente ligado → sem_cliente', () => {
    const r = validarMes({ ...base, leadId: null, geracaoManualKwh: plausivel() });
    expect(r.estado).toBe('sem_cliente');
  });

  it('geração menor que o injetado → inconsistente', () => {
    const r = validarMes({ ...base, injetadoKwh: 900, geracaoManualKwh: 500, potenciaKwp: null });
    expect(r.estado).toBe('inconsistente');
    expect(r.bloqueios[0]).toMatch(/menor que o injetado/);
  });

  it('geração muito acima do esperado (vírgula lida errado) → inconsistente', () => {
    const r = validarMes({ ...base, geracaoManualKwh: plausivel() * 10 });
    expect(r.estado).toBe('inconsistente');
    expect(r.bloqueios.join(' ')).toMatch(/fora do esperado/);
  });

  it('sem kWp: não bloqueia, só avisa', () => {
    const r = validarMes({ ...base, potenciaKwp: null, geracaoManualKwh: 700 });
    expect(r.estado).toBe('pronto');
    expect(r.avisos.join(' ')).toMatch(/sem kWp/);
  });

  it('manual e API diferentes em mais de 3% → inconsistente; manual tem precedência', () => {
    const p = plausivel();
    const r = validarMes({ ...base, geracaoManualKwh: p, geracaoApiKwh: p * 0.9 });
    expect(r.estado).toBe('inconsistente');
    expect(r.origemGeracao).toBe('manual');
    expect(r.geracaoKwh).toBe(p);
    expect(r.bloqueios.join(' ')).toMatch(/difere/);
  });

  it('manual e API iguais dentro de 3% → pronto', () => {
    const p = plausivel();
    expect(validarMes({ ...base, geracaoManualKwh: p, geracaoApiKwh: p * 1.01 }).estado).toBe('pronto');
  });

  it('inconsistência de leitura do PDF bloqueia; "remetente não verificado" só avisa', () => {
    const p = plausivel();
    const a = validarMes({ ...base, geracaoApiKwh: p, inconsistenciasLeitura: ['saldo acumulado não fecha'] });
    expect(a.estado).toBe('inconsistente');
    const b = validarMes({
      ...base, geracaoApiKwh: p,
      inconsistenciasLeitura: ['remetente não verificado (sem assinatura DKIM da Neoenergia que confira)'],
    });
    expect(b.estado).toBe('pronto');
    expect(b.avisos.join(' ')).toMatch(/remetente não verificado/);
  });

  it('bloqueio vence sem_cliente e falta_dado', () => {
    const r = validarMes({ ...base, leadId: null, inconsistenciasLeitura: ['x'] });
    expect(r.estado).toBe('inconsistente');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/gd-validacao.test.ts`
Expected: FAIL — `Cannot find module '../src/modules/gd/gd-validacao.js'`.

- [ ] **Step 3: Implementar**

```ts
// Travas de exatidão do demonstrativo + geração do mês (Junior 23/09/2026:
// "tem que ler exato pra gerar um PDF realista"). Função PURA: recebe os
// números já lidos e diz se o mês está pronto pro relatório, falta dado, está
// inconsistente ou sem cliente. O PDF (fatia 2) só sai com estado 'pronto'.
// Ver docs/superpowers/specs/2026-09-23-demonstrativos-tela-relatorio-design.md.

import { esperadoDiaKwh } from '../monitoring/classificacao.js';

export type EstadoGd = 'pronto' | 'falta_dado' | 'inconsistente' | 'sem_cliente';

export interface EntradaValidacao {
  leadId: string | null;
  referencia: string; // YYYY-MM-01
  injetadoKwh: number | null;
  /** `inconsistencias` gravadas na leitura do PDF/e-mail. */
  inconsistenciasLeitura: string[];
  /** Geração informada à mão (digitada; na fatia 3 também por print). */
  geracaoManualKwh: number | null;
  /** Soma da geracao_diaria do mês (API do monitoramento). */
  geracaoApiKwh: number | null;
  potenciaKwp: number | null;
  uf: string | null;
}

export interface ResultadoValidacao {
  estado: EstadoGd;
  /** 🔴 — impedem o relatório. */
  bloqueios: string[];
  /** 🟡/⚪ — falta algo. */
  pendencias: string[];
  /** Informativo, não bloqueia. */
  avisos: string[];
  geracaoKwh: number | null;
  origemGeracao: 'manual' | 'api' | null;
  esperadoMesKwh: number | null;
}

export const TOL_MANUAL_API = 0.03;
export const FAIXA_PLAUSIVEL = { min: 0.4, max: 1.6 } as const;
// Nota que a ingestão põe quando o DKIM não confere com a Neoenergia. Enquanto
// não soubermos com qual domínio ela assina, não pode travar o relatório.
const RE_REMETENTE = /remetente não verificado/i;

const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const r2 = (v: number) => Math.round(v * 100) / 100;

export function diasNoMes(referencia: string): number {
  const [a, m] = referencia.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** Geração esperada no mês pro tamanho da usina (mesma régua do monitoramento). */
export function esperadoMes(potenciaKwp: number | null, uf: string | null, referencia: string): number | null {
  if (!potenciaKwp || potenciaKwp <= 0) return null;
  return r2(esperadoDiaKwh(potenciaKwp, uf) * diasNoMes(referencia));
}

export function validarMes(e: EntradaValidacao): ResultadoValidacao {
  const bloqueios: string[] = [];
  const pendencias: string[] = [];
  const avisos: string[] = [];

  for (const i of e.inconsistenciasLeitura) (RE_REMETENTE.test(i) ? avisos : bloqueios).push(i);

  const origemGeracao = e.geracaoManualKwh !== null ? 'manual' : e.geracaoApiKwh !== null ? 'api' : null;
  const geracaoKwh = e.geracaoManualKwh ?? e.geracaoApiKwh;
  const esperadoMesKwh = esperadoMes(e.potenciaKwp, e.uf, e.referencia);

  if (e.leadId === null) pendencias.push('UC sem cliente — ligue a um cliente cadastrado');

  if (geracaoKwh === null) {
    pendencias.push('falta a geração do mês (monitoramento ou digitada)');
  } else {
    if (e.injetadoKwh !== null && geracaoKwh + 0.01 < e.injetadoKwh) {
      bloqueios.push(`geração ${fmt(geracaoKwh)} kWh menor que o injetado ${fmt(e.injetadoKwh)} kWh — a usina não injeta mais do que gera`);
    }
    if (esperadoMesKwh === null) {
      avisos.push('sem kWp cadastrado — não deu pra conferir se a geração é plausível');
    } else {
      const razao = geracaoKwh / esperadoMesKwh;
      if (razao < FAIXA_PLAUSIVEL.min || razao > FAIXA_PLAUSIVEL.max) {
        bloqueios.push(`geração ${fmt(geracaoKwh)} kWh fora do esperado pra esta usina (~${fmt(esperadoMesKwh)} kWh no mês)`);
      }
    }
    if (e.geracaoManualKwh !== null && e.geracaoApiKwh !== null && e.geracaoApiKwh > 0) {
      const dif = Math.abs(e.geracaoManualKwh - e.geracaoApiKwh) / e.geracaoApiKwh;
      if (dif > TOL_MANUAL_API) {
        bloqueios.push(
          `geração informada ${fmt(e.geracaoManualKwh)} kWh difere ${fmt(dif * 100)}% do monitoramento (${fmt(e.geracaoApiKwh)} kWh)`,
        );
      }
    }
  }

  const estado: EstadoGd = bloqueios.length > 0
    ? 'inconsistente'
    : e.leadId === null
      ? 'sem_cliente'
      : geracaoKwh === null
        ? 'falta_dado'
        : 'pronto';

  return { estado, bloqueios, pendencias, avisos, geracaoKwh, origemGeracao, esperadoMesKwh };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/gd-validacao.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/gd/gd-validacao.ts tests/gd-validacao.test.ts
git commit -m "feat(gd): travas de exatidao do mes (geracao x injetado, plausivel, manual x API)"
```

---

### Task 3: Números e campos digitados (`gd-formulario.ts`)

**Files:**
- Create: `src/modules/gd/gd-formulario.ts`
- Test: `tests/gd-formulario.test.ts`

- [ ] **Step 1: Escrever os testes**

```ts
import { describe, it, expect } from 'vitest';
import { numeroForm, mesInput, montarDigitado, type CamposDigitados } from '../src/modules/gd/gd-formulario.js';

describe('numeroForm', () => {
  it('aceita o jeito brasileiro e o do teclado numérico', () => {
    expect(numeroForm('1.234,5')).toBe(1234.5);
    expect(numeroForm('612,4')).toBe(612.4);
    expect(numeroForm('612.4')).toBe(612.4);
    expect(numeroForm('1.234')).toBe(1234);      // ponto com 3 casas = milhar
    expect(numeroForm('12.345.678')).toBe(12345678);
    expect(numeroForm(' 700 ')).toBe(700);
  });
  it('vazio ou lixo vira null', () => {
    expect(numeroForm('')).toBeNull();
    expect(numeroForm(undefined)).toBeNull();
    expect(numeroForm('abc')).toBeNull();
    expect(numeroForm('1.2.3')).toBeNull();
    expect(numeroForm('-5')).toBeNull();          // kWh não é negativo
  });
});

describe('mesInput', () => {
  it('YYYY-MM do <input type=month> vira YYYY-MM-01', () => {
    expect(mesInput('2026-08')).toBe('2026-08-01');
    expect(mesInput('2026-13')).toBeNull();
    expect(mesInput('')).toBeNull();
  });
});

const ok: CamposDigitados = {
  clienteNome: 'Fulano de Tal', codigoCliente: '100001', instalacao: '200002', mes: '2026-08',
  injetado: '222', consumo: '480', creditoUtilizado: '210', saldoAcumulado: '1.240,5',
  proximoExpirar: '', cicloExpirar: '',
};

describe('montarDigitado', () => {
  it('monta o demonstrativo com os números certos', () => {
    const r = montarDigitado(ok);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.referencia).toBe('2026-08-01');
    expect(r.dados.saldoAcumuladoKwh).toBe(1240.5);
    expect(r.dados.proximoExpirarKwh).toBeNull();
    expect(r.dados.historico).toEqual([]);
  });
  it('lista TODOS os erros de uma vez', () => {
    const r = montarDigitado({ ...ok, clienteNome: ' ', instalacao: 'x', mes: '', injetado: 'abc' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros).toHaveLength(4);
  });
  it('ciclo preenchido sem valor a expirar é erro', () => {
    const r = montarDigitado({ ...ok, cicloExpirar: '2029-12' });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/gd-formulario.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// Digitação na tela de demonstrativos: número do jeito que a pessoa digita
// (1.234,5 · 612.4 · 612,4) e campos do demonstrativo digitados à mão.
// Função PURA. Mesmo formato de saída do leitor do PDF (DemonstrativoGd) —
// assim o que foi digitado passa pelas mesmas travas e é gravado igual.

import { numeroBr, type DemonstrativoGd } from './demonstrativo-parser.js';

/** kWh digitado → número. Nunca adivinha: formato estranho vira null. */
export function numeroForm(s: string | null | undefined): number | null {
  const t = (s ?? '').trim().replace(/\s/g, '');
  if (!t) return null;
  let v: number | null = null;
  if (t.includes(',')) v = numeroBr(t);
  else if (/^\d+$/.test(t)) v = Number(t);
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) v = Number(t.replace(/\./g, '')); // 1.234 = milhar
  else if (/^\d+\.\d{1,2}$/.test(t)) v = Number(t);                         // 612.4 = decimal
  return v !== null && Number.isFinite(v) && v >= 0 ? v : null;
}

/** 'YYYY-MM' (input type=month) → 'YYYY-MM-01'. */
export function mesInput(s: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec((s ?? '').trim());
  if (!m) return null;
  const mes = Number(m[2]);
  return mes >= 1 && mes <= 12 ? `${m[1]}-${m[2]}-01` : null;
}

export interface CamposDigitados {
  clienteNome: string;
  codigoCliente: string;
  instalacao: string;
  mes: string;            // YYYY-MM
  injetado: string;
  consumo: string;
  creditoUtilizado: string;
  saldoAcumulado: string;
  proximoExpirar: string; // opcional
  cicloExpirar: string;   // YYYY-MM, opcional
}

export type ResultadoDigitado = { ok: true; dados: DemonstrativoGd } | { ok: false; erros: string[] };

export function montarDigitado(c: CamposDigitados): ResultadoDigitado {
  const erros: string[] = [];
  const nome = (c.clienteNome ?? '').trim();
  if (!nome) erros.push('Nome do cliente é obrigatório.');
  const codigo = (c.codigoCliente ?? '').replace(/\D/g, '');
  const instalacao = (c.instalacao ?? '').replace(/\D/g, '');
  if (!/^\d{3,15}$/.test(instalacao)) erros.push('Instalação (UC) precisa ser só números.');
  const referencia = mesInput(c.mes);
  if (!referencia) erros.push('Mês de referência inválido.');

  const obrig = (rotulo: string, s: string): number | null => {
    const v = numeroForm(s);
    if (v === null) erros.push(`${rotulo}: número inválido.`);
    return v;
  };
  const injetado = obrig('Injetado', c.injetado);
  const consumo = obrig('Consumo', c.consumo);
  const creditoUtilizado = obrig('Crédito utilizado', c.creditoUtilizado);
  const saldo = obrig('Saldo acumulado', c.saldoAcumulado);

  const proximo = (c.proximoExpirar ?? '').trim() ? numeroForm(c.proximoExpirar) : null;
  if ((c.proximoExpirar ?? '').trim() && proximo === null) erros.push('Crédito a expirar: número inválido.');
  const ciclo = (c.cicloExpirar ?? '').trim() ? mesInput(c.cicloExpirar) : null;
  if ((c.cicloExpirar ?? '').trim() && ciclo === null) erros.push('Mês de expiração inválido.');
  if (ciclo !== null && proximo === null) erros.push('Informe quantos kWh expiram nesse mês.');

  if (erros.length > 0) return { ok: false, erros };
  return {
    ok: true,
    dados: {
      clienteNome: nome,
      codigoCliente: codigo || instalacao,
      instalacao,
      referencia: referencia!,
      medidor: null,
      injetadoKwh: injetado,
      saldoMesAnteriorKwh: null,
      injetadoAcumuladoKwh: null,
      consumoKwh: consumo,
      creditoUtilizadoKwh: creditoUtilizado,
      creditoRestanteKwh: null,
      creditoExpira: null,
      historico: [],
      totalInjetadoKwh: null,
      totalCompensadoKwh: null,
      saldoAcumuladoKwh: saldo,
      proximoExpirarKwh: proximo,
      cicloExpirar: ciclo,
      creditosExpiradosKwh: null,
      unidades: [],
    },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/gd-formulario.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/gd/gd-formulario.ts tests/gd-formulario.test.ts
git commit -m "feat(gd): numero digitado e demonstrativo digitado a mao"
```

---

### Task 4: Registro único + assinatura + Eva não reavisa mês igual

**Files:**
- Modify: `src/modules/gd/demonstrativo-ingestao.ts`
- Modify: `src/modules/gd/demonstrativo-repo.ts`
- Test: `tests/gd-demonstrativo-ingestao.test.ts`, `tests/gd-demonstrativo-repo.test.ts`

- [ ] **Step 1: Escrever os testes novos (ingestão)** — acrescentar ao fim de `tests/gd-demonstrativo-ingestao.test.ts`:

```ts
import { assinaturaDemonstrativo, montarRegistro } from '../src/modules/gd/demonstrativo-ingestao.js';
import { parseDemonstrativo } from '../src/modules/gd/demonstrativo-parser.js';

describe('mes repetido com os mesmos numeros', () => {
  it('nao grava de novo e nao avisa (status repetido)', async () => {
    const r0 = parseDemonstrativo(TEXTO);
    if (!r0.ok) throw new Error('fixture');
    const d = deps({ assinaturaGravada: vi.fn(async () => assinaturaDemonstrativo(r0.dados)) });
    const r = await ingerirDemonstrativo(d, { emailId: 'in_2', assunto: ASSUNTO });
    expect(r.status).toBe('repetido');
    expect(d.salvos).toHaveLength(0);
    expect(d.avisos).toHaveLength(0);
  });

  it('mesmo mes com numero diferente: grava e avisa', async () => {
    const d = deps({ assinaturaGravada: vi.fn(async () => '["outra"]') });
    const r = await ingerirDemonstrativo(d, { emailId: 'in_2', assunto: ASSUNTO });
    expect(r.status).toBe('gravado');
    expect(d.avisos).toHaveLength(1);
  });

  it('grava origem email e a assinatura', async () => {
    const d = deps();
    await ingerirDemonstrativo(d, { emailId: 'in_1', assunto: ASSUNTO });
    expect(d.salvos[0].origem).toBe('email');
    expect(typeof d.salvos[0].assinatura).toBe('string');
  });
});

describe('montarRegistro', () => {
  it('converte o demonstrativo lido em linha da tabela', () => {
    const r0 = parseDemonstrativo(TEXTO);
    if (!r0.ok) throw new Error('fixture');
    const reg = montarRegistro(r0.dados, {
      companyId: ECOSUN, leadId: null, inconsistencias: [], alertas: [], geracaoKwh: null,
      emailId: null, textoBruto: 'x', verificada: false, origem: 'pdf_manual', conferidoPor: 'u1',
    });
    expect(reg.origem).toBe('pdf_manual');
    expect(reg.instalacao).toBe('200002');
    expect(reg.conferido_por).toBe('u1');
    expect(reg.conferido_em).not.toBeNull();
    expect(reg.assinatura).toBe(assinaturaDemonstrativo(r0.dados));
  });
});
```

- [ ] **Step 2: Teste novo (repo)** — acrescentar em `tests/gd-demonstrativo-repo.test.ts`, dentro de `describe('criarRepoDemonstrativo', ...)`:

```ts
  it('assinaturaGravada filtra empresa, instalacao e mes', async () => {
    const { db, chamadas } = fakeDb({ demonstrativos_gd: [{ data: [{ assinatura: 'A1' }], error: null }, { data: [], error: null }] });
    const repo = criarRepoDemonstrativo(db, 'E1');
    expect(await repo.assinaturaGravada('200002', '2026-06-01')).toBe('A1');
    expect(await repo.assinaturaGravada('200002', '2026-07-01')).toBeNull();
    expect(chamadas[0].ops).toContainEqual(['eq', ['company_id', 'E1']]);
    expect(chamadas[0].ops).toContainEqual(['eq', ['instalacao', '200002']]);
  });
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/gd-demonstrativo-ingestao.test.ts tests/gd-demonstrativo-repo.test.ts`
Expected: FAIL — `assinaturaDemonstrativo`/`montarRegistro`/`assinaturaGravada` não existem.

- [ ] **Step 4: Implementar na ingestão** — em `src/modules/gd/demonstrativo-ingestao.ts`:

4a. Trocar o import do parser por:
```ts
import { parseDemonstrativo, type DemonstrativoGd } from './demonstrativo-parser.js';
```

4b. Logo depois de `interface LeadGd {...}`, acrescentar:
```ts
export type OrigemDemonstrativo = 'email' | 'pdf_manual' | 'digitado';
```

4c. Em `interface RegistroDemonstrativo`, acrescentar ao fim (antes do `}`):
```ts
  origem: OrigemDemonstrativo;
  assinatura: string;
  conferido_por: string | null;
  conferido_em: string | null;
```

4d. Em `interface DepsIngestao`, depois de `registroExistente(...)`, acrescentar:
```ts
  /** Assinatura dos números já gravados desse mês (null = nada gravado). Opcional. */
  assinaturaGravada?(instalacao: string, referencia: string): Promise<string | null>;
```

4e. Trocar o tipo `StatusIngestao` por:
```ts
export type StatusIngestao = 'gravado' | 'repetido' | 'duplicado' | 'sem_anexo' | 'ilegivel' | 'recusado' | 'erro';
```

4f. Depois de `escolherPdf(...)`, acrescentar:
```ts
/** Resumo dos números que importam. Mesmo mês com a mesma assinatura = nada mudou. */
export function assinaturaDemonstrativo(d: DemonstrativoGd): string {
  return JSON.stringify([
    d.instalacao, d.referencia, d.injetadoKwh, d.consumoKwh, d.creditoUtilizadoKwh, d.creditoRestanteKwh,
    d.saldoAcumuladoKwh, d.proximoExpirarKwh, d.cicloExpirar, d.creditosExpiradosKwh,
    d.unidades.map((u) => [u.codigoCliente, u.percentual, u.saldo]),
  ]);
}

export interface ExtrasRegistro {
  companyId: string;
  leadId: string | null;
  inconsistencias: string[];
  alertas: unknown[];
  geracaoKwh: number | null;
  emailId: string | null;
  textoBruto: string;
  verificada: boolean;
  origem: OrigemDemonstrativo;
  conferidoPor: string | null;
}

/** Uma função só monta a linha gravada — e-mail, PDF enviado e digitado. */
export function montarRegistro(d: DemonstrativoGd, x: ExtrasRegistro): RegistroDemonstrativo {
  return {
    company_id: x.companyId,
    lead_id: x.leadId,
    cliente_nome: d.clienteNome,
    codigo_cliente: d.codigoCliente,
    instalacao: d.instalacao,
    referencia: d.referencia,
    medidor: d.medidor,
    injetado_kwh: d.injetadoKwh,
    saldo_mes_anterior_kwh: d.saldoMesAnteriorKwh,
    injetado_acumulado_kwh: d.injetadoAcumuladoKwh,
    consumo_kwh: d.consumoKwh,
    credito_utilizado_kwh: d.creditoUtilizadoKwh,
    credito_restante_kwh: d.creditoRestanteKwh,
    credito_expira: d.creditoExpira,
    total_injetado_kwh: d.totalInjetadoKwh,
    total_compensado_kwh: d.totalCompensadoKwh,
    saldo_acumulado_kwh: d.saldoAcumuladoKwh,
    proximo_expirar_kwh: d.proximoExpirarKwh,
    ciclo_expirar: d.cicloExpirar,
    creditos_expirados_kwh: d.creditosExpiradosKwh,
    historico: d.historico,
    unidades: d.unidades,
    inconsistencias: x.inconsistencias,
    alertas: x.alertas,
    geracao_mes_kwh: x.geracaoKwh,
    email_id: x.emailId,
    texto_bruto: x.textoBruto,
    origem_verificada: x.verificada,
    origem: x.origem,
    assinatura: assinaturaDemonstrativo(d),
    conferido_por: x.conferidoPor,
    conferido_em: x.conferidoPor ? new Date().toISOString() : null,
  };
}
```

4g. Em `ingerirDemonstrativo`, logo ANTES de `etapa = 'achar cliente';`, inserir:
```ts
    etapa = 'checar repetido';
    if (deps.assinaturaGravada && (await deps.assinaturaGravada(d.instalacao, d.referencia)) === assinaturaDemonstrativo(d)) {
      deps.log?.(`[gd] ${d.instalacao} ${d.referencia}: mesmo conteudo ja gravado — sem aviso novo`);
      return { status: 'repetido' };
    }
```

4h. Trocar o bloco `await deps.salvar({ ... });` inteiro por:
```ts
    await deps.salvar(montarRegistro(d, {
      companyId: deps.companyId,
      leadId: lead?.id ?? null,
      inconsistencias,
      alertas,
      geracaoKwh: geracao,
      emailId,
      textoBruto: texto,
      verificada: dkim === 'pass',
      origem: 'email',
      conferidoPor: null,
    }));
```

- [ ] **Step 5: Implementar no repo** — em `src/modules/gd/demonstrativo-repo.ts`, dentro do objeto retornado, depois de `registroExistente`, acrescentar:

```ts
    async assinaturaGravada(instalacao: string, referencia: string): Promise<string | null> {
      const { data, error } = await db
        .from('demonstrativos_gd')
        .select('assinatura')
        .eq('company_id', companyId)
        .eq('instalacao', instalacao)
        .eq('referencia', referencia)
        .limit(1);
      if (error) throw new Error(`demonstrativos_gd (assinatura): ${error.message}`);
      return (data?.[0]?.assinatura as string | null | undefined) ?? null;
    },
```

- [ ] **Step 6: Rodar e ver passar (inclusive os antigos)**

Run: `npx vitest run tests/gd-`
Expected: PASS — todos os testes `gd-*`, antigos e novos. (O `index.ts` já espalha `...criarRepoDemonstrativo(...)` nas deps, então `assinaturaGravada` entra sozinho.)

- [ ] **Step 7: Tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add src/modules/gd/demonstrativo-ingestao.ts src/modules/gd/demonstrativo-repo.ts tests/gd-demonstrativo-ingestao.test.ts tests/gd-demonstrativo-repo.test.ts
git commit -m "feat(gd): registro unico (montarRegistro), origem e assinatura — Eva nao reavisa mes igual"
```

---

### Task 5: Repositório da tela (`demonstrativos-tela-repo.ts`)

**Files:**
- Create: `src/modules/gd/demonstrativos-tela-repo.ts`
- Test: `tests/gd-demonstrativos-tela-repo.test.ts`

- [ ] **Step 1: Escrever os testes**

```ts
import { describe, it, expect } from 'vitest';
import { criarRepoTelaGd } from '../src/modules/gd/demonstrativos-tela-repo.js';

function fakeDb(respostas: Record<string, Array<{ data: any; error: any }>>) {
  const chamadas: Array<{ tabela: string; ops: Array<[string, any[]]> }> = [];
  const db = {
    from(tabela: string) {
      const c = { tabela, ops: [] as Array<[string, any[]]> };
      chamadas.push(c);
      const fila = respostas[tabela] ?? [];
      const q: any = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            const r = fila.shift() ?? { data: [], error: null };
            return (res: any) => Promise.resolve(r).then(res);
          }
          return (...args: any[]) => { c.ops.push([prop, args]); return q; };
        },
      });
      return q;
    },
  };
  return { db: db as any, chamadas };
}

describe('criarRepoTelaGd', () => {
  it('mesesDisponiveis devolve meses unicos, do mais novo pro mais velho', async () => {
    const { db, chamadas } = fakeDb({ demonstrativos_gd: [{ data: [
      { referencia: '2026-08-01' }, { referencia: '2026-08-01' }, { referencia: '2026-07-01' },
    ], error: null }] });
    expect(await criarRepoTelaGd(db, 'E1').mesesDisponiveis()).toEqual(['2026-08-01', '2026-07-01']);
    expect(chamadas[0].ops).toContainEqual(['eq', ['company_id', 'E1']]);
  });

  it('listarDoMes filtra empresa e mes', async () => {
    const { db, chamadas } = fakeDb({ demonstrativos_gd: [{ data: [{ instalacao: '1' }], error: null }] });
    const r = await criarRepoTelaGd(db, 'E1').listarDoMes('2026-08-01');
    expect(r).toHaveLength(1);
    expect(chamadas[0].ops).toContainEqual(['eq', ['company_id', 'E1']]);
    expect(chamadas[0].ops).toContainEqual(['eq', ['referencia', '2026-08-01']]);
  });

  it('gravarManual nao passa por cima de mes que veio confirmado da concessionaria', async () => {
    const { db, chamadas } = fakeDb({ demonstrativos_gd: [{ data: [{ origem_verificada: true }], error: null }] });
    const r = await criarRepoTelaGd(db, 'E1').gravarManual({ instalacao: '1', referencia: '2026-08-01' } as any);
    expect(r).toBe('mantido_verificado');
    expect(chamadas.some((c) => c.ops.some(([op]) => op === 'upsert'))).toBe(false);
  });

  it('gravarManual grava quando nao ha mes verificado', async () => {
    const { db, chamadas } = fakeDb({ demonstrativos_gd: [{ data: [], error: null }, { data: null, error: null }] });
    const r = await criarRepoTelaGd(db, 'E1').gravarManual({ instalacao: '1', referencia: '2026-08-01' } as any);
    expect(r).toBe('gravado');
    expect(chamadas[1].ops[0][0]).toBe('upsert');
  });

  it('salvarGeracaoManual grava na empresa do operador (company_id nunca vem da tela)', async () => {
    const { db, chamadas } = fakeDb({ geracao_mensal_gd: [{ data: null, error: null }] });
    await criarRepoTelaGd(db, 'E1').salvarGeracaoManual({
      leadId: 'L1', instalacao: '1', referencia: '2026-08-01', kwh: 612.4, conferidoPor: 'u1',
    });
    const [op, args] = chamadas[0].ops[0];
    expect(op).toBe('upsert');
    expect(args[0]).toMatchObject({ company_id: 'E1', kwh: 612.4, origem: 'digitado', conferido_por: 'u1' });
  });

  it('sistemaDoLead soma o kWp dos sistemas e pega a UF', async () => {
    const { db } = fakeDb({ sistemas_clientes: [{ data: [{ potencia_kwp: 3, uf: 'DF' }, { potencia_kwp: 2.5, uf: 'DF' }], error: null }] });
    expect(await criarRepoTelaGd(db, 'E1').sistemaDoLead('L1')).toEqual({ potenciaKwp: 5.5, uf: 'DF' });
  });

  it('leadDaEmpresa so acha lead da propria empresa', async () => {
    const { db, chamadas } = fakeDb({ leads: [{ data: [], error: null }] });
    expect(await criarRepoTelaGd(db, 'E1').leadDaEmpresa('L9')).toBeNull();
    expect(chamadas[0].ops).toContainEqual(['eq', ['company_id', 'E1']]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/gd-demonstrativos-tela-repo.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// Leituras e gravações da TELA de demonstrativos. company_id vem SEMPRE da
// sessão do operador (quem chama passa req.dashUser.companyId) e TODA consulta
// filtra por ele — mesmo com a chave-mestra, uma empresa nunca lê a outra.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RegistroDemonstrativo } from './demonstrativo-ingestao.js';

export interface LinhaDemonstrativo {
  id: string;
  lead_id: string | null;
  cliente_nome: string;
  codigo_cliente: string;
  instalacao: string;
  referencia: string;
  injetado_kwh: number | null;
  consumo_kwh: number | null;
  credito_utilizado_kwh: number | null;
  credito_restante_kwh: number | null;
  saldo_acumulado_kwh: number | null;
  proximo_expirar_kwh: number | null;
  ciclo_expirar: string | null;
  historico: Array<{ mes: string; consumida: number; injetada: number; faturada: number; compensado: number; credito: number }>;
  unidades: Array<{ codigoCliente: string; percentual: number; saldo: number }>;
  inconsistencias: string[];
  origem: 'email' | 'pdf_manual' | 'digitado';
  origem_verificada: boolean;
  recebido_em: string;
  conferido_em: string | null;
}

export interface GeracaoManual {
  kwh: number;
  origem: 'print' | 'digitado';
  conferido_em: string;
}

const COLUNAS =
  'id, lead_id, cliente_nome, codigo_cliente, instalacao, referencia, injetado_kwh, consumo_kwh, ' +
  'credito_utilizado_kwh, credito_restante_kwh, saldo_acumulado_kwh, proximo_expirar_kwh, ciclo_expirar, ' +
  'historico, unidades, inconsistencias, origem, origem_verificada, recebido_em, conferido_em';

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function normalizar(r: any): LinhaDemonstrativo {
  return {
    ...r,
    injetado_kwh: num(r.injetado_kwh),
    consumo_kwh: num(r.consumo_kwh),
    credito_utilizado_kwh: num(r.credito_utilizado_kwh),
    credito_restante_kwh: num(r.credito_restante_kwh),
    saldo_acumulado_kwh: num(r.saldo_acumulado_kwh),
    proximo_expirar_kwh: num(r.proximo_expirar_kwh),
    historico: Array.isArray(r.historico) ? r.historico : [],
    unidades: Array.isArray(r.unidades) ? r.unidades : [],
    inconsistencias: Array.isArray(r.inconsistencias) ? r.inconsistencias : [],
  };
}

export function criarRepoTelaGd(db: SupabaseClient, companyId: string) {
  return {
    async mesesDisponiveis(): Promise<string[]> {
      const { data, error } = await db
        .from('demonstrativos_gd')
        .select('referencia')
        .eq('company_id', companyId)
        .order('referencia', { ascending: false })
        .limit(1000);
      if (error) throw new Error(`demonstrativos_gd (meses): ${error.message}`);
      return [...new Set((data ?? []).map((x: any) => String(x.referencia)))];
    },

    async listarDoMes(referencia: string): Promise<LinhaDemonstrativo[]> {
      const { data, error } = await db
        .from('demonstrativos_gd')
        .select(COLUNAS)
        .eq('company_id', companyId)
        .eq('referencia', referencia)
        .order('cliente_nome', { ascending: true })
        .limit(1000);
      if (error) throw new Error(`demonstrativos_gd (lista): ${error.message}`);
      return (data ?? []).map(normalizar);
    },

    async historicoDaInstalacao(instalacao: string): Promise<LinhaDemonstrativo[]> {
      const { data, error } = await db
        .from('demonstrativos_gd')
        .select(COLUNAS)
        .eq('company_id', companyId)
        .eq('instalacao', instalacao)
        .order('referencia', { ascending: false })
        .limit(36);
      if (error) throw new Error(`demonstrativos_gd (historico): ${error.message}`);
      return (data ?? []).map(normalizar);
    },

    /** Geração manual por `${instalacao}|${referencia}`. */
    async geracoesManuais(instalacoes: string[]): Promise<Map<string, GeracaoManual>> {
      const mapa = new Map<string, GeracaoManual>();
      if (instalacoes.length === 0) return mapa;
      const { data, error } = await db
        .from('geracao_mensal_gd')
        .select('instalacao, referencia, kwh, origem, conferido_em')
        .eq('company_id', companyId)
        .in('instalacao', instalacoes)
        .limit(5000);
      if (error) throw new Error(`geracao_mensal_gd (ler): ${error.message}`);
      for (const g of data ?? []) {
        mapa.set(`${g.instalacao}|${g.referencia}`, { kwh: Number(g.kwh), origem: g.origem, conferido_em: g.conferido_em });
      }
      return mapa;
    },

    async salvarGeracaoManual(p: {
      leadId: string | null; instalacao: string; referencia: string; kwh: number; conferidoPor: string;
    }): Promise<void> {
      const { error } = await db.from('geracao_mensal_gd').upsert(
        {
          company_id: companyId,
          lead_id: p.leadId,
          instalacao: p.instalacao,
          referencia: p.referencia,
          kwh: p.kwh,
          origem: 'digitado',
          fonte: {},
          conferido_por: p.conferidoPor,
          conferido_em: new Date().toISOString(),
        },
        { onConflict: 'company_id,instalacao,referencia' },
      );
      if (error) throw new Error(`geracao_mensal_gd (gravar): ${error.message}`);
    },

    async sistemaDoLead(leadId: string): Promise<{ potenciaKwp: number | null; uf: string | null }> {
      const { data, error } = await db
        .from('sistemas_clientes')
        .select('potencia_kwp, uf')
        .eq('company_id', companyId)
        .eq('lead_id', leadId);
      if (error) throw new Error(`sistemas_clientes (kwp): ${error.message}`);
      const linhas = data ?? [];
      const soma = linhas.reduce((s: number, x: any) => s + Number(x.potencia_kwp ?? 0), 0);
      return { potenciaKwp: soma > 0 ? Math.round(soma * 100) / 100 : null, uf: (linhas[0] as any)?.uf ?? null };
    },

    async leadDaEmpresa(leadId: string): Promise<{ id: string; nome: string | null } | null> {
      const { data, error } = await db
        .from('leads')
        .select('id, name')
        .eq('company_id', companyId)
        .eq('id', leadId)
        .limit(1);
      if (error) throw new Error(`leads (conferir): ${error.message}`);
      const l = data?.[0] as any;
      return l ? { id: l.id, nome: l.name ?? null } : null;
    },

    async buscarLeads(q: string): Promise<Array<{ id: string; nome: string | null; uc: string | null }>> {
      const termo = q.trim().replace(/[%_,()]/g, ' ');
      if (termo.length < 2) return [];
      const { data, error } = await db
        .from('leads')
        .select('id, name, uc_numero')
        .eq('company_id', companyId)
        .ilike('name', `%${termo}%`)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw new Error(`leads (buscar): ${error.message}`);
      return (data ?? []).map((l: any) => ({ id: l.id, nome: l.name ?? null, uc: l.uc_numero ?? null }));
    },

    /** Liga todos os meses dessa UC (e a geração manual) ao cliente. */
    async ligarLead(instalacao: string, leadId: string): Promise<void> {
      const a = await db.from('demonstrativos_gd').update({ lead_id: leadId })
        .eq('company_id', companyId).eq('instalacao', instalacao);
      if (a.error) throw new Error(`demonstrativos_gd (ligar): ${a.error.message}`);
      const b = await db.from('geracao_mensal_gd').update({ lead_id: leadId })
        .eq('company_id', companyId).eq('instalacao', instalacao);
      if (b.error) throw new Error(`geracao_mensal_gd (ligar): ${b.error.message}`);
    },

    /**
     * PDF enviado ou digitado. Mês que já veio CONFIRMADO da concessionária
     * (DKIM) não é trocado — o gatilho da 130 também descartaria em silêncio;
     * aqui a tela fica sabendo e avisa.
     */
    async gravarManual(r: RegistroDemonstrativo): Promise<'gravado' | 'mantido_verificado'> {
      const atual = await db
        .from('demonstrativos_gd')
        .select('origem_verificada')
        .eq('company_id', companyId)
        .eq('instalacao', r.instalacao)
        .eq('referencia', r.referencia)
        .limit(1);
      if (atual.error) throw new Error(`demonstrativos_gd (conferir): ${atual.error.message}`);
      if ((atual.data?.[0] as any)?.origem_verificada === true) return 'mantido_verificado';
      const { error } = await db
        .from('demonstrativos_gd')
        .upsert({ ...r, company_id: companyId, atualizado_em: new Date().toISOString() }, { onConflict: 'company_id,instalacao,referencia' });
      if (error) throw new Error(`demonstrativos_gd (gravar manual): ${error.message}`);
      return 'gravado';
    },
  };
}

export type RepoTelaGd = ReturnType<typeof criarRepoTelaGd>;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/gd-demonstrativos-tela-repo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/gd/demonstrativos-tela-repo.ts tests/gd-demonstrativos-tela-repo.test.ts
git commit -m "feat(gd): repositorio da tela de demonstrativos (sempre por empresa)"
```

---

### Task 6: Montagem da tela (`demonstrativos-tela.ts`, puro)

**Files:**
- Create: `src/modules/gd/demonstrativos-tela.ts`
- Test: `tests/gd-demonstrativos-tela.test.ts`

- [ ] **Step 1: Escrever os testes**

```ts
import { describe, it, expect } from 'vitest';
import {
  alertaVencimento, compensadoDoMes, economiaEstimadaRs, montarItem, filtrarItens, TARIFA_PADRAO_RS_KWH,
} from '../src/modules/gd/demonstrativos-tela.js';
import type { LinhaDemonstrativo } from '../src/modules/gd/demonstrativos-tela-repo.js';
import type { ResultadoValidacao } from '../src/modules/gd/gd-validacao.js';

const linha = (over: Partial<LinhaDemonstrativo> = {}): LinhaDemonstrativo => ({
  id: 'x', lead_id: 'L1', cliente_nome: 'JOAO TESTE', codigo_cliente: '100001', instalacao: '200002',
  referencia: '2026-08-01', injetado_kwh: 222, consumo_kwh: 480, credito_utilizado_kwh: 210,
  credito_restante_kwh: null, saldo_acumulado_kwh: 1240, proximo_expirar_kwh: 654, ciclo_expirar: '2029-12-01',
  historico: [{ mes: '2026-08-01', consumida: 480, injetada: 222, faturada: 100, compensado: 380, credito: 0 }],
  unidades: [], inconsistencias: [], origem: 'email', origem_verificada: true,
  recebido_em: '2026-09-23T00:00:00Z', conferido_em: null, ...over,
});
const val = (over: Partial<ResultadoValidacao> = {}): ResultadoValidacao => ({
  estado: 'pronto', bloqueios: [], pendencias: [], avisos: [], geracaoKwh: 612,
  origemGeracao: 'api', esperadoMesKwh: 600, ...over,
});

describe('alertaVencimento', () => {
  it('avisa quando vence em ate 6 meses', () => {
    expect(alertaVencimento(654, '2026-12-01', '2026-09-23')).toMatch(/654.*dez\/2026/);
  });
  it('longe ou sem valor: nada', () => {
    expect(alertaVencimento(654, '2029-12-01', '2026-09-23')).toBeNull();
    expect(alertaVencimento(null, '2026-12-01', '2026-09-23')).toBeNull();
    expect(alertaVencimento(0, '2026-12-01', '2026-09-23')).toBeNull();
  });
});

describe('compensado e economia', () => {
  it('compensado vem da linha do historico do proprio mes', () => {
    expect(compensadoDoMes(linha())).toBe(380);
    expect(compensadoDoMes(linha({ historico: [] }))).toBeNull();
  });
  it('economia estimada = compensado x tarifa', () => {
    expect(economiaEstimadaRs(380, TARIFA_PADRAO_RS_KWH)).toBe(Math.round(380 * TARIFA_PADRAO_RS_KWH * 100) / 100);
    expect(economiaEstimadaRs(null, 0.99)).toBeNull();
  });
});

describe('montarItem / filtrarItens', () => {
  it('leva estado, geracao e o primeiro motivo', () => {
    const it1 = montarItem(linha(), val({ estado: 'falta_dado', pendencias: ['falta a geração do mês'] , geracaoKwh: null }), '2026-09-23');
    expect(it1.estado).toBe('falta_dado');
    expect(it1.motivo).toMatch(/falta a geração/);
    expect(it1.geracaoKwh).toBeNull();
  });
  it('filtra por estado e por busca (nome ou UC)', () => {
    const itens = [
      montarItem(linha(), val(), '2026-09-23'),
      montarItem(linha({ cliente_nome: 'MARIA', instalacao: '999' }), val({ estado: 'inconsistente', bloqueios: ['x'] }), '2026-09-23'),
    ];
    expect(filtrarItens(itens, { estado: 'inconsistente' })).toHaveLength(1);
    expect(filtrarItens(itens, { q: 'joao' })).toHaveLength(1);
    expect(filtrarItens(itens, { q: '999' })).toHaveLength(1);
    expect(filtrarItens(itens, {})).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/gd-demonstrativos-tela.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// Montagem PURA da tela de demonstrativos: linha do banco + validação → o que
// aparece na lista; alerta de crédito a vencer; compensado e economia
// estimada do mês. Sem banco, sem HTML.

import type { LinhaDemonstrativo } from './demonstrativos-tela-repo.js';
import type { EstadoGd, ResultadoValidacao } from './gd-validacao.js';
import { mesCurto } from './demonstrativo-cruzamento.js';

/** Tarifa média usada na economia estimada até existir config por empresa (fatia 2). */
export const TARIFA_PADRAO_RS_KWH = 0.99;
const MESES_ALERTA = 6;

export interface ItemLista {
  instalacao: string;
  clienteNome: string;
  leadId: string | null;
  referencia: string;
  geracaoKwh: number | null;
  saldoKwh: number | null;
  estado: EstadoGd;
  motivo: string | null;
  alertaVencimento: string | null;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

function mesesEntre(deIso: string, ateIso: string): number {
  const [a1, m1] = deIso.slice(0, 7).split('-').map(Number);
  const [a2, m2] = ateIso.slice(0, 7).split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

export function alertaVencimento(kwh: number | null, ciclo: string | null, hojeIso: string): string | null {
  if (!kwh || kwh <= 0 || !ciclo) return null;
  const faltam = mesesEntre(hojeIso, ciclo);
  if (faltam < 0 || faltam > MESES_ALERTA) return null;
  return `⏰ ${fmt(kwh)} kWh de crédito vencem em ${mesCurto(ciclo)}`;
}

export function compensadoDoMes(l: LinhaDemonstrativo): number | null {
  const h = l.historico.find((x) => x.mes === l.referencia);
  return h ? Number(h.compensado) : null;
}

export function economiaEstimadaRs(compensadoKwh: number | null, tarifa: number): number | null {
  if (compensadoKwh === null) return null;
  return Math.round(compensadoKwh * tarifa * 100) / 100;
}

export function montarItem(l: LinhaDemonstrativo, v: ResultadoValidacao, hojeIso: string): ItemLista {
  return {
    instalacao: l.instalacao,
    clienteNome: l.cliente_nome,
    leadId: l.lead_id,
    referencia: l.referencia,
    geracaoKwh: v.geracaoKwh,
    saldoKwh: l.saldo_acumulado_kwh,
    estado: v.estado,
    motivo: v.bloqueios[0] ?? v.pendencias[0] ?? null,
    alertaVencimento: alertaVencimento(l.proximo_expirar_kwh, l.ciclo_expirar, hojeIso),
  };
}

export function filtrarItens(itens: ItemLista[], f: { estado?: string; q?: string }): ItemLista[] {
  const q = (f.q ?? '').trim().toLowerCase();
  return itens.filter((i) =>
    (!f.estado || i.estado === f.estado) &&
    (!q || i.clienteNome.toLowerCase().includes(q) || i.instalacao.includes(q)));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/gd-demonstrativos-tela.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/gd/demonstrativos-tela.ts tests/gd-demonstrativos-tela.test.ts
git commit -m "feat(gd): montagem pura da tela (item, vencimento, economia estimada)"
```

---

### Task 7: Telas (`demonstrativos-views.ts`) + menu

**Files:**
- Create: `src/modules/dashboard/demonstrativos-views.ts`
- Modify: `src/modules/dashboard/views.ts` (união `active` na linha ~90; item no setor de usinas na linha ~163)
- Test: `tests/gd-demonstrativos-views.test.ts`

- [ ] **Step 1: Escrever os testes**

```ts
import { describe, it, expect } from 'vitest';
import {
  renderDemonstrativosLista, renderDemonstrativoCliente, renderConferenciaPdf, renderDigitar,
} from '../src/modules/dashboard/demonstrativos-views.js';
import type { ItemLista } from '../src/modules/gd/demonstrativos-tela.js';

const item = (over: Partial<ItemLista> = {}): ItemLista => ({
  instalacao: '200002', clienteNome: 'JOAO <b>TESTE</b>', leadId: 'L1', referencia: '2026-08-01',
  geracaoKwh: 612, saldoKwh: 1240, estado: 'pronto', motivo: null, alertaVencimento: null, ...over,
});

describe('renderDemonstrativosLista', () => {
  it('escapa o nome, mostra a situacao e os botoes de entrada', () => {
    const h = renderDemonstrativosLista({ itens: [item()], meses: ['2026-08-01'], mes: '2026-08-01', filtro: {} });
    expect(h).toContain('JOAO &lt;b&gt;TESTE&lt;/b&gt;');
    expect(h).toContain('/dashboard/demonstrativos/200002?mes=2026-08-01');
    expect(h).toContain('/dashboard/demonstrativos/enviar-pdf');
    expect(h).toContain('/dashboard/demonstrativos/digitar');
    expect(h).toMatch(/Pronto/);
  });
  it('lista vazia explica o que fazer', () => {
    expect(renderDemonstrativosLista({ itens: [], meses: [], mes: null, filtro: {} })).toMatch(/Nenhum demonstrativo/);
  });
});

describe('renderDemonstrativoCliente', () => {
  it('mostra os numeros, a origem e o formulario de geracao quando falta', () => {
    const h = renderDemonstrativoCliente({
      instalacao: '200002', clienteNome: 'JOAO', leadId: 'L1', meses: ['2026-08-01', '2026-07-01'], mes: '2026-08-01',
      consumoKwh: 480, injetadoKwh: 222, saldoKwh: 1240, compensadoKwh: 380, economiaRs: 376.2,
      proximoExpirar: null, historico: [{ mes: '2026-08-01', consumida: 480, injetada: 222, compensado: 380 }],
      unidades: [], origemDemonstrativo: 'email', verificado: true,
      validacao: { estado: 'falta_dado', bloqueios: [], pendencias: ['falta a geração do mês'], avisos: [], geracaoKwh: null, origemGeracao: null, esperadoMesKwh: 600 },
      candidatos: [], msg: null,
    });
    expect(h).toContain('R$');
    expect(h).toMatch(/e-mail da concessionária/);
    expect(h).toContain('action="/dashboard/demonstrativos/200002/geracao"');
    expect(h).toMatch(/falta a geração/);
  });
  it('UC sem cliente mostra a busca de cliente', () => {
    const h = renderDemonstrativoCliente({
      instalacao: '999', clienteNome: 'X', leadId: null, meses: ['2026-08-01'], mes: '2026-08-01',
      consumoKwh: null, injetadoKwh: null, saldoKwh: null, compensadoKwh: null, economiaRs: null,
      proximoExpirar: null, historico: [], unidades: [], origemDemonstrativo: 'pdf_manual', verificado: false,
      validacao: { estado: 'sem_cliente', bloqueios: [], pendencias: ['UC sem cliente'], avisos: [], geracaoKwh: null, origemGeracao: null, esperadoMesKwh: null },
      candidatos: [{ id: 'L2', nome: 'Maria', uc: '999' }], msg: null,
    });
    expect(h).toContain('action="/dashboard/demonstrativos/999/ligar"');
    expect(h).toContain('value="L2"');
  });
});

describe('renderConferenciaPdf', () => {
  it('cada PDF lido vira um formulario de confirmacao com o texto; o ilegivel mostra o motivo', () => {
    const h = renderConferenciaPdf([
      { arquivo: 'a.pdf', ok: true, textoB64: 'dGV4dG8=', clienteNome: 'JOAO', instalacao: '200002', referencia: '2026-08-01',
        injetadoKwh: 222, consumoKwh: 480, saldoKwh: 1240, inconsistencias: [] },
      { arquivo: 'b.pdf', ok: false, motivo: 'nao parece um demonstrativo' },
    ]);
    expect(h).toContain('action="/dashboard/demonstrativos/confirmar"');
    expect(h).toContain('name="texto_b64" value="dGV4dG8="');
    expect(h).toMatch(/nao parece um demonstrativo/);
  });
});

describe('renderDigitar', () => {
  it('mostra os erros e devolve o que foi digitado', () => {
    const h = renderDigitar({ clienteNome: 'Ana' }, ['Mês de referência inválido.']);
    expect(h).toMatch(/Mês de referência inválido/);
    expect(h).toContain('value="Ana"');
    expect(h).toContain('action="/dashboard/demonstrativos/digitar"');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/gd-demonstrativos-views.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar as telas** — `src/modules/dashboard/demonstrativos-views.ts`:

```ts
// Telas do módulo Demonstrativos GD (fatia 1): lista, cliente, conferência do
// PDF enviado e digitação. Só desenham — regra fica em src/modules/gd/.
// Ver docs/superpowers/specs/2026-09-23-demonstrativos-tela-relatorio-design.md.

import { renderLayout } from './views.js';
import type { DashUser } from './permissions.js';
import type { ItemLista } from '../gd/demonstrativos-tela.js';
import type { EstadoGd, ResultadoValidacao } from '../gd/gd-validacao.js';
import { mesCurto } from '../gd/demonstrativo-cruzamento.js';

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
const kwh = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kWh`;
const brl = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

const ESTADO: Record<EstadoGd, { cor: string; txt: string }> = {
  pronto: { cor: '#22c55e', txt: '🟢 Pronto' },
  falta_dado: { cor: '#eab308', txt: '🟡 Falta dado' },
  inconsistente: { cor: '#ef4444', txt: '🔴 Número não bate' },
  sem_cliente: { cor: '#94a3b8', txt: '⚪ Sem cliente' },
};
const ORIGEM: Record<string, string> = {
  email: 'e-mail da concessionária',
  pdf_manual: 'PDF enviado na tela',
  digitado: 'digitado na tela',
};

const botoesEntrada = `
<div class="flex flex-wrap gap-2 my-3">
  <a href="/dashboard/demonstrativos/enviar-pdf" class="px-3 py-2 rounded bg-cyan-700 text-white">+ Enviar PDF</a>
  <a href="/dashboard/demonstrativos/digitar" class="px-3 py-2 rounded bg-slate-700 text-white">✎ Digitar demonstrativo</a>
</div>`;

export function renderDemonstrativosLista(p: {
  itens: ItemLista[]; meses: string[]; mes: string | null; filtro: { estado?: string; q?: string }; msg?: string | null;
}, user?: DashUser): string {
  const opcMes = p.meses.map((m) => `<option value="${m}"${m === p.mes ? ' selected' : ''}>${mesCurto(m)}</option>`).join('');
  const opcEstado = ['', 'pronto', 'falta_dado', 'inconsistente', 'sem_cliente']
    .map((e) => `<option value="${e}"${(p.filtro.estado ?? '') === e ? ' selected' : ''}>${e ? ESTADO[e as EstadoGd].txt : 'Todas'}</option>`).join('');
  const linhas = p.itens.map((i) => `
    <a href="/dashboard/demonstrativos/${esc(i.instalacao)}?mes=${esc(i.referencia)}" class="block rounded-lg border border-slate-700 hover:border-slate-500 p-3 mb-2">
      <div class="flex justify-between gap-2">
        <b>${esc(i.clienteNome)}</b><span style="color:${ESTADO[i.estado].cor}">${ESTADO[i.estado].txt}</span>
      </div>
      <div class="text-sm text-slate-400">UC ${esc(i.instalacao)} · ${mesCurto(i.referencia)} · gerou ${kwh(i.geracaoKwh)} · créditos ${kwh(i.saldoKwh)}</div>
      ${i.motivo ? `<div class="text-sm" style="color:${ESTADO[i.estado].cor}">${esc(i.motivo)}</div>` : ''}
      ${i.alertaVencimento ? `<div class="text-sm text-amber-300">${esc(i.alertaVencimento)}</div>` : ''}
    </a>`).join('');
  const body = `
<div style="color:#d1d5db;max-width:900px">
<h1 class="text-xl font-bold text-cyan-300 mb-2">📄 Demonstrativos de GD</h1>
${p.msg ? `<div class="rounded border border-emerald-600 p-2 mb-2">${esc(p.msg)}</div>` : ''}
${botoesEntrada}
<form method="get" action="/dashboard/demonstrativos" class="flex flex-wrap gap-2 mb-3">
  <select name="mes" class="bg-gray-800 p-1 rounded">${opcMes}</select>
  <select name="estado" class="bg-gray-800 p-1 rounded">${opcEstado}</select>
  <input name="q" value="${esc(p.filtro.q ?? '')}" placeholder="buscar cliente ou UC" class="bg-gray-800 p-1 rounded">
  <button class="px-3 py-1 rounded bg-slate-700">Filtrar</button>
</form>
${linhas || '<p class="text-slate-500">Nenhum demonstrativo neste filtro. Eles chegam sozinhos pelo e-mail da concessionária — ou use "+ Enviar PDF".</p>'}
</div>`;
  return renderLayout({ active: 'demonstrativos', title: 'Demonstrativos', body, dark: true, user });
}

export interface DetalheCliente {
  instalacao: string;
  clienteNome: string;
  leadId: string | null;
  meses: string[];
  mes: string;
  consumoKwh: number | null;
  injetadoKwh: number | null;
  saldoKwh: number | null;
  compensadoKwh: number | null;
  economiaRs: number | null;
  proximoExpirar: string | null;
  historico: Array<{ mes: string; consumida: number; injetada: number; compensado: number }>;
  unidades: Array<{ codigoCliente: string; percentual: number; saldo: number }>;
  origemDemonstrativo: string;
  verificado: boolean;
  validacao: ResultadoValidacao;
  candidatos: Array<{ id: string; nome: string | null; uc: string | null }>;
  msg: string | null;
}

export function renderDemonstrativoCliente(d: DetalheCliente, user?: DashUser): string {
  const i = d.meses.indexOf(d.mes);
  const anterior = d.meses[i + 1];
  const proximo = i > 0 ? d.meses[i - 1] : undefined;
  const nav = (m: string | undefined, s: string) => m
    ? `<a class="px-2 py-1 rounded bg-slate-700" href="/dashboard/demonstrativos/${esc(d.instalacao)}?mes=${m}">${s}</a>` : '';
  const v = d.validacao;
  const card = (t: string, valor: string) =>
    `<div class="rounded-lg bg-slate-800 p-3"><div class="text-xs text-slate-400">${t}</div><div class="text-2xl font-bold">${valor}</div></div>`;
  const lista = (itens: string[], cor: string) => itens.map((x) => `<li style="color:${cor}">${esc(x)}</li>`).join('');
  const origemGeracao = v.origemGeracao === 'manual' ? 'digitada na tela' : v.origemGeracao === 'api' ? 'monitoramento (API)' : '—';
  const formGeracao = `
<form method="post" action="/dashboard/demonstrativos/${esc(d.instalacao)}/geracao" class="flex flex-wrap gap-2 items-end mt-2">
  <input type="hidden" name="referencia" value="${esc(d.mes)}">
  <label>Geração de ${mesCurto(d.mes)} (kWh) <input name="kwh" inputmode="decimal" class="bg-gray-800 p-1 rounded" required></label>
  <button class="px-3 py-1 rounded bg-cyan-700 text-white">Salvar geração</button>
</form>`;
  const formLigar = d.leadId ? '' : `
<div class="rounded border border-slate-600 p-3 mt-3">
  <b>Ligar esta UC a um cliente</b>
  <form method="get" action="/dashboard/demonstrativos/${esc(d.instalacao)}" class="flex gap-2 mt-2">
    <input type="hidden" name="mes" value="${esc(d.mes)}">
    <input name="buscar" placeholder="nome do cliente" class="bg-gray-800 p-1 rounded"><button class="px-3 py-1 rounded bg-slate-700">Buscar</button>
  </form>
  ${d.candidatos.map((c) => `
  <form method="post" action="/dashboard/demonstrativos/${esc(d.instalacao)}/ligar" class="mt-1">
    <input type="hidden" name="lead_id" value="${esc(c.id)}"><input type="hidden" name="mes" value="${esc(d.mes)}">
    <button class="px-2 py-1 rounded bg-emerald-700 text-white">Ligar a ${esc(c.nome ?? 'sem nome')}${c.uc ? ` (UC ${esc(c.uc)})` : ''}</button>
  </form>`).join('')}
</div>`;
  const rateio = d.unidades.length > 1
    ? `<p class="mt-2">Rateio: ${d.unidades.map((u) => `${esc(u.codigoCliente)} ${u.percentual}%`).join(' · ')}</p>` : '';
  const body = `
<div style="color:#d1d5db;max-width:900px">
<a href="/dashboard/demonstrativos?mes=${esc(d.mes)}" class="text-sm text-slate-400">← Demonstrativos</a>
<h1 class="text-xl font-bold text-cyan-300 mt-1">${esc(d.clienteNome)} · UC ${esc(d.instalacao)}</h1>
${d.msg ? `<div class="rounded border border-emerald-600 p-2 my-2">${esc(d.msg)}</div>` : ''}
<div class="flex items-center gap-2 my-2">${nav(anterior, '◄')}<b>${mesCurto(d.mes)}</b>${nav(proximo, '►')}
  <span style="color:${ESTADO[v.estado].cor}" class="ml-3">${ESTADO[v.estado].txt}</span></div>
<div class="grid grid-cols-2 md:grid-cols-4 gap-2">
  ${card('☀ Gerou', kwh(v.geracaoKwh))}${card('🏠 Consumiu', kwh(d.consumoKwh))}
  ${card('💰 Economia estimada', brl(d.economiaRs))}${card('🔋 Saldo de créditos', kwh(d.saldoKwh))}
</div>
${d.proximoExpirar ? `<p class="text-amber-300 mt-2">${esc(d.proximoExpirar)}</p>` : ''}
${rateio}
<canvas id="g13" height="110" class="mt-3"></canvas>
<ul class="mt-3 text-sm">${lista(v.bloqueios, '#ef4444')}${lista(v.pendencias, '#eab308')}${lista(v.avisos, '#94a3b8')}</ul>
${v.geracaoKwh === null || v.origemGeracao === 'manual' ? formGeracao : ''}
${formLigar}
<h2 class="font-bold mt-4">De onde veio cada número</h2>
<ul class="text-sm text-slate-400">
  <li>Consumo, injetado e créditos → ${esc(ORIGEM[d.origemDemonstrativo] ?? d.origemDemonstrativo)}${d.verificado ? ' ✓ (assinatura da concessionária conferida)' : ''}</li>
  <li>Geração → ${origemGeracao}</li>
  <li>Economia estimada = compensado ${kwh(d.compensadoKwh)} × tarifa média (Lei 14.300 cobra parte do Fio B)</li>
</ul>
<p class="text-sm text-slate-500 mt-3">O relatório em PDF para o cliente chega na próxima entrega (só com tudo 🟢).</p>
</div>`;
  const hist = [...d.historico].sort((a, b) => a.mes.localeCompare(b.mes)).slice(-13);
  const scripts = `
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script>
new Chart(document.getElementById('g13'), { type: 'bar', data: {
  labels: ${JSON.stringify(hist.map((h) => mesCurto(h.mes)))},
  datasets: [
    { label: 'Consumo (kWh)', data: ${JSON.stringify(hist.map((h) => h.consumida))}, backgroundColor: '#f59e0b' },
    { label: 'Injetado (kWh)', data: ${JSON.stringify(hist.map((h) => h.injetada))}, backgroundColor: '#22d3ee' },
    { label: 'Compensado (kWh)', data: ${JSON.stringify(hist.map((h) => h.compensado))}, backgroundColor: '#22c55e' },
  ] }, options: { plugins: { legend: { labels: { color: '#cbd5e1' } } },
  scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } } } });
</script>`;
  return renderLayout({ active: 'demonstrativos', title: d.clienteNome, body, scripts, dark: true, user });
}

export type ResultadoLeituraPdf =
  | { arquivo: string; ok: true; textoB64: string; clienteNome: string; instalacao: string; referencia: string;
      injetadoKwh: number | null; consumoKwh: number | null; saldoKwh: number | null; inconsistencias: string[] }
  | { arquivo: string; ok: false; motivo: string };

export function renderEnviarPdf(user?: DashUser): string {
  const body = `
<div style="color:#d1d5db;max-width:640px">
<h1 class="text-xl font-bold text-cyan-300 mb-3">+ Enviar PDF do demonstrativo</h1>
<form method="post" action="/dashboard/demonstrativos/enviar-pdf" enctype="multipart/form-data" class="space-y-3">
  <input type="file" name="pdfs" accept="application/pdf" multiple required>
  <p class="text-sm text-slate-400">Pode escolher vários de uma vez. Nada é gravado antes de você conferir.</p>
  <button class="px-4 py-2 rounded bg-cyan-700 text-white">Ler PDFs</button>
</form></div>`;
  return renderLayout({ active: 'demonstrativos', title: 'Enviar PDF', body, dark: true, user });
}

export function renderConferenciaPdf(res: ResultadoLeituraPdf[], user?: DashUser): string {
  const blocos = res.map((r) => r.ok ? `
<div class="rounded-lg border border-slate-600 p-3 mb-3">
  <b>${esc(r.arquivo)}</b> — ${esc(r.clienteNome)} · UC ${esc(r.instalacao)} · ${mesCurto(r.referencia)}
  <div class="text-sm mt-1">Injetado ${kwh(r.injetadoKwh)} · Consumo ${kwh(r.consumoKwh)} · Saldo ${kwh(r.saldoKwh)}</div>
  ${r.inconsistencias.length ? `<ul class="text-sm" style="color:#ef4444">${r.inconsistencias.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  <form method="post" action="/dashboard/demonstrativos/confirmar" class="mt-2">
    <input type="hidden" name="texto_b64" value="${esc(r.textoB64)}">
    <button class="px-3 py-1 rounded bg-emerald-700 text-white">Confirmo — gravar</button>
  </form>
</div>` : `
<div class="rounded-lg border border-red-700 p-3 mb-3"><b>${esc(r.arquivo)}</b> — não deu pra ler: ${esc(r.motivo)}.
  Confira se é o demonstrativo de microgeração, ou use "✎ Digitar demonstrativo".</div>`).join('');
  const body = `
<div style="color:#d1d5db;max-width:900px">
<h1 class="text-xl font-bold text-cyan-300 mb-3">Conferência</h1>
<p class="text-sm text-slate-400 mb-3">Confira os números de cada PDF antes de gravar.</p>
${blocos}
<a href="/dashboard/demonstrativos" class="text-sm text-slate-400">← voltar</a>
</div>`;
  return renderLayout({ active: 'demonstrativos', title: 'Conferência', body, dark: true, user });
}

export function renderDigitar(v: Record<string, string>, erros: string[], user?: DashUser): string {
  const campo = (nome: string, rotulo: string, extra = '') =>
    `<label class="block">${rotulo} <input name="${nome}" value="${esc(v[nome] ?? '')}" class="bg-gray-800 p-1 rounded w-full" ${extra}></label>`;
  const body = `
<div style="color:#d1d5db;max-width:640px">
<h1 class="text-xl font-bold text-cyan-300 mb-3">✎ Digitar demonstrativo</h1>
${erros.length ? `<ul class="rounded border border-red-700 p-2 mb-3" style="color:#fca5a5">${erros.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
<form method="post" action="/dashboard/demonstrativos/digitar" class="space-y-2">
  ${campo('clienteNome', 'Nome do cliente', 'required')}
  <div class="grid grid-cols-2 gap-2">${campo('instalacao', 'Instalação (UC)', 'inputmode="numeric" required')}${campo('codigoCliente', 'Código do cliente (se tiver)', 'inputmode="numeric"')}</div>
  ${campo('mes', 'Mês de referência', 'type="month" required')}
  <div class="grid grid-cols-2 gap-2">${campo('injetado', 'Injetado no mês (kWh)', 'inputmode="decimal" required')}${campo('consumo', 'Consumo do mês (kWh)', 'inputmode="decimal" required')}</div>
  <div class="grid grid-cols-2 gap-2">${campo('creditoUtilizado', 'Crédito utilizado (kWh)', 'inputmode="decimal" required')}${campo('saldoAcumulado', 'Saldo acumulado (kWh)', 'inputmode="decimal" required')}</div>
  <div class="grid grid-cols-2 gap-2">${campo('proximoExpirar', 'Crédito a expirar (kWh, se tiver)', 'inputmode="decimal"')}${campo('cicloExpirar', 'Expira em', 'type="month"')}</div>
  <button class="px-4 py-2 rounded bg-cyan-700 text-white">Conferir e gravar</button>
</form></div>`;
  return renderLayout({ active: 'demonstrativos', title: 'Digitar demonstrativo', body, dark: true, user });
}
```

- [ ] **Step 4: Menu e chave de layout** — em `src/modules/dashboard/views.ts`:

4a. Na união `active` de `interface LayoutInput` (linha ~90), acrescentar `| 'demonstrativos'` (antes do `;`).

4b. No setor de usinas, logo depois da linha `{ href: '/dashboard/monitoramento', key: 'monitoramento', label: '⚡ Monitoramento', area: 'usinas' },`, inserir:

```ts
      { href: '/dashboard/demonstrativos', key: 'demonstrativos', label: '📄 Demonstrativos GD', area: 'usinas' },
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/gd-demonstrativos-views.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/dashboard/demonstrativos-views.ts src/modules/dashboard/views.ts tests/gd-demonstrativos-views.test.ts
git commit -m "feat(gd): telas de demonstrativos (lista, cliente, conferencia, digitar) + menu"
```

---

### Task 8: Rotas

**Files:**
- Modify: `src/modules/dashboard/router.ts` (novo bloco logo depois do bloco das rotas `/monitoramento`, antes de `// Importar sites em massa`)

- [ ] **Step 1: Imports** — no topo de `router.ts`, junto dos outros imports:

```ts
import {
  renderDemonstrativosLista, renderDemonstrativoCliente, renderConferenciaPdf, renderDigitar, renderEnviarPdf,
  type ResultadoLeituraPdf,
} from './demonstrativos-views.js';
```

- [ ] **Step 2: Rotas** — inserir o bloco:

```ts
  // ── Demonstrativos GD (fatia 1) — ver docs/superpowers/specs/2026-09-23-demonstrativos-tela-relatorio-design.md
  const RE_UC = /^\d{3,15}$/;
  const RE_MES = /^\d{4}-\d{2}-01$/;
  async function depsGd(req: AuthedRequest) {
    const companyId = req.dashUser!.companyId;
    const db = bancoDoOperador(req, supabase);
    const { criarRepoTelaGd } = await import('../gd/demonstrativos-tela-repo.js');
    const { criarRepoDemonstrativo } = await import('../gd/demonstrativo-repo.js');
    return { companyId, tela: criarRepoTelaGd(db, companyId), ing: criarRepoDemonstrativo(db, companyId) };
  }

  /** Grava um demonstrativo vindo da TELA (PDF enviado ou digitado): liga ao cliente, cruza, grava. */
  async function gravarDemonstrativoTela(
    req: AuthedRequest,
    dados: import('../gd/demonstrativo-parser.js').DemonstrativoGd,
    inconsistencias: string[],
    origem: 'pdf_manual' | 'digitado',
    texto: string,
  ): Promise<'gravado' | 'mantido_verificado'> {
    const { companyId, tela, ing } = await depsGd(req);
    const { cruzarDemonstrativo } = await import('../gd/demonstrativo-cruzamento.js');
    const { montarRegistro } = await import('../gd/demonstrativo-ingestao.js');
    const lead = await ing.buscarLeadPorUc(dados.instalacao, dados.codigoCliente);
    const rateio = lead ? await ing.buscarRateio(lead.id) : [];
    const geracao = lead ? await ing.geracaoDoMes(lead.id, dados.referencia) : null;
    const alertas = cruzarDemonstrativo({ dados, geracaoMesKwh: geracao, rateioCadastrado: rateio, inconsistencias });
    return tela.gravarManual(montarRegistro(dados, {
      companyId, leadId: lead?.id ?? null, inconsistencias, alertas, geracaoKwh: geracao,
      emailId: null, textoBruto: texto, verificada: false, origem, conferidoPor: req.dashUser!.id,
    }));
  }

  router.get('/demonstrativos', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const { tela, ing } = await depsGd(req);
      const { validarMes } = await import('../gd/gd-validacao.js');
      const { montarItem, filtrarItens, hojeBrasilia } = await import('../gd/demonstrativos-tela.js');
      const meses = await tela.mesesDisponiveis();
      const pedido = typeof req.query.mes === 'string' && RE_MES.test(req.query.mes) ? req.query.mes : null;
      const mes = pedido && meses.includes(pedido) ? pedido : meses[0] ?? null;
      const linhas = mes ? await tela.listarDoMes(mes) : [];
      const manuais = mes ? await tela.geracoesManuais(linhas.map((l) => l.instalacao), mes) : new Map();
      const hoje = hojeBrasilia();
      const itens = [];
      for (const l of linhas) {
        const sis = l.lead_id ? await tela.sistemaDoLead(l.lead_id) : { potenciaKwp: null, uf: null };
        const api = l.lead_id ? await ing.geracaoDoMes(l.lead_id, l.referencia) : null;
        const v = validarMes({
          leadId: l.lead_id, referencia: l.referencia, injetadoKwh: l.injetado_kwh,
          inconsistenciasLeitura: l.inconsistencias,
          geracaoManualKwh: manuais.get(`${l.instalacao}|${l.referencia}`)?.kwh ?? null,
          geracaoApiKwh: api, potenciaKwp: sis.potenciaKwp, uf: sis.uf,
        });
        itens.push(montarItem(l, v, hoje));
      }
      const filtro = {
        estado: typeof req.query.estado === 'string' ? req.query.estado : undefined,
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
      };
      const msg = typeof req.query.msg === 'string' ? req.query.msg : null;
      res.type('html').send(renderDemonstrativosLista({ itens: filtrarItens(itens, filtro), meses, mes, filtro, msg }, req.dashUser));
    } catch (err) {
      console.error('[demonstrativos]', err);
      res.status(500).send(`<h2>Erro ao listar demonstrativos</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  router.get('/demonstrativos/enviar-pdf', exigir('usinas', 'editar'), (req: AuthedRequest, res: Response) => {
    res.type('html').send(renderEnviarPdf(req.dashUser));
  });

  router.post('/demonstrativos/enviar-pdf', exigir('usinas', 'editar'), uploadPdf.array('pdfs', 20), async (req: AuthedRequest, res: Response) => {
    try {
      const { extrairTextoPdf } = await import('../gd/demonstrativo-io.js');
      const { parseDemonstrativo } = await import('../gd/demonstrativo-parser.js');
      const arquivos = (req.files as Express.Multer.File[] | undefined) ?? [];
      const out: ResultadoLeituraPdf[] = [];
      for (const f of arquivos) {
        try {
          const texto = await extrairTextoPdf(new Uint8Array(f.buffer));
          const r = parseDemonstrativo(texto);
          out.push(r.ok
            ? { arquivo: f.originalname, ok: true, textoB64: Buffer.from(texto, 'utf-8').toString('base64'),
                clienteNome: r.dados.clienteNome, instalacao: r.dados.instalacao, referencia: r.dados.referencia,
                injetadoKwh: r.dados.injetadoKwh, consumoKwh: r.dados.consumoKwh, saldoKwh: r.dados.saldoAcumuladoKwh,
                inconsistencias: r.inconsistencias }
            : { arquivo: f.originalname, ok: false, motivo: r.motivo });
        } catch (e) {
          out.push({ arquivo: f.originalname, ok: false, motivo: `PDF ilegível (${(e as Error).message})` });
        }
      }
      res.type('html').send(renderConferenciaPdf(out, req.dashUser));
    } catch (err) {
      console.error('[demonstrativos/enviar-pdf]', err);
      res.status(500).send(`<h2>Erro ao ler PDFs</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  // Confirmação: o servidor LÊ DE NOVO o texto (nunca grava número vindo do navegador).
  router.post('/demonstrativos/confirmar', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    try {
      const { parseDemonstrativo } = await import('../gd/demonstrativo-parser.js');
      const texto = Buffer.from(String(req.body?.texto_b64 ?? ''), 'base64').toString('utf-8');
      const r = parseDemonstrativo(texto);
      if (!r.ok) { res.redirect('/dashboard/demonstrativos?msg=' + encodeURIComponent(`Não gravei: ${r.motivo}`)); return; }
      const st = await gravarDemonstrativoTela(req, r.dados, r.inconsistencias, 'pdf_manual', texto);
      const msg = st === 'gravado'
        ? 'Demonstrativo gravado.'
        : 'Esse mês já veio confirmado da concessionária por e-mail — mantive o que estava.';
      res.redirect(`/dashboard/demonstrativos/${r.dados.instalacao}?mes=${r.dados.referencia}&msg=${encodeURIComponent(msg)}`);
    } catch (err) {
      console.error('[demonstrativos/confirmar]', err);
      res.status(500).send(`<h2>Erro ao gravar</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  router.get('/demonstrativos/digitar', exigir('usinas', 'editar'), (req: AuthedRequest, res: Response) => {
    res.type('html').send(renderDigitar({}, [], req.dashUser));
  });

  router.post('/demonstrativos/digitar', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    try {
      const { montarDigitado } = await import('../gd/gd-formulario.js');
      const campos = ['clienteNome', 'codigoCliente', 'instalacao', 'mes', 'injetado', 'consumo',
        'creditoUtilizado', 'saldoAcumulado', 'proximoExpirar', 'cicloExpirar'] as const;
      const v = Object.fromEntries(campos.map((c) => [c, String(req.body?.[c] ?? '')])) as Record<(typeof campos)[number], string>;
      const r = montarDigitado(v);
      if (!r.ok) { res.type('html').send(renderDigitar(v, r.erros, req.dashUser)); return; }
      const st = await gravarDemonstrativoTela(req, r.dados, [], 'digitado', '');
      const msg = st === 'gravado' ? 'Demonstrativo gravado.' : 'Esse mês já veio confirmado da concessionária — mantive o que estava.';
      res.redirect(`/dashboard/demonstrativos/${r.dados.instalacao}?mes=${r.dados.referencia}&msg=${encodeURIComponent(msg)}`);
    } catch (err) {
      console.error('[demonstrativos/digitar]', err);
      res.status(500).send(`<h2>Erro ao gravar</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  router.get('/demonstrativos/:instalacao', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const inst = String(req.params.instalacao);
      if (!RE_UC.test(inst)) { res.status(400).send('UC inválida'); return; }
      const { tela, ing } = await depsGd(req);
      const { validarMes } = await import('../gd/gd-validacao.js');
      const { compensadoDoMes, economiaEstimadaRs, alertaVencimento, TARIFA_PADRAO_RS_KWH, hojeBrasilia } = await import('../gd/demonstrativos-tela.js');
      const hist = await tela.historicoDaInstalacao(inst);
      if (hist.length === 0) { res.status(404).send('<h2>Nenhum demonstrativo dessa UC</h2>'); return; }
      const meses = hist.map((h) => h.referencia);
      const pedido = typeof req.query.mes === 'string' ? req.query.mes : '';
      const l = hist.find((h) => h.referencia === pedido) ?? hist[0];
      const manual = (await tela.geracoesManuais([inst], l.referencia)).get(`${inst}|${l.referencia}`)?.kwh ?? null;
      const sis = l.lead_id ? await tela.sistemaDoLead(l.lead_id) : { potenciaKwp: null, uf: null };
      const api = l.lead_id ? await ing.geracaoDoMes(l.lead_id, l.referencia) : null;
      const validacao = validarMes({
        leadId: l.lead_id, referencia: l.referencia, injetadoKwh: l.injetado_kwh, inconsistenciasLeitura: l.inconsistencias,
        geracaoManualKwh: manual, geracaoApiKwh: api, potenciaKwp: sis.potenciaKwp, uf: sis.uf,
      });
      const compensado = compensadoDoMes(l);
      const buscar = typeof req.query.buscar === 'string' ? req.query.buscar : '';
      const candidatos = !l.lead_id && buscar ? await tela.buscarLeads(buscar) : [];
      res.type('html').send(renderDemonstrativoCliente({
        instalacao: inst, clienteNome: l.cliente_nome, leadId: l.lead_id, meses, mes: l.referencia,
        consumoKwh: l.consumo_kwh, injetadoKwh: l.injetado_kwh, saldoKwh: l.saldo_acumulado_kwh,
        compensadoKwh: compensado, economiaRs: economiaEstimadaRs(compensado, TARIFA_PADRAO_RS_KWH),
        proximoExpirar: alertaVencimento(l.proximo_expirar_kwh, l.ciclo_expirar, hojeBrasilia()),
        historico: l.historico.map((h) => ({ mes: h.mes, consumida: h.consumida, injetada: h.injetada, compensado: h.compensado })),
        unidades: l.unidades, origemDemonstrativo: l.origem, verificado: l.origem_verificada,
        validacao, candidatos, msg: typeof req.query.msg === 'string' ? req.query.msg : null,
      }, req.dashUser));
    } catch (err) {
      console.error('[demonstrativos/cliente]', err);
      res.status(500).send(`<h2>Erro ao abrir demonstrativo</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  router.post('/demonstrativos/:instalacao/geracao', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    try {
      const inst = String(req.params.instalacao);
      const ref = String(req.body?.referencia ?? '');
      if (!RE_UC.test(inst) || !RE_MES.test(ref)) { res.status(400).send('Dados inválidos'); return; }
      const { numeroForm } = await import('../gd/gd-formulario.js');
      const kwhV = numeroForm(String(req.body?.kwh ?? ''));
      const volta = (m: string) => res.redirect(`/dashboard/demonstrativos/${inst}?mes=${ref}&msg=${encodeURIComponent(m)}`);
      if (kwhV === null) { volta('Geração inválida — use números, ex.: 612,4'); return; }
      const { tela } = await depsGd(req);
      const linha = (await tela.historicoDaInstalacao(inst)).find((h) => h.referencia === ref);
      if (!linha) { res.status(404).send('Mês não encontrado'); return; }
      await tela.salvarGeracaoManual({ leadId: linha.lead_id, instalacao: inst, referencia: ref, kwh: kwhV, conferidoPor: req.dashUser!.id });
      volta('Geração salva.');
    } catch (err) {
      console.error('[demonstrativos/geracao]', err);
      res.status(500).send(`<h2>Erro ao salvar geração</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  router.post('/demonstrativos/:instalacao/ligar', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    try {
      const inst = String(req.params.instalacao);
      const mes = String(req.body?.mes ?? '');
      if (!RE_UC.test(inst)) { res.status(400).send('UC inválida'); return; }
      const { tela } = await depsGd(req);
      const lead = await tela.leadDaEmpresa(String(req.body?.lead_id ?? ''));
      if (!lead) { res.status(404).send('Cliente não encontrado nesta empresa'); return; }
      await tela.ligarLead(inst, lead.id);
      res.redirect(`/dashboard/demonstrativos/${inst}?mes=${encodeURIComponent(mes)}&msg=${encodeURIComponent(`Ligado a ${lead.nome ?? 'cliente'}.`)}`);
    } catch (err) {
      console.error('[demonstrativos/ligar]', err);
      res.status(500).send(`<h2>Erro ao ligar cliente</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });
```

Obs.: as rotas fixas (`/enviar-pdf`, `/confirmar`, `/digitar`) ficam ANTES de `/:instalacao` — o Express casa na ordem. `uploadPdf` já existe (linha ~721, limite 10 MB por arquivo) — o bloco precisa ficar DEPOIS da declaração de `uploadPdf`; se o bloco das `/monitoramento` estiver antes da linha 721, colocar o bloco dos demonstrativos logo depois da declaração `const uploadPfx = ...`.

- [ ] **Step 3: Tipos**

Run: `npx tsc --noEmit`
Expected: sem erros. (Se `Express.Multer.File` não resolver, usar `import type { Request as ExpReq } from 'express'` não é preciso — o `@types/multer` já está nas dependências e declara o namespace global `Express.Multer`.)

- [ ] **Step 4: Todos os testes**

Run: `npx vitest run`
Expected: tudo verde (os ~3.9 mil testes antigos + os novos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/router.ts
git commit -m "feat(gd): rotas da tela de demonstrativos (lista, cliente, PDF, digitar, geracao, ligar)"
```

---

### Task 9: Ajuste do spec + conferência final

**Files:**
- Modify: `docs/superpowers/specs/2026-09-23-demonstrativos-tela-relatorio-design.md`

- [ ] **Step 1: Alinhar o spec com as decisões da implementação** — trocar a linha:

`Acesso por permissão nova \`demonstrativos\` (padrão das outras telas, \`exigir(...)\`). Tudo filtrado por`

por:

`Acesso pela área \`usinas\` (visualizar/editar — mesma do Monitoramento; área nova exigiria mexer em todos os papéis). Tudo filtrado por`

e, na tabela de travas, a linha "Geração plausível" passa a dizer: `entre 40 % e 160 % do esperado do monitoramento (\`esperadoDiaKwh(kWp, UF)\` × dias do mês — mesma régua da tela de Monitoramento; sem kWp: só avisa)`.

- [ ] **Step 2: Verificação completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erro de tipo; todos os testes passam.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-23-demonstrativos-tela-relatorio-design.md
git commit -m "docs(gd): spec alinhado (area usinas, regua do monitoramento)"
```

- [ ] **Step 4: Entrega ao Junior (não é código)**

1. Mostrar o SQL da `131_demonstrativos_tela.sql` pronto pra colar no SQL Editor do projeto **kupnsoyymulbdzakqlqc** (produção) — conferir o ref na barra de endereço; se aparecer o aviso "Potential issues detected", clicar em **Run** (não Cancel).
2. Pedir autorização pra `git push` e abrir o PR (com o comando de merge pronto).
3. Depois do Implantar: abrir `/dashboard/demonstrativos`, conferir o João Rangel (jul e ago/2026), enviar um PDF de teste e digitar uma geração — mandar prints pro Junior aprovar.
