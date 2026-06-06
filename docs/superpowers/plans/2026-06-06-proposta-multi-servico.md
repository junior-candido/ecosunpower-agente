# Proposta Multi-Serviço — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a proposta solar-only num documento multi-item — solar + serviços que somam, proposta só-serviço elegante, comparação de dois sistemas, fichas de marca automáticas — sem quebrar as propostas que já existem.

**Architecture:** `ProposalData` ganha campos opcionais novos (`servicos`, `comparacaoSolar`, overrides de ficha) mantendo retrocompatibilidade. Três layouts roteados no `proposal-assistant`: solar (existente, + seção de serviços), só-serviço (novo, elegante) e comparação (novo). Helpers de formatação e fichas de marca ficam em módulos pequenos e puros, testáveis isolados. Spec: `docs/superpowers/specs/2026-06-06-proposta-multi-servico-design.md`.

**Tech Stack:** TypeScript, vitest, Anthropic SDK (Eva), Higgsfield (imagem IA), Supabase (Storage), Puppeteer (PDF).

**Ordem de entrega:** **Fase A (Tarefas 1-3)** destrava a proposta real do Junior (solar + estudo + carregador) — testável no cliente real após a Tarefa 3. **Fase B (Tarefas 4-9)** completa a fatia.

---

## Estrutura de arquivos

**Novos:**
- `src/modules/proposal/format.ts` — formatadores compartilhados (extraídos de `template.ts`).
- `src/modules/proposal/brand-fichas.ts` — fichas das marcas + busca.
- `src/modules/proposal/service-render.ts` — tipo `ServicoItem`, layout só-serviço, seção "Serviços adicionais".
- `src/modules/proposal/comparison-render.ts` — tipo `ComparacaoOpcao`, layout de comparação.
- `tests/proposal-format.test.ts`, `tests/brand-fichas.test.ts`, `tests/proposal-service-render.test.ts`, `tests/proposal-comparison-render.test.ts`, `tests/proposal-multi-item-assistant.test.ts`.

**Modificados:**
- `src/modules/proposal/template.ts` — importa de `format.ts`; campos novos em `ProposalData`; seção de serviços; ficha nos cards de equipamento.
- `src/modules/proposal-assistant.ts` — roteia layout, calcula comparação, puxa fichas, gera imagem do serviço; prompt/schema da Eva entende vários itens.

---

# FASE A — Destrava a proposta real (solar + serviço que soma)

## Task 1: Extrair formatadores pra um módulo compartilhado

Os helpers `fmtRs/fmtNum/fmtPct/fmtCurto/escapeHtml` estão presos dentro de `template.ts`. Os layouts novos (serviço, comparação) precisam deles. Extrair pra `format.ts` sem mudar comportamento.

**Files:**
- Create: `src/modules/proposal/format.ts`
- Create: `tests/proposal-format.test.ts`
- Modify: `src/modules/proposal/template.ts` (remover as funções locais e importar)

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// tests/proposal-format.test.ts
import { describe, it, expect } from 'vitest';
import { fmtRs, fmtNum, fmtPct, fmtCurto, escapeHtml } from '../src/modules/proposal/format.js';

