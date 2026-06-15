# EcoSof — Eva Vitrine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar uma instância clone do agente numa vendedora do EcoSof (Eva vitrine), via um modo que troca o prompt e o conhecimento, sem afetar o sistema solar da EcoSunPower.

**Architecture:** Um modo lido de uma variável de ambiente `EVA_MODO` (sync no boot, antes da config do banco). Quando `EVA_MODO=vitrine_ecosof`, o `Brain` carrega `system-prompt-vitrine.md` e a `KnowledgeBase` aponta pra `conhecimento-ecosof/`. Default (ausente/`solar`) = comportamento atual, intocado. Um helper puro `eva-modo.ts` centraliza a decisão (testável). O link de pagamento vai num campo `empresa_config.link_pagamento` (interpolado no prompt via `{{link_pagamento}}` em runtime).

**Tech Stack:** TypeScript/Node, vitest, Supabase (migration), markdown (prompt + conhecimento).

**Refinamento sobre a spec:** o modo vai por **env var `EVA_MODO`** (não campo no banco) — é sync no boot, onde o `Brain`/`KnowledgeBase` são construídos, e é como os clones já são configurados (Easypanel env). O `link_pagamento` fica no banco (usado em runtime, quando a config já carregou).

---

## File Structure

- **Create** `src/modules/eva-modo.ts` — helper puro: lê `EVA_MODO`, decide prompt file e pasta de conhecimento. Uma responsabilidade: resolver o modo.
- **Create** `tests/eva-modo.test.ts` — testa o helper.
- **Modify** `src/modules/brain.ts` (~58-63) — escolhe o prompt file pelo helper.
- **Modify** `src/index.ts` (~242) — escolhe a pasta de conhecimento pelo helper.
- **Create** `migrations/050_empresa_config_link_pagamento.sql` — coluna `link_pagamento`.
- **Modify** `src/modules/empresa-config.ts` — campo `linkPagamento` (type, default, normalizar, placeholder `{{link_pagamento}}`).
- **Modify** `tests/` (empresa-config test, se existir) — normalizar do novo campo.
- **Create** `src/prompts/system-prompt-vitrine.md` — persona vendedora + roteiro do funil.
- **Create** `conhecimento-ecosof/{produto,planos-precos,garantia,objecoes,prova,processo}.md` — base de conhecimento do produto.

---

## Task 1: Helper de modo (`eva-modo.ts`)

**Files:**
- Create: `src/modules/eva-modo.ts`
- Test: `tests/eva-modo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/eva-modo.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { isVitrineEcosof, promptFileDoModo, conhecimentoDirDoModo } from '../src/modules/eva-modo.js';

afterEach(() => { delete process.env.EVA_MODO; });

describe('eva-modo', () => {
  it('default (sem EVA_MODO) = solar', () => {
    expect(isVitrineEcosof()).toBe(false);
    expect(promptFileDoModo()).toBe('system-prompt.md');
    expect(conhecimentoDirDoModo()).toBe('conhecimento');
  });
  it('EVA_MODO=vitrine_ecosof → prompt e pasta da vitrine', () => {
    process.env.EVA_MODO = 'vitrine_ecosof';
    expect(isVitrineEcosof()).toBe(true);
    expect(promptFileDoModo()).toBe('system-prompt-vitrine.md');
    expect(conhecimentoDirDoModo()).toBe('conhecimento-ecosof');
  });
  it('valor desconhecido cai no solar (seguro)', () => {
    process.env.EVA_MODO = 'qualquer';
    expect(isVitrineEcosof()).toBe(false);
    expect(promptFileDoModo()).toBe('system-prompt.md');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/eva-modo.test.ts`
Expected: FAIL ("Cannot find module ../src/modules/eva-modo.js")

- [ ] **Step 3: Write minimal implementation**

```ts
// src/modules/eva-modo.ts
// Modo da instância, lido de EVA_MODO no boot (sync). Default = solar (EcoSunPower),
// comportamento intocado. 'vitrine_ecosof' troca prompt + conhecimento (vendedora do EcoSof).
export function isVitrineEcosof(): boolean {
  return process.env.EVA_MODO === 'vitrine_ecosof';
}
export function promptFileDoModo(): string {
  return isVitrineEcosof() ? 'system-prompt-vitrine.md' : 'system-prompt.md';
}
export function conhecimentoDirDoModo(): string {
  return isVitrineEcosof() ? 'conhecimento-ecosof' : 'conhecimento';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/eva-modo.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/modules/eva-modo.ts tests/eva-modo.test.ts
git commit -m "feat(ecosof): helper eva-modo (switch solar/vitrine por EVA_MODO)"
```

