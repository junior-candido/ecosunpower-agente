# Financeiro Peça 3 — Relatório do mês no zap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** No WhatsApp, "relatório" (ou "relatório de maio") devolve um resumo do mês — entrou (caixa real/faturado/por fora), saiu por categoria, lucro, imposto/DAS, a receber e Mundo PF.

**Architecture:** Comando admin que reusa os cálculos do painel parametrizados por competência. Duas funções puras testáveis (parser do período + formatador do texto) + uma função de leitura (`getRelatorioMensal`) + um handler ligado no index.ts antes do gate da Caixa de Entrada. Sem banco novo, sem tocar no motor.

**Tech Stack:** TypeScript ESM, Vitest (`npm test`), Supabase. Sem migração.

Spec: `docs/superpowers/specs/2026-06-16-financeiro-relatorio-mes-design.md`

---

## Estrutura de arquivos
- `src/modules/financeiro/relatorio-mensal.ts` (novo): tipo `RelatorioMensal`, `montarRelatorioMensal` (puro), `getRelatorioMensal` (I/O), helper `nomeMesAno` (puro).
- `src/modules/financeiro/comando-relatorio.ts` (novo): `parseRelatorioComando` (puro) + `makeRelatorioHandler` (I/O).
- `src/index.ts`: criar e chamar o handler (perto do `/imposto`).
- `tests/financeiro-relatorio.test.ts` (novo).

---

## Task 1: Parser do período (puro)

**Files:** Create `src/modules/financeiro/comando-relatorio.ts`; Test `tests/financeiro-relatorio.test.ts`

- [ ] **Step 1: Testes que falham** — criar `tests/financeiro-relatorio.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseRelatorioComando } from '../src/modules/financeiro/comando-relatorio.js';

const HOJE = '2026-06'; // junho/2026

describe('parseRelatorioComando', () => {
  it('"relatório" → mês atual', () => {
    expect(parseRelatorioComando('relatório', HOJE)).toEqual({ competencia: '2026-06' });
  });
  it('"relatorio" e "/relatorio" também valem', () => {
    expect(parseRelatorioComando('relatorio', HOJE)?.competencia).toBe('2026-06');
    expect(parseRelatorioComando('/relatorio', HOJE)?.competencia).toBe('2026-06');
  });
  it('"relatório de maio" → 2026-05', () => {
    expect(parseRelatorioComando('relatório de maio', HOJE)?.competencia).toBe('2026-05');
  });
  it('"relatório 05" e "relatório 5" → 2026-05', () => {
    expect(parseRelatorioComando('relatório 05', HOJE)?.competencia).toBe('2026-05');
    expect(parseRelatorioComando('relatório 5', HOJE)?.competencia).toBe('2026-05');
  });
  it('"relatório 2026-03" → 2026-03', () => {
    expect(parseRelatorioComando('relatório 2026-03', HOJE)?.competencia).toBe('2026-03');
  });
  it('mês futuro sem ano → ano anterior (pede mês já fechado)', () => {
    expect(parseRelatorioComando('relatório dezembro', HOJE)?.competencia).toBe('2025-12');
  });
  it('não é comando de relatório → null', () => {
    expect(parseRelatorioComando('bom dia', HOJE)).toBeNull();
    expect(parseRelatorioComando('gastei 50 no posto', HOJE)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar:** `npm test -- financeiro-relatorio`.

- [ ] **Step 3: Implementar** em `src/modules/financeiro/comando-relatorio.ts`:
```ts
// src/modules/financeiro/comando-relatorio.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { getRelatorioMensal, montarRelatorioMensal } from './relatorio-mensal.js';

const MESES: Record<string, number> = {
  jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, 'março': 3,
  abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6, jul: 7, julho: 7,
  ago: 8, agosto: 8, set: 9, setembro: 9, out: 10, outubro: 10,
  nov: 11, novembro: 11, dez: 12, dezembro: 12,
};

