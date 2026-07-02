# Logo neon reduzida no celular — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No celular, o halo neon da logo do topo das propostas cai pra metade (5px@45% + 10px@30%) pra parar de apagar o "E"; tela grande fica idêntica.

**Architecture:** Override de `filter` dentro dos blocos `@media(max-width:768px)` que já existem nos dois templates (solar `template.ts` e serviço `service-render.ts`). Sem JS, sem dado, sem migration.

**Tech Stack:** TypeScript ESM, vitest. Spec: `docs/superpowers/specs/2026-07-02-logo-neon-celular-design.md`.

---

### Task 1: Reduzir o halo no mobile dos dois templates (TDD)

**Files:**
- Modify: `src/modules/proposal/template.ts:204` (bloco @media existente)
- Modify: `src/modules/proposal/service-render.ts:145-149` (bloco @media existente)
- Test: `tests/proposal-service-render.test.ts` e `tests/brand-fichas.test.ts`

- [ ] **Step 1: Testes que falham** — assertar que o HTML rendido contém o filtro mobile reduzido E ainda contém o filtro desktop original:

Em `tests/proposal-service-render.test.ts` (dentro do describe `renderServiceOnlyHTML`, usando o fixture `base` existente):

```ts
  it('celular: halo da logo reduzido (não apaga o E); desktop intacto', () => {
    const html = renderServiceOnlyHTML(base);
    expect(html).toContain('drop-shadow(0 0 9px rgba(102,207,243,.75))'); // desktop
    expect(html).toContain('drop-shadow(0 0 5px rgba(102,207,243,.45))'); // mobile
    expect(html).toContain('drop-shadow(0 0 10px rgba(31,184,232,.3))');  // mobile
  });
```

Em `tests/brand-fichas.test.ts` (reusar o fixture de ProposalData que o arquivo já monta pro renderProposalHTML):

```ts
  it('celular: halo da logo do hero reduzido; desktop intacto', () => {
    const html = renderProposalHTML(data); // usar o nome do fixture existente no arquivo
    expect(html).toContain('drop-shadow(0 0 9px rgba(102,207,243,.75))');
    expect(html).toContain('drop-shadow(0 0 5px rgba(102,207,243,.45))');
  });
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/proposal-service-render.test.ts tests/brand-fichas.test.ts` → FAIL nos `toContain` do mobile.

- [ ] **Step 3: Implementar** — em `template.ts`, dentro do `@media(max-width:768px){...}` (linha 204), adicionar a regra:

```css
.hero .brand-logo{filter:drop-shadow(0 0 5px rgba(102,207,243,.45)) drop-shadow(0 0 10px rgba(31,184,232,.3))}
```

Em `service-render.ts`, dentro do `@media(max-width:768px){...}` (linhas 145-149), adicionar:

```css
.brand-logo{filter:drop-shadow(0 0 5px rgba(102,207,243,.45)) drop-shadow(0 0 10px rgba(31,184,232,.3))}
```

(No serviço, `.brand-logo.foot` tem `filter:none` com especificidade maior — o rodapé segue sem brilho. Comentário de 1 linha em cada: halo do desktop é fixo em px; na logo menor do celular ele engolia as letras.)

- [ ] **Step 4: Rodar e ver passar** — mesmos testes → PASS; `npx tsc --noEmit` limpo; `npx vitest run` suíte inteira verde.

- [ ] **Step 5: Review 3× do diff, commit e push**

```bash
git add src/modules/proposal/template.ts src/modules/proposal/service-render.ts tests/proposal-service-render.test.ts tests/brand-fichas.test.ts
git commit -m "fix(proposta): halo neon da logo reduzido no celular (nao apaga o E)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin fix/logo-neon-celular
```

PR + merge + Implantar (sem migration). Smoke: Junior abre uma proposta no celular — "E" legível, brilho leve presente; no computador, idêntico a antes.
