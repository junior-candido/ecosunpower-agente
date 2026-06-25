# Ordem de Serviço técnica — peça 2b — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ordem de Serviço (`ordens_servico`) reachable por 3 portas (abrir de manutenção / nova avulsa), com checklist 3-em-1 (marca/foto/medição) por tipo, upload de fotos, conclusão que reusa `marcarManutencaoFeita` quando ligada, e laudo HTML imprimível pro cliente.

**Architecture:** Templates de checklist + progresso são puros (testáveis). Migration 059 (`ordens_servico` + `os_fotos`). Queries de I/O. Views: form da OS + laudo HTML imprimível. Fotos no bucket `client-attachments` (reusa `uploadAnexo`/`getSignedUrls`). Concluir OS ligada → mesma `marcarManutencaoFeita` da peça 2a (zero lógica duplicada).

**Tech Stack:** TypeScript ESM, Express server-rendered, multer (upload, já usado), vitest, Supabase/Postgres + Storage.

**Escopo:** peça 2b. FORA: contrato recorrente (2c), editor de templates, assinatura digital no app.

---

## File Structure
**Criar:**
- `src/modules/dashboard/os-checklist.ts` — puras: `templateChecklist`, `hidratarChecklist`, `progressoOS`, `resumoOS` + tipos.
- `src/modules/dashboard/os-queries.ts` — I/O: `criarOS`, `getOS`, `salvarOS`, `addFotoOS`, `listFotosOS`, `concluirOS`.
- `src/modules/dashboard/os-views.ts` — `renderOSPage` (form) + `renderOSLaudoHtml` (laudo imprimível).
- `supabase/migrations/059_ordens_servico.sql`.
- `tests/os-checklist.test.ts`, `tests/os-views.test.ts`.
**Modificar:**
- `router.ts` — rotas da OS.
- `manutencao-views.ts` — botões "📋 Abrir OS" (no item da agenda) + "➕ Nova OS".

---

## Tipos (Task 1)
```ts
export type OSTipo = 'limpeza' | 'revisao_inversor' | 'revisao_eletrica' | 'corretiva' | 'inspecao';
export type ItemKind = 'check' | 'foto' | 'medicao';
export interface ItemChecklist { chave: string; label: string; kind: ItemKind; unidade?: string }
export interface ItemPreenchido extends ItemChecklist { valor: boolean | string | null; fotos: number }
```

---

## Task 1: Templates de checklist (puro)

**Files:** Create `src/modules/dashboard/os-checklist.ts`; Test `tests/os-checklist.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
// tests/os-checklist.test.ts
import { describe, it, expect } from 'vitest';
import { templateChecklist } from '../src/modules/dashboard/os-checklist.js';

describe('templateChecklist', () => {
  it('revisao_inversor tem medição CA, CC e termografia', () => {
    const t = templateChecklist('revisao_inversor');
    const kinds = t.map((i) => i.kind);
    expect(kinds).toContain('medicao');
    expect(kinds).toContain('foto');
    expect(t.find((i) => i.chave === 'medicao_ca')?.kind).toBe('medicao');
    expect(t.find((i) => i.chave === 'termografia')?.kind).toBe('foto');
  });
  it('revisao_eletrica tem aperto de bornes (check) e foto do quadro', () => {
    const t = templateChecklist('revisao_eletrica');
    expect(t.find((i) => i.chave === 'aperto_bornes')?.kind).toBe('check');
    expect(t.find((i) => i.chave === 'foto_quadro')?.kind).toBe('foto');
  });
  it('limpeza tem fotos dos módulos', () => {
    expect(templateChecklist('limpeza').find((i) => i.chave === 'fotos_modulos')?.kind).toBe('foto');
  });
  it('todo item tem chave única e label não-vazio', () => {
    for (const tipo of ['limpeza', 'revisao_inversor', 'revisao_eletrica', 'corretiva', 'inspecao'] as const) {
      const t = templateChecklist(tipo);
      const chaves = t.map((i) => i.chave);
      expect(new Set(chaves).size).toBe(chaves.length);
      expect(t.every((i) => i.label.length > 0)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run → fail** — `npx vitest run tests/os-checklist.test.ts` (módulo não existe)

- [ ] **Step 3: Implement**
```ts
// src/modules/dashboard/os-checklist.ts
export type OSTipo = 'limpeza' | 'revisao_inversor' | 'revisao_eletrica' | 'corretiva' | 'inspecao';
export type ItemKind = 'check' | 'foto' | 'medicao';
export interface ItemChecklist { chave: string; label: string; kind: ItemKind; unidade?: string }
export interface ItemPreenchido extends ItemChecklist { valor: boolean | string | null; fotos: number }

const C = (chave: string, label: string): ItemChecklist => ({ chave, label, kind: 'check' });
const F = (chave: string, label: string): ItemChecklist => ({ chave, label, kind: 'foto' });
const M = (chave: string, label: string, unidade: string): ItemChecklist => ({ chave, label, kind: 'medicao', unidade });

