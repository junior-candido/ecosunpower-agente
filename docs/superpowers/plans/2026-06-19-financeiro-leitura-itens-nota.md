# Leitura de nota fiscal item-a-item — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando o admin manda foto/PDF de nota, a Eva lê os itens linha a linha, guarda cada preço unitário pra comparação, grifa os itens que não leu com segurança, aceita correção na hora e depois — e continua lançando 1 gasto só no caixa (o total).

**Architecture:** Estende o extrator (campo `itens: ItemNota[]`), o resumo (bloco de itens grifando os duvidosos), a gravação de materiais (N linhas por nota, pula os duvidosos) e o fluxo "aguardando" da Caixa de Entrada (correção de item mantém o pendente aberto até Confirmar). Correção tardia ("a curva da Itaiaia era 8") é um handler novo antes do gate da Caixa, com confirmação por botão. Sem migration nova.

**Tech Stack:** TypeScript, vitest, Anthropic SDK (Opus 4.7 com fallback Haiku), Supabase.

**Milestone de envio:** depois da **Task 7** o recurso já está completo e shippable (lê itens, grifa, confirma, guarda, corrige na hora). Tasks 8–11 entregam a **correção tardia** (Parte 3 / opção b).

**Convenções do repo:**
- Teste: `npm test` (= `vitest run`). Build: `npm run build` (= `tsc`).
- `git add` sempre por caminho (NUNCA `-A`/`.`).
- Funções puras testáveis primeiro; camada I/O (chamadas de IA / Supabase) fina e sem teste unitário.

---

### Task 1: Tipo `ItemNota` + parse no extrator

**Files:**
- Modify: `src/modules/financeiro/extrator-lancamento.ts`
- Test: `tests/financeiro-materiais.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Adicione no fim de `tests/financeiro-materiais.test.ts` (e ajuste o import do topo para incluir `parseItensNota`):

```ts
import { parseLancamentos, parseItensNota } from '../src/modules/financeiro/extrator-lancamento.js';