---

## Task 2: Brain escolhe o prompt pelo modo

**Files:**
- Modify: `src/modules/brain.ts` (~58-63, construtor)

- [ ] **Step 1: Modificar o construtor pra usar o helper**

Trocar a leitura hardcoded `'system-prompt.md'` por `promptFileDoModo()`. Adicionar o import no topo do arquivo:

```ts
import { promptFileDoModo } from './eva-modo.js';
```

No construtor:

```ts
    const promptsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');
    this.systemPrompt = readFileSync(join(promptsDir, promptFileDoModo()), 'utf-8');
    this.residencialPrompt = readFileSync(join(promptsDir, 'residencial.md'), 'utf-8');
```

- [ ] **Step 2: tsc + smoke**

Run: `npx tsc --noEmit`
Expected: EXIT 0. (O Brain ainda lê `system-prompt.md` quando `EVA_MODO` não está setado — comportamento atual preservado. `system-prompt-vitrine.md` é criado na Task 6; sem ele, o modo vitrine só funciona após a Task 6 — ordem garante isso.)

- [ ] **Step 3: Commit**

```bash
git add src/modules/brain.ts
git commit -m "feat(ecosof): Brain carrega o prompt do modo (vitrine vs solar)"
```

---

## Task 3: KnowledgeBase escolhe a pasta pelo modo

**Files:**
- Modify: `src/index.ts` (~242, `const knowledgeBase = new KnowledgeBase(...)`)

- [ ] **Step 1: Trocar a pasta hardcoded pela do helper**

Adicionar import no topo do index.ts (junto dos outros imports de modules):

```ts
import { conhecimentoDirDoModo } from './modules/eva-modo.js';
```

Na linha ~242, trocar:

```ts
  const knowledgeBase = new KnowledgeBase(join(__dirname, '..', conhecimentoDirDoModo()));
```

(As outras referências a `'conhecimento'` no index.ts — proposalAssistant, pricing — são dos modos solares, NÃO usados pela vitrine; ficam como estão. A vitrine só usa o chat geral, que consome este `knowledgeBase`.)

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(ecosof): KnowledgeBase aponta pra pasta do modo (vitrine vs solar)"
```

---

## Task 4: Campo `link_pagamento` na empresa_config

**Files:**
- Create: `migrations/050_empresa_config_link_pagamento.sql`
- Modify: `src/modules/empresa-config.ts`

- [ ] **Step 1: Migration**

```sql
-- migrations/050_empresa_config_link_pagamento.sql
-- Link de pagamento recorrente (EcoSof / Peça C). Interpolado no prompt via {{link_pagamento}}.
ALTER TABLE empresa_config ADD COLUMN IF NOT EXISTS link_pagamento text;
```

- [ ] **Step 2: Adicionar o campo no tipo + default + normalizar + placeholder**

Em `src/modules/empresa-config.ts`:
- No `interface EmpresaConfig` (junto de `email/siteUrl`): `linkPagamento: string | null;`
- No `EMPRESA_DEFAULTS`: `linkPagamento: null,`
- No `normalizarEmpresaRow` (junto de `email/site_url`): `linkPagamento: sn(row.link_pagamento) ?? D.linkPagamento,`
- No mapa de placeholders (onde tem `nome_atendente: e.nomeAtendente`): `link_pagamento: e.linkPagamento ?? '',`

- [ ] **Step 3: Teste do normalizar (se houver tests/empresa-config*.test.ts; senão criar)**

```ts
// tests/empresa-config-link.test.ts
import { describe, it, expect } from 'vitest';
import { normalizarEmpresaRow } from '../src/modules/empresa-config.js';

describe('empresa-config link_pagamento', () => {
  it('lê link_pagamento da row', () => {
    const c = normalizarEmpresaRow({ link_pagamento: 'https://pay.ex/abc' });
    expect(c.linkPagamento).toBe('https://pay.ex/abc');
  });
  it('default null quando ausente', () => {
    const c = normalizarEmpresaRow({});
    expect(c.linkPagamento).toBeNull();
  });
});
```

- [ ] **Step 4: Rodar**

Run: `npx vitest run tests/empresa-config-link.test.ts && npx tsc --noEmit`
Expected: PASS + EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add migrations/050_empresa_config_link_pagamento.sql src/modules/empresa-config.ts tests/empresa-config-link.test.ts
git commit -m "feat(ecosof): empresa_config.link_pagamento (placeholder {{link_pagamento}})"
```

---

## Task 5: Conhecimento do EcoSof (`conhecimento-ecosof/`)

