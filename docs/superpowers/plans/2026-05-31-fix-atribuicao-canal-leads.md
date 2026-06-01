# Fix Atribuição de Canal dos Leads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Etiquetar corretamente os leads de anúncio CTWA (→ `meta`) e de Instagram/Facebook orgânico (→ `blog`), e recuperar os ~82 leads orgânicos passados via backfill.

**Architecture:** Lógica pura de classificação isolada e testada (`resolve-channel.ts` + novo `ctwa-attribution.ts`). Persistência do referral CTWA gravada no handler de inbound do `index.ts` (espelhando o fluxo de Lead Form que já funciona). Backfill via script idempotente que recomputa `channel`.

**Tech Stack:** TypeScript ESM (imports com `.js`), Supabase JS, Meta Graph API v22.0, Vitest. Windows.

---

## File Structure

- **Modify** `src/modules/dashboard/resolve-channel.ts` — reordenar/estender `tokenToChannel` (orgânico antes de meta; `ctwa`→meta).
- **Create** `src/modules/marketing/ctwa-attribution.ts` — helpers: `buildCtwaPatch` (puro), `shouldAttributeCtwa` (puro), `resolveCampaignIdFromAd` (Meta API).
- **Create** `tests/ctwa-attribution.test.ts` — testes dos helpers puros.
- **Modify** `tests/resolve-channel.test.ts` (ou cria se não existir) — casos novos de classificação.
- **Modify** `src/index.ts` — gravar atribuição CTWA no inbound (após bloco de tag tracking ~L2964).
- **Create** `scripts/backfill-channel-reclassify.ts` — recomputa `channel` dos leads com sinal.

> ESM: todo import relativo termina em `.js`.

---

## Task 1: Classificador — orgânico antes de meta + CTWA→meta

**Files:**
- Modify: `src/modules/dashboard/resolve-channel.ts:19-29` (`tokenToChannel`)
- Test: `tests/resolve-channel.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/resolve-channel.test.ts  (criar se não existir)
import { describe, it, expect } from 'vitest';
import { resolveChannel } from '../src/modules/dashboard/resolve-channel.js';

describe('resolveChannel — classificação de canal', () => {
  it('organico_ig é orgânico (blog), NÃO paid meta', () => {
    expect(resolveChannel({ leadSource: 'organico_ig' })).toBe('blog');
  });
  it('organico_fb é orgânico (blog)', () => {
    expect(resolveChannel({ leadSource: 'organico_fb' })).toBe('blog');
  });
  it('ad_ctwa classifica como meta', () => {
    expect(resolveChannel({ leadSource: 'ad_ctwa' })).toBe('meta');
  });
  it('ctwa classifica como meta', () => {
    expect(resolveChannel({ leadSource: 'ctwa' })).toBe('meta');
  });
  it('ig puro (paid) continua meta', () => {
    expect(resolveChannel({ leadSource: 'ad_ig_cta_wa' })).toBe('meta');
  });
  it('adCampaignId presente = meta (prioridade máxima)', () => {
    expect(resolveChannel({ adCampaignId: '123' })).toBe('meta');
  });
  it('reativacao continua base_propria', () => {
    expect(resolveChannel({ leadSource: 'reativacao_lead_v1' })).toBe('base_propria');
  });
  it('sem sinal = direto', () => {
    expect(resolveChannel({})).toBe('direto');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/resolve-channel.test.ts`
Expected: FAIL nos casos `organico_ig`/`organico_fb` (hoje a regex `meta` casa o `ig`/`fb` → retorna 'meta', não 'blog') e `ad_ctwa`/`ctwa` (hoje retorna 'outro').

- [ ] **Step 3: Implement — reordenar tokenToChannel**

Substituir a função `tokenToChannel` (linhas 19-29) por:

```typescript
function tokenToChannel(s: string): Channel | '' {
  if (!s) return '';
  // Orgânico ANTES de meta: 'organico_ig'/'organico_fb' não pode cair em paid
  // meta (a regex meta casa 'ig'/'fb'). 'blog' é o bucket orgânico/SEO.
  if (/(^|[^a-z])(blog|org[aâ]nico|organico|seo)([^a-z]|$)/.test(s)) return 'blog';
  // Paid Meta: inclui 'ctwa'/'ad_ctwa' (Click-to-WhatsApp Ad).
  if (/(^|[^a-z])(meta|facebook|instagram|fb|ig|ctwa)([^a-z]|$)/.test(s)) return 'meta';
  if (/(^|[^a-z])(google|gads|adwords|google[_-]?ads)([^a-z]|$)/.test(s)) return 'google';
  // Base propria: bases terceirizadas reativadas + reengagement + neemias.
  if (/(^|[^a-z])(terceirizada|terceirizado|reengagement|reativacao|reativado|recovered|recuperado|neemias|base[_-]?propria)([^a-z]|$)/.test(s)) return 'base_propria';
  // Venda direta presencial entra como indicacao.
  if (/(^|[^a-z])(indica[cç][aã]o|indicacao|referral|indica|venda[_-]?direta|presencial|amigo|familiar)([^a-z]|$)/.test(s)) return 'indicacao';
  return '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/resolve-channel.test.ts`