describe('proposal/format', () => {
  it('fmtRs formata com 2 casas em pt-BR', () => {
    expect(fmtRs(38500)).toBe('38.500,00');
    expect(fmtRs(38500, 0)).toBe('38.500');
  });
  it('fmtCurto encurta milhares e milhões', () => {
    expect(fmtCurto(38500)).toBe('R$ 38,5k');
    expect(fmtCurto(1_200_000)).toBe('R$ 1,2M');
    expect(fmtCurto(850)).toBe('R$ 850');
  });
  it('fmtPct adiciona % com 1 casa default', () => {
    expect(fmtPct(23.456)).toBe('23,5%');
  });
  it('escapeHtml neutraliza caracteres perigosos', () => {
    expect(escapeHtml('<b>"x"&\'y\'</b>')).toBe('&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- proposal-format`
Expected: FAIL — `Cannot find module '.../proposal/format.js'`

- [ ] **Step 3: Criar `format.ts`** (copiar as funções idênticas de `template.ts`)

```typescript
// src/modules/proposal/format.ts
// Formatadores compartilhados entre os layouts de proposta (solar, serviço, comparação).
// Extraídos de template.ts — comportamento idêntico.

export const fmtRs = (n: number, frac = 2) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: frac, maximumFractionDigits: frac });
export const fmtNum = (n: number, frac = 0) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: frac, maximumFractionDigits: frac });
export const fmtPct = (n: number, frac = 1) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: frac, maximumFractionDigits: frac }) + '%';

// Formata valor grande pra notacao curta (R$ 38,5k / R$ 1,2M).
export function fmtCurto(n: number): string {
  if (n >= 1_000_000) return 'R$ ' + (n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M';
  if (n >= 1_000) return 'R$ ' + (n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k';
  return 'R$ ' + fmtRs(n, 0);
}

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]!);
}
```

- [ ] **Step 4: Refatorar `template.ts` pra importar de `format.ts`**

No topo de `src/modules/proposal/template.ts`, após o import do logo, adicionar:

```typescript
import { fmtRs, fmtNum, fmtPct, fmtCurto, escapeHtml } from './format.js';
```

Remover as definições locais agora duplicadas em `template.ts`: as `const fmtRs/fmtNum/fmtPct` (linhas ~57-59), a `function fmtCurto` (~62-66) e a `function escapeHtml` (~617-621). O resto do arquivo usa os mesmos nomes — nada mais muda.

- [ ] **Step 5: Rodar a suíte toda (garante que template não quebrou)**

Run: `npm test -- proposal-format && npm run build`
Expected: testes PASS; `tsc` sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/modules/proposal/format.ts tests/proposal-format.test.ts src/modules/proposal/template.ts
git commit -m "refactor(proposal): extrai formatadores pra proposal/format.ts"
```

---

## Task 2: Seção "Serviços adicionais" na proposta solar (soma ao total)

Adiciona o tipo `ServicoItem`, o campo opcional `servicos` em `ProposalData`, e renderiza uma seção que lista os serviços e mostra o **total geral** (solar + serviços). Não quebra propostas sem serviços (campo opcional, seção só aparece se houver).

**Files:**
- Create: `src/modules/proposal/service-render.ts`
- Create: `tests/proposal-service-render.test.ts`
- Modify: `src/modules/proposal/template.ts` (tipo `ProposalData`; chamar a seção)

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// tests/proposal-service-render.test.ts
import { describe, it, expect } from 'vitest';
import { renderServicosAdicionaisSection, type ServicoItem } from '../src/modules/proposal/service-render.js';

const servicos: ServicoItem[] = [
  { titulo: 'Carregador EV', descricao: 'Wallbox 7,4 kW instalado com circuito dedicado', valorRs: 4500 },
  { titulo: 'Adequação de padrão', descricao: 'Troca do disjuntor geral pra trifásico', valorRs: 2800 },
];

describe('renderServicosAdicionaisSection', () => {
  it('lista cada serviço com título, descrição e preço', () => {
    const html = renderServicosAdicionaisSection(servicos, 38500);
    expect(html).toContain('Carregador EV');
    expect(html).toContain('Wallbox 7,4 kW instalado com circuito dedicado');
    expect(html).toContain('R$ 4.500');
    expect(html).toContain('Adequação de padrão');
  });
  it('mostra o total geral (solar + serviços)', () => {
    const html = renderServicosAdicionaisSection(servicos, 38500);
    // 38500 + 4500 + 2800 = 45800
    expect(html).toContain('R$ 45.800');
  });
  it('retorna string vazia quando não há serviços', () => {
    expect(renderServicosAdicionaisSection([], 38500)).toBe('');
  });
  it('escapa HTML na descrição livre do Junior', () => {
    const html = renderServicosAdicionaisSection(
      [{ titulo: 'X', descricao: '<script>alert(1)</script>', valorRs: 100 }], 1000);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- proposal-service-render`
Expected: FAIL — `Cannot find module '.../proposal/service-render.js'`

- [ ] **Step 3: Criar `service-render.ts` com o tipo e a seção**

```typescript
// src/modules/proposal/service-render.ts
// Tipo de item de serviço (texto livre do Junior) + renderizações:
//  - renderServicosAdicionaisSection: seção que soma serviços numa proposta solar.
//  - renderServiceOnlyHTML (Task 5): proposta só-serviço elegante (sem solar).

import { fmtRs } from './format.js';
import { escapeHtml } from './format.js';

export interface ServicoItem {
  titulo: string;
  descricao: string;   // texto livre; replicado fiel (apenas escapado pra HTML)
  valorRs: number;
  imagemUrl?: string;  // usada só no layout só-serviço (Task 5)
}

// Renderiza a seção "Serviços adicionais" pra uma proposta que TEM solar.
// Lista cada serviço (título, descrição, preço) e mostra o total geral
// (valor do solar + soma dos serviços). Vazio => string vazia (seção some).
export function renderServicosAdicionaisSection(servicos: ServicoItem[], valorSolarRs: number): string {
  if (!servicos || servicos.length === 0) return '';
  const somaServicos = servicos.reduce((acc, s) => acc + (Number(s.valorRs) || 0), 0);
  const totalGeral = valorSolarRs + somaServicos;

  const linhas = servicos.map(s => `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding:24px;border:1px solid var(--border);border-radius:16px;background:#fff;margin-bottom:16px">
      <div style="flex:1">
        <div style="font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:700;color:var(--dark);margin-bottom:6px">${escapeHtml(s.titulo)}</div>
        <div style="font-size:14px;color:var(--muted);line-height:1.55;white-space:pre-line">${escapeHtml(s.descricao)}</div>
      </div>
      <div style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;color:var(--primary-600);white-space:nowrap">R$ ${fmtRs(s.valorRs, 0)}</div>
    </div>`).join('');

  return `
<section style="background:var(--surface-alt);padding:80px 0">
  <div class="container">
    <span class="section-tag">Serviços adicionais</span>
    <h2 class="section-title">Além do sistema solar</h2>
    <p class="section-subtitle">Serviços de engenharia elétrica inclusos nesta proposta.</p>
    ${linhas}
    <div style="display:flex;justify-content:space-between;align-items:center;gap:24px;padding:28px;border-radius:16px;background:linear-gradient(135deg,var(--primary-600) 0%,var(--primary-800) 100%);color:#fff;margin-top:8px">
      <div style="font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:600;letter-spacing:0.02em">Total da proposta (solar + serviços)</div>
      <div style="font-family:'Space Grotesk',sans-serif;font-size:32px;font-weight:700">R$ ${fmtRs(totalGeral, 0)}</div>
    </div>
  </div>
</section>`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- proposal-service-render`
Expected: PASS (4 testes)

- [ ] **Step 5: Ligar `servicos` na `ProposalData` e chamar a seção no template**

Em `src/modules/proposal/template.ts`:

1. Importar o tipo e a seção (perto dos outros imports de `./format.js`):

```typescript
import { renderServicosAdicionaisSection, type ServicoItem } from './service-render.js';
```

2. Em `interface ProposalData`, antes do bloco `// Empresa (defaults)`, adicionar o campo opcional:

```typescript
  // Serviços adicionais (item livre que SOMA ao valor solar). Opcional —
  // ausência mantém a proposta solar-only idêntica à de antes.
  servicos?: ServicoItem[];
```

3. No `renderProposalHTML`, logo após a seção de formas de pagamento e antes de `${socialProofHtml}` (linha ~578), inserir a chamada:

```typescript
${renderServicosAdicionaisSection(data.servicos ?? [], data.valorTotalRs)}
```

- [ ] **Step 6: Build + suíte**

Run: `npm run build && npm test -- proposal-service-render`
Expected: build OK; testes PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/proposal/service-render.ts tests/proposal-service-render.test.ts src/modules/proposal/template.ts
git commit -m "feat(proposal): secao Servicos adicionais (soma ao total) na proposta solar"
```

---

## Task 3: Eva entende serviços que somam (assistant)

Faz a Eva aceitar serviços no JSON do `/proposta` e passá-los pro template. Depois desta tarefa, o Junior gera **solar + estudo + carregador** e envia pro cliente real.

**Files:**
- Modify: `src/modules/proposal-assistant.ts` (schema/prompt + `dataToProposalData`)
- Create: `tests/proposal-multi-item-assistant.test.ts`

- [ ] **Step 1: Escrever o teste que falha** (mapeamento de `servicos` no `ProposalData`)

O método `dataToProposalData` é privado. Expor um helper testável: adicionar um método público fino que delega. Teste:

```typescript
// tests/proposal-multi-item-assistant.test.ts
import { describe, it, expect } from 'vitest';
import { mapServicosFromClaude } from '../src/modules/proposal-assistant.js';

describe('mapServicosFromClaude', () => {
  it('mapeia lista de serviços do JSON da Eva', () => {
    const out = mapServicosFromClaude([
      { titulo: 'Carregador EV', descricao: 'Wallbox 7,4 kW', valorRs: 4500 },
    ]);
    expect(out).toEqual([{ titulo: 'Carregador EV', descricao: 'Wallbox 7,4 kW', valorRs: 4500 }]);
  });
  it('ignora itens sem título ou sem valor', () => {
    const out = mapServicosFromClaude([
      { titulo: '', descricao: 'x', valorRs: 100 },
      { titulo: 'Y', descricao: 'z', valorRs: 0 },
      { titulo: 'Ok', descricao: 'd', valorRs: 200 },
    ]);
    expect(out).toEqual([{ titulo: 'Ok', descricao: 'd', valorRs: 200 }]);
  });
  it('retorna undefined quando não há serviços (mantém proposta solar-only)', () => {
    expect(mapServicosFromClaude(undefined)).toBeUndefined();
    expect(mapServicosFromClaude([])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- proposal-multi-item-assistant`
Expected: FAIL — `mapServicosFromClaude is not exported`

- [ ] **Step 3: Implementar `mapServicosFromClaude` e usar em `dataToProposalData`**

Em `src/modules/proposal-assistant.ts`:

1. Importar o tipo (junto do import de `./proposal/template.js`):

```typescript
import type { ServicoItem } from './proposal/service-render.js';
```

2. Adicionar a função exportada (nível de módulo, fora da classe, perto do topo após os imports):

```typescript
// Normaliza a lista de serviços que a Eva devolve no JSON pro tipo ServicoItem.
// Descarta itens incompletos (sem título ou sem valor > 0). Vazio => undefined,
// pra que dataToProposalData NÃO setar o campo e a proposta siga solar-only.
export function mapServicosFromClaude(raw: unknown): ServicoItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const itens = raw
    .map((s: any) => ({
      titulo: String(s?.titulo ?? '').trim(),
      descricao: String(s?.descricao ?? '').trim(),
      valorRs: Number(s?.valorRs),
    }))
    .filter(s => s.titulo.length > 0 && isFinite(s.valorRs) && s.valorRs > 0);
  return itens.length > 0 ? itens : undefined;
}
```

3. No `dataToProposalData`, no objeto retornado, antes de `empresa: this.companyDefaults`, adicionar:

```typescript
      servicos: mapServicosFromClaude(data.servicos),
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- proposal-multi-item-assistant`
Expected: PASS (3 testes)

- [ ] **Step 5: Ensinar a Eva sobre serviços (prompt + schema)**

Em `buildSystemPrompt` (`src/modules/proposal-assistant.ts`), no exemplo de schema JSON (dentro do bloco ```` ```json ````, após `"formasPagamento": [...]`), adicionar o campo `servicos` ao exemplo:

```json
    "servicos": [
      { "titulo": "Carregador EV", "descricao": "Wallbox 7,4 kW instalado com circuito dedicado", "valorRs": 4500 }
    ]
```

E adicionar uma regra nova na lista `# REGRAS CRÍTICAS` (após a regra 9):

```
10. **SERVIÇOS (multi-item):** a EcoSunPower vende energia, não só solar. Se o Junior
    incluir serviços avulsos (carregador EV, adequação de padrão, criação de circuito,
    projeto elétrico, etc.) junto com o solar, coloque-os em `servicos[]` com `titulo`,
    `descricao` (REPLIQUE FIEL o que o Junior escreveu — não reescreva por conta própria)
    e `valorRs`. Eles SOMAM ao valor do solar. O `valorTotalRs` continua sendo só o solar;
    o template soma os serviços e mostra o total geral.
```

- [ ] **Step 6: Build + suíte completa (regressão)**

Run: `npm run build && npm test`
Expected: build OK; suíte verde (incluindo os testes existentes de proposta).

- [ ] **Step 7: Commit**

```bash
git add src/modules/proposal-assistant.ts tests/proposal-multi-item-assistant.test.ts
git commit -m "feat(proposal): Eva aceita servicos que somam ao solar no /proposta"
```

> **🚦 CHECKPOINT FASE A:** após esta tarefa, fazer push (com autorização do Junior) + Implantar no Easypanel, e o Junior gera a proposta real (solar + estudo + carregador) e envia pro cliente. Validar no PDF e na web (`/p/:slug`) que o carregador aparece e o total geral está certo.

---

# FASE B — Completa a fatia

## Task 4: Fichas de marca (módulo puro) + enriquecer cards de equipamento

Cria a ficha (tempo de mercado BR, tecnologia, Tier 1, garantias) de cada marca e puxa automático no bloco de equipamentos da proposta solar. Override por proposta.

**Files:**
- Create: `src/modules/proposal/brand-fichas.ts`
- Create: `tests/brand-fichas.test.ts`
- Modify: `src/modules/proposal/template.ts` (cards de equipamento usam a ficha; campos override)

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// tests/brand-fichas.test.ts
import { describe, it, expect } from 'vitest';
import { getBrandFicha } from '../src/modules/proposal/brand-fichas.js';

describe('getBrandFicha', () => {
  it('acha a ficha de um módulo por marca (case-insensitive)', () => {
    const f = getBrandFicha('trina', 'modulo');
    expect(f).not.toBeNull();
    expect(f!.tier1).toBe(true);
    expect(f!.tecnologia).toMatch(/TOPCon|N-Type/i);
    expect(f!.resumo.length).toBeGreaterThan(20);
  });
  it('acha por marca composta ("JA Solar")', () => {
    expect(getBrandFicha('JA Solar', 'modulo')).not.toBeNull();
  });
  it('acha inversor por marca', () => {
    const f = getBrandFicha('Sungrow', 'inversor');
    expect(f).not.toBeNull();
  });
  it('retorna null pra marca desconhecida', () => {
    expect(getBrandFicha('MarcaInexistente', 'modulo')).toBeNull();
  });
  it('não confunde tipos (Trina não é inversor)', () => {
    expect(getBrandFicha('Trina', 'inversor')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- brand-fichas`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Criar `brand-fichas.ts`**

> ⚠️ Os anos de mercado BR e a classificação Tier 1 abaixo são um rascunho informado por `conhecimento/produtos.md` — o Junior deve revisar/ajustar (é o "cadastro uma vez" dele). Tier 1 aplica-se a módulos (lista BNEF); pra inversores, `tier1` significa "premium global".

```typescript
// src/modules/proposal/brand-fichas.ts
// Ficha descritiva de cada marca de módulo/inversor que a EcoSunPower usa.
// Puxada automaticamente na proposta (cards de equipamento + comparação) pra o
// cliente decidir com base real. Junior pode sobrescrever o `resumo` por proposta.
// REVISAR: anos/Tier 1 são rascunho — confirmar com Junior.

export interface MarcaFicha {
  marca: string;
  tipo: 'modulo' | 'inversor';
  desdeBR: number;      // ano aproximado de entrada no mercado brasileiro
  tecnologia: string;
  tier1: boolean;       // módulo: lista Tier 1 BNEF; inversor: premium global
  garantia: string;     // resumo curto das garantias
  resumo: string;       // parágrafo cliente-facing juntando tudo
}

const FICHAS: MarcaFicha[] = [
  // ---- Módulos ----
  { marca: 'Trina', tipo: 'modulo', desdeBR: 2010, tecnologia: 'N-Type i-TOPCon bifacial',
    tier1: true, garantia: '25 anos de performance',
    resumo: 'Trina Solar — Top 3 mundial, no Brasil desde 2010. Painel N-Type i-TOPCon bifacial (Vertex), eficiência até 23,2% e 25 anos de garantia de performance. Marca Tier 1 consolidada com suporte nacional.' },
  { marca: 'JA Solar', tipo: 'modulo', desdeBR: 2012, tecnologia: 'N-Type TOPCon Half-Cell',
    tier1: true, garantia: '25 anos de performance',
    resumo: 'JA Solar — reconhecida mundialmente por confiabilidade, no Brasil desde 2012. Painel N-Type TOPCon Half-Cell (DeepBlue 4.0), eficiência até 22,5%. Marca Tier 1.' },
  { marca: 'LONGi', tipo: 'modulo', desdeBR: 2015, tecnologia: 'N-Type TOPCon bifacial',
    tier1: true, garantia: '25 anos de performance',
    resumo: 'LONGi — líder mundial em eficiência e volume, no Brasil desde 2015. Painel N-Type TOPCon bifacial, ótima geração mesmo em dias nublados. Marca Tier 1.' },
  { marca: 'Jinko', tipo: 'modulo', desdeBR: 2011, tecnologia: 'N-Type TOPCon (Tiger Neo) + Anti-PID',
    tier1: true, garantia: '12 anos produto / 30 anos performance',
    resumo: 'Jinko Solar — Top 3 global, no Brasil desde 2011. Painel N-Type TOPCon (Tiger Neo) com a maior eficiência da nossa lista (até 23,66%) e 30 anos de garantia de performance. Ideal pra cliente exigente. Tier 1.' },
  { marca: 'DAH', tipo: 'modulo', desdeBR: 2018, tecnologia: 'N-Type',
    tier1: true, garantia: '25 anos de performance',
    resumo: 'DAH Solar — premium emergente, no Brasil desde ~2018. Tecnologia N-Type, ótima pra cliente que quer diferenciação. Tier 1.' },
  { marca: 'Risen', tipo: 'modulo', desdeBR: 2013, tecnologia: 'N-Type alta performance',
    tier1: true, garantia: '25 anos de performance',
    resumo: 'Risen Energy — alta performance e excelente custo-benefício premium, no Brasil desde ~2013. Tier 1.' },
  { marca: 'Canadian', tipo: 'modulo', desdeBR: 2010, tecnologia: 'TOPCon',
    tier1: true, garantia: '25 anos de performance',
    resumo: 'Canadian Solar — muito forte no Brasil desde 2010, suporte robusto. Tier 1.' },
  // ---- Inversores ----
  { marca: 'Sungrow', tipo: 'inversor', desdeBR: 2013, tecnologia: 'Inversor string, eficiência >99%',
    tier1: true, garantia: '10 anos',
    resumo: 'Sungrow — top global em inversores, no Brasil desde 2013, eficiência acima de 99%. Excelente pra residencial e comercial. Garantia 10 anos.' },
  { marca: 'Solis', tipo: 'inversor', desdeBR: 2014, tecnologia: 'Inversor string',
    tier1: true, garantia: '10 anos',
    resumo: 'Solis (Ginlong) — muito forte no Brasil (top ranking) desde ~2014, ótimo custo-benefício premium. Garantia 10 anos.' },
  { marca: 'Deye', tipo: 'inversor', desdeBR: 2019, tecnologia: 'Inversor híbrido',
    tier1: true, garantia: '10 anos',
    resumo: 'Deye — referência em híbrido (com bateria), crescendo muito no Brasil desde ~2019. Garantia 10 anos.' },
  { marca: 'FoxESS', tipo: 'inversor', desdeBR: 2019, tecnologia: 'Inversor híbrido',
    tier1: true, garantia: '10 anos',
    resumo: 'FoxESS — híbrido custo-benefício premium intermediário, no Brasil desde ~2019. Garantia 10 anos.' },
  { marca: 'SolarEdge', tipo: 'inversor', desdeBR: 2017, tecnologia: 'Otimizadores por módulo + inversor central',
    tier1: true, garantia: '12 anos (inversor, ext. 25) / 25 anos (otimizadores)',
    resumo: 'SolarEdge — premium israelense, no Brasil desde ~2017. Otimizadores por painel com monitoramento individual, máxima eficiência em telhado com sombra. Garantia inversor 12 anos (extensível a 25), otimizadores 25 anos.' },
  { marca: 'Huawei', tipo: 'inversor', desdeBR: 2014, tecnologia: 'Inversor string / híbrido',
    tier1: true, garantia: '10 anos',
    resumo: 'Huawei — o mais forte em híbrido + bateria no Brasil, desde ~2014. Garantia 10 anos.' },
  { marca: 'GoodWe', tipo: 'inversor', desdeBR: 2012, tecnologia: 'Inversor string / híbrido',
    tier1: true, garantia: '10 anos',
    resumo: 'GoodWe — Top 3 ranking BR, no Brasil desde ~2012. Garantia 10 anos.' },
  { marca: 'Hoymiles', tipo: 'inversor', desdeBR: 2018, tecnologia: 'Microinversor (monitoramento por painel)',
    tier1: true, garantia: '12 anos',
    resumo: 'Hoymiles — Top 2 microinversor no Brasil desde ~2018, monitoramento individual por painel (app S-Miles), ideal pra telhado com sombras pontuais. Garantia 12 anos.' },
  { marca: 'NEP', tipo: 'inversor', desdeBR: 2017, tecnologia: 'Microinversor',
    tier1: true, garantia: '12 anos',
    resumo: 'NEP (Northern Electric Power) — microinversor confiável e robusto, ótimo custo-benefício, boa rede de suporte BR. Garantia 12 anos.' },
  { marca: 'SolaX', tipo: 'inversor', desdeBR: 2018, tecnologia: 'Microinversor / híbrido (qualidade europeia)',
    tier1: true, garantia: '10-15 anos conforme linha',
    resumo: 'SolaX — premium intermediário europeu. Microinversores X1-IES com 15 anos de garantia (top do segmento) e linha híbrida com armazenamento. Garantia 10-15 anos conforme a linha.' },
];

// Normaliza e casa por prefixo de palavra (case-insensitive, sem acento).
// Ex: "JA Solar JAM66" casa "JA Solar"; "trina" casa "Trina".
export function getBrandFicha(fabricante: string, tipo: 'modulo' | 'inversor'): MarcaFicha | null {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const alvo = norm(fabricante ?? '');
  if (!alvo) return null;
  // Casa quando o nome da marca aparece como começo do fabricante informado.
  const achada = FICHAS
    .filter(f => f.tipo === tipo)
    .find(f => alvo === norm(f.marca) || alvo.startsWith(norm(f.marca)) || norm(f.marca).startsWith(alvo));
  return achada ?? null;
}

export { FICHAS as BRAND_FICHAS };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- brand-fichas`
Expected: PASS (5 testes)

- [ ] **Step 5: Usar a ficha nos cards de equipamento (com override)**

Em `src/modules/proposal/template.ts`:

1. Importar:

```typescript
import { getBrandFicha } from './brand-fichas.js';
```

2. Em `interface ProposalData`, dentro de `modulo` e `inversor`, o tipo já é inline; adicionar campo override em cada um:
   - No `modulo: { ... }` acrescentar `fichaOverride?: string`.
   - No `inversor: { ... }` acrescentar `fichaOverride?: string`.

3. No card de módulos (após o bloco `.equipment-specs` do módulo, antes de fechar `.equipment-card featured`, linha ~427), inserir o resumo da ficha:

```typescript
        ${(() => {
          const resumo = data.modulo.fichaOverride ?? getBrandFicha(data.modulo.fabricante, 'modulo')?.resumo;
          return resumo ? `<p style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);font-size:13px;color:var(--muted);line-height:1.55">${escapeHtml(resumo)}</p>` : '';
        })()}
```

4. No card do inversor (após o `.equipment-specs` do inversor, antes de fechar o card, linha ~439), inserir o equivalente:

```typescript
        ${(() => {
          const resumo = data.inversor.fichaOverride ?? getBrandFicha(data.inversor.fabricante, 'inversor')?.resumo;
          return resumo ? `<p style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);font-size:13px;color:var(--muted);line-height:1.55">${escapeHtml(resumo)}</p>` : '';
        })()}
```

- [ ] **Step 6: Build + suíte**

Run: `npm run build && npm test -- brand-fichas`
Expected: build OK; PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/proposal/brand-fichas.ts tests/brand-fichas.test.ts src/modules/proposal/template.ts
git commit -m "feat(proposal): fichas de marca automaticas nos cards de equipamento"
```

---

## Task 5: Proposta só-serviço elegante (sem solar)

Layout enxuto pra proposta sem solar: logo + imagem do serviço + descrição + preço + formas de pagamento + blocos de confiança. Resolve o caso Edmilson.

**Files:**
- Modify: `src/modules/proposal/service-render.ts` (adicionar `renderServiceOnlyHTML`)
- Modify: `tests/proposal-service-render.test.ts` (novos casos)

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `tests/proposal-service-render.test.ts`:

```typescript
import { renderServiceOnlyHTML, type ServiceOnlyData } from '../src/modules/proposal/service-render.js';

describe('renderServiceOnlyHTML', () => {
  const base: ServiceOnlyData = {
    numeroProposta: '2026-0150',
    dataProposta: '06/06/2026',
    validadeDias: 5,
    nomeCliente: 'Edmilson',
    servicos: [{ titulo: 'Adequação de padrão', descricao: 'Troca pra padrão trifásico', valorRs: 2800 }],
    formasPagamento: [{ tipo: 'À Vista', titulo: 'PIX', valorPrincipal: 'R$ 2.800', valorSecundario: 'único', bullets: ['Sem juros'] }],
    empresa: { nome: 'EcoSunPower', cnpj: '00', cidade: 'Brasília-DF', telefone: '(61) 99697-8781', site: 'ecosunpower.eng.br' },
  };
  it('renderiza nome, serviço, descrição e total — sem gráfico/payback', () => {
    const html = renderServiceOnlyHTML(base);
    expect(html).toContain('Edmilson');
    expect(html).toContain('Adequação de padrão');
    expect(html).toContain('R$ 2.800');
    expect(html).not.toContain('Payback');
    expect(html).not.toContain('barGeracaoGrad'); // sem o gráfico solar
  });
  it('inclui a imagem do serviço quando há imagemUrl', () => {
    const html = renderServiceOnlyHTML({ ...base, servicos: [{ ...base.servicos[0], imagemUrl: 'https://x/img.jpg' }] });
    expect(html).toContain('https://x/img.jpg');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- proposal-service-render`
Expected: FAIL — `renderServiceOnlyHTML`/`ServiceOnlyData` não exportados.

- [ ] **Step 3: Implementar `renderServiceOnlyHTML` em `service-render.ts`**

Adicionar ao `service-render.ts` (importa o logo e reaproveita formatadores). O CSS é inline e independente (não depende das classes do template solar, pra o layout ficar autossuficiente).

```typescript
import { LOGO_ECOSUNPOWER_BRANCO_BASE64 } from './assets/logo-base64.js';

export interface ServiceOnlyData {
  numeroProposta: string;
  dataProposta: string;
  validadeDias: number;
  nomeCliente: string;
  servicos: ServicoItem[];
  formasPagamento: Array<{ tipo: string; titulo: string; valorPrincipal: string; valorSecundario: string; recomendado?: boolean; bullets: string[] }>;
  empresa: { nome: string; cnpj: string; cidade: string; telefone: string; site: string };
}

// Proposta SÓ-SERVIÇO (sem solar): elegante, com logo + imagem do serviço +
// descrição livre + preço + formas de pagamento + confiança. Sem gráfico/payback.
export function renderServiceOnlyHTML(data: ServiceOnlyData): string {
  if (!data.nomeCliente || !data.servicos?.length) {
    throw new Error('renderServiceOnlyHTML: precisa de nomeCliente e ao menos 1 serviço');
  }
  const total = data.servicos.reduce((a, s) => a + (Number(s.valorRs) || 0), 0);
  const tituloPrincipal = data.servicos.length === 1 ? data.servicos[0].titulo : 'Serviços de engenharia elétrica';

  const blocosServico = data.servicos.map(s => `
    <section style="padding:48px 24px;max-width:900px;margin:0 auto">
      <h2 style="font-family:'Space Grotesk',sans-serif;font-size:26px;color:#0F172A;margin-bottom:16px">${escapeHtml(s.titulo)}</h2>
      ${s.imagemUrl ? `<img src="${escapeHtml(s.imagemUrl)}" alt="${escapeHtml(s.titulo)}" style="width:100%;border-radius:16px;margin-bottom:20px;display:block">` : ''}
      <div style="font-size:16px;color:#334155;line-height:1.7;white-space:pre-line">${escapeHtml(s.descricao)}</div>
      <div style="margin-top:20px;font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;color:#0E7CB8">R$ ${fmtRs(s.valorRs, 0)}</div>
    </section>`).join('');

  const formasPagamento = data.formasPagamento.map(p => `
    <div style="border:1px solid #E2E8F0;border-radius:16px;padding:24px;background:#fff${p.recomendado ? ';border:2px solid #FFC72C' : ''}">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#0E7CB8;margin-bottom:8px">${escapeHtml(p.tipo)}</div>
      <div style="font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:700;margin-bottom:8px">${escapeHtml(p.titulo)}</div>
      <div style="font-family:'Space Grotesk',sans-serif;font-size:26px;font-weight:700;color:#0E7CB8">${escapeHtml(p.valorPrincipal)}</div>
      <div style="font-size:13px;color:#64748B;margin-bottom:12px">${escapeHtml(p.valorSecundario)}</div>
      <ul style="list-style:none;padding:0;margin:0;font-size:13px;color:#64748B">${p.bullets.map(b => `<li style="padding:4px 0">✓ ${escapeHtml(b)}</li>`).join('')}</ul>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Proposta EcoSunPower — ${escapeHtml(data.nomeCliente)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,sans-serif;color:#0F172A;background:#F8FAFC;line-height:1.6}
@media print{.no-print{display:none}}
</style>
</head>
<body>
<header style="background:linear-gradient(135deg,#1FB8E8 0%,#0E7CB8 60%,#0F172A 100%);color:#fff;padding:48px 24px">
  <div style="max-width:900px;margin:0 auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:40px">
      <img src="${LOGO_ECOSUNPOWER_BRANCO_BASE64}" alt="EcoSunPower" style="height:40px;width:auto">
      <div style="font-size:12px;opacity:0.85;text-align:right">Proposta #${escapeHtml(data.numeroProposta)}<br>${escapeHtml(data.dataProposta)} · Válida ${data.validadeDias} dias</div>
    </div>
    <div style="display:inline-block;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);padding:6px 16px;border-radius:100px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:16px">⚡ Proposta de Serviço</div>
    <h1 style="font-family:'Space Grotesk',sans-serif;font-size:40px;line-height:1.1;font-weight:700">${escapeHtml(tituloPrincipal)}<br><span style="color:#FFC72C">para ${escapeHtml(data.nomeCliente)}</span></h1>
  </div>
</header>

${blocosServico}

<section style="background:#fff;padding:48px 24px">
  <div style="max-width:900px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;gap:24px;padding:28px;border-radius:16px;background:linear-gradient(135deg,#0E7CB8 0%,#073E5C 100%);color:#fff">
    <div style="font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:600">Total da proposta</div>
    <div style="font-family:'Space Grotesk',sans-serif;font-size:32px;font-weight:700">R$ ${fmtRs(total, 0)}</div>
  </div>
</section>

<section style="padding:48px 24px;max-width:900px;margin:0 auto">
  <h2 style="font-family:'Space Grotesk',sans-serif;font-size:22px;margin-bottom:24px">Como você prefere pagar?</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px">${formasPagamento}</div>
</section>

<section style="padding:48px 24px;max-width:900px;margin:0 auto">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px">
    <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:24px">
      <div style="font-size:24px;margin-bottom:8px">📋</div>
      <h3 style="font-size:17px;margin-bottom:8px">ART/TRT + Normas ABNT</h3>
      <p style="font-size:14px;color:#64748B">Anotação de Responsabilidade Técnica assinada pelo nosso Responsável Técnico CREA/CFT. Serviço dentro das normas, sem improviso.</p>
    </div>
    <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:24px">
      <div style="font-size:24px;margin-bottom:8px">🛡️</div>
      <h3 style="font-size:17px;margin-bottom:8px">Garantia EcoSunPower 12 meses</h3>
      <p style="font-size:14px;color:#64748B">Cobrimos a mão de obra e a execução do serviço por 12 meses. Acionamento direto pelo WhatsApp.</p>
    </div>
    <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:24px">
      <div style="font-size:24px;margin-bottom:8px">🤝</div>
      <h3 style="font-size:17px;margin-bottom:8px">Responsável Técnico que atende direto</h3>
      <p style="font-size:14px;color:#64748B">Você fala direto com o Responsável Técnico CREA/CFT da EcoSunPower, do orçamento ao pós-serviço.</p>
    </div>
  </div>
</section>

<section class="no-print" style="background:linear-gradient(135deg,#0F172A 0%,#073E5C 100%);color:#fff;text-align:center;padding:64px 24px">
  <h2 style="font-family:'Space Grotesk',sans-serif;font-size:32px;margin-bottom:16px">Pronto pra começar?</h2>
  <a href="https://wa.me/55${data.empresa.telefone.replace(/\D/g, '')}?text=${encodeURIComponent('Aceito a proposta ' + data.numeroProposta)}" style="display:inline-block;background:#FFC72C;color:#0F172A;padding:16px 32px;border-radius:100px;font-weight:700;text-decoration:none">✓ Aceitar proposta</a>
</section>

<footer style="background:#0F172A;color:rgba(255,255,255,0.7);padding:32px 24px;text-align:center;font-size:13px">
  <strong style="color:#fff">${escapeHtml(data.empresa.nome)}</strong><br>
  CNPJ ${escapeHtml(data.empresa.cnpj)} · ${escapeHtml(data.empresa.cidade)} · ${escapeHtml(data.empresa.telefone)}<br>
  <span style="opacity:0.6;font-size:11px">Proposta #${escapeHtml(data.numeroProposta)} · ${escapeHtml(data.empresa.site)}</span>
</footer>
</body>
</html>`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- proposal-service-render`
Expected: PASS (todos)

- [ ] **Step 5: Rotear no assistant (gerar só-serviço quando não há solar)**

Em `src/modules/proposal-assistant.ts`, em `generateProposalCore`, logo após `const calcInput = this.dataToCalculatorInput(data);` e ANTES dos `ensureNum`, detectar o caso só-serviço e desviar:

```typescript
    // Proposta SÓ-SERVIÇO: sem solar (sem potência) mas com serviços. Renderiza
    // o layout elegante e pula todo o cálculo solar (que não se aplica).
    const semSolar = !(Number(data.potenciaKwp) > 0);
    const servicos = mapServicosFromClaude(data.servicos);
    if (semSolar && servicos && servicos.length > 0) {
      return await this.generateServiceOnlyCore({ data, servicos, modoEnvio, tipo });
    }
```

Adicionar o método `generateServiceOnlyCore` (espelha o fim de `generateProposalCore`: monta HTML, PDF, salva Drive+Supabase). Reaproveita `htmlToPdf`, `driveUploader`, `supabaseService`:

```typescript
  private async generateServiceOnlyCore(input: {
    data: any; servicos: ServicoItem[]; modoEnvio: ModoEnvio; tipo: TipoProposta;
  }): Promise<GenerateProposalCoreResult> {
    const { data, servicos, modoEnvio } = input;
    const ano = new Date().getFullYear();
    const numeroProposta = `${ano}-${Date.now().toString(36).toUpperCase().slice(-5)}`;
    const slug = randomBytes(12).toString('base64url');

    const serviceData: ServiceOnlyData = {
      numeroProposta,
      dataProposta: new Date().toLocaleDateString('pt-BR'),
      validadeDias: Number(data.validadeDias) > 0 ? Number(data.validadeDias) : 5,
      nomeCliente: data.nomeCliente,
      servicos,
      formasPagamento: data.formasPagamento ?? this.defaultPaymentOptions(
        servicos.reduce((a, s) => a + s.valorRs, 0)),
      empresa: this.companyDefaults,
    };

    const html = renderServiceOnlyHTML(serviceData);
    const pdfBuffer = await htmlToPdf(html, { waitForChartMs: 0 });

    const drivePromise = this.driveUploader
      ? this.driveUploader.uploadProposal({
          nomeCliente: data.nomeCliente, numeroProposta, pdfBuffer, htmlContent: html,
          inputDataJson: JSON.stringify({ servicos }, null, 2), shareWithEmail: data.emailCliente,
        })
      : Promise.reject(new Error('Drive uploader nao configurado'));

    const supabasePromise = this.supabaseService
      ? this.supabaseService.savePropostaPublica({
          slug, numeroProposta, clienteNome: data.nomeCliente,
          clienteTelefone: data.telefoneCliente, htmlContent: html,
          dadosInput: { servicos }, tipo: 'basica', modoEnvio,
        })
      : Promise.reject(new Error('Supabase service nao configurado'));

    const [uploadResult, publicResult] = await Promise.allSettled([drivePromise, supabasePromise]);
    const upload = uploadResult.status === 'fulfilled' ? uploadResult.value : null;
    const publicSaved = publicResult.status === 'fulfilled';
    const publicUrl = publicSaved ? `${this.publicProposalBaseUrl}/p/${slug}` : null;
    if (!upload && !publicSaved) throw new Error('Falha ao salvar proposta de serviço (Drive e Web).');

    // ProposalData/calc são solar-only; pra satisfazer o tipo de retorno, devolvemos
    // um proposalData mínimo (não usado pelo caller no caminho serviço) e calc zerado.
    return {
      slug, publicUrl, pdfBuffer,
      driveResult: upload ? { pdfWebViewLink: upload.pdfWebViewLink, htmlWebViewLink: upload.htmlWebViewLink } : null,
      proposalData: { ...serviceData, potenciaKwp: 0 } as any,
      calculations: null as any,
    };
  }
```

Adicionar os imports no topo do arquivo:

```typescript
import { renderServiceOnlyHTML, type ServiceOnlyData } from './proposal/service-render.js';
```

> Atenção: `generateProposal` (wrapper do zap) usa `result.calculations.rsPorWp` no resumo. Guardar contra `calculations` nulo: no `generateProposal`, após obter `result`, embrulhar o bloco do Greener/payback num `if (result.calculations) { ... } else { resumo de serviço }`. Mostrar pro Junior um resumo curto de serviço (total + links) quando `calculations` for nulo.

- [ ] **Step 6: Ensinar a Eva o caso só-serviço (prompt)**

Na regra 10 do prompt (Task 3, Step 5), acrescentar o parágrafo:

```
Se o Junior pedir uma proposta SÓ de serviço (sem solar), preencha apenas `servicos[]` e
`nomeCliente` (e telefone se modo eva_envia) — NÃO invente potência/equipamentos. O sistema
detecta a ausência de solar e gera o layout de serviço. Nesse caso `potenciaKwp` fica ausente/0.
```

- [ ] **Step 7: Build + suíte**

Run: `npm run build && npm test`
Expected: build OK; suíte verde.

- [ ] **Step 8: Commit**

```bash
git add src/modules/proposal/service-render.ts tests/proposal-service-render.test.ts src/modules/proposal-assistant.ts
git commit -m "feat(proposal): layout so-servico elegante (sem solar) + roteamento na Eva"
```

---

## Task 6: Imagem do serviço por IA (Higgsfield) + override do Junior

Gera automaticamente uma imagem do serviço a partir da descrição; se o Junior anexar a dele, usa a dele.

**Files:**
- Modify: `src/modules/proposal-assistant.ts` (gerar imagem antes de renderizar só-serviço)
- Modify: `tests/proposal-multi-item-assistant.test.ts` (testar o builder do prompt da imagem)

- [ ] **Step 1: Escrever o teste que falha** (helper puro que monta o prompt da imagem)

Acrescentar a `tests/proposal-multi-item-assistant.test.ts`:

```typescript
import { buildServiceImagePrompt } from '../src/modules/proposal-assistant.js';

describe('buildServiceImagePrompt', () => {
  it('monta prompt de imagem fotorrealista a partir do serviço', () => {
    const p = buildServiceImagePrompt({ titulo: 'Carregador EV', descricao: 'Wallbox 7,4 kW em garagem residencial', valorRs: 4500 });
    expect(p.toLowerCase()).toContain('carregador ev');
    expect(p.toLowerCase()).toMatch(/photoreal|realistic|profissional|professional/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- proposal-multi-item-assistant`
Expected: FAIL — `buildServiceImagePrompt` não exportado.

- [ ] **Step 3: Implementar `buildServiceImagePrompt` + geração**

Em `src/modules/proposal-assistant.ts`:

```typescript
import type { ServicoItem } from './proposal/service-render.js';
import { HiggsfieldImageGenerator } from './marketing/higgsfield-gen.js';

// Monta o prompt da imagem do serviço (fotorrealista, contexto BR, sem texto).
export function buildServiceImagePrompt(servico: ServicoItem): string {
  return [
    `Professional photorealistic image illustrating an electrical engineering service: "${servico.titulo}".`,
    servico.descricao ? `Context: ${servico.descricao}.` : '',
    'Brazilian residential/commercial setting, clean modern look, natural lighting, high quality, no text, no watermark.',
  ].filter(Boolean).join(' ');
}
```

No `generateServiceOnlyCore` (Task 5), antes de montar `serviceData`, gerar a imagem do PRIMEIRO serviço quando não houver override do Junior:

```typescript
    // Imagem do serviço: usa a do Junior se ele anexou (data.servicoImagemUrl);
    // senão gera por IA (Higgsfield) a partir da descrição. Falha não bloqueia.
    const creds = process.env.HIGGSFIELD_CREDENTIALS;
    if (!servicos[0].imagemUrl && creds) {
      try {
        const gen = new HiggsfieldImageGenerator(creds);
        const { url } = await gen.generate({ prompt: buildServiceImagePrompt(servicos[0]), aspectRatio: '3:2' });
        const { bytes, contentType } = await gen.downloadImage(url);
        if (this.supabaseService) {
          const path = `servicos/${slug}-0.${contentType.includes('png') ? 'png' : 'jpg'}`;
          const sb = this.supabaseService.getClient();
          await sb.storage.from('estudos-personalizados').upload(path, bytes, { contentType, upsert: true });
          servicos[0].imagemUrl = await getSignedUrlFromPath(sb, path);
        } else {
          servicos[0].imagemUrl = url;
        }
      } catch (err) {
        console.warn('[proposal] geração de imagem do serviço falhou:', (err as Error).message);
      }
    }
```

> O override do Junior (`data.servicoImagemUrl`) é preenchido pelo fluxo de anexo (Task 5 já salva anexos no state; aqui basta o assistant copiar, quando houver anexo de foto em modo só-serviço, pra `servicos[0].imagemUrl`). Reusa `getSignedUrlFromPath` já importado no arquivo.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- proposal-multi-item-assistant`
Expected: PASS

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add src/modules/proposal-assistant.ts tests/proposal-multi-item-assistant.test.ts
git commit -m "feat(proposal): imagem do servico por IA (Higgsfield) com override do Junior"
```

---

## Task 7: Comparação de dois sistemas solares (módulo de render)

Quadro lado a lado das duas opções (sem "recomendado") + ficha da marca de cada uma.

**Files:**
- Create: `src/modules/proposal/comparison-render.ts`
- Create: `tests/proposal-comparison-render.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// tests/proposal-comparison-render.test.ts
import { describe, it, expect } from 'vitest';
import { renderComparacaoSolar, type ComparacaoOpcao } from '../src/modules/proposal/comparison-render.js';

const opcoes: ComparacaoOpcao[] = [
  { rotulo: 'Opção A', potenciaKwp: 8.4, geracaoMensalKwh: 1080, valorTotalRs: 38500,
    paybackTexto: '4 anos e 2 meses', economia25AnosRs: 320000,
    moduloFabricante: 'Trina', inversorFabricante: 'Sungrow' },
  { rotulo: 'Opção B', potenciaKwp: 8.0, geracaoMensalKwh: 1040, valorTotalRs: 44000,
    paybackTexto: '4 anos e 9 meses', economia25AnosRs: 315000,
    moduloFabricante: 'LONGi', inversorFabricante: 'SolarEdge' },
];

describe('renderComparacaoSolar', () => {
  it('mostra as duas opções lado a lado, sem marca de "recomendado"', () => {
    const html = renderComparacaoSolar(opcoes);
    expect(html).toContain('Opção A');
    expect(html).toContain('Opção B');
    expect(html).toContain('R$ 38.500');
    expect(html).toContain('R$ 44.000');
    expect(html.toLowerCase()).not.toContain('recomendado');
  });
  it('puxa a ficha da marca de cada opção (tempo de mercado/tecnologia)', () => {
    const html = renderComparacaoSolar(opcoes);
    expect(html).toContain('Trina');
    expect(html).toContain('LONGi');
    expect(html.toLowerCase()).toMatch(/tier 1|topcon|mercado/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- proposal-comparison-render`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `comparison-render.ts`**

```typescript
// src/modules/proposal/comparison-render.ts
// Quadro comparativo de DUAS opções de sistema solar, lado a lado, SEM recomendação.
// Cada opção mostra os números principais + as fichas (marca/tecnologia) dos equipamentos.

import { fmtRs, fmtNum, escapeHtml } from './format.js';
import { getBrandFicha } from './brand-fichas.js';

export interface ComparacaoOpcao {
  rotulo: string;             // "Opção A" / "Opção B" (ou nome livre)
  potenciaKwp: number;
  geracaoMensalKwh: number;
  valorTotalRs: number;
  paybackTexto: string;       // já formatado (ex: "4 anos e 2 meses")
  economia25AnosRs: number;
  moduloFabricante: string;
  inversorFabricante: string;
}

export function renderComparacaoSolar(opcoes: ComparacaoOpcao[]): string {
  if (!opcoes || opcoes.length < 2) return '';

  const cards = opcoes.map(o => {
    const fModulo = getBrandFicha(o.moduloFabricante, 'modulo');
    const fInversor = getBrandFicha(o.inversorFabricante, 'inversor');
    const linha = (label: string, valor: string) =>
      `<div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #E2E8F0"><span style="color:#64748B;font-size:14px">${label}</span><strong style="font-size:15px">${valor}</strong></div>`;
    const ficha = (titulo: string, f: ReturnType<typeof getBrandFicha>) => f ? `
      <div style="margin-top:16px;padding:16px;background:#F8FAFC;border-radius:12px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#0E7CB8;margin-bottom:6px">${titulo}: ${escapeHtml(f.marca)} ${f.tier1 ? '· Tier 1' : ''}</div>
        <div style="font-size:13px;color:#475569;line-height:1.5">${escapeHtml(f.resumo)}</div>
      </div>` : '';
    return `
      <div style="flex:1;min-width:280px;border:1px solid #E2E8F0;border-radius:20px;padding:28px;background:#fff">
        <div style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;color:#0F172A;margin-bottom:16px">${escapeHtml(o.rotulo)}</div>
        ${linha('Potência', fmtNum(o.potenciaKwp, 1) + ' kWp')}
        ${linha('Geração', fmtNum(o.geracaoMensalKwh) + ' kWh/mês')}
        ${linha('Investimento', 'R$ ' + fmtRs(o.valorTotalRs, 0))}
        ${linha('Payback', o.paybackTexto)}
        ${linha('Economia 25 anos', 'R$ ' + fmtRs(o.economia25AnosRs, 0))}
        ${ficha('Módulo', fModulo)}
        ${ficha('Inversor', fInversor)}
      </div>`;
  }).join('');

  return `
<section style="background:#F8FAFC;padding:64px 24px">
  <div style="max-width:1000px;margin:0 auto">
    <span style="display:inline-block;font-size:12px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#0E7CB8;margin-bottom:12px">Compare as opções</span>
    <h2 style="font-family:'Space Grotesk',sans-serif;font-size:32px;color:#0F172A;margin-bottom:8px">Dois caminhos pra você decidir</h2>
    <p style="font-size:16px;color:#64748B;margin-bottom:32px">As duas opções são premium. A escolha é sua — veja os números e a tecnologia de cada marca.</p>
    <div style="display:flex;gap:24px;flex-wrap:wrap">${cards}</div>
  </div>
</section>`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- proposal-comparison-render`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/proposal/comparison-render.ts tests/proposal-comparison-render.test.ts
git commit -m "feat(proposal): quadro comparativo de 2 sistemas solares (sem recomendacao) + fichas"
```

---

## Task 8: Integrar comparação no assistant + Eva entende "compara opção 2"

Quando o Junior pede uma segunda opção pra comparar, a Eva calcula as duas (via `calcular`) e gera o quadro comparativo no lugar da análise pesada.

**Files:**
- Modify: `src/modules/proposal-assistant.ts` (rota comparação + prompt)
- Modify: `tests/proposal-multi-item-assistant.test.ts` (builder das opções)

- [ ] **Step 1: Escrever o teste que falha** (builder puro de `ComparacaoOpcao` a partir do calc)

```typescript
import { buildComparacaoOpcao } from '../src/modules/proposal-assistant.js';

describe('buildComparacaoOpcao', () => {
  it('monta a opção de comparação com payback formatado e economia 25a', () => {
    const o = buildComparacaoOpcao('Opção A',
      { potenciaKwp: 8.4, moduloFabricante: 'Trina', inversorFabricante: 'Sungrow', valorTotalRs: 38500 },
      { geracaoMensalKwh: 1080, paybackAnos: 4, paybackMeses: 2, paybackInviavel: false, economiaVidaUtil: 320000 } as any);
    expect(o.rotulo).toBe('Opção A');
    expect(o.geracaoMensalKwh).toBe(1080);
    expect(o.paybackTexto).toMatch(/4 anos e 2 meses/);
    expect(o.economia25AnosRs).toBe(320000);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- proposal-multi-item-assistant`
Expected: FAIL — `buildComparacaoOpcao` não exportado.

- [ ] **Step 3: Implementar `buildComparacaoOpcao` + roteamento**

Em `src/modules/proposal-assistant.ts`:

```typescript
import type { ComparacaoOpcao } from './proposal/comparison-render.js';
import { renderComparacaoSolar } from './proposal/comparison-render.js';

// Monta uma ComparacaoOpcao a partir dos dados crus + o resultado de calcular().
export function buildComparacaoOpcao(
  rotulo: string,
  dados: { potenciaKwp: number; moduloFabricante: string; inversorFabricante: string; valorTotalRs: number },
  calc: { geracaoMensalKwh: number; paybackAnos: number; paybackMeses: number; paybackInviavel: boolean; economiaVidaUtil: number },
): ComparacaoOpcao {
  const paybackTexto = calc.paybackInviavel
    ? '> 25 anos'
    : `${calc.paybackAnos} ${calc.paybackAnos === 1 ? 'ano' : 'anos'}${calc.paybackMeses ? ` e ${calc.paybackMeses} ${calc.paybackMeses === 1 ? 'mês' : 'meses'}` : ''}`;
  return {
    rotulo,
    potenciaKwp: dados.potenciaKwp,
    geracaoMensalKwh: Math.round(calc.geracaoMensalKwh),
    valorTotalRs: dados.valorTotalRs,
    paybackTexto,
    economia25AnosRs: Math.round(calc.economiaVidaUtil),
    moduloFabricante: dados.moduloFabricante,
    inversorFabricante: dados.inversorFabricante,
  };
}
```

No `generateProposalCore`, quando `data.comparacao` (array de 2 opções cruas) vier preenchido, calcular cada uma e injetar o HTML do quadro NO LUGAR das seções pesadas. Estratégia mínima: gerar o quadro comparativo e concatená-lo ao HTML solar, e suprimir as seções de gráfico/financeiro do template via um flag novo opcional em `ProposalData` (`ocultarAnalisePesada?: boolean`) lido pelo template pra não renderizar `system-section` e `financial-section`. Implementar:

1. Em `ProposalData` (template.ts): adicionar `ocultarAnalisePesada?: boolean;` e `comparacaoHtml?: string;`. No `renderProposalHTML`, envolver a `system-section` (gráfico) e a `financial-section` em `${data.ocultarAnalisePesada ? '' : `...`}`, e inserir `${data.comparacaoHtml ?? ''}` logo após a `equipment-section`.

2. No `generateProposalCore` (assistant): se `Array.isArray(data.comparacao) && data.comparacao.length >= 2`, montar as 2 opções:

```typescript
    if (Array.isArray(data.comparacao) && data.comparacao.length >= 2) {
      const opcoes = data.comparacao.slice(0, 2).map((op: any, i: number) => {
        const ci = this.dataToCalculatorInput({ ...data, ...op });
        const c = calcular(ci);
        return buildComparacaoOpcao(op.rotulo ?? `Opção ${String.fromCharCode(65 + i)}`,
          { potenciaKwp: Number(op.potenciaKwp), moduloFabricante: op.modulo?.fabricante ?? data.modulo?.fabricante,
            inversorFabricante: op.inversor?.fabricante ?? data.inversor?.fabricante, valorTotalRs: Number(op.valorTotalRs) },
          c);
      });
      proposalData.comparacaoHtml = renderComparacaoSolar(opcoes);
      proposalData.ocultarAnalisePesada = true;
    }
```

(inserir após `const proposalData = this.dataToProposalData(data, calculations);` e antes do render).

- [ ] **Step 4: Ensinar a Eva (prompt)**

Adicionar regra 11 ao prompt:

```
11. **COMPARAÇÃO (2 sistemas):** se o Junior quiser que o cliente compare duas opções de
    sistema solar, devolva `comparacao: [opcaoA, opcaoB]`, cada uma com seu `potenciaKwp`,
    `modulo`, `inversor` e `valorTotalRs`. NÃO marque recomendação — as duas são neutras.
    O sistema calcula geração/payback de cada uma e monta o quadro comparativo.
```

E no exemplo de schema JSON, acrescentar:

```json
    "comparacao": [
      { "rotulo": "Opção A", "potenciaKwp": 8.4, "valorTotalRs": 38500, "modulo": { "fabricante": "Trina" }, "inversor": { "fabricante": "Sungrow" } },
      { "rotulo": "Opção B", "potenciaKwp": 8.0, "valorTotalRs": 44000, "modulo": { "fabricante": "LONGi" }, "inversor": { "fabricante": "SolarEdge" } }
    ]
```

- [ ] **Step 5: Rodar + build + suíte**

Run: `npm test -- proposal-multi-item-assistant && npm run build && npm test`
Expected: PASS; build OK; suíte verde.

- [ ] **Step 6: Commit**

```bash
git add src/modules/proposal-assistant.ts src/modules/proposal/template.ts tests/proposal-multi-item-assistant.test.ts
git commit -m "feat(proposal): comparacao de 2 sistemas integrada na Eva (calcula e monta quadro)"
```

---

## Task 9: Regressão final + revisão

- [ ] **Step 1: Suíte completa**

Run: `npm test`
Expected: TODA a suíte verde (incluindo os testes pré-existentes de proposta e dashboard).

- [ ] **Step 2: Build de produção**

Run: `npm run build`
Expected: `tsc` sem erro.

- [ ] **Step 3: Code review** (regra do Junior: review antes de mergear)

Rodar `/code-review` na branch `feat/proposta-multi-servico` e endereçar achados.

- [ ] **Step 4: Smoke manual dos 3 layouts** (gerar localmente um HTML de cada e abrir no navegador)

Criar `scripts/smoke-proposta-multi.ts` que chama as 3 render functions com dados fake e escreve 3 arquivos HTML em `/tmp`. Conferir visual: solar+serviços, só-serviço, comparação.

---

## Self-review (cobertura do spec)

- Spec §3 (lista de itens) → Tasks 2, 5, 7 ✅
- Spec §4.1 (solar + serviços) → Tasks 2, 3 ✅ (Fase A)
- Spec §4.2 (só-serviço elegante + imagem) → Tasks 5, 6 ✅
- Spec §4.3 (comparação sem recomendado + fichas) → Tasks 7, 8 ✅
- Spec §5 (fichas de marca automáticas + override) → Task 4 ✅
- Spec §6 (item livre + imagem IA/override) → Tasks 3, 6 ✅
- Spec §7 (fluxo Eva) → Tasks 3, 5, 8 (prompt) ✅
- Spec §8 (fora de escopo: custo/lucro, /fechar) → não implementados, correto ✅

## Notas de implantação (pós-merge, com autorização do Junior)

- **Sem migration** nesta fatia (fichas são código; serviços vão em `dados_input` JSON já existente). Nada de SQL pra aplicar.
- `git push` só com autorização explícita; depois Implantar no Easypanel (deploya do GitHub).
- Conferir env `HIGGSFIELD_CREDENTIALS` em prod (já existe — usada no marketing).
- Bucket `estudos-personalizados` já existe (reusado pra imagem do serviço).
