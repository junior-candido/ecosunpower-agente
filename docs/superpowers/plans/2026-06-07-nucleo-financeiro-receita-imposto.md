# Núcleo Financeiro (Receita + Imposto multi-anexo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o lado-receita do Departamento Financeiro: venda → conta a receber → recebido → imposto progressivo (Simples Nacional, 5 anexos, segregado por atividade) → RBT12 rolante, com tela dark-neon, comando `/imposto`, engate no `/fechar` e alertas (DAS, salto de faixa, Fator R).

**Architecture:** Motor de imposto puro e testável (`financeiro/imposto.ts`, sem banco) no centro; uma camada de dados (migration 046 + repo) ao redor; e as bordas (comandos zap, tela, alertas) chamando sempre o motor puro. Tabelas de anexo e catálogo de atividades dirigidos por dados (constante TS espelhada no banco) pra revenda futura. **A Eva nunca calcula imposto de cabeça — sempre chama o motor.**

**Tech Stack:** TypeScript ESM (Node 20), vitest, Supabase (`@supabase/supabase-js`), Express (dashboard), WhatsApp Cloud API (`meta-whatsapp.ts`). Spec: `docs/superpowers/specs/2026-06-07-nucleo-financeiro-receita-imposto-design.md`.

**Convenções do repo (confirmadas):**
- Testes em `tests/<nome>.test.ts`, importam de `../src/modules/<x>.js` (extensão `.js` no import mesmo em `.ts`). Rodar: `npm test`.
- Supabase: classe `SupabaseService` em `src/modules/supabase.ts`; cliente cru via `supabase.getClient()`.
- Migrations: `supabase/migrations/NNN_slug.sql` com cabeçalho comentado. Próxima = **046**. **Aplicada manual pelo Junior no SQL Editor** (MCP aponta pro projeto errado).
- Comandos: objeto `reroute` em `src/index.ts` (~2886); handler `(from: string, text: string) => Promise<boolean>`.
- Botões: `metaWaba.sendInteractiveButtons(to, body, buttons[1..3], footer?)`; ids roteados por prefixo (ex.: `evabt:`).
- Valor da venda: `dados_snapshot.comercial.valor_total_brl` (`src/modules/closing/types.ts`).

---

## File Structure

**Motor puro (sem banco):**
- Create `src/modules/financeiro/anexos.ts` — tabelas dos 5 anexos (constante) + tipos.
- Create `src/modules/financeiro/imposto.ts` — fórmula efetiva, faixa, Fator R, pró-labore mínimo, próximo salto.
- Create `src/modules/financeiro/rbt12.ts` — soma de buckets → RBT12 rolante (puro).

**Camada de dados:**
- Create `supabase/migrations/046_financeiro_nucleo.sql` — 5 tabelas + seeds.
- Create `src/modules/financeiro/repo.ts` — wrappers Supabase (RBT12, atividades, parâmetros, contas a receber).
- Create `src/modules/financeiro/contas.ts` — orquestração (cria conta a partir do fechamento; registra recebimento) usando repo + imposto.

**Bordas:**
- Create `src/modules/financeiro/comando-imposto.ts` — handler do `/imposto`.
- Modify `src/index.ts` — registrar `/imposto`; engatar criação da conta no `/fechar`; rotear botões de recebimento/segregação.
- Create `src/modules/dashboard/financeiro-queries.ts` + `financeiro-views.ts` — tela.
- Modify `src/modules/dashboard/router.ts` — rotas `/financeiro` e `/financeiro/data`.
- Create `src/modules/financeiro/alertas.ts` — detecção DAS/faixa/Fator R.
- Modify `src/index.ts` — cron diário dos alertas financeiros.
- Create `scripts/seed-financeiro-receita.ts` — semeia faturamento 2025.
- Modify `src/build-info.ts` — novo build marker.

**Testes:** `tests/financeiro-imposto.test.ts`, `tests/financeiro-rbt12.test.ts`, `tests/financeiro-contas.test.ts`, `tests/financeiro-alertas.test.ts`.

---

## FASE 1 — Motor de imposto (puro, TDD)

### Task 1: Tabelas dos anexos + faixa + alíquota efetiva

**Files:**
- Create: `src/modules/financeiro/anexos.ts`
- Create: `src/modules/financeiro/imposto.ts`
- Test: `tests/financeiro-imposto.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// tests/financeiro-imposto.test.ts
import { describe, it, expect } from 'vitest';
import { faixaPorRBT12, aliquotaEfetiva } from '../src/modules/financeiro/imposto.js';

describe('financeiro/imposto: faixa por RBT12', () => {
  it('faixas pelos limites do Anexo (LC 123/2006)', () => {
    expect(faixaPorRBT12(150000)).toBe(1);
    expect(faixaPorRBT12(180000)).toBe(1);      // limite superior inclusivo
    expect(faixaPorRBT12(180000.01)).toBe(2);
    expect(faixaPorRBT12(355000)).toBe(2);
    expect(faixaPorRBT12(400000)).toBe(3);
    expect(faixaPorRBT12(1000000)).toBe(4);
    expect(faixaPorRBT12(3600000)).toBe(5);
    expect(faixaPorRBT12(4000000)).toBe(6);
  });
});

describe('financeiro/imposto: alíquota efetiva progressiva', () => {
  const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

  it('Anexo III progressivo bate com a lei', () => {
    expect(round4(aliquotaEfetiva(150000, 'III').efetiva)).toBe(0.06);     // 6,00%
    expect(round4(aliquotaEfetiva(355000, 'III').efetiva)).toBe(0.0856);   // 8,56%
    expect(round4(aliquotaEfetiva(400000, 'III').efetiva)).toBe(0.0909);   // 9,09%
    expect(round4(aliquotaEfetiva(700000, 'III').efetiva)).toBe(0.1098);   // 10,98%
    expect(round4(aliquotaEfetiva(1000000, 'III').efetiva)).toBe(0.1244);  // 12,44%
  });

  it('Anexo I (comércio) é mais barato que III no mesmo RBT12', () => {
    expect(round4(aliquotaEfetiva(355000, 'I').efetiva)).toBe(0.0563);     // 5,63%
  });

  it('Anexo V (agenciamento sem Fator R) é mais caro', () => {
    expect(round4(aliquotaEfetiva(355000, 'V').efetiva)).toBe(0.1673);     // 16,73%
  });

  it('RBT12 = 0 cai na faixa 1 sem dividir por zero', () => {
    expect(aliquotaEfetiva(0, 'III').efetiva).toBe(0.06);
    expect(aliquotaEfetiva(0, 'III').faixa).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- financeiro-imposto`
Expected: FAIL — "Cannot find module '../src/modules/financeiro/imposto.js'".

- [ ] **Step 3: Criar a tabela dos anexos**

```typescript
// src/modules/financeiro/anexos.ts
// Tabelas do Simples Nacional (LC 123/2006, vigentes 2026). Anexo III + fórmula
// confirmados por deep-research 07/06/2026; Anexos I/II/IV/V de fonte secundária
// convergente com a lei (confirmar I e V com contador). Espelhadas na migration 046.

export type Anexo = 'I' | 'II' | 'III' | 'IV' | 'V';

export interface LinhaAnexo {
  faixa: number;   // 1..6
  nominal: number; // decimal (ex.: 0.112 = 11,2%)
  deduzir: number; // R$
}

// Limites de RBT12 por faixa (iguais pra todos os anexos).
export const LIMITES_FAIXA: number[] = [180000, 360000, 720000, 1800000, 3600000, 4800000];

// nominal/deduzir por anexo, faixa 1..6 em ordem.
export const ANEXOS: Record<Anexo, LinhaAnexo[]> = {
  I: [
    { faixa: 1, nominal: 0.04, deduzir: 0 },
    { faixa: 2, nominal: 0.073, deduzir: 5940 },
    { faixa: 3, nominal: 0.095, deduzir: 13860 },
    { faixa: 4, nominal: 0.107, deduzir: 22500 },
    { faixa: 5, nominal: 0.143, deduzir: 87300 },
    { faixa: 6, nominal: 0.19, deduzir: 378000 },
  ],
  II: [
    { faixa: 1, nominal: 0.045, deduzir: 0 },
    { faixa: 2, nominal: 0.078, deduzir: 5940 },
    { faixa: 3, nominal: 0.10, deduzir: 13860 },
    { faixa: 4, nominal: 0.112, deduzir: 22500 },
    { faixa: 5, nominal: 0.147, deduzir: 85500 },
    { faixa: 6, nominal: 0.30, deduzir: 720000 },
  ],
  III: [
    { faixa: 1, nominal: 0.06, deduzir: 0 },
    { faixa: 2, nominal: 0.112, deduzir: 9360 },
    { faixa: 3, nominal: 0.135, deduzir: 17640 },
    { faixa: 4, nominal: 0.16, deduzir: 35640 },
    { faixa: 5, nominal: 0.21, deduzir: 125640 },
    { faixa: 6, nominal: 0.33, deduzir: 648000 },
  ],
  IV: [
    { faixa: 1, nominal: 0.045, deduzir: 0 },
    { faixa: 2, nominal: 0.09, deduzir: 8100 },
    { faixa: 3, nominal: 0.102, deduzir: 12420 },
    { faixa: 4, nominal: 0.14, deduzir: 39780 },
    { faixa: 5, nominal: 0.22, deduzir: 183780 },
    { faixa: 6, nominal: 0.33, deduzir: 828000 },
  ],
  V: [
    { faixa: 1, nominal: 0.155, deduzir: 0 },
    { faixa: 2, nominal: 0.18, deduzir: 4500 },
    { faixa: 3, nominal: 0.195, deduzir: 9900 },
    { faixa: 4, nominal: 0.205, deduzir: 17100 },
    { faixa: 5, nominal: 0.23, deduzir: 62100 },
    { faixa: 6, nominal: 0.305, deduzir: 540000 },
  ],
};
```

