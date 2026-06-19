# Proposta híbrido + bateria — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suportar sistema híbrido na proposta: coletar a bateria, mostrar selo "Híbrido" + card da bateria + benefícios + autonomia de backup. Sem bateria, a proposta on-grid fica idêntica.

**Architecture:** Bateria define o híbrido. Um módulo puro novo (`bateria.ts`) calcula capacidade total e autonomia. O `template.ts` ganha um campo `bateria?` e blocos condicionais (selo, card, benefícios). O `proposal-assistant.ts` passa a coletar `bateria` (schema + prompt) e a repassá-la no `ProposalData`; persistência/reabrir já funcionam de graça (spread `...data` em `dados-input.ts`). Cálculo financeiro NÃO muda.

**Tech Stack:** TypeScript (ESM, imports com `.js`), Vitest.

---

## Estrutura de arquivos

- **Criar:** `src/modules/proposal/bateria.ts` — tipo `Bateria` + `DOD_UTIL`, `temBateria`, `capacidadeTotalKwh`, `autonomiaBackupHoras` (funções puras).
- **Criar:** `tests/proposal-bateria.test.ts` — testes das funções puras.
- **Criar:** `tests/proposal-bateria-render.test.ts` — testes de render (com e sem bateria).
- **Modificar:** `src/modules/proposal/template.ts` — campo `bateria?` + selo + card + bloco de benefícios.
- **Modificar:** `src/modules/proposal-assistant.ts` — schema JSON + prompt + `bateria: data.bateria` no `dataToProposalData`.

---

## Task 1: Módulo puro `bateria.ts`

**Files:**
- Create: `src/modules/proposal/bateria.ts`
- Test: `tests/proposal-bateria.test.ts`

- [ ] **Step 1: Escrever o teste falhando** — cria `tests/proposal-bateria.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { temBateria, capacidadeTotalKwh, autonomiaBackupHoras, DOD_UTIL } from '../src/modules/proposal/bateria.js';

describe('bateria — temBateria', () => {
  it('true quando tem capacidade e quantidade', () => {
    expect(temBateria({ capacidadeKwh: 5, quantidade: 2 })).toBe(true);
  });
  it('false quando ausente, zerada ou negativa', () => {
    expect(temBateria(undefined)).toBe(false);
    expect(temBateria(null)).toBe(false);
    expect(temBateria({ capacidadeKwh: 0, quantidade: 1 })).toBe(false);
    expect(temBateria({ capacidadeKwh: 5, quantidade: 0 })).toBe(false);
  });
});

describe('bateria — capacidadeTotalKwh', () => {
  it('multiplica capacidade pela quantidade', () => {
    expect(capacidadeTotalKwh({ capacidadeKwh: 5, quantidade: 2 })).toBe(10);
    expect(capacidadeTotalKwh({ capacidadeKwh: 13.5, quantidade: 1 })).toBe(13.5);
  });
});

describe('bateria — autonomiaBackupHoras', () => {
  it('energia útil (90%) ÷ consumo médio horário, arredondado', () => {
    // 10 kWh * 0.9 = 9 kWh úteis; consumo 720 kWh/mês -> 720/30/24 = 1 kW; 9/1 = 9h
    expect(autonomiaBackupHoras({ capacidadeKwh: 10, quantidade: 1 }, 720)).toBe(9);
  });
  it('null quando consumo <= 0', () => {
    expect(autonomiaBackupHoras({ capacidadeKwh: 10, quantidade: 1 }, 0)).toBeNull();
  });
  it('DOD_UTIL é 0.9', () => {
    expect(DOD_UTIL).toBe(0.9);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/proposal-bateria.test.ts`
Expected: FAIL — `Cannot find module '../src/modules/proposal/bateria.js'`.

- [ ] **Step 3: Criar `src/modules/proposal/bateria.ts`**

