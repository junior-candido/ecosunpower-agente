# Gestão de Proprietário das Usinas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir vincular, trocar e desvincular o proprietário (cliente) de uma usina pela tela da usina e pela página de Clientes, com seletor autocomplete (cliente existente) + criar novo.

**Architecture:** Reaproveita o vínculo já existente `sistemas_clientes.lead_id → leads.id`. Lógica pura isolada em `src/modules/dashboard/proprietario.ts` (busca, parse de input, fragmento de seletor reutilizável). Métodos novos no `SupabaseService`/`MonitoringService` para busca de clientes e vinculação a cliente existente. UI montada nos renders já existentes (editar usina, detalhe usina, modal de órfãs).

**Tech Stack:** TypeScript (ESM, imports com `.js`), Express router, Supabase JS, Vitest. Front-end: HTML string + Tailwind classes + JS vanilla inline (padrão atual do dashboard).

---

## File Structure

- **Create** `src/modules/dashboard/proprietario.ts` — helpers puros: `buildClienteSearchFilter()`, `parseProprietarioInput()`, `renderClienteSelector()`.
- **Create** `tests/proprietario.test.ts` — testes dos helpers puros.
- **Modify** `src/modules/supabase.ts` — `searchClientesParaVinculo()` + `vincularClienteExistente()`.
- **Modify** `src/modules/monitoring/service.ts` — `atualizarSistema()` aceita `lead_id`.
- **Modify** `src/modules/dashboard/views.ts` — seção Proprietário no `renderEditarSistemaPage()`; dono no `renderDetalheSistemaPage()`.
- **Modify** `src/modules/dashboard/router.ts` — rota de busca; POST editar trata `lead_id`/desvincular; rota vincular-existente.
- **Modify** `src/modules/dashboard/clientes-views.ts` — toggle "existente | criar novo" no modal.

> **Convenção de imports:** este projeto é ESM — imports relativos terminam em `.js` mesmo apontando para arquivos `.ts` (ex.: `from './proprietario.js'`). Siga isso em todo código novo.

---

## Task 1: Helper puro — filtro de busca de clientes

**Files:**
- Create: `src/modules/dashboard/proprietario.ts`
- Test: `tests/proprietario.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/proprietario.test.ts
import { describe, it, expect } from 'vitest';
import { buildClienteSearchFilter } from '../src/modules/dashboard/proprietario.js';

describe('buildClienteSearchFilter', () => {
  it('retorna inválido para termo com menos de 2 chars', () => {
    expect(buildClienteSearchFilter('a').valid).toBe(false);
    expect(buildClienteSearchFilter('  ').valid).toBe(false);
  });

  it('busca por nome (ilike) com termo textual', () => {
    const r = buildClienteSearchFilter('João');
    expect(r.valid).toBe(true);
    expect(r.or).toContain('name.ilike.%João%');
  });

  it('adiciona busca por telefone quando há >=3 dígitos', () => {
    const r = buildClienteSearchFilter('5561999');
    expect(r.valid).toBe(true);
    expect(r.or).toContain('name.ilike.%5561999%');
    expect(r.or).toContain('phone.ilike.%5561999%');
  });

  it('normaliza dígitos do telefone (ignora pontuação)', () => {
    const r = buildClienteSearchFilter('(61) 99999-0000');
    expect(r.or).toContain('phone.ilike.%61999990000%');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/proprietario.test.ts`
Expected: FAIL — `buildClienteSearchFilter is not a function` / módulo não encontrado.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/modules/dashboard/proprietario.ts

export interface ClienteSearchFilter {
  valid: boolean;
  /** termo normalizado para name.ilike */
  termo: string;
  /** cláusula pronta pro .or() do supabase */
  or: string;
}

/**
 * Constrói o filtro de busca de clientes (leads) por nome OU telefone.
 * Sanitiza o termo e exige no mínimo 2 chars. Quando há >=3 dígitos,
 * adiciona busca por telefone com os dígitos normalizados.
 */