const TEMPLATES: Record<OSTipo, ItemChecklist[]> = {
  revisao_inversor: [
    C('erros_alarmes', 'Leitura de erros/alarmes'),
    C('ventilacao', 'Ventilação/temperatura'),
    C('teste_geracao', 'Teste de geração'),
    M('medicao_ca', 'Medição CA (tensão/corrente)', 'V/A'),
    M('medicao_cc', 'Medição CC (strings)', 'V/A'),
    F('termografia', 'Termografia (pontos quentes)'),
  ],
  revisao_eletrica: [
    C('verificacao_quadro', 'Verificação do quadro elétrico'),
    C('aperto_bornes', 'Aperto dos bornes do quadro geral'),
    C('aterramento', 'Aterramento'),
    C('cabeamento', 'Cabeamento/isolação'),
    F('foto_quadro', 'Foto do quadro elétrico geral'),
    F('termografia', 'Termografia do quadro/conexões'),
  ],
  limpeza: [
    C('inspecao_visual', 'Inspeção visual dos módulos'),
    C('limpeza_placas', 'Limpeza das placas'),
    C('estruturas', 'Estado das estruturas'),
    F('fotos_modulos', 'Fotos de todos os módulos (antes/depois)'),
    M('geracao_antes_depois', 'Geração antes/depois', 'kWh'),
  ],
  corretiva: [
    C('diagnostico', 'Diagnóstico'),
    C('peca_trocada', 'Peça trocada'),
    C('teste_pos', 'Teste pós-conserto'),
    F('foto_conserto', 'Foto do problema/conserto'),
  ],
  inspecao: [
    C('visual_geral', 'Visual geral'),
    C('pendencias', 'Pendências encontradas'),
    F('fotos_modulos', 'Fotos dos módulos'),
    F('termografia', 'Termografia'),
    M('geracao', 'Geração', 'kWh'),
  ],
};

export function templateChecklist(tipo: OSTipo): ItemChecklist[] {
  return TEMPLATES[tipo] ?? [];
}
```

- [ ] **Step 4: Run → pass** — `npx vitest run tests/os-checklist.test.ts`

- [ ] **Step 5: Commit**
```bash
git add src/modules/dashboard/os-checklist.ts tests/os-checklist.test.ts
git commit -m "feat(os): templates de checklist por tipo (check/foto/medicao)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Hidratar + progresso + resumo (puros)

**Files:** Modify `os-checklist.ts`; Test `tests/os-checklist.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
// adicionar em tests/os-checklist.test.ts
import { hidratarChecklist, progressoOS, resumoOS } from '../src/modules/dashboard/os-checklist.js';

describe('hidratarChecklist', () => {
  it('sobrepõe valores salvos no template e conta fotos', () => {
    const itens = hidratarChecklist('limpeza', { limpeza_placas: true, geracao_antes_depois: '480' }, { fotos_modulos: 3 });
    expect(itens.find((i) => i.chave === 'limpeza_placas')?.valor).toBe(true);
    expect(itens.find((i) => i.chave === 'geracao_antes_depois')?.valor).toBe('480');
    expect(itens.find((i) => i.chave === 'fotos_modulos')?.fotos).toBe(3);
  });
  it('item sem valor salvo vem com valor null e fotos 0', () => {
    const itens = hidratarChecklist('limpeza', {}, {});
    expect(itens.every((i) => i.valor === null && i.fotos === 0)).toBe(true);
  });
});

describe('progressoOS', () => {
  it('conta check marcado, medição com valor e foto com ≥1', () => {
    const itens = hidratarChecklist('limpeza', { inspecao_visual: true, limpeza_placas: false, geracao_antes_depois: '480' }, { fotos_modulos: 2 });
    const p = progressoOS(itens);
    expect(p.total).toBe(5);
    expect(p.feitos).toBe(3); // inspecao_visual + geracao + fotos_modulos
    expect(p.pct).toBe(60);
  });
});

describe('resumoOS', () => {
  it('separa checks feitos e medições com valor', () => {
    const itens = hidratarChecklist('revisao_inversor', { erros_alarmes: true, medicao_ca: '220V/5A' }, {});
    const r = resumoOS(itens);
    expect(r.checks).toContain('Leitura de erros/alarmes');
    expect(r.medicoes.find((m) => m.chave === 'medicao_ca')?.valor).toBe('220V/5A');
  });
});
```

- [ ] **Step 2: Run → fail**

- [ ] **Step 3: Implement**
```ts
// adicionar em src/modules/dashboard/os-checklist.ts
export function hidratarChecklist(
  tipo: OSTipo,
  salvo: Record<string, boolean | string | null>,
  fotoCounts: Record<string, number>,
): ItemPreenchido[] {
  return templateChecklist(tipo).map((it) => ({
    ...it,
    valor: it.chave in salvo ? salvo[it.chave] : (it.kind === 'check' ? false : null),
    fotos: fotoCounts[it.chave] ?? 0,
  }));
}

function itemFeito(i: ItemPreenchido): boolean {
  if (i.kind === 'check') return i.valor === true;
  if (i.kind === 'foto') return i.fotos > 0;
  return typeof i.valor === 'string' && i.valor.trim().length > 0; // medicao
}

export function progressoOS(itens: ItemPreenchido[]): { feitos: number; total: number; pct: number } {
  const total = itens.length;
  const feitos = itens.filter(itemFeito).length;
  return { feitos, total, pct: total ? Math.round((feitos / total) * 100) : 0 };
}

export interface ResumoOS {
  checks: string[];
  medicoes: Array<{ chave: string; label: string; valor: string; unidade?: string }>;
  fotos: Array<{ chave: string; label: string; n: number }>;
}
export function resumoOS(itens: ItemPreenchido[]): ResumoOS {
  return {
    checks: itens.filter((i) => i.kind === 'check' && i.valor === true).map((i) => i.label),
    medicoes: itens.filter((i) => i.kind === 'medicao' && typeof i.valor === 'string' && i.valor.trim())
      .map((i) => ({ chave: i.chave, label: i.label, valor: String(i.valor), unidade: i.unidade })),
    fotos: itens.filter((i) => i.kind === 'foto' && i.fotos > 0).map((i) => ({ chave: i.chave, label: i.label, n: i.fotos })),
  };
}
```

