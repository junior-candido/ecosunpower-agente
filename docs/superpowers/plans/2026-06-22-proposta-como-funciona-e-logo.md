# Proposta — Seção "Como funciona" + Logo PNG em destaque — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar à proposta uma seção visual "Do aceite à usina ligada" (jornada com processo em paralelo) e exibir a logo PNG em destaque (com troca por fundo) no lugar do nome em texto.

**Architecture:** Módulos puros de render que devolvem strings HTML (padrão de `service-render.ts`), plugados no `template.ts`. CSS inline no bloco `<style>` do template. Logos embutidas como base64 (funciona na web e no PDF). Conteúdo 100% estático — sem dados novos, sem migration.

**Tech Stack:** TypeScript (ESM, imports com `.js`), Vitest, tsx. Repo `ecosunpower-agente`, branch `feat/proposta-como-funciona`.

**Spec:** `docs/superpowers/specs/2026-06-22-proposta-como-funciona-design.md`

---

## File Structure

- **Create** `src/modules/proposal/logo-variante.ts` — helper `logoVariante('escuro'|'claro')` (regra única de variação por fundo).
- **Create** `src/modules/proposal/como-funciona-render.ts` — `renderComoFuncionaSection()` devolve a seção HTML.
- **Modify** `src/modules/proposal/assets/logo-base64.ts` — adiciona `LOGO_ECOSUNPOWER_PRETO_BASE64`.
- **Modify** `src/modules/proposal/template.ts` — import + insere a seção; CSS da trilha; logo PNG no hero/CTA/rodapé; CTA prazo 30→45.
- **Create** `tests/logo-variante.test.ts`
- **Create** `tests/como-funciona-render.test.ts`

Verificação de integração do `template.ts`: via `scripts/preview-proposta.ts` (gera `tmp/preview-proposta.html`) + grep dos marcadores.

---

### Task 1: Logo nome PRETO (base64) + helper `logoVariante`

**Files:**
- Modify: `src/modules/proposal/assets/logo-base64.ts` (append no final)
- Create: `src/modules/proposal/logo-variante.ts`
- Test: `tests/logo-variante.test.ts`

- [ ] **Step 1: Gerar a constante da logo preta a partir do PNG**

Roda no Git Bash (gera ~118KB de base64 numa linha e anexa ao arquivo):

```bash
cd "/c/Users/Meu Computador/Documents/ecosunpower-agente"
{
  printf '\n// Logo com o nome PRETO (para fundo CLARO). Fonte: Marketing/logos/Logo nova/logo-ecosunpower-1024-transparente.png\n'
  printf 'export const LOGO_ECOSUNPOWER_PRETO_BASE64 = "data:image/png;base64,'
  base64 -w0 "/c/Users/Meu Computador/Documents/EcoSunPower/Marketing/logos/Logo nova/logo-ecosunpower-1024-transparente.png"
  printf '";\n'
} >> src/modules/proposal/assets/logo-base64.ts
```

Verifica que entrou:
```bash
grep -c "LOGO_ECOSUNPOWER_PRETO_BASE64" src/modules/proposal/assets/logo-base64.ts
```
Expected: `1`

