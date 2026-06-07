# Cadastro de dono da usina pelo WhatsApp (a partir do alerta)

**Data:** 2026-06-07
**Status:** Especificação aprovada — aguardando plano de implementação

## Problema

Os alertas proativos de usina (offline, queda de geração, etc.) chegam no
WhatsApp do Junior com botões de ação ("Eva avisar", "Eu ligar"). Mas quando a
usina **não tem dono vinculado** (lead órfão — `sistemas_clientes.lead_id` nulo),
o alerta vira um **beco sem saída**:

- A mensagem só mostra "Cliente sem nome cadastrado" — não dá pra saber de quem é.
- O botão "🔧 Eva avisar" é **barrado** pelo próprio sistema (`eva-admin-buttons.ts`
  linha 274: "Sistema sem cliente vinculado — vincule o lead antes").
- O botão "📞 Eu ligar" também não funciona (não há telefone de cliente).
- Hoje só dá pra vincular o dono pelo dashboard — e nem isso está em produção
  (a branch `feat/proprietario-usinas` nunca foi mergeada).

Resultado: o Junior recebe o alerta, quer resolver na hora, e não consegue fazer
nada pelo zap.

## Objetivo

Permitir que o Junior **cadastre/vincule o dono da usina direto pelo WhatsApp**,
no momento em que o alerta chega. Assim que vincular, a usina deixa de ser órfã
e os próximos alertas dela vêm "corretos" (com o nome do dono e os botões que
funcionam). É um atrito que se resolve **uma vez por usina**.

Subir junto a feature de vínculo de dono **pelo dashboard** (branch
`feat/proprietario-usinas`), que já está pronta e fornece as funções de backend
que o fluxo do WhatsApp vai reusar.

## Não-objetivo (fora de escopo)

- Trocar/desvincular dono **pelo zap** de uma usina que já tem dono → isso fica
  no dashboard. O botão do zap aparece **só na usina órfã**.
- Cadastro completo do cliente (e-mail, endereço, CEP) pelo zap → o "Criar novo"
  pelo WhatsApp coleta **nome + telefone** (igual ao dashboard hoje). O resto do
  cadastro é completável pelo dashboard. (O dashboard atual também só pede
  nome+telefone ao criar cliente pra vínculo — não há mismatch.)
- Sugestão automática/IA de qual lead é o dono provável da usina → possível
  evolução futura, não entra agora.

## Modelo de dados (já existente)

- **`sistemas_clientes`** = a usina monitorada. Coluna `lead_id` = o vínculo com
  o dono. `lead_id` nulo ⇒ **usina órfã**.
- **`leads`** = o cliente/dono. Já é populado pelas conversas da Eva no WhatsApp.
  Vincular = setar `sistemas_clientes.lead_id`. Criar novo = inserir em `leads`
  (nome + telefone) e setar `lead_id`.

Nenhuma migration nova é necessária.

## Componentes

### 1. Status do dono em todo alerta + botões da órfã

Arquivo: `src/modules/monitoring/proactive-alerts/format.ts`

`formatAlertMessage` passa a receber a informação de vínculo e renderizar uma
**linha de status do dono** em toda mensagem de alerta:

- **Com dono:** mantém o comportamento atual (mostra o nome do cliente).
- **Sem dono (órfã):** mostra `⚠️ Usina SEM dono vinculado` e **troca o conjunto
  de botões** para o conjunto da órfã.

**Conjunto de botões da órfã** (substitui o conjunto normal, qualquer que seja o
tipo do alerta — offline, queda, etc.):

```
📇 Cadastrar dono   |   🔍 Ver no painel
```

- Sai o "Adiar 3d" (não faz sentido adiar uma órfã — a ação é cadastrar).
- Saem "Eva avisar" e "Eu ligar" (não funcionam sem cliente vinculado).
- `📇 Cadastrar dono` → `evabt:dono-cad:<sistemaId>`
- `🔍 Ver no painel` → reusa o `alert-ver` existente (`evabt:alert-ver:<sistemaId>`).