- [ ] **Step 4: Run → pass**

- [ ] **Step 5: Commit**
```bash
git add src/modules/dashboard/os-checklist.ts tests/os-checklist.test.ts
git commit -m "feat(os): hidratar checklist + progresso + resumo (puros)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Migration 059

**Files:** Create `supabase/migrations/059_ordens_servico.sql`

> ⚠️ Confirmar número 059 no grupo. Aplicar ANTES do deploy.

- [ ] **Step 1: Escrever**
```sql
-- Migration 059: Ordem de Serviço técnica (peça 2b)
CREATE TABLE IF NOT EXISTS ordens_servico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema_id UUID NOT NULL REFERENCES sistemas_clientes(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  manutencao_id UUID REFERENCES manutencoes(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('limpeza','revisao_inversor','revisao_eletrica','corretiva','inspecao')),
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','concluida','cancelada')),
  checklist JSONB,           -- estado preenchido: { chave: valor } (check/medição)
  observacoes TEXT,
  executor UUID,             -- dashboard_users.id (sem FK rígida)
  aberta_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_os_sistema ON ordens_servico (sistema_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_os_abertas ON ordens_servico (aberta_em) WHERE status = 'aberta';

CREATE TABLE IF NOT EXISTS os_fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id UUID NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  item_chave TEXT,           -- a qual item do checklist a foto pertence
  storage_path TEXT NOT NULL,
  legenda TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_os_fotos_os ON os_fotos (os_id);

COMMENT ON TABLE ordens_servico IS 'Ordem de serviço técnica. manutencao_id null = avulsa. Concluir reusa marcarManutencaoFeita quando ligada.';
```

- [ ] **Step 2: Commit**
```bash
git add supabase/migrations/059_ordens_servico.sql
git commit -m "feat(os): migration 059 (ordens_servico + os_fotos)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Queries da OS

**Files:** Create `src/modules/dashboard/os-queries.ts`

I/O (tsc + smoke). Fotos reusam o bucket `client-attachments` via `uploadAnexo`/`getSignedUrls`.

- [ ] **Step 1: Implement**
```ts
// src/modules/dashboard/os-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadAnexo, getSignedUrls } from '../anexos/storage.js';
import { marcarManutencaoFeita } from './manutencao-queries.js';
import type { OSTipo } from './os-checklist.js';

export interface OSRow {
  id: string; sistema_id: string; lead_id: string | null; manutencao_id: string | null;
  tipo: OSTipo; status: string; checklist: Record<string, any> | null; observacoes: string | null;
  executor: string | null; aberta_em: string; concluida_em: string | null;
  apelido?: string; clienteNome?: string | null;
}

export async function criarOS(client: SupabaseClient, o: {
  sistemaId: string; leadId: string | null; tipo: OSTipo; manutencaoId?: string | null;
}): Promise<string> {
  const { data, error } = await client.from('ordens_servico').insert({
    sistema_id: o.sistemaId, lead_id: o.leadId, tipo: o.tipo, manutencao_id: o.manutencaoId ?? null, status: 'aberta',
  }).select('id').single();
  if (error) throw new Error(`criarOS: ${error.message}`);
  return (data as { id: string }).id;
}

// Cria OS a partir de uma manutenção agendada (portas a/b).
export async function abrirOSDeManutencao(client: SupabaseClient, manutencaoId: string): Promise<string> {
  const { data: m, error } = await client.from('manutencoes')
    .select('sistema_id, lead_id, tipo').eq('id', manutencaoId).maybeSingle();
  if (error) throw new Error(`abrirOSDeManutencao: ${error.message}`);
  if (!m) throw new Error('abrirOSDeManutencao: manutenção não encontrada');
  const row = m as any;
  return criarOS(client, { sistemaId: row.sistema_id, leadId: row.lead_id, tipo: row.tipo, manutencaoId });
}

export async function getOS(client: SupabaseClient, id: string): Promise<OSRow | null> {
  const { data, error } = await client.from('ordens_servico')
    .select('id, sistema_id, lead_id, manutencao_id, tipo, status, checklist, observacoes, executor, aberta_em, concluida_em, sistemas_clientes(apelido, leads(name))')
    .eq('id', id).maybeSingle();
  if (error) throw new Error(`getOS: ${error.message}`);
  if (!data) return null;
  const r = data as any;
  return { ...r, apelido: r.sistemas_clientes?.apelido ?? null, clienteNome: r.sistemas_clientes?.leads?.name ?? null };
}

export async function salvarOS(client: SupabaseClient, id: string, p: {
  checklist: Record<string, any>; observacoes: string;
}): Promise<void> {
  const { error } = await client.from('ordens_servico')
    .update({ checklist: p.checklist, observacoes: p.observacoes, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'aberta');
  if (error) throw new Error(`salvarOS: ${error.message}`);
}

export interface FotoOS { id: string; item_chave: string | null; storage_path: string; legenda: string | null; url?: string }
export async function listFotosOS(client: SupabaseClient, osId: string, comUrl = false): Promise<FotoOS[]> {
  const { data, error } = await client.from('os_fotos').select('id, item_chave, storage_path, legenda').eq('os_id', osId).order('created_at');
  if (error) throw new Error(`listFotosOS: ${error.message}`);
  const fotos = (data ?? []) as FotoOS[];
  if (comUrl && fotos.length) {
    const urls = await getSignedUrls(client, fotos.map((f) => f.storage_path), 3600 * 24 * 7);
    for (const f of fotos) f.url = urls[f.storage_path] ?? '#';
  }
  return fotos;
}

export async function addFotoOS(client: SupabaseClient, osId: string, p: {
  leadId: string | null; itemChave: string; buffer: Buffer; mimeType: string; ext: string; legenda?: string;
}): Promise<void> {
  // bucket de anexos do cliente; quando OS avulsa sem lead, usa o próprio osId como pasta
  const up = await uploadAnexo(client, p.leadId ?? osId, 'os', p.buffer, p.mimeType, p.ext);
  if (!up.ok || !up.storage_path) throw new Error(`addFotoOS: upload falhou (${up.error ?? '?'})`);
  const { error } = await client.from('os_fotos').insert({
    os_id: osId, item_chave: p.itemChave, storage_path: up.storage_path, legenda: p.legenda ?? null,
  });
  if (error) throw new Error(`addFotoOS: ${error.message}`);
}

// Concluir: se ligada a manutenção, reusa marcarManutencaoFeita (auto-agenda + alerta).
export async function concluirOS(client: SupabaseClient, id: string, p: { executor: string; notas: string }): Promise<{ manutencaoId: string | null }> {
  const os = await getOS(client, id);
  if (!os) throw new Error('concluirOS: OS não encontrada');
  const { error } = await client.from('ordens_servico')
    .update({ status: 'concluida', concluida_em: new Date().toISOString(), executor: p.executor, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'aberta');
  if (error) throw new Error(`concluirOS: ${error.message}`);
  if (os.manutencao_id) {
    await marcarManutencaoFeita(client, os.manutencao_id, {
      feitaEm: new Date().toISOString().slice(0, 10), feitoPor: p.executor, notas: p.notas,
    });
  }
  return { manutencaoId: os.manutencao_id };
}

// Contagem de fotos por item_chave (alimenta hidratarChecklist).
export async function fotoCountsPorItem(client: SupabaseClient, osId: string): Promise<Record<string, number>> {
  const fotos = await listFotosOS(client, osId, false);
  const out: Record<string, number> = {};
  for (const f of fotos) if (f.item_chave) out[f.item_chave] = (out[f.item_chave] ?? 0) + 1;
  return out;
}
```

- [ ] **Step 2: Build** — `npx tsc --noEmit` (sem erros novos)

- [ ] **Step 3: Commit**
```bash
git add src/modules/dashboard/os-queries.ts
git commit -m "feat(os): queries (criar/abrir/salvar/foto/concluir + reuso marcarManutencaoFeita)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: View do form da OS

**Files:** Create `src/modules/dashboard/os-views.ts`; Test `tests/os-views.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
// tests/os-views.test.ts
import { describe, it, expect } from 'vitest';
import { renderOSPage } from '../src/modules/dashboard/os-views.js';
import { hidratarChecklist } from '../src/modules/dashboard/os-checklist.js';
import type { OSRow, FotoOS } from '../src/modules/dashboard/os-queries.js';

const os = (over: Partial<OSRow> = {}): OSRow => ({
  id: 'os1', sistema_id: 's1', lead_id: 'l1', manutencao_id: 'm1', tipo: 'limpeza',
  status: 'aberta', checklist: {}, observacoes: null, executor: null,
  aberta_em: '2026-06-25T00:00:00Z', concluida_em: null, apelido: 'Casa Antônio', clienteNome: 'Antônio', ...over,
});

describe('renderOSPage', () => {
  it('mostra a usina, os itens do checklist e os 3 tipos de campo', () => {
    const itens = hidratarChecklist('limpeza', {}, {});
    const html = renderOSPage(os(), itens, [], undefined);
    expect(html).toContain('Casa Antônio');
    expect(html).toContain('Limpeza das placas');     // check
    expect(html).toContain('Fotos de todos os módulos'); // foto
    expect(html).toContain('type="file"');
  });
  it('escapa HTML do cliente', () => {
    const html = renderOSPage(os({ apelido: '<b>x</b>' }), hidratarChecklist('limpeza', {}, {}), [], undefined);
    expect(html).not.toContain('<b>x</b>');
  });
  it('OS concluída mostra estado travado (sem botão Concluir)', () => {
    const html = renderOSPage(os({ status: 'concluida' }), hidratarChecklist('limpeza', {}, {}), [], undefined);
    expect(html).toMatch(/conclu[ií]da/i);
  });
});
```

- [ ] **Step 2: Run → fail**

- [ ] **Step 3: Implement**
```ts
// src/modules/dashboard/os-views.ts
import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { OSRow, FotoOS } from './os-queries.js';
import { progressoOS, type ItemPreenchido } from './os-checklist.js';

const TIPO_LABEL: Record<string, string> = {
  limpeza: '🧹 Limpeza', revisao_inversor: '🔌 Revisão inversor',
  revisao_eletrica: '⚡ Revisão elétrica', corretiva: '🔧 Corretiva', inspecao: '🔎 Inspeção',
};

function renderItem(osId: string, i: ItemPreenchido, fotos: FotoOS[], travado: boolean): string {
  const dis = travado ? 'disabled' : '';
  if (i.kind === 'check') {
    return `<label class="flex items-center gap-2 py-1"><input type="checkbox" name="${escapeHtml(i.chave)}" ${i.valor === true ? 'checked' : ''} ${dis}> ${escapeHtml(i.label)}</label>`;
  }
  if (i.kind === 'medicao') {
    return `<label class="flex items-center gap-2 py-1">${escapeHtml(i.label)}
      <input type="text" name="${escapeHtml(i.chave)}" value="${escapeHtml(String(i.valor ?? ''))}" placeholder="${escapeHtml(i.unidade ?? '')}" class="border rounded px-2 py-0.5 text-sm" ${dis}></label>`;
  }
  // foto
  const minis = fotos.filter((f) => f.item_chave === i.chave)
    .map((f) => `<img src="${escapeHtml(f.url ?? '#')}" class="w-16 h-16 object-cover rounded border">`).join('');
  const upload = travado ? '' : `
    <form method="post" action="/dashboard/os/${escapeHtml(osId)}/foto" enctype="multipart/form-data" class="inline-flex items-center gap-1">
      <input type="hidden" name="itemChave" value="${escapeHtml(i.chave)}">
      <input type="file" name="foto" accept="image/*" class="text-xs">
      <button class="px-2 py-0.5 rounded bg-slate-700 text-white text-xs">📷 Enviar</button>
    </form>`;
  return `<div class="py-1"><div class="text-sm">${escapeHtml(i.label)} <span class="text-xs text-slate-400">(${i.fotos} foto${i.fotos === 1 ? '' : 's'})</span></div>
    <div class="flex flex-wrap gap-1 mt-1">${minis}</div>${upload}</div>`;
}

export function renderOSPage(os: OSRow, itens: ItemPreenchido[], fotos: FotoOS[], user?: DashUser): string {
  const travado = os.status !== 'aberta';
  const p = progressoOS(itens);
  const body = `
  <div class="max-w-2xl">
    <a href="/dashboard/manutencao" class="text-xs text-slate-500 hover:underline">← Manutenção</a>
    <h1 class="text-xl font-bold text-slate-900 mt-1">📋 OS — ${TIPO_LABEL[os.tipo] ?? escapeHtml(os.tipo)}</h1>
    <p class="text-sm text-slate-600">${escapeHtml(os.apelido ?? 'usina')} · ${escapeHtml(os.clienteNome ?? '')}</p>
    <p class="text-xs ${travado ? 'text-emerald-600' : 'text-slate-500'} mb-3">${travado ? '✅ OS concluída' : `Progresso: ${p.feitos}/${p.total} (${p.pct}%)`}</p>

    <form method="post" action="/dashboard/os/${escapeHtml(os.id)}/salvar" class="bg-white border rounded-xl p-4">
      ${itens.map((i) => renderItem(os.id, i, fotos, travado)).join('')}
      <label class="block text-sm mt-3">Observações
        <textarea name="observacoes" class="w-full border rounded px-2 py-1 text-sm mt-1" rows="3" ${travado ? 'disabled' : ''}>${escapeHtml(os.observacoes ?? '')}</textarea>
      </label>
      ${travado ? '' : `<div class="flex gap-2 mt-3">
        <button class="px-3 py-1.5 rounded bg-slate-600 text-white text-sm">💾 Salvar</button>
        <button formaction="/dashboard/os/${escapeHtml(os.id)}/concluir" class="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm">✅ Concluir OS</button>
      </div>`}
    </form>
    <a href="/dashboard/os/${escapeHtml(os.id)}/laudo" target="_blank" class="inline-block mt-3 px-3 py-1.5 rounded bg-violet-600 text-white text-sm">📄 Gerar laudo (PDF)</a>
  </div>`;
  return renderLayout({ active: 'manutencao', title: 'Ordem de Serviço', body, user });
}
```

> Nota: a foto faz upload por form próprio (recarrega a página). YAGNI: sem AJAX nesta peça. O "Salvar" grava checkboxes/medições/observações.

- [ ] **Step 4: Run → pass**

- [ ] **Step 5: Commit**
```bash
git add src/modules/dashboard/os-views.ts tests/os-views.test.ts
git commit -m "feat(os): tela do form da OS (checklist 3-em-1 + upload de fotos)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Laudo HTML imprimível

**Files:** Modify `os-views.ts`; Test `tests/os-views.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
// adicionar em tests/os-views.test.ts
import { renderOSLaudoHtml } from '../src/modules/dashboard/os-views.js';
import { resumoOS } from '../src/modules/dashboard/os-checklist.js';

describe('renderOSLaudoHtml', () => {
  it('é um doc HTML com a empresa, checks e medições', () => {
    const itens = hidratarChecklist('revisao_inversor', { erros_alarmes: true, medicao_ca: '220V/5A' }, {});
    const html = renderOSLaudoHtml(os({ tipo: 'revisao_inversor' }), resumoOS(itens), [], 'Responsável Técnico');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Leitura de erros/alarmes');
    expect(html).toContain('220V/5A');
    expect(html).toContain('Responsável Técnico');
  });
  it('não fala "engenheiro"', () => {
    const html = renderOSLaudoHtml(os(), resumoOS(hidratarChecklist('limpeza', {}, {})), [], 'Responsável Técnico');
    expect(html.toLowerCase()).not.toContain('engenheiro');
  });
});
```

- [ ] **Step 2: Run → fail**

- [ ] **Step 3: Implement**
```ts
// adicionar em os-views.ts
import { empresa } from '../empresa-config.js';
import type { ResumoOS } from './os-checklist.js';

export function renderOSLaudoHtml(os: OSRow, resumo: ResumoOS, fotos: FotoOS[], responsavel: string): string {
  const e = empresa();
  const data = (os.concluida_em ?? os.aberta_em).slice(0, 10).split('-').reverse().join('/');
  const checks = resumo.checks.map((c) => `<li>✅ ${escapeHtml(c)}</li>`).join('') || '<li>—</li>';
  const medicoes = resumo.medicoes.map((m) => `<tr><td>${escapeHtml(m.label)}</td><td>${escapeHtml(m.valor)} ${escapeHtml(m.unidade ?? '')}</td></tr>`).join('')
    || '<tr><td colspan="2">—</td></tr>';
  const galeria = fotos.map((f) => `<figure><img src="${escapeHtml(f.url ?? '#')}"><figcaption>${escapeHtml(f.legenda ?? f.item_chave ?? '')}</figcaption></figure>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Laudo de Serviço — ${escapeHtml(os.apelido ?? '')}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:800px;margin:0 auto;padding:24px}
  h1{font-size:20px} h2{font-size:15px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;margin-top:24px}
  table{width:100%;border-collapse:collapse} td{border:1px solid #e2e8f0;padding:6px;font-size:13px}
  ul{list-style:none;padding:0} li{padding:2px 0}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
  figure{margin:0} img{width:100%;border-radius:6px;border:1px solid #e2e8f0} figcaption{font-size:11px;color:#64748b}
  .ass{margin-top:48px;border-top:1px solid #0f172a;width:280px;padding-top:6px;font-size:13px}
  @media print{ a{display:none} }
</style></head>
<body onload="window.print && setTimeout(function(){},300)">
  <h1>${escapeHtml(e.nomeFantasia)} — Laudo de Serviço</h1>
  <p>${escapeHtml(os.apelido ?? '')} · Cliente: ${escapeHtml(os.clienteNome ?? '')} · Data: ${data}</p>
  <h2>Itens verificados</h2><ul>${checks}</ul>
  <h2>Medições</h2><table><tr><td><b>Item</b></td><td><b>Valor</b></td></tr>${medicoes}</table>
  ${os.observacoes ? `<h2>Observações</h2><p>${escapeHtml(os.observacoes)}</p>` : ''}
  ${galeria ? `<h2>Registro fotográfico</h2><div class="grid">${galeria}</div>` : ''}
  <div class="ass">${escapeHtml(responsavel)}</div>
</body></html>`;
}
```

> `responsavel` vem como "Responsável Técnico CREA/CFT" (montado na rota a partir da config). NUNCA "engenheiro".

- [ ] **Step 4: Run → pass**

- [ ] **Step 5: Commit**
```bash
git add src/modules/dashboard/os-views.ts tests/os-views.test.ts
git commit -m "feat(os): laudo HTML imprimivel (checks + medicoes + galeria de fotos)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Rotas da OS

**Files:** Modify `router.ts`

- [ ] **Step 1: Imports**
```ts
import { criarOS, abrirOSDeManutencao, getOS, salvarOS, addFotoOS, listFotosOS, fotoCountsPorItem, concluirOS } from './os-queries.js';
import { renderOSPage, renderOSLaudoHtml } from './os-views.js';
import { hidratarChecklist, resumoOS, type OSTipo } from './os-checklist.js';
```
> `upload` (multer memoryStorage) já existe no router (usado em anexos). Reusar pra `POST /os/:id/foto`.

- [ ] **Step 2: Rotas** (perto das de manutenção)
```ts
  // Porta a/b: abrir OS de uma manutenção agendada
  router.post('/manutencao/:id/os/abrir', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const mid = String(req.params.id);
      if (!UUID_RE.test(mid)) { res.status(400).send('id inválido'); return; }
      const osId = await abrirOSDeManutencao(supabase, mid);
      res.redirect(`/dashboard/os/${osId}`);
    } catch (err) { console.error('[os] abrir falhou:', (err as Error).message); res.status(500).send('erro ao abrir OS'); }
  });

  // Porta c: nova OS avulsa
  router.post('/os/nova', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const sistemaId = String(req.body.sistemaId ?? '');
      const tipo = String(req.body.tipo ?? '') as OSTipo;
      if (!UUID_RE.test(sistemaId) || !['limpeza','revisao_inversor','revisao_eletrica','corretiva','inspecao'].includes(tipo)) {
        res.status(400).send('dados inválidos'); return;
      }
      const { data: s } = await supabase.from('sistemas_clientes').select('lead_id').eq('id', sistemaId).maybeSingle();
      const osId = await criarOS(supabase, { sistemaId, leadId: (s as any)?.lead_id ?? null, tipo });
      res.redirect(`/dashboard/os/${osId}`);
    } catch (err) { console.error('[os] nova falhou:', (err as Error).message); res.status(500).send('erro ao criar OS'); }
  });

  router.get('/os/:id', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) { res.status(400).send('id inválido'); return; }
      const os = await getOS(supabase, id);
      if (!os) { res.status(404).send('OS não encontrada'); return; }
      const [fotos, counts] = await Promise.all([listFotosOS(supabase, id, true), fotoCountsPorItem(supabase, id)]);
      const itens = hidratarChecklist(os.tipo, os.checklist ?? {}, counts);
      res.type('text/html').send(renderOSPage(os, itens, fotos, req.dashUser));
    } catch (err) { console.error('[os] get falhou:', (err as Error).message); res.status(500).send('erro ao carregar OS'); }
  });

  router.post('/os/:id/salvar', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) { res.status(400).send('id inválido'); return; }
      const os = await getOS(supabase, id);
      if (!os) { res.status(404).send('OS não encontrada'); return; }
      // monta o checklist a partir do form: checkbox presente = true; medição = string
      const checklist: Record<string, any> = {};
      const tpl = hidratarChecklist(os.tipo, {}, {});
      for (const it of tpl) {
        if (it.kind === 'check') checklist[it.chave] = req.body[it.chave] === 'on';
        else if (it.kind === 'medicao') checklist[it.chave] = String(req.body[it.chave] ?? '');
      }
      await salvarOS(supabase, id, { checklist, observacoes: String(req.body.observacoes ?? '') });
      res.redirect(`/dashboard/os/${id}`);
    } catch (err) { console.error('[os] salvar falhou:', (err as Error).message); res.status(500).send('erro ao salvar'); }
  });

  router.post('/os/:id/foto', exigir('usinas', 'visualizar'), upload.single('foto'), async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!UUID_RE.test(id) || !req.file) { res.status(400).send('faltou a foto'); return; }
      const os = await getOS(supabase, id);
      if (!os) { res.status(404).send('OS não encontrada'); return; }
      const ext = (req.file.originalname.split('.').pop() ?? 'jpg').toLowerCase().slice(0, 5);
      await addFotoOS(supabase, id, {
        leadId: os.lead_id, itemChave: String(req.body.itemChave ?? ''),
        buffer: req.file.buffer, mimeType: req.file.mimetype, ext,
      });
      res.redirect(`/dashboard/os/${id}`);
    } catch (err) { console.error('[os] foto falhou:', (err as Error).message); res.status(500).send('erro no upload'); }
  });

  router.post('/os/:id/concluir', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) { res.status(400).send('id inválido'); return; }
      const os = await getOS(supabase, id);
      if (!os) { res.status(404).send('OS não encontrada'); return; }
      // grava o estado do form antes de concluir
      const checklist: Record<string, any> = {};
      for (const it of hidratarChecklist(os.tipo, {}, {})) {
        if (it.kind === 'check') checklist[it.chave] = req.body[it.chave] === 'on';
        else if (it.kind === 'medicao') checklist[it.chave] = String(req.body[it.chave] ?? '');
      }
      await salvarOS(supabase, id, { checklist, observacoes: String(req.body.observacoes ?? '') });
      const { manutencaoId } = await concluirOS(supabase, id, { executor: req.dashUser!.id, notas: `OS ${os.tipo} concluída` });
      if (os.lead_id) {
        await registrarAtividade(supabase, {
          company_id: req.dashUser!.companyId, lead_id: os.lead_id, tipo: 'visita',
          titulo: `OS concluída: ${os.tipo}`, automatica: false, user_id: req.dashUser!.id,
        });
      }
      void manutencaoId;
      res.redirect(`/dashboard/os/${id}`);
    } catch (err) { console.error('[os] concluir falhou:', (err as Error).message); res.status(500).send('erro ao concluir'); }
  });

  router.get('/os/:id/laudo', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) { res.status(400).send('id inválido'); return; }
      const os = await getOS(supabase, id);
      if (!os) { res.status(404).send('OS não encontrada'); return; }
      const [fotos, counts] = await Promise.all([listFotosOS(supabase, id, true), fotoCountsPorItem(supabase, id)]);
      const itens = hidratarChecklist(os.tipo, os.checklist ?? {}, counts);
      const responsavel = `${empresa().nomeAtendente ? '' : ''}Responsável Técnico CREA/CFT`;
      res.type('text/html').send(renderOSLaudoHtml(os, resumoOS(itens), fotos, responsavel));
    } catch (err) { console.error('[os] laudo falhou:', (err as Error).message); res.status(500).send('erro no laudo'); }
  });
