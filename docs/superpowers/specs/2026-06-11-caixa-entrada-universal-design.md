# Spec — Fatia 3: Caixa de Entrada Universal (Financeiro)

**Data:** 2026-06-11
**Status:** Aprovada pelo Junior (design validado em 3 partes na sessão de 11/06)
**Fase:** Fase 1 do Departamento Financeiro — Fatia 3 (depois da Fatia 1 Proposta Multi-Serviço e Fatia 2 Núcleo Financeiro, ambas LIVE)
**Spec base:** `Documents\EcoSunPower\Financeiro\PLANO-Departamento-Financeiro.md` (seção 6.1)

## 1. Objetivo

O Junior manda do jeito mais fácil naquele momento — foto, PDF, áudio, vídeo ou texto
pelo WhatsApp — e o sistema cuida do resto: lê, classifica, etiqueta PF/PJ, arquiva o
comprovante e lança no financeiro. O dashboard passa a mostrar **entrou × saiu × lucro
real**, fechando o ciclo do dinheiro (a Fatia 2 cobriu só o lado da receita).

## 2. Decisões cravadas (perguntas respondidas pelo Junior)

1. **Escopo:** gasto (despesa) E entrada avulsa (dinheiro que entra fora do `/fechar`).
2. **Gatilho:** Eva entende sozinha — sem comando obrigatório, sem regra pra decorar.
   Mesma filosofia do "já incluso": ela classifica a intenção, o sistema executa.
3. **Confirmação:** Eva sempre mostra o que leu + botões `[Confirmar] [Corrigir]
   [Descartar]`. Só lança depois do clique. Nada entra no caixa sem confirmação.
4. **Categorias:** lista fixa seedada (13, já incluindo "outros"). Eva escolhe a mais
   parecida; sem encaixe, cai em "outros".
5. **PF vs PJ:** os dois entram, com etiqueta, mundos separados. Lucro da empresa
   conta SÓ PJ.
6. **Vínculo com obra:** "vincula quando der" — se o Junior citar cliente/obra, guarda
   o vínculo (`lead_id`/`fechamento_id`); se não citar, fica sem, sem pergunta chata.
7. **Pós-lançado:** tudo pelo zap — texto livre lança ("gastei 80 de almoço"), corrige
   ("o do posto era 350") e apaga ("apaga o último gasto"), sempre com confirmação por
   botão. Dashboard só exibe (sem formulário nesta fatia).
8. **Abordagem:** leitor dedicado (módulo próprio, prompt especializado, pipeline
   determinístico) — NÃO action no system-prompt gigante da Eva. Eva classifica,
   SISTEMA calcula e lança (Eva nunca faz conta de cabeça).

## 3. Arquitetura

### 3.1 Visão geral do fluxo

```
Admin manda mídia/texto pra Eva (WhatsApp)
  └─ isAdminPhone? não → fluxo normal de cliente (nada muda)
  └─ está em modo /proposta, /preco, /fechar, etc.? → mídia/texto é do modo (nada muda)
  └─ senão → LEITOR FINANCEIRO:
       foto/PDF  → Opus (vision/document, prompt especializado)
       áudio     → Whisper (transcriber.ts, já existe) → texto → extrator
       vídeo     → transcrição do áudio do vídeo (cap 20MB, já existe) → texto → extrator
       texto     → gate barato (Haiku) "é assunto financeiro?" → sim → extrator (Opus)
  └─ extrator devolve JSON estruturado
       não é assunto financeiro → devolve pro fluxo normal da Eva (conta de luz de
       cliente, foto de obra, etc. seguem como hoje)
       é → valida + arquiva comprovante + grava PENDENTE + resumo com botões
  └─ clique [Confirmar] → status confirmado → entra nos KPIs
```

### 3.2 Componentes novos (todos em `src/modules/financeiro/`)

