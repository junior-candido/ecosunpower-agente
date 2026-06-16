# Financeiro — Captura Multi-Evento + Nunca Calar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Eva entende várias movimentações de dinheiro numa mensagem só, cria um lançamento pra cada, e nunca mais fica muda quando não consegue ler.

**Architecture:** O extrator passa a devolver uma LISTA de lançamentos. O parser puro vira o coração da correção (aceita array, objeto único, ou vários objetos soltos — sem a regex gulosa que zerava tudo). O orquestrador (`caixa-entrada.ts`) percorre a lista e reusa o caminho de pendente que já funciona, com uma rede de segurança que pergunta em vez de calar.

**Tech Stack:** TypeScript (ESM), Vitest, Anthropic SDK (Opus+fallback Haiku), Supabase. Comando de teste: `npm test` (vitest run).

Spec: `docs/superpowers/specs/2026-06-16-financeiro-captura-multi-evento-design.md`

---

## Estrutura de arquivos

- `src/modules/financeiro/extrator-lancamento.ts` — parser vira lista (`parseLancamentos`), prompt pede array, `extrairDe*` devolvem `ExtracaoLancamento[]`.
- `src/modules/financeiro/resumo-lancamento.ts` — textos novos: abertura "li N coisas" + pedido de esclarecimento.
- `src/modules/financeiro/caixa-entrada.ts` — `planejarCaptura` (puro) + loop no `tryHandleFinanceiroTexto`/`tryHandleFinanceiroMedia`.
- `tests/financeiro-extrator.test.ts` — casos novos do parser em lista.
- `tests/financeiro-resumo-lancamento.test.ts` — textos novos.
- `tests/financeiro-caixa-planejar.test.ts` — NOVO, testa `planejarCaptura` (puro).

---

## Task 1: Parser vira lista (`parseLancamentos`) — o coração da correção

**Files:**
- Modify: `src/modules/financeiro/extrator-lancamento.ts` (parser, linhas 42-71)
- Test: `tests/financeiro-extrator.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar no fim do `describe('financeiro/extrator: parse da resposta da IA', ...)` em `tests/financeiro-extrator.test.ts`:

```ts
import { parseLancamentos } from '../src/modules/financeiro/extrator-lancamento.js';

