# Gerenciador de Propostas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir reabrir uma proposta gerada pra ajustar (no dashboard, "atualizar essa" vs "nova versão") e continuar um rascunho em andamento (no zap), salvando o cadastro completo da proposta.

**Architecture:** Salva o `data` COMPLETO no `dados_input` (jsonb) ao gerar. O dashboard lê esse jsonb pra pré-preencher o form A4 e regenerar (sobrescrevendo o mesmo slug ou criando um novo). No zap, a palavra `rascunho` inspeciona a sessão Redis e mostra o que falta. Lógica em funções puras (testáveis), I/O nas bordas.

**Tech Stack:** TypeScript, Express (dashboard router), Supabase (`propostas_publicas`), Redis (sessão proposta), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-09-gerenciador-propostas-design.md`

---

## File Structure

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/modules/supabase.ts` | `getPropostaInputBySlug` (ler dados_input) + `updatePropostaPublica` (html+dados_input) | 1 |
| `src/modules/proposal/dados-input.ts` (novo) | `montarDadosInputCompleto` (pura) | 2 |
| `src/modules/proposal-assistant.ts` | usar `montarDadosInputCompleto` no save | 2 |
| `src/modules/dashboard/proposta-prefill.ts` (novo) | `prefillFormFromDadosInput` (pura) | 3 |
| `src/modules/dashboard/proposta-form-view.ts` | `renderFormNovaProposta` aceita `valoresIniciais` | 3 |
| `src/modules/dashboard/router.ts` | rotas GET/POST `/propostas/:slug/reabrir` + botão | 4 |
| `src/modules/proposal/rascunho.ts` (novo) | `resumirRascunho` (pura) | 5 |
| `src/modules/proposal-assistant.ts` + `src/index.ts` | handler+trigger `rascunho` | 5 |

---

## Task 1: Supabase — ler e atualizar dados_input por slug

**Files:**
- Modify: `src/modules/supabase.ts` (depois de `updatePropostaPublicaHtml`, ~linha 771)
- Test: `tests/supabase-proposta-reabrir.test.ts` (novo)

A reabertura precisa LER o `dados_input` salvo e, no "atualizar essa", reescrever html + dados_input do MESMO slug. Hoje só existe `updatePropostaPublicaHtml(slug, html)` e `getPropostaPublicaBySlug` (que não devolve `dados_input`).

- [ ] **Step 1: Escrever o teste (mock do client)**

```typescript
// tests/supabase-proposta-reabrir.test.ts
import { describe, it, expect, vi } from 'vitest';
import { SupabaseService } from '../src/modules/supabase.js';

function fakeClient(row: any) {
  const eqMaybe = { eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) };
  const upd = { update: () => ({ eq: async () => ({ error: null }) }) };
  return { from: () => ({ select: () => eqMaybe, ...upd }) } as any;
}

describe('getPropostaInputBySlug', () => {
  it('devolve dados_input + meta quando existe', async () => {
    const svc = new SupabaseService({ supabaseUrl: 'http://x', supabaseServiceKey: 'k' });
    (svc as any).client = fakeClient({ dados_input: { potenciaKwp: 8.4 }, numero_proposta: '2026-AB', cliente_nome: 'X', cliente_telefone: '5561', tipo: 'basica', modo_envio: 'junior_envia', revoked: false });
    const r = await svc.getPropostaInputBySlug('slug1');
    expect(r?.dadosInput).toEqual({ potenciaKwp: 8.4 });
    expect(r?.numeroProposta).toBe('2026-AB');
  });
  it('devolve null quando não existe', async () => {
    const svc = new SupabaseService({ supabaseUrl: 'http://x', supabaseServiceKey: 'k' });
    (svc as any).client = fakeClient(null);
    expect(await svc.getPropostaInputBySlug('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/supabase-proposta-reabrir.test.ts`
Expected: FAIL — `getPropostaInputBySlug is not a function`.

- [ ] **Step 3: Implementar os 2 métodos** (depois de `updatePropostaPublicaHtml`)

