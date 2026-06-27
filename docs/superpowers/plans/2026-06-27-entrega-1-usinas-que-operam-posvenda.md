# Entrega 1 — Usinas que já operam → Pós-venda (+ casar com cliente) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer as usinas que já operam (importadas do monitoramento, hoje sem cliente vinculado) aparecerem no Pós-venda ligadas ao cliente certo, e sumirem da coluna "Projeto" do kanban de obras.

**Architecture:** Reusa a ficha única (`sistemas_clientes`). Adiciona um estado terminal `etapa_obra='pos_venda'` — como ele não está em `ETAPAS_USINA`, o kanban (`agruparUsinasPorEtapaObra`) o ignora e a usina some do kanban. O Pós-venda (`listarClientesPosVenda`) já lista qualquer usina `ativo + lead_id NOT NULL`, então basta preencher `lead_id`. O casamento usina↔cliente é por nome (apelido do painel ↔ nome do lead), automático mas com tela de revisão/confirmação antes de aplicar.

**Tech Stack:** TypeScript ESM (imports terminam em `.js`), Supabase/Postgres, Express server-rendered + Tailwind via CDN, vitest.

> ⚠️ **Antes de começar:** confirmar no grupo do WhatsApp o número da migration (este plano assume **062**). E esta entrega é raia do **dashboard/CRM (Junior)** — exceto a Task 6 (importador), que toca `monitoring/`.

---

## File Structure

- **Create** `supabase/migrations/062_etapa_obra_pos_venda.sql` — adiciona `pos_venda` ao CHECK de `etapa_obra`.
- **Create** `src/modules/dashboard/vincular-usinas.ts` — lógica pura: normalizar nome, sugerir vínculos, sanitizar pares do form. Sem banco, sem HTML.
- **Create** `tests/vincular-usinas.test.ts` — testes da lógica pura.
- **Create** `src/modules/dashboard/vincular-usinas-views.ts` — render da tela de revisão.
- **Modify** `src/modules/dashboard/router.ts` — rotas GET (tela) e POST (aplicar vínculo).
- **Modify** `src/modules/monitoring/service.ts` — ao criar usina nova no import, tentar casar por nome e nascer em `pos_venda`.

---

## Task 1: Migration — estado `pos_venda` em `etapa_obra`

**Files:**
- Create: `supabase/migrations/062_etapa_obra_pos_venda.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Migration 062: adiciona 'pos_venda' como estado terminal de etapa_obra.
-- Usina que concluiu a obra (ou que já opera) sai do kanban e passa a ser
-- gerida na tela de Pós-venda. 'pos_venda' NÃO entra em ETAPAS_USINA, então o
-- kanban (agruparUsinasPorEtapaObra) a ignora automaticamente e ela some das
-- colunas. O Pós-venda lista por lead_id, então continua mostrando.
ALTER TABLE sistemas_clientes
  DROP CONSTRAINT IF EXISTS sistemas_clientes_etapa_obra_check;

ALTER TABLE sistemas_clientes
  ADD CONSTRAINT sistemas_clientes_etapa_obra_check
  CHECK (etapa_obra IN (
    'projeto','aprovacao','instalacao','vistoria','homologacao','operacao','pos_venda'
  ));
```

- [ ] **Step 2: Aplicar no Supabase (SQL Editor do projeto `kupnsoyymulbdzakqlqc`) ANTES do deploy**

