# Eva Consultora na Proposta — Fatia 2 (conversa inteligente)

> Spec de design. Junior aprovou A+B+C ("vamos finalizar tudo") em 18/06/2026.

## Objetivo

Depois que o cliente recebe a abordagem (Fatia 1) e **responde**, a Eva deve virar uma
**consultora/fechadora inteligente** que conhece a proposta DAQUELE cliente, conversa em
cima dos números reais, persuade sem ser chata, reaborda nas reaberturas (alternando) e
passa pro Junior quando o cliente pede.

## Contexto atual (o que já existe)

- `brain.ts` — `processMessage(text, history, knowledge, summary, qualStep)` → Haiku.
  Monta system via `buildSystemBlocks` (bloco estável cacheado + bloco volátil). O
  `knowledge` é injetado e já é o canal por onde entram `leadContext` e
  `contextoAbordagem` (index.ts ~4286).
- `transfer_to_human` (index.ts ~4528) — ação que JÁ faz handoff: marca lead
  `transferido`, avisa o Junior com botão **Assumir / Ver perfil**, Eva fica em pausa.
- `janela24hAberta(phone)` (index.ts ~751) — helper que checa `last_message_at` < 24h.
- `proposal-followup.ts` — `runReaberturaAsync` já trata reabertura (Fatia 1: aborda
  antigo nunca-abordado, ou só notifica quem já foi abordado, com throttle 5min).
- `propostas_publicas` — tem `cliente_telefone`, `cliente_nome`, `dados_input` (números
  da proposta: potência, valor, economia, equipamentos, garantias) por slug.

## Parte A — Eva enxerga a proposta do cliente (o coração)

**O quê:** quando chega mensagem de um cliente que TEM proposta pública, injeta no cérebro
um bloco com (1) os números reais da proposta dele e (2) a postura de consultora/fechamento.

**Componentes:**
- `montarContextoProposta(from)` (index.ts, perto da montagem do `knowledge` ~4286):
  busca a proposta mais recente do telefone em `propostas_publicas`; se não houver,
  retorna `''`. Se houver, extrai os números-chave de `dados_input` (potência kWp, valor
  total R$, economia mensal estimada, payback, módulos/inversor, garantias) e devolve um
  bloco de texto pronto.
- `prompts/consultora-proposta.md` (NOVO) — a postura: "o cliente JÁ tem a proposta abaixo
  na mão; seu papel é ajudá-lo a DECIDIR e FECHAR — usar os números reais, comparar opções,
  tirar dúvida, quebrar objeção, com firmeza consultiva e SEM insistência (respeita o
  'não'); se ele pedir pra falar com o Junior/responsável, emita a ação `transfer_to_human`
  com `reason`; nunca prometa o que não está na proposta."
- O bloco final = `consultora-proposta.md` + os números renderizados, concatenado em
  `knowledge` (mesmo canal de `contextoAbordagem`, zero mudança na assinatura do Brain).

**Dados:** só leitura de `propostas_publicas`. Nenhuma migration.

**Erro:** `montarContextoProposta` nunca lança — try/catch → `''` (degrada pro fluxo
normal da Eva, igual hoje).

**CONHECIMENTO TÉCNICO (requisito do Junior 18/06):** o bloco da proposta é ADICIONADO
ao `knowledge`, NÃO substitui. A Eva continua recebendo TODA a base técnica em cada
mensagem (igual hoje): core files + chunks RAG recuperados por query — datasheets de
equipamentos, cálculos/dimensionamento, **normas (NBR, Lei 14.300/MMGD), rateio, geração
compartilhada, autoconsumo remoto/local**, garantias, marcas. Então se o cliente perguntar
qualquer coisa técnica no meio do fechamento, ela responde na ponta da língua — com a base
de sempre + agora os números da proposta dele. O `consultora-proposta.md` reforça
explicitamente: "Para qualquer dúvida técnica (normas, rateio, autoconsumo remoto,
equipamentos, cálculo), use sua base de conhecimento completa — você domina a parte técnica
de energia solar; nunca diga que não sabe sem checar a base. (Eva é CONSULTORA; o
Responsável Técnico CREA/CFT é o Junior.)"

