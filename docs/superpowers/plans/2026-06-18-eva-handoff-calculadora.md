# Eva — calculadora de verdade + trava-número + atendimento por handoff — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A Eva nunca mais erra número: o cálculo passa a ser feito por código (tabelas vetadas pelo Junior), a Eva só repete; um "trava-número" bloqueia qualquer valor que não veio do motor; e no momento do preço ela faz handoff vivo pro Junior em vez de cravar valor.

**Architecture:** Um módulo determinístico (`lead-estimativa.ts`) converte conta → consumo → painéis → kWp → preço usando as tabelas vetadas (`precos-referencia.md` pro dimensionamento + tabela de preço do Junior pro R$). Um guardrail (`trava-numero.ts`) roda na saída da Eva e barra/neutraliza qualquer número não-oficial. O `system-prompt.md` é cirurgicamente reescrito pra tirar TODOS os pontos que mandam a Eva cravar preço e instalar o handoff "o Junior pode te atender agora?".

**Tech Stack:** TypeScript, Vitest, Anthropic SDK (brain Haiku), Express.

**Comandos:** teste de 1 arquivo `npx vitest run <path>` · suíte `npm test` · build `npm run build`.

**Spec relacionada:** `docs/superpowers/specs/2026-06-18-eva-handoff-sem-preco-design.md`.

**Parâmetros oficiais (vetados pelo Junior 18/06):**
- Tabela de preço por potência (interpola entre faixas):

| kWp | R$/Wp | Total |
|---:|---:|---:|
| 3 | 3,20 | 9.600 | 
| 4 | 2,90 | 11.600 |
| 5 | 2,71 | 13.550 |
| 6 | 2,61 | 15.660 |
| 8 | 2,46 | 19.680 |
| 10 | 2,36 | 23.600 |
| 12 | 2,30 | 27.600 |
| 15 | 2,20 | 33.000 |
| 20 | 2,20 | 44.000 |
| 30 | 2,20 | 66.000 |
| 50 | 2,20 | 110.000 |
| 75 | 2,20 | 165.000 |

- Dimensionamento (de `precos-referencia.md`): conta→kWh por faixa; geração 85 kWh/mês por painel 670W; kWp = painéis × 0,670; economia = conta × 0,93.

---

## File Structure

- `src/modules/proposal/lead-estimativa.ts` — **Criar**. Calculadora determinística do lead (conta → sistema + preço + economia). Tabelas como constantes.
- `tests/lead-estimativa.test.ts` — **Criar**. Testes da calculadora (TDD).
- `src/modules/eva-trava-numero.ts` — **Criar**. Guardrail que detecta/neutraliza número não-oficial na saída da Eva.
- `tests/eva-trava-numero.test.ts` — **Criar**. Testes do guardrail.
- `src/index.ts` — **Modificar**. Rodar o trava-número na resposta da Eva antes de enviar (no fluxo que chama `brain.processMessage`).
- `src/prompts/system-prompt.md` — **Modificar**. Cirurgia: tirar/reescrever os ~15 pontos de preço; instalar handoff; reforçar anti-papagaio; frases assertivas.
- `src/prompts/residencial.md` — **Modificar**. Tirar os exemplos numéricos de preço/economia.

---

## Task 1: Calculadora determinística do lead (`lead-estimativa.ts`)

**Files:**
- Create: `src/modules/proposal/lead-estimativa.ts`
- Test: `tests/lead-estimativa.test.ts`

- [ ] **Step 1: Escrever os testes falhando**