```typescript
  async getPropostaInputBySlug(slug: string): Promise<{
    dadosInput: Record<string, unknown> | null;
    numeroProposta: string;
    clienteNome: string;
    clienteTelefone: string | null;
    tipo: 'basica' | 'personalizada';
    modoEnvio: 'junior_envia' | 'eva_envia';
  } | null> {
    const { data, error } = await this.client
      .from('propostas_publicas')
      .select('dados_input, numero_proposta, cliente_nome, cliente_telefone, tipo, modo_envio, revoked')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw new Error(`getPropostaInputBySlug: ${error.message}`);
    if (!data || data.revoked) return null;
    return {
      dadosInput: (data.dados_input as Record<string, unknown> | null) ?? null,
      numeroProposta: data.numero_proposta,
      clienteNome: data.cliente_nome,
      clienteTelefone: data.cliente_telefone ?? null,
      tipo: data.tipo ?? 'basica',
      modoEnvio: data.modo_envio ?? 'junior_envia',
    };
  }

  async updatePropostaPublica(slug: string, fields: { htmlContent?: string; dadosInput?: Record<string, unknown> }): Promise<void> {
    const update: Record<string, unknown> = {};
    if (fields.htmlContent !== undefined) update.html_content = fields.htmlContent;
    if (fields.dadosInput !== undefined) update.dados_input = fields.dadosInput;
    if (Object.keys(update).length === 0) return;
    const { error } = await this.client.from('propostas_publicas').update(update).eq('slug', slug);
    if (error) throw new Error(`updatePropostaPublica: ${error.message}`);
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/supabase-proposta-reabrir.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/supabase.ts tests/supabase-proposta-reabrir.test.ts
git commit -m "feat(supabase): ler/atualizar dados_input da proposta por slug"
```

---

## Task 2: Fundação — salvar o `data` completo no dados_input

**Files:**
- Create: `src/modules/proposal/dados-input.ts`
- Modify: `src/modules/proposal-assistant.ts:1091-1113` (troca `dadosInputMinimo`)
- Test: `tests/proposta-dados-input.test.ts` (novo)

Hoje salva um subconjunto aninhado (`sistema.potenciaKwp`, `comercial.valorTotalRs`) que NÃO bate com o que o dashboard lê (`dados_input.potenciaKwp` top-level, `dados_input.investimento.total`). Salvar o `data` completo + um bloco `investimento.total` conserta os KPIs E habilita a reabertura.

- [ ] **Step 1: Teste da função pura**