// hojeYYYYMM = competência atual em BRT. Retorna {competencia:'YYYY-MM'} ou null (não é relatório).
export function parseRelatorioComando(texto: string, hojeYYYYMM: string): { competencia: string } | null {
  const t = texto.trim().toLowerCase();
  const m = t.match(/^\/?relat[óo]rio\b(.*)$/);
  if (!m) return null;
  const resto = m[1].trim().replace(/^de\s+/, '');
  const [anoAtual, mesAtual] = hojeYYYYMM.split('-').map(Number);
  if (!resto) return { competencia: hojeYYYYMM };

  // YYYY-MM explícito
  const iso = resto.match(/^(\d{4})-(\d{2})$/);
  if (iso) return { competencia: `${iso[1]}-${iso[2]}` };

  // número do mês (1..12)
  const num = resto.match(/^(\d{1,2})$/);
  let mes: number | undefined;
  if (num) { const n = Number(num[1]); if (n >= 1 && n <= 12) mes = n; }
  else { mes = MESES[resto.split(/\s+/)[0]]; }
  if (!mes) return { competencia: hojeYYYYMM }; // não entendeu o mês → mês atual

  // sem ano: ano atual; se o mês for futuro em relação a hoje → ano anterior
  const ano = mes > mesAtual ? anoAtual - 1 : anoAtual;
  return { competencia: `${ano}-${String(mes).padStart(2, '0')}` };
}

export function makeRelatorioHandler(
  client: SupabaseClient,
  isAdminPhone: (p: string) => boolean,
  sendText: (to: string, body: string) => Promise<unknown>,
) {
  const hojeBRT = (): string => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7);
  return async function tryHandleRelatorioCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const parsed = parseRelatorioComando(text, hojeBRT());
    if (!parsed) return false;
    const data = await getRelatorioMensal(client, parsed.competencia);
    await sendText(from, montarRelatorioMensal(data));
    return true;
  };
}
```

- [ ] **Step 4: Rodar e ver passar:** `npm test -- financeiro-relatorio` (o parser passa; o resto do arquivo importa `relatorio-mensal` que será criado na Task 2 — se o import quebrar o teste, crie o arquivo stub na Task 2 primeiro; ver nota). NOTA: como `comando-relatorio.ts` importa de `relatorio-mensal.js`, faça a Task 2 ANTES de rodar a suíte cheia. Para o teste do parser isolado, o import é resolvido em tempo de módulo — então implemente a Task 2 logo em seguida e rode as duas juntas.

- [ ] **Step 5: (commit junto da Task 2 — ver lá).**

---

## Task 2: Tipo + formatador do texto (puro) + helper de mês

**Files:** Create `src/modules/financeiro/relatorio-mensal.ts`; Test `tests/financeiro-relatorio.test.ts`

- [ ] **Step 1: Testes que falham** — adicionar em `tests/financeiro-relatorio.test.ts`:
```ts
import { montarRelatorioMensal, type RelatorioMensal } from '../src/modules/financeiro/relatorio-mensal.js';

const base: RelatorioMensal = {
  competencia: '2026-06', faturadoMesPj: 9000, entrouSemNotaPj: 5000, entrouMesPjCaixa: 14000,
  saiuMesPj: 4300, lucroMes: 8850, impostoMes: 591, rbt12: 355000, faixa: 2, anexoFatorR: 'III',
  aReceber: 12000, entrouMesPf: 0, saiuMesPf: 850,
  pizzaCategorias: [{ categoria: 'Material', total: 1500 }, { categoria: 'Instalação', total: 1300 }],
};