Cole a migration no SQL Editor e rode. Esperado: `Success. No rows returned`.
Não usar o MCP do Supabase (aponta pro projeto errado/vazio).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/062_etapa_obra_pos_venda.sql
git commit -m "feat(db): migration 062 — estado pos_venda em etapa_obra"
```

---

## Task 2: Lógica pura de casamento usina↔cliente

**Files:**
- Create: `src/modules/dashboard/vincular-usinas.ts`
- Test: `tests/vincular-usinas.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```typescript
import { describe, it, expect } from 'vitest';
import { normalizarNome, sugerirVinculos, sanitizarPares } from '../src/modules/dashboard/vincular-usinas.js';

describe('normalizarNome', () => {
  it('tira acento, caixa e pontuação', () => {
    expect(normalizarNome('José da Silva')).toBe('jose da silva');
    expect(normalizarNome('  MARIA   Souza ')).toBe('maria souza');
    expect(normalizarNome('Ailson-Fernandes')).toBe('ailson fernandes');
  });
  it('string vazia ou nula vira vazio', () => {
    expect(normalizarNome('')).toBe('');
  });
});

describe('sugerirVinculos', () => {
  const leads = [
    { id: 'L1', name: 'José da Silva' },
    { id: 'L2', name: 'Maria Souza' },
  ];
  it('casa por nome igual ignorando acento/caixa', () => {
    const r = sugerirVinculos([{ id: 'U1', apelido: 'jose da silva' }], leads);
    expect(r[0]).toEqual({ usinaId: 'U1', apelido: 'jose da silva', leadSugeridoId: 'L1', leadSugeridoNome: 'José da Silva' });
  });
  it('sem match deixa sugestão nula', () => {
    const r = sugerirVinculos([{ id: 'U9', apelido: 'Usina Fazenda X' }], leads);
    expect(r[0].leadSugeridoId).toBeNull();
  });
  it('apelido nulo não casa', () => {
    const r = sugerirVinculos([{ id: 'U0', apelido: null }], leads);
    expect(r[0].leadSugeridoId).toBeNull();
  });
});

describe('sanitizarPares', () => {
  const UUID_A = '11111111-1111-1111-1111-111111111111';
  const UUID_B = '22222222-2222-2222-2222-222222222222';
  it('mantém só pares com 2 UUIDs válidos', () => {
    const r = sanitizarPares({ [UUID_A]: UUID_B, 'lixo': 'x', [UUID_B]: '' });
    expect(r).toEqual([{ usinaId: UUID_A, leadId: UUID_B }]);
  });
  it('ignora usinaId repetido (fica o primeiro)', () => {
    const r = sanitizarPares({ [UUID_A]: UUID_B });
    expect(r).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/vincular-usinas.test.ts`
Expected: FAIL — "Cannot find module '.../vincular-usinas.js'".

- [ ] **Step 3: Implementar o módulo**

```typescript
// src/modules/dashboard/vincular-usinas.ts
// Lógica pura do mutirão de vínculo usina<->cliente. Sem banco, sem HTML.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normaliza nome pra casar apelido do painel com nome do lead. */
export function normalizarNome(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // tira acento
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // pontuação/hífen viram espaço
    .trim();
}

export interface CandidatoUsina { id: string; apelido: string | null; }
export interface LeadOpcao { id: string; name: string | null; }
export interface SugestaoVinculo {
  usinaId: string;
  apelido: string | null;
  leadSugeridoId: string | null;
  leadSugeridoNome: string | null;
}

/** Pra cada usina sem cliente, sugere o lead cujo nome normalizado bate. */
export function sugerirVinculos(usinas: CandidatoUsina[], leads: LeadOpcao[]): SugestaoVinculo[] {
  const idx = new Map<string, LeadOpcao>();
  for (const l of leads) {
    const k = normalizarNome(l.name);
    if (k && !idx.has(k)) idx.set(k, l); // 1º lead vence em caso de nomes iguais
  }
  return usinas.map((u) => {
    const k = normalizarNome(u.apelido);
    const hit = k ? idx.get(k) : undefined;
    return {
      usinaId: u.id,
      apelido: u.apelido,
      leadSugeridoId: hit?.id ?? null,
      leadSugeridoNome: hit?.name ?? null,
    };
  });
}

export interface ParVinculo { usinaId: string; leadId: string; }

/** Lê o corpo do form (usinaId -> leadId) e mantém só pares com 2 UUIDs. */
export function sanitizarPares(body: Record<string, unknown>): ParVinculo[] {
  const vistos = new Set<string>();
  const out: ParVinculo[] = [];
  for (const [usinaId, leadIdRaw] of Object.entries(body)) {
    const leadId = String(leadIdRaw ?? '').trim();
    if (!UUID_RE.test(usinaId) || !UUID_RE.test(leadId)) continue;
    if (vistos.has(usinaId)) continue;
    vistos.add(usinaId);
    out.push({ usinaId, leadId });
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/vincular-usinas.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/vincular-usinas.ts tests/vincular-usinas.test.ts
git commit -m "feat(dashboard): logica pura de vinculo usina<->cliente por nome"
```

---

## Task 3: View da tela de revisão