```
> `empresa` já está importado no router (usado em outras rotas). `responsavel` = string fixa "Responsável Técnico CREA/CFT" (pode incorporar o nome do Junior da config se houver campo; senão a string fixa basta). Simplificar: `const responsavel = 'Responsável Técnico CREA/CFT';`.

- [ ] **Step 3: Build + testes** — `npx tsc --noEmit && npx vitest run` (limpo + verde fora as 2 pré-existentes)

- [ ] **Step 4: Commit**
```bash
git add src/modules/dashboard/router.ts
git commit -m "feat(os): rotas (abrir/nova/salvar/foto/concluir/laudo)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Botões "Abrir OS" + "Nova OS" na manutenção

**Files:** Modify `manutencao-views.ts`

- [ ] **Step 1: Botão "📋 OS" no item da agenda** — em `renderAgendaItem`, ao lado de "✓ Feita":
```ts
      <form method="post" action="/dashboard/manutencao/${escapeHtml(i.id)}/os/abrir" class="inline">
        <button class="px-2 py-1 rounded bg-violet-600 hover:bg-violet-700 text-white text-xs">📋 OS</button></form>
```

- [ ] **Step 2: "Nova OS" avulsa** — adicionar um `<details>` ou form perto do "Agendar manutenção manual":
```ts
    <details class="mt-3">
      <summary class="cursor-pointer text-sm text-slate-600">➕ Nova OS avulsa</summary>
      <form method="post" action="/dashboard/os/nova" class="mt-2 flex flex-wrap gap-2 items-end">
        <select name="sistemaId" class="border rounded px-2 py-1 text-sm" required>${opcoesUsina}</select>
        <select name="tipo" class="border rounded px-2 py-1 text-sm">
          <option value="corretiva">🔧 Corretiva</option><option value="inspecao">🔎 Inspeção</option>
          <option value="limpeza">🧹 Limpeza</option><option value="revisao_inversor">🔌 Revisão inversor</option>
          <option value="revisao_eletrica">⚡ Revisão elétrica</option>
        </select>
        <button class="px-3 py-1 rounded bg-violet-600 text-white text-sm">Abrir OS</button>
      </form>
    </details>
```
> `opcoesUsina` já existe na função (Task 6 da peça 2a). Reusar a mesma variável.