describe('financeiro/extrator: parseLancamentos (lista, multi-evento)', () => {
  it('objeto único vira lista de 1', () => {
    const r = parseLancamentos('{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":380}');
    expect(r).toHaveLength(1);
    expect(r[0].valor).toBe(380);
  });
  it('array de 2 vira lista de 2 (caso João Paulo)', () => {
    const raw = '```json\n[{"financeiro":true,"intencao":"lancar","tipo":"entrada","valor":9000,"contraparte":"João Paulo","obra_ref":"João Paulo"},{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":1500,"descricao":"instalação"}]\n```';
    const r = parseLancamentos(raw);
    expect(r).toHaveLength(2);
    expect(r[0].tipo).toBe('entrada');
    expect(r[0].valor).toBe(9000);
    expect(r[1].tipo).toBe('despesa');
    expect(r[1].valor).toBe(1500);
  });
  it('dois objetos SOLTOS sem array (o bug de hoje) vira lista de 2 — NÃO null', () => {
    const raw = '{"financeiro":true,"intencao":"lancar","tipo":"entrada","valor":9000}\n{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":1500}';
    const r = parseLancamentos(raw);
    expect(r).toHaveLength(2);
    expect(r[1].valor).toBe(1500);
  });
  it('chaves dentro de string não confundem o separador', () => {
    const raw = '{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":10,"descricao":"chave } solta"}';
    const r = parseLancamentos(raw);
    expect(r).toHaveLength(1);
    expect(r[0].descricao).toBe('chave } solta');
  });
  it('lixo sem JSON vira lista vazia (nunca explode)', () => {
    expect(parseLancamentos('não consegui ler nada')).toEqual([]);
  });
  it('item sem valor entra com valor null e campos_faltando', () => {
    const raw = '[{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":"abc"}]';
    const r = parseLancamentos(raw);
    expect(r).toHaveLength(1);
    expect(r[0].valor).toBeNull();
    expect(r[0].campos_faltando).toContain('valor');
  });
  it('formato {lancamentos:[...]} também é aceito', () => {
    const raw = '{"financeiro":true,"lancamentos":[{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":50}]}';
    const r = parseLancamentos(raw);
    expect(r).toHaveLength(1);
    expect(r[0].valor).toBe(50);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- financeiro-extrator`
Expected: FAIL — `parseLancamentos is not exported` / não definido.

- [ ] **Step 3: Implementar `parseLancamentos` + helpers, e transformar `parseRespostaExtrator` em wrapper**

Em `src/modules/financeiro/extrator-lancamento.ts`, SUBSTITUIR a função `parseRespostaExtrator` (linhas 42-71) por:

```ts
// Normaliza UM objeto cru da IA em ExtracaoLancamento (mesma lógica de validação de antes).
function normalizarItem(obj: Record<string, unknown>): ExtracaoLancamento {
  const valor = numeroOuNull(obj.valor);
  const faltando = new Set<string>(
    Array.isArray(obj.campos_faltando) ? obj.campos_faltando.filter((x): x is string => typeof x === 'string') : [],
  );
  if (valor === null && obj.valor !== undefined && obj.valor !== null) faltando.add('valor');

  const intencao = obj.intencao === 'corrigir' || obj.intencao === 'apagar' ? obj.intencao : 'lancar';
  const tipo = obj.tipo === 'despesa' || obj.tipo === 'entrada' ? obj.tipo : null;
  const pf = obj.pf_pj === 'PF' || obj.pf_pj === 'PJ' ? obj.pf_pj : null;
  const data = typeof obj.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.data) ? obj.data : null;

  return {
    financeiro: obj.financeiro === true,
    intencao, tipo, valor, data,
    contraparte: strOuNull(obj.contraparte),
    categoria_slug: strOuNull(obj.categoria_slug),
    pf_pj: pf,
    obra_ref: strOuNull(obj.obra_ref),
    descricao: strOuNull(obj.descricao),
    campos_faltando: [...faltando],
    relacionado: obj.relacionado === true ? true : obj.relacionado === false ? false : null,
  };
}

function tentarJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return undefined; }
}

// Quebra um texto em objetos {...} de TOPO usando contagem balanceada de chaves,
// ignorando chaves dentro de strings. Substitui a regex gulosa que juntava 2 objetos.
function splitObjetosJson(s: string): string[] {
  const objs: string[] = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') { if (depth === 0) start = i; depth++; }
    else if (c === '}') { if (depth > 0 && --depth === 0 && start >= 0) { objs.push(s.slice(start, i + 1)); start = -1; } }
  }
  return objs;
}

// Parse defensivo em LISTA: aceita array, {lancamentos:[...]}, objeto único, ou
// vários objetos soltos. NUNCA explode — pior caso devolve [].
export function parseLancamentos(raw: string): ExtracaoLancamento[] {
  const fence = raw.match(/```json\s*([\s\S]*?)```/);
  const corpo = fence ? fence[1] : raw;

  const brutos: unknown[] = [];
  const inteiro = tentarJson(corpo);
  if (inteiro !== undefined) {
    if (Array.isArray(inteiro)) brutos.push(...inteiro);
    else if (inteiro && typeof inteiro === 'object' && Array.isArray((inteiro as Record<string, unknown>).lancamentos))
      brutos.push(...((inteiro as Record<string, unknown>).lancamentos as unknown[]));
    else brutos.push(inteiro);
  } else {
    for (const bloco of splitObjetosJson(corpo)) {
      const o = tentarJson(bloco);
      if (o !== undefined) brutos.push(o);
    }
  }

  return brutos
    .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null && !Array.isArray(b))
    .map(normalizarItem);
}