**Files:**
- Create: `src/modules/dashboard/vincular-usinas-views.ts`
- Test: `tests/vincular-usinas-view.test.ts`

- [ ] **Step 1: Escrever um teste leve de render**

```typescript
import { describe, it, expect } from 'vitest';
import { renderVincularUsinasPage } from '../src/modules/dashboard/vincular-usinas-views.js';

describe('renderVincularUsinasPage', () => {
  it('lista os apelidos e pré-seleciona a sugestão', () => {
    const html = renderVincularUsinasPage({
      sugestoes: [{ usinaId: 'U1', apelido: 'José da Silva', leadSugeridoId: 'L1', leadSugeridoNome: 'José da Silva' }],
      leads: [{ id: 'L1', name: 'José da Silva' }, { id: 'L2', name: 'Maria Souza' }],
    });
    expect(html).toContain('José da Silva');
    expect(html).toContain('name="U1"');                  // campo por usina
    expect(html).toContain('value="L1" selected');        // sugestão pré-marcada
  });
  it('mostra aviso quando não há usinas pendentes', () => {
    const html = renderVincularUsinasPage({ sugestoes: [], leads: [] });
    expect(html).toContain('Nenhuma usina pendente');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/vincular-usinas-view.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar a view**

```typescript
// src/modules/dashboard/vincular-usinas-views.ts
// Tela do mutirão: lista usinas sem cliente, com a sugestão por nome
// pré-selecionada num <select>. O Junior confere e confirma em lote.

import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { SugestaoVinculo, LeadOpcao } from './vincular-usinas.js';

export interface VincularUsinasPageData {
  sugestoes: SugestaoVinculo[];
  leads: LeadOpcao[];
  user?: DashUser;
}

function optionsLeads(leads: LeadOpcao[], selecionado: string | null): string {
  const vazio = `<option value="">— deixar sem cliente —</option>`;
  const opts = leads.map((l) => {
    const sel = l.id === selecionado ? ' selected' : '';
    return `<option value="${escapeHtml(l.id)}"${sel}>${escapeHtml(l.name ?? '(sem nome)')}</option>`;
  });
  return vazio + opts.join('');
}

export function renderVincularUsinasPage(data: VincularUsinasPageData): string {
  if (data.sugestoes.length === 0) {
    return renderLayout({ active: 'usinas_kanban', title: 'Vincular usinas', user: data.user, body: `
      <h1 class="text-xl font-semibold mb-4">Vincular usinas ao cliente</h1>
      <p class="text-slate-500">Nenhuma usina pendente de vínculo. 🎉</p>` });
  }
  const linhas = data.sugestoes.map((s) => `
    <tr class="border-b border-slate-100">
      <td class="py-2 px-2 text-sm text-slate-800">${escapeHtml(s.apelido ?? 'Sem apelido')}</td>
      <td class="py-2 px-2">
        <select name="${escapeHtml(s.usinaId)}" class="border border-slate-300 rounded px-2 py-1 text-sm w-full">
          ${optionsLeads(data.leads, s.leadSugeridoId)}
        </select>
      </td>
    </tr>`).join('');
  return renderLayout({ active: 'usinas_kanban', title: 'Vincular usinas', user: data.user, body: `
    <h1 class="text-xl font-semibold mb-2">Vincular usinas ao cliente</h1>
    <p class="text-slate-500 text-sm mb-4">
      As usinas abaixo já operam mas não têm cliente. A sugestão (por nome) já vem marcada —
      confira, ajuste se precisar e confirme. Ao confirmar, elas vão pro <strong>Pós-venda</strong>
      e somem do kanban de obras.</p>
    <form method="post" action="/dashboard/usinas/vincular">
      <table class="w-full border border-slate-200 rounded">
        <thead><tr class="bg-slate-50 text-left text-xs text-slate-500">
          <th class="py-2 px-2">Usina (apelido)</th><th class="py-2 px-2">Cliente</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <button type="submit" class="mt-4 bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">
        Confirmar vínculos
      </button>
    </form>` });
}
```

> ℹ️ O teste da view (Step 1) não passa `user` (é opcional). A rota GET (Task 4) passa `user: req.dashUser`. O `active: 'usinas_kanban'` deixa o menu destacando a área certa.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/vincular-usinas-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/vincular-usinas-views.ts tests/vincular-usinas-view.test.ts
git commit -m "feat(dashboard): tela de revisao do vinculo usina<->cliente"
```