| Arquivo | Responsabilidade |
|---|---|
| `caixa-entrada.ts` | Orquestrador: recebe (texto transcrito ou mídia) do admin, chama gate/extrator, valida, grava pendente, monta resumo + botões. Ponto único de entrada chamado pelos handlers do `index.ts`. |
| `extrator-lancamento.ts` | Chamadas de IA: gate de intenção (Haiku, barato, só pra texto) e extração estruturada (Opus, com fallback Haiku em 429/5xx — mesmo padrão do `vision.ts`). Prompt especializado devolve JSON. Função pura de parse/validação do JSON (testável sem IA). |
| `lancamentos-repo.ts` | Acesso a banco: criar pendente, confirmar, descartar, apagar (soft), corrigir, buscar último / por descrição, detectar duplicado, expirar pendentes >24h. |
| `comprovantes.ts` | Upload do original pro bucket `financeiro-comprovantes` (reusa padrão `anexos/storage.ts`), path `{YYYY-MM}/{uuid}.{ext}`, signed URLs pro dashboard. |
| `resumo-lancamento.ts` | Função pura: monta o texto do resumo ("Li: 💸 R$ 380,00 · Posto Shell · Combustível · PJ · hoje") e os botões. Testável. |

Alterações em código existente:
- `src/index.ts`: nos 4 handlers de mídia + no fluxo de texto, quando `isAdminPhone` e
  fora de modos, rotear pelo `caixa-entrada.ts` antes do fluxo atual. Roteador de botões
  ganha o prefixo `finlan:`.
- `src/modules/dashboard/financeiro-queries.ts` + `financeiro-views.ts`: KPIs e
  visualizações novas (seção 6).

### 3.3 Contrato do extrator (JSON)

```json
{
  "financeiro": true,
  "tipo": "despesa" | "entrada",
  "valor": 380.00,
  "data": "2026-06-11",
  "contraparte": "Posto Shell",
  "categoria_slug": "combustivel",
  "pf_pj": "PJ",
  "obra_ref": "João" | null,
  "campos_faltando": ["valor"],
  "confianca_baixa": false
}
```

Regras do prompt do extrator:
- NUNCA inventar valor: se não conseguir ler, listar em `campos_faltando` — a Eva
  pergunta, não chuta (lição do caso Marcelo: 85 kWh numa conta de R$490).
- `financeiro: false` quando o conteúdo for de cliente/obra/proposta → devolve pro
  fluxo normal.
- Data ausente em comprovante = data de hoje (comprovante recém-tirado), mas marcada
  como assumida no resumo ("hoje").
- `pf_pj`: na dúvida, NÃO assume — entra em `campos_faltando` e a Eva pergunta com
  botões `[PF] [PJ]`.
- Categoria: escolher a mais parecida da lista fixa; sem encaixe → `outros`.

### 3.4 Correção e exclusão pós-lançado (pelo zap)

O gate de texto também reconhece intenção de **corrigir/apagar**:
- "apaga o último gasto" → busca o último confirmado → mostra + botão
  `[Apagar mesmo] [Deixa]`.
- "o gasto do posto era 350" → busca por contraparte/categoria nos últimos 30 dias
  (mais recente primeiro) → mostra ANTES/DEPOIS + `[Confirmar correção] [Deixa]`.
- Eva nunca apaga/edita sem clique. Apagado = soft delete (`status='apagado'`),
  histórico preservado, sai dos KPIs.
- Corrigir pendente (antes de confirmar): clique em `[Corrigir]` → Eva pergunta o que
  está errado → resposta em texto livre re-passa pelo extrator (com o JSON anterior
  como contexto) → novo resumo + botões.

## 4. Banco de dados — migration 047 (`047_financeiro_caixa_entrada.sql`)

### 4.1 `financeiro_categorias`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `slug` | text UNIQUE | ex.: `combustivel` |
| `nome` | text | ex.: "Combustível" (PT-BR, com emoji no front) |
| `ativo` | boolean default true | |

Seed (13): combustível, material elétrico, equipamento/kit, mão de obra, alimentação,
ferramenta, veículo/manutenção, marketing/anúncios, software/assinatura, imposto/DAS,
pró-labore, taxa bancária, outros. Adicionar nova = 1 INSERT.