```ts
// src/modules/proposal/bateria.ts
// Bateria do sistema híbrido: tipo + cálculos puros (capacidade total e
// autonomia de backup). A presença de bateria é o que marca a proposta como
// híbrida. NÃO mexe em economia/payback.

export interface Bateria {
  fabricante: string;
  modelo: string;
  capacidadeKwh: number; // por unidade
  quantidade: number;
  garantia: number;      // anos
  fichaOverride?: string;
}

// Profundidade de descarga útil — bateria não entrega 100% da capacidade.
export const DOD_UTIL = 0.9;

type BateriaMin = Pick<Bateria, 'capacidadeKwh' | 'quantidade'>;

// Há bateria válida pra renderizar/calcular? (define o "híbrido")
export function temBateria(b?: BateriaMin | null): boolean {
  return !!b && b.capacidadeKwh > 0 && b.quantidade > 0;
}

// Capacidade total instalada (kWh).
export function capacidadeTotalKwh(b: BateriaMin): number {
  return Math.round(b.capacidadeKwh * b.quantidade * 100) / 100;
}

// Horas de autonomia no consumo médio do cliente. null se não dá pra estimar.
export function autonomiaBackupHoras(b: BateriaMin, consumoMensalKwh: number): number | null {
  if (consumoMensalKwh <= 0) return null;
  const energiaUtilKwh = capacidadeTotalKwh(b) * DOD_UTIL;
  const consumoMedioKw = consumoMensalKwh / 30 / 24;
  if (consumoMedioKw <= 0) return null;
  return Math.round(energiaUtilKwh / consumoMedioKw);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/proposal-bateria.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/proposal/bateria.ts tests/proposal-bateria.test.ts
git commit -m "feat(proposta): modulo puro de bateria (capacidade total + autonomia de backup)"
```

---

## Task 2: Render — campo `bateria?` + selo + card + benefícios

**Files:**
- Modify: `src/modules/proposal/template.ts`
- Test: `tests/proposal-bateria-render.test.ts`

Contexto do arquivo (já lido):
- Imports no topo; já importa `ProposalCalculations` de `./calculator.js`.
- Banner "personalizada" termina em ~linha 354.
- `equipment-grid` tem o card de módulo e o de inversor; fecha em ~linha 465 (`</div>` do grid), e a seção `equipment-section` fecha em ~478.
- `renderProposalHTML(data, calc, ...)` começa em ~150; `calc.consumoMensalDistribuido` é um array de 12 meses.
- Helpers disponíveis: `escapeHtml`, `fmtNum`, `formataNomeEquipamento`.