```typescript
import { describe, it, expect } from 'vitest';
import { estimarPorConta } from '../src/modules/proposal/lead-estimativa.js';

describe('estimarPorConta — números vêm das tabelas vetadas, nunca de cabeça', () => {
  it('conta R$600 (caso Vilma) cai na faixa R$500-800 e dá sistema pequeno, NÃO R$25k', () => {
    const e = estimarPorConta(600);
    expect(e.kWp).toBeGreaterThanOrEqual(3);
    expect(e.kWp).toBeLessThanOrEqual(5.5);          // faixa 3,4-5,4 kWp
    expect(e.paineis).toBeGreaterThanOrEqual(5);
    expect(e.paineis).toBeLessThanOrEqual(8);
    expect(e.precoRs).toBeGreaterThanOrEqual(9000);
    expect(e.precoRs).toBeLessThanOrEqual(15000);    // longe dos R$25-35k que a Eva chutou
    expect(e.economiaMensalRs).toBeCloseTo(600 * 0.93, 0);
  });

  it('preço interpola a tabela do Junior entre faixas (4,5 kWp fica entre 4 e 5 kWp)', () => {
    const p4 = precoParaKwp(4);   // 11.600
    const p5 = precoParaKwp(5);   // 13.550
    const p45 = precoParaKwp(4.5);
    expect(p45).toBeGreaterThan(p4);
    expect(p45).toBeLessThan(p5);
  });

  it('clampa nos extremos da tabela (abaixo de 3 kWp usa 3; acima de 75 usa 75)', () => {
    expect(precoParaKwp(2)).toBe(precoParaKwp(3));
    expect(precoParaKwp(100)).toBe(precoParaKwp(75));
  });

  it('conta muito baixa (R$250) devolve sistema mínimo coerente', () => {
    const e = estimarPorConta(250);
    expect(e.kWp).toBeGreaterThan(0);
    expect(e.precoRs).toBeGreaterThan(0);
  });
});

// helper exportado pra teste de interpolação:
import { precoParaKwp } from '../src/modules/proposal/lead-estimativa.js';
```

- [ ] **Step 2: Rodar pra ver falhar**

Run: `npx vitest run tests/lead-estimativa.test.ts`
Expected: FAIL — módulo/funções não existem.

- [ ] **Step 3: Implementar o módulo**