- [ ] **Step 3: Build + testes** — `npx tsc --noEmit && npx vitest run tests/manutencao-views.test.ts`

- [ ] **Step 4: Commit**
```bash
git add src/modules/dashboard/manutencao-views.ts
git commit -m "feat(os): botoes Abrir OS (agenda) + Nova OS avulsa na manutencao

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Revisão final + verificação

- [ ] **Step 1: Suite** — `npx tsc --noEmit && npx vitest run` (tsc limpo; verde fora as 2 pré-existentes).
- [ ] **Step 2: Code review 3×** (`git diff main...HEAD`):
  1. Segurança: rotas com `exigir('usinas','visualizar')`; `UUID_RE`; `escapeHtml` em todo dado (incl. laudo); upload limita ext/tamanho (multer já limita 20MB); fotos via signed URL (não expõe path).
  2. Consistência: `OSTipo` igual ao enum da migration e do checklist; `concluirOS` reusa `marcarManutencaoFeita`; `hidratarChecklist` usado igual na rota de salvar e no get; bucket `client-attachments` tipo `os`.
  3. Produto: laudo com "Responsável Técnico CREA/CFT" (nunca "engenheiro"); português claro; "1 OS, 3 portas, 1 função que fecha" respeitado (uma `concluirOS`).
- [ ] **Step 3: Resumo pro Junior** — migration 059 antes do deploy; smoke: abrir OS de manutenção → marcar/medir/foto → concluir → manutenção vira feita + próxima agendada → laudo imprime certo.

---

## Self-Review (ao escrever o plano)
**Cobertura da spec:** entidade OS+fotos (T3,4) ✅ · 3 portas (T7: abrir/nova; T8 botões) ✅ · checklist 3-em-1 por tipo (T1,5) ✅ · concluir reusa marcarManutencaoFeita (T4) ✅ · laudo HTML (T6) ✅ · fotos Storage (T4) ✅ · rastreável/timeline (T7) ✅ · puras testáveis (T1,2) ✅.
**Placeholders:** nenhum no código. `responsavel` simplificado pra string fixa.
**Consistência de tipos:** `OSTipo` único (checklist↔queries↔migration); `ItemPreenchido`/`ResumoOS`/`OSRow`/`FotoOS` definidos e consumidos coerentes; `concluirOS`→`marcarManutencaoFeita` assinatura da peça 2a; upload reusa `uploadAnexo(client, leadId|osId, 'os', ...)`.
**Decisão consciente:** upload de foto recarrega a página (sem AJAX) — YAGNI nesta peça; o laudo é HTML imprimível (Ctrl+P→PDF), consistente com o pós-instalação.