describe('montarRelatorioMensal', () => {
  it('tem cabeçalho do mês e os blocos principais', () => {
    const t = montarRelatorioMensal(base);
    expect(t).toContain('Junho/2026');
    expect(t).toContain('Entrou');
    expect(t).toContain('Faturado');
    expect(t).toContain('Saiu');
    expect(t).toContain('Lucro');
    expect(t).toContain('Imposto');
    expect(t).toContain('A receber');
    expect(t).toContain('Mundo PF');
    expect(t).toContain('dashboard.ecosunpower.eng.br/dashboard/financeiro');
  });
  it('mostra "por fora" só quando há entrada sem nota', () => {
    expect(montarRelatorioMensal(base)).toContain('Por fora');
    expect(montarRelatorioMensal({ ...base, entrouSemNotaPj: 0 })).not.toContain('Por fora');
  });
  it('lista as categorias de gasto (maiores primeiro)', () => {
    const t = montarRelatorioMensal(base);
    expect(t).toContain('Material');
    expect(t).toContain('Instalação');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar:** `npm test -- financeiro-relatorio`.

- [ ] **Step 3: Implementar** em `src/modules/financeiro/relatorio-mensal.ts`:
```ts
// src/modules/financeiro/relatorio-mensal.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { competenciaAtual, getBuckets, getParametros } from './repo.js';
import { calcularRBT12 } from './rbt12.js';
import { fatorR, faixaPorRBT12 } from './imposto.js';
import { calcularKpisCaixa, type LancamentoKpi } from '../dashboard/caixa-kpis.js';

export interface RelatorioMensal {
  competencia: string;
  faturadoMesPj: number; entrouSemNotaPj: number; entrouMesPjCaixa: number;
  saiuMesPj: number; lucroMes: number; impostoMes: number;
  rbt12: number; faixa: number; anexoFatorR: 'I' | 'III' | 'V' | string;
  aReceber: number; entrouMesPf: number; saiuMesPf: number;
  pizzaCategorias: Array<{ categoria: string; total: number }>;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MESES_EXT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

export function nomeMesAno(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number);
  return `${MESES_EXT[mes - 1]}/${ano}`;
}

export function montarRelatorioMensal(d: RelatorioMensal): string {
  const linhas: string[] = [];
  linhas.push(`📊 *Relatório — ${nomeMesAno(d.competencia)}*`, '');
  linhas.push(`💰 *Entrou (caixa real): ${brl(d.entrouMesPjCaixa)}*`);
  linhas.push(`   🧾 Faturado (com nota): ${brl(d.faturadoMesPj)}`);
  if (d.entrouSemNotaPj > 0) linhas.push(`   📦 Por fora (sem nota): ${brl(d.entrouSemNotaPj)}`);
  linhas.push(`💸 *Saiu: ${brl(d.saiuMesPj)}*`);
  for (const c of d.pizzaCategorias.slice(0, 5)) linhas.push(`   • ${c.categoria}: ${brl(c.total)}`);
  linhas.push(`💰 *Lucro do mês: ${brl(d.lucroMes)}*`);
  linhas.push(`🧾 Imposto a separar (DAS): ${brl(d.impostoMes)} · faixa ${d.faixa} (Anexo ${d.anexoFatorR})`);
  linhas.push(`📥 A receber (em aberto agora): ${brl(d.aReceber)}`);
  linhas.push('', `👤 *Mundo PF (pessoal)*: entrou ${brl(d.entrouMesPf)} · saiu ${brl(d.saiuMesPf)}`);
  linhas.push('', `🔗 Detalhe: dashboard.ecosunpower.eng.br/dashboard/financeiro`);
  return linhas.join('\n');
}

// I/O — reúne os números do mês pedido (sem teste unitário).
export async function getRelatorioMensal(client: SupabaseClient, competencia: string): Promise<RelatorioMensal> {
  const [buckets, params] = await Promise.all([getBuckets(client), getParametros(client)]);
  const rbt12 = calcularRBT12(buckets, competencia);
  const receita12 = rbt12;
  const folha12 = params.pro_labore_mensal * 12 + params.outras_folhas_mensal * 12;
  const fr = fatorR(folha12, receita12);

  const { data: recRaw } = await client.from('financeiro_recebimentos')
    .select('valor, imposto').eq('competencia', competencia);
  const rec = (recRaw ?? []) as Array<{ valor: number; imposto: number }>;
  const faturadoMesPj = rec.reduce((s, l) => s + Number(l.valor), 0);
  const impostoMes = rec.reduce((s, l) => s + Number(l.imposto), 0);

  const { data: lancRaw } = await client.from('financeiro_lancamentos')
    .select('tipo, valor, pf_pj, tem_nota, financeiro_categorias(nome, slug)')
    .eq('status', 'confirmado').eq('competencia', competencia);
  const lancamentosMes: LancamentoKpi[] = (lancRaw ?? []).map((l) => {
    const x = l as unknown as { tipo: 'despesa' | 'entrada'; valor: number; pf_pj: 'PF' | 'PJ' | null; tem_nota: boolean; financeiro_categorias: { nome: string; slug: string } | null };
    return { tipo: x.tipo, valor: Number(x.valor), pf_pj: x.pf_pj, tem_nota: Boolean(x.tem_nota), categoriaNome: x.financeiro_categorias?.nome ?? null, categoriaSlug: x.financeiro_categorias?.slug ?? null };
  });
  const caixa = calcularKpisCaixa({ recebidoMesPj: faturadoMesPj, impostoMes, lancamentosMes });

  const { data: contasRaw } = await client.from('financeiro_contas_a_receber')
    .select('valor, valor_recebido, status');
  const contas = (contasRaw ?? []) as Array<{ valor: number; valor_recebido: number; status: string }>;
  const aReceber = contas.filter((c) => c.status === 'pendente' || c.status === 'recebido_parcial')
    .reduce((s, c) => s + (Number(c.valor) - Number(c.valor_recebido)), 0);

  return {
    competencia,
    faturadoMesPj: caixa.faturadoMesPj, entrouSemNotaPj: caixa.entrouSemNotaPj, entrouMesPjCaixa: caixa.entrouMesPjCaixa,
    saiuMesPj: caixa.saiuMesPj, lucroMes: caixa.lucroMes, impostoMes,
    rbt12, faixa: faixaPorRBT12(rbt12), anexoFatorR: fr.anexo,
    aReceber: Math.round(aReceber * 100) / 100, entrouMesPf: caixa.entrouMesPf, saiuMesPf: caixa.saiuMesPf,
    pizzaCategorias: caixa.pizzaCategorias,
  };
}
```
NOTA: confirme as assinaturas reais ao ler os arquivos — `getBuckets`/`getParametros`/`competenciaAtual` em `repo.js`, `fatorR`/`faixaPorRBT12` em `imposto.js`, `calcularKpisCaixa`/`LancamentoKpi` em `../dashboard/caixa-kpis.js`. `competenciaAtual` pode não ser usado aqui (o handler passa a competência) — só importe o que usar.

- [ ] **Step 4: Rodar e ver passar:** `npm test -- financeiro-relatorio` (parser da Task 1 + formatador). Depois `npx tsc --noEmit` (zero). Depois `npm test` (só as 2 falhas pré-existentes).

- [ ] **Step 5: Commit (Tasks 1+2 juntas)**
```bash
git add src/modules/financeiro/comando-relatorio.ts src/modules/financeiro/relatorio-mensal.ts tests/financeiro-relatorio.test.ts
git commit -m "feat(financeiro): relatório do mês — parser de período + formatador + leitura"
```

---

## Task 3: Ligar o comando no index.ts

**Files:** Modify `src/index.ts`

(I/O — verificação por tsc + smoke.)

- [ ] **Step 1: Criar o handler** perto da linha ~677 (onde `tryHandleImpostoCommand` é criado):
```ts
  // "relatório" / "relatório de maio" — resumo do mês no zap (Peça 3)
  const { makeRelatorioHandler } = await import('./modules/financeiro/comando-relatorio.js');
  const tryHandleRelatorioCommand = makeRelatorioHandler(supabase.getClient(), isAdminPhone, sendText);
```
(Se o arquivo usa imports estáticos no topo em vez de `await import`, siga o padrão do `makeImpostoHandler` — import estático no topo + criação na mesma linha. Leia como `makeImpostoHandler` é importado/criado e replique EXATAMENTE o mesmo estilo.)

- [ ] **Step 2: Chamar o handler** logo após a chamada de `tryHandleImpostoCommand` (linha ~3553), ANTES do gate da Caixa de Entrada:
```ts
    // "relatório [mês]" — resumo financeiro do mês (Peça 3)
    if (await tryHandleRelatorioCommand(from, text)) return;
```

- [ ] **Step 3: Build:** `npx tsc --noEmit` → exit 0. `npm test` → só as 2 pré-existentes.

- [ ] **Step 4: Commit**
```bash
git add src/index.ts
git commit -m "feat(financeiro): liga comando relatório no fluxo de mensagens (antes da caixa de entrada)"
```

---

## Task 4: Build marker + revisão final + smoke

- [ ] **Step 1:** Bumpar `src/build-info.ts` → `RELATORIO-MES-2026-06-16`. Commit.
- [ ] **Step 2:** Revisão final do conjunto (correção/regressão): parser cobre os formatos; formatador não quebra com zeros; gate do comando vem antes da Caixa de Entrada (senão "relatório" pode cair no extrator); nenhum lançamento é criado por engano.
- [ ] **Step 3 (Junior, pós-deploy):** Implantar; `curl /health` = RELATORIO-MES-2026-06-16; smoke:
  - "relatório" → resumo do mês atual com todos os blocos.
  - "relatório de maio" → resumo de maio.
  - confere que "relatório ..." NÃO virou um lançamento na Caixa de Entrada.

---

## Self-review (cobertura do spec)
- Mês atual + mês específico: Task 1 (parser). ✓
- Conteúdo completo PJ + Mundo PF + link: Task 2 (formatador). ✓
- Números do mês reusando o painel: Task 2 (`getRelatorioMensal`). ✓
- Comando admin antes da Caixa de Entrada: Task 3. ✓
- Sem migração/sem motor: nenhuma task toca banco/motor. ✓
