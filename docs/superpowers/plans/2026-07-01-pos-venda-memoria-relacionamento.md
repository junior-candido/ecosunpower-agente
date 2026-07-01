# Memória de Relacionamento no Pós-venda — Plano de Implementação (Incremento 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar memória por cliente à sugestão do pós-venda pra ela parar de repetir; tirar o depoimento das sugestões automáticas (vira botão manual) e adicionar a sugestão de "geração saudável".

**Architecture:** Camada aditiva sobre a sugestão existente. Uma tabela nova (`pos_venda_sugestao_memoria`) guarda o que foi sugerido/dispensado por (cliente, situação) + o `snoozed_until` (cooldown). As funções puras de sugestão passam a receber os tipos "snoozed" e um sinal de "gerou bem" e não sugerem o que está em descanso. Nada do copiloto/envio atual muda.

**Tech Stack:** TypeScript ESM (imports `.js`), Supabase/Postgres, Express server-rendered, vitest.

**Escopo:** só pós-venda das usinas. Não toca lead, copiloto de envio, templates, agenda, termômetro. Ver `docs/superpowers/specs/2026-07-01-pos-venda-memoria-relacionamento-design.md`.

**Antes de começar:** combinar o número da migration no grupo (esperado **065**; confirmar que ninguém pegou). `git checkout main && git pull && git checkout -b feat/pos-venda-memoria-relacionamento` (branch já criada nesta sessão).

---

## File Structure

- **Create** `supabase/migrations/065_pos_venda_sugestao_memoria.sql` — tabela nova.
- **Create** `src/modules/dashboard/pos-venda-sugestao-memoria.ts` — helpers puros de cooldown/snooze.
- **Create** `tests/pos-venda-sugestao-memoria.test.ts` — testes dos helpers.
- **Modify** `src/modules/dashboard/pos-venda-sugestao.ts` — `sugestaoProativa` vira memória-aware (tira depoimento, adiciona geração saudável).
- **Modify** `tests/pos-venda-sugestao.test.ts` — atualizar/adicionar testes (se não existir, criar).
- **Modify** `src/modules/supabase.ts` — 2 métodos: ler memória por leads + upsert.
- **Modify** `src/modules/dashboard/pos-venda-queries.ts` — `PosVendaLinha` ganha `gerouBem`, `ultimoContatoPositivoEm`, `snoozedTipos`; popular.
- **Modify** `src/modules/dashboard/pos-venda-views.ts` — chip ganha botão "Agora não"; depoimento continua só como botão manual (já é).
- **Modify** `src/modules/dashboard/router.ts` — POST dispensar sugestão; gravar memória ao enviar.

---

## Task 1: Migration 065 — tabela de memória

**Files:**
- Create: `supabase/migrations/065_pos_venda_sugestao_memoria.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Memória da SUGESTÃO do pós-venda por (cliente, situação). O que já foi ENVIADO
-- vive em abordagens; aqui guardamos o que foi SUGERIDO/DISPENSADO + o cooldown
-- (snoozed_until), pra sugestão não repetir a mesma dica todo dia.
--
-- Aditiva: NÃO altera nenhuma tabela existente. Depoimento NÃO entra aqui (é manual).

CREATE TABLE IF NOT EXISTS pos_venda_sugestao_memoria (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  sistema_id    uuid REFERENCES sistemas_clientes(id) ON DELETE SET NULL,
  tipo          text NOT NULL CHECK (tipo IN ('geracao_saudavel','queda','marco','upgrade','contato')),
  ultima_sugerida_em timestamptz,
  ultima_acao   text CHECK (ultima_acao IN ('enviada','dispensada')),
  ultima_acao_em timestamptz,
  snoozed_until timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_pv_sug_memoria_lead ON pos_venda_sugestao_memoria(lead_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/065_pos_venda_sugestao_memoria.sql
git commit -m "feat(pos-venda): migration 065 memoria de sugestao"
```

---

## Task 2: Helpers puros de cooldown/snooze

