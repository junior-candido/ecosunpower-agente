# Proposta de serviço com preço por item (e botão do menu que abre o modo)

Data: 2026-07-02
Autor: Junior + Claude

## Problema

O Junior quer dar **preço por serviço** ("padrão R$ 2.500, SPDA R$ 1.800,
projeto R$ 900") e a proposta **somar sozinha** — cliente pede os valores
separados. Hoje isso quebra em DOIS pontos, um atrás do outro:

1. **O botão "🔧 Proposta de serviço" do menu não abre o modo proposta** — é
   só um texto de dica (`hint` em `menu.ts:38`). Pior: o exemplo da dica
   ("proposta de serviço pro Thiago — … total R$ 7.800") **não dispara o
   gatilho** (`isProposalTrigger` só reconhece `/proposta`, "proposta" solta
   ou "gerar/fazer/montar/criar proposta…"). A mensagem cai solta, a Caixa de
   Entrada do Financeiro vê "R$" e trata como **entrada de dinheiro** (botões
   PF/PJ) — exatamente o que aconteceu com o Junior.
2. **O cérebro da Eva é instruído a preferir valor único.** A regra 10 do
   prompt (`proposal-assistant.ts` ~linha 428) diz "serviço quase sempre é
   orçado por UM VALOR ÚNICO… deixe as tarefas SEM preço por item". A dica do
   menu ensina o mesmo.

O resto do sistema **já funciona por item**: `mapServicosTitulos` mantém
`valorRs` quando vem, `totalServicoData` soma os itens quando algum tem preço
(senão usa o `valorTotalRs`), e o layout só-serviço mostra o preço embaixo de
cada serviço + total no final. Nada de novo é preciso no render/cálculo.

## Objetivo

Preço por item vira **caminho oficial** da proposta de serviço, com soma
automática pelo sistema; e o botão do menu passa a **abrir o modo de verdade**
pra mensagem nunca mais vazar pro Financeiro.

## O que muda

### 1. Menu (`src/modules/menu/menu.ts`)

`menu_proposta_servico` deixa de ser `hint` e vira gatilho real, no mesmo
padrão do `menu_proposta`:

- `trigger: '/proposta de serviço'` + `handler: deps.proposal` — tocar no
  botão abre o modo proposta já com "de serviço" no texto-semente (a Eva
  entende o sabor da conversa desde a 1ª mensagem).
- `description`: troca "Sem solar — valor único" por "Sem solar — por item ou
  valor fechado".

(O gatilho `/proposta de serviço` já passa no `isProposalTrigger` atual —
começa com `/proposta` — então o botão funciona sem mexer no gatilho.)

### 2. Gatilho de texto (`ProposalAssistant.isProposalTrigger`)

Aceitar também **"proposta de serviço …" escrito solto** (sem barra), que é o
jeito que a própria dica antiga ensinava e o Junior naturalmente escreve:

- Nova regra: texto normalizado começando com `proposta de servico` (com ou
  sem `/`, acento já é removido pela normalização) → dispara.
- Escopo contido de propósito: "proposta de serviço…" é inequívoco; frases
  genéricas com "proposta" no meio continuam NÃO disparando.

### 3. Prompt da Eva (regra 10 de SERVIÇOS, `proposal-assistant.ts`)

Reescrever o trecho de **PROPOSTA SÓ DE SERVIÇO**:

- **Dois jeitos de precificar, ambos oficiais:**
  - **Por item** (novo padrão quando o Junior dá preços por tarefa): preencher
    `servicos[].valorRs` de CADA tarefa. NÃO pedir valor total — **o sistema
    soma** (nunca a Eva de cabeça — regra de ouro mantida).
  - **Valor fechado** (continua valendo): o Junior dá um número só → vai em
    `valorTotalRs`, tarefas sem `valorRs` (comportamento de hoje, intocado).
- **Trava da soma furada:** se o Junior precificou por item mas alguma tarefa
  ficou sem preço, a Eva pergunta o preço DESSA tarefa (`action: ask_more`)
  em vez de gerar com a soma incompleta. Se ele responder que "está incluso"
  em outra, a tarefa fica com `valorRs: 0` e a informação vai na `descricao`
  ("incluso no serviço X") — o total continua certo.
- **Conflito:** se o Junior der preços por item E um total que não bate com a
  soma, a Eva NÃO escolhe: mostra a soma dos itens e pergunta qual vale.
- **Resumo de conferência (`ready_to_generate`):** na proposta de serviço, o
  resumo lista cada serviço com seu preço + a soma no final, pra bater o olho:
  `• Adequação de padrão — R$ 2.500` / `• SPDA — R$ 1.800` / `💵 Total: R$ 5.200`.

### 4. Sem mudança de motor

`mapServicosTitulos`, `totalServicoData`, `renderServiceOnlyHTML`,
`renderServicosAdicionaisSection`, formas de pagamento e fluxo solar ficam
**como estão** — a conta por item já existe e já aparece na página do cliente.
O Financeiro (Caixa de Entrada) também fica intocado: ele continua pegando
gasto/receita normal; com o modo proposta aberto, a mensagem nunca chega nele
(ordem de rotas já garante — proposta vem antes do caixa no index).

## O que NÃO muda (compatibilidade travada)

- Proposta solar (básica/personalizada/comparação/híbrido): intocada.
- Serviços adicionais DENTRO da proposta solar (regra 10 primeira parte,
  `jaIncluso` etc.): intocados.
- Proposta de serviço por valor único: continua funcionando igual.
- Financeiro/Caixa de Entrada, precificadora, fechamento: intocados.
- Sem migration, sem tela nova.

## Tratamento de erro

- Item sem preço no meio de uma precificação por item → Eva pergunta (não
  gera com soma furada).
- Total informado ≠ soma dos itens → Eva pergunta qual vale (não escolhe).
- Nada disso muda o código de cálculo: `totalServicoData` já ignora itens sem
  preço e já prefere a soma quando existe.

## Testes

- **`isProposalTrigger`:** "proposta de serviço pro Thiago…" (sem barra) →
  true; "/proposta de serviço" → true (já passa); "a proposta de serviço do
  concorrente" → false (não começa com o termo); casos atuais seguem passando.
- **Menu:** item `menu_proposta_servico` tem `trigger`+`handler` (não `hint`);
  os testes de menu existentes que validam limite de linhas seguem verdes.
- **Prompt:** teste de conteúdo garantindo que a regra reescrita cita
  preencher `valorRs` por item e a trava de item sem preço (mesmo padrão dos
  testes de prompt existentes, se houver; senão, validação manual no smoke).
- **Puro (já coberto):** `totalServicoData` soma itens / cai no valor único —
  testes existentes continuam valendo.
- **Validação real (smoke do Junior):** tocar no botão do menu → mandar
  "adequação de padrão 2500, SPDA 1800, projeto 900" → conferir resumo
  itemizado com total R$ 5.200 → gerar → página mostra os 3 preços + total.