```typescript
// tests/proposta-dados-input.test.ts
import { describe, it, expect } from 'vitest';
import { montarDadosInputCompleto } from '../src/modules/proposal/dados-input.js';

describe('montarDadosInputCompleto', () => {
  const data = { nomeCliente: 'Marcelo', potenciaKwp: 8.4, valorTotalRs: 38500, modulo: { fabricante: 'Trina', quantidade: 12 }, inversor: { fabricante: 'Sungrow' }, tarifaRsKwh: 1.05 };
  it('preserva o data completo (pra reabrir)', () => {
    const d = montarDadosInputCompleto(data, 38500);
    expect(d.nomeCliente).toBe('Marcelo');
    expect(d.modulo).toEqual({ fabricante: 'Trina', quantidade: 12 });
    expect(d.tarifaRsKwh).toBe(1.05);
  });
  it('mantém os campos que o dashboard lê (potenciaKwp top-level + investimento.total)', () => {
    const d = montarDadosInputCompleto(data, 41300); // valor com serviços
    expect(d.potenciaKwp).toBe(8.4);
    expect((d.investimento as any).total).toBe(41300);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/proposta-dados-input.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `src/modules/proposal/dados-input.ts`**

```typescript
// src/modules/proposal/dados-input.ts
// Monta o jsonb salvo em propostas_publicas.dados_input. Guarda o `data` COMPLETO
// (pra reabrir a proposta sem perder nada) + um bloco `investimento.total` derivado
// que o dashboard lê (queries.extrairValorTotal / clientes-queries). potenciaKwp já
// está top-level no data, então extrairKwp funciona direto.
export function montarDadosInputCompleto(data: Record<string, unknown>, valorComServicos: number): Record<string, unknown> {
  return {
    ...data,
    investimento: { total: Number.isFinite(valorComServicos) ? valorComServicos : Number(data.valorTotalRs) },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/proposta-dados-input.test.ts`
Expected: PASS.

- [ ] **Step 5: Usar no save** — em `src/modules/proposal-assistant.ts`, importar no topo:

```typescript
import { montarDadosInputCompleto } from './proposal/dados-input.js';
```

Trocar o bloco `const dadosInputMinimo = {...}` (linhas ~1091-1102) por:

```typescript
    // Salva o `data` COMPLETO (pra reabrir) + investimento.total derivado (KPIs do dashboard).
    // valorComServicos já é calculado acima no fluxo de proposalData.
    const dadosInputMinimo: Record<string, unknown> = montarDadosInputCompleto(
      data as Record<string, unknown>,
      Number(data.valorTotalRs) + somaServicosExtras(mapServicosFromClaude(data.servicos)),
    );
```

> NOTA pro engenheiro: confirme que `somaServicosExtras` e `mapServicosFromClaude` já são importados no arquivo (são — usados em `dataToProposalData`). Se o cálculo de `valorComServicos` já existir numa variável no escopo do save, reuse-a em vez de recalcular.

- [ ] **Step 6: Typecheck + testes**

Run: `npx tsc --noEmit && npx vitest run tests/proposta-dados-input.test.ts tests/cartao-belenus.test.ts`
Expected: tsc exit 0; testes PASS (a proposta ainda gera).

- [ ] **Step 7: Commit**

```bash
git add src/modules/proposal/dados-input.ts src/modules/proposal-assistant.ts tests/proposta-dados-input.test.ts
git commit -m "feat(proposal): salva dados_input completo (reabrir) + conserta KPI valor/kwp"
```

---

## Task 3: Pré-preenchimento do form A4

**Files:**
- Create: `src/modules/dashboard/proposta-prefill.ts`
- Modify: `src/modules/dashboard/proposta-form-view.ts` (`renderFormNovaProposta` aceita `valoresIniciais`)
- Test: `tests/proposta-prefill.test.ts` (novo)

`renderFormNovaProposta` hoje pré-preenche só do `lead` (cliente). Pra reabrir, precisa pré-preencher os campos de SISTEMA/COMERCIAL a partir do `dados_input` salvo.

- [ ] **Step 1: Teste da função pura**

```typescript
// tests/proposta-prefill.test.ts
import { describe, it, expect } from 'vitest';
import { prefillFormFromDadosInput } from '../src/modules/dashboard/proposta-prefill.js';

describe('prefillFormFromDadosInput', () => {
  it('mapeia os campos do form a partir do dados_input completo', () => {
    const v = prefillFormFromDadosInput({
      nomeCliente: 'Marcelo', potenciaKwp: 8.4, valorTotalRs: 38500, fatorPerda: 0.78,
      consumoMensalKwh: 1000, tarifaRsKwh: 1.05, geracaoMensalKwh: 1080,
      modulo: { fabricante: 'Trina', modelo: 'Vertex', potenciaW: 700, quantidade: 12 },
      inversor: { fabricante: 'Sungrow', modelo: 'SG5.0RS-L', potenciaW: 5000, quantidade: 1 },
      estruturaFixacao: { tipo: 'Telha cerâmica' }, concessionaria: 'Neoenergia DF', tipoCliente: 'residencial',
    });
    expect(v.potenciaKwp).toBe(8.4);
    expect(v.valorTotalRs).toBe(38500);
    expect(v.moduloFabricante).toBe('Trina');
    expect(v.moduloQuantidade).toBe(12);
    expect(v.inversorModelo).toBe('SG5.0RS-L');
    expect(v.estruturaTipo).toBe('Telha cerâmica');
    expect(v.geracaoMensalKwh).toBe(1080);
  });
  it('campos ausentes viram string vazia (não quebra o form)', () => {
    const v = prefillFormFromDadosInput({ nomeCliente: 'X' });
    expect(v.potenciaKwp).toBe('');
    expect(v.moduloFabricante).toBe('');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/proposta-prefill.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `src/modules/dashboard/proposta-prefill.ts`**

```typescript
// src/modules/dashboard/proposta-prefill.ts
// Mapeia o dados_input salvo -> nomes dos campos (name=...) do form A4. Os name= devem
// bater EXATAMENTE com o que o POST /dashboard/propostas/novo lê em router.ts (~1525-1625):
// moduloFabricante, moduloModelo, moduloPotenciaW, moduloQuantidade, inversor*, estruturaTipo,
// estruturaMaterial, potenciaKwp, fatorPerda, consumoMensalKwh, tarifaRsKwh, geracaoMensalKwh,
// custoIluminacaoPublica, custoDisponibilidadeMensal, valorTotalRs, validadeDias, tipoCliente,
// modalidade, concessionaria, documentoCliente, enderecoCliente, telefoneCliente, emailCliente.
type V = Record<string, string | number>;
const s = (x: unknown): string | number => (x === null || x === undefined ? '' : (typeof x === 'number' ? x : String(x)));

export function prefillFormFromDadosInput(d: Record<string, any>): V {
  const m = d.modulo ?? {}; const i = d.inversor ?? {}; const e = d.estruturaFixacao ?? {};
  return {
    nomeCliente: s(d.nomeCliente), documentoCliente: s(d.documentoCliente), enderecoCliente: s(d.enderecoCliente),
    telefoneCliente: s(d.telefoneCliente), emailCliente: s(d.emailCliente),
    tipoCliente: s(d.tipoCliente), modalidade: s(d.modalidade), concessionaria: s(d.concessionaria),
    potenciaKwp: s(d.potenciaKwp), fatorPerda: s(d.fatorPerda), consumoMensalKwh: s(d.consumoMensalKwh),
    tarifaRsKwh: s(d.tarifaRsKwh), geracaoMensalKwh: s(d.geracaoMensalKwh),
    custoIluminacaoPublica: s(d.custoIluminacaoPublica), custoDisponibilidadeMensal: s(d.custoDisponibilidadeMensal),
    valorTotalRs: s(d.valorTotalRs), validadeDias: s(d.validadeDias),
    moduloFabricante: s(m.fabricante), moduloModelo: s(m.modelo), moduloPotenciaW: s(m.potenciaW), moduloQuantidade: s(m.quantidade),
    inversorFabricante: s(i.fabricante), inversorModelo: s(i.modelo), inversorPotenciaW: s(i.potenciaW), inversorQuantidade: s(i.quantidade),
    estruturaTipo: s(e.tipo), estruturaMaterial: s(e.material),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/proposta-prefill.test.ts`
Expected: PASS.

- [ ] **Step 5: `renderFormNovaProposta` aceita `valoresIniciais`** — em `proposta-form-view.ts`, adicionar ao tipo do input:

```typescript
export function renderFormNovaProposta(input: {
  lead_id: string;
  lead: Partial<ClienteDetail> | null;
  erros?: string[];
  valoresIniciais?: Record<string, string | number>; // do dados_input ao reabrir
  reabrirSlug?: string; // quando setado, é reabertura (muda action + botões)
}): string {
```

Dentro da função, criar um helper `const vi = input.valoresIniciais ?? {};` e, em CADA `<input>`/`<select>` de sistema/comercial, usar `value="${escapeHtml(vi.CAMPO ?? <default-do-lead-ou-vazio>)}"`. Ex: o input de potência vira `value="${escapeHtml(vi.potenciaKwp ?? '')}"`; selects (concessionaria, fatorPerda, tipoCliente, marcas, estrutura) marcam `selected` quando `vi.CAMPO` casar a option. Onde já existe pré-fill do lead (nome, endereço, concessionaria, tipoCliente), `vi.CAMPO` tem prioridade quando presente.

Quando `input.reabrirSlug` setado: trocar o `action` do `<form>` pra `/dashboard/propostas/${reabrirSlug}/reabrir` e trocar o único botão "Gerar proposta" por DOIS: `<button name="modo" value="atualizar">Atualizar essa</button>` e `<button name="modo" value="nova">Gerar nova versão</button>`. Mostrar aviso "📎 Estudo já anexado — mantém se você não subir fotos novas."

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/modules/dashboard/proposta-prefill.ts src/modules/dashboard/proposta-form-view.ts tests/proposta-prefill.test.ts
git commit -m "feat(dashboard): form A4 pré-preenchível a partir do dados_input (reabrir)"
```

---

## Task 4: Rotas de reabrir no dashboard

**Files:**
- Modify: `src/modules/dashboard/router.ts` (GET+POST `/propostas/:slug/reabrir`, atrás de `dashboardSessionAuth`)
- Modify: `src/modules/dashboard/proposta-form-view.ts` ou a view de detalhe — botão "Reabrir/Ajustar" linkando `/dashboard/propostas/:slug/reabrir`

A regeneração reusa `proposalAssistant.generateProposalCore` (já recebido em `options`). "atualizar" sobrescreve o slug; "nova" gera slug novo.

- [ ] **Step 1: Adicionar a rota GET (form pré-preenchido)** — em `router.ts`, na seção protegida:

```typescript
  // Reabrir proposta gerada: form A4 pré-preenchido com o dados_input salvo.
  router.get('/propostas/:slug/reabrir', async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug);
      const { prefillFormFromDadosInput } = await import('./proposta-prefill.js');
      const prop = await supabaseService.getPropostaInputBySlug(slug);
      if (!prop || !prop.dadosInput) {
        return res.status(404).type('text/html').send('<p>Proposta não encontrada ou sem dados pra reabrir.</p>');
      }
      const valoresIniciais = prefillFormFromDadosInput(prop.dadosInput as Record<string, any>);
      res.type('text/html').send(renderFormNovaProposta({
        lead_id: '', lead: null, valoresIniciais, reabrirSlug: slug,
      }));
    } catch (err) {
      res.status(500).type('text/html').send(`<p>Erro: ${escapeHtmlSimple((err as Error).message)}</p>`);
    }
  });
```

- [ ] **Step 2: Adicionar a rota POST** — reaproveita o MESMO parsing/validação/`data`-build do handler `POST /propostas/novo` (router.ts ~1520-1670). Extraia esse miolo (parse do body + attachments + montar `data` + tipo) numa função local `parseFormProposta(req)` que devolve `{ data, attachments, tipo, erros }` e use nos DOIS handlers (novo e reabrir) — DRY. Então:

```typescript
  router.post('/propostas/:slug/reabrir', upload.fields([{ name: 'foto1' }, { name: 'foto2' }, { name: 'foto3' }, { name: 'video' }]), async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug);
      const modo = String(req.body?.modo ?? 'atualizar'); // 'atualizar' | 'nova'
      const parsed = parseFormProposta(req); // { data, attachments, tipo, erros }
      if (parsed.erros.length) {
        return res.status(400).type('text/html').send(renderFormNovaProposta({ lead_id: '', lead: null, erros: parsed.erros, reabrirSlug: slug, valoresIniciais: prefillFromBody(req.body) }));
      }
      if (modo === 'nova') {
        const result = await options.proposalAssistant!.generateProposalCore({ data: parsed.data, modoEnvio: 'junior_envia', tipo: parsed.tipo, attachments: parsed.attachments.length ? parsed.attachments : undefined });
        return res.redirect(303, `/dashboard/propostas/${result.slug}/preview?lead_id=`);
      }
      // modo 'atualizar': regenera e sobrescreve o MESMO slug (html + dados_input).
      const result = await options.proposalAssistant!.regenerarPropostaNoSlug(slug, { data: parsed.data, tipo: parsed.tipo, attachments: parsed.attachments });
      return res.redirect(303, `/dashboard/propostas/${slug}/preview?lead_id=`);
    } catch (err) {
      res.status(500).type('text/html').send(`<p>Erro ao reabrir: ${escapeHtmlSimple((err as Error).message)}</p>`);
    }
  });