**Files:**
- Create: `src/modules/dashboard/pos-venda-sugestao-memoria.ts`
- Test: `tests/pos-venda-sugestao-memoria.test.ts`

- [ ] **Step 1: Escrever os testes (falham primeiro)**

```ts
// tests/pos-venda-sugestao-memoria.test.ts
import { describe, it, expect } from 'vitest';
import { cooldownDias, snoozeAte, tiposSnoozed } from '../src/modules/dashboard/pos-venda-sugestao-memoria.js';

describe('cooldownDias', () => {
  it('padrao 30d, upgrade 90d', () => {
    expect(cooldownDias('geracao_saudavel')).toBe(30);
    expect(cooldownDias('queda')).toBe(30);
    expect(cooldownDias('upgrade')).toBe(90);
  });
});

describe('snoozeAte', () => {
  it('soma o cooldown do tipo a agora (ISO)', () => {
    const agora = new Date('2026-07-01T00:00:00Z');
    expect(snoozeAte('geracao_saudavel', agora)).toBe('2026-07-31T00:00:00.000Z');
    expect(snoozeAte('upgrade', agora)).toBe('2026-09-29T00:00:00.000Z');
  });
});

describe('tiposSnoozed', () => {
  const agora = new Date('2026-07-15T00:00:00Z');
  it('inclui tipo com snoozed_until no futuro; ignora vencido/null', () => {
    const rows = [
      { tipo: 'geracao_saudavel', snoozed_until: '2026-07-20T00:00:00Z' }, // futuro
      { tipo: 'upgrade', snoozed_until: '2026-07-10T00:00:00Z' },          // vencido
      { tipo: 'contato', snoozed_until: null },                            // sem snooze
    ];
    const s = tiposSnoozed(rows, agora);
    expect(s.has('geracao_saudavel')).toBe(true);
    expect(s.has('upgrade')).toBe(false);
    expect(s.has('contato')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/pos-venda-sugestao-memoria.test.ts`
Expected: FAIL ("Cannot find module .../pos-venda-sugestao-memoria.js")

- [ ] **Step 3: Implementar os helpers**

```ts
// src/modules/dashboard/pos-venda-sugestao-memoria.ts
// Helpers PUROS da memória de sugestão do pós-venda: cooldown por tipo, cálculo
// do snooze e leitura de quais tipos estão "descansando". Sem I/O — testável.

const DIA = 86400000;
export const COOLDOWN_PADRAO_DIAS = 30;
export const COOLDOWN_UPGRADE_DIAS = 90;

// Situações que a sugestão automática cobre (depoimento é manual, fora daqui).
export type SituacaoSugestao = 'geracao_saudavel' | 'queda' | 'marco' | 'upgrade' | 'contato';

export function cooldownDias(tipo: string): number {
  return tipo === 'upgrade' ? COOLDOWN_UPGRADE_DIAS : COOLDOWN_PADRAO_DIAS;
}

// snoozed_until = agora + cooldown do tipo (ISO).
export function snoozeAte(tipo: string, agora: Date): string {
  return new Date(agora.getTime() + cooldownDias(tipo) * DIA).toISOString();
}

// Conjunto dos tipos ainda em descanso (snoozed_until no futuro).
export function tiposSnoozed(
  rows: Array<{ tipo: string; snoozed_until: string | null }>,
  agora: Date,
): Set<string> {
  const s = new Set<string>();
  for (const r of rows) {
    if (r.snoozed_until && new Date(r.snoozed_until).getTime() > agora.getTime()) s.add(r.tipo);
  }
  return s;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/pos-venda-sugestao-memoria.test.ts`