### 4.2 `financeiro_lancamentos`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `tipo` | text CHECK in ('despesa','entrada') | |
| `status` | text CHECK in ('pendente','confirmado','apagado') | pendente sobrevive a restart (lição Fatia 2: estado em memória zera) |
| `valor` | numeric(14,2) > 0 | |
| `data_evento` | date | data do gasto/entrada |
| `competencia` | text (YYYY-MM) | derivada de `data_evento`, casa com o padrão da Fatia 2 |
| `contraparte` | text | quem (posto, fornecedor, cliente) |
| `descricao` | text | livre |
| `categoria_id` | uuid FK financeiro_categorias | |
| `pf_pj` | text CHECK in ('PF','PJ') | |
| `lead_id` | uuid FK leads, nullable | vínculo de obra "quando der" |
| `fechamento_id` | uuid FK fechamentos, nullable | idem |
| `conta_id` | uuid FK financeiro_contas_a_receber, nullable | preenchido quando entrada casa com conta a receber |
| `storage_path` | text nullable | comprovante no bucket; null = lançado sem anexo (upload falhou ou texto puro) |
| `mime_type` | text nullable | |
| `origem` | text CHECK in ('zap_midia','zap_texto') | |
| `message_id` | text nullable | rastreio WhatsApp |
| `extracao` | jsonb nullable | JSON cru da IA (auditoria do que ela leu) |
| `created_at` / `updated_at` | timestamptz | |

Índices: `(status)`, `(competencia)`, `(tipo, competencia)`, `(categoria_id)`,
`(pf_pj, competencia)`.

Dedupe de duplicado: consulta (mesmo `valor` + `contraparte` normalizada + `data_evento`
+ status confirmado) — sem unique index, porque duplicado legítimo existe (2 almoços);
vira AVISO com botão "Lançar mesmo assim".

### 4.3 O que NÃO muda

Tabelas da Fatia 2 intactas. Entrada avulsa PJ usa o motor existente (4.4).

### 4.4 Entrada de dinheiro — regras

1. **Casa com conta a receber aberta** (Eva reconheceu o cliente e existe conta
   pendente/parcial): oferece botão "É da venda do João (R$ X em aberto)" → usa
   `handleRecebimento`/`registrarRecebimento` da Fatia 2 (imposto confirmado, RBT12,
   rastro em `financeiro_recebimentos`). O lançamento grava `conta_id` e NÃO soma
   receita de novo (a Fatia 2 já soma) — fica só como espelho na lista da Caixa.
2. **Entrada avulsa PJ** (receita sem venda no sistema): ao confirmar, cria conta a
   receber avulsa (`fechamento_id` null) + recebimento total imediato pelo motor da
   Fatia 2 → imposto e RBT12 certos sem duplicar lógica. Requer função nova
   `criarContaAvulsa()` em `contas.ts` (variação de `criarContaDeFechamento` sem
   fechamento; pede atividade com botões — Instalação/Equipamento/Comissão — igual ao
   engate do `/fechar`).
3. **Entrada PF** (ex.: pró-labore caiu na conta pessoal): grava só em
   `financeiro_lancamentos`, não mexe em imposto/RBT12.

## 5. Storage

- Bucket novo **privado** `financeiro-comprovantes` (separado de `client-attachments`,
  que é PII de cliente). Path: `{YYYY-MM}/{uuid}.{ext}`.
- Upload best-effort ANTES da confirmação (arquiva já no pendente; descartado/expirado
  mantém o arquivo — barato e auditável).
- Falha de upload NÃO bloqueia o lançamento (dinheiro primeiro): Eva avisa e pede
  reenvio; `storage_path` fica null até reenviar.
- Dashboard abre o comprovante via signed URL (helper `getSignedUrls` existente).

## 6. Dashboard `/dashboard/financeiro` (evolução da tela da Fatia 2)

Mesmo padrão dark neon HUD, PT-BR, mobile, ECharts (regras do plano, seção 7.5).

- **KPIs novos:** 💸 Saiu no mês (PJ, despesas confirmadas da competência) e
  💰 **Lucro do mês = Recebido (PJ) − Saiu (PJ) − Imposto a separar**. Fórmula visível
  num subtítulo (fácil pra leigo).