```

- [ ] **Step 3: Adicionar `regenerarPropostaNoSlug` no ProposalAssistant** — método que gera o HTML (sem criar registro novo) e chama `updatePropostaPublica(slug, { htmlContent, dadosInput })`. Reusa o pipeline de render do `generateProposalCore` mas sem o `savePropostaPublica`/slug novo. Implementar como um modo do core: adicionar param opcional `reopenSlug?: string` em `GenerateProposalCoreInput`; quando setado, no fim, em vez de `savePropostaPublica`, chamar `updatePropostaPublica(reopenSlug, { htmlContent: html, dadosInput: dadosInputMinimo })` e retornar `{ slug: reopenSlug, ... }`. Reusa o estudo: quando `attachments` vazio e for reopen, NÃO reprocessa anexos (mantém o html antigo do estudo? — ver NOTA abaixo).

> NOTA (parte delicada — fotos): no modo `atualizar` sem novas fotos, o `estudoPersonalizado` precisa ser reusado. Como o core re-renderiza o HTML do zero, e o `estudoPersonalizado` vem de `processarAnexosFromBuffer(attachments)`, sem attachments ele sai vazio. Duas opções pro engenheiro decidir no momento: (a) ler o `estudoPersonalizado` do `proposalData` salvo e re-injetar; ou (b) só permitir "atualizar" mantendo as fotos se o Junior reanexar (e avisar isso no form). Recomendado (a) se o `estudoPersonalizado` estiver recuperável do dados_input/proposalData; senão (b) como fallback honesto. Escrever um teste que cubra a opção escolhida.

- [ ] **Step 4: Botão "Reabrir/Ajustar"** na página de detalhe da proposta (onde já tem preview/enviar) — adicionar:

```html
<a href="/dashboard/propostas/${escapeHtml(slug)}/reabrir" class="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm">✏️ Reabrir / Ajustar</a>
```

- [ ] **Step 5: Teste manual + typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (Teste end-to-end da rota é manual no dashboard; cubra `regenerarPropostaNoSlug`/`montarDadosInputCompleto` com unit tests.)

- [ ] **Step 6: Commit**

```bash
git add src/modules/dashboard/router.ts src/modules/dashboard/proposta-form-view.ts src/modules/proposal-assistant.ts
git commit -m "feat(dashboard): reabrir proposta (atualizar mesmo slug vs nova versao)"
```

---

## Task 5: Rascunho no zap (continuar o atual)

**Files:**
- Create: `src/modules/proposal/rascunho.ts`
- Modify: `src/modules/proposal-assistant.ts` (método `handleRascunho`) + `src/index.ts` (trigger `rascunho`)
- Test: `tests/proposta-rascunho.test.ts` (novo)

- [ ] **Step 1: Teste da função pura**

```typescript
// tests/proposta-rascunho.test.ts
import { describe, it, expect } from 'vitest';
import { resumirRascunho } from '../src/modules/proposal/rascunho.js';

