# Botão "Gerar post (teste)" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans / subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Um botão no /menu (📣 Marketing) que, ao tocar, gera 1 post de imagem e manda no WhatsApp do Junior — sem link nem token.

**Architecture:** Reusa o padrão `action` do menu (como "Calcular imposto"). O item entra em `menu.ts`; a ação é injetada no `construirMenu({...})` do `index.ts` e chama `marketing.generateDraft(undefined, false)` + `sendDraftToJunior` em segundo plano.

**Tech Stack:** TypeScript ESM, Vitest.

---

### Task 1: Item no menu + dep (`menu.ts`) — TDD

**Files:**
- Modify: `src/modules/menu/menu.ts`
- Test: `tests/menu.test.ts`

- [ ] **Step 1: Teste que falha** — adicionar em `tests/menu.test.ts` (dentro do describe existente; usar o mesmo jeito que os outros testes montam `construirMenu` com deps stub — copiar o padrão já presente no arquivo):

```typescript
  it('categoria marketing tem o botão Gerar post (teste) com action', () => {
    const cats = construirMenu(stubDeps());
    const mkt = cats.find((c) => c.id === 'marketing')!;
    const item = mkt.items.find((i) => i.id === 'menu_gerar_post');
    expect(item).toBeDefined();
    expect(typeof item!.action).toBe('function');
  });

  it('submenu de marketing continua dentro do limite de 10 linhas', () => {
    const cats = construirMenu(stubDeps());
    const mkt = cats.find((c) => c.id === 'marketing')!;
    expect(rowsSubmenu(mkt).length).toBeLessThanOrEqual(MAX_ROWS_LISTA);
  });
```

> NOTA: olhar o topo de `tests/menu.test.ts` — se já existe um helper de deps stub, reusar; se cada teste monta as deps inline, seguir o mesmo estilo (todas as deps são funções async que retornam `false`/`undefined`). Incluir `acaoGerarPost` no stub. Importar `rowsSubmenu` e `MAX_ROWS_LISTA` se ainda não importados.

- [ ] **Step 2: Rodar → FAIL** — `npx vitest run tests/menu.test.ts` (item não existe; `acaoGerarPost` não está em MenuDeps → erro de tipo no stub).

- [ ] **Step 3: Implementar** — em `src/modules/menu/menu.ts`:

(a) adicionar à interface `MenuDeps` o campo `acaoGerarPost: Acao;` (junto de `acaoImposto`, `acaoApagar`).

(b) na categoria `marketing`, adicionar como ÚLTIMO item (depois de `menu_banner_kits`):
```typescript
        { id: 'menu_gerar_post', title: '✨ Gerar post (teste)', description: 'Cria um post agora e te manda', action: deps.acaoGerarPost },
```

- [ ] **Step 4: Rodar → PASS** — `npx vitest run tests/menu.test.ts`.

- [ ] **Step 5: Commit**
```bash
git add src/modules/menu/menu.ts tests/menu.test.ts
git commit -m "feat(menu): botao Gerar post (teste) na categoria Marketing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Wiring da ação (`index.ts`)

**Files:**
- Modify: `src/index.ts` (~linha 3326, dentro do objeto de `construirMenu({...})`)

Sem teste unitário novo (integração com `marketing`/WhatsApp). Verificado por tsc + smoke.

- [ ] **Step 1: Adicionar a dep `acaoGerarPost`** logo após `acaoApagar` no objeto passado a `construirMenu`:

```typescript
      acaoGerarPost: async (to: string) => {
        if (!marketing) { await sendText(to, '❌ Geração de posts está desativada.'); return; }
        await sendText(to, '✨ Gerando um post de teste (imagem)... chega aqui em ~1 min.');
        void (async () => {
          try {
            const draft = await marketing.generateDraft(undefined, false); // false = imagem (não vídeo)
            await sendDraftToJunior(draft.id);
          } catch (err) {
            console.error('[marketing] gerar-post teste falhou:', err);
            await sendText(to, `❌ Não consegui gerar o post agora: ${(err as Error).message}`);
          }
        })();
      },
```

- [ ] **Step 2: tsc** — `npx tsc --noEmit` (limpo). Se `marketing.generateDraft` exigir tipo no 1º arg, `undefined` é aceito (assinatura `preferredType?`).

- [ ] **Step 3: Commit**
```bash
git add src/index.ts
git commit -m "feat(menu): acao do botao Gerar post (teste) gera 1 imagem e manda no zap

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Verificação final

- [ ] **Step 1:** `npm run build` (OK) + `npx vitest run tests/menu.test.ts` (verde).
- [ ] **Step 2:** Code review 3× (preferência do Junior), corrigir achados.
- [ ] **Step 3:** Smoke do Junior após Implantar: abrir /menu → 📣 Marketing → ✨ Gerar post (teste) → confere que chega 1 rascunho de imagem no zap.

---

## Self-Review

- Spec coberta: item de menu (T1) + ação (T2) + teste (T1) + verificação (T3). ✓
- Sem placeholders; código completo em cada passo.
- Tipos: `acaoGerarPost: Acao` consistente entre `MenuDeps`, o stub de teste e o callsite.
