# Eva Analista de Campanhas — Design (Peça 1)

**Data:** 2026-06-03
**Status:** aprovado pra implementação
**Autor:** brainstorm Junior + Claude

## Contexto

A Eva já capta leads de anúncios (CTWA e formulário), qualifica (critério R$700 / 700 kWh)
e tem dashboard. A Meta só enxerga cliques/leads brutos; a Eva sabe quais leads
viraram **bons** (qualificados). Hoje subimos a Conversions API (CAPI) pra CTWA, que
alimenta a otimização automática da Meta. O próximo passo é a Eva usar o que ela sabe
pra **dizer ao Junior onde a verba rende mais**.

## Objetivo desta peça

Dar ao Junior, automaticamente e sem ele pedir, a leitura de **qual campanha traz lead
qualificado mais barato** — e uma recomendação de pra onde mover verba. **Somente
leitura e recomendação.** Nenhuma alteração automática em campanha nesta peça.

## Visão maior (decomposição — pra registro)

Projeto "marketing autônomo" = 4 peças encaixadas:

1. **Atribuição redonda** — saber de qual campanha veio cada lead. (pré-requisito; branch `fix/atribuicao-canal-leads`)
2. **Caminho do formulário na CAPI** — conversão de lead de formulário (matching por `leadgen_id`, `action_source=system_generated`) também alimentar a Meta. Complementa o CTWA já entregue. (peça futura, paralela)
3. **O cérebro** — calcular custo por lead qualificado por campanha + recomendar. ← **ESTA PEÇA** (junto com a 1)
4. **A mão (autonomia com trava)** — pausar/escalar via `ads_management`, com limites e botão de aprovação pro movimento grande. (peça seguinte)
5. **Eva cria campanhas** (peça futura, depois de 1 e 4) — Eva monta campanha completa
   (público/verba/objetivo = otimizar por lead qualificado via CAPI) E gera criativo
   (imagem + copy, que já sabe fazer), com **Advantage+** da Meta refinando em cima.
   Junior abastece uma **pasta** (ex: Drive / inbox tipo `_INBOX-EVA`) com vídeos e
   criativos próprios; a Eva busca lá e usa/mistura nos anúncios. Guardrail: Eva **monta
   e mostra pra Junior aprovar com botão** antes de publicar (não publica sozinha de
   cara). Decisão de produto: criativo = Eva cria + assets do Junior da pasta (opção "a"+).

Ordem aprovada: **1 + 3 agora** (Eva enxerga e recomenda, risco zero), depois **4**
(liga a autonomia), e **2** em paralelo quando quiser. **5** por último (precisa do
cérebro da 1 e da mão da 4 antes).

Decisão de produto: métrica = **custo por lead qualificado**, com lógica **relativa**
(compara campanhas entre si e contra a média; sem teto fixo no começo). Teto absoluto
opcional entra depois (decisão "c").

## Não-objetivos (YAGNI)

- NÃO mexe em verba/status de campanha automaticamente (isso é a Peça 4).
- NÃO usa `ads_management` (só `ads_read`, que já temos).
- NÃO otimiza por custo por venda fechada ainda (volume baixo; entra como desempate depois).
- NÃO cria caminho de formulário na CAPI (Peça 2).

## O que já existe (reaproveitar, não reconstruir)

- `src/modules/marketing/insights-collector.ts` — já puxa gasto/impressões/cliques/ações
  por campanha da Meta Ads API e grava em `meta_ads_insights`. Roda em cron.
- Tabela `marketing_campaigns` (migration 025) — campanhas + `spend_cents` + view com
  `cpl_today_brl` (custo por lead **bruto** — não é o que queremos, mas mostra o padrão).
- `channel_daily_metrics` (migration 037) — métricas diárias por canal, com `spend_cents`.
- Tabela `leads` — tem `ad_campaign_id`, `ad_id`, `lead_source`, `status` (`qualificado`),
  `created_at`. Base pra contar leads qualificados por campanha.
- Padrão de alerta com botões no WhatsApp (eva-alerts / eva-admin-buttons) — reusar pra entrega.
- Follow-up automático de não-respondentes (`followup.ts`, passos 1–7) — já chase, não refazer.

## Arquitetura / componentes

### 1. Atribuição redonda (pré-requisito)
Subir `fix/atribuicao-canal-leads` (4 commits) + rodar backfill + Implantar. Sem isso o
`ad_campaign_id`/`ad_id` por lead não é confiável e a conta de custo-por-qualificado mente.
(Tratado como tarefa 0 do plano; depende de autorização de push do Junior.)