- [ ] **Step 1: Escrever o teste falhando** — cria `tests/proposal-bateria-render.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderProposalHTML, type ProposalData } from '../src/modules/proposal/template.js';
import type { ProposalCalculations } from '../src/modules/proposal/calculator.js';

function baseCalc(): ProposalCalculations {
  return {
    geracaoMensalKwh: 1000, geracaoAnualKwh: 12000, geracaoVidaUtilKwh: 300000,
    contaSemSistemaMensal: 1000, contaComSistemaMensal: 100, economiaMensal: 900,
    economiaAnual: 10800, economiaVidaUtil: 320000,
    paybackAnos: 4, paybackMeses: 2, paybackInviavel: false, roiVezes: 8,
    tirPercentual: 25, rsPorWp: 4.5, co2EvitadoToneladas: 25,
    geracaoMensalDistribuida: Array(12).fill(1000), consumoMensalDistribuido: Array(12).fill(720),
    fluxoCaixaAnual: [-38500, ...Array(25).fill(12000)],
    contaSemSistemaAnual: Array(25).fill(12000), contaComSistemaAnual: Array(25).fill(1200),
  };
}
function baseData(): ProposalData {
  return {
    numeroProposta: '2026-T', dataProposta: '06/06/2026', validadeDias: 5,
    nomeCliente: 'Teste', potenciaKwp: 8.4, fatorPerda: 0.78,
    tipoCliente: 'residencial', modalidade: 'autoconsumo local', concessionaria: 'Neoenergia DF',
    modulo: { fabricante: 'Trina', modelo: 'Vertex 700W', potenciaW: 700, quantidade: 12, garantiaDefeito: 12, garantiaEficiencia: 30 },
    inversor: { fabricante: 'Sungrow', modelo: 'SG5.0RS-L', potenciaW: 5000, quantidade: 1, garantia: 10 },
    valorTotalRs: 38500,
    formasPagamento: [{ tipo: 'À Vista', titulo: 'PIX', valorPrincipal: 'R$ 38.500', valorSecundario: 'único', bullets: ['Sem juros'] }],
    empresa: { nome: 'EcoSunPower', cnpj: '00', cidade: 'Brasília-DF', telefone: '(61) 99697-8781', site: 'ecosunpower.eng.br' },
  };
}

describe('render — proposta híbrida (com bateria)', () => {
  it('mostra selo Híbrido, card da bateria e benefícios + autonomia', () => {
    const data = baseData();
    data.bateria = { fabricante: 'BYD', modelo: 'B-Box 10', capacidadeKwh: 10, quantidade: 1, garantia: 10 };
    const html = renderProposalHTML(data, baseCalc());
    expect(html).toMatch(/Sistema Híbrido/i);
    expect(html).toContain('BYD');
    expect(html).toContain('B-Box 10');
    expect(html).toMatch(/10(,0)? kWh/);          // capacidade total
    expect(html).toMatch(/autonomia/i);            // bloco de benefícios
    // 10 kWh * 0.9 = 9 kWh úteis; consumo 720/mês -> 1 kW -> 9h
    expect(html).toMatch(/~9h/);
  });

  it('com 2 unidades mostra a capacidade total somada', () => {
    const data = baseData();
    data.bateria = { fabricante: 'Huawei', modelo: 'LUNA2000', capacidadeKwh: 5, quantidade: 2, garantia: 10 };
    const html = renderProposalHTML(data, baseCalc());
    expect(html).toContain('Huawei');
    expect(html).toMatch(/10(,0)? kWh/);          // 5 x 2
  });
});

describe('render — on-grid (sem bateria) fica intacto', () => {
  it('não mostra nada de híbrido/bateria', () => {
    const html = renderProposalHTML(baseData(), baseCalc());
    expect(html).not.toMatch(/Sistema Híbrido/i);
    expect(html).not.toMatch(/bateria/i);
    expect(html).not.toMatch(/autonomia/i);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/proposal-bateria-render.test.ts`
Expected: FAIL — `data.bateria` não existe no tipo / HTML não contém os textos.

- [ ] **Step 3a: Adicionar o campo na interface + import**

No topo de `src/modules/proposal/template.ts`, junto dos imports, adiciona:

```ts
import { temBateria, capacidadeTotalKwh, autonomiaBackupHoras, type Bateria } from './bateria.js';
```

Na interface `ProposalData`, logo após a linha do `inversor:` (~37), adiciona:

```ts
  bateria?: Bateria;
```

- [ ] **Step 3b: Calcular a autonomia dentro de `renderProposalHTML`**

Em `renderProposalHTML` (~150), depois das validações de `calc` (perto de onde `geracaoMensal` é calculado, ~163), adiciona:

```ts
  const consumoMedioMensalKwh = calc.consumoMensalDistribuido.reduce((a, b) => a + b, 0) / 12;
  const autonomiaHoras = temBateria(data.bateria) ? autonomiaBackupHoras(data.bateria!, consumoMedioMensalKwh) : null;
```

- [ ] **Step 3c: Selo "Sistema Híbrido"**

