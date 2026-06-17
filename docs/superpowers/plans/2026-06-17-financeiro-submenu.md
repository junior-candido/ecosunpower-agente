# Submenu Financeiro (Peça 5) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o Financeiro uma categoria própria com submenu dentro do `/menu` da Eva (Relatório do mês, Calcular imposto, Lançar gasto/entrada, Abrir painel), tirando o item solto da "Operação".

**Architecture:** Reaproveita 100% o menu de 3 níveis já existente em `tryHandleMenuCommand` (`src/index.ts`). Único pedaço novo: o item "Calcular imposto" entra num "modo esperando valor" (estado Redis efêmero) e a Eva calcula quando o Junior digita o valor em reais. Imposto automático do dia a dia fica intacto.

**Tech Stack:** TypeScript (Node ESM), ioredis (estado efêmero, mesmo padrão do closing/dono-cad), WABA interactive list, Vitest.

---

## File Structure

- `src/modules/financeiro/comando-imposto.ts` — adicionar `parseValorReais()` (parser tolerante de valor em reais) export puro + teste.
- `src/index.ts` — (a) helpers Redis `impostoAwait*`; (b) check do "esperando valor" no `handleTextMessage` antes do `/menu`; (c) categoria `financeiro` no `MENU_CATEGORIES` + remover item solto da `operacao` + estender `MenuItem` com `action`.
- `src/build-info.ts` — bump do build marker.
- `test/financeiro/parse-valor-reais.test.ts` — testes do parser.

---

## Task 1: Parser de valor em reais (puro + testado)

**Files:**
- Modify: `src/modules/financeiro/comando-imposto.ts`
- Test: `test/financeiro/parse-valor-reais.test.ts` (criar)

- [ ] **Step 1: Write the failing test**

```ts
// test/financeiro/parse-valor-reais.test.ts
import { describe, it, expect } from 'vitest';
import { parseValorReais } from '../../src/modules/financeiro/comando-imposto.js';

describe('parseValorReais', () => {
  it('lê número puro', () => expect(parseValorReais('30000')).toBe(30000));
  it('lê milhar com ponto', () => expect(parseValorReais('30.000')).toBe(30000));
  it('lê milhar + decimal BR', () => expect(parseValorReais('30.000,50')).toBe(30000.5));
  it('lê com R$', () => expect(parseValorReais('R$ 30.000')).toBe(30000));
  it('lê "30 mil"', () => expect(parseValorReais('30 mil')).toBe(30000));
  it('lê "30k"', () => expect(parseValorReais('30k')).toBe(30000));
  it('lê decimal americano copiado', () => expect(parseValorReais('1500.50')).toBe(1500.5));
  it('lê "1,5 mi" como milhão', () => expect(parseValorReais('1,5 mi')).toBe(1500000));
  it('rejeita lixo', () => expect(parseValorReais('oi tudo bem')).toBeNull());
  it('rejeita vazio', () => expect(parseValorReais('   ')).toBeNull());
  it('rejeita zero', () => expect(parseValorReais('0')).toBeNull());
  it('rejeita negativo', () => expect(parseValorReais('-50')).toBeNull());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/financeiro/parse-valor-reais.test.ts`
Expected: FAIL — `parseValorReais` is not exported / not a function.

- [ ] **Step 3: Write minimal implementation**

Adicionar ao fim de `src/modules/financeiro/comando-imposto.ts` (antes de `makeImpostoHandler` ou após `parseImpostoCommand`):

```ts
// Lê um valor em reais escrito do jeito que o Junior digita: "30000", "30.000",
// "30.000,50", "R$ 30 mil", "30k", "1,5 mi". Retorna número > 0 ou null.
// Usado pelo "modo esperando valor" do submenu Financeiro (Calcular imposto).
export function parseValorReais(text: string): number | null {
  let s = text.trim().toLowerCase();
  s = s.replace(/r\$\s*/g, '').replace(/reais?/g, '').trim();
  const m = s.match(/^([\d.,]+)\s*(mil|k|mi|milh(?:ã|a)o|milh(?:õ|o)es)?$/);
  if (!m) return null;
  const numRaw = m[1];
  const unit = m[2];
  let mult = 1;
  if (unit === 'mil' || unit === 'k') mult = 1000;
  else if (unit) mult = 1_000_000; // mi, milhão, milhões

  // Com unidade (mil/k/mi): ponto e vírgula são decimal (ex: "1,5 mi" → 1.5).
  // Sem unidade: ponto = milhar, vírgula = decimal — exceto ponto-com-2-dígitos
  // no fim, que é decimal americano copiado de planilha (ex: "1500.50").
  const num = unit
    ? Number(numRaw.replace(',', '.'))
    : (!numRaw.includes(',') && /^\d+\.\d{2}$/.test(numRaw)
        ? Number(numRaw)
        : Number(numRaw.replace(/\./g, '').replace(',', '.')));

  return Number.isFinite(num) && num * mult > 0 ? num * mult : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/financeiro/parse-valor-reais.test.ts`