- [ ] **Step 4: Implementar faixa + alíquota efetiva**

```typescript
// src/modules/financeiro/imposto.ts
import { ANEXOS, LIMITES_FAIXA, type Anexo } from './anexos.js';

export interface ResultadoAliquota {
  faixa: number;
  nominal: number;
  deduzir: number;
  efetiva: number; // decimal
}

export function faixaPorRBT12(rbt12: number): number {
  for (let i = 0; i < LIMITES_FAIXA.length; i++) {
    if (rbt12 <= LIMITES_FAIXA[i]) return i + 1;
  }
  return 6; // acima do teto, trata como 6ª (fora do Simples é outro problema)
}

export function aliquotaEfetiva(rbt12: number, anexo: Anexo): ResultadoAliquota {
  const faixa = faixaPorRBT12(rbt12);
  const linha = ANEXOS[anexo][faixa - 1];
  const efetiva =
    rbt12 <= 0 ? ANEXOS[anexo][0].nominal : (rbt12 * linha.nominal - linha.deduzir) / rbt12;
  return { faixa, nominal: linha.nominal, deduzir: linha.deduzir, efetiva };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- financeiro-imposto`
Expected: PASS (todos os casos).

- [ ] **Step 6: Commit**

```bash
git add src/modules/financeiro/anexos.ts src/modules/financeiro/imposto.ts tests/financeiro-imposto.test.ts
git commit -m "feat(financeiro): tabelas dos 5 anexos + alíquota efetiva progressiva (TDD)"
```

---

### Task 2: Imposto da venda + próximo salto de faixa

**Files:**
- Modify: `src/modules/financeiro/imposto.ts`
- Test: `tests/financeiro-imposto.test.ts`

- [ ] **Step 1: Adicionar testes que falham**

```typescript
// tests/financeiro-imposto.test.ts  (acrescentar ao import e ao final)
import { faixaPorRBT12, aliquotaEfetiva, impostoDaVenda, proximoSalto } from '../src/modules/financeiro/imposto.js';

describe('financeiro/imposto: imposto de uma venda de R$ 30.000', () => {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  it('imposto por anexo no RBT12 de R$ 355.000', () => {
    expect(round2(impostoDaVenda(30000, 355000, 'I').imposto)).toBe(1688.03);
    expect(round2(impostoDaVenda(30000, 355000, 'III').imposto)).toBe(2569.01);
    expect(round2(impostoDaVenda(30000, 355000, 'V').imposto)).toBe(5019.72);
  });
  it('imposto Anexo III progressivo', () => {
    expect(round2(impostoDaVenda(30000, 150000, 'III').imposto)).toBe(1800);
    expect(round2(impostoDaVenda(30000, 700000, 'III').imposto)).toBe(3294);
  });
});

describe('financeiro/imposto: próximo salto de faixa', () => {
  it('aponta o limite e a distância', () => {
    expect(proximoSalto(355000)).toEqual({ limite: 360000, distancia: 5000 });
    expect(proximoSalto(150000)).toEqual({ limite: 180000, distancia: 30000 });
  });
  it('null quando já na última faixa', () => {
    expect(proximoSalto(4000000)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- financeiro-imposto`
Expected: FAIL — "impostoDaVenda is not a function".

- [ ] **Step 3: Implementar**

```typescript
// src/modules/financeiro/imposto.ts  (acrescentar)
export interface ResultadoImposto {
  imposto: number;
  efetiva: number;
  faixa: number;
}

export function impostoDaVenda(valor: number, rbt12: number, anexo: Anexo): ResultadoImposto {
  const a = aliquotaEfetiva(rbt12, anexo);
  return { imposto: valor * a.efetiva, efetiva: a.efetiva, faixa: a.faixa };
}

export function proximoSalto(rbt12: number): { limite: number; distancia: number } | null {
  for (const limite of LIMITES_FAIXA) {
    if (rbt12 < limite) return { limite, distancia: limite - rbt12 };
  }
  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- financeiro-imposto`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/imposto.ts tests/financeiro-imposto.test.ts
git commit -m "feat(financeiro): impostoDaVenda + proximoSalto de faixa (TDD)"
```

---

### Task 3: Fator R, resolução de anexo e pró-labore mínimo

**Files:**
- Modify: `src/modules/financeiro/imposto.ts`
- Test: `tests/financeiro-imposto.test.ts`

- [ ] **Step 1: Adicionar testes que falham**

```typescript
// tests/financeiro-imposto.test.ts  (acrescentar import e bloco)
import {
  faixaPorRBT12, aliquotaEfetiva, impostoDaVenda, proximoSalto,
  fatorR, resolverAnexo, proLaboreMinimoParaAnexoIII,
} from '../src/modules/financeiro/imposto.js';

describe('financeiro/imposto: Fator R', () => {
  const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
  it('>= 28% vai pro Anexo III; < 28% vai pro V', () => {
    expect(fatorR(100000, 355000).anexo).toBe('III'); // 28,17%
    expect(round4(fatorR(100000, 355000).ratio)).toBe(0.2817);
    expect(fatorR(90000, 355000).anexo).toBe('V');    // 25,35%
  });
  it('receita zero não divide por zero', () => {
    expect(fatorR(0, 0).ratio).toBe(0);
    expect(fatorR(0, 0).anexo).toBe('V');
  });
});

describe('financeiro/imposto: resolverAnexo aplica Fator R só em quem é sujeito', () => {
  it('atividade não sujeita usa o anexo padrão', () => {
    expect(resolverAnexo('I', false, 0, 355000)).toBe('I');   // comércio sempre I
    expect(resolverAnexo('III', false, 0, 355000)).toBe('III'); // instalação sempre III
  });
  it('atividade sujeita (agenciamento) vira III ou V pelo Fator R', () => {
    expect(resolverAnexo('V', true, 100000, 355000)).toBe('III'); // FR 28,17%
    expect(resolverAnexo('V', true, 90000, 355000)).toBe('V');    // FR 25,35%
  });
});