Sem spam: o alerta da órfã respeita o throttle de 3 dias que já existe no
dispatcher. Volta a cada 3 dias até o dono ser vinculado, aí a usina sai da
orfandade e o alerta normaliza.

### 2. Fluxo conversacional "Cadastrar dono" no zap

Modelado no mesmo padrão do fluxo `/fechar` que já existe: **estado em Redis**
por telefone do admin, com TTL. Key sugerida: `dono-cad:<phone>` (TTL ~10 min),
análogo ao `closing:<phone>`.

Handlers de botão registrados em `tryHandleEvaAdminButton`
(`src/modules/eva-admin-buttons.ts`), seguindo o padrão `onFechar*` (callbacks
injetados a partir do `index.ts`).

**Passo 0 — início.** Junior clica `📇 Cadastrar dono` (`evabt:dono-cad:<sistemaId>`).
- Valida que o sistema existe e ainda está órfão (se já tiver dono, responde
  "Essa usina já está vinculada a X" e encerra — evita corrida).
- Grava estado `{ etapa: 'escolha', sistemaId }` em Redis.
- Eva pergunta: *"Esse cliente já existe ou é novo?"*
  Botões: `[Já existe]` `[Criar novo]` `[Cancelar]`
  (`evabt:dono-existe` / `evabt:dono-novo` / `evabt:dono-cancelar` — sem id,
  agem sobre o estado Redis do admin atual, como `fechar-gerar`/`fechar-sair`).

**Caminho A — "Já existe".**
1. Estado → `{ etapa: 'busca', sistemaId }`. Eva: *"Qual o nome do cliente?"*
2. Junior digita texto (ex: "henrique"). O roteador de mensagens, ao ver estado
   `dono-cad` na etapa `busca`, chama `searchClientesParaVinculo(texto)`.
3. Mostra até 3 resultados como botões + opção de criar novo:
   `[Henrique Souza]` `[Henrique Lima]` `[Criar novo]`
   (`evabt:dono-pick:<leadId>` por resultado; `evabt:dono-novo` no fallback).
   - Cada botão mostra nome (e cidade/telefone no corpo da mensagem pra
     desambiguar, já que o título do botão é curto).
   - Se a busca não achar nada: Eva avisa e oferece `[Criar novo]` / `[Cancelar]`.
4. Junior clica num resultado → `vincularClienteExistente({ sistema_id, lead_id })`
   → limpa estado → Eva: *"✅ Pronto, a usina agora é do Henrique Souza. Próximos
   alertas já vêm com ele."*

**Caminho B — "Criar novo".**
1. Estado → `{ etapa: 'novo_nome', sistemaId }`. Eva: *"Nome completo do cliente?"*
2. Junior digita o nome → estado `{ etapa: 'novo_telefone', sistemaId, nome }`.
   Eva: *"Telefone com DDD? (ex: 61 99999-8888)"*
3. Junior digita o telefone (normaliza só dígitos, mesmo tratamento do dashboard:
   `String(...).replace(/\D/g, '')`). Cria lead + vincula via uma função de
   backend nova `criarClienteEVincular({ sistema_id, nome, telefone })` (extrai a
   lógica que hoje vive no router do dashboard pra um lugar reusável no
   `supabase.ts`, pra os dois lados — web e zap — chamarem o mesmo código).
4. Limpa estado → Eva: *"✅ Cliente Marcelo Dias criado e ligado à usina. Próximos
   alertas já vêm com ele. (Pra completar e-mail/endereço, use o painel.)"*

**Cancelar / timeout.** `[Cancelar]` limpa o estado e confirma. O TTL do Redis
garante que um fluxo abandonado expira sozinho (não trava o Junior).

### 3. Backend reusável (`src/modules/supabase.ts`)

- `searchClientesParaVinculo(term, limit)` — **já existe na branch** (busca em
  `leads` por nome/telefone, ignora inativos).
- `vincularClienteExistente({ sistema_id, lead_id })` — **já existe na branch**
  (seta `sistemas_clientes.lead_id`, valida sistema e lead).