describe('extrator: itens de nota', () => {
  it('parseLancamentos lê o array itens com preço unitário e problema', () => {
    const raw = '```json\n[{"financeiro":true,"tipo":"despesa","valor":2111.80,"contraparte":"Itaiaia",' +
      '"itens":[{"material":"curva 90 1 1/4","quantidade":2,"unidade":"un","preco_unitario":7,"problema":null},' +
      '{"material":"cabo 6mm","quantidade":100,"unidade":"m","preco_unitario":null,"problema":"não li o preço"}]}]\n```';
    const e = parseLancamentos(raw)[0];
    expect(e.valor).toBe(2111.8);
    expect(e.itens).toHaveLength(2);
    expect(e.itens[0].material).toBe('curva 90 1 1/4');
    expect(e.itens[0].preco_unitario).toBe(7);
    expect(e.itens[1].problema).toBe('não li o preço');
  });
  it('item sem preço OU sem nome ganha "problema" mesmo que o modelo não marque', () => {
    const itens = parseItensNota('```json\n[{"material":"cabo 6mm"},{"preco_unitario":7}]\n```');
    expect(itens[0].problema).toBe('não li o preço'); // tem nome, falta preço
    expect(itens[1].problema).toBe('não li o nome');  // tem preço, falta nome
  });
  it('sem itens → array vazio', () => {
    const e = parseLancamentos('```json\n[{"financeiro":true,"tipo":"despesa","valor":50}]\n```')[0];
    expect(e.itens).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- financeiro-materiais`
Expected: FAIL (`parseItensNota` não existe; `e.itens` undefined).

- [ ] **Step 3: Implementar**

Em `src/modules/financeiro/extrator-lancamento.ts`:

1. Adicione a interface logo após `ExtracaoLancamento` (e o campo `itens` dentro dela):

```ts
export interface ItemNota {
  material: string | null;
  quantidade: number | null;
  unidade: string | null;
  preco_unitario: number | null;
  problema: string | null;   // motivo curto quando a Eva não tem certeza; null = ok
}
```

No corpo de `ExtracaoLancamento`, adicione (depois de `unidade`):

```ts
  itens: ItemNota[];              // linhas de uma nota com vários itens (senão [])
```

2. Adicione o normalizador puro (depois de `strOuNull`):

```ts
export function normalizarItemNota(obj: Record<string, unknown>): ItemNota {
  const material = strOuNull(obj.material);
  const preco_unitario = numeroOuNull(obj.preco_unitario);
  const quantidade = numeroOuNull(obj.quantidade);
  const unidade = strOuNull(obj.unidade);
  let problema = strOuNull(obj.problema);
  // Rede de segurança: sem nome OU sem preço NUNCA entra calado — vira problema.
  if (!problema && !material) problema = 'não li o nome';
  else if (!problema && preco_unitario === null) problema = 'não li o preço';
  return { material, quantidade, unidade, preco_unitario, problema };
}
```

3. Dentro de `normalizarItem`, antes do `return`, monte os itens e inclua no objeto:

```ts
  const itens = Array.isArray(obj.itens)
    ? obj.itens
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x))
        .map(normalizarItemNota)
    : [];
```

E no objeto retornado, adicione `itens,` logo após `unidade: strOuNull(obj.unidade),`.

4. Adicione o parser de itens soltos (usado pela correção na hora — Task 7). Depois de `parseRespostaExtrator`:

```ts
// Lê uma LISTA de itens de nota de uma resposta crua (array direto ou {itens:[...]}).
export function parseItensNota(raw: string): ItemNota[] {
  const fence = raw.match(/```json\s*([\s\S]*?)```/);
  const corpo = fence ? fence[1] : raw;
  const j = tentarJson(corpo);
  const arr = Array.isArray(j)
    ? j
    : (j && typeof j === 'object' && Array.isArray((j as Record<string, unknown>).itens)
        ? (j as Record<string, unknown>).itens as unknown[]
        : []);
  return arr
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x))
    .map(normalizarItemNota);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- financeiro-materiais`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/extrator-lancamento.ts tests/financeiro-materiais.test.ts
git commit -m "feat(financeiro): tipo ItemNota + parse de itens da nota no extrator"
```

---

### Task 2: Prompt de mídia pede os itens

**Files:**
- Modify: `src/modules/financeiro/extrator-lancamento.ts`
- Test: `tests/financeiro-materiais.test.ts`

Sem teste de I/A (texto de prompt não tem teste unitário); o teste garante que o **shape** do JSON com itens segue parseando. Já coberto pela Task 1 — aqui só ajustamos o prompt e adicionamos 1 teste de regressão da regra "texto comum → itens []".

- [ ] **Step 1: Teste de regressão**

Adicione em `tests/financeiro-materiais.test.ts`:

```ts
describe('extrator: texto comum não vira lista de itens', () => {
  it('1 compra por texto → itens []', () => {
    const raw = '```json\n[{"financeiro":true,"tipo":"despesa","valor":80,"material":"DPS","itens":[]}]\n```';
    const e = parseLancamentos(raw)[0];
    expect(e.itens).toEqual([]);
    expect(e.material).toBe('DPS'); // caminho de 1 item por texto segue intacto
  });
});
```

- [ ] **Step 2: Rodar e ver passar (já deve passar)**

Run: `npm test -- financeiro-materiais`
Expected: PASS (regressão).

- [ ] **Step 3: Atualizar o prompt**

Em `REGRAS_COMUNS`, no bloco do JSON (logo após a linha de `"material"/"quantidade"/"unidade"`), adicione a linha:

```
 "itens": [{"material": "nome do item", "quantidade": número ou null, "unidade": "un"|"m"|..., "preco_unitario": número ou null, "problema": "motivo curto se NÃO tiver certeza do item, senão null"}] (lista; só numa NOTA com VÁRIOS itens, senão []),
```

E na seção REGRAS, adicione um item (depois da regra de `material/quantidade/unidade`):

```
- itens: SÓ quando o documento for uma NOTA FISCAL/cupom com VÁRIOS itens listados. Uma linha por item, com o preço UNITÁRIO de cada (NÃO o total da linha nem da nota). Não conseguiu ler o preço ou o nome de um item com certeza → preencha o que deu e descreva em "problema" (ex.: "não li o preço", "nome rasurado", "preço suspeito"). O "valor" do lançamento continua sendo o TOTAL da nota. Mensagem de texto comum ou compra de 1 item só → itens: [].
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: sem erro de tipo.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/extrator-lancamento.ts tests/financeiro-materiais.test.ts
git commit -m "feat(financeiro): prompt de nota pede itens linha a linha com sinal de problema"
```

---

### Task 3: Gravar N itens por nota (`gravarComprasDaNota`)

**Files:**
- Modify: `src/modules/financeiro/materiais.ts`
- Test: `tests/financeiro-materiais.test.ts`

Substitui `gravarCompraMaterialSeHouver` (boolean) por `gravarComprasDaNota` que devolve `{ gravados, pulados }` e trata os dois caminhos: array `itens` (nota) e `material` único (texto legado).

- [ ] **Step 1: Reescrever os testes do gravador**

Em `tests/financeiro-materiais.test.ts`, troque o `describe('materiais: gravarCompraMaterialSeHouver', ...)` inteiro por:

```ts
describe('materiais: montarItensParaGravar (puro)', () => {
  it('usa o array itens quando existe', () => {
    const ex = { itens: [{ material: 'curva 90', quantidade: 2, unidade: 'un', preco_unitario: 7, problema: null }] };
    const r = montarItensParaGravar(ex, 2111.8);
    expect(r).toHaveLength(1);
    expect(r[0].preco_unitario).toBe(7);
  });
  it('cai no material único (texto) quando não há itens', () => {
    const r = montarItensParaGravar({ material: 'cabo 6mm', quantidade: 100, unidade: 'm' }, 400);
    expect(r).toHaveLength(1);
    expect(r[0].material).toBe('cabo 6mm');
    expect(r[0].preco_unitario).toBe(4); // 400/100
  });
  it('sem itens e sem material → []', () => {
    expect(montarItensParaGravar({}, 50)).toEqual([]);
  });
});

describe('materiais: gravarComprasDaNota', () => {
  const lancRow = (over: Record<string, unknown> = {}) => ({
    id: 'l1', tipo: 'despesa', status: 'confirmado', valor: 2111.8, data_evento: '2026-06-19',
    contraparte: 'Itaiaia',
    extracao: { itens: [
      { material: 'curva 90 1 1/4', quantidade: 2, unidade: 'un', preco_unitario: 7, problema: null },
      { material: 'cabo 6mm', quantidade: 100, unidade: 'm', preco_unitario: null, problema: 'não li o preço' },
      { material: 'disjuntor 40A', quantidade: 1, unidade: 'un', preco_unitario: 22, problema: null },
    ] }, ...over,
  });
  it('grava só os itens OK e conta os pulados', async () => {
    (repo.getLancamento as any).mockResolvedValue(lancRow());
    const inserts: any[] = [];
    const client = { from: () => ({ insert: (v: any) => { inserts.push(v); return { error: null }; } }) } as any;
    const r = await gravarComprasDaNota(client, 'l1');
    expect(r).toEqual({ gravados: 2, pulados: 1 });
    expect(inserts.map(i => i.material)).toEqual(['curva 90 1 1/4', 'disjuntor 40A']);
    expect(inserts[0].preco_unitario).toBe(7);
    expect(inserts[0].valor_total).toBe(14); // 7 * 2
    expect(inserts[0].loja).toBe('Itaiaia');
  });
  it('material único (texto legado) grava 1', async () => {
    (repo.getLancamento as any).mockResolvedValue(lancRow({
      valor: 400, contraparte: 'Loja Y', extracao: { material: 'cabo 6mm', quantidade: 100, unidade: 'm' },
    }));
    const inserts: any[] = [];
    const client = { from: () => ({ insert: (v: any) => { inserts.push(v); return { error: null }; } }) } as any;
    const r = await gravarComprasDaNota(client, 'l1');
    expect(r).toEqual({ gravados: 1, pulados: 0 });
    expect(inserts[0].preco_unitario).toBe(4);
  });
  it('não confirmado → {0,0}', async () => {
    (repo.getLancamento as any).mockResolvedValue(lancRow({ status: 'pendente' }));
    const client = { from: () => ({ insert: () => ({ error: null }) }) } as any;
    expect(await gravarComprasDaNota(client, 'l1')).toEqual({ gravados: 0, pulados: 0 });
  });
});
```

E no import do topo, troque `gravarCompraMaterialSeHouver` por `gravarComprasDaNota, montarItensParaGravar`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- financeiro-materiais`
Expected: FAIL (funções não existem).

- [ ] **Step 3: Implementar em `materiais.ts`**

Adicione o import do tipo no topo:

```ts
import { normalizarItemNota, type ItemNota } from './extrator-lancamento.js';
```

Substitua a função `gravarCompraMaterialSeHouver` inteira por:

```ts
export interface ResultadoGravacao { gravados: number; pulados: number }

// PURO: decide a lista de itens a gravar a partir da extração de um lançamento.
// Array `itens` (nota) tem prioridade; senão cai no `material` único (texto legado),
// cujo preço unitário é o total / quantidade.
export function montarItensParaGravar(ex: Record<string, unknown>, valorTotal: number): ItemNota[] {
  if (Array.isArray(ex.itens) && ex.itens.length > 0) {
    return (ex.itens as unknown[])
      .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x))
      .map(normalizarItemNota);
  }
  const material = typeof ex.material === 'string' && ex.material.trim() ? ex.material.trim() : null;
  if (!material) return [];
  const quantidade = typeof ex.quantidade === 'number' && ex.quantidade > 0 ? ex.quantidade : 1;
  const unidade = typeof ex.unidade === 'string' && ex.unidade.trim() ? ex.unidade.trim() : 'un';
  return [{ material, quantidade, unidade, preco_unitario: precoUnitario(valorTotal, quantidade), problema: null }];
}