Expected: PASS (3 describes)

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/pos-venda-sugestao-memoria.ts tests/pos-venda-sugestao-memoria.test.ts
git commit -m "feat(pos-venda): helpers puros de cooldown/snooze da memoria"
```

---

## Task 3: `sugestaoProativa` memória-aware (tira depoimento, adiciona geração saudável)

**Files:**
- Modify: `src/modules/dashboard/pos-venda-sugestao.ts` (reescreve o corpo)
- Test: `tests/pos-venda-sugestao.test.ts` (criar se não existir)

Contexto atual do arquivo (será substituído): `LinhaSugestao` tem `saude`, `ultimoContatoEm`, `jaTeveDepoimento`, `elegivelUpgrade`, `dataInstalacao`; `Sugestao` tem `{texto, pedidoEva}`; a regra sugere depoimento e não tem memória.

- [ ] **Step 1: Escrever os testes (falham primeiro)**

```ts
// tests/pos-venda-sugestao.test.ts
import { describe, it, expect } from 'vitest';
import { sugestaoProativa, type LinhaSugestao } from '../src/modules/dashboard/pos-venda-sugestao.js';

const HOJE = new Date('2026-07-01T00:00:00Z');
const base: LinhaSugestao = {
  saude: 'verde',
  ultimoContatoEm: '2026-06-25T00:00:00Z',
  elegivelUpgrade: false,
  dataInstalacao: '2025-01-01',
  gerouBem: false,
  ultimoContatoPositivoEm: null,
  snoozedTipos: new Set<string>(),
};