Expected: PASS (8 casos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/resolve-channel.ts tests/resolve-channel.test.ts
git commit -m "fix(channel): organico antes de meta + ctwa->meta no classificador"
```

---

## Task 2: Helpers de atribuição CTWA (puros)

**Files:**
- Create: `src/modules/marketing/ctwa-attribution.ts`
- Test: `tests/ctwa-attribution.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/ctwa-attribution.test.ts
import { describe, it, expect } from 'vitest';
import { buildCtwaPatch, shouldAttributeCtwa } from '../src/modules/marketing/ctwa-attribution.js';

describe('buildCtwaPatch', () => {
  it('com campaignId resolvido → channel meta e campos preenchidos', () => {
    const p = buildCtwaPatch('ad_123', 'camp_456');
    expect(p).toMatchObject({ ad_id: 'ad_123', ad_campaign_id: 'camp_456', lead_source: 'ad_ctwa', channel: 'meta' });
  });
  it('sem campaignId (null) → ainda channel meta (via lead_source ad_ctwa)', () => {
    const p = buildCtwaPatch('ad_123', null);
    expect(p.ad_campaign_id).toBeNull();
    expect(p.channel).toBe('meta');
  });
});

describe('shouldAttributeCtwa', () => {
  it('lead novo (null) → true', () => {
    expect(shouldAttributeCtwa(null)).toBe(true);
  });
  it('lead status novo sem atribuição → true', () => {
    expect(shouldAttributeCtwa({ status: 'novo' })).toBe(true);
  });
  it('lead que já avançou (status != novo) → false', () => {
    expect(shouldAttributeCtwa({ status: 'qualificado' })).toBe(false);
  });
  it('lead que já tem ad_campaign_id → false', () => {
    expect(shouldAttributeCtwa({ status: 'novo', ad_campaign_id: 'x' })).toBe(false);
  });
  it('lead que já tem lead_source → false', () => {
    expect(shouldAttributeCtwa({ status: 'novo', lead_source: 'organico_ig' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ctwa-attribution.test.ts`
Expected: FAIL — módulo/funções não existem.

- [ ] **Step 3: Implement**

```typescript
// src/modules/marketing/ctwa-attribution.ts
import { resolveChannel, type Channel } from '../dashboard/resolve-channel.js';

const GRAPH = 'https://graph.facebook.com/v22.0';

export interface CtwaPatch {
  ad_id: string;
  ad_campaign_id: string | null;
  lead_source: string;
  channel: Channel;
}

/**
 * Monta o patch de atribuição pra um lead vindo de CTWA (Click-to-WhatsApp Ad).
 * Puro — channel computado via resolveChannel. lead_source='ad_ctwa' garante
 * classificação 'meta' mesmo se o campaign_id não resolver.
 */
export function buildCtwaPatch(adId: string, adCampaignId: string | null): CtwaPatch {
  const lead_source = 'ad_ctwa';
  const channel = resolveChannel({ adCampaignId, leadSource: lead_source });
  return { ad_id: adId, ad_campaign_id: adCampaignId, lead_source, channel };
}

/**
 * Decide se deve gravar atribuição CTWA: só lead novo OU sem atribuição prévia
 * e que ainda não avançou no funil (espelha o guard isHot do fluxo Lead Form).
 */
export function shouldAttributeCtwa(
  existing: { status?: string | null; ad_campaign_id?: string | null; lead_source?: string | null } | null,
): boolean {
  if (!existing) return true;
  if (existing.status && existing.status !== 'novo') return false;
  if (existing.ad_campaign_id || existing.lead_source) return false;
  return true;
}

/**
 * Resolve o campaign_id de um ad_id via Meta Graph API. Best-effort:
 * retorna null em qualquer falha (não bloqueia o fluxo de mensagem).
 */
export async function resolveCampaignIdFromAd(adId: string, accessToken: string): Promise<string | null> {
  try {
    const url = `${GRAPH}/${adId}?fields=campaign_id&access_token=${accessToken}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const json = (await r.json()) as { campaign_id?: string };
    return json.campaign_id ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ctwa-attribution.test.ts`
Expected: PASS (7 casos). Depende da Task 1 (pra `ad_ctwa`→meta).

- [ ] **Step 5: Commit**

```bash
git add src/modules/marketing/ctwa-attribution.ts tests/ctwa-attribution.test.ts
git commit -m "feat(marketing): helpers de atribuicao CTWA (buildCtwaPatch + guards)"
```

---

## Task 3: Gravar atribuição CTWA no inbound

**Files:**
- Modify: `src/index.ts` — import no topo + bloco após tag tracking (~L2964)

- [ ] **Step 1: Import no topo do index.ts**

Junto dos outros imports de módulos:

```typescript
import { buildCtwaPatch, shouldAttributeCtwa, resolveCampaignIdFromAd } from './modules/marketing/ctwa-attribution.js';
```

- [ ] **Step 2: Inserir o bloco de atribuição**

Localizar o fim do bloco de tag tracking wa.me (o `}` que fecha `if (isNewLead) { ... parseTrackingTag ... }`, por volta da linha 2964) e inserir **logo depois**:

```typescript
      // ATRIBUIÇÃO CTWA: persiste o ad_id do anúncio Meta no lead. Antes o
      // referral era usado só pro template de auto-ack — por isso lead de
      // anúncio CTWA virava 'direto'. Espelha o guard do fluxo Lead Form.
      if (ctwaReferral?.sourceId && (isNewLead || shouldAttributeCtwa(lead as any))) {
        try {
          const adId = ctwaReferral.sourceId;
          const campaignId = config.metaWabaAccessToken
            ? await resolveCampaignIdFromAd(adId, config.metaWabaAccessToken)
            : null;
          const patch = buildCtwaPatch(adId, campaignId);
          await supabase.getClient()
            .from('leads')
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq('id', leadId);
          console.log(`[ctwa-attrib] lead ${leadId} atribuído: ad_id=${adId} campaign=${campaignId ?? 'n/a'} channel=meta`);
        } catch (err) {
          console.error('[ctwa-attrib] falha ao gravar atribuição:', (err as Error).message);
        }
      }
```

> `config`, `supabase`, `ctwaReferral`, `isNewLead`, `lead`, `leadId` já estão no escopo deste handler (confirmado: `ctwaReferral` é parâmetro L2707; `isNewLead`/`leadId` definidos L2897/L2904).

- [ ] **Step 3: Verificar build**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "fix(inbound): grava atribuicao CTWA (ad_id->lead) em vez de so usar no template"
```

---

## Task 4: Script de backfill (reclassifica leads passados)

**Files:**
- Create: `scripts/backfill-channel-reclassify.ts`

Recomputa `channel` pros leads que TÊM sinal (`lead_source`/`origin`/`utm_source`/`utm_campaign`). Recupera os ~82 `organico_ig` + demais "outro". Idempotente. Dry-run por padrão; aplica só com `--apply`.

- [ ] **Step 1: Implement**

```typescript
// scripts/backfill-channel-reclassify.ts
// Uso:  npx tsx scripts/backfill-channel-reclassify.ts          (dry-run)
//       npx tsx scripts/backfill-channel-reclassify.ts --apply  (grava)
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveChannel } from '../src/modules/dashboard/resolve-channel.js';
import { leadRowToChannelInput } from '../src/modules/dashboard/channel-mapper.js';

const apply = process.argv.includes('--apply');
const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY!;
if (!url || !key) { console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env'); process.exit(1); }

const supabase = createClient(url, key);

async function main() {
  // Só leads que têm algum sinal de origem (os 168 'direto' sem sinal ficam de fora).
  const { data, error } = await supabase
    .from('leads')
    .select('id, channel, ad_campaign_id, lead_source, origin, utm_source, utm_campaign')
    .or('lead_source.not.is.null,origin.not.is.null,utm_source.not.is.null,utm_campaign.not.is.null');
  if (error) { console.error('query falhou:', error.message); process.exit(1); }

  const rows = data ?? [];
  let changed = 0;
  const resumo: Record<string, number> = {};
  for (const row of rows) {
    const novo = resolveChannel(leadRowToChannelInput(row as Record<string, unknown>));
    if (novo !== row.channel) {
      changed++;
      const k = `${row.channel ?? 'null'} -> ${novo}`;
      resumo[k] = (resumo[k] ?? 0) + 1;
      if (apply) {
        await supabase.from('leads').update({ channel: novo, updated_at: new Date().toISOString() }).eq('id', row.id);
      }
    }
  }
  console.log(`${rows.length} leads com sinal | ${changed} reclassificados${apply ? ' (GRAVADO)' : ' (dry-run)'}`);
  console.table(resumo);
}
main().then(() => process.exit(0));
```

- [ ] **Step 2: Verificar build/types**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-channel-reclassify.ts
git commit -m "feat(scripts): backfill reclassifica channel dos leads com sinal"
```

---

## Task 5: Verificação + execução do backfill

**Files:** nenhum (verificação).

- [ ] **Step 1: Suíte completa + build**

Run: `npx tsc --noEmit && npx vitest run tests/resolve-channel.test.ts tests/ctwa-attribution.test.ts`
Expected: build limpo; testes novos PASS. Rodar `npx vitest run` pra confirmar zero regressão (ignorar as 2 falhas pré-existentes em `cases-fetcher.test.ts`).

- [ ] **Step 2: Code review**

Rodar `/code-review` na branch. Endereçar achados.

- [ ] **Step 3: Backfill em prod (Junior)**

Com o `.env` apontando pra prod (`kupnsoyymulbdzakqlqc`):
1. **Dry-run:** `npx tsx scripts/backfill-channel-reclassify.ts` → conferir o resumo (deve mostrar `outro -> blog` ~82, etc.).
2. Se o resumo fizer sentido: `npx tsx scripts/backfill-channel-reclassify.ts --apply`.
3. Validar com a query de origem (os `organico_ig` saem de "outro" e viram "blog").

- [ ] **Step 4: Decisão de deploy**

Não pushar sem autorização explícita do Junior. Apresentar resumo + pedir "manda push" antes de qualquer `git push` / Implantar. (Sem migration — só código + script.)

---

## Self-Review (preenchido)

**Spec coverage:**
- Parte A (persistir CTWA) → Tasks 2, 3.
- Parte B (orgânico → blog, antes de meta) → Task 1.
- `ctwa`→meta (degradação graciosa) → Task 1 + 2.
- Backfill (decisão 2 = sim) → Task 4 + Task 5 Step 3.
- Guard isHot (não sobrescrever) → `shouldAttributeCtwa` (Task 2) + uso na Task 3.
- Fora de escopo (religar campanha, coleta insights, recuperar 168 'direto') → respeitado (backfill só toca leads com sinal).
- Testes TDD → Tasks 1, 2.

**Placeholder scan:** sem TBD/TODO; todo passo tem código ou comando concreto.

**Type consistency:** `buildCtwaPatch`, `shouldAttributeCtwa`, `resolveCampaignIdFromAd`, `resolveChannel`, `leadRowToChannelInput`, `tokenToChannel` usados com nomes idênticos entre tasks. `CtwaPatch` shape coerente com o `.update()` em index.ts.