- `criarClienteEVincular({ sistema_id, nome, telefone })` — **novo**. Extrai a
  criação de lead (nome+telefone) que hoje está inline no router do dashboard,
  insere em `leads` e seta `lead_id`. Usado pelo zap **e** pelo dashboard (DRY).

### 4. Dashboard — merge da branch `feat/proprietario-usinas`

Subir a branch que já faz vincular/trocar/desvincular/criar dono pela web:
- Seção "Proprietário" no editar usina.
- Modal de órfãs (aceita cliente existente OU criar novo).
- `searchClientesParaVinculo` + `vincularClienteExistente` + form de criar novo.

Cuidado no merge: a branch foi feita sobre um commit antigo (`6213908`, base ABB)
e a `main` andou bastante desde então (propostas multi-serviço, etc.). Tratar
como uma etapa própria: rebase/merge cuidadoso, resolver conflitos, rodar a
suíte inteira, e refatorar a criação de lead inline do router pra chamar
`criarClienteEVincular` (component 3).

## Fluxo de dados (resumo)

```
cron detect → alerta órfão gravado (lead_id nulo)
   → dispatcher → formatAlertMessage (vê órfã) → botões [Cadastrar dono | Ver painel]
   → Junior clica Cadastrar dono
      → estado Redis dono-cad → Eva pergunta existe/novo
         → existe: busca leads → pick → vincularClienteExistente
         → novo:   nome+telefone → criarClienteEVincular
   → sistemas_clientes.lead_id setado → usina NÃO é mais órfã
   → próximo alerta dela: nome do dono + botões normais (Eva avisar/Eu ligar)
```

## Tratamento de erros e bordas

- **Usina já vinculada quando o botão é clicado** (corrida — outro alerta mais
  antigo, ou vinculou pelo dashboard nesse meio tempo): valida no Passo 0 e
  encerra com mensagem amigável.
- **Busca sem resultado:** oferece criar novo / cancelar.
- **Telefone inválido / vazio no "Criar novo":** Eva repete a pergunta uma vez.
- **Estado Redis expirado** no meio do fluxo: se chegar texto/botão sem estado,
  ignora silenciosamente (não loga erro, não confunde com mensagem normal).
- **Fallback Evolution (sem WABA):** `sendAdminWithButtons` já cai pra texto puro
  quando não há botões interativos — o fluxo continua funcionando por texto
  (Junior digita as respostas), só sem os botões clicáveis.
- **Mais de 3 resultados na busca:** mostra os 3 primeiros + "Criar novo". Se não
  for nenhum, Junior refina o nome (busca de novo) — não tenta paginar.

## Testes (TDD)

- `format.ts`: alerta de usina **com** dono mantém saída atual; alerta **órfão**
  mostra "SEM dono vinculado" e o conjunto de botões `[Cadastrar dono | Ver painel]`
  (sem Adiar). Cobre todos os tipos de alerta (offline/queda/integração).
- Máquina de estado `dono-cad`: transições escolha → busca → pick → vínculo;
  escolha → novo_nome → novo_telefone → criação; cancelar em cada etapa; estado
  expirado.
- `criarClienteEVincular`: cria lead com nome+telefone normalizado e seta o
  `lead_id`; erro se sistema não existe.
- Idempotência/corrida: clicar "Cadastrar dono" numa usina já vinculada não
  cria nada e responde "já vinculada".
- Regressão: alertas de usinas COM dono continuam com os botões e o
  comportamento de hoje, inalterados.

## Sequência de implementação sugerida

1. Merge da branch `feat/proprietario-usinas` na main (dashboard + funções de
   backend), com a suíte verde. *(componente 4)*
2. `criarClienteEVincular` reusável + refatorar o router do dashboard pra usá-la. *(3)*
3. Status do dono + botões da órfã no `format.ts`. *(1)*
4. Máquina de estado `dono-cad` + handlers de botão + roteamento de texto. *(2)*

Cada etapa: TDD, e code review antes de cada commit (regra do Junior).