// Compatibilidade: primeiro lançamento ou null (usado por testes antigos / chamadas simples).
export function parseRespostaExtrator(raw: string): ExtracaoLancamento | null {
  return parseLancamentos(raw)[0] ?? null;
}
```

- [ ] **Step 4: Rodar e ver passar (novos + antigos verdes)**

Run: `npm test -- financeiro-extrator`
Expected: PASS — os 7 casos novos + os antigos de `parseRespostaExtrator` continuam verdes.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/extrator-lancamento.ts tests/financeiro-extrator.test.ts
git commit -m "feat(financeiro): parser de lançamentos em lista (mata regex gulosa)"
```

---

## Task 2: Prompt pede a lista de eventos

**Files:**
- Modify: `src/modules/financeiro/extrator-lancamento.ts` (`REGRAS_COMUNS`, ~linha 73-93)
- Test: `tests/financeiro-extrator.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar no `describe('financeiro/extrator: prompts', ...)`:

```ts
it('prompt manda devolver UMA LISTA com um objeto por evento', () => {
  const p = montarPromptExtracaoTexto('recebi 9000 do João, paguei 1500', '2026-06-16');
  expect(p.toLowerCase()).toContain('lista');
  expect(p).toContain('um objeto por');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- financeiro-extrator`
Expected: FAIL — o prompt ainda não fala de lista.

- [ ] **Step 3: Atualizar `REGRAS_COMUNS`**

Em `src/modules/financeiro/extrator-lancamento.ts`, na função `REGRAS_COMUNS`, trocar a primeira linha (`Devolva APENAS um bloco ...`) por:

```ts
const REGRAS_COMUNS = (hoje: string) => `Devolva APENAS um bloco \`\`\`json\`\`\` contendo uma LISTA (array), com UM OBJETO POR EVENTO financeiro distinto na mensagem (a pessoa pode citar vários numa frase só — ex.: recebimento E pagamento). Cada objeto tem:
{"financeiro": true/false, "intencao": "lancar"|"corrigir"|"apagar", "tipo": "despesa"|"entrada"|null,
 "valor": número ou null, "data": "YYYY-MM-DD" ou null, "contraparte": "quem (posto/fornecedor/cliente)" ou null,
 "categoria_slug": uma de [${CATEGORIA_SLUGS.join(', ')}] ou null, "pf_pj": "PF"|"PJ"|null,
 "obra_ref": "nome do cliente/obra citado" ou null, "descricao": "resumo curto" ou null,
 "campos_faltando": ["valor", "pf_pj", ...]}
Sem nenhum evento de dinheiro → devolva [] (lista vazia).
```

(O resto das REGRAS — NUNCA invente, BR vs americano, PF/PJ na dúvida, entrada vs despesa, etc. — permanece igual logo abaixo.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- financeiro-extrator`
Expected: PASS — inclusive os testes antigos de prompt (`combustivel`, data, `NUNCA invente`, `PERGUNTA/consulta`) continuam verdes.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/extrator-lancamento.ts tests/financeiro-extrator.test.ts
git commit -m "feat(financeiro): prompt do extrator pede lista de eventos"
```

---

## Task 3: `extrairDe*` devolvem lista (camada I/O)

**Files:**
- Modify: `src/modules/financeiro/extrator-lancamento.ts` (`extrairDeTexto`/`extrairDeImagem`/`extrairDePdf`, ~linhas 153-182)

(Camada I/O fina — sem teste unitário, conforme convenção do arquivo. Verificação = build + suíte verde.)

- [ ] **Step 1: Trocar o retorno para `ExtracaoLancamento[]`**

Nas três funções, trocar `Promise<ExtracaoLancamento | null>` por `Promise<ExtracaoLancamento[]>` e a última linha `return parseRespostaExtrator(raw);` por `return parseLancamentos(raw);`. Exemplo (`extrairDeTexto`):

```ts
export async function extrairDeTexto(client: Anthropic, texto: string, hoje: string): Promise<ExtracaoLancamento[]> {
  const raw = await chamarComFallback(client, [{ role: 'user', content: montarPromptExtracaoTexto(texto, hoje) }], 1024);
  return parseLancamentos(raw);
}
```

Fazer igual em `extrairDeImagem` (return `parseLancamentos(raw)`) e `extrairDePdf` (return `parseLancamentos(raw)`).

- [ ] **Step 2: Build pra garantir que nada quebrou de tipo ainda (vai acusar os call sites)**

Run: `npx tsc --noEmit`
Expected: ERROS em `caixa-entrada.ts` (usa `e.financeiro`/`e.valor` num valor que agora é lista). Isso é esperado — corrigido na Task 5/6.

- [ ] **Step 3: Commit**

```bash
git add src/modules/financeiro/extrator-lancamento.ts
git commit -m "refactor(financeiro): extrairDe* devolvem lista de lançamentos"
```

---

## Task 4: Textos novos da Eva (abertura múltipla + esclarecimento)

**Files:**
- Modify: `src/modules/financeiro/resumo-lancamento.ts`
- Test: `tests/financeiro-resumo-lancamento.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar em `tests/financeiro-resumo-lancamento.test.ts`:

```ts
import { montarPedidoEsclarecimento, montarAberturaMultipla } from '../src/modules/financeiro/resumo-lancamento.js';

describe('financeiro/resumo: textos multi-evento', () => {
  it('pedido de esclarecimento nunca fica mudo e dá exemplo', () => {
    const t = montarPedidoEsclarecimento();
    expect(t.toLowerCase()).toContain('não consegui');
    expect(t).toContain('por linha');
  });
  it('abertura múltipla diz quantas coisas leu', () => {
    expect(montarAberturaMultipla(3)).toContain('3');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- financeiro-resumo-lancamento`
Expected: FAIL — funções não existem.

- [ ] **Step 3: Implementar**

Adicionar no fim de `src/modules/financeiro/resumo-lancamento.ts`:

```ts
export function montarPedidoEsclarecimento(): string {
  return 'Entendi que é dinheiro, mas não consegui separar os valores 🤔\n' +
    'Me manda um por linha? (ex: "recebi 9000 do João Paulo" / "paguei 1500 de instalação")';
}

export function montarAberturaMultipla(n: number): string {
  return `Li ${n} lançamentos aqui 👇`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- financeiro-resumo-lancamento`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/resumo-lancamento.ts tests/financeiro-resumo-lancamento.test.ts
git commit -m "feat(financeiro): textos de abertura múltipla e esclarecimento"
```

---

## Task 5: Decisão pura `planejarCaptura` (o que fazer com a lista)

**Files:**
- Modify: `src/modules/financeiro/caixa-entrada.ts` (adicionar função exportada pura)
- Test: `tests/financeiro-caixa-planejar.test.ts` (NOVO)

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/financeiro-caixa-planejar.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planejarCaptura } from '../src/modules/financeiro/caixa-entrada.js';
import type { ExtracaoLancamento } from '../src/modules/financeiro/extrator-lancamento.js';

const item = (p: Partial<ExtracaoLancamento>): ExtracaoLancamento => ({
  financeiro: true, intencao: 'lancar', tipo: 'despesa', valor: 10, data: null,
  contraparte: null, categoria_slug: null, pf_pj: null, obra_ref: null,
  descricao: null, campos_faltando: [], relacionado: null, ...p,
});

describe('financeiro/caixa: planejarCaptura', () => {
  it('dois eventos financeiros → lançar os dois, sem esclarecer', () => {
    const r = planejarCaptura([item({ tipo: 'entrada', valor: 9000 }), item({ tipo: 'despesa', valor: 1500 })]);
    expect(r.lancar).toHaveLength(2);
    expect(r.esclarecer).toBe(false);
  });
  it('nenhum item financeiro → esclarecer (nunca calar)', () => {
    expect(planejarCaptura([]).esclarecer).toBe(true);
    expect(planejarCaptura([item({ financeiro: false })]).esclarecer).toBe(true);
  });
  it('ignora itens com financeiro:false e mantém os válidos', () => {
    const r = planejarCaptura([item({ valor: 50 }), item({ financeiro: false })]);
    expect(r.lancar).toHaveLength(1);
    expect(r.esclarecer).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- financeiro-caixa-planejar`
Expected: FAIL — `planejarCaptura` não existe.

- [ ] **Step 3: Implementar a função pura**

Em `src/modules/financeiro/caixa-entrada.ts`, logo após os imports/constantes do topo (antes de `nomeCategoria`), adicionar:

```ts
import type { ExtracaoLancamento } from './extrator-lancamento.js';

// PURO: decide o que fazer com a lista extraída.
// lancar = itens financeiros a virar pendente; esclarecer = deu dinheiro mas nada extraído (nunca calar).
export function planejarCaptura(itens: ExtracaoLancamento[]): { lancar: ExtracaoLancamento[]; esclarecer: boolean } {
  const lancar = itens.filter((i) => i.financeiro);
  return { lancar, esclarecer: lancar.length === 0 };
}
```

(Obs.: `ExtracaoLancamento` já vem do import existente na linha 9 via `type ExtracaoLancamento`. Se já estiver importado, NÃO duplicar o import — reusar o existente.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- financeiro-caixa-planejar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/caixa-entrada.ts tests/financeiro-caixa-planejar.test.ts
git commit -m "feat(financeiro): planejarCaptura puro (lançar N / nunca calar)"
```

---

## Task 6: Orquestrador percorre a lista (texto + mídia)

**Files:**
- Modify: `src/modules/financeiro/caixa-entrada.ts` (`tryHandleFinanceiroTexto` ~175-269, `tryHandleFinanceiroMedia` ~155-172)

Verificação: `npx tsc --noEmit` zerado + suíte inteira verde + smoke manual (abaixo). O orquestrador é I/O puro (supabase/waba) — a lógica testável já está coberta por `parseLancamentos` (Task 1) e `planejarCaptura` (Task 5); aqui o trabalho é mecânico (laço + rede de segurança), reusando `criarPendenteEFalar` que já funciona pra 1 item.

- [ ] **Step 1: `tryHandleFinanceiroMedia` — usar a lista**

Substituir o corpo do `try` de `tryHandleFinanceiroMedia` (linhas ~160-167) por:

```ts
    const hoje = hojeBRT();
    const lista = kind === 'pdf'
      ? await extrairDePdf(deps.anthropic, midia.base64, hoje)
      : await extrairDeImagem(deps.anthropic, midia.base64, midia.mimeType, hoje);
    const { lancar } = planejarCaptura(lista);
    if (lancar.length === 0) return false; // comprovante não-financeiro → fluxo normal
    // 1º item leva o comprovante (a mídia); demais (raro num comprovante) entram sem anexo.
    for (let i = 0; i < lancar.length; i++) {
      await criarPendenteEFalar(deps, from, lancar[i], i === 0 ? midia : null);
    }
    return true;
```

- [ ] **Step 2: `tryHandleFinanceiroTexto` — gate, lista, esclarecer, laço**

Substituir o bloco "2) Gate / 3) Extração" e o trecho final de `tryHandleFinanceiroTexto` (linhas ~213-264) por:

```ts
    // 2) Gate barato: é assunto financeiro?
    if (!(await gateTextoFinanceiro(deps.anthropic, texto))) return false;

    // 3) Extração completa (lista de eventos)
    const lista = await extrairDeTexto(deps.anthropic, texto, hojeBRT());
    const { lancar, esclarecer } = planejarCaptura(lista);

    // Rede de segurança: gate disse dinheiro mas não saiu nada → pergunta (nunca cala).
    if (esclarecer) { await deps.sendText(from, montarPedidoEsclarecimento()); return true; }

    // apagar/corrigir são intenções de alvo único → trata o 1º item pelo caminho de hoje.
    const primeiro = lancar[0];
    if (primeiro.intencao === 'apagar') {
      const alvo = primeiro.contraparte
        ? await buscarConfirmadoPorContraparte(deps.supabase, primeiro.contraparte)
        : await getUltimoConfirmado(deps.supabase);
      if (!alvo) { await deps.sendText(from, 'Não achei lançamento pra apagar 🤔'); return true; }
      if (alvo.tipo === 'entrada' && alvo.conta_id) {
        await deps.sendText(from, '⚠️ Essa entrada está ligada a uma venda (recebimento e imposto já contados). Estorno é manual por enquanto — me chama que a gente ajusta no banco.');
        return true;
      }
      const msg = montarConfirmacaoApagar(await rowParaResumo(deps, alvo));
      await deps.waba.sendInteractiveButtons(from, msg.body, msg.buttons, FOOTER);
      return true;
    }
    if (primeiro.intencao === 'corrigir') {
      const alvo = primeiro.contraparte
        ? await buscarConfirmadoPorContraparte(deps.supabase, primeiro.contraparte)
        : await getUltimoConfirmado(deps.supabase);
      if (!alvo) { await deps.sendText(from, 'Não achei o lançamento pra corrigir 🤔 Me fala qual (ex: "o do posto").'); return true; }
      if (alvo.tipo === 'entrada' && alvo.conta_id) {
        await deps.sendText(from, '⚠️ Essa entrada está ligada a uma venda (recebimento e imposto já contados). Estorno é manual por enquanto — me chama que a gente ajusta no banco.');
        return true;
      }
      const corrigido: ExtracaoLancamento = {
        ...primeiro, intencao: 'lancar',
        tipo: primeiro.tipo ?? alvo.tipo,
        valor: primeiro.valor ?? Number(alvo.valor),
        data: primeiro.data ?? alvo.data_evento,
        contraparte: primeiro.contraparte ?? alvo.contraparte,
        pf_pj: primeiro.pf_pj ?? alvo.pf_pj,
      };
      await mudarStatus(deps.supabase, alvo.id, 'confirmado', 'apagado',
        { descricao: `${alvo.descricao ?? ''} [substituído por correção]`.trim() });
      await criarPendenteEFalar(deps, from, corrigido, null,
        { storagePath: alvo.storage_path, mimeType: undefined, leadId: alvo.lead_id, categoriaId: alvo.categoria_id });
      return true;
    }

    // lançamento(s) novo(s): se for mais de um, abre avisando quantos.
    if (lancar.length > 1) await deps.sendText(from, montarAberturaMultipla(lancar.length));
    for (const e of lancar) {
      await criarPendenteEFalar(deps, from, e, null);
    }
    return true;
```

- [ ] **Step 3: Ajustar o bloco "aguardando" (1) pra lista**

No início de `tryHandleFinanceiroTexto`, o bloco do pendente "aguardando" (linhas ~178-211) chama `extrairDeTexto` esperando um objeto. Trocar a chamada e usar o 1º item pra decisão de mesclar; itens extras viram lançamentos novos. Substituir as linhas que hoje fazem `const e = await extrairDeTexto(...)` e os `if (e && e.financeiro ...)` por:

```ts
      const listaCtx = await extrairDeTexto(deps.anthropic, contexto, hoje);
      const e = listaCtx.find((x) => x.financeiro) ?? null;
      const extras = listaCtx.filter((x) => x.financeiro && x !== e);
      // Mescla SÓ com afirmação explícita do modelo; senão é lançamento novo.
      if (e && e.relacionado !== true) {
        await atualizarPendente(deps.supabase, aguardando.id, { extracao: { ...aguardando.extracao, aguardando: false } });
        await criarPendenteEFalar(deps, from, e, null);
        for (const x of extras) await criarPendenteEFalar(deps, from, x, null);
        return true;
      }
      if (e) {
        const cats = await getCategorias(deps.supabase);
        const cat = cats.find((c) => c.slug === resolverCategoria(e.categoria_slug)) ?? null;
        await atualizarPendente(deps.supabase, aguardando.id, {
          valor: e.valor ?? aguardando.valor, data_evento: e.data ?? aguardando.data_evento,
          competencia: competenciaDe(e.data ?? aguardando.data_evento),
          contraparte: e.contraparte ?? aguardando.contraparte,
          descricao: e.descricao ?? aguardando.descricao,
          categoria_id: cat?.id ?? aguardando.categoria_id,
          pf_pj: e.pf_pj ?? aguardando.pf_pj,
          extracao: { ...e, aguardando: false },
        });
        await mandarResumo(deps, from, aguardando.id);
        for (const x of extras) await criarPendenteEFalar(deps, from, x, null);
        return true;
      }
      await atualizarPendente(deps.supabase, aguardando.id, { extracao: { ...aguardando.extracao, aguardando: false } });
      return false;
```

- [ ] **Step 4: Garantir imports usados**

Conferir que no topo de `caixa-entrada.ts` estão importados (já estão hoje, mas confirmar após edição): `montarPedidoEsclarecimento` e `montarAberturaMultipla` de `./resumo-lancamento.js`. Adicionar ao import existente de `resumo-lancamento.js`:

```ts
import {
  montarResumoPendente, montarPedidoPfPj, montarConfirmacaoApagar,
  montarOfertaVinculoConta, montarEscolhaAtividade, montarPedidoEsclarecimento,
  montarAberturaMultipla, type LancamentoResumo,
} from './resumo-lancamento.js';
```

- [ ] **Step 5: Build + suíte inteira**

Run: `npx tsc --noEmit && npm test`
Expected: tsc 0 erros; TODOS os testes verdes (os novos + os ~856 existentes).

- [ ] **Step 6: Commit**

```bash
git add src/modules/financeiro/caixa-entrada.ts
git commit -m "feat(financeiro): caixa de entrada processa N lançamentos por mensagem + nunca cala"
```

---

## Task 7: Smoke manual (prod, depois do deploy) e revisão

- [ ] **Step 1: Revisão de código 3× (lentes diferentes)** — correção, regressão, segurança. Aplicar achados. (Regra do Junior.)

- [ ] **Step 2: Build marker** — bumpar `src/build-info.ts` (ex.: `CAPTURA-MULTI-EVENTO-2026-06-16`) pra confirmar deploy via `/health`.

- [ ] **Step 3: Smoke (Junior, no zap, após Implantar):**
  - Mandar numa mensagem só: *"recebi 9000 do João Paulo, paguei 1500 de instalação"* → espera 2 cards (1 entrada PJ com imposto/vínculo + 1 despesa), nenhum silêncio.
  - Mandar algo de dinheiro confuso sem valor claro → espera a pergunta de esclarecimento (não fica mudo).
  - Mandar 1 gasto normal *"gastei 380 no posto"* → continua funcionando igual (não quebrou o caso de 1 evento).

---

## Self-review (cobertura do spec)

- Objetivo 1 (N lançamentos/mensagem): Tasks 1-3, 6. ✓
- Objetivo 2 (cada evento seu pendente/imposto): Task 6 reusa `criarPendenteEFalar` (entrada PJ → imposto/vínculo intactos). ✓
- Objetivo 3 (nunca calar): Tasks 4-6 (`planejarCaptura.esclarecer` + `montarPedidoEsclarecimento`). ✓
- Risco "não quebrar 1 evento": Task 6 Step 5 (suíte) + smoke. ✓
- Risco "imposto só entrada PJ": inalterado (reuso do caminho atual). ✓
- Fora de escopo (Peças 2-5): não tocadas. ✓