- **Card "Mundo PF"** separado: entrou/saiu PF do mês — nunca mistura com PJ.
- **Pizza por categoria** (despesas PJ do mês).
- **Gráfico entrou × saiu** mês a mês (barras lado a lado; reusa a série de
  faturamento + nova série de despesas).
- **Lista de lançamentos** (últimos 50): data, tipo (💸/💰), valor, contraparte,
  categoria, etiqueta PF/PJ colorida, link do comprovante (signed URL). Filtros por
  querystring: período, categoria, PF/PJ, tipo.
- KPIs existentes (RBT12, faixa, imposto, a receber, Fator R) continuam.

## 7. Erros e casos-limite

| Caso | Comportamento |
|---|---|
| IA não leu valor/dado essencial | Eva pergunta (nunca chuta); resposta completa o pendente |
| Mídia ilegível | "Não consegui ler — me fala o valor e o que foi?" → segue como texto |
| Duplicado aparente (valor+contraparte+dia) | Aviso ⚠️ + botão "Lançar mesmo assim" |
| Clique duplo no botão | Idempotente: handler confere `status` antes de agir (trava da Fatia 2) |
| Upload do comprovante falhou | Lança sem anexo + Eva pede reenvio |
| Pendente sem clique | Expira em 24h (varredura preguiçosa ao criar novo pendente — sem cron novo) |
| Cliente manda comprovante | Não cai no financeiro (gate `isAdminPhone`) |
| Admin em modo /proposta etc. | Mídia/texto pertence ao modo, leitor não roda |
| Falha da API de IA | Fallback Opus→Haiku; persistindo, Eva avisa "tenta de novo" — nada é lançado |
| Botão de pendente já expirado/descartado | "Esse lançamento não está mais pendente" |

## 8. Testes (TDD, padrão Fatia 2)

Peças puras com teste primeiro, IA sempre mockada:
- Parse/validação do JSON do extrator (campos faltando, valores inválidos, categoria
  desconhecida → `outros`).
- `resumo-lancamento.ts` (texto + botões, incluindo aviso de duplicado e PF/PJ
  pendente).
- Repo: criar/confirmar/descartar/apagar/corrigir, dedupe, expiração 24h, idempotência
  de clique duplo.
- Entrada: roteamento conta-aberta × avulsa PJ × PF; `criarContaAvulsa` (imposto via
  motor existente — valores-âncora conferidos).
- Queries do dashboard: lucro = recebido − saiu − imposto; mundos PF/PJ separados;
  filtros.
- Guardrail: lançamento NUNCA criado sem clique de confirmação.

Critério de pronto: suite inteira verde + `tsc` limpo + 3 rodadas de code review
(regra do Junior) antes de pedir autorização de push.

## 9. Fora desta fatia (anotado, não esquecido)

- Lucro POR OBRA (Fase 2) — o vínculo `lead_id`/`fechamento_id` já fica guardado.
- Open Finance / extrato bancário automático.
- Formulário de lançamento/correção no dashboard.
- Gasto recorrente automático (assinaturas).
- Cruzamento nota × depósito e relatório pro contador (Fase 2 — Fatia 4).

## 10. Riscos e atenções

- **Custo de IA:** gate de texto usa Haiku (centavos); Opus só quando o gate diz que é
  financeiro ou quando é mídia de admin fora de modo. Mídia de admin é rara (dezenas/
  mês), custo desprezível.
- **MCP Supabase aponta pro projeto errado** — migration 047 vai em ARQUIVO na Área de
  Trabalho com linhas curtas pro Junior aplicar no SQL Editor (lição da 046).
- **Bucket novo** precisa ser criado no projeto certo (`kupnsoyymulbdzakqlqc`) — passo
  do deploy, documentar no plano.
- **Receita jan–mai/2026 zerada** (pendência da Fatia 2): o LUCRO do mês não depende
  disso, mas o imposto/RBT12 sim — pedir valores ao Edmilson continua pendente.