- [ ] **Step 2: Escrever o teste que falha** — `tests/logo-variante.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { logoVariante } from '../src/modules/proposal/logo-variante.js';
import {
  LOGO_ECOSUNPOWER_BRANCO_BASE64,
  LOGO_ECOSUNPOWER_PRETO_BASE64,
} from '../src/modules/proposal/assets/logo-base64.js';

describe('logoVariante', () => {
  it('fundo escuro usa a logo de nome branco', () => {
    expect(logoVariante('escuro')).toBe(LOGO_ECOSUNPOWER_BRANCO_BASE64);
  });

  it('fundo claro usa a logo de nome preto', () => {
    expect(logoVariante('claro')).toBe(LOGO_ECOSUNPOWER_PRETO_BASE64);
  });

  it('ambas as variantes são data-URI PNG base64', () => {
    expect(logoVariante('escuro')).toMatch(/^data:image\/png;base64,/);
    expect(logoVariante('claro')).toMatch(/^data:image\/png;base64,/);
  });

  it('as duas variantes são diferentes', () => {
    expect(logoVariante('escuro')).not.toBe(logoVariante('claro'));
  });
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `npx vitest run tests/logo-variante.test.ts`
Expected: FAIL — `Failed to resolve import '../src/modules/proposal/logo-variante.js'` (módulo ainda não existe).

- [ ] **Step 4: Implementar o helper** — `src/modules/proposal/logo-variante.ts`

```ts
// src/modules/proposal/logo-variante.ts
// Regra ÚNICA da variação de logo por fundo:
//   fundo escuro -> logo com o nome BRANCO (lê no escuro)
//   fundo claro  -> logo com o nome PRETO  (lê no claro)
// Devolve o data-URI base64 embutido (funciona na web e na geração de PDF).
import {
  LOGO_ECOSUNPOWER_BRANCO_BASE64,
  LOGO_ECOSUNPOWER_PRETO_BASE64,
} from './assets/logo-base64.js';

export type FundoLogo = 'escuro' | 'claro';