---

## Task 4: Rota GET — montar a tela com as usinas pendentes

**Files:**
- Modify: `src/modules/dashboard/router.ts` (perto das outras rotas `/usinas/...`, ex: depois de `/usinas/kanban` ~linha 1908)

- [ ] **Step 1: Adicionar a rota**

```typescript
  // Mutirão de vínculo: usinas ativas SEM cliente -> sugere por nome -> tela de revisão.
  router.get('/usinas/vincular', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    try {
      const companyId = req.dashUser!.companyId;
      const [usinasRes, leadsRes] = await Promise.all([
        supabase.from('sistemas_clientes')
          .select('id, apelido').eq('ativo', true).is('lead_id', null).order('apelido'),
        supabase.from('leads')
          .select('id, name').eq('company_id', companyId).order('name'),
      ]);
      if (usinasRes.error) throw new Error(usinasRes.error.message);
      if (leadsRes.error) throw new Error(leadsRes.error.message);
      const { sugerirVinculos } = await import('./vincular-usinas.js');
      const { renderVincularUsinasPage } = await import('./vincular-usinas-views.js');
      const leads = (leadsRes.data ?? []) as Array<{ id: string; name: string | null }>;
      const usinas = (usinasRes.data ?? []) as Array<{ id: string; apelido: string | null }>;
      const sugestoes = sugerirVinculos(usinas, leads);
      res.type('text/html').send(renderVincularUsinasPage({ sugestoes, leads, user: req.dashUser }));
    } catch (err) {
      console.error('[dashboard/usinas/vincular GET]', err);
      res.status(500).send(`<h2>Erro ao carregar vínculo de usinas</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos. (Confirme que `exigir`, `AuthedRequest`, `escapeHtmlSimple` já são usados no arquivo — são, nas rotas vizinhas.)

- [ ] **Step 3: Commit**

```bash
git add src/modules/dashboard/router.ts
git commit -m "feat(dashboard): rota GET /usinas/vincular (tela de mutirao)"
```

---

## Task 5: Rota POST — aplicar os vínculos (lead_id + pos_venda + audit)

**Files:**
- Modify: `src/modules/dashboard/router.ts` (logo após a rota GET da Task 4)

- [ ] **Step 1: Adicionar a rota**