```typescript
// src/modules/proposal/lead-estimativa.ts
// Calculadora determinística pra ESTIMATIVA DE LEAD (conversa da Eva).
// Todos os números saem de tabelas vetadas pelo Junior — a Eva NUNCA calcula de cabeça.
// Para a proposta final/precisa, usar calculator.ts (engine completa).

// Tabela de PREÇO do Junior (vetada 18/06). [kWp, R$/Wp].
const TABELA_PRECO: ReadonlyArray<readonly [number, number]> = [
  [3, 3.20], [4, 2.90], [5, 2.71], [6, 2.61], [8, 2.46], [10, 2.36],
  [12, 2.30], [15, 2.20], [20, 2.20], [30, 2.20], [50, 2.20], [75, 2.20],
];

// Dimensionamento (precos-referencia.md): faixa de conta -> faixa de consumo kWh.
const FAIXAS_CONSUMO: ReadonlyArray<{ contaMin: number; contaMax: number; kwhMin: number; kwhMax: number }> = [
  { contaMin: 0,    contaMax: 500,   kwhMin: 200,  kwhMax: 350 },
  { contaMin: 500,  contaMax: 800,   kwhMin: 350,  kwhMax: 550 },
  { contaMin: 800,  contaMax: 1200,  kwhMin: 550,  kwhMax: 850 },
  { contaMin: 1200, contaMax: 2000,  kwhMin: 850,  kwhMax: 1400 },
  { contaMin: 2000, contaMax: Infinity, kwhMin: 1400, kwhMax: 2200 },
];

const KWH_POR_PAINEL = 85;     // geração média mês, painel 670W (Brasília/GO)
const WP_POR_PAINEL = 670;
const FATOR_ECONOMIA = 0.93;   // desconta ~7% (taxa mínima/disponibilidade)

// Interpola linearmente entre dois pontos.
function lerp(x: number, x0: number, y0: number, x1: number, y1: number): number {
  if (x1 === x0) return y0;
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

// Preço total (R$) pra um dado kWp, interpolando a TABELA_PRECO. Clampa nos extremos.
export function precoParaKwp(kWp: number): number {
  const first = TABELA_PRECO[0];
  const last = TABELA_PRECO[TABELA_PRECO.length - 1];
  if (kWp <= first[0]) return Math.round(first[0] * 1000 * first[1]);
  if (kWp >= last[0]) return Math.round(last[0] * 1000 * last[1]);
  for (let i = 0; i < TABELA_PRECO.length - 1; i++) {
    const [k0, rs0] = TABELA_PRECO[i];
    const [k1, rs1] = TABELA_PRECO[i + 1];
    if (kWp >= k0 && kWp <= k1) {
      const rsWp = lerp(kWp, k0, rs0, k1, rs1);
      return Math.round(kWp * 1000 * rsWp);
    }
  }
  return Math.round(kWp * 1000 * last[1]);
}

// Consumo médio (kWh/mês) estimado a partir da conta, pela faixa vetada (ponto médio da faixa).
function consumoPorConta(contaRs: number): number {
  const faixa = FAIXAS_CONSUMO.find(f => contaRs >= f.contaMin && contaRs < f.contaMax)
    ?? FAIXAS_CONSUMO[FAIXAS_CONSUMO.length - 1];
  // interpola dentro da faixa pela posição da conta
  const max = faixa.contaMax === Infinity ? faixa.contaMin * 2 : faixa.contaMax;
  return Math.round(lerp(contaRs, faixa.contaMin, faixa.kwhMin, max, faixa.kwhMax));
}

export interface EstimativaLead {
  consumoKwh: number;
  paineis: number;
  kWp: number;
  precoRs: number;
  economiaMensalRs: number;
}

export function estimarPorConta(contaRs: number): EstimativaLead {
  const consumoKwh = consumoPorConta(contaRs);
  const paineis = Math.max(1, Math.round(consumoKwh / KWH_POR_PAINEL));
  const kWp = Math.round(paineis * WP_POR_PAINEL / 10) / 100; // 2 casas
  const precoRs = precoParaKwp(kWp);
  const economiaMensalRs = Math.round(contaRs * FATOR_ECONOMIA);
  return { consumoKwh, paineis, kWp, precoRs, economiaMensalRs };
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run tests/lead-estimativa.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/proposal/lead-estimativa.ts tests/lead-estimativa.test.ts
git commit -m "feat: calculadora determinística de estimativa de lead (tabelas vetadas)"
```

---

## Task 2: Trava-número (guardrail na saída da Eva)

**Files:**
- Create: `src/modules/eva-trava-numero.ts`
- Test: `tests/eva-trava-numero.test.ts`

Objetivo: receber o texto que a Eva vai mandar e **barrar** se contiver um número de preço/dimensionamento (R$ de sistema, kWp, painéis, kWh, payback) — porque, no novo fluxo, a Eva NÃO deve cravar esses números (ela faz handoff). Retorna se está limpo e quais padrões bateram (pra log + substituição por uma frase de handoff).

- [ ] **Step 1: Escrever os testes falhando**

```typescript
import { describe, it, expect } from 'vitest';
import { detectarNumeroProibido } from '../src/modules/eva-trava-numero.js';

describe('detectarNumeroProibido — barra número de preço/dimensionamento na fala da Eva', () => {
  it('barra preço de sistema em reais', () => {
    expect(detectarNumeroProibido('fica entre R$25 mil e R$35 mil').bloqueado).toBe(true);
    expect(detectarNumeroProibido('o sistema sai por R$ 28.000').bloqueado).toBe(true);
  });
  it('barra kWp e quantidade de painéis', () => {
    expect(detectarNumeroProibido('um sistema de 6 kWp').bloqueado).toBe(true);
    expect(detectarNumeroProibido('uns 7 painéis já resolvem').bloqueado).toBe(true);
  });
  it('barra kWh e payback', () => {
    expect(detectarNumeroProibido('você gera 650 kWh/mês').bloqueado).toBe(true);
    expect(detectarNumeroProibido('payback de 4 anos').bloqueado).toBe(true);
  });
  it('NÃO barra o valor da conta que o cliente falou (texto comum)', () => {
    expect(detectarNumeroProibido('me confirma: sua conta veio R$600 na última?').bloqueado).toBe(false);
    expect(detectarNumeroProibido('o Junior pode te atender agora?').bloqueado).toBe(false);
    expect(detectarNumeroProibido('amanhã qual horário fica melhor?').bloqueado).toBe(false);
  });
});
```