### 2. Calculadora — `src/modules/marketing/campaign-quality.ts` (função PURA)
Entrada:
- lista de `{ campaignId, name, spendBrl }` (gasto na janela)
- lista de `{ campaignId, qualifiedCount, totalLeads }` (leads na janela)
- config: `janelaDias` (default 14), `minLeadsParaJulgar` (default 5)

Saída: por campanha `{ campaignId, name, spendBrl, qualified, costPerQualified | null,
status: 'campea' | 'ok' | 'cara' | 'sem_dados', recomendacao }` + `mediaCostPerQualified`.

Regras:
- `costPerQualified = spendBrl / qualified` (null se `qualified === 0`).
- `status = 'sem_dados'` se `totalLeads < minLeadsParaJulgar` (não opina).
- compara cada campanha com a média geral ponderada das que têm dados:
  - bem abaixo da média → `campea` → "escalar"
  - bem acima da média → `cara` → "cortar verba / pausar"
  - perto da média → `ok`
- "bem abaixo/acima" = fora de ±X% da média (X configurável, default 40%).

### 3. Recomendador — `src/modules/marketing/campaign-recommender.ts` (separado)
Arquivo próprio (separa cálculo puro de geração de texto). Pega a saída da calculadora e monta:
- texto do resumo diário (PT-BR, formato cartão com 🟢/🟡/🔴)
- sugestão de remanejamento: "mover R$N/dia da pior pra melhor → ~K leads bons/sem"
  (estimativa simples baseada no custo-por-qualificado da campeã)

### 4. Entrega
- **WhatsApp:** resumo diário pro `engineerPhone` (cron de manhã), com botões.
  Nesta peça os botões são informativos / "Ver painel" / registrar decisão — NÃO executam
  na Meta. (Execução = Peça 4.)
- **Dashboard:** seção "Qualidade por Campanha" no painel de marketing existente,
  com a tabela rankeada (PT-BR, conforme preferência de observabilidade).

## Fluxo de dados

cron diário → lê `meta_ads_insights`/`marketing_campaigns` (gasto por campanha, 14d)
→ query em `leads` (qualificados por `ad_campaign_id`, 14d) → `campaign-quality` calcula
→ `recommender` monta texto → envia WhatsApp + grava snapshot pro dashboard.

## Tratamento de erros / cuidados

- **Janela justa:** só conta leads com idade suficiente pro follow-up ter rodado (não
  julgar campanha por lead que ainda nem teve chance de responder). Implementação: a
  janela de 14d naturalmente dá folga; reforço = ignorar leads `created_at` < 48h na
  contagem de "não-qualificado" (eles ainda podem qualificar).
- **Volume mínimo:** `< minLeadsParaJulgar` → `sem_dados`, mostra "🟡 juntando dados".
- **Divisão por zero:** `qualified === 0` → `costPerQualified = null`, tratado como
  "cara/sem retorno" só se já passou volume mínimo de leads brutos.
- **Só leitura:** nenhuma chamada de escrita na Meta. Falha de rede/Meta = log, sem
  quebrar nada (segue padrão fire-and-forget).
- **Atribuição faltando:** lead sem `ad_campaign_id` cai num balde "sem origem" e não
  entra no ranking (não contamina).

## Testes (TDD)

`tests/campaign-quality.test.ts` (função pura):
- campanha barata vs cara → ranking e status corretos
- empate (mesmo custo) → ambas `ok`
- volume baixo (`< min`) → `sem_dados`, sem recomendação
- `qualified === 0` com muitos leads brutos → `cara`
- divisão por zero não quebra
- média ponderada ignora campanhas `sem_dados`
- janela: leads < 48h não contam como "não-qualificado"

Recomendador: texto contém campeã/pior corretas; sugestão de remanejamento coerente.

## Dependências / ordem de implementação

0. Subir `fix/atribuicao-canal-leads` + backfill (autorização de push do Junior).
1. `campaign-quality.ts` + testes (TDD).
2. Query de leads qualificados por campanha (em `supabase.ts` ou módulo de marketing).
3. Recomendador + texto.
4. Cron diário + envio WhatsApp com botões informativos.
5. Seção no dashboard de marketing.
6. Code review → push (com autorização) → Implantar.

## Métrica de sucesso

Junior recebe, sem pedir, 1 resumo diário no WhatsApp dizendo qual campanha rende lead
qualificado mais barato e o que fazer — com dado confiável de atribuição por trás.