// Grava as compras de material de um lançamento JÁ confirmado. Pula itens com
// problema não resolvido ou sem preço/nome (nunca entra lixo no comparador).
export async function gravarComprasDaNota(client: SupabaseClient, lancamentoId: string): Promise<ResultadoGravacao> {
  const row = await getLancamento(client, lancamentoId);
  if (!row || row.status !== 'confirmado' || row.tipo !== 'despesa') return { gravados: 0, pulados: 0 };
  const itens = montarItensParaGravar((row.extracao ?? {}) as Record<string, unknown>, Number(row.valor));
  let gravados = 0, pulados = 0;
  for (const it of itens) {
    if (it.problema || !it.material || it.preco_unitario === null || it.preco_unitario <= 0) { pulados++; continue; }
    const quantidade = it.quantidade && it.quantidade > 0 ? it.quantidade : 1;
    await inserirCompraMaterial(client, {
      lancamento_id: lancamentoId, material: it.material, material_norm: normalizarMaterial(it.material),
      loja: row.contraparte ?? null, quantidade, unidade: it.unidade ?? 'un',
      valor_total: Math.round(it.preco_unitario * quantidade * 100) / 100,
      preco_unitario: it.preco_unitario, data_evento: row.data_evento,
    });
    gravados++;
  }
  return { gravados, pulados };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- financeiro-materiais`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/materiais.ts tests/financeiro-materiais.test.ts
git commit -m "feat(financeiro): grava N itens por nota, pula os duvidosos, devolve contagem"
```

---

### Task 4: Confirmar usa `gravarComprasDaNota` + mensagem com contagem

**Files:**
- Modify: `src/modules/financeiro/caixa-entrada.ts:350-358`

Sem teste novo (é fiação do handler de botão; coberto pela Task 3 + smoke). O caso `conf` chama o gravador novo.

- [ ] **Step 1: Trocar o import**

Em `caixa-entrada.ts`, linha 27, troque:

```ts
import { gravarCompraMaterialSeHouver } from './materiais.js';
```

por:

```ts
import { gravarComprasDaNota } from './materiais.js';
```

- [ ] **Step 2: Atualizar o caso `conf`**

No `handleFinlanButton`, dentro de `case 'conf':`, troque o bloco que monta `salvouMaterial`/`sufMat` (linhas ~352-353) por:

```ts
          const res = await gravarComprasDaNota(deps.supabase, id).catch(() => ({ gravados: 0, pulados: 0 }));
          const sufMat = res.gravados === 0 ? ''
            : res.pulados > 0
              ? `\n📦 Guardei ${res.gravados} de ${res.gravados + res.pulados} preços (${res.pulados} ficaram de fora — faltou preço/nome).`
              : `\n📦 Guardei ${res.gravados} preço(s) pra comparar (manda "preço do <material>").`;
```

(o resto do `case 'conf'` continua igual — `msgEntrada`, o `sendText` final com `sufMat`.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: sem erro (nenhum outro lugar usa `gravarCompraMaterialSeHouver`).

- [ ] **Step 4: Commit**

```bash
git add src/modules/financeiro/caixa-entrada.ts
git commit -m "feat(financeiro): confirmar nota grava os itens e informa quantos foram guardados"
```

---

### Task 5: Resumo com bloco de itens grifando os duvidosos

**Files:**
- Modify: `src/modules/financeiro/resumo-lancamento.ts`
- Test: `tests/financeiro-resumo.test.ts` (criar se não existir)

- [ ] **Step 1: Teste que falha**

Crie/abra `tests/financeiro-resumo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { montarBlocoItens, montarResumoPendente } from '../src/modules/financeiro/resumo-lancamento.js';

describe('resumo: montarBlocoItens', () => {
  it('grifa só os com problema e conta os ok', () => {
    const txt = montarBlocoItens([
      { material: 'curva 90', preco_unitario: null, problema: 'não li o preço' },
      { material: 'cabo 6mm', preco_unitario: 4, problema: null },
      { material: 'disjuntor', preco_unitario: 22, problema: null },
    ]);
    expect(txt).toContain('3 itens');
    expect(txt).toContain('⚠️');
    expect(txt).toContain('curva 90');
    expect(txt).toContain('não li o preço');
    expect(txt).toContain('2 ok');
  });
  it('todos ok → sem ⚠️', () => {
    const txt = montarBlocoItens([{ material: 'cabo', preco_unitario: 4, problema: null }]);
    expect(txt).not.toContain('⚠️');
    expect(txt).toContain('todos certos');
  });
  it('lista vazia → string vazia', () => {
    expect(montarBlocoItens([])).toBe('');
  });
});

describe('resumo: montarResumoPendente com itens', () => {
  it('inclui o bloco de itens no corpo', () => {
    const msg = montarResumoPendente(
      { id: 'l1', tipo: 'despesa', valor: 2111.8, data_evento: '2026-06-19', contraparte: 'Itaiaia', categoriaNome: null, pf_pj: 'PJ' },
      { duplicado: false, itens: [{ material: 'curva 90', preco_unitario: null, problema: 'não li o preço' }] },
    );
    expect(msg.body).toContain('⚠️');
    expect(msg.body).toContain('me corrige');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- financeiro-resumo`
Expected: FAIL (`montarBlocoItens` não existe; `montarResumoPendente` não aceita `itens`).

- [ ] **Step 3: Implementar em `resumo-lancamento.ts`**

Adicione o tipo e a função (depois de `linhaResumo`):

```ts
export interface ItemResumo { material: string | null; preco_unitario: number | null; problema: string | null }

export function montarBlocoItens(itens: ItemResumo[]): string {
  if (itens.length === 0) return '';
  const comProblema = itens.filter((i) => i.problema);
  const ok = itens.length - comProblema.length;
  let txt = `\n📦 ${itens.length} itens lidos.`;
  if (comProblema.length === 0) return txt + ' ✅ todos certos.';
  const linhas = comProblema.map((i) => {
    const nome = i.material ?? '???';
    const preco = i.preco_unitario !== null ? ` (${brl(i.preco_unitario)})` : '';
    return `⚠️ ${nome}${preco} — ${i.problema}`;
  });
  txt += ` ${comProblema.length} que eu não tenho certeza:\n${linhas.join('\n')}`;
  if (ok > 0) txt += `\n✅ os outros ${ok} ok.`;
  return txt;
}
```

Altere a assinatura de `montarResumoPendente`:

```ts
export function montarResumoPendente(l: LancamentoResumo, opts: { duplicado: boolean; itens?: ItemResumo[] }): MsgComBotoes {
  const aviso = opts.duplicado
    ? '\n⚠️ Parece igual a um lançamento que você já fez nesse dia.'
    : '';
  const blocoItens = montarBlocoItens(opts.itens ?? []);
  const dica = blocoItens && (opts.itens ?? []).some((i) => i.problema) ? ' (me corrige os ⚠️ se precisar)' : '';
  return {
    body: `Li aqui:\n${linhaResumo(l)}${blocoItens}${aviso}\nConfere?${dica}`,
    buttons: [
      { id: `finlan:conf:${l.id}`, title: opts.duplicado ? 'Lançar mesmo assim' : 'Confirmar' },
      { id: `finlan:corr:${l.id}`, title: 'Corrigir' },
      { id: `finlan:desc:${l.id}`, title: 'Descartar' },
    ],
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- financeiro-resumo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/resumo-lancamento.ts tests/financeiro-resumo.test.ts
git commit -m "feat(financeiro): resumo do pendente mostra itens da nota e grifa os duvidosos"
```

---

### Task 6: Passar os itens pro resumo (`mandarResumo`)

**Files:**
- Modify: `src/modules/financeiro/caixa-entrada.ts:162-163`

- [ ] **Step 1: Editar `mandarResumo`**

Em `caixa-entrada.ts`, dentro de `mandarResumo`, troque as duas linhas finais:

```ts
  const msg = montarResumoPendente(await rowParaResumo(deps, row), { duplicado });
  await deps.waba.sendInteractiveButtons(from, msg.body, msg.buttons, FOOTER);
```

por:

```ts
  const itens = Array.isArray(row.extracao?.itens) ? (row.extracao!.itens as Array<{ material: string | null; preco_unitario: number | null; problema: string | null }>) : [];
  const msg = montarResumoPendente(await rowParaResumo(deps, row), { duplicado, itens });
  await deps.waba.sendInteractiveButtons(from, msg.body, msg.buttons, FOOTER);
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: sem erro.

- [ ] **Step 3: Commit**

```bash
git add src/modules/financeiro/caixa-entrada.ts
git commit -m "feat(financeiro): mandarResumo inclui os itens lidos da nota"
```

---

### Task 7: Correção de item na hora (conserta o travamento) — **fim do milestone shippable**

**Files:**
- Modify: `src/modules/financeiro/extrator-lancamento.ts` (chamada de IA)
- Modify: `src/modules/financeiro/caixa-entrada.ts:196-231` (bloco `aguardando`)

Quando o pendente tem `itens` e está `aguardando`, o texto do admin corrige os itens e o pendente **continua aberto** (re-mostra o resumo). Conserta o caso "Curva de 90graus... 7.00" que hoje escorrega pro cérebro da Eva.

- [ ] **Step 1: Adicionar a chamada de IA no extrator**

Em `extrator-lancamento.ts`, depois de `extrairDePdf`, adicione:

```ts
// Aplica uma correção em linguagem natural sobre uma lista de itens de nota.
// Devolve a lista atualizada; em qualquer falha devolve os itens originais (degrada).
export async function corrigirItensComTexto(client: Anthropic, itens: ItemNota[], texto: string, hoje: string): Promise<ItemNota[]> {
  try {
    const prompt = `Esses são os itens que li de uma nota fiscal (JSON):\n${JSON.stringify(itens)}\n\n` +
      `O dono da empresa mandou esta correção: "${texto}"\n\n` +
      `Aplique a correção nos itens certos (case pelo nome do material ou pela posição que ele citar) e devolva a LISTA COMPLETA de itens já atualizada, no MESMO formato (array de objetos com material, quantidade, unidade, preco_unitario, problema), dentro de um bloco \`\`\`json\`\`\`. Quando um item for corrigido e ficar ok, ponha "problema": null. NÃO invente itens novos. Data de hoje: ${hoje}.`;
    const raw = await chamarComFallback(client, [{ role: 'user', content: prompt }], 1024);
    const corrigidos = parseItensNota(raw);
    return corrigidos.length > 0 ? corrigidos : itens;
  } catch (err) {
    console.warn('[caixa-entrada] corrigirItensComTexto falhou:', (err as Error).message);
    return itens;
  }
}
```

- [ ] **Step 2: Rotear no bloco `aguardando`**

Em `caixa-entrada.ts`, adicione ao import do extrator (linhas 7-10) `corrigirItensComTexto` e `type ItemNota`:

```ts
import {
  gateTextoFinanceiro, extrairDeTexto, extrairDeImagem, extrairDePdf, corrigirItensComTexto,
  type ExtracaoLancamento, type ItemNota,
} from './extrator-lancamento.js';
```

Dentro de `tryHandleFinanceiroTexto`, logo no começo do `if (aguardando) {` (antes de montar o `contexto`), adicione:

```ts
      // Pendente de NOTA (tem itens): o texto corrige os itens e o pendente segue
      // aberto até o admin clicar Confirmar. NUNCA escorrega pro cérebro de conversa.
      const itensAtuais = Array.isArray(aguardando.extracao?.itens)
        ? (aguardando.extracao!.itens as ItemNota[]) : [];
      if (itensAtuais.length > 0) {
        const itensCorrigidos = await corrigirItensComTexto(deps.anthropic, itensAtuais, texto, hojeBRT());
        await atualizarPendente(deps.supabase, aguardando.id, {
          extracao: { ...aguardando.extracao, itens: itensCorrigidos, aguardando: true },
        });
        await mandarResumo(deps, from, aguardando.id);
        return true;
      }
```

- [ ] **Step 3: Build + testes completos**

Run: `npm run build && npm test`
Expected: build limpo, suíte verde.

- [ ] **Step 4: Commit**

```bash
git add src/modules/financeiro/extrator-lancamento.ts src/modules/financeiro/caixa-entrada.ts
git commit -m "fix(financeiro): correção de item da nota mantém o pendente aberto (conserta travamento)"
```

---

### Task 8: Parser da correção tardia (puro)

**Files:**
- Create: `src/modules/financeiro/correcao-preco.ts`
- Test: `tests/financeiro-correcao-preco.test.ts`

Detecta "a curva da Itaiaia era 8" / "o cabo 6mm era 5,50" → `{ material, loja, valorNovo }`. Reusa `parseValorReais`.

- [ ] **Step 1: Teste que falha**

Crie `tests/financeiro-correcao-preco.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCorrecaoPrecoMaterial } from '../src/modules/financeiro/correcao-preco.js';

describe('parseCorrecaoPrecoMaterial', () => {
  it('material + loja + valor', () => {
    expect(parseCorrecaoPrecoMaterial('a curva 90 da Itaiaia era 8'))
      .toEqual({ material: 'curva 90', loja: 'Itaiaia', valorNovo: 8 });
    expect(parseCorrecaoPrecoMaterial('o cabo 6mm na Eletro X foi 5,50'))
      .toEqual({ material: 'cabo 6mm', loja: 'Eletro X', valorNovo: 5.5 });
  });
  it('material + valor (sem loja)', () => {
    expect(parseCorrecaoPrecoMaterial('a curva 90 era 7'))
      .toEqual({ material: 'curva 90', loja: null, valorNovo: 7 });
  });
  it('frase que não é correção de preço → null', () => {
    expect(parseCorrecaoPrecoMaterial('gastei 380 no posto')).toBeNull();
    expect(parseCorrecaoPrecoMaterial('preço do DPS')).toBeNull();
    expect(parseCorrecaoPrecoMaterial('a curva era boa')).toBeNull(); // sem valor
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- financeiro-correcao-preco`
Expected: FAIL (arquivo não existe).

- [ ] **Step 3: Implementar `correcao-preco.ts`**

```ts
// src/modules/financeiro/correcao-preco.ts
// Correção tardia de preço de material já registrado ("a curva da Itaiaia era 8").
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseValorReais } from './comando-imposto.js';
import { normalizarMaterial } from './materiais.js';

export interface CorrecaoPreco { material: string; loja: string | null; valorNovo: number }

// PURO. Padrão: artigo + material [+ (da|do|na|no) loja] + (era|foi|custou|saiu por) + valor.
export function parseCorrecaoPrecoMaterial(text: string): CorrecaoPreco | null {
  const t = text.trim();
  // Com loja: "a <material> da <loja> era <valor>"
  let m = t.match(/^(?:o|a|os|as)\s+(.+?)\s+(?:da|do|na|no)\s+(.+?)\s+(?:era|foi|custou|saiu\s+por)\s+(.+)$/i);
  if (m) {
    const valorNovo = parseValorReais(m[3]);
    if (valorNovo === null) return null;
    return { material: m[1].trim(), loja: m[2].trim(), valorNovo };
  }
  // Sem loja: "a <material> era <valor>"
  m = t.match(/^(?:o|a|os|as)\s+(.+?)\s+(?:era|foi|custou|saiu\s+por)\s+(.+)$/i);
  if (m) {
    const valorNovo = parseValorReais(m[2]);
    if (valorNovo === null) return null;
    return { material: m[1].trim(), loja: null, valorNovo };
  }
  return null;
}

export interface CompraDetalhe { id: string; material: string; loja: string | null; preco_unitario: number; data_evento: string }

// I/O: busca compras que casam o material (e a loja, se citada), mais recentes primeiro.
export async function buscarComprasPorMaterial(client: SupabaseClient, c: CorrecaoPreco): Promise<CompraDetalhe[]> {
  const t = normalizarMaterial(c.material).replace(/[%_]/g, '\\$&');
  let q = client.from('financeiro_materiais_compras')
    .select('id, material, loja, preco_unitario, data_evento')
    .ilike('material_norm', `%${t}%`);
  if (c.loja) q = q.ilike('loja', `%${c.loja.replace(/[%_]/g, '\\$&')}%`);
  const { data, error } = await q.order('data_evento', { ascending: false }).order('created_at', { ascending: false }).limit(5);
  if (error) throw new Error(`buscarComprasPorMaterial: ${error.message}`);
  return (data ?? []) as CompraDetalhe[];
}

// PURO: pega a compra mais recente de cada loja (pra desambiguar por loja).
export function maisRecentePorLoja(rows: CompraDetalhe[]): CompraDetalhe[] {
  const vistos = new Set<string>();
  const out: CompraDetalhe[] = [];
  for (const r of rows) { // já vêm ordenadas por data desc
    const k = (r.loja ?? '—').toLowerCase();
    if (vistos.has(k)) continue;
    vistos.add(k); out.push(r);
  }
  return out;
}

export async function atualizarPrecoCompra(client: SupabaseClient, id: string, novoPreco: number): Promise<boolean> {
  const { data, error } = await client.from('financeiro_materiais_compras')
    .update({ preco_unitario: novoPreco, valor_total: novoPreco }) // 1 un de referência; comparação usa preco_unitario
    .eq('id', id).select('id');
  if (error) throw new Error(`atualizarPrecoCompra: ${error.message}`);
  return Boolean(data && data.length > 0);
}
```

Adicione um teste pro `maisRecentePorLoja` no mesmo arquivo de teste:

```ts
import { maisRecentePorLoja } from '../src/modules/financeiro/correcao-preco.js';
describe('maisRecentePorLoja', () => {
  it('1 por loja, a mais recente', () => {
    const rows = [
      { id: 'a', material: 'curva', loja: 'Itaiaia', preco_unitario: 7, data_evento: '2026-06-19' },
      { id: 'b', material: 'curva', loja: 'Itaiaia', preco_unitario: 9, data_evento: '2026-06-01' },
      { id: 'c', material: 'curva', loja: 'Eletro X', preco_unitario: 8, data_evento: '2026-06-10' },
    ];
    const r = maisRecentePorLoja(rows);
    expect(r.map(x => x.id)).toEqual(['a', 'c']);
  });
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- financeiro-correcao-preco`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/correcao-preco.ts tests/financeiro-correcao-preco.test.ts
git commit -m "feat(financeiro): parser+repo da correção tardia de preço de material"
```

---

### Task 9: Handler da correção tardia + botões

**Files:**
- Modify: `src/modules/financeiro/correcao-preco.ts`
- Test: `tests/financeiro-correcao-preco.test.ts`

Monta a pergunta de confirmação. Botões: `matcorr:ok:<compraId>:<centavos>` (1 por loja, até 3) e `matcorr:no:0`.

- [ ] **Step 1: Teste que falha**

Adicione em `tests/financeiro-correcao-preco.test.ts`:

```ts
import { montarConfirmacaoCorrecao } from '../src/modules/financeiro/correcao-preco.js';
describe('montarConfirmacaoCorrecao', () => {
  const alvo = { id: 'a', material: 'curva 90', loja: 'Itaiaia', preco_unitario: 7, data_evento: '2026-06-19' };
  it('1 alvo → pergunta direta com botão ok', () => {
    const msg = montarConfirmacaoCorrecao([alvo], 8);
    expect(msg.body).toContain('curva 90');
    expect(msg.body).toContain('Itaiaia');
    expect(msg.buttons[0].id).toBe('matcorr:ok:a:800'); // 8,00 = 800 centavos
  });
  it('vários alvos → pede qual loja (1 botão por loja)', () => {
    const msg = montarConfirmacaoCorrecao([alvo, { ...alvo, id: 'c', loja: 'Eletro X' }], 8);
    expect(msg.buttons).toHaveLength(2);
    expect(msg.buttons.map(b => b.title)).toEqual(['Itaiaia', 'Eletro X']);
  });
  it('nenhum alvo → null', () => {
    expect(montarConfirmacaoCorrecao([], 8)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- financeiro-correcao-preco`
Expected: FAIL.

- [ ] **Step 3: Implementar em `correcao-preco.ts`**

```ts
export interface BotaoZap { id: string; title: string }
export interface MsgComBotoes { body: string; buttons: BotaoZap[] }
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const cents = (n: number) => Math.round(n * 100);

// Monta a confirmação. 1 alvo → pergunta direta. Vários → 1 botão por loja (até 3).
export function montarConfirmacaoCorrecao(alvos: CompraDetalhe[], valorNovo: number): MsgComBotoes | null {
  if (alvos.length === 0) return null;
  if (alvos.length === 1) {
    const a = alvos[0];
    return {
      body: `Achei *${a.material}* · ${a.loja ?? '—'} · ${dm(a.data_evento)} · ${brl(a.preco_unitario)} → mudo pra *${brl(valorNovo)}*?`,
      buttons: [
        { id: `matcorr:ok:${a.id}:${cents(valorNovo)}`, title: 'Sim, mudar' },
        { id: 'matcorr:no:0', title: 'Não' },
      ],
    };
  }
  return {
    body: `Achei em mais de uma loja — qual você quer mudar pra *${brl(valorNovo)}*?`,
    buttons: alvos.slice(0, 3).map((a) => ({ id: `matcorr:ok:${a.id}:${cents(valorNovo)}`, title: (a.loja ?? '—').slice(0, 20) })),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- financeiro-correcao-preco`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/correcao-preco.ts tests/financeiro-correcao-preco.test.ts
git commit -m "feat(financeiro): confirmação por botão da correção tardia de preço"
```

---

### Task 10: Fiar a correção tardia no `index.ts`

**Files:**
- Modify: `src/index.ts` (perto da linha 733 e 3788; e o roteamento de botões finlan)

- [ ] **Step 1: Criar o handler de texto (junto dos outros, ~linha 733)**

Depois de `const tryHandleConsultaMaterial = ...`, adicione:

```ts
  // Correção tardia de preço de material ("a curva da Itaiaia era 8") — antes do gate da Caixa.
  const tryHandleCorrecaoPreco = async (from: string, text: string): Promise<boolean> => {
    if (!isAdminPhone(from)) return false;
    const { parseCorrecaoPrecoMaterial, buscarComprasPorMaterial, maisRecentePorLoja, montarConfirmacaoCorrecao } =
      await import('./modules/financeiro/correcao-preco.js');
    const c = parseCorrecaoPrecoMaterial(text);
    if (!c) return false;
    const rows = await buscarComprasPorMaterial(supabase.getClient(), c);
    const msg = montarConfirmacaoCorrecao(maisRecentePorLoja(rows), c.valorNovo);
    if (!msg) return false; // não achou material → deixa seguir o fluxo normal (não engole)
    await metaWaba!.sendInteractiveButtons(from, msg.body, msg.buttons, 'Comparador de preços · Financeiro');
    return true;
  };
```

- [ ] **Step 2: Chamar antes do gate da Caixa (~linha 3788)**

Logo após `if (await tryHandleConsultaMaterial(from, text)) return;`, adicione:

```ts
    // Correção tardia de preço de material (precisa vir antes do gate do caixa).
    if (metaWaba && await tryHandleCorrecaoPreco(from, text)) return;
```

- [ ] **Step 3: Tratar os botões `matcorr:*`**

Os botões chegam como `text.trim()` com prefixo (mesmo padrão do bloco `finlan:` em `src/index.ts:3485`). Adicione um bloco **logo antes** do `if (... text.trim().startsWith('finlan:'))` (linha ~3485):

```ts
    // matcorr:<acao>:<compraId>:<centavos> — confirmação da correção tardia de preço.
    if (isAdminPhone(from) && metaWaba && text.trim().startsWith('matcorr:')) {
      const [, acao, compraId, centavos] = text.trim().split(':');
      if (acao === 'no') { await sendText(from, 'Beleza, deixei como tava. 👍'); return; }
      if (acao === 'ok') {
        const { atualizarPrecoCompra } = await import('./modules/financeiro/correcao-preco.js');
        const novo = Number(centavos) / 100;
        const ok = await atualizarPrecoCompra(supabase.getClient(), compraId, novo).catch(() => false);
        await sendText(from, ok
          ? `✅ Atualizei pra ${novo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`
          : 'Não achei mais esse registro pra atualizar. 🤔');
      }
      return;
    }
```

- [ ] **Step 4: Build + testes**

Run: `npm run build && npm test`
Expected: build limpo, suíte verde.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(financeiro): fia correção tardia de preço (texto + botões matcorr) no index"
```

---

### Task 11: Verificação final + checklist de smoke

**Files:** nenhum (verificação).

- [ ] **Step 1: Suíte completa + build**

Run: `npm test && npm run build`
Expected: tudo verde, sem erro de tipo.

- [ ] **Step 2: Checklist de smoke (em prod, depois de Implantar — Junior valida)**

```
[ ] Foto de nota com vários itens → lança 1 gasto (total) + resumo lista os itens, grifa os ⚠️.
[ ] Corrigir um ⚠️ por texto ("a curva é 7,00") → resumo volta com o item ok, pendente segue aberto.
[ ] Confirmar → "Guardei X de N preços".
[ ] "preço do <material>" → ranking por loja com os preços guardados.
[ ] Correção tardia: "a curva da Itaiaia era 8" → botão de confirmar → atualiza.
[ ] Texto comum (1 item: "comprei DPS por 80") → continua funcionando (1 preço guardado).
[ ] Mensagem não-financeira → segue pro fluxo normal da Eva (não engole, não trava).
```

- [ ] **Step 3: Marcar pronto pra review**

Antes de push/Implantar: rodar code review 3× (preferência do Junior) e só então pedir autorização de push.

---

## Self-Review (autor)

**Cobertura da spec:**
- Parte 1 (leitura item-a-item): Tasks 1, 2. ✓
- Parte 2 (conferência grifando + aceitar correção): Tasks 4, 5, 6, 7. ✓
- Parte 3 (correção tardia): Tasks 8, 9, 10. ✓
- Gravar 1 gasto + N preços, pula duvidosos: Task 3. ✓
- Sem migration: confirmado (Task 3 usa a tabela existente). ✓
- Degradar com elegância (erro não trava): `gravarComprasDaNota(...).catch` (Task 4), `corrigirItensComTexto` try/catch (Task 7), handlers com `.catch` (Task 10). ✓

**Consistência de tipos:** `ItemNota` (extrator) ↔ `ItemResumo` (resumo, shape compatível: material/preco_unitario/problema) ↔ `montarItensParaGravar` (materiais). `gravarComprasDaNota` retorna `{gravados,pulados}` usado igual no Task 4. `CompraDetalhe`/`CorrecaoPreco` usados consistentes nos Tasks 8-10. ✓

**Placeholders:** nenhum — todo passo tem código/cmd. O único ponto "confirme ao editar" é o Task 10 Step 3 (nomes do escopo de botões do index.ts), explícito porque o index é grande; o executor deve ler o trecho antes.