> Nota: "perguntar a conta do cliente" usa R$ mas é permitido — a heurística mira em **afirmar preço de sistema / dimensionamento**. As frases de pergunta de conta seguem padrões específicos (ver implementação) e ficam liberadas.

- [ ] **Step 2: Rodar pra ver falhar**

Run: `npx vitest run tests/eva-trava-numero.test.ts`
Expected: FAIL — função não existe.

- [ ] **Step 3: Implementar**

```typescript
// src/modules/eva-trava-numero.ts
// Guardrail: no novo fluxo a Eva NÃO crava preço/dimensionamento (faz handoff).
// Esta função detecta se a resposta dela vazou um número desses pra barrar antes de enviar.

export interface ResultadoTrava {
  bloqueado: boolean;
  motivos: string[];
}

// Padrões que indicam a Eva AFIRMANDO preço/dimensionamento de sistema.
const PADROES: Array<{ nome: string; re: RegExp }> = [
  // preço de sistema em reais: "R$25 mil", "R$ 28.000", "R$25 a R$35 mil"
  { nome: 'preco_reais', re: /r\$\s?\d{1,3}([.\s]?\d{3})*(\s?mil)?/i },
  { nome: 'kwp',     re: /\b\d{1,3}([.,]\d+)?\s?kwp\b/i },
  { nome: 'paineis', re: /\b\d{1,3}\s?pain[eé]is\b/i },
  { nome: 'kwh',     re: /\b\d{2,5}\s?kwh\b/i },
  { nome: 'payback', re: /payback[^.]{0,20}\d+\s?anos|\bem\s\d+\s?anos\b/i },
];

// Frases-pergunta sobre a conta do cliente são liberadas (usam R$ mas não afirmam preço).
const LIBERADAS: RegExp[] = [
  /sua conta (veio|fica|é|foi|tá|esta)/i,
  /quanto (veio|vem|você paga|custa sua conta)/i,
  /conta de luz/i,
];

export function detectarNumeroProibido(texto: string): ResultadoTrava {
  const t = texto ?? '';
  // Se é claramente pergunta sobre a conta do cliente, e o único R$ é o da conta, libera.
  const ehPerguntaConta = LIBERADAS.some(re => re.test(t));
  const motivos: string[] = [];
  for (const p of PADROES) {
    if (p.re.test(t)) {
      // 'preco_reais' dentro de pergunta de conta é permitido; os outros (kWp/painéis/kWh/payback) nunca.
      if (p.nome === 'preco_reais' && ehPerguntaConta) continue;
      motivos.push(p.nome);
    }
  }
  return { bloqueado: motivos.length > 0, motivos };
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run tests/eva-trava-numero.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/eva-trava-numero.ts tests/eva-trava-numero.test.ts
git commit -m "feat: trava-número — guardrail que barra preço/dimensionamento na fala da Eva"
```

---

## Task 3: Aplicar o trava-número na saída da Eva (wire no handler)

**Files:**
- Modify: `src/index.ts` (no ponto após `brain.processMessage` retornar o texto, ~linha 4410, antes de enviar pro cliente)

- [ ] **Step 1: Localizar o ponto de envio**

