# Proposta de serviço com preço por item — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Junior dá preço por serviço e o sistema soma sozinho; o botão "🔧 Proposta de serviço" do menu abre o modo proposta de verdade (a mensagem para de vazar pro Financeiro).

**Architecture:** 3 mudanças cirúrgicas, sem motor novo: (1) `isProposalTrigger` aceita "proposta de serviço …" solto; (2) o item do menu troca `hint` por `trigger`+`handler` (padrão do item vizinho `menu_proposta`); (3) a regra 10 do prompt da Eva inverte a preferência — preço por item vira caminho oficial, com trava de item sem preço e de total conflitante, e resumo de conferência itemizado. A soma/render por item JÁ existe (`totalServicoData`, `renderServiceOnlyHTML`) e não é tocada.

**Tech Stack:** TypeScript ESM (imports com `.js`), vitest. Spec: `docs/superpowers/specs/2026-07-02-proposta-servico-preco-por-item-design.md`.

**Regras do repo:** branch `feat/proposta-servico-preco-por-item` (já criada). `git add` por nome de arquivo (NUNCA `-A`/`.`). Commits terminam com `Co-Authored-By:`. Antes do PR: `npx tsc --noEmit` limpo + `npx vitest run` verde. Sem migration.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/modules/proposal-assistant.ts` | modificar | gatilho `isProposalTrigger` (~linha 722) + regra 10 do prompt em `buildSystemPrompt` (~linha 428) + exportar `buildSystemPrompt` pra teste |
| `tests/proposal-multi-item-assistant.test.ts` | modificar | testes do gatilho novo + teste de conteúdo do prompt |
| `src/modules/menu/menu.ts` | modificar | `menu_proposta_servico`: hint → trigger+handler (~linha 38) |
| `tests/menu.test.ts` | modificar | teste do item do menu |

---

### Task 1: Gatilho "proposta de serviço" escrito solto

**Files:**
- Modify: `src/modules/proposal-assistant.ts` (~linha 722, dentro de `isProposalTrigger`)
- Test: `tests/proposal-multi-item-assistant.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/proposal-multi-item-assistant.test.ts`, adicionar `ProposalAssistant` ao import da linha 2 (é export nomeado do mesmo módulo) e acrescentar no FIM do arquivo:

```ts
describe('isProposalTrigger — proposta de serviço', () => {
  const t = (s: string) => ProposalAssistant.isProposalTrigger(s);

  it('"proposta de serviço ..." solto (sem barra) dispara', () => {
    expect(t('proposta de serviço pro Thiago — desmontagem, transporte, total R$ 7.800')).toBe(true);
  });
  it('"Proposta de serviço" sozinho dispara (case/acento indiferente)', () => {
    expect(t('Proposta de serviço')).toBe(true);
    expect(t('proposta de servico')).toBe(true);
  });
  it('"/proposta de serviço" (do botão do menu) dispara', () => {
    expect(t('/proposta de serviço')).toBe(true);
  });
  it('"proposta de serviços" (plural) dispara', () => {
    expect(t('proposta de serviços pro condomínio')).toBe(true);
  });
  it('frase com o termo no MEIO não dispara', () => {
    expect(t('a proposta de serviço do concorrente chegou')).toBe(false);
  });
  it('lançamento financeiro não dispara', () => {
    expect(t('recebi 5000 do João')).toBe(false);
  });
  it('gatilhos antigos seguem valendo', () => {
    expect(t('/proposta')).toBe(true);
    expect(t('proposta')).toBe(true);
    expect(t('quero gerar proposta pro Marcio')).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/proposal-multi-item-assistant.test.ts`
Expected: FAIL — o teste do "solto sem barra" e o do plural recebem `false` ("/proposta de serviço" e os antigos já passam).

- [ ] **Step 3: Implementação mínima**

Em `src/modules/proposal-assistant.ts`, dentro de `isProposalTrigger`, logo DEPOIS da linha `if (/^\/(proposta|propor|gerar?\s*proposta)(\s|$)/.test(norm)) return true;` (~722), adicionar:

```ts
    // "proposta de serviço ..." escrito solto (o jeito que o menu ensina)
    // também abre o modo — sem isso a mensagem caía solta e a Caixa de
    // Entrada do financeiro tratava os R$ como lançamento (botões PF/PJ).
    if (/^\/?proposta de servicos?(\s|$)/.test(norm)) return true;
```

(`norm` já está minúsculo, sem acento e sem pontuação — "serviço" vira "servico"; a barra é preservada pela normalização, por isso o `\/?`.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/proposal-multi-item-assistant.test.ts`
Expected: PASS em todos.

- [ ] **Step 5: Commit**

```bash
git add src/modules/proposal-assistant.ts tests/proposal-multi-item-assistant.test.ts
git commit -m "feat(proposta): gatilho aceita 'proposta de servico' escrito solto

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Botão do menu abre o modo proposta

**Files:**
- Modify: `src/modules/menu/menu.ts:38`
- Test: `tests/menu.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Em `tests/menu.test.ts`, dentro do `describe('menu — comandos novos', ...)` (que já tem os helpers `item(id)` e `catDoItem(id)` nas linhas ~70-71), adicionar:

```ts
  it('proposta de serviço DISPARA o modo proposta (não é mais só dica)', () => {
    const i = item('menu_proposta_servico');
    expect(catDoItem('menu_proposta_servico')).toBe('propostas');
    expect(i?.trigger).toBe('/proposta de serviço');
    expect(i?.handler).toBeDefined();
    expect(i?.hint).toBeUndefined();
    expect(i?.description).toContain('por item');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/menu.test.ts`
Expected: FAIL — hoje o item tem `hint` e não tem `trigger`/`handler`.

- [ ] **Step 3: Implementação mínima**

Em `src/modules/menu/menu.ts` linha 38, substituir o item inteiro por:

```ts
        { id: 'menu_proposta_servico', title: '🔧 Proposta de serviço', description: 'Sem solar — por item ou valor fechado', trigger: '/proposta de serviço', handler: deps.proposal },
```

(Mesmo padrão do `menu_proposta` da linha 37. O título não muda — continua ≤ 24 unidades, teste de limite segue verde.)

- [ ] **Step 4: Rodar e ver passar (menu inteiro)**

Run: `npx vitest run tests/menu.test.ts`
Expected: PASS em todos (estrutura, Voltar, limites e o teste novo).

- [ ] **Step 5: Commit**

```bash
git add src/modules/menu/menu.ts tests/menu.test.ts
git commit -m "feat(menu): botao proposta de servico abre o modo proposta de verdade

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Prompt da Eva — preço por item vira caminho oficial

**Files:**
- Modify: `src/modules/proposal-assistant.ts` (função `buildSystemPrompt`, trecho **PROPOSTA SÓ DE SERVIÇO** ~linha 428; e a declaração da função pra exportá-la)
- Test: `tests/proposal-multi-item-assistant.test.ts`

- [ ] **Step 1: Exportar `buildSystemPrompt` pra teste**

Em `src/modules/proposal-assistant.ts`, trocar `function buildSystemPrompt(` por `export function buildSystemPrompt(` (a função é module-level, sem estado; exportar só habilita o teste de conteúdo — padrão já usado com `mapServicosFromClaude` etc.).

- [ ] **Step 2: Escrever o teste de conteúdo que falha**

Em `tests/proposal-multi-item-assistant.test.ts`, adicionar `buildSystemPrompt` ao import da linha 2 e acrescentar no fim:

```ts
describe('buildSystemPrompt — regra da proposta de serviço', () => {
  const prompt = buildSystemPrompt('', '');

  it('preço POR ITEM é caminho oficial (sistema soma, Eva não)', () => {
    expect(prompt).toContain('POR ITEM');
    expect(prompt).toContain('O SISTEMA SOMA');
  });
  it('trava: tarefa sem preço numa precificação por item → perguntar', () => {
    expect(prompt).toContain('pergunte o preço DELA');
  });
  it('trava: total que não bate com a soma → perguntar qual vale', () => {
    expect(prompt).toContain('pergunte qual vale');
  });
  it('resumo de conferência itemizado no só-serviço', () => {
    expect(prompt).toContain('liste CADA serviço com o preço');
  });
  it('a instrução antiga de "quase sempre valor único" saiu', () => {
    expect(prompt).not.toContain('quase sempre é orçado por UM VALOR ÚNICO');
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/proposal-multi-item-assistant.test.ts`
Expected: FAIL nos 5 testes novos (o texto antigo ainda está lá).

- [ ] **Step 4: Reescrever o trecho do prompt**

Em `buildSystemPrompt`, localizar o parágrafo que começa com `**PROPOSTA SÓ DE SERVIÇO (sem solar):**` (~linha 428) — ele termina em `NÃO liste os campos solares em \`missing\`.` — e substituí-lo INTEIRO por (mantendo o mesmo estilo de escape de crase `\``):

```
    **PROPOSTA SÓ DE SERVIÇO (sem solar):** se o Junior pedir uma proposta só de serviço (ex: desmontagem/reinstalação, adequação de padrão, projeto elétrico, sem kit solar), preencha \`servicos[]\` (as tarefas) + \`nomeCliente\` (+ telefone se modo eva_envia). NÃO invente \`potenciaKwp\`, módulo, inversor nem consumo — deixe ausentes/0. **VALOR — dois jeitos, ambos oficiais:**
        • **POR ITEM** (quando o Junior dá preço por tarefa, ex: "padrão 2500, SPDA 1800, projeto 900"): preencha o \`valorRs\` de CADA tarefa em \`servicos[]\` e deixe \`valorTotalRs\` ausente — O SISTEMA SOMA os itens, você NUNCA soma de cabeça. Se alguma tarefa ficou sem preço, pergunte o preço DELA (\`action: ask_more\`) antes de gerar — soma furada não pode. Se o Junior disser que uma tarefa "está inclusa" em outra, ponha \`valorRs: 0\` nela e registre isso na \`descricao\` (ex: "incluso na adequação de padrão").
        • **VALOR FECHADO** (quando o Junior dá um número só, ex: "total R$ 7.800"): ponha em \`valorTotalRs\` e deixe as tarefas SEM \`valorRs\`. Continua valendo como sempre.
        • **CONFLITO:** se ele der preços por item E TAMBÉM um total que não bate com a soma, você NÃO escolhe: mostre a soma dos itens e pergunte qual vale.
    No resumo de conferência (\`ready_to_generate\`) da proposta de serviço, liste CADA serviço com o preço e o total no final (ex: "• Adequação de padrão — R$ 2.500\\n• SPDA — R$ 1.800\\n💵 Total: R$ 4.300"); no valor fechado, liste as tarefas e o total único. NÃO liste os campos solares em \`missing\`.
```

ATENÇÃO ao contexto: esse parágrafo vive DENTRO de um template literal — as crases do texto são escapadas (`\``) e o `\\n` do exemplo deve ficar como `\\n` no fonte (vira `\n` literal no prompt). Confira o parágrafo vizinho (regra dos serviços com solar, acima) pra copiar o estilo exato.

- [ ] **Step 5: Rodar e ver passar + tipos**

Run: `npx vitest run tests/proposal-multi-item-assistant.test.ts`
Expected: PASS em todos.

Run: `npx tsc --noEmit`
Expected: limpo.

- [ ] **Step 6: Suíte completa**

Run: `npx vitest run`
Expected: verde (~1663+; flake conhecido: `tests/proposal-assistant-core.test.ts` pode dar timeout sob carga da suíte — se falhar, rode isolado pra confirmar que passa).

- [ ] **Step 7: Commit**

```bash
git add src/modules/proposal-assistant.ts tests/proposal-multi-item-assistant.test.ts
git commit -m "feat(proposta): preco por item vira caminho oficial no prompt do so-servico

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Review 3×, PR e entrega

- [ ] **Step 1: Code review 3× do diff completo** (regra do Junior)

Run: `git diff main...feat/proposta-servico-preco-por-item`
Revisar em 3 passadas, corrigindo achados entre elas: correção do regex (não pode capturar frases genéricas), integridade do template literal do prompt (escapes de crase/quebra), item do menu (limites do WhatsApp), texto em português claro.

- [ ] **Step 2: Suíte final**

Run: `npx tsc --noEmit && npx vitest run`
Expected: limpo / verde.

- [ ] **Step 3: Push + PR**

```bash
git push origin feat/proposta-servico-preco-por-item
```

Criar o PR (gh CLI se autenticado; senão via link do GitHub) com título "Proposta de serviço com preço por item + botão do menu abre o modo" e corpo resumindo: botão do menu vira gatilho real (fim do PF/PJ roubando a mensagem), "proposta de serviço" solto dispara, preço por item oficial com soma pelo sistema e travas de soma furada/conflito, resumo itemizado; sem migration; motor/render intocados.

- [ ] **Step 4: Checklist de subida (Junior)**

1. Merge (CI verde junta sozinho) → **Implantar** no EasyPanel (sem migration).
2. Smoke: tocar no botão "🔧 Proposta de serviço" do menu → mandar "adequação de padrão 2500, SPDA 1800, projeto 900 pro <cliente>" → conferir resumo itemizado (Total R$ 5.200) → gerar → página mostra os 3 preços + total. Conferir também que "recebi 5000 do João" continua caindo no financeiro normal.