export function logoVariante(fundo: FundoLogo): string {
  return fundo === 'claro'
    ? LOGO_ECOSUNPOWER_PRETO_BASE64
    : LOGO_ECOSUNPOWER_BRANCO_BASE64;
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `npx vitest run tests/logo-variante.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 6: Commit**

```bash
git add src/modules/proposal/assets/logo-base64.ts src/modules/proposal/logo-variante.ts tests/logo-variante.test.ts
git commit -m "feat(proposta): logo PRETO base64 + helper logoVariante(escuro|claro)"
```

---

### Task 2: Módulo `como-funciona-render.ts` (seção da jornada)

**Files:**
- Create: `src/modules/proposal/como-funciona-render.ts`
- Test: `tests/como-funciona-render.test.ts`

- [ ] **Step 1: Escrever o teste que falha** — `tests/como-funciona-render.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { renderComoFuncionaSection } from '../src/modules/proposal/como-funciona-render.js';

describe('renderComoFuncionaSection', () => {
  const html = renderComoFuncionaSection();

  it('tem os marcos da jornada', () => {
    expect(html).toContain('Aceite');
    expect(html).toContain('Projeto + Homologação');
    expect(html).toContain('Compra');
    expect(html).toContain('Instalação');
    expect(html).toContain('Vistoria');
    expect(html).toContain('Usina Ligada');
  });

  it('mostra o processo em paralelo', () => {
    expect(html).toContain('Em paralelo');
  });

  it('cita o prazo legal (15 dias) e o total (~45 dias)', () => {
    expect(html).toContain('15 dias');
    expect(html).toContain('45 dias');
  });

  it('usa o título profissional correto e não diz "engenheiro"', () => {
    expect(html).toContain('Responsável Técnico CREA/CFT');
    expect(html.toLowerCase()).not.toContain('engenheiro');
  });

  it('é uma <section> com a classe journey-section', () => {
    expect(html).toContain('<section class="journey-section">');
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run tests/como-funciona-render.test.ts`
Expected: FAIL — import não resolvido (`como-funciona-render.js`).

- [ ] **Step 3: Implementar o módulo** — `src/modules/proposal/como-funciona-render.ts`

```ts
// src/modules/proposal/como-funciona-render.ts
// Seção "Do aceite à usina ligada": a jornada do cliente em formato de trilha de
// raios, com o processo em PARALELO (projeto+homologação ‖ compra de material).
// Conteúdo 100% estático — o processo é sempre o mesmo. Sem dados da proposta.
import { empresa } from '../empresa-config.js';
import { escapeHtml } from './format.js';

export function renderComoFuncionaSection(): string {
  const marca = escapeHtml(empresa().nomeFantasia);
  return `<section class="journey-section">
  <div class="container">
    <span class="section-tag">Sua jornada solar</span>
    <h2 class="section-title">Do aceite à usina ligada</h2>
    <p class="section-subtitle">Depois da assinatura, várias frentes correm ao mesmo tempo — por isso o prazo é enxuto e você não fica no escuro em nenhuma etapa.</p>
    <div class="jr-trail">
      <div class="jr-col">
        <div class="jr-bolt">✍️</div>
        <div class="jr-lbl">Aceite &amp; Contrato</div>
        <div class="jr-pz">Dia 0</div>
      </div>
      <div class="jr-par">
        <div class="jr-phd">⚡ Em paralelo — começa tudo junto após a assinatura</div>
        <div class="jr-prow">
          <span class="jr-ic">📐</span>
          <div>
            <div class="jr-pt">Projeto + Homologação</div>
            <div class="jr-pd">Responsável Técnico CREA/CFT elabora o projeto e protocola o pedido de acesso; a concessionária (Neoenergia-DF / Equatorial-GO) analisa e aprova — por lei até 15 dias (inversor ≤ 75 kW).</div>
          </div>
        </div>
        <div class="jr-prow">
          <span class="jr-ic">📦</span>
          <div>
            <div class="jr-pt">Compra &amp; entrega do material</div>
            <div class="jr-pd">Equipamentos pedidos e entregues nesse mesmo período.</div>
          </div>
        </div>
      </div>
      <div class="jr-col">
        <div class="jr-bolt">🔧</div>
        <div class="jr-lbl">Instalação</div>
        <div class="jr-pz">1–3 dias</div>
      </div>
      <div class="jr-col">
        <div class="jr-bolt">🔎</div>
        <div class="jr-lbl">Vistoria &amp; Medidor</div>
        <div class="jr-pz">~7 dias</div>
      </div>
      <div class="jr-col jr-fin">
        <div class="jr-bolt">⚡</div>
        <div class="jr-lbl">Usina Ligada</div>
        <div class="jr-pz">economia ✅</div>
      </div>
    </div>
    <div class="jr-total">Prazo total estimado: <b>cerca de 45 dias</b> — prazo de segurança, frequentemente antecipado, acompanhado de ponta a ponta pela ${marca}.</div>
  </div>
</section>`;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run tests/como-funciona-render.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/proposal/como-funciona-render.ts tests/como-funciona-render.test.ts
git commit -m "feat(proposta): secao 'Do aceite a usina ligada' (jornada + paralelo)"
```

---

### Task 3: CSS da trilha + inserir a seção no `template.ts`

**Files:**
- Modify: `src/modules/proposal/template.ts` (import, CSS, inserção da seção)

- [ ] **Step 1: Adicionar o import** no topo do `template.ts`

Logo após a linha 8 (`import { renderServicosAdicionaisSection ... }`), adicionar:

```ts
import { renderComoFuncionaSection } from './como-funciona-render.js';
```

- [ ] **Step 2: Adicionar o CSS da trilha**

No bloco `<style>`, imediatamente ANTES da linha que começa com `.cta-section{background:linear-gradient(135deg,var(--dark) 0%,var(--primary-800) 100%)`, inserir:

```css
.journey-section{background:#fff}
.jr-trail{display:flex;align-items:stretch;gap:10px;margin-top:8px}
.jr-col{flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;position:relative}
.jr-col:not(:last-child)::after{content:'⚡';position:absolute;top:18px;right:-13px;color:var(--accent-500);font-size:13px}
.jr-bolt{width:54px;height:54px;border-radius:50%;background:#fff;border:3px solid var(--primary-500);display:flex;align-items:center;justify-content:center;font-size:23px;box-shadow:0 6px 16px rgba(31,184,232,.25);margin-bottom:10px}
.jr-col.jr-fin .jr-bolt{border-color:var(--accent-500);background:var(--accent-500)}
.jr-lbl{font-weight:700;font-size:12.5px;line-height:1.25;color:var(--dark)}
.jr-pz{font-size:11px;color:var(--muted);margin-top:3px}
.jr-par{flex:2.1;border:2px dashed var(--primary-500);border-radius:16px;background:var(--primary-50);padding:12px 14px 14px}
.jr-phd{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--primary-600);text-align:center;margin-bottom:10px}
.jr-prow{display:flex;align-items:center;gap:10px;background:#fff;border-radius:10px;padding:8px 10px;margin-bottom:8px;border-left:4px solid var(--primary-500)}
.jr-prow:last-child{margin-bottom:0;border-left-color:var(--accent-600)}
.jr-ic{font-size:20px}
.jr-pt{font-weight:700;font-size:12.5px;line-height:1.2;color:var(--dark)}
.jr-pd{font-size:11.5px;color:var(--muted);line-height:1.35}
.jr-total{margin-top:28px;text-align:center;font-size:14.5px;color:var(--dark)}
.jr-total b{color:var(--primary-600)}
@media(max-width:768px){
  .jr-trail{flex-direction:column;gap:16px}
  .jr-col:not(:last-child)::after{display:none}
  .jr-col{flex-direction:row;text-align:left;gap:14px;align-items:center}
  .jr-bolt{margin:0;flex:none}
}
@media print{.journey-section{break-inside:avoid}}
```

- [ ] **Step 3: Inserir a chamada da seção** entre a prova social e o CTA

Localizar (≈ linhas 673-675):

```
${socialProofHtml}

<section class="cta-section">
```

Substituir por:

```
${socialProofHtml}

${renderComoFuncionaSection()}

<section class="cta-section">
```

- [ ] **Step 4: Verificar que compila (typecheck)**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a `como-funciona-render` / `template.ts`.

- [ ] **Step 5: Gerar o preview e conferir a seção**

Run: `npx tsx scripts/preview-proposta.ts`
Depois confere os marcadores no HTML gerado:

```bash
grep -c 'journey-section' tmp/preview-proposta.html
grep -c 'Em paralelo' tmp/preview-proposta.html
```
Expected: cada um retorna `1`. (O script também abre o `tmp/preview-proposta.html` no navegador — olhar a trilha renderizada.)

- [ ] **Step 6: Commit**

```bash
git add src/modules/proposal/template.ts
git commit -m "feat(proposta): pluga a secao 'Como funciona' + CSS da trilha de raios"
```

---

### Task 4: Logo PNG em destaque (hero + CTA + rodapé) e prazo 30→45

**Files:**
- Modify: `src/modules/proposal/template.ts` (import, hero, CTA, rodapé, CSS, textos de prazo)

- [ ] **Step 1: Importar o helper** no topo do `template.ts`

Logo após o import adicionado na Task 3, adicionar:

```ts
import { logoVariante } from './logo-variante.js';
```

- [ ] **Step 2: Trocar o texto do hero pela logo PNG**

Localizar (linha ≈ 314):

```
      <div class="hero-logo"><span class="hero-logo-dot"></span> ${escapeHtml(empresa().nomeFantasia.toUpperCase())}</div>
```

Substituir por:

```
      <img class="hero-logo-img" src="${logoVariante('escuro')}" alt="${escapeHtml(empresa().nomeFantasia)}">
```

- [ ] **Step 3: Adicionar a logo no CTA**

Localizar (linha ≈ 676-677):

```
  <div class="container">
    <h2>Pronto pra economizar?</h2>
```

Substituir por:

```
  <div class="container">
    <img class="cta-logo" src="${logoVariante('escuro')}" alt="${escapeHtml(empresa().nomeFantasia)}">
    <h2>Pronto pra economizar?</h2>
```

- [ ] **Step 4: Adicionar a logo no rodapé**

Localizar (linha ≈ 694-695):

```
    <div>
      <strong>${escapeHtml(data.empresa.nome)}</strong>
```

Substituir por:

```
    <div>
      <img class="footer-logo" src="${logoVariante('escuro')}" alt="${escapeHtml(data.empresa.nome)}">
      <strong>${escapeHtml(data.empresa.nome)}</strong>
```

- [ ] **Step 5: Padronizar o prazo do CTA para ~45 dias**

Localizar (linha ≈ 678):

```
    <p>Aceite a proposta agora e a gente já dá início no projeto. Em 30 dias seu sistema está gerando.</p>
```
Substituir por:
```
    <p>Aceite a proposta agora e a gente já dá início no projeto. Em cerca de 45 dias seu sistema está gerando.</p>
```

Localizar (linha ≈ 684):

```
      <div>⚡ Ativação em 30 dias</div>
```
Substituir por:
```
      <div>⚡ Ativação em ~45 dias</div>
```

- [ ] **Step 6: Adicionar o CSS das logos**

No bloco `<style>`, logo APÓS a regra `.hero-logo-dot{...}` (linha ≈ 195), inserir:

```css
.hero-logo-img{height:54px;width:auto;display:block}
.cta-logo{height:50px;width:auto;display:block;margin:0 auto 24px;filter:drop-shadow(0 4px 14px rgba(0,0,0,.35))}
.footer-logo{height:40px;width:auto;display:block;margin-bottom:12px}
```

- [ ] **Step 7: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 8: Gerar o preview e conferir logo + prazo**

Run: `npx tsx scripts/preview-proposta.ts`
Depois:

```bash
grep -c 'hero-logo-img' tmp/preview-proposta.html
grep -c 'cta-logo' tmp/preview-proposta.html
grep -c 'footer-logo' tmp/preview-proposta.html
grep -c 'Ativação em ~45 dias' tmp/preview-proposta.html
grep -c 'Em 30 dias' tmp/preview-proposta.html
```
Expected: os 4 primeiros retornam `1`; o último (`Em 30 dias`) retorna `0`. No navegador, conferir a logo grande no topo, no CTA e no rodapé (fundo escuro → logo branca lê bem).

- [ ] **Step 9: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: tudo verde (sem regressão).

- [ ] **Step 10: Commit**

```bash
git add src/modules/proposal/template.ts
git commit -m "feat(proposta): logo PNG em destaque no topo/CTA/rodape + prazo ~45 dias"
```

---

## Code Review

Após as 4 tasks, rodar o code review **3×** (padrão do Junior), corrigindo achados entre as passadas, antes de pedir push:

- [ ] Review passada 1 — corrigir achados
- [ ] Review passada 2 — corrigir achados
- [ ] Review passada 3 — limpa

## Critério de pronto

- `npx vitest run` verde.
- `tmp/preview-proposta.html` mostra: seção "Do aceite à usina ligada" (trilha + bloco paralelo), logo PNG branca em destaque no topo (~54px), CTA e rodapé; prazo coerente em ~45 dias (sem "30 dias").
- Sem migration. Code review 3× limpo.
- Push só após autorização explícita do Junior; depois Implantar no Easypanel + smoke.

## Self-Review (preenchido)

- **Cobertura do spec:** Parte 1 (seção jornada) → Tasks 2-3. Parte 2 (logo) → Tasks 1, 4. Prazo 30→45 → Task 4 steps 5/8. Tudo coberto.
- **Placeholders:** nenhum — todo código está escrito por extenso.
- **Consistência de tipos/nomes:** `logoVariante(FundoLogo)`, `renderComoFuncionaSection()`, classes `jr-*`/`journey-section`/`hero-logo-img`/`cta-logo`/`footer-logo` usadas de forma idêntica entre tasks e CSS.