export function buildClienteSearchFilter(raw: string): ClienteSearchFilter {
  const termo = String(raw ?? '').trim();
  if (termo.length < 2) return { valid: false, termo, or: '' };
  const digits = termo.replace(/\D/g, '');
  const clauses = [`name.ilike.%${termo}%`];
  if (digits.length >= 3) clauses.push(`phone.ilike.%${digits}%`);
  return { valid: true, termo, or: clauses.join(',') };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/proprietario.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/proprietario.ts tests/proprietario.test.ts
git commit -m "feat(dashboard): helper de busca de clientes pra vínculo de proprietário"
```

---

## Task 2: Helper puro — parse do input de proprietário

**Files:**
- Modify: `src/modules/dashboard/proprietario.ts`
- Test: `tests/proprietario.test.ts`

Interpreta os campos do form de editar usina referentes ao proprietário. Três intenções: **manter** (não mexe), **vincular/trocar** (UUID válido) e **desvincular** (flag explícita → null).

- [ ] **Step 1: Write the failing test**

```typescript
// adicionar em tests/proprietario.test.ts
import { parseProprietarioInput } from '../src/modules/dashboard/proprietario.js';

describe('parseProprietarioInput', () => {
  const uuid = '11111111-1111-1111-1111-111111111111';

  it('intenção "manter" quando não vem nada relevante', () => {
    expect(parseProprietarioInput({})).toEqual({ acao: 'manter' });
    expect(parseProprietarioInput({ lead_id: '' })).toEqual({ acao: 'manter' });
  });

  it('intenção "desvincular" quando flag desvincular=1', () => {
    expect(parseProprietarioInput({ desvincular: '1' })).toEqual({ acao: 'desvincular' });
  });

  it('intenção "vincular" com UUID válido', () => {
    expect(parseProprietarioInput({ lead_id: uuid })).toEqual({ acao: 'vincular', lead_id: uuid });
  });

  it('erro quando lead_id não é UUID', () => {
    const r = parseProprietarioInput({ lead_id: 'abc' });
    expect(r.acao).toBe('erro');
  });

  it('desvincular tem prioridade sobre lead_id preenchido', () => {
    expect(parseProprietarioInput({ desvincular: '1', lead_id: uuid })).toEqual({ acao: 'desvincular' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/proprietario.test.ts`
Expected: FAIL — `parseProprietarioInput is not a function`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// adicionar em src/modules/dashboard/proprietario.ts

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type ProprietarioAcao =
  | { acao: 'manter' }
  | { acao: 'desvincular' }
  | { acao: 'vincular'; lead_id: string }
  | { acao: 'erro'; motivo: string };

/**
 * Interpreta os campos do form de editar usina ligados ao proprietário.
 * - desvincular=1            -> { acao: 'desvincular' }   (prioridade máxima)
 * - lead_id = UUID válido    -> { acao: 'vincular', lead_id }
 * - lead_id vazio/ausente    -> { acao: 'manter' }
 * - lead_id presente inválido-> { acao: 'erro' }
 */
export function parseProprietarioInput(body: Record<string, unknown>): ProprietarioAcao {
  if (String(body?.desvincular ?? '') === '1') return { acao: 'desvincular' };
  const raw = String(body?.lead_id ?? '').trim();
  if (raw === '') return { acao: 'manter' };
  if (!UUID_RE.test(raw)) return { acao: 'erro', motivo: 'lead_id inválido' };
  return { acao: 'vincular', lead_id: raw };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/proprietario.test.ts`
Expected: PASS (todos, incluindo Task 1).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/proprietario.ts tests/proprietario.test.ts
git commit -m "feat(dashboard): parse de intenção de proprietário (vincular/trocar/desvincular)"
```

---

## Task 3: Fragmento de seletor de cliente reutilizável

**Files:**
- Modify: `src/modules/dashboard/proprietario.ts`
- Test: `tests/proprietario.test.ts`

Gera o HTML+JS do seletor (autocomplete + criar novo), parametrizável por tema (claro/escuro) e por `idPrefix` (pra coexistir 2 instâncias na mesma página sem colidir IDs).

- [ ] **Step 1: Write the failing test**

```typescript
// adicionar em tests/proprietario.test.ts
import { renderClienteSelector } from '../src/modules/dashboard/proprietario.js';

describe('renderClienteSelector', () => {
  it('inclui input de busca apontando pra API de search', () => {
    const html = renderClienteSelector({ idPrefix: 'sel', dark: false });
    expect(html).toContain('/dashboard/api/clientes/search');
    expect(html).toContain('id="sel-busca"');
    expect(html).toContain('name="lead_id"');
  });

  it('inclui bloco de criar novo (nome + telefone)', () => {
    const html = renderClienteSelector({ idPrefix: 'sel', dark: false });
    expect(html).toContain('name="novo_name"');
    expect(html).toContain('name="novo_phone"');
  });

  it('idPrefix isola os ids entre instâncias', () => {
    const a = renderClienteSelector({ idPrefix: 'aaa', dark: true });
    const b = renderClienteSelector({ idPrefix: 'bbb', dark: true });
    expect(a).toContain('id="aaa-busca"');
    expect(b).toContain('id="bbb-busca"');
    expect(a).not.toContain('bbb-busca');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/proprietario.test.ts`
Expected: FAIL — `renderClienteSelector is not a function`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// adicionar em src/modules/dashboard/proprietario.ts

export interface ClienteSelectorOpts {
  /** prefixo único pros ids/funções (permite 2 seletores na mesma página) */
  idPrefix: string;
  /** tema escuro (página Clientes) ou claro (editar usina) */
  dark: boolean;
  /** rótulo do botão de submit do form pai, se houver (apenas informativo) */
}

/**
 * Seletor de cliente reutilizável: autocomplete por nome/telefone +
 * bloco "criar novo" (nome + telefone). Não inclui <form> nem botão submit —
 * é embutido dentro do form do contexto (editar usina ou modal de órfã).
 *
 * Campos que envia ao backend:
 *   - lead_id   (hidden) preenchido ao escolher um cliente existente
 *   - novo_name / novo_phone (criar novo) — backend usa se lead_id vazio
 */
export function renderClienteSelector(opts: ClienteSelectorOpts): string {
  const p = opts.idPrefix;
  const inputCls = opts.dark
    ? 'w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm'
    : 'w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-sky-500 text-sm';
  const dropCls = opts.dark
    ? 'absolute z-10 left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded shadow-lg max-h-56 overflow-auto hidden'
    : 'absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded shadow-lg max-h-56 overflow-auto hidden';
  const itemCls = opts.dark
    ? 'px-3 py-2 text-sm text-slate-100 hover:bg-slate-700 cursor-pointer'
    : 'px-3 py-2 text-sm text-slate-800 hover:bg-slate-100 cursor-pointer';
  const mutedCls = opts.dark ? 'text-xs text-slate-400' : 'text-xs text-slate-500';

  return `
    <div class="space-y-2">
      <input type="hidden" name="lead_id" id="${p}-lead-id">
      <div class="relative">
        <input id="${p}-busca" type="text" autocomplete="off" placeholder="Buscar cliente por nome ou telefone…" class="${inputCls}">
        <div id="${p}-drop" class="${dropCls}"></div>
      </div>
      <div id="${p}-escolhido" class="hidden ${mutedCls}"></div>

      <details id="${p}-novo-wrap" class="mt-1">
        <summary class="${mutedCls} cursor-pointer select-none">+ Criar novo cliente</summary>
        <div class="mt-2 space-y-2">
          <input name="novo_name" placeholder="Nome completo" class="${inputCls}">
          <input name="novo_phone" placeholder="WhatsApp (ex: 5561999990000)" class="${inputCls}">
          <p class="${mutedCls}">Use só se o cliente ainda não existe. Telefone com DDI 55, sem +.</p>
        </div>
      </details>
    </div>

    <script>
    (function(){
      var busca = document.getElementById('${p}-busca');
      var drop = document.getElementById('${p}-drop');
      var hidden = document.getElementById('${p}-lead-id');
      var escolhido = document.getElementById('${p}-escolhido');
      var t = null;
      function limpaEscolha(){ hidden.value=''; escolhido.classList.add('hidden'); escolhido.textContent=''; }
      busca.addEventListener('input', function(){
        limpaEscolha();
        var q = busca.value.trim();
        if (t) clearTimeout(t);
        if (q.length < 2){ drop.classList.add('hidden'); drop.innerHTML=''; return; }
        t = setTimeout(function(){
          fetch('/dashboard/api/clientes/search?q='+encodeURIComponent(q))
            .then(function(r){ return r.json(); })
            .then(function(rows){
              if (!rows || !rows.length){ drop.innerHTML='<div class="${itemCls}">Nenhum cliente encontrado</div>'; drop.classList.remove('hidden'); return; }
              drop.innerHTML = rows.map(function(c){
                var sub = [c.phone, c.city].filter(Boolean).join(' · ');
                return '<div class="${itemCls}" data-id="'+c.id+'" data-label="'+(c.name||'')+'">'+
                  '<div class="font-semibold">'+(c.name||'(sem nome)')+'</div>'+
                  '<div class="opacity-70">'+sub+'</div></div>';
              }).join('');
              drop.classList.remove('hidden');
              Array.prototype.forEach.call(drop.querySelectorAll('[data-id]'), function(el){
                el.addEventListener('click', function(){
                  hidden.value = el.getAttribute('data-id');
                  busca.value = el.getAttribute('data-label');
                  escolhido.textContent = '✓ Vinculando a: '+el.getAttribute('data-label');
                  escolhido.classList.remove('hidden');
                  drop.classList.add('hidden');
                });
              });
            })
            .catch(function(){ drop.classList.add('hidden'); });
        }, 250);
      });
      document.addEventListener('click', function(e){
        if (!drop.contains(e.target) && e.target !== busca) drop.classList.add('hidden');
      });
    })();
    </script>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/proprietario.test.ts`
Expected: PASS (todos os describes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/proprietario.ts tests/proprietario.test.ts
git commit -m "feat(dashboard): seletor de cliente reutilizável (autocomplete + criar novo)"
```

---

## Task 4: Backend — busca de clientes + vincular a cliente existente (SupabaseService)

**Files:**
- Modify: `src/modules/supabase.ts` (logo após `vincularNovoLeadAoSistema()`, ~L1343)

Métodos novos. São glue de I/O (Supabase) — verificados por build + smoke manual na Task 8. A lógica testável (filtro/parse) já foi coberta nas Tasks 1-2.

- [ ] **Step 1: Adicionar `searchClientesParaVinculo()`**

Inserir após o fim de `vincularNovoLeadAoSistema()` (linha ~1343), antes de `criarLeadAvulso()`:

```typescript
  // Busca clientes (leads) por nome OU telefone pra vincular como proprietário.
  // Exclui inativos (arquivados). Retorna no máximo `limit` resultados.
  async searchClientesParaVinculo(
    rawTerm: string,
    limit = 10,
  ): Promise<Array<{ id: string; name: string | null; phone: string | null; city: string | null }>> {
    const { buildClienteSearchFilter } = await import('./dashboard/proprietario.js');
    const f = buildClienteSearchFilter(rawTerm);
    if (!f.valid) return [];
    const { data, error } = await this.client
      .from('leads')
      .select('id, name, phone, city')
      .or(f.or)
      .neq('status', 'inativo')
      .order('name', { ascending: true })
      .limit(limit);
    if (error) {
      console.error('[supabase] searchClientesParaVinculo:', error.message);
      return [];
    }
    return data ?? [];
  }

  // Vincula um sistema a um cliente JÁ EXISTENTE. Não altera nenhum dado do
  // cliente (status, installed_at, etc.) — só seta sistemas_clientes.lead_id.
  async vincularClienteExistente(input: {
    sistema_id: string;
    lead_id: string;
  }): Promise<{ ok: boolean; error?: string }> {
    // valida sistema
    const { data: sistema, error: sErr } = await this.client
      .from('sistemas_clientes')
      .select('id')
      .eq('id', input.sistema_id)
      .single();
    if (sErr || !sistema) return { ok: false, error: 'Sistema não encontrado' };
    // valida lead
    const { data: lead, error: lErr } = await this.client
      .from('leads')
      .select('id')
      .eq('id', input.lead_id)
      .single();
    if (lErr || !lead) return { ok: false, error: 'Cliente não encontrado' };
    // vincula
    const { error: vErr } = await this.client
      .from('sistemas_clientes')
      .update({ lead_id: input.lead_id, updated_at: new Date().toISOString() })
      .eq('id', input.sistema_id);
    if (vErr) return { ok: false, error: vErr.message };
    return { ok: true };
  }
```

- [ ] **Step 2: Verificar build/types**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/modules/supabase.ts
git commit -m "feat(supabase): searchClientesParaVinculo + vincularClienteExistente"
```

---

## Task 5: Backend — `atualizarSistema()` aceita `lead_id`

**Files:**
- Modify: `src/modules/monitoring/service.ts:449-490`
- Test: `tests/proprietario-service.test.ts` (novo)

Adiciona `lead_id` (UUID | null) à allowlist. `null` = desvincular.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/proprietario-service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MonitoringService } from '../src/modules/monitoring/service.js';

function fakeSupabaseClient(captura: { update?: any }) {
  return {
    getClient: () => ({
      from: () => ({
        update: (u: any) => { captura.update = u; return { eq: () => ({ error: null }) }; },
      }),
    }),
  };
}

describe('atualizarSistema — lead_id', () => {
  it('inclui lead_id (UUID) no update quando passado', async () => {
    const cap: any = {};
    const svc = new MonitoringService(fakeSupabaseClient(cap) as any);
    const uuid = '11111111-1111-1111-1111-111111111111';
    const r = await svc.atualizarSistema('s1', { apelido: 'X', lead_id: uuid } as any);
    expect(r.ok).toBe(true);
    expect(cap.update.lead_id).toBe(uuid);
  });

  it('inclui lead_id=null no update (desvincular)', async () => {
    const cap: any = {};
    const svc = new MonitoringService(fakeSupabaseClient(cap) as any);
    const r = await svc.atualizarSistema('s1', { apelido: 'X', lead_id: null } as any);
    expect(r.ok).toBe(true);
    expect(cap.update).toHaveProperty('lead_id', null);
  });

  it('ignora campos fora da allowlist (mass-assignment)', async () => {
    const cap: any = {};
    const svc = new MonitoringService(fakeSupabaseClient(cap) as any);
    await svc.atualizarSistema('s1', { apelido: 'X', api_credentials: { hack: 1 } } as any);
    expect(cap.update).not.toHaveProperty('api_credentials');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/proprietario-service.test.ts`
Expected: FAIL no 1º teste — `cap.update.lead_id` é `undefined` (lead_id ainda não está na allowlist).

- [ ] **Step 3: Write minimal implementation**

Em `src/modules/monitoring/service.ts`, no tipo de `fields` de `atualizarSistema` (após `observacoes: string | null;`, ~L466) adicionar:

```typescript
      observacoes: string | null;
      lead_id: string | null;
```

E no array `allowed` (~L471-476) adicionar `'lead_id'`:

```typescript
    const allowed = [
      'apelido', 'potencia_kwp', 'cidade', 'uf', 'data_instalacao', 'ativo',
      'painel_marca', 'painel_modelo', 'qtd_paineis', 'inversor_modelo',
      'telhado_tipo', 'telhado_orientacao', 'telhado_inclinacao_graus',
      'sombreamento_pct', 'observacoes', 'lead_id',
    ];
```

> Nota: o loop usa `if (k in fields)`, então `lead_id: null` é incluído corretamente (a chave existe). `null` no update = desvincular.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/proprietario-service.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/service.ts tests/proprietario-service.test.ts
git commit -m "feat(monitoring): atualizarSistema aceita lead_id (vincular/desvincular)"
```

---

## Task 6: Rota de busca de clientes (API)

**Files:**
- Modify: `src/modules/dashboard/router.ts` (junto das outras rotas de monitoramento, após o POST editar ~L912)

- [ ] **Step 1: Adicionar rota GET de busca**

Inserir após o handler `router.post('/monitoramento/:id/editar', ...)` (linha ~912):

```typescript
  // Busca de clientes pra vínculo de proprietário (autocomplete).
  router.get('/api/clientes/search', async (req: Request, res: Response) => {
    const q = String(req.query.q ?? '');
    const rows = await supabaseService.searchClientesParaVinculo(q, 10);
    res.json(rows);
  });
```

- [ ] **Step 2: Verificar build**

Run: `npx tsc --noEmit`
Expected: sem erros novos (confirma que `supabaseService` está no escopo do router — já é usado em `/clientes/vincular-sistema`).

- [ ] **Step 3: Commit**

```bash
git add src/modules/dashboard/router.ts
git commit -m "feat(dashboard): rota GET /api/clientes/search pra autocomplete"
```

---

## Task 7: Seção Proprietário no Editar usina (render + POST)

**Files:**
- Modify: `src/modules/dashboard/views.ts` — `renderEditarSistemaPage()` (assinatura + nova seção)
- Modify: `src/modules/dashboard/router.ts` — GET passa o dono; POST trata proprietário

- [ ] **Step 1: Atualizar a assinatura e adicionar a seção no render**

Em `src/modules/dashboard/views.ts`, topo do arquivo, garantir o import do seletor (junto dos outros imports do módulo):

```typescript
import { renderClienteSelector } from './proprietario.js';
```

Mudar a assinatura de `renderEditarSistemaPage` (L997) pra receber o dono atual:

```typescript
export function renderEditarSistemaPage(
  s: import('../monitoring/types.js').SistemaCliente,
  dono?: { id: string; name: string | null; phone: string | null } | null,
): string {
```

Inserir a seção **logo após** a `<section>` de Identificação (após o `</section>` da linha ~1068, antes da section de Painéis ~L1070):

```typescript
      <section class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 class="font-semibold text-slate-900 mb-4">👤 Proprietário</h2>
        ${dono ? `
          <div class="flex items-center justify-between gap-3 mb-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div>
              <div class="font-semibold text-slate-800">${escapeHtml(dono.name ?? '(sem nome)')}</div>
              <div class="text-xs text-slate-500">${escapeHtml(dono.phone ?? '')}</div>
              <a href="/dashboard/clientes/${escapeHtml(dono.id)}" class="text-xs text-sky-600 hover:underline">ver cliente →</a>
            </div>
            <button type="submit" name="desvincular" value="1" class="px-3 py-1.5 rounded-lg border-2 border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold">Desvincular</button>
          </div>
          <p class="text-sm text-slate-600 mb-2">Trocar de proprietário? Busque outro cliente abaixo.</p>
        ` : `
          <p class="text-sm text-slate-600 mb-2">Esta usina ainda não tem proprietário. Vincule um cliente:</p>
        `}
        ${renderClienteSelector({ idPrefix: 'prop', dark: false })}
      </section>
` }
```

> Atenção ao ponto de inserção: o trecho acima entra **dentro** do template `body`, entre as duas sections. Não há `${...}` extra a fechar — cole o bloco HTML cru (sem as crases externas; é continuação da template string). O `}` final acima é só ilustrativo do contexto; ao colar, mantenha o HTML contínuo dentro da template literal já existente.

- [ ] **Step 2: GET editar — buscar e passar o dono**

Em `src/modules/dashboard/router.ts`, no handler `router.get('/monitoramento/:id/editar', ...)` (~L864-870), trocar a última linha:

```typescript
  router.get('/monitoramento/:id/editar', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).send('UUID invalido');
    const detalhe = await monitoringService.getDetalheSistema(id);
    if (!detalhe) return res.status(404).send('<h2>Sistema nao encontrado</h2><a href="/dashboard/monitoramento">← voltar</a>');
    const leadId = detalhe.sistema.lead_id;
    const dono = leadId ? await supabaseService.getClienteByLeadId(leadId) : null;
    res.send(renderEditarSistemaPage(detalhe.sistema, dono ? { id: dono.id, name: dono.name, phone: dono.phone } : null));
  });
```

- [ ] **Step 3: POST editar — tratar proprietário**

Em `src/modules/dashboard/router.ts`, topo do arquivo, garantir import:

```typescript
import { parseProprietarioInput } from './proprietario.js';
```

No handler `router.post('/monitoramento/:id/editar', ...)`, **antes** de montar `fields` (antes da linha ~887 `const fields = {`), resolver o proprietário:

```typescript
    // Proprietário (vincular / trocar / desvincular). Pode vir do botão
    // "Desvincular" (name=desvincular value=1) ou do seletor (lead_id UUID
    // de cliente existente, OU novo_name+novo_phone pra criar na hora).
    const prop = parseProprietarioInput(body);
    if (prop.acao === 'erro') {
      return res.status(400).send('<h2>Proprietário inválido</h2><a href="javascript:history.back()">← voltar</a>');
    }
    // criar novo cliente na hora, se preenchido e sem lead_id escolhido
    let leadIdParaVincular: string | null | undefined = undefined; // undefined = não mexe
    if (prop.acao === 'desvincular') {
      leadIdParaVincular = null;
    } else if (prop.acao === 'vincular') {
      leadIdParaVincular = prop.lead_id;
    } else {
      // 'manter' — mas pode ser criação de novo cliente
      const novoName = String(body.novo_name ?? '').trim();
      const novoPhone = String(body.novo_phone ?? '').replace(/\D/g, '');
      if (novoName.length >= 2 && novoPhone.length >= 10) {
        const novo = await supabaseService.vincularNovoLeadAoSistema({ sistema_id: id, name: novoName, phone: novoPhone });
        if (!novo.ok) {
          return res.status(500).send(`<h2>Erro ao criar cliente: ${escapeHtmlSimple(novo.error ?? '')}</h2><a href="javascript:history.back()">← voltar</a>`);
        }
        // vincularNovoLeadAoSistema já setou o lead_id; não repetir no fields
      }
    }
```

Depois, **dentro** do objeto `fields` (após `observacoes: strOuNull(body.observacoes),`, ~L902), adicionar o `lead_id` condicionalmente — mas como `fields` é objeto literal, é mais simples ajustá-lo após criado. Substituir o bloco de chamada `atualizarSistema` (~L907) por:

```typescript
    const fieldsComProp: Record<string, unknown> = { ...fields };
    if (leadIdParaVincular !== undefined) fieldsComProp.lead_id = leadIdParaVincular;
    const r = await monitoringService.atualizarSistema(id, fieldsComProp);
```

> Resultado: criar-novo usa `vincularNovoLeadAoSistema` (já seta lead_id); vincular-existente e desvincular passam por `atualizarSistema` via `lead_id`. "manter" sem criação não toca em lead_id.

- [ ] **Step 4: Verificar build + testes**

Run: `npx tsc --noEmit && npx vitest run tests/proprietario.test.ts tests/proprietario-service.test.ts`
Expected: build limpo; testes PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/views.ts src/modules/dashboard/router.ts
git commit -m "feat(dashboard): seção Proprietário no editar usina (vincular/trocar/desvincular/criar)"
```

---

## Task 8: Mostrar proprietário no detalhe da usina

**Files:**
- Modify: `src/modules/dashboard/views.ts` — `renderDetalheSistemaPage()` (assinatura + header)
- Modify: `src/modules/dashboard/router.ts` — GET detalhe passa o dono

- [ ] **Step 1: Render aceita e exibe o dono**

Em `renderDetalheSistemaPage` (L706), atualizar assinatura:

```typescript
export function renderDetalheSistemaPage(
  d: DetalheSistema,
  dono?: { id: string; name: string | null } | null,
): string {
```

No header do card (após o `<h1>` do apelido, ~L774), adicionar a linha do dono:

```typescript
            <h1 class="text-2xl font-bold text-slate-900">${escapeHtml(s.apelido)}</h1>
            <div class="text-sm mt-1">
              ${dono
                ? `<a href="/dashboard/clientes/${escapeHtml(dono.id)}" class="text-sky-600 hover:underline">👤 ${escapeHtml(dono.name ?? 'cliente')}</a>`
                : `<a href="/dashboard/monitoramento/${escapeHtml(s.id)}/editar" class="text-amber-600 hover:underline">⚠️ Sem proprietário — definir</a>`}
            </div>
```

- [ ] **Step 2: GET detalhe passa o dono**

Em `router.ts`, no handler do detalhe (onde chama `renderDetalheSistemaPage(detalhe)`, ~L856), trocar por:

```typescript
      const donoLeadId = detalhe.sistema.lead_id;
      const donoRow = donoLeadId ? await supabaseService.getClienteByLeadId(donoLeadId) : null;
      res.send(renderDetalheSistemaPage(detalhe, donoRow ? { id: donoRow.id, name: donoRow.name } : null));
```

- [ ] **Step 3: Verificar build**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add src/modules/dashboard/views.ts src/modules/dashboard/router.ts
git commit -m "feat(dashboard): exibe proprietário no detalhe da usina"
```

---

## Task 9: Toggle "cliente existente | criar novo" no modal de órfãs

**Files:**
- Modify: `src/modules/dashboard/clientes-views.ts` (modal ~L195-230)
- Modify: `src/modules/dashboard/router.ts` (rota vincular-sistema ~L1276-1290)

Hoje o modal só cria cliente novo. Adicionar o seletor reutilizável e fazer o backend aceitar `lead_id` (existente) OU `name+phone` (novo).

- [ ] **Step 1: Substituir o conteúdo do form no modal**

Em `clientes-views.ts`, no topo, garantir import:

```typescript
import { renderClienteSelector } from './proprietario.js';
```

Trocar o `<form id="form-vincular" ...>` (L199-218) por:

```typescript
        <form id="form-vincular" method="post" action="/dashboard/clientes/vincular-sistema" class="space-y-3">
          <input type="hidden" name="sistema_id" id="modal-sistema-id">
          ${renderClienteSelector({ idPrefix: 'orf', dark: true })}
          <div class="flex gap-2 pt-2">
            <button type="button" onclick="fecharVinculo()" class="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">Cancelar</button>
            <button type="submit" class="flex-1 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold">Vincular</button>
          </div>
        </form>
```

> O seletor já provê `lead_id` (existente) e `novo_name`/`novo_phone` (criar). O backend abaixo passa a aceitar ambos.

- [ ] **Step 2: Backend — rota vincular-sistema aceita existente OU novo**

Em `router.ts`, substituir o corpo de `router.post('/clientes/vincular-sistema', ...)` (~L1277-1290) por:

```typescript
  router.post('/clientes/vincular-sistema', async (req: Request, res: Response) => {
    const sistemaId = String(req.body?.sistema_id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(sistemaId)) return res.status(400).send('Sistema inválido');

    const leadId = String(req.body?.lead_id ?? '').trim();
    // Caminho 1: cliente existente escolhido no seletor
    if (/^[0-9a-f-]{36}$/i.test(leadId)) {
      const r = await supabaseService.vincularClienteExistente({ sistema_id: sistemaId, lead_id: leadId });
      if (!r.ok) return res.status(500).send(`<h2>Erro: ${escapeHtmlSimple(r.error ?? '')}</h2><a href="/dashboard/clientes">← voltar</a>`);
      return res.redirect(303, `/dashboard/clientes/${leadId}`);
    }

    // Caminho 2: criar cliente novo
    const name = String(req.body?.novo_name ?? '').trim();
    const phone = String(req.body?.novo_phone ?? '').replace(/\D/g, '');
    if (name.length < 2) return res.status(400).send('Escolha um cliente existente ou preencha nome (mín 2 chars)');
    if (phone.length < 10) return res.status(400).send('Telefone inválido — use formato 5561999990000');
    const r = await supabaseService.vincularNovoLeadAoSistema({ sistema_id: sistemaId, name, phone });
    if (!r.ok) return res.status(500).send(`<h2>Erro: ${escapeHtmlSimple(r.error ?? '')}</h2><a href="/dashboard/clientes">← voltar</a>`);
    res.redirect(303, `/dashboard/clientes/${r.lead_id}`);
  });
```

- [ ] **Step 3: Verificar build + suite completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: build limpo; toda a suíte PASS (incluindo `clientes-queries.test.ts` — zero regressão).

- [ ] **Step 4: Commit**

```bash
git add src/modules/dashboard/clientes-views.ts src/modules/dashboard/router.ts
git commit -m "feat(dashboard): modal de órfãs aceita cliente existente (toggle) ou criar novo"
```

---

## Task 10: Verificação manual (smoke) + fechamento

**Files:** nenhum (verificação).

- [ ] **Step 1: Subir local e validar fluxos**

Run: `npm run build && npm start` (ou o script de dev do projeto; confirmar em `package.json`).

Validar no navegador (dashboard local):
1. **Editar usina órfã** → seção Proprietário aparece → buscar cliente existente → salvar → dono fica vinculado.
2. **Editar usina com dono** → trocar pra outro cliente → salva e troca.
3. **Desvincular** → usina volta a aparecer nos cards de órfãs em `/dashboard/clientes`.
4. **Criar novo na hora** (editar usina, sem escolher existente, preenchendo nome+telefone) → cria e vincula.
5. **Detalhe da usina** → mostra o dono (ou aviso "definir") com link.
6. **Página Clientes** → card de órfã → modal → toggle existente funciona; criar novo continua funcionando.
7. **Autocomplete** → digitar nome e telefone retorna resultados; <2 chars não busca.

- [ ] **Step 2: Rodar code review**

Conforme padrão do projeto, rodar review antes de finalizar (`/code-review`). Endereçar achados.

- [ ] **Step 3: Decisão de merge/deploy**

Não pushar sem autorização explícita do Junior. Apresentar resumo + pedir "manda push" antes de qualquer `git push` / Implantar no Easypanel. (Nenhuma migration nova é necessária — `lead_id` já existe.)

---

## Self-Review (preenchido)

**Spec coverage:**
- Seletor reutilizável (autocomplete + criar novo) → Tasks 1, 3.
- API de busca por nome/telefone → Tasks 1, 4, 6.
- Seção Proprietário no editar (vincular/trocar/desvincular) → Tasks 2, 5, 7.
- Vincular a cliente existente na página Clientes → Tasks 4, 9.
- Mostrar dono no detalhe da usina → Task 8.
- Regra "vincular existente não altera dados do cliente" → Task 4 (`vincularClienteExistente` só seta lead_id).
- Regra "criar novo mantém comportamento atual (operando)" → reaproveita `vincularNovoLeadAoSistema` (Tasks 7, 9).
- Testes TDD → Tasks 1, 2, 3, 5 (+ suíte completa na Task 9).
- Sem migration (lead_id já existe) → confirmado na Task 10.

**Placeholder scan:** sem TBD/TODO; todo passo tem código ou comando concreto.

**Type consistency:** `buildClienteSearchFilter`, `parseProprietarioInput`, `renderClienteSelector`, `searchClientesParaVinculo`, `vincularClienteExistente`, `atualizarSistema(lead_id)` usados com nomes idênticos entre tasks. `renderEditarSistemaPage`/`renderDetalheSistemaPage` recebem `dono` com shapes coerentes (`{id,name,phone}` / `{id,name}`).