**Files:**
- Create: `conhecimento-ecosof/produto.md`, `planos-precos.md`, `garantia.md`, `objecoes.md`, `prova.md`, `processo.md`

Conteúdo (prosa, sem teste automatizado — validado por leitura + smoke do Junior). Cada arquivo curto e direto, escrito com acento completo (regra de prompts PT-BR). Base de conteúdo (da spec pai):

- [ ] **Step 1: `produto.md`** — o que é o EcoSof: a Eva (atendente IA 24h no WhatsApp, com o NOME e a marca do CLIENTE — white-label), propostas com a marca do cliente, dashboard de leads; no plano Completo: financeiro (imposto Simples) + monitoramento (lista honesta: SolarEdge, Deye, NEP, ABB) + marketing IA. "Nasceu dentro de uma empresa de energia de verdade."

- [ ] **Step 2: `planos-precos.md`** — Essencial R$297/mês · Completo R$597/mês · Implantação R$497 (única). Preço fundador travado pros 10 primeiros. O que cada plano inclui.

- [ ] **Step 3: `garantia.md`** — 30 dias incondicional, paga desde o dia 1, SEM teste grátis de instância própria (a demo é a própria Eva vitrine).

- [ ] **Step 4: `objecoes.md`** — respostas: "é caro?" (1 venda paga meses), "e se copiarem?" (código nunca sai do servidor; o fosso é a Eva treinada), "tem suporte?" (white glove + 1º nível), "serve pro meu caso?" (qualquer profissional da elétrica), "não tem teste grátis?" (garantia 30d cobre o risco).

- [ ] **Step 5: `prova.md`** — case Ferraz: venda de R$33k com R$255 de anúncio; atendimento 24h sem perder lead; velocidade de evolução.

- [ ] **Step 6: `processo.md`** — implantação white glove em até 3 dias úteis; o cliente só passa marca, preços e o número de WhatsApp — o resto a gente faz (menos no-code pro cliente).

- [ ] **Step 7: Commit**

```bash
git add conhecimento-ecosof/
git commit -m "feat(ecosof): base de conhecimento do produto (vitrine)"
```

---

## Task 6: Prompt da vitrine (`system-prompt-vitrine.md`)

**Files:**
- Create: `src/prompts/system-prompt-vitrine.md`

- [ ] **Step 1: Escrever o prompt da persona vendedora + roteiro do funil**

Estrutura (usa placeholders `{{nome_atendente}}`, `{{empresa_nome}}`, `{{link_pagamento}}` — interpolados em runtime):
- **Identidade:** "Você é a {{nome_atendente}}, e você É o produto da {{empresa_nome}} (EcoSof) — o software que a pessoa pode ter na empresa dela, com o nome e a cara dela."
- **Objetivo:** vender o EcoSof pra profissionais da elétrica/solar. NUNCA agir como atendente solar (não qualificar conta de luz, não gerar proposta solar).
- **Roteiro do funil (da spec):** abertura → qualifica o integrador (ramo, cidade, leads perdidos/mês) → demonstra valor nela mesma + prova (Ferraz R$33k/R$255) → planos + garantia 30d → objeções → fechamento: quente manda {{link_pagamento}} OU oferece agendar 15min.
- **Tom:** humano, curto, WhatsApp; sem jargão; sem prometer marca não suportada (lista honesta).
- **Regras:** se {{link_pagamento}} estiver vazio, oferecer "te passo o link / agenda 15min" e registrar o quente. Não inventar preço/recurso fora do conhecimento.

- [ ] **Step 2: Smoke local (sem deploy)**

Run: `EVA_MODO=vitrine_ecosof npx tsc --noEmit` (garante que o boot referencia o arquivo certo; o arquivo agora existe). Verificação real = Junior testa numa instância de teste com `EVA_MODO=vitrine_ecosof`.

- [ ] **Step 3: Commit**

```bash
git add src/prompts/system-prompt-vitrine.md
git commit -m "feat(ecosof): prompt da Eva vitrine (vendedora do funil)"
```

---

## Verificação final

- [ ] `npx tsc --noEmit` limpo
- [ ] `npx vitest run` — só as 2 falhas pré-existentes de `supabase-vincular-novo`
- [ ] Modo solar (sem `EVA_MODO`): nada mudou (regressão coberta pelo teste do eva-modo + suíte)
- [ ] Code review 3× (padrão do Junior)
- [ ] Pendências fora do código (Junior): aplicar migration 050; deploy da instância vitrine com `EVA_MODO=vitrine_ecosof` + número WABA próprio; preencher `link_pagamento` (Peça C).
