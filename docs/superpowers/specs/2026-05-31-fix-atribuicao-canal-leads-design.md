# Fix Atribuição de Canal dos Leads — Design

**Data:** 2026-05-31
**Branch:** `fix/atribuicao-canal-leads`
**Status:** Em revisão (2 decisões pendentes do Junior)

## Problema (diagnóstico confirmado em prod)

Dos 269 leads, a atribuição de canal está quebrada: **168 "direto" (62%) + 94 "outro" (35%), só 3 "meta"** — apesar de campanhas CTWA terem rodado. Duas causas distintas:

1. **CTWA não persiste a atribuição.** O lead que clica num anúncio Meta (Click-to-WhatsApp) tem o `ad_id` capturado (`meta-whatsapp.ts:347` → `referral.source_id`), mas no processamento (`index.ts:~3013`) esse `ad_id` é usado **só pra escolher o template de auto-ack** — nunca é gravado no lead. Sem `ad_campaign_id` nem `lead_source`, o `resolveChannel` não vê sinal → joga em **"direto"**. Por isso ~todo lead pago vira invisível.

2. **`organico_ig` mal classificado.** 82 dos 94 "outro" têm `lead_source='organico_ig'` (Instagram orgânico — aquisição grátis). O `tokenToChannel` (`resolve-channel.ts:21`) tem a regex de `meta` (que casa `ig`) ANTES da de orgânico, e não há bucket de "orgânico social" — então `organico_ig` ou cai em "outro" (histórico) ou seria erroneamente contado como **paid meta** (a regex `ig` casa). Resultado: tráfego orgânico misturado/perdido.

## Objetivo

Daqui pra frente, classificar corretamente: **CTWA → `meta`** (com `ad_id`/`ad_campaign_id`), **Instagram/Facebook orgânico → bucket orgânico** (distinto de paid). Assim, quando o Junior religar os anúncios, cada lead já vem etiquetado com a origem certa — pré-requisito pra medir CPL/ROI.

## Estado atual (referências de código)

- **Captura referral CTWA:** `src/modules/meta-whatsapp.ts:347-364` (monta `referral.sourceId` = ad_id).
- **Uso atual (só template):** `src/index.ts:~3006-3050` — lê `ctwaReferral.sourceId`, NÃO grava no lead.
- **Modelo a espelhar (leadgen grava certo):** `src/index.ts:4409-4436` — escreve `ad_campaign_id`/`ad_id`/`lead_source` + recalcula `channel`, com guard `isHot` (não sobrescreve lead que já avançou).
- **Tracking por wa.me tag:** `src/index.ts:2906-2964` (`parseTrackingTag` → grava `lead_source`).
- **Classificador:** `src/modules/dashboard/resolve-channel.ts` (`tokenToChannel`, `resolveChannel`) + `channel-mapper.ts` (`leadRowToChannelInput`).

## Solução

### Parte A — Persistir atribuição do CTWA no inbound

No handler de mensagem (`index.ts`), no fluxo CTWA, quando **lead novo** (ou lead **sem atribuição prévia** — espelhar o guard `isHot` do leadgen) **e** `ctwaReferral?.sourceId` presente:

- Gravar `ad_id = ctwaReferral.sourceId`.
- Resolver `ad_campaign_id` via Meta Graph API (`GET /{ad_id}?fields=campaign_id`) — **best-effort**: se a chamada falhar/timeout, segue sem campaign_id (não bloqueia).
- Gravar `lead_source = 'ad_ctwa'`.
- Recalcular `channel = resolveChannel(...)` → `meta`.
- Guard: **não** sobrescrever atribuição de lead que já tem `ad_campaign_id`/`lead_source` ou status != 'novo'.

**Garantia de classificação:** estender `tokenToChannel` pra reconhecer `ctwa`/`ad_ctwa` → `meta`. Assim o lead vira `meta` mesmo que a resolução do campaign_id falhe (degradação graciosa).

A lógica de montar o patch de atribuição será extraída num **helper puro testável** (ex.: `buildCtwaAttribution(referral, existingLead)`) em `resolve-channel.ts` ou módulo novo, pra TDD sem I/O.

### Parte B — Classificar orgânico social corretamente

No `tokenToChannel`, tratar `organico`/`organic`/`organico_ig`/`organico_fb` **ANTES** da regex de `meta` (pra `ig`/`fb` não capturar orgânico como pago), retornando o bucket de orgânico.

**🔸 DECISÃO 1 (taxonomia):** o bucket orgânico deve ser:
- **(a)** Reusar o canal **`blog`** existente (já é o bucket "orgânico/SEO" no enum). Mais simples, zero migração. *(recomendo)*
- **(b)** Adicionar um canal novo **`organico_social`** ao enum `Channel` (separa IG/FB orgânico de blog/SEO). Mais granular, mas exige tocar enum + lugares que listam canais.

### Backfill (opcional)

Os leads "direto" do CTVA passado **não dá pra recuperar** (o `ad_id` nunca foi salvo — dado inexistente). Mas os **82 `organico_ig` + demais "outro" que TÊM `lead_source`** podem ser reclassificados recomputando o `channel`.

**🔸 DECISÃO 2 (backfill):** rodar um UPDATE único que recalcula `channel` pra todos os leads que têm `lead_source`/`utm`/`origin` preenchidos, recuperando os ~82 orgânicos + outros?
- **(a)** Sim — script `scripts/backfill-channel-reclassify.ts` (idempotente, só recomputa, não inventa dado). *(recomendo — recupera 82+ leads de graça)*
- **(b)** Não — só corrigir daqui pra frente.

## Fora de escopo (YAGNI)

- **Religar campanhas / orçamento** — decisão de negócio do Junior (29 pausadas, 2 ativas com R$0).
- **Coleta de `meta_ads_insights`** — não é bug; está vazia porque não há entrega/gasto. Volta a popular sozinha quando houver anúncio rodando.
- **Recuperar atribuição dos 168 "direto"** — impossível (dado nunca existiu).

## Testes (TDD)

- `tokenToChannel('ad_ctwa')` / `('ctwa')` → `meta`.
- `tokenToChannel('organico_ig')` / `('organico_fb')` → bucket orgânico (NÃO `meta`, NÃO `outro`).
- `resolveChannel` com `adCampaignId` resolvido → `meta`; com só `lead_source='ad_ctwa'` (campaign_id null) → `meta`.
- `buildCtwaAttribution`: lead novo c/ referral → patch com ad_id + lead_source + channel='meta'; lead `isHot` → retorna vazio (não sobrescreve); sem referral → vazio.
- (se Backfill aprovado) função pura de reclassificação: dado um row com `lead_source='organico_ig'`, retorna `channel` orgânico.