describe('sugestaoProativa — memoria', () => {
  it('NUNCA sugere depoimento (virou manual)', () => {
    const l = { ...base, dataInstalacao: '2024-01-01' }; // usina antiga, verde
    const s = sugestaoProativa(l, HOJE);
    expect(s?.tipo).not.toBe('depoimento');
  });

  it('geracao saudavel: verde + gerouBem + sem contato positivo → sugere boa noticia', () => {
    const l = { ...base, gerouBem: true, ultimoContatoPositivoEm: null };
    const s = sugestaoProativa(l, HOJE);
    expect(s?.tipo).toBe('geracao_saudavel');
  });

  it('geracao saudavel NAO aparece se snoozed', () => {
    const l = { ...base, gerouBem: true, snoozedTipos: new Set(['geracao_saudavel']) };
    expect(sugestaoProativa(l, HOJE)).toBeNull();
  });

  it('geracao saudavel NAO aparece se teve contato positivo recente (<60d)', () => {
    const l = { ...base, gerouBem: true, ultimoContatoPositivoEm: '2026-06-20T00:00:00Z' };
    expect(sugestaoProativa(l, HOJE)).toBeNull();
  });

  it('vermelho sugere queda; some se snoozed', () => {
    expect(sugestaoProativa({ ...base, saude: 'vermelho' }, HOJE)?.tipo).toBe('queda');
    expect(sugestaoProativa({ ...base, saude: 'vermelho', snoozedTipos: new Set(['queda']) }, HOJE)).toBeNull();
  });

  it('sem falar ha >90d sugere contato; some se snoozed', () => {
    const l = { ...base, ultimoContatoEm: '2026-01-01T00:00:00Z' };
    expect(sugestaoProativa(l, HOJE)?.tipo).toBe('contato');
    expect(sugestaoProativa({ ...l, snoozedTipos: new Set(['contato']) }, HOJE)).toBeNull();
  });

  it('upgrade quando elegivel; some se snoozed', () => {
    const l = { ...base, elegivelUpgrade: true };
    expect(sugestaoProativa(l, HOJE)?.tipo).toBe('upgrade');
    expect(sugestaoProativa({ ...l, snoozedTipos: new Set(['upgrade']) }, HOJE)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/pos-venda-sugestao.test.ts`
Expected: FAIL (campos `gerouBem`/`tipo` não existem)

- [ ] **Step 3: Reescrever `pos-venda-sugestao.ts`**

```ts
// src/modules/dashboard/pos-venda-sugestao.ts
// Função PURA: a dica mais útil agora pro cliente (1 só, por prioridade), COM
// MEMÓRIA — não sugere tipo que está em descanso (snoozedTipos). Não chama IA:
// é regra. A IA só escreve a mensagem quando o operador clica.
// Depoimento saiu daqui de propósito: virou botão manual (o operador decide a hora).
import type { Saude } from './pos-venda-saude.js';

export interface LinhaSugestao {
  saude: Saude;
  ultimoContatoEm: string | null;
  elegivelUpgrade: boolean;
  dataInstalacao: string | null;
  gerouBem: boolean;                        // rendeu acima do esperado no período
  ultimoContatoPositivoEm: string | null;   // último relatório/parabéns enviado
  snoozedTipos: Set<string>;                 // tipos em cooldown (não repetir)
}

export interface Sugestao { tipo: string; texto: string; pedidoEva: string }

const DIA = 86400000;
const SEM_FALAR_DIAS = 90;
const SEM_CONTATO_POSITIVO_DIAS = 60;

const diasSem = (iso: string | null, hoje: Date): number | null =>
  iso ? Math.floor((hoje.getTime() - new Date(iso).getTime()) / DIA) : null;

export function sugestaoProativa(l: LinhaSugestao, hoje: Date): Sugestao | null {
  // 1) Geração caindo (crítico). Some se em descanso (o offline real fica com a
  //    proactive-alerts; aqui é a dica do painel, que respeita a memória).
  if (l.saude === 'vermelho' && !l.snoozedTipos.has('queda')) {
    return {
      tipo: 'queda',
      texto: '💡 Geração caiu — ofereça revisão/limpeza',
      pedidoEva: 'Escreve um aviso gentil que notei a geração caindo na usina dele e ofereço uma revisão técnica.',
    };
  }
  // 2) Sem falar há muito tempo → um oi.
  const d = diasSem(l.ultimoContatoEm, hoje);
  if (d !== null && d > SEM_FALAR_DIAS && !l.snoozedTipos.has('contato')) {
    return {
      tipo: 'contato',
      texto: `💡 ${d} dias sem falar — manda um oi`,
      pedidoEva: 'Escreve um oi leve pra reativar o contato com o cliente, sem cobrança.',
    };
  }
  // 3) Geração saudável (a boa notícia que o Junior quer): verde + rendeu bem +
  //    faz tempo sem um contato positivo + não está em descanso.
  if (l.saude === 'verde' && l.gerouBem && !l.snoozedTipos.has('geracao_saudavel')) {
    const dp = diasSem(l.ultimoContatoPositivoEm, hoje);
    if (dp === null || dp > SEM_CONTATO_POSITIVO_DIAS) {
      return {
        tipo: 'geracao_saudavel',
        texto: '☀️ Usina foi bem — mande a boa notícia',
        pedidoEva: 'Escreve uma boa notícia pro cliente: a usina dele rendeu bem no período, reforçando o quanto está economizando. Tom leve e positivo.',
      };
    }
  }
  // 4) Upgrade quando elegível.
  if (l.elegivelUpgrade && !l.snoozedTipos.has('upgrade')) {
    return {
      tipo: 'upgrade',
      texto: '💡 Pode crescer o sistema — sonde upgrade',
      pedidoEva: 'Escreve uma sondagem leve sobre ampliar o sistema solar dele.',
    };
  }
  // Depoimento REMOVIDO daqui — é botão manual.
  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/pos-venda-sugestao.test.ts`
Expected: PASS

- [ ] **Step 5: Ajustar chamadores que quebraram no tsc**

Run: `npx tsc --noEmit 2>&1 | grep pos-venda`
O chamador é `pos-venda-views.ts:53` (`sugestaoProativa(l, agora)`). Ele passa `l: PosVendaLinha` — os campos novos (`gerouBem`, `ultimoContatoPositivoEm`, `snoozedTipos`) entram no `PosVendaLinha` na Task 5. Até lá o tsc pode acusar; se acusar, seguir pra Task 4/5 antes de commitar este passo. Se o tsc estiver limpo (o objeto já tem os campos), comitar.

- [ ] **Step 6: Commit**

```bash
git add src/modules/dashboard/pos-venda-sugestao.ts tests/pos-venda-sugestao.test.ts
git commit -m "feat(pos-venda): sugestao memoria-aware (tira depoimento, add geracao saudavel)"
```

---

## Task 4: Métodos de banco (ler memória por leads + upsert)

**Files:**
- Modify: `src/modules/supabase.ts` (adicionar 2 métodos, seguindo o padrão dos métodos de pós-venda existentes — procurar `abordagens` no arquivo pra achar a região e o estilo)

- [ ] **Step 1: Adicionar os métodos na classe SupabaseService**

Localizar um método de pós-venda existente (ex.: o que lê `abordagens`) e adicionar ao lado, no mesmo estilo (client `this.client`, tratamento de erro com log e retorno seguro):

```ts
// Lê a memória de sugestão de vários leads de uma vez (pra montar a lista).
async getSugestaoMemoriaPorLeads(
  leadIds: string[],
): Promise<Array<{ lead_id: string; tipo: string; snoozed_until: string | null }>> {
  if (leadIds.length === 0) return [];
  const { data, error } = await this.client
    .from('pos_venda_sugestao_memoria')
    .select('lead_id, tipo, snoozed_until')
    .in('lead_id', leadIds);
  if (error) {
    console.warn('[supabase] getSugestaoMemoriaPorLeads falhou:', error.message);
    return [];
  }
  return data ?? [];
}

// Upsert idempotente da memória por (lead_id, tipo). Falha NÃO propaga (aditivo).
async upsertSugestaoMemoria(input: {
  leadId: string;
  sistemaId: string | null;
  tipo: string;
  acao: 'enviada' | 'dispensada';
  snoozedUntil: string;
  agoraIso: string;
}): Promise<void> {
  const { error } = await this.client
    .from('pos_venda_sugestao_memoria')
    .upsert(
      {
        lead_id: input.leadId,
        sistema_id: input.sistemaId,
        tipo: input.tipo,
        ultima_sugerida_em: input.agoraIso,
        ultima_acao: input.acao,
        ultima_acao_em: input.agoraIso,
        snoozed_until: input.snoozedUntil,
        updated_at: input.agoraIso,
      },
      { onConflict: 'lead_id,tipo' },
    );
  if (error) console.warn('[supabase] upsertSugestaoMemoria falhou:', error.message);
}
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit 2>&1 | grep supabase`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/modules/supabase.ts
git commit -m "feat(pos-venda): metodos de banco da memoria de sugestao"
```

---

## Task 5: Popular os campos novos em `PosVendaLinha`

**Files:**
- Modify: `src/modules/dashboard/pos-venda-queries.ts`

Ler o arquivo primeiro pra achar: a interface `PosVendaLinha`, onde `ultimoContatoEm`/`jaTeveDepoimento` são montados (a partir de `abordagens`), e como a geração estimada/real está disponível.

- [ ] **Step 1: Adicionar os 3 campos na interface `PosVendaLinha`**

```ts
// dentro de interface PosVendaLinha:
  gerouBem: boolean;                        // gerou >= estimativa no período
  ultimoContatoPositivoEm: string | null;   // ultimo relatorio/parabens enviado
  snoozedTipos: Set<string>;                 // tipos em cooldown (memoria)
```

- [ ] **Step 2: Popular `ultimoContatoPositivoEm` a partir das abordagens**

Onde hoje calcula `ultimoContatoEm`/`teveDepoimento` (varrendo abordagens por lead), adicionar: guardar a data mais recente de abordagem cujo `tipo ∈ {relatorio, parabens}` por `lead_id`. Ex.:

```ts
const contatoPositivo = new Map<string, string>(); // lead_id -> data ISO mais recente
for (const a of abordagens) {
  if (a.tipo === 'relatorio' || a.tipo === 'parabens') {
    const cur = contatoPositivo.get(a.lead_id);
    if (!cur || a.enviada_em > cur) contatoPositivo.set(a.lead_id, a.enviada_em);
  }
}
```
(usar o nome real da coluna de data das abordagens — conferir no arquivo/DB: provavelmente `enviada_em` ou `created_at`.)

- [ ] **Step 3: Popular `snoozedTipos` a partir da memória**

Depois de ter a lista de `leadIds`, buscar a memória e montar o set por lead:

```ts
import { tiposSnoozed } from './pos-venda-sugestao-memoria.js';
// ...
const memoriaRows = await supabase.getSugestaoMemoriaPorLeads(leadIds);
const agora = new Date();
const snoozadosPorLead = new Map<string, Set<string>>();
for (const leadId of leadIds) {
  const rows = memoriaRows.filter((r) => r.lead_id === leadId);
  snoozadosPorLead.set(leadId, tiposSnoozed(rows, agora));
}
```

- [ ] **Step 4: Popular `gerouBem`**

Definir `gerouBem` como: tem geração real recente e a soma do período ≥ a estimativa do período. Reusar o que a query já traz de geração/estimativa (conferir os campos disponíveis no arquivo). Se a estimativa não estiver acessível aqui, usar proxy simples: `saude === 'verde'` **e** existe geração real > 0 nos últimos dias (documentar a escolha num comentário). Montar no objeto de cada linha:

```ts
  gerouBem: /* soma real do período >= estimativa; senão proxy verde+gerou>0 */,
  ultimoContatoPositivoEm: contatoPositivo.get(l.leadId) ?? null,
  snoozedTipos: snoozadosPorLead.get(l.leadId) ?? new Set<string>(),
```

- [ ] **Step 5: Verificar tsc + suíte**

Run: `npx tsc --noEmit` (limpo) e `npx vitest run` (verde — a Task 3 já deve estar consistente agora).

- [ ] **Step 6: Commit**

```bash
git add src/modules/dashboard/pos-venda-queries.ts
git commit -m "feat(pos-venda): popular gerouBem/contato-positivo/snoozed na linha"
```

---

## Task 6: UI — botão "Agora não" no chip da sugestão

**Files:**
- Modify: `src/modules/dashboard/pos-venda-views.ts` (função `renderLinha`, região do `chip`, linhas ~53-56 e o JS da tela)

- [ ] **Step 1: Renderizar o "Agora não" ao lado do chip**

Substituir o bloco do `chip` (hoje só o botão de sugerir) por sugerir + dispensar, passando o `tipo`:

```ts
const sug = sugestaoProativa(l, agora);
const chip = sug
  ? `<div class="mt-1 flex items-center gap-2">
       <button type="button" class="pv-sugestao-btn text-left text-xs text-indigo-300 hover:text-indigo-100"
         data-lead-id="${escapeHtml(l.leadId)}" data-tipo="${escapeHtml(sug.tipo)}" data-pedido="${escapeHtml(sug.pedidoEva)}">${escapeHtml(sug.texto)}</button>
       <button type="button" class="pv-sug-dispensar text-[11px] text-slate-500 hover:text-slate-300"
         data-lead-id="${escapeHtml(l.leadId)}" data-tipo="${escapeHtml(sug.tipo)}">Agora não</button>
     </div>`
  : '';
```

- [ ] **Step 2: JS da tela — ao clicar "Agora não", POST e some o chip**

Achar o `<script>` da tela de pós-venda (onde `pv-sugestao-btn`/`pv-tpl-btn` são ligados) e adicionar o handler:

```js
document.querySelectorAll('.pv-sug-dispensar').forEach(function (b) {
  b.addEventListener('click', function () {
    var leadId = b.getAttribute('data-lead-id');
    var tipo = b.getAttribute('data-tipo');
    fetch('/dashboard/pos-venda/sugestao/dispensar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: leadId, tipo: tipo }),
    }).then(function () { var box = b.closest('div'); if (box) box.remove(); });
  });
});
```

- [ ] **Step 3: Verificar tsc**

Run: `npx tsc --noEmit` (limpo).

- [ ] **Step 4: Commit**

```bash
git add src/modules/dashboard/pos-venda-views.ts
git commit -m "feat(pos-venda): botao 'Agora nao' no chip de sugestao"
```

---

## Task 7: Router — gravar memória ao dispensar e ao enviar

**Files:**
- Modify: `src/modules/dashboard/router.ts` (perto dos handlers de pós-venda, ~1440-1560)

- [ ] **Step 1: Rota POST pra dispensar**

Adicionar (perto das outras rotas `/dashboard/pos-venda/...`):

```ts
import { snoozeAte } from './pos-venda-sugestao-memoria.js';
// ...
router.post('/pos-venda/sugestao/dispensar', async (req: Request, res: Response) => {
  const leadId = String(req.body?.leadId ?? '').trim();
  const tipo = String(req.body?.tipo ?? '').trim();
  const TIPOS = ['geracao_saudavel', 'queda', 'marco', 'upgrade', 'contato'];
  if (!leadId || !TIPOS.includes(tipo)) {
    return res.status(400).json({ ok: false, error: 'leadId/tipo invalido' });
  }
  const agora = new Date();
  await supabaseService.upsertSugestaoMemoria({
    leadId, sistemaId: null, tipo, acao: 'dispensada',
    snoozedUntil: snoozeAte(tipo, agora), agoraIso: agora.toISOString(),
  });
  res.json({ ok: true });
});
```

- [ ] **Step 2: Gravar memória ao ENVIAR um template que casa com uma situação**

No handler de envio de template do pós-venda (onde hoje registra a abordagem — procurar `TIPOS_OK`/`depoimento: 'Pedido de depoimento enviado'`), após registrar a abordagem com sucesso, mapear o template → situação e gravar a memória (não bloquear o envio se falhar):

```ts
// mapa template(AcaoManual) -> situacao da memoria (depoimento NAO entra)
const TPL_SITUACAO: Record<string, string> = {
  relatorio: 'geracao_saudavel', parabens: 'marco', limpeza: 'queda', upgrade: 'upgrade', contato: 'contato',
};
const situacao = TPL_SITUACAO[tipo];
if (situacao) {
  const agora = new Date();
  await supabaseService.upsertSugestaoMemoria({
    leadId, sistemaId: null, tipo: situacao, acao: 'enviada',
    snoozedUntil: snoozeAte(situacao, agora), agoraIso: agora.toISOString(),
  });
}
```
(usar os nomes reais de variáveis do handler — `leadId`, `tipo` já existem ali; conferir ao ler a região.)

- [ ] **Step 3: Verificar tsc + suíte completa**

Run: `npx tsc --noEmit` (limpo) e `npx vitest run` (verde).

- [ ] **Step 4: Commit**

```bash
git add src/modules/dashboard/router.ts
git commit -m "feat(pos-venda): grava memoria ao dispensar e ao enviar template"
```

---

## Task 8: Fechamento — review + validação

- [ ] **Step 1: Code review 3× do diff** (padrão do Junior): rodar review, corrigir achados, repetir 3×. Focar: a sugestão nunca sugere depoimento; snooze bloqueia repetição; envio grava memória; nada do copiloto/envio mudou.

- [ ] **Step 2: tsc limpo + suíte completa verde**

Run: `npx tsc --noEmit` e `npx vitest run`
Expected: 0 erros; todos os testes verdes (incluindo os ~1600 existentes — se algum do operador quebrou, é regressão, corrigir).

- [ ] **Step 3: Aplicar a migration 065 no Supabase (SQL Editor) — salvar o .sql na Área de Trabalho pro Junior rodar.**

- [ ] **Step 4: Abrir PR** (Junior autoriza push). Depois: Implantar + validar com clientes reais (simular "já mandei depoimento pro fulano" → não reaparece; boa notícia só quando gerou bem).

---

## Notas de escopo (o que NÃO muda)

Copiloto de envio, prévia, "Enviar pela Eva", templates, agenda, notas, termômetro, saúde e o atendimento de LEAD ficam **intocados**. O botão de depoimento continua existindo em `BOTOES` (`pos-venda-views.ts`) como envio manual — só saiu das sugestões automáticas. Incremento 2 (resumo diário no zap) é plano separado.