Logo após o bloco do banner "personalizada" (após a linha `` ` : ''} `` que fecha o `data.tipo === 'personalizada'`, ~354), adiciona:

```ts
${temBateria(data.bateria) ? `
<div class="container" style="padding-top:16px">
  <div style="background:linear-gradient(135deg,#0E7CB8 0%,#1FB8E8 100%);color:#fff;padding:14px 24px;text-align:center;font-weight:700;font-size:13px;letter-spacing:1px;border-radius:12px;text-transform:uppercase">
    🔋 Sistema Híbrido — Solar + Bateria
  </div>
</div>
` : ''}
```

- [ ] **Step 3d: Card da bateria na seção de equipamentos**

Dentro do `equipment-grid`, logo após o `</div>` que fecha o card do inversor e ANTES do `</div>` que fecha o grid (~465), adiciona:

```ts
      ${temBateria(data.bateria) ? `
      <div class="equipment-card">
        <span class="equipment-badge">Híbrido</span>
        <div class="equipment-cat">Bateria · Armazenamento</div>
        <div class="equipment-name">${escapeHtml(formataNomeEquipamento(data.bateria!.fabricante, data.bateria!.modelo))}</div>
        <div class="equipment-brand">${fmtNum(capacidadeTotalKwh(data.bateria!), 1)} kWh de capacidade${data.bateria!.quantidade > 1 ? ` · ${data.bateria!.quantidade}× ${fmtNum(data.bateria!.capacidadeKwh, 1)} kWh` : ''}</div>
        <div class="equipment-specs">
          <div><div class="spec-label">Capacidade Total</div><div class="spec-value">${fmtNum(capacidadeTotalKwh(data.bateria!), 1)} kWh</div></div>
          <div><div class="spec-label">Quantidade</div><div class="spec-value">${data.bateria!.quantidade} unidade${data.bateria!.quantidade > 1 ? 's' : ''}</div></div>
          <div><div class="spec-label">Garantia</div><div class="spec-value">${data.bateria!.garantia} anos</div></div>
          <div><div class="spec-label">Função</div><div class="spec-value">Backup + uso noturno</div></div>
        </div>
        ${data.bateria!.fichaOverride ? `<p style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);font-size:13px;color:var(--muted);line-height:1.55">${escapeHtml(data.bateria!.fichaOverride)}</p>` : ''}
      </div>
      ` : ''}
```

- [ ] **Step 3e: Bloco "Benefícios do Híbrido"**

Logo após o fechamento da `equipment-section` (o `` `}`` que fecha o template literal da seção de equipamentos, ~478), adiciona uma seção nova:

```ts
${(!data.modoComparacao && temBateria(data.bateria)) ? `
<section style="background:var(--surface-alt);padding:80px 0">
  <div class="container">
    <span class="section-tag">Por que Híbrido</span>
    <h2 class="section-title">Sua energia continua quando a rede cai</h2>
    <p class="section-subtitle">Com a bateria, você não depende só da concessionária.</p>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:24px;margin-top:8px">
      <div style="background:#fff;border:1px solid var(--border);border-radius:20px;padding:32px">
        <div style="font-size:28px;margin-bottom:12px">🔋</div>
        <h3 style="font-size:18px;margin-bottom:8px">Backup na falta de luz</h3>
        <p style="color:var(--muted);font-size:15px;line-height:1.6">Faltou energia? A bateria assume na hora e mantém a casa funcionando.${autonomiaHoras != null ? ` <strong>~${autonomiaHoras}h de autonomia</strong> no seu consumo médio — com só os essenciais, dura bem mais.` : ''}</p>
      </div>
      <div style="background:#fff;border:1px solid var(--border);border-radius:20px;padding:32px">
        <div style="font-size:28px;margin-bottom:12px">🌙</div>
        <h3 style="font-size:18px;margin-bottom:8px">Usa o solar à noite</h3>
        <p style="color:var(--muted);font-size:15px;line-height:1.6">A energia que sobra de dia fica guardada e você usa de noite, em vez de mandar tudo pra rede.</p>
      </div>
      <div style="background:#fff;border:1px solid var(--border);border-radius:20px;padding:32px">
        <div style="font-size:28px;margin-bottom:12px">🔌</div>
        <h3 style="font-size:18px;margin-bottom:8px">Mais independência</h3>
        <p style="color:var(--muted);font-size:15px;line-height:1.6">Menos dependência da concessionária e proteção contra apagões e quedas de energia.</p>
      </div>
      <div style="background:#fff;border:1px solid var(--border);border-radius:20px;padding:32px">
        <div style="font-size:28px;margin-bottom:12px">⚡</div>
        <h3 style="font-size:18px;margin-bottom:8px">Pronto pro futuro</h3>
        <p style="color:var(--muted);font-size:15px;line-height:1.6">Com armazenamento, você aproveita melhor sua geração e fica preparado pra novas regras de tarifa.</p>
      </div>
    </div>
  </div>
</section>
` : ''}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/proposal-bateria-render.test.ts tests/brand-fichas.test.ts`
Expected: PASS — os novos testes passam E o `brand-fichas.test.ts` (render on-grid existente) continua passando (regressão).

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add src/modules/proposal/template.ts tests/proposal-bateria-render.test.ts
git commit -m "feat(proposta): selo Hibrido + card da bateria + beneficios + autonomia"
```

---

## Task 3: Coleta no `proposal-assistant.ts` (schema + prompt + montagem)

**Files:**
- Modify: `src/modules/proposal-assistant.ts`

Contexto: o schema JSON que o Claude devolve está comentado no prompt (~429–470, exemplos de `modulo`/`inversor` ~454). As regras de campos ficam ~482+. A montagem do `ProposalData` está em `dataToProposalData` (~1842–1873), onde `modulo: data.modulo` e `inversor: data.inversor` (~1862–1863). Persistência (`dados-input.ts` espalha `...data`) e reabrir (`reopen-seed.ts`) já preservam `bateria` de graça — não precisam mudar.

- [ ] **Step 1: Adicionar `bateria` ao exemplo de schema JSON do prompt**

Em `src/modules/proposal-assistant.ts`, no exemplo JSON do prompt, logo após a linha do `"inversor": {...}` (~454), adiciona:

```
  "bateria": { "fabricante": "BYD", "modelo": "B-Box Premium HVS 10.2", "capacidadeKwh": 10.2, "quantidade": 1, "garantia": 10 },
```

(Mantém a vírgula correta entre os campos do objeto de exemplo.)

- [ ] **Step 2: Adicionar a regra de coleta no prompt**

Na seção de campos do prompt (~482, perto de onde fala de módulo/inversor obrigatórios), adiciona um bloco:

```
**Bateria (OPCIONAL — só preencha se o Junior mencionar bateria/armazenamento/híbrido):**
- Capte: fabricante, modelo, capacidadeKwh (por unidade), quantidade, garantia (anos).
- A presença de bateria JÁ marca a proposta como sistema HÍBRIDO — não mude tipoCliente por causa disso.
- NÃO some preço da bateria separado: já entra no valorTotalRs do kit.
- NUNCA invente bateria quando o Junior não mencionar (sem bateria = on-grid).
```

- [ ] **Step 3: Repassar `bateria` no `dataToProposalData`**

Em `dataToProposalData` (~1842), no objeto retornado, logo após a linha `inversor: data.inversor,` (~1863), adiciona:

```ts
    bateria: data.bateria,
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npx vitest run tests/proposal-bateria-render.test.ts tests/proposal-bateria.test.ts`
Expected: PASS (continuam verdes — Task 3 não deve quebrar nada).

- [ ] **Step 5: Conferência manual (leitura de código)**

Confirma em `src/modules/proposal-assistant.ts`:
- o exemplo JSON do prompt tem `bateria` com os 5 campos e vírgulas válidas;
- a regra de coleta deixa claro "opcional, só se mencionado, bateria = híbrido, não inventar";
- `dataToProposalData` retorna `bateria: data.bateria`;
- nada removeu/alterou `modulo`/`inversor`.

- [ ] **Step 6: Commit**

```bash
git add src/modules/proposal-assistant.ts
git commit -m "feat(proposta): Eva coleta bateria (schema + prompt) e repassa no ProposalData"
```

---

## Pós-implementação (fora dos commits acima)

- **Code review 3×** (regra do projeto), corrigindo a cada passada.
- Pedir autorização de **push** + merge na `main` + bump `BUILD_VERSION` + Implantar.
- **Smoke:** gerar uma proposta híbrida real ("...bateria BYD 10kWh, 1 un, 10 anos garantia...") e abrir o link `/p/:slug` — conferir selo Híbrido, card da bateria, bloco de benefícios com a autonomia. Gerar uma proposta SEM bateria e confirmar que ficou igual a antes.

## Notas / invariantes

- Sem migration, sem mudança de banco (`dados_input` é JSONB e já guarda `bateria` no spread).
- Economia/payback/Fio B **não mudam** (decisão (a) do brainstorm).
- `temBateria` é o único guard de presença — usado no template e reaproveitável.
- Reabrir/ajustar preserva a bateria automaticamente (spread em `dados-input.ts` + `reopen-seed.ts`).