describe('resumirRascunho', () => {
  it('em andamento: extrai nome do cliente e o que falta do último turno do Claude', () => {
    const history = [
      { role: 'assistant', content: JSON.stringify({ action: 'ask_more', data: { nomeCliente: 'João' }, missing: ['valorTotalRs', 'inversor'] }) },
    ];
    const r = resumirRascunho({ modoEnvio: 'junior_envia', tipo: 'basica', geracaoConcluida: false }, history as any);
    expect(r.emAndamento).toBe(true);
    expect(r.nomeCliente).toBe('João');
    expect(r.faltando).toEqual(['valorTotalRs', 'inversor']);
  });
  it('já gerada: não é rascunho', () => {
    const r = resumirRascunho({ geracaoConcluida: true } as any, []);
    expect(r.emAndamento).toBe(false);
  });
  it('sem histórico: não em andamento', () => {
    const r = resumirRascunho({} as any, []);
    expect(r.emAndamento).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/proposta-rascunho.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `src/modules/proposal/rascunho.ts`**

```typescript
// src/modules/proposal/rascunho.ts
// Resume o rascunho de proposta em andamento a partir da sessão (state) + histórico.
// "Em andamento" = tem histórico de conversa E ainda não gerou (geracaoConcluida != true).
export interface ResumoRascunho {
  emAndamento: boolean;
  nomeCliente?: string;
  faltando: string[];
}
export function resumirRascunho(
  state: { geracaoConcluida?: boolean; modoEnvio?: string; tipo?: string },
  history: Array<{ role: string; content: string }>,
): ResumoRascunho {
  if (state?.geracaoConcluida) return { emAndamento: false, faltando: [] };
  if (!history || history.length === 0) return { emAndamento: false, faltando: [] };
  // Último turno do assistente com JSON: pega nomeCliente + missing.
  let nomeCliente: string | undefined;
  let faltando: string[] = [];
  for (let k = history.length - 1; k >= 0; k--) {
    if (history[k].role !== 'assistant') continue;
    try {
      const j = JSON.parse((history[k].content.match(/\{[\s\S]*\}/) ?? [history[k].content])[0]);
      if (j?.data?.nomeCliente && !nomeCliente) nomeCliente = String(j.data.nomeCliente);
      if (Array.isArray(j?.missing) && faltando.length === 0) faltando = j.missing.map(String);
      if (nomeCliente && faltando.length) break;
    } catch { /* turno sem JSON, ignora */ }
  }
  return { emAndamento: true, nomeCliente, faltando };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/proposta-rascunho.test.ts`
Expected: PASS.

- [ ] **Step 5: Handler no ProposalAssistant** — método público `handleRascunho(phone): Promise<string>` que carrega state+history do Redis, chama `resumirRascunho`, e devolve a mensagem (e manda botões via metaService quando em andamento). Sem proposta: "Você não tem nenhuma proposta em andamento. Manda `menu` ou `/proposta` pra começar." Em andamento: texto + botões `[prop:continuar]` `[prop:cancelar]`. Tratar `prop:continuar` no `btnMatch` de `processProposalMessage` (re-mostra "Beleza, manda os dados que faltam: <faltando>"). `prop:cancelar` já existe (exitProposalMode).

- [ ] **Step 6: Trigger no index.ts** — adicionar `rascunho` (palavra pura, sem `/`, igual `menu`) só pra admin, roteando pra `proposalAssistant.handleRascunho(from)`. Seguir o padrão do gate `tryHandleProposalCommand`.

- [ ] **Step 7: Typecheck + testes**

Run: `npx tsc --noEmit && npx vitest run tests/proposta-rascunho.test.ts`
Expected: tsc 0; PASS.

- [ ] **Step 8: Commit**

```bash
git add src/modules/proposal/rascunho.ts src/modules/proposal-assistant.ts src/index.ts tests/proposta-rascunho.test.ts
git commit -m "feat(proposal): comando 'rascunho' pra continuar proposta em andamento no zap"
```

---

## Self-Review (feito)

- **Cobertura do spec:** Fundação→Task 2; (A) reabrir→Tasks 1,3,4; (B) rascunho→Task 5. KPIs preservados→Task 2 (`investimento.total`). ✓
- **Parte delicada (fotos no reabrir):** sinalizada na Task 4 Step 3 com 2 opções e exigência de teste. O engenheiro decide com o código na frente. ✓
- **Type consistency:** `getPropostaInputBySlug`/`updatePropostaPublica` (Task 1) usados na Task 4; `prefillFormFromDadosInput` (Task 3) usado na Task 4; `montarDadosInputCompleto` (Task 2) reusado em `regenerarPropostaNoSlug` (Task 4). ✓
- **DRY:** Task 4 Step 2 manda extrair `parseFormProposta` do handler `novo` existente pra reusar nos dois (novo + reabrir). ✓
```