## Parte B — Abordagem proativa na reabertura (uma sim, outra não)

**O quê:** cliente que JÁ foi abordado e JÁ respondeu (janela 24h aberta), ao reabrir a
proposta, recebe uma mensagem **inteligente e variada** gerada na hora — alternando
(reabre→aborda, reabre→só avisa, reabre→aborda…).

**Componentes (em `runReaberturaAsync`, ramo "já abordado"):**
1. Se a janela 24h estiver FECHADA (cliente não respondeu) → comportamento atual (só
   notifica o Junior com throttle). Texto livre fora da janela é proibido pela WABA.
2. Se a janela estiver ABERTA → contador de alternância no Redis
   (`proposal:reopen-count:${slug}` via `INCR`):
   - contador ÍMPAR (1º, 3º…) → **aborda**: gera mensagem inteligente, manda free text pro
     cliente, grava na conversa (dashboard). Também avisa o Junior ("Eva reabordou Fulano").
   - contador PAR (2º, 4º…) → só notifica o Junior (como hoje).
3. Gerador injetado via deps: `gerarAbordagemInteligente?(slug, telefone): Promise<string|null>`.
   Definido em index.ts (onde vivem Brain/Anthropic): monta um prompt curto com os números
   da proposta + histórico recente e pede UMA mensagem humana, curta, variada, consultiva
   ("notou que ele voltou, oferece ajuda/comparação"). Retorna o texto ou `null` em falha.
4. Se o gerador falhar/voltar `null` → cai no "só notifica" (nunca trava, nunca mensagem
   vazia).

**Envio:** reusa `this.sendText(telefone, msg)` (genérico, já existe). Dentro da janela
24h o free text é permitido.

**Idempotência/limite:** o `INCR` por slug dá a alternância; o gerador só roda no ramo
ímpar + janela aberta. Sem migration.

## Parte C — Handoff pro Junior (reaproveita o que existe)

**O quê:** cliente pede "quero falar com o Junior / com o responsável" → Eva avisa o Junior
e se cala; diz pro cliente que já chamou.

**Componentes:** quase tudo já existe (`transfer_to_human`). Trabalho novo:
- A instrução está no `consultora-proposta.md` (Parte A): quando o cliente pedir o humano,
  o Brain emite `transfer_to_human` com `reason: "cliente quer falar com o Junior sobre a
  proposta"`, e responde ao cliente algo curto tipo "já avisei o Junior, ele te chama já já".
- Verificar que `transfer_to_human` deixa a Eva em pausa adequada (já marca `transferido` +
  botão Assumir). Sem código novo além de garantir o caminho.

## Componentes & arquivos (resumo)

| Arquivo | Mudança |
|---|---|
| `src/prompts/consultora-proposta.md` | NOVO — postura consultora/fechamento + regra de handoff |
| `src/index.ts` | `montarContextoProposta(from)` + injeção no `knowledge`; `gerarAbordagemInteligente` passado pro proposal-followup |
| `src/modules/proposal-followup.ts` | ramo "já abordado" da reabertura: janela 24h + alternância Redis + gerador |
| `src/modules/proposal-context.ts` (talvez) | extrair os números de `dados_input` → texto (unidade testável isolada) |

## Testes

- `montarContextoProposta`/extrator: sem proposta → `''`; com proposta → bloco com os
  números certos; `dados_input` faltando campos → não quebra.
- Reabertura Parte B: janela fechada → não manda free text (só notifica); janela aberta +
  contador ímpar → chama gerador e manda; par → só notifica; gerador `null` → só notifica.
- Prompt `consultora-proposta.md`: smoke de que o arquivo carrega e o bloco entra no Brain.

## Fora de escopo (YAGNI)

- Trocar o modelo (segue Haiku; inteligência vem do contexto).
- Cadência nova (a existente já cobre o sumiço).
- Mexer no fluxo de qualificação base da Eva (só adiciona o bloco da proposta).

## Ordem de build

A → C → B (A é o coração; C é rápido reusando `transfer_to_human`; B é a cereja).