```typescript
  // Aplica os vínculos confirmados: seta lead_id + manda a usina pro pos_venda
  // (some do kanban) + registra auditoria. Corpo: { <usinaId>: <leadId>, ... }.
  router.post('/usinas/vincular', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    try {
      const { sanitizarPares } = await import('./vincular-usinas.js');
      const pares = sanitizarPares((req.body ?? {}) as Record<string, unknown>);
      const viewer = req.dashUser!;
      let aplicados = 0;
      for (const { usinaId, leadId } of pares) {
        const { error } = await supabase.from('sistemas_clientes')
          .update({ lead_id: leadId, etapa_obra: 'pos_venda', etapa_obra_updated_at: new Date().toISOString() })
          .eq('id', usinaId).eq('ativo', true);
        if (error) { console.warn(`[usinas/vincular] ${usinaId} falhou: ${error.message}`); continue; }
        aplicados++;
        await audit(supabase, {
          companyId: viewer.companyId, userId: viewer.id, entidade: 'usina',
          entidadeId: usinaId, acao: 'vincular_cliente', valorNovo: leadId,
        });
      }
      console.log(`[usinas/vincular] ${aplicados}/${pares.length} usinas vinculadas + enviadas ao pos_venda`);
      res.redirect('/dashboard/usinas/vincular');
    } catch (err) {
      console.error('[dashboard/usinas/vincular POST]', err);
      res.status(500).send('erro ao aplicar vínculos');
    }
  });
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos. (`audit` já é importado/usado nas rotas vizinhas — confira o import no topo do arquivo.)

- [ ] **Step 3: Commit**

```bash
git add src/modules/dashboard/router.ts
git commit -m "feat(dashboard): rota POST /usinas/vincular (aplica + pos_venda + audit)"
```

---

## Task 6: Importador — usina nova nasce vinculada e em `pos_venda`

Daqui pra frente, quando o import de monitoramento cria uma usina nova (ela veio do painel = já está gerando), tenta casar por nome com um lead e já nasce em `pos_venda` (não em `projeto`).

**Files:**
- Modify: `src/modules/monitoring/service.ts` (o bloco `else { // Cria novo ... .insert({...})` ~linha 332-345)

- [ ] **Step 1: Antes do insert, buscar lead por nome e ajustar os campos**

Substituir o objeto do `.insert({...})` do bloco "Cria novo" por uma versão que tenta vincular. Trecho novo (dentro do `else`):

```typescript
      } else {
        // Cria novo. A usina veio do painel => já gera => nasce em pos_venda.
        // Tenta casar por nome (apelido <-> leads.name) pra já vincular o cliente.
        const { normalizarNome } = await import('../dashboard/vincular-usinas.js');
        let leadId: string | null = null;
        if (site.apelido) {
          const { data: leads } = await this.supabase.getClient()
            .from('leads').select('id, name');
          const alvo = normalizarNome(site.apelido);
          const hit = (leads ?? []).find((l: any) => normalizarNome(l.name) === alvo);
          leadId = hit?.id ?? null;
        }
        const { error } = await this.supabase.getClient()
          .from('sistemas_clientes')
          .insert({
            apelido: site.apelido,
            marca_inversor: marca,
            api_credentials: site.credenciais,
            potencia_kwp: site.potencia_kwp,
            cidade: site.cidade,
            uf: site.uf,
            data_instalacao: site.data_instalacao,
            ativo: true,
            lead_id: leadId,
            etapa_obra: 'pos_venda',
          });
        if (error) { erros++; console.warn(`[monitoring/import] insert ${marca} ${site.apelido} falhou: ${error.message}`); }
        else novos++;
      }
```

- [ ] **Step 2: Verificar tipos + rodar a suíte de monitoring**

Run: `npx tsc --noEmit`
Expected: sem erros.
Run: `npx vitest run monitoring`
Expected: verde (as 2 falhas pré-existentes de `tests/supabase-vincular-novo.test.ts` NÃO contam — CLAUDE.md).

- [ ] **Step 3: Commit**

```bash
git add src/modules/monitoring/service.ts
git commit -m "feat(monitoring): usina importada nasce vinculada por nome e em pos_venda"
```

---

## Task 7: Link de acesso à tela no kanban de obras

**Files:**
- Modify: `src/modules/dashboard/usinas-kanban-views.ts` (no cabeçalho da página `renderUsinasKanbanPage`)

- [ ] **Step 1: Adicionar um botão/link pra `/dashboard/usinas/vincular`**

No topo da página do kanban (dentro de `renderUsinasKanbanPage`, perto do título), adicionar:

```html
<a href="/dashboard/usinas/vincular"
   class="text-sm bg-amber-100 text-amber-800 px-3 py-1.5 rounded hover:bg-amber-200">
  🔗 Vincular usinas sem cliente
</a>
```

(Posicione seguindo o layout atual do cabeçalho — veja como os outros controles do kanban estão dispostos.)

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/modules/dashboard/usinas-kanban-views.ts
git commit -m "feat(dashboard): link 'vincular usinas sem cliente' no kanban"
```

---

## Verificação final (antes de abrir o PR)

- [ ] `npx tsc --noEmit` limpo.
- [ ] `npx vitest run` verde (menos as 2 falhas pré-existentes de `tests/supabase-vincular-novo.test.ts`).
- [ ] Migration 062 aplicada no Supabase (`kupnsoyymulbdzakqlqc`).
- [ ] Code review do diff (3 passadas — preferência do Junior).
- [ ] Smoke manual: abrir `/dashboard/usinas/vincular`, confirmar 1 usina, ver ela sumir do kanban e aparecer no Pós-venda.

## Fora de escopo (vai pras próximas entregas)

- Filtrar o Pós-venda por `etapa_obra='pos_venda'` (só importa quando a Entrega 2 começar a criar obras com `lead_id` em `projeto`). Hoje as obras não têm `lead_id`, então não poluem o Pós-venda.
- Gatilho do "Fechar" → entrar no fluxo (Entrega 2).
- Cancelamento/reversibilidade do fluxo (Entrega 2).
- Marca `'pendente'` pra ficha em obra sem inversor (Entrega 2/3, quando a obra nascer antes do monitoramento).
- Cron pular fichas sem credenciais (Entrega 2/3).
```