Ler `src/index.ts` ao redor da linha 4410 (`const response = await brain.processMessage(...)`) e achar onde o `displayText` é mandado pro cliente (`metaWaba.sendText`/`sendInteractiveButtons`).

- [ ] **Step 2: Inserir o guardrail**

Logo antes de enviar o texto da Eva pro cliente, inserir:

```typescript
      // TRAVA-NÚMERO: no fluxo novo a Eva não crava preço/dimensionamento (faz handoff).
      // Se vazou um número desses, troca por uma linha de handoff e loga pra revisão.
      {
        const { detectarNumeroProibido } = await import('./modules/eva-trava-numero.js');
        const trava = detectarNumeroProibido(displayTextDaEva);
        if (trava.bloqueado) {
          console.warn(`[trava-numero] resposta da Eva barrada (${trava.motivos.join(',')}): ${displayTextDaEva.slice(0, 200)}`);
          displayTextDaEva =
            'Pra te passar o número certo, o Junior (nosso Responsável Técnico) vê seu caso direitinho. ' +
            'Ele pode te atender agora — posso já chamar ele aqui?';
        }
      }
```

(`displayTextDaEva` = a variável real que guarda o texto da resposta — ajustar o nome ao que existe no arquivo.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: aplica trava-número na resposta da Eva antes de enviar"
```

---

## Task 4: Cirurgia no prompt — tirar preço, instalar handoff, anti-papagaio, frases assertivas

**Files:**
- Modify: `src/prompts/system-prompt.md`
- Modify: `src/prompts/residencial.md`

Esta é a maior mudança e é majoritariamente texto — verificação por **review** + asserções simples de "não contém mais X".

- [ ] **Step 1 — Remover/reescrever os pontos de PREÇO** (referência: auditoria em `docs/superpowers/specs/2026-06-18-eva-handoff-sem-preco-design.md`)

Tratar cada um (linhas aproximadas; confirmar conteúdo antes de editar):
- **95–107 (mandamento 7):** reescrever pra: "PREÇO — você NUNCA dá número. Quando o cliente toca em preço, faça o handoff vivo (script abaixo)."
- **55:** "É caro" → resposta de valor, **sem** "R$15-25 mil".
- **77, 105, 611, 615, 990–996, 1013–1014, 1378–1382:** remover os números cravados.
- **86–93 (mand. 6):** remover o quote de parcela (R$28.000/60x).
- **145, 163–164:** remover regra de "à vista + parcelado" e payback.
- **195, 625, 635, 642:** trocar "Eva faz cálculos/estimativas" por "Eva NÃO apresenta número calculado; quem dá número é o Junior / a calculadora do sistema".
- **residencial.md 16–26:** remover os exemplos "7 painéis Trina → R$740/mês".

- [ ] **Step 2 — Instalar o bloco de HANDOFF no topo** (perto dos mandamentos, ~linha 95)

Adicionar bloco curto e absoluto:

```markdown
### PREÇO E NÚMEROS — REGRA ABSOLUTA
Você NUNCA fala preço de sistema, parcela em R$, kWp, quantidade de painéis, kWh estimado ou payback. Nem "faixa", nem "em média", nem "uns ~X". Quem dá número é o Junior ou a calculadora do sistema — nunca você de cabeça.

Quando o cliente perguntar preço/valor (ou quando você já tem conta + telhado + cidade), faça o HANDOFF VIVO:
> "O Junior, nosso Responsável Técnico, pode te atender agora pra te passar o valor certinho do seu caso. Posso já chamar ele aqui?"
- Cliente disser SIM → emita **action: transfer_to_human** (reason: "cliente quer valor — handoff ao vivo") e avise: "Perfeito! Já estou chamando ele 🙌".
- Qualquer outra resposta (agora não / mais tarde / vou pensar) → proponha um horário concreto ("amanhã de manhã ou à tarde?") E **mesmo assim** emita transfer_to_human (reason: "lead quente — cliente quer pensar/retorno") pra o Junior não perder o lead.
```

- [ ] **Step 3 — Reforçar ANTI-PAPAGAIO com exemplos** (nas linhas 537–553)

Garantir 2-3 exemplos concretos do jeito certo (reconhece em 1-3 palavras e AVANÇA), ex.:

```markdown
❌ Cliente: "600" → Eva: "Perfeito, R$600 é uma conta que..."  (ECOOU — proibido)
✅ Cliente: "600" → Eva: "Boa! Seu telhado é de telha, laje ou metálico?"  (reconhece curto + avança)
❌ Cliente: "vou trocar o telhado" → Eva: "Ah, entendi, você vai trocar o telhado e..."  (ECOOU)
✅ Cliente: "vou trocar o telhado" → Eva: "Show! Já coordeno isso com você. Amanhã consigo te encaixar — manhã ou tarde?"
```

- [ ] **Step 4 — Frases assertivas vs proibidas** (nas linhas 110–123)

Adicionar lista explícita:

```markdown
PROIBIDO (passivo, esfria negócio): "te aguardo", "pode pensar com calma", "qualquer coisa me chama", "te mando depois".
OBRIGATÓRIO (assertivo, propõe horário concreto): "amanhã qual horário?", "hoje ainda tem horário?", "manhã ou tarde?", "consigo te encaixar ainda hoje".
```

- [ ] **Step 5 — Asserção automática (teste leve do prompt)**

Criar `tests/system-prompt-sem-preco.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(process.cwd(), 'src/prompts/system-prompt.md'), 'utf-8');