describe('financeiro/imposto: pró-labore mínimo pra manter Anexo III', () => {
  it('28% da receita, descontando outras folhas, dividido por 12', () => {
    // 0,28 * 355000 = 99400; sem outras folhas → 99400/12 = 8283,33/mês
    expect(Math.round(proLaboreMinimoParaAnexoIII(355000, 0))).toBe(8283);
    // com 12k de outras folhas no ano → (99400-12000)/12 = 7283,33
    expect(Math.round(proLaboreMinimoParaAnexoIII(355000, 12000))).toBe(7283);
  });
  it('nunca negativo', () => {
    expect(proLaboreMinimoParaAnexoIII(10000, 100000)).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- financeiro-imposto`
Expected: FAIL — "fatorR is not a function".

- [ ] **Step 3: Implementar**

```typescript
// src/modules/financeiro/imposto.ts  (acrescentar)
export const FATOR_R_MINIMO = 0.28;

export function fatorR(folha12: number, receita12: number): { ratio: number; anexo: 'III' | 'V' } {
  const ratio = receita12 <= 0 ? 0 : folha12 / receita12;
  return { ratio, anexo: ratio >= FATOR_R_MINIMO ? 'III' : 'V' };
}

export function resolverAnexo(
  anexoPadrao: Anexo,
  sujeitoFatorR: boolean,
  folha12: number,
  receita12: number,
): Anexo {
  if (!sujeitoFatorR) return anexoPadrao;
  return fatorR(folha12, receita12).anexo;
}

// Pró-labore mensal mínimo pra manter Fator R >= 28% (folha = proLabore12 + outras).
export function proLaboreMinimoParaAnexoIII(receita12: number, outrasFolhas12: number): number {
  const folha12Min = FATOR_R_MINIMO * receita12;
  const proLabore12 = Math.max(0, folha12Min - outrasFolhas12);
  return proLabore12 / 12;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- financeiro-imposto`
Expected: PASS (todos os blocos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/imposto.ts tests/financeiro-imposto.test.ts
git commit -m "feat(financeiro): Fator R + resolverAnexo + pró-labore mínimo (TDD)"
```

---

### Task 4: RBT12 rolante a partir de buckets mensais (puro)

**Files:**
- Create: `src/modules/financeiro/rbt12.ts`
- Test: `tests/financeiro-rbt12.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// tests/financeiro-rbt12.test.ts
import { describe, it, expect } from 'vitest';
import { mesesAnteriores, calcularRBT12, type BucketReceita } from '../src/modules/financeiro/rbt12.js';

describe('financeiro/rbt12: meses anteriores', () => {
  it('lista os 12 meses antes de jun/2026 (não inclui o próprio mês)', () => {
    const m = mesesAnteriores('2026-06', 12);
    expect(m).toHaveLength(12);
    expect(m[0]).toBe('2026-05');
    expect(m[11]).toBe('2025-06');
    expect(m).not.toContain('2026-06');
  });
});

describe('financeiro/rbt12: soma rolante', () => {
  const buckets: BucketReceita[] = [
    { competencia: '2025-05', receita: 99999 }, // fora da janela de jun/2026
    { competencia: '2025-06', receita: 10000 },
    { competencia: '2026-01', receita: 20000 },
    { competencia: '2026-05', receita: 5000 },
    { competencia: '2026-06', receita: 7777 },  // mês de apuração, não entra
  ];
  it('soma só os 12 meses anteriores à competência de referência', () => {
    expect(calcularRBT12(buckets, '2026-06')).toBe(35000); // 10000+20000+5000
  });
  it('zero quando não há histórico', () => {
    expect(calcularRBT12([], '2026-06')).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- financeiro-rbt12`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```typescript
// src/modules/financeiro/rbt12.ts
export interface BucketReceita {
  competencia: string; // 'YYYY-MM'
  receita: number;
}

// Os n meses ANTERIORES à competência (não inclui o próprio mês de apuração).
export function mesesAnteriores(competencia: string, n: number): string[] {
  const [y, m] = competencia.split('-').map(Number);
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    out.push(`${d.getUTCFullYear()}-${mm}`);
  }
  return out;
}

// RBT12 = receita bruta acumulada nos 12 meses anteriores ao período de apuração.
export function calcularRBT12(buckets: BucketReceita[], competenciaRef: string): number {
  const janela = new Set(mesesAnteriores(competenciaRef, 12));
  return buckets
    .filter((b) => janela.has(b.competencia))
    .reduce((soma, b) => soma + b.receita, 0);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- financeiro-rbt12`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/rbt12.ts tests/financeiro-rbt12.test.ts
git commit -m "feat(financeiro): RBT12 rolante a partir de buckets mensais (TDD)"
```

---

## FASE 2 — Dados (migration + repo)

### Task 5: Migration 046 — 5 tabelas + seeds

**Files:**
- Create: `supabase/migrations/046_financeiro_nucleo.sql`

- [ ] **Step 1: Escrever a migration completa**

```sql
-- supabase/migrations/046_financeiro_nucleo.sql
-- Núcleo Financeiro (Fatia 2) — lado receita + imposto multi-anexo.
-- Spec: docs/superpowers/specs/2026-06-07-nucleo-financeiro-receita-imposto-design.md
-- 5 tabelas: anexos (referência), atividades (catálogo), receita_mensal (buckets RBT12),
-- contas_a_receber (uma por venda), parametros (config da empresa).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Tabelas de referência dos anexos do Simples (espelha src/modules/financeiro/anexos.ts)
CREATE TABLE IF NOT EXISTS financeiro_anexos (
  anexo text NOT NULL,
  faixa int NOT NULL,
  rbt12_min numeric(14,2) NOT NULL,
  rbt12_max numeric(14,2) NOT NULL,
  nominal numeric(7,4) NOT NULL,
  deduzir numeric(14,2) NOT NULL,
  PRIMARY KEY (anexo, faixa),
  CONSTRAINT financeiro_anexos_anexo_check CHECK (anexo IN ('I','II','III','IV','V')),
  CONSTRAINT financeiro_anexos_faixa_check CHECK (faixa BETWEEN 1 AND 6)
);

INSERT INTO financeiro_anexos (anexo, faixa, rbt12_min, rbt12_max, nominal, deduzir) VALUES
  ('I',1,0,180000,0.0400,0),('I',2,180000.01,360000,0.0730,5940),('I',3,360000.01,720000,0.0950,13860),
  ('I',4,720000.01,1800000,0.1070,22500),('I',5,1800000.01,3600000,0.1430,87300),('I',6,3600000.01,4800000,0.1900,378000),
  ('II',1,0,180000,0.0450,0),('II',2,180000.01,360000,0.0780,5940),('II',3,360000.01,720000,0.1000,13860),
  ('II',4,720000.01,1800000,0.1120,22500),('II',5,1800000.01,3600000,0.1470,85500),('II',6,3600000.01,4800000,0.3000,720000),
  ('III',1,0,180000,0.0600,0),('III',2,180000.01,360000,0.1120,9360),('III',3,360000.01,720000,0.1350,17640),
  ('III',4,720000.01,1800000,0.1600,35640),('III',5,1800000.01,3600000,0.2100,125640),('III',6,3600000.01,4800000,0.3300,648000),
  ('IV',1,0,180000,0.0450,0),('IV',2,180000.01,360000,0.0900,8100),('IV',3,360000.01,720000,0.1020,12420),
  ('IV',4,720000.01,1800000,0.1400,39780),('IV',5,1800000.01,3600000,0.2200,183780),('IV',6,3600000.01,4800000,0.3300,828000),
  ('V',1,0,180000,0.1550,0),('V',2,180000.01,360000,0.1800,4500),('V',3,360000.01,720000,0.1950,9900),
  ('V',4,720000.01,1800000,0.2050,17100),('V',5,1800000.01,3600000,0.2300,62100),('V',6,3600000.01,4800000,0.3050,540000)
ON CONFLICT (anexo, faixa) DO NOTHING;

-- 2) Catálogo de atividades (atividade -> anexo); configurável (revenda futura)
CREATE TABLE IF NOT EXISTS financeiro_atividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnae text,
  anexo_padrao text NOT NULL,
  sujeito_fator_r boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_atividades_anexo_check CHECK (anexo_padrao IN ('I','II','III','IV','V'))
);

INSERT INTO financeiro_atividades (nome, cnae, anexo_padrao, sujeito_fator_r) VALUES
  ('Instalação / serviço',            '4321-5/00', 'III', false),
  ('Equipamento / material (loja)',   '4742-3/00', 'I',   false),
  ('Comissão / repasse distribuidor', '7490-1/04', 'V',   true)
ON CONFLICT DO NOTHING;

-- 3) Receita realizada por mês (buckets pro RBT12 rolante)
CREATE TABLE IF NOT EXISTS financeiro_receita_mensal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia text NOT NULL,                 -- 'YYYY-MM'
  atividade_id uuid REFERENCES financeiro_atividades(id) ON DELETE SET NULL,
  receita numeric(14,2) NOT NULL DEFAULT 0,
  origem text NOT NULL DEFAULT 'sistema',    -- 'seed' | 'sistema'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_receita_comp_ativ
  ON financeiro_receita_mensal(competencia, COALESCE(atividade_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 4) Contas a receber (uma por venda fechada)
CREATE TABLE IF NOT EXISTS financeiro_contas_a_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id uuid REFERENCES fechamentos(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  atividade_id uuid REFERENCES financeiro_atividades(id) ON DELETE SET NULL,
  descricao text,
  valor numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  valor_recebido numeric(14,2) NOT NULL DEFAULT 0,
  data_recebimento date,
  competencia_recebimento text,
  imposto_provisorio numeric(14,2),
  imposto_confirmado numeric(14,2),
  anexo_aplicado text,
  aliquota_efetiva numeric(7,4),
  faixa int,
  rbt12_no_calculo numeric(14,2),
  fator_r_no_calculo numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  CONSTRAINT fin_contas_status_check
    CHECK (status IN ('pendente','recebido_parcial','recebido','cancelado'))
);
CREATE INDEX IF NOT EXISTS idx_fin_contas_status ON financeiro_contas_a_receber(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_contas_comp ON financeiro_contas_a_receber(competencia_recebimento);

-- 5) Parâmetros da empresa (singleton; vira por-empresa na revenda)
CREATE TABLE IF NOT EXISTS financeiro_parametros (
  id int PRIMARY KEY DEFAULT 1,
  razao_social text,
  cnpj text,
  pro_labore_mensal numeric(14,2) NOT NULL DEFAULT 0,
  outras_folhas_mensal numeric(14,2) NOT NULL DEFAULT 0,
  dia_alerta_das int NOT NULL DEFAULT 15,
  dia_vencimento_das int NOT NULL DEFAULT 20,
  margem_alerta_faixa numeric(14,2) NOT NULL DEFAULT 20000,
  fator_r_alerta numeric(5,2) NOT NULL DEFAULT 30.0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_parametros_singleton CHECK (id = 1)
);
INSERT INTO financeiro_parametros (id, razao_social, cnpj)
  VALUES (1, 'ECOSUNPOWER ENERGIA SOLAR LTDA', '33.020.459/0001-06')
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Verificação manual (Junior aplica no SQL Editor)**

Não roda em CI. Marcar a entrega: a migration é texto pronto pro Junior colar no SQL Editor do projeto `kupnsoyymulbdzakqlqc`. Critério: as 5 tabelas existem e `SELECT count(*) FROM financeiro_anexos;` retorna 30; `financeiro_atividades` retorna 3.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/046_financeiro_nucleo.sql
git commit -m "feat(financeiro): migration 046 — 5 tabelas do núcleo + seeds (anexos, atividades)"
```

---

### Task 6: Repo Supabase do financeiro

**Files:**
- Create: `src/modules/financeiro/repo.ts`

> Wrappers finos sobre o cliente Supabase. A lógica de soma do RBT12 reusa `calcularRBT12` (puro, já testado na Task 4). Não há teste unitário novo aqui (camada de I/O); a verificação é por integração nas Tasks 8-9. Manter as funções pequenas e óbvias.

- [ ] **Step 1: Implementar o repo**

```typescript
// src/modules/financeiro/repo.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { calcularRBT12, type BucketReceita } from './rbt12.js';
import type { Anexo } from './anexos.js';

export interface Atividade {
  id: string;
  nome: string;
  cnae: string | null;
  anexo_padrao: Anexo;
  sujeito_fator_r: boolean;
}

export interface ParametrosFinanceiro {
  pro_labore_mensal: number;
  outras_folhas_mensal: number;
  dia_alerta_das: number;
  dia_vencimento_das: number;
  margem_alerta_faixa: number;
  fator_r_alerta: number;
}

// competência 'YYYY-MM' do mês atual em BRT (UTC-3).
export function competenciaAtual(now: Date = new Date()): string {
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function getBuckets(client: SupabaseClient): Promise<BucketReceita[]> {
  const { data, error } = await client
    .from('financeiro_receita_mensal')
    .select('competencia, receita');
  if (error) throw new Error(`getBuckets: ${error.message}`);
  // Soma por competência (pode haver várias atividades no mesmo mês).
  const porMes = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ competencia: string; receita: number }>) {
    porMes.set(r.competencia, (porMes.get(r.competencia) ?? 0) + Number(r.receita));
  }
  return [...porMes].map(([competencia, receita]) => ({ competencia, receita }));
}

export async function getRBT12(client: SupabaseClient, competenciaRef: string): Promise<number> {
  const buckets = await getBuckets(client);
  return calcularRBT12(buckets, competenciaRef);
}

export async function getReceita12(client: SupabaseClient, competenciaRef: string): Promise<number> {
  // mesma base do RBT12 (receita bruta dos últimos 12 meses)
  return getRBT12(client, competenciaRef);
}

export async function getParametros(client: SupabaseClient): Promise<ParametrosFinanceiro> {
  const { data, error } = await client
    .from('financeiro_parametros')
    .select('pro_labore_mensal, outras_folhas_mensal, dia_alerta_das, dia_vencimento_das, margem_alerta_faixa, fator_r_alerta')
    .eq('id', 1)
    .single();
  if (error) throw new Error(`getParametros: ${error.message}`);
  return data as ParametrosFinanceiro;
}

export async function getAtividades(client: SupabaseClient): Promise<Atividade[]> {
  const { data, error } = await client
    .from('financeiro_atividades')
    .select('id, nome, cnae, anexo_padrao, sujeito_fator_r')
    .eq('ativo', true)
    .order('nome');
  if (error) throw new Error(`getAtividades: ${error.message}`);
  return (data ?? []) as Atividade[];
}

export async function getAtividade(client: SupabaseClient, id: string): Promise<Atividade | null> {
  const { data, error } = await client
    .from('financeiro_atividades')
    .select('id, nome, cnae, anexo_padrao, sujeito_fator_r')
    .eq('id', id)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(`getAtividade: ${error.message}`);
  return (data as Atividade) ?? null;
}

export interface NovaContaReceber {
  fechamentoId: string | null;
  leadId: string | null;
  atividadeId: string;
  descricao: string;
  valor: number;
  impostoProvisorio: number;
  anexoAplicado: Anexo;
  aliquotaEfetiva: number;
  faixa: number;
  rbt12: number;
  fatorR: number;
  createdBy: string;
}

export async function criarContaReceber(client: SupabaseClient, c: NovaContaReceber): Promise<string> {
  const { data, error } = await client
    .from('financeiro_contas_a_receber')
    .insert({
      fechamento_id: c.fechamentoId,
      lead_id: c.leadId,
      atividade_id: c.atividadeId,
      descricao: c.descricao,
      valor: c.valor,
      status: 'pendente',
      imposto_provisorio: c.impostoProvisorio,
      anexo_aplicado: c.anexoAplicado,
      aliquota_efetiva: c.aliquotaEfetiva,
      faixa: c.faixa,
      rbt12_no_calculo: c.rbt12,
      fator_r_no_calculo: c.fatorR,
      created_by: c.createdBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`criarContaReceber: ${error.message}`);
  return (data as { id: string }).id;
}

export async function getContaReceber(client: SupabaseClient, id: string) {
  const { data, error } = await client
    .from('financeiro_contas_a_receber')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw new Error(`getContaReceber: ${error.message}`);
  return data;
}

// soma receita no bucket do mês (upsert incremental por competência+atividade)
export async function somarReceitaNoMes(
  client: SupabaseClient,
  competencia: string,
  atividadeId: string,
  valor: number,
): Promise<void> {
  const { data } = await client
    .from('financeiro_receita_mensal')
    .select('id, receita')
    .eq('competencia', competencia)
    .eq('atividade_id', atividadeId)
    .maybeSingle();
  if (data) {
    await client.from('financeiro_receita_mensal')
      .update({ receita: Number((data as { receita: number }).receita) + valor, updated_at: new Date().toISOString() })
      .eq('id', (data as { id: string }).id);
  } else {
    await client.from('financeiro_receita_mensal')
      .insert({ competencia, atividade_id: atividadeId, receita: valor, origem: 'sistema' });
  }
}

export async function atualizarContaRecebida(
  client: SupabaseClient,
  id: string,
  patch: {
    status: 'recebido' | 'recebido_parcial';
    valorRecebido: number;
    competencia: string;
    impostoConfirmado: number;
    anexoAplicado: Anexo;
    aliquotaEfetiva: number;
    faixa: number;
    rbt12: number;
    fatorR: number;
  },
): Promise<void> {
  const { error } = await client
    .from('financeiro_contas_a_receber')
    .update({
      status: patch.status,
      valor_recebido: patch.valorRecebido,
      data_recebimento: new Date().toISOString().slice(0, 10),
      competencia_recebimento: patch.competencia,
      imposto_confirmado: patch.impostoConfirmado,
      anexo_aplicado: patch.anexoAplicado,
      aliquota_efetiva: patch.aliquotaEfetiva,
      faixa: patch.faixa,
      rbt12_no_calculo: patch.rbt12,
      fator_r_no_calculo: patch.fatorR,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`atualizarContaRecebida: ${error.message}`);
}

export async function cancelarConta(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client
    .from('financeiro_contas_a_receber')
    .update({ status: 'cancelado', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`cancelarConta: ${error.message}`);
}
```

- [ ] **Step 2: Build pra garantir tipos**

Run: `npm run build`
Expected: sem erros de TypeScript no `financeiro/repo.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/modules/financeiro/repo.ts
git commit -m "feat(financeiro): repo Supabase (RBT12, atividades, parâmetros, contas a receber)"
```

---

### Task 7: Orquestração — cálculo na venda e no recebimento (testada)

**Files:**
- Create: `src/modules/financeiro/contas.ts`
- Test: `tests/financeiro-contas.test.ts`

> Aqui mora a regra "qual anexo + quanto de imposto" combinando atividade + Fator R + RBT12. É testável sem banco passando os números puros.

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// tests/financeiro-contas.test.ts
import { describe, it, expect } from 'vitest';
import { calcularImpostoDaConta } from '../src/modules/financeiro/contas.js';

describe('financeiro/contas: cálculo do imposto de uma conta', () => {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  it('instalação (Anexo III fixo) ignora Fator R', () => {
    const r = calcularImpostoDaConta({
      valor: 30000, rbt12: 355000, receita12: 355000,
      atividade: { anexo_padrao: 'III', sujeito_fator_r: false },
      proLabore12: 0, outrasFolhas12: 0,
    });
    expect(r.anexo).toBe('III');
    expect(round2(r.imposto)).toBe(2569.01);
  });

  it('comissão (sujeita a Fator R) cai no Anexo III quando folha >= 28%', () => {
    const r = calcularImpostoDaConta({
      valor: 30000, rbt12: 355000, receita12: 355000,
      atividade: { anexo_padrao: 'V', sujeito_fator_r: true },
      proLabore12: 100000, outrasFolhas12: 0, // FR 28,17%
    });
    expect(r.anexo).toBe('III');
    expect(round2(r.imposto)).toBe(2569.01);
  });

  it('comissão escorrega pro Anexo V quando folha < 28%', () => {
    const r = calcularImpostoDaConta({
      valor: 30000, rbt12: 355000, receita12: 355000,
      atividade: { anexo_padrao: 'V', sujeito_fator_r: true },
      proLabore12: 90000, outrasFolhas12: 0, // FR 25,35%
    });
    expect(r.anexo).toBe('V');
    expect(round2(r.imposto)).toBe(5019.72);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- financeiro-contas`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar a parte pura**

```typescript
// src/modules/financeiro/contas.ts
import { impostoDaVenda, resolverAnexo, fatorR } from './imposto.js';
import type { Anexo } from './anexos.js';

export interface EntradaCalculoConta {
  valor: number;
  rbt12: number;
  receita12: number;
  atividade: { anexo_padrao: Anexo; sujeito_fator_r: boolean };
  proLabore12: number;
  outrasFolhas12: number;
}

export interface ResultadoCalculoConta {
  anexo: Anexo;
  imposto: number;
  efetiva: number;
  faixa: number;
  fatorR: number;
}

export function calcularImpostoDaConta(e: EntradaCalculoConta): ResultadoCalculoConta {
  const folha12 = e.proLabore12 + e.outrasFolhas12;
  const fr = fatorR(folha12, e.receita12);
  const anexo = resolverAnexo(e.atividade.anexo_padrao, e.atividade.sujeito_fator_r, folha12, e.receita12);
  const imp = impostoDaVenda(e.valor, e.rbt12, anexo);
  return { anexo, imposto: imp.imposto, efetiva: imp.efetiva, faixa: imp.faixa, fatorR: fr.ratio };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- financeiro-contas`
Expected: PASS.

- [ ] **Step 5: Adicionar as funções de orquestração com banco (sem teste unitário — I/O)**

```typescript
// src/modules/financeiro/contas.ts  (acrescentar)
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  competenciaAtual, getRBT12, getReceita12, getParametros, getAtividade,
  criarContaReceber, getContaReceber, somarReceitaNoMes, atualizarContaRecebida,
} from './repo.js';

// Cria a conta a receber a partir de uma venda fechada (imposto PROVISÓRIO).
export async function criarContaDeFechamento(client: SupabaseClient, args: {
  fechamentoId: string | null;
  leadId: string | null;
  atividadeId: string;
  descricao: string;
  valor: number;
  createdBy: string;
}): Promise<{ contaId: string; calc: ResultadoCalculoConta }> {
  const comp = competenciaAtual();
  const [rbt12, receita12, params, atividade] = await Promise.all([
    getRBT12(client, comp), getReceita12(client, comp), getParametros(client), getAtividade(client, args.atividadeId),
  ]);
  if (!atividade) throw new Error('atividade não encontrada');
  const calc = calcularImpostoDaConta({
    valor: args.valor, rbt12, receita12,
    atividade: { anexo_padrao: atividade.anexo_padrao, sujeito_fator_r: atividade.sujeito_fator_r },
    proLabore12: params.pro_labore_mensal * 12, outrasFolhas12: params.outras_folhas_mensal * 12,
  });
  const contaId = await criarContaReceber(client, {
    fechamentoId: args.fechamentoId, leadId: args.leadId, atividadeId: args.atividadeId,
    descricao: args.descricao, valor: args.valor, impostoProvisorio: calc.imposto,
    anexoAplicado: calc.anexo, aliquotaEfetiva: calc.efetiva, faixa: calc.faixa,
    rbt12, fatorR: calc.fatorR, createdBy: args.createdBy,
  });
  return { contaId, calc };
}

// Marca recebido (total ou parcial); recalcula imposto CONFIRMADO e soma no bucket.
export async function registrarRecebimento(client: SupabaseClient, contaId: string, valorRecebido?: number)
: Promise<{ calc: ResultadoCalculoConta; total: boolean }> {
  const conta = await getContaReceber(client, contaId) as {
    valor: number; atividade_id: string; lead_id: string | null;
  };
  const valor = valorRecebido ?? Number(conta.valor);
  const comp = competenciaAtual();
  const [rbt12, receita12, params, atividade] = await Promise.all([
    getRBT12(client, comp), getReceita12(client, comp), getParametros(client), getAtividade(client, conta.atividade_id),
  ]);
  if (!atividade) throw new Error('atividade não encontrada');
  const calc = calcularImpostoDaConta({
    valor, rbt12, receita12,
    atividade: { anexo_padrao: atividade.anexo_padrao, sujeito_fator_r: atividade.sujeito_fator_r },
    proLabore12: params.pro_labore_mensal * 12, outrasFolhas12: params.outras_folhas_mensal * 12,
  });
  const total = valor >= Number(conta.valor);
  await somarReceitaNoMes(client, comp, conta.atividade_id, valor);
  await atualizarContaRecebida(client, contaId, {
    status: total ? 'recebido' : 'recebido_parcial', valorRecebido: valor, competencia: comp,
    impostoConfirmado: calc.imposto, anexoAplicado: calc.anexo, aliquotaEfetiva: calc.efetiva,
    faixa: calc.faixa, rbt12, fatorR: calc.fatorR,
  });
  return { calc, total };
}
```

- [ ] **Step 6: Build + rodar testes**

Run: `npm run build && npm test -- financeiro`
Expected: build limpo; todos os testes financeiro passam.

- [ ] **Step 7: Commit**

```bash
git add src/modules/financeiro/contas.ts tests/financeiro-contas.test.ts
git commit -m "feat(financeiro): orquestração conta-de-venda + recebimento (cálculo testado)"
```

---

## FASE 3 — Comandos no WhatsApp

### Task 8: Comando `/imposto <valor>`

**Files:**
- Create: `src/modules/financeiro/comando-imposto.ts`
- Modify: `src/index.ts` (registrar no `reroute` ~2886 e no dispatch da main loop)

- [ ] **Step 1: Implementar o handler**

```typescript
// src/modules/financeiro/comando-imposto.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { impostoDaVenda, fatorR, proximoSalto, proLaboreMinimoParaAnexoIII } from './imposto.js';
import { competenciaAtual, getRBT12, getReceita12, getParametros } from './repo.js';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (n: number) => `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export function parseImpostoCommand(text: string): number | null {
  const m = text.trim().match(/^\/imposto\s+([\d.,]+)/i);
  if (!m) return null;
  const valor = Number(m[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

export async function montarRespostaImposto(client: SupabaseClient, valor: number): Promise<string> {
  const comp = competenciaAtual();
  const [rbt12, receita12, params] = await Promise.all([
    getRBT12(client, comp), getReceita12(client, comp), getParametros(client),
  ]);
  const folha12 = params.pro_labore_mensal * 12 + params.outras_folhas_mensal * 12;
  const fr = fatorR(folha12, receita12);
  const anexoComissao = fr.anexo; // III ou V
  const i = impostoDaVenda(valor, rbt12, 'I');
  const iii = impostoDaVenda(valor, rbt12, 'III');
  const com = impostoDaVenda(valor, rbt12, anexoComissao);
  const salto = proximoSalto(rbt12);
  const proLaboreMin = proLaboreMinimoParaAnexoIII(receita12, params.outras_folhas_mensal * 12);

  const linhas = [
    `💰 *Imposto sobre ${brl(valor)}*`,
    `RBT12 atual: ${brl(rbt12)} (faixa ${iii.faixa})`,
    ``,
    `🛒 Equipamento (Anexo I): ${pct(i.efetiva)} → *${brl(i.imposto)}*`,
    `🔧 Instalação (Anexo III): ${pct(iii.efetiva)} → *${brl(iii.imposto)}*`,
    `🪙 Comissão (Anexo ${anexoComissao}): ${pct(com.efetiva)} → *${brl(com.imposto)}*`,
    ``,
    `Fator R: ${pct(fr.ratio)} → ${fr.anexo === 'III' ? '✅ Anexo III' : '⚠️ Anexo V (caro!)'}`,
    `Pró-labore mín. p/ ficar no III: ${brl(proLaboreMin)}/mês`,
    salto ? `Faltam ${brl(salto.distancia)} pro salto de faixa (${brl(salto.limite)}).` : `Última faixa.`,
  ];
  return linhas.join('\n');
}

// handler no formato do reroute: (from, text) => Promise<boolean>
export function makeImpostoHandler(
  client: SupabaseClient,
  isAdminPhone: (p: string) => boolean,
  sendText: (to: string, body: string) => Promise<unknown>,
) {
  return async function tryHandleImpostoCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const valor = parseImpostoCommand(text);
    if (valor === null) return false;
    const resposta = await montarRespostaImposto(client, valor);
    await sendText(from, resposta);
    return true;
  };
}
```

- [ ] **Step 2: Registrar no `src/index.ts`**

Localizar onde os outros handlers são criados/usados (perto do `reroute`, ~2886) e adicionar:

```typescript
// src/index.ts — perto da criação dos handlers de comando
import { makeImpostoHandler } from './modules/financeiro/comando-imposto.js';

const tryHandleImpostoCommand = makeImpostoHandler(
  supabase.getClient(),
  isAdminPhone,
  (to, body) => metaWaba.sendText(to, body), // usar o helper de texto já existente
);
```

E no objeto `reroute`:

```typescript
  imposto:    { trigger: '/imposto',           handler: tryHandleImpostoCommand },
```

> Nota: confirmar o nome do helper de envio de texto simples no `meta-whatsapp.ts` (ex.: `sendText`/`sendMessage`). Usar o mesmo que os outros comandos usam pra resposta de texto.

- [ ] **Step 3: Build + smoke local**

Run: `npm run build`
Expected: sem erros. Teste manual posterior: mandar `/imposto 30000` no zap → recebe o quadro com os 3 anexos.

- [ ] **Step 4: Commit**

```bash
git add src/modules/financeiro/comando-imposto.ts src/index.ts
git commit -m "feat(financeiro): comando /imposto (imposto por anexo + Fator R + salto)"
```

---

### Task 9: Engate no `/fechar` — criar conta a receber + botões

**Files:**
- Modify: `src/index.ts` (no fim do fluxo do `/fechar`, após `createFechamento`, ~801-862)

> Após o fechamento ser persistido, perguntar a ATIVIDADE por botões e criar a conta a receber com o imposto provisório. Reusar `criarContaDeFechamento`.

- [ ] **Step 1: Após criar o fechamento, oferecer a atividade por botões**

No ponto onde hoje envia os botões "Aprovar/Refazer/Cancelar" do fechamento (`src/index.ts:857-862`), acrescentar um segundo conjunto perguntando o tipo de receita. Como botões aceitam no máx 3, usar os 3 tipos do catálogo:

```typescript
// src/index.ts — logo após obter fechamentoId e o valor da venda
const valorVenda = Number(dados?.comercial?.valor_total_brl ?? 0);
if (valorVenda > 0) {
  const { getAtividades } = await import('./modules/financeiro/repo.js');
  const ativs = await getAtividades(supabase.getClient());
  // botões: id = finrec:<fechamentoId>:<atividadeId>
  const botoes = ativs.slice(0, 3).map(a => ({
    id: `finrec:${fechamentoId}:${a.id}`,
    title: a.nome.slice(0, 20),
  }));
  await metaWaba.sendInteractiveButtons(
    adminPhone,
    `💰 Lançar ${valorVenda.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} no financeiro. Qual tipo de receita?`,
    botoes,
    'Núcleo Financeiro',
  );
}
```

- [ ] **Step 2: Rotear o clique do botão `finrec:` (cria a conta)**

No bloco de roteamento de botões (`src/index.ts:2929+`, onde trata `evabt:` etc.), acrescentar:

```typescript
// src/index.ts — roteamento de botões
if (btnId.startsWith('finrec:')) {
  const [, fechamentoId, atividadeId] = btnId.split(':');
  const { createFechamentoConta } = await import('./modules/financeiro/engate-fechar.js');
  await createFechamentoConta(supabase.getClient(), metaWaba, from, fechamentoId, atividadeId);
  return;
}
```

- [ ] **Step 3: Criar o helper de engate (lê o fechamento, cria a conta, responde com botões de recebimento)**

```typescript
// src/modules/financeiro/engate-fechar.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { criarContaDeFechamento } from './contas.js';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Waba {
  sendInteractiveButtons(to: string, body: string, buttons: Array<{ id: string; title: string }>, footer?: string): Promise<unknown>;
}

export async function createFechamentoConta(
  client: SupabaseClient,
  waba: Waba,
  adminPhone: string,
  fechamentoId: string,
  atividadeId: string,
): Promise<void> {
  const { data: fch } = await client
    .from('fechamentos')
    .select('lead_id, dados_snapshot')
    .eq('id', fechamentoId)
    .single();
  const snap = (fch as { dados_snapshot?: { comercial?: { valor_total_brl?: number } } } | null)?.dados_snapshot;
  const valor = Number(snap?.comercial?.valor_total_brl ?? 0);
  const leadId = (fch as { lead_id?: string | null } | null)?.lead_id ?? null;
  if (valor <= 0) {
    await waba.sendInteractiveButtons(adminPhone, '⚠️ Venda sem valor no fechamento — não dá pra lançar.', [{ id: 'noop', title: 'OK' }]);
    return;
  }
  const { contaId, calc } = await criarContaDeFechamento(client, {
    fechamentoId, leadId, atividadeId, descricao: `Venda fechamento ${fechamentoId.slice(0, 8)}`, valor, createdBy: adminPhone,
  });
  await waba.sendInteractiveButtons(
    adminPhone,
    `✅ Conta a receber criada: ${brl(valor)} (Anexo ${calc.anexo}).\nImposto provisório a separar: *${brl(calc.imposto)}*.\nQuando receber, marque aqui:`,
    [
      { id: `finrcv:total:${contaId}`, title: 'Recebido total' },
      { id: `finrcv:parcial:${contaId}`, title: 'Recebido parcial' },
      { id: `finrcv:cancelar:${contaId}`, title: 'Cancelar venda' },
    ],
    'Núcleo Financeiro',
  );
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/modules/financeiro/engate-fechar.js src/modules/financeiro/engate-fechar.ts
git commit -m "feat(financeiro): /fechar cria conta a receber (escolha de atividade por botão)"
```

---

### Task 10: Botões de recebimento (total/parcial/cancelar)

**Files:**
- Modify: `src/index.ts` (roteamento de botões)
- Modify: `src/modules/financeiro/engate-fechar.ts` (handler de recebimento)

- [ ] **Step 1: Handler de recebimento**

```typescript
// src/modules/financeiro/engate-fechar.ts  (acrescentar)
import { registrarRecebimento } from './contas.js';
import { cancelarConta } from './repo.js';

export async function handleRecebimento(
  client: SupabaseClient,
  waba: { sendText?: (to: string, body: string) => Promise<unknown>; sendInteractiveButtons: Waba['sendInteractiveButtons'] },
  adminPhone: string,
  acao: 'total' | 'parcial' | 'cancelar',
  contaId: string,
  valorParcial?: number,
): Promise<void> {
  if (acao === 'cancelar') {
    await cancelarConta(client, contaId);
    await waba.sendInteractiveButtons(adminPhone, '🚫 Venda cancelada — não conta receita nem imposto.', [{ id: 'noop', title: 'OK' }]);
    return;
  }
  const { calc, total } = await registrarRecebimento(client, contaId, acao === 'parcial' ? valorParcial : undefined);
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const msg = `💵 Recebimento ${total ? 'total' : 'parcial'} registrado.\nImposto confirmado (Anexo ${calc.anexo}): *${brl(calc.imposto)}* — separe pro DAS.`;
  await waba.sendInteractiveButtons(adminPhone, msg, [{ id: 'noop', title: 'OK' }]);
}
```

> Recebimento parcial sem valor digitado: nesta versão, "parcial" usa metade do valor da conta como padrão (caso PIX 50/50). Se quiser valor livre, é um fast-follow (pedir o número numa próxima mensagem). Documentar no commit.

- [ ] **Step 2: Roteamento no `src/index.ts`**

```typescript
// src/index.ts — junto do roteamento de botões
if (btnId.startsWith('finrcv:')) {
  const [, acao, contaId] = btnId.split(':');
  const { handleRecebimento } = await import('./modules/financeiro/engate-fechar.js');
  await handleRecebimento(supabase.getClient(), metaWaba, from, acao as 'total' | 'parcial' | 'cancelar', contaId);
  return;
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts src/modules/financeiro/engate-fechar.ts
git commit -m "feat(financeiro): botões recebido total/parcial/cancelar atualizam RBT12 + imposto"
```

---

## FASE 4 — Tela Financeiro

### Task 11: Query + view + rota do dashboard

**Files:**
- Create: `src/modules/dashboard/financeiro-queries.ts`
- Create: `src/modules/dashboard/financeiro-views.ts`
- Modify: `src/modules/dashboard/router.ts`

- [ ] **Step 1: Query**

```typescript
// src/modules/dashboard/financeiro-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { getBuckets, getRBT12, getReceita12, getParametros, competenciaAtual } from '../financeiro/repo.js';
import { fatorR, proximoSalto, proLaboreMinimoParaAnexoIII, faixaPorRBT12 } from '../financeiro/imposto.js';

export interface FinanceiroData {
  geradoEm: string;
  competencia: string;
  faturamentoMes: number;
  rbt12: number;
  faixa: number;
  impostoASeparar: number;
  aReceber: number;
  fatorR: { ratio: number; anexo: string; proLaboreMin: number };
  salto: { limite: number; distancia: number } | null;
  faturamentoMensal: Array<{ competencia: string; receita: number }>;
  contas: Array<{ descricao: string; valor: number; status: string; imposto: number | null }>;
}

export async function getFinanceiroData(client: SupabaseClient): Promise<FinanceiroData> {
  const comp = competenciaAtual();
  const [buckets, rbt12, receita12, params] = await Promise.all([
    getBuckets(client), getRBT12(client, comp), getReceita12(client, comp), getParametros(client),
  ]);

  const { data: contasRaw } = await client
    .from('financeiro_contas_a_receber')
    .select('descricao, valor, status, imposto_confirmado, imposto_provisorio, competencia_recebimento')
    .order('created_at', { ascending: false })
    .limit(50);
  const contas = (contasRaw ?? []) as Array<{
    descricao: string; valor: number; status: string;
    imposto_confirmado: number | null; imposto_provisorio: number | null; competencia_recebimento: string | null;
  }>;

  const faturamentoMes = contas
    .filter((c) => c.status === 'recebido' && c.competencia_recebimento === comp)
    .reduce((s, c) => s + Number(c.valor), 0);
  const impostoASeparar = contas
    .filter((c) => c.status === 'recebido' && c.competencia_recebimento === comp)
    .reduce((s, c) => s + Number(c.imposto_confirmado ?? 0), 0);
  const aReceber = contas
    .filter((c) => c.status === 'pendente' || c.status === 'recebido_parcial')
    .reduce((s, c) => s + Number(c.valor), 0);

  const folha12 = params.pro_labore_mensal * 12 + params.outras_folhas_mensal * 12;
  const fr = fatorR(folha12, receita12);

  return {
    geradoEm: new Date().toISOString(),
    competencia: comp,
    faturamentoMes,
    rbt12,
    faixa: faixaPorRBT12(rbt12),
    impostoASeparar,
    aReceber,
    fatorR: {
      ratio: fr.ratio,
      anexo: fr.anexo,
      proLaboreMin: proLaboreMinimoParaAnexoIII(receita12, params.outras_folhas_mensal * 12),
    },
    salto: proximoSalto(rbt12),
    faturamentoMensal: buckets.sort((a, b) => a.competencia.localeCompare(b.competencia)),
    contas: contas.map((c) => ({
      descricao: c.descricao, valor: Number(c.valor), status: c.status,
      imposto: c.imposto_confirmado ?? c.imposto_provisorio,
    })),
  };
}
```

- [ ] **Step 2: View (dark-neon, padrão cockpit)**

```typescript
// src/modules/dashboard/financeiro-views.ts
import type { FinanceiroData } from './financeiro-queries.js';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function renderFinanceiroPage(d: FinanceiroData): string {
  const dataJson = JSON.stringify(d).replace(/</g, '\\u003c');
  const corFatorR = d.fatorR.anexo === 'III' ? '#34d399' : '#f87171';
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Financeiro · EcoSun</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
<style>body{background:#050610;color:#d1d5db;font-family:'JetBrains Mono',ui-monospace,monospace}
.card{background:#0b0e1f;border:1px solid #1b2040;border-radius:14px;padding:18px}
.big{font-size:2rem;font-weight:700;color:#e5e7eb}</style></head>
<body class="p-4">
<h1 class="text-xl font-bold mb-4 text-cyan-300">💰 Financeiro · EcoSunPower</h1>
<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
  <div class="card"><div class="text-xs text-gray-400">Faturamento do mês</div><div class="big">${brl(d.faturamentoMes)}</div></div>
  <div class="card"><div class="text-xs text-gray-400">RBT12 (faixa ${d.faixa})</div><div class="big">${brl(d.rbt12)}</div>
    <div class="text-xs text-amber-400">${d.salto ? `faltam ${brl(d.salto.distancia)} pro salto` : 'última faixa'}</div></div>
  <div class="card"><div class="text-xs text-gray-400">Imposto a separar</div><div class="big text-rose-300">${brl(d.impostoASeparar)}</div></div>
  <div class="card"><div class="text-xs text-gray-400">A receber</div><div class="big">${brl(d.aReceber)}</div></div>
</div>
<div class="grid md:grid-cols-2 gap-3 mb-4">
  <div class="card"><div class="text-sm mb-2">Faturamento mês a mês</div><div id="graf" style="height:260px"></div></div>
  <div class="card"><div class="text-sm mb-2">Fator R</div>
    <div class="big" style="color:${corFatorR}">${pct(d.fatorR.ratio)} → Anexo ${d.fatorR.anexo}</div>
    <div class="text-xs text-gray-400 mt-1">Pró-labore mín. p/ Anexo III: <b>${brl(d.fatorR.proLaboreMin)}/mês</b></div>
  </div>
</div>
<div class="card"><div class="text-sm mb-2">Contas a receber</div>
  <table class="w-full text-sm"><thead><tr class="text-gray-500 text-left">
  <th>Descrição</th><th>Valor</th><th>Status</th><th>Imposto</th></tr></thead><tbody>
  ${d.contas.map((c) => `<tr class="border-t border-gray-800"><td>${c.descricao ?? '-'}</td><td>${brl(c.valor)}</td><td>${c.status}</td><td>${c.imposto != null ? brl(c.imposto) : '-'}</td></tr>`).join('')}
  </tbody></table></div>
<script type="application/json" id="fin-data">${dataJson}</script>
<script>
  const d = JSON.parse(document.getElementById('fin-data').textContent);
  const g = echarts.init(document.getElementById('graf'), 'dark');
  g.setOption({ backgroundColor:'transparent', tooltip:{trigger:'axis'},
    xAxis:{type:'category', data:d.faturamentoMensal.map(x=>x.competencia)},
    yAxis:{type:'value'},
    series:[{type:'bar', data:d.faturamentoMensal.map(x=>x.receita), itemStyle:{color:'#22d3ee'}}] });
  window.addEventListener('resize', ()=>g.resize());
</script>
</body></html>`;
}
```

- [ ] **Step 3: Registrar rotas no `router.ts`**

Seguindo o padrão do `/cockpit` (`src/modules/dashboard/router.ts`):

```typescript
// src/modules/dashboard/router.ts — dentro de createDashboardRouter
router.get('/financeiro', async (_req, res) => {
  try {
    const { getFinanceiroData } = await import('./financeiro-queries.js');
    const { renderFinanceiroPage } = await import('./financeiro-views.js');
    const data = await getFinanceiroData(supabase.getClient());
    res.type('text/html').send(renderFinanceiroPage(data));
  } catch (err) {
    res.status(500).type('text/html').send(`<h2>Erro</h2><pre>${(err as Error).message}</pre>`);
  }
});

router.get('/financeiro/data', async (_req, res) => {
  const { getFinanceiroData } = await import('./financeiro-queries.js');
  res.json(await getFinanceiroData(supabase.getClient()));
});
```

> Conferir como o `supabase` é acessado dentro do router (no cockpit é `getCockpitData(supabase)` — pode ser o `SupabaseService`; usar `supabase.getClient()` pra passar o cliente cru que as queries financeiras esperam).

- [ ] **Step 4: Build + smoke**

Run: `npm run build`
Expected: sem erros. Smoke posterior: abrir `/dashboard/financeiro`.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/financeiro-queries.ts src/modules/dashboard/financeiro-views.ts src/modules/dashboard/router.ts
git commit -m "feat(financeiro): tela /dashboard/financeiro (cards, faturamento, Fator R, contas)"
```

---

## FASE 5 — Alertas + semente + deploy

### Task 12: Alertas (DAS dia 15, salto de faixa, Fator R)

**Files:**
- Create: `src/modules/financeiro/alertas.ts`
- Test: `tests/financeiro-alertas.test.ts`
- Modify: `src/index.ts` (cron diário)

- [ ] **Step 1: Teste das funções puras de detecção**

```typescript
// tests/financeiro-alertas.test.ts
import { describe, it, expect } from 'vitest';
import { detectarAlertasFinanceiros } from '../src/modules/financeiro/alertas.js';

describe('financeiro/alertas: detecção pura', () => {
  const base = {
    diaDoMes: 15, diaAlertaDas: 15,
    rbt12: 355000, margemFaixa: 20000,
    fatorRatio: 0.30, fatorRAlerta: 0.30,
    impostoDoMes: 2569, proLaboreMin: 8283,
  };
  it('dispara DAS no dia configurado', () => {
    const a = detectarAlertasFinanceiros(base);
    expect(a.some((x) => x.tipo === 'das')).toBe(true);
  });
  it('dispara salto de faixa quando dentro da margem', () => {
    // 355000 → faltam 5000 pro 360000, dentro de 20000
    expect(detectarAlertasFinanceiros(base).some((x) => x.tipo === 'faixa')).toBe(true);
  });
  it('dispara Fator R quando ratio <= alerta', () => {
    expect(detectarAlertasFinanceiros({ ...base, fatorRatio: 0.29 }).some((x) => x.tipo === 'fator_r')).toBe(true);
  });
  it('não dispara DAS em outro dia', () => {
    expect(detectarAlertasFinanceiros({ ...base, diaDoMes: 3 }).some((x) => x.tipo === 'das')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- financeiro-alertas`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar detecção pura**

```typescript
// src/modules/financeiro/alertas.ts
import { proximoSalto } from './imposto.js';

export interface EntradaAlertas {
  diaDoMes: number; diaAlertaDas: number;
  rbt12: number; margemFaixa: number;
  fatorRatio: number; fatorRAlerta: number;
  impostoDoMes: number; proLaboreMin: number;
}
export interface AlertaFinanceiro { tipo: 'das' | 'faixa' | 'fator_r'; texto: string; }

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function detectarAlertasFinanceiros(e: EntradaAlertas): AlertaFinanceiro[] {
  const out: AlertaFinanceiro[] = [];
  if (e.diaDoMes === e.diaAlertaDas && e.impostoDoMes > 0) {
    out.push({ tipo: 'das', texto: `📅 DAS: separe ${brl(e.impostoDoMes)} pro imposto deste mês (vence dia 20). Já separou?` });
  }
  const salto = proximoSalto(e.rbt12);
  if (salto && salto.distancia <= e.margemFaixa) {
    out.push({ tipo: 'faixa', texto: `⚠️ Você está a ${brl(salto.distancia)} do salto de faixa (${brl(salto.limite)}). A alíquota vai subir.` });
  }
  if (e.fatorRatio <= e.fatorRAlerta) {
    out.push({ tipo: 'fator_r', texto: `🔴 Fator R em ${(e.fatorRatio * 100).toFixed(1)}% — risco de cair no Anexo V (imposto dobra). Pró-labore mín.: ${brl(e.proLaboreMin)}/mês.` });
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- financeiro-alertas`
Expected: PASS.

- [ ] **Step 5: Cron diário no `src/index.ts` (espelhar o padrão dos proactive-alerts ~6980)**

```typescript
// src/index.ts — junto dos outros crons
const runFinanceiroAlertas = async () => {
  try {
    const { getRBT12, getReceita12, getParametros, competenciaAtual } = await import('./modules/financeiro/repo.js');
    const { detectarAlertasFinanceiros } = await import('./modules/financeiro/alertas.js');
    const { fatorR, proLaboreMinimoParaAnexoIII } = await import('./modules/financeiro/imposto.js');
    const client = supabase.getClient();
    const comp = competenciaAtual();
    const [rbt12, receita12, params] = await Promise.all([getRBT12(client, comp), getReceita12(client, comp), getParametros(client)]);
    const folha12 = params.pro_labore_mensal * 12 + params.outras_folhas_mensal * 12;
    const fr = fatorR(folha12, receita12);
    // imposto do mês = soma dos confirmados na competência atual
    const { data } = await client.from('financeiro_contas_a_receber')
      .select('imposto_confirmado').eq('status', 'recebido').eq('competencia_recebimento', comp);
    const impostoDoMes = (data ?? []).reduce((s: number, r: { imposto_confirmado: number | null }) => s + Number(r.imposto_confirmado ?? 0), 0);
    const agoraBrt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const alertas = detectarAlertasFinanceiros({
      diaDoMes: agoraBrt.getUTCDate(), diaAlertaDas: params.dia_alerta_das,
      rbt12, margemFaixa: params.margem_alerta_faixa,
      fatorRatio: fr.ratio, fatorRAlerta: params.fator_r_alerta / 100,
      impostoDoMes, proLaboreMin: proLaboreMinimoParaAnexoIII(receita12, params.outras_folhas_mensal * 12),
    });
    if (process.env.DRY_RUN === 'true') {
      console.log(`[financeiro-alertas] DRY: ${alertas.length} alertas`, alertas.map(a => a.tipo));
      return;
    }
    for (const a of alertas) await metaWaba.sendText(adminPhone, a.texto);
  } catch (err) {
    console.error('[financeiro-alertas] cron falhou:', (err as Error).message);
  }
};
setInterval(runFinanceiroAlertas, 6 * 60 * 60 * 1000); // 4x/dia (pega o dia 15 com folga)
setTimeout(runFinanceiroAlertas, 9 * 60 * 1000);
```

- [ ] **Step 6: Build + testes**

Run: `npm run build && npm test -- financeiro`
Expected: build limpo, testes verdes.

- [ ] **Step 7: Commit**

```bash
git add src/modules/financeiro/alertas.ts tests/financeiro-alertas.test.ts src/index.ts
git commit -m "feat(financeiro): alertas DAS dia 15 + salto de faixa + Fator R (cron diário)"
```

---

### Task 13: Script de semente do RBT12 (faturamento 2025)

**Files:**
- Create: `scripts/seed-financeiro-receita.ts`

> Junior fornece os valores mês a mês de 2025 (relação assinada). O script abaixo traz os meses como constante a ser preenchida com os números reais antes de rodar; o total tem que bater com R$ 355.091,99.

- [ ] **Step 1: Escrever o script**

```typescript
// scripts/seed-financeiro-receita.ts
// Semeia financeiro_receita_mensal com o faturamento 2025 real (relação assinada).
// Rodar 1x: npx tsx scripts/seed-financeiro-receita.ts [--apply]
// Sem --apply: só mostra o que faria (dry-run) e confere o total.
import { createClient } from '@supabase/supabase-js';

// PREENCHER com os valores reais mês a mês (R$). Total esperado: 355091.99
const FATURAMENTO_2025: Record<string, number> = {
  '2025-01': 0, '2025-02': 1536, '2025-03': 0, '2025-04': 68134,
  '2025-05': 0, '2025-06': 0, '2025-07': 0, '2025-08': 0,
  '2025-09': 0, '2025-10': 0, '2025-11': 0, '2025-12': 0,
};

async function main() {
  const apply = process.argv.includes('--apply');
  const total = Object.values(FATURAMENTO_2025).reduce((a, b) => a + b, 0);
  console.log('Total semente:', total.toLocaleString('pt-BR'), '(esperado ~355091,99)');
  if (Math.abs(total - 355091.99) > 1) {
    console.warn('⚠️ Total não bate com a relação assinada — confira os meses antes de aplicar.');
  }
  if (!apply) { console.log('Dry-run. Rode com --apply pra gravar.'); return; }

  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  for (const [competencia, receita] of Object.entries(FATURAMENTO_2025)) {
    if (receita <= 0) continue;
    await client.from('financeiro_receita_mensal').insert({ competencia, atividade_id: null, receita, origem: 'seed' });
    console.log('seed', competencia, receita);
  }
  console.log('✅ Semente aplicada.');
}
main().catch((e) => { console.error(e); process.exit(1); });
```

> Confirmar os nomes das envs do Supabase usadas no projeto (provavelmente `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` — checar como `src/index.ts` instancia o `SupabaseService`).

- [ ] **Step 2: Dry-run**

Run: `npx tsx scripts/seed-financeiro-receita.ts`
Expected: imprime o total e o aviso se não bater. (Junior preenche os meses reais antes do `--apply`.)

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-financeiro-receita.ts
git commit -m "feat(financeiro): script de semente do RBT12 (faturamento 2025)"
```

---

### Task 14: Build marker + verificação final

**Files:**
- Modify: `src/build-info.ts`

- [ ] **Step 1: Bump do build marker**

Abrir `src/build-info.ts` e atualizar a constante de build pra `FINANCEIRO-NUCLEO-2026-06-07` (seguir o formato existente — ver o valor atual, ex.: `CARTAO-BELENUS-2026-06-07`). Também bumpar o cache-bust do `Dockerfile` (linha ~5, padrão `2026-06-07-...`) pra forçar rebuild no Easypanel.

- [ ] **Step 2: Suite completa**

Run: `npm test`
Expected: TODOS os testes passam (os financeiro + os 706 existentes).

- [ ] **Step 3: Build final**

Run: `npm run build`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/build-info.ts Dockerfile
git commit -m "chore(deploy): build marker FINANCEIRO-NUCLEO-2026-06-07 + cache-bust"
```

- [ ] **Step 5: Checklist de verificação manual (pós-deploy, com Junior)**

1. Junior aplica a migration 046 no SQL Editor (`kupnsoyymulbdzakqlqc`); confere `SELECT count(*) FROM financeiro_anexos` = 30 e `financeiro_atividades` = 3.
2. Junior preenche os meses reais no script de semente e roda `--apply`.
3. Junior preenche `pro_labore_mensal` em `financeiro_parametros` (UPDATE manual ou pela config).
4. Após push (autorizado) + Implantar: `curl https://propostas.ecosunpower.eng.br/health` mostra `"build":"FINANCEIRO-NUCLEO-2026-06-07"`.
5. `/imposto 30000` no zap → quadro com os 3 anexos + Fator R.
6. `/fechar` de teste → botão de atividade → conta criada → "Recebido total" → imposto confirmado.
7. Abrir `/dashboard/financeiro` → cards, gráfico, Fator R, lista.

---

## Self-Review (feito ao escrever)

- **Cobertura do spec:** §2 motor → Tasks 1-3; §2.3 Fator R/segregação → Tasks 3,7; RBT12 §2.2 → Task 4; §3 dados → Tasks 5-6; §4 engate/comandos → Tasks 8-10; §5 semente → Task 13; §6 tela → Task 11; §7 alertas → Task 12; §9 generalização (dados-driven) → Tasks 5-6; build marker §11 → Task 14. ✔
- **Sem placeholders:** todo passo de código tem código real. As poucas "notas de confirmação" (nome do helper `sendText`, env do Supabase, acesso ao `supabase` no router) são verificações pontuais de integração, não lógica em aberto — o executor confere o nome exato no arquivo citado.
- **Consistência de tipos:** `Anexo`, `calcularImpostoDaConta`, `criarContaDeFechamento`, `registrarRecebimento`, `getFinanceiroData`, `detectarAlertasFinanceiros` usados com as mesmas assinaturas entre tasks. Ids de botão: `finrec:` (escolha de atividade), `finrcv:` (recebimento). ✔
- **Escopo:** uma fatia coesa (lado receita), produz software testável a cada fase. Despesa/caixa fora (Fatia 3). ✔

## Pendências que dependem do Junior (não bloqueiam o código)
- Confirmar com contador: instalação Anexo III vs IV; divisão equipamento×instalação; valores Anexo I/V.
- Preencher pró-labore real e os meses de faturamento 2025/2026.
- Decisão futura: recebimento parcial com valor livre (hoje assume metade).