Expected: PASS (12 testes verdes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/comando-imposto.ts test/financeiro/parse-valor-reais.test.ts
git commit -m "feat(financeiro): parseValorReais — lê valor em reais (30 mil, R$ 30.000, 30k)"
```

---

## Task 2: Modo "esperando valor de imposto" (estado Redis + check no handler)

**Files:**
- Modify: `src/index.ts` (helpers Redis perto de `getClosingState` ~556; check no `handleTextMessage` antes do `/menu` ~3340)

- [ ] **Step 1: Adicionar os helpers Redis do estado efêmero**

Logo após `clearDonoCadState` (~linha 585) em `src/index.ts`, adicionar:

```ts
  // Estado efêmero do submenu Financeiro: quando o Junior toca "Calcular imposto",
  // marca que a PRÓXIMA mensagem dele é o valor da venda. TTL curto (5min) — se ele
  // sumir, o estado morre sozinho e não sequestra mensagens futuras.
  const IMPOSTO_AWAIT_TTL = 300;
  async function impostoAwaitActive(phone: string): Promise<boolean> {
    return (await closingRedis.get(`fin-imposto-await:${phone}`)) === '1';
  }
  async function setImpostoAwait(phone: string): Promise<void> {
    await closingRedis.set(`fin-imposto-await:${phone}`, '1', 'EX', IMPOSTO_AWAIT_TTL);
  }
  async function clearImpostoAwait(phone: string): Promise<void> {
    await closingRedis.del(`fin-imposto-await:${phone}`);
  }
```

- [ ] **Step 2: Importar `montarRespostaImposto` e `parseValorReais`**

No topo do `src/index.ts`, na linha de import do comando-imposto (atualmente linha 88
`import { makeImpostoHandler } from './modules/financeiro/comando-imposto.js';`), trocar por:

```ts
import { makeImpostoHandler, montarRespostaImposto, parseValorReais } from './modules/financeiro/comando-imposto.js';
```

- [ ] **Step 3: Inserir o check no `handleTextMessage`, ANTES do `/menu`**

Em `src/index.ts`, logo antes do bloco do `/menu` (linha 3340 `if (await tryHandleMenuCommand(from, text)) return;`), inserir:

```ts
    // Submenu Financeiro: se o Junior tocou "Calcular imposto" e estamos esperando
    // o valor, a PRÓXIMA mensagem que parecer um valor em reais é calculada aqui.
    // Se não parecer valor (ex: ele digitou "menu" ou outra coisa), abandona o modo
    // e deixa a mensagem seguir o fluxo normal — nunca engole comando do Junior.
    if (isAdminPhone(from) && (await impostoAwaitActive(from))) {
      const valorImposto = parseValorReais(text);
      if (valorImposto !== null) {
        await clearImpostoAwait(from);
        await sendText(from, await montarRespostaImposto(supabase.getClient(), valorImposto));
        return;
      }
      await clearImpostoAwait(from); // não era valor → sai do modo e segue o roteamento
    }
```

- [ ] **Step 4: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros novos (os 2 imports novos resolvem; `montarRespostaImposto`/`parseValorReais` existem após Task 1).

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(financeiro): modo esperando valor de imposto (estado Redis 5min)"
```

---

## Task 3: Categoria Financeiro no /menu + tirar item solto

**Files:**
- Modify: `src/index.ts` (`tryHandleMenuCommand` ~3135–3237)

- [ ] **Step 1: Estender o tipo `MenuItem` com `action`**

Em `src/index.ts` ~linha 3135, trocar a definição do tipo:

```ts
    type MenuItem = { id: string; title: string; description: string; trigger?: string; handler?: (from: string, text: string) => Promise<boolean>; hint?: string; action?: (from: string) => Promise<void> };
```

- [ ] **Step 2: Adicionar a categoria `financeiro` ao `MENU_CATEGORIES`**

Inserir um novo objeto no array `MENU_CATEGORIES`, ANTES da categoria `operacao` (ou seja, logo após o `}` que fecha a categoria `atendimento`, ~linha 3172):

```ts
      {
        id: 'financeiro', title: '💰 Financeiro', description: 'Relatório, imposto, gastos, painel',
        items: [
          { id: 'menu_fin_relatorio', title: '📊 Relatório do mês', description: 'Resumo do mês na hora', trigger: 'relatório', handler: tryHandleRelatorioCommand },
          { id: 'menu_fin_imposto', title: '🧾 Calcular imposto', description: 'Quanto separar de uma venda', action: async (to) => {
            await setImpostoAwait(to);
            await sendText(to, '🧾 Qual o valor da venda? Me manda em reais (ex: *30.000* ou *R$ 30 mil*).');
          } },
          { id: 'menu_fin_lancar', title: '💸 Lançar gasto/entrada', description: 'Foto, áudio ou texto', hint: '💸 Manda a foto/áudio do comprovante, ou escreve direto: *gastei 380 no posto* / *recebi 5000 do João*. Eu lanço e classifico sozinha.' },
          { id: 'menu_fin_painel', title: '📈 Abrir painel', description: 'Tela do financeiro', hint: '📈 Painel do financeiro: dashboard.ecosunpower.eng.br/dashboard/financeiro' },
        ],
      },
```

- [ ] **Step 3: Remover o item solto `menu_financeiro` da categoria `operacao`**

Em `src/index.ts` ~linha 3179, apagar a linha inteira:

```ts
          { id: 'menu_financeiro', title: '💰 Financeiro', description: 'Lançar gasto / caixa de entrada', hint: '💰 Manda o gasto direto (ex: "gastei 380 no posto") ou veja em dashboard.ecosunpower.eng.br/dashboard/financeiro' },
```

E ajustar a descrição da categoria `operacao` (linha 3174) tirando "financeiro":

```ts
        id: 'operacao', title: '🔧 Operação', description: 'Usinas, monitoramento, manutenção',
```

- [ ] **Step 4: Tratar o `action` no dispatch de nível 3**

Em `src/index.ts`, dentro do bloco `if (itemClick) {` (~linha 3217), ANTES do `if (item.hint)`, inserir:

```ts
      if (item.action) {
        await item.action(from);
        return true;
      }
```

- [ ] **Step 5: Verificar compilação + suíte**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc limpo; suíte verde (só as 2 falhas pré-existentes `supabase-vincular-novo`, alheias a esta mudança).

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "feat(financeiro): submenu Financeiro como categoria própria no /menu"
```

---

## Task 4: Build marker + verificação final

**Files:**
- Modify: `src/build-info.ts`

- [ ] **Step 1: Bump do build marker**

Em `src/build-info.ts`, trocar a constante do build para:

```ts
SUBMENU-FINANCEIRO-2026-06-17
```

(seguir o formato exato da constante existente no arquivo — só trocar o valor da string).

- [ ] **Step 2: Verificação final**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc limpo; suíte verde (menos as 2 pré-existentes).

- [ ] **Step 3: Commit**

```bash
git add src/build-info.ts
git commit -m "chore(financeiro): build marker SUBMENU-FINANCEIRO-2026-06-17"
```

---

## Smoke (Junior, pós-deploy)

1. Manda `menu` → aparece a categoria **💰 Financeiro** entre Atendimento e Operação; "Operação" não tem mais Financeiro.
2. Toca **💰 Financeiro** → lista os 4 itens.
3. Toca **📊 Relatório do mês** → vem o resumo do mês.
4. Toca **🧾 Calcular imposto** → Eva pergunta o valor → digita `30.000` (ou `30 mil`) → vem o cálculo.
5. Toca **🧾 Calcular imposto** → em vez do valor, digita `menu` → abre o menu normalmente (não trava).
6. Toca **💸 Lançar gasto** → vem a dica; manda "gastei 380 no posto" → lança igual hoje (dia a dia intacto).
7. `curl https://dashboard.ecosunpower.eng.br/health` → `build` = SUBMENU-FINANCEIRO-2026-06-17.

## Reviews (regra Junior: 3 code reviews antes do push)

Após implementar, rodar 3 passadas de review com lentes diferentes (correção / regressão / segurança), corrigindo os achados, antes de pedir autorização pra push.