describe('system-prompt: regra de preço foi trocada por handoff', () => {
  it('não manda mais "dá um número"', () => {
    expect(prompt).not.toMatch(/dá um número/i);
  });
  it('não cita faixa de preço cravada tipo "R$15-25 mil"', () => {
    expect(prompt).not.toMatch(/R\$\s?15-25\s?mil/i);
  });
  it('tem a regra absoluta de nunca falar número', () => {
    expect(prompt).toMatch(/NUNCA fala preço de sistema/i);
  });
  it('tem o script de handoff "pode te atender agora"', () => {
    expect(prompt).toMatch(/pode te atender agora/i);
  });
});
```

Run: `npx vitest run tests/system-prompt-sem-preco.test.ts` → deve passar depois das edições.

- [ ] **Step 6 — Build + suíte + commit**

```bash
npm run build && npm test
git add src/prompts/system-prompt.md src/prompts/residencial.md tests/system-prompt-sem-preco.test.ts
git commit -m "feat: prompt da Eva — nunca cravar preço, handoff vivo, anti-papagaio, frases assertivas"
```

---

## Verificação final (antes de pedir push)

- [ ] `npm run build` limpo.
- [ ] `npm test` verde (lembrar: 2 falhas pré-existentes em `supabase-vincular-novo.test.ts` são conhecidas e fora de escopo).
- [ ] Code review 3× (regra do Junior), corrigindo achados.
- [ ] Smoke combinado com o Junior: simular lead → confirmar que a Eva (a) não crava número, (b) faz "o Junior pode te atender agora?", (c) não ecoa, (d) propõe horário concreto; e validar a calculadora num caso real (conta R$600 → ~R$10-13k, nunca R$25k+).

## Fora de escopo (YAGNI / fast-follow)
- Injetar números oficiais no contexto pra a Eva PODER falar um número certo (hoje ela só faz handoff; a calculadora já existe pra quando a gente quiser ativar isso).
- Subir o brain de Haiku→Sonnet (decisão do Junior; o código já garante o número certo independente do modelo).
- Usar `calculator.ts` (engine completa) no lugar das fórmulas vetadas pro lead — só se quisermos economia/payback idênticos à proposta final.
- Tarifa de Goiás/Equatorial (hoje a faixa de consumo é Brasília/GO da tabela vetada).
