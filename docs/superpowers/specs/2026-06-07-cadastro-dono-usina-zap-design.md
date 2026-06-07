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
- Sugestão automática/IA de qual lead é o dono provável da usina → possível
  evolução futura, não entra agora.

## Princípio: paridade de cadastro com "pular"

O cadastro pelo zap coleta **os mesmos campos do dashboard** — tanto do cliente
quanto da usina — mas com uma regra que tira a chatice de digitar tudo no
celular:

- **"Pular":** em qualquer campo opcional, o Junior pode responder `pular` (ou
  clicar um botão `Pular`) e a Eva segue pro próximo. Só nome e telefone do
  cliente são obrigatórios.
- **Eva pergunta só o que falta:** nos dados da usina (que já está monitorada,
  então parte já vem preenchida), a Eva **só pergunta os campos vazios** — não
  re-pergunta o que já existe. É o lado "inteligente" do fluxo.
- O cliente que **já existe** (caso comum) não passa por nada disso: busca, clica,
  e todos os dados que vieram da conversa já estão no cadastro.

## Modelo de dados (já existente)

- **`sistemas_clientes`** = a usina monitorada. Coluna `lead_id` = o vínculo com
  o dono. `lead_id` nulo ⇒ **usina órfã**.
- **`leads`** = o cliente/dono. Já é populado pelas conversas da Eva no WhatsApp.
  Vincular = setar `sistemas_clientes.lead_id`. Criar novo = inserir em `leads`
  e setar `lead_id`.

**Campos do cliente (`leads`)** que o cadastro completo do dashboard coleta —
e que o zap passa a coletar também: `name`*, `phone`*, `email`, `city`, `uf`,
`cep` (* = obrigatório).

**Campos da usina (`sistemas_clientes`)** que o cadastro do dashboard coleta:
`apelido`, `potencia_kwp`, `cidade`, `uf`, `data_instalacao`, `inversor_modelo`,
`observacoes` (a `marca` e as credenciais de API já vêm da integração de
monitoramento). O zap completa **os que estiverem vazios**.

Nenhuma migration nova é necessária — todas as colunas já existem.

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
   → vai pra **etapa "dados da usina"** (ver abaixo). (No "Já existe" o cadastro
   do cliente não é tocado — só a usina é completada.)

**Caminho B — "Criar novo" (cliente completo, com pular).**
A Eva pergunta um campo por vez, guardando cada resposta no estado Redis. Em
qualquer campo **opcional** o Junior pode mandar `pular` (ou clicar `[Pular]`):

1. *"Nome completo do cliente?"* → **obrigatório**.
2. *"Telefone com DDD? (ex: 61 99999-8888)"* → **obrigatório**. Normaliza só
   dígitos (`replace(/\D/g, '')`, igual ao dashboard).
3. *"E-mail? (ou pule)"* → opcional.
4. *"Cidade? (ou pule)"* → opcional.
5. *"UF? (ou pule)"* → opcional, 2 letras.
6. *"CEP? (ou pule)"* → opcional.
7. Cria lead + vincula via `criarClienteEVincular({ sistema_id, name, phone,
   email?, city?, uf?, cep? })` → segue pra **etapa "dados da usina"**.

**Etapa final (comum aos dois caminhos) — "dados da usina".**
Depois que o dono está vinculado, a Eva completa os dados da usina que estiverem
**vazios** (pré-carrega o que já existe e pula esses campos sozinha):

1. Para cada campo vazio em `apelido`, `potencia_kwp`, `cidade`, `uf`,
   `data_instalacao`, `inversor_modelo`, `observacoes` → Eva pergunta um por vez,
   com `pular` disponível. (Se a usina já tem cidade/uf pelo cliente recém-criado,
   Eva oferece reaproveitar.)
2. Se **todos** já estiverem preenchidos, pula a etapa inteira direto pro fim.
3. Salva via `atualizarDadosUsina({ sistema_id, ...campos })` (só os respondidos).
4. Limpa estado → Eva: *"✅ Tudo cadastrado! A usina [apelido] agora é do
   [cliente] e os dados estão completos. Próximos alertas já vêm certinhos."*

**Cancelar / pular tudo / timeout.** `[Cancelar]` a qualquer momento limpa o
estado e confirma. Na etapa da usina, um `[Pular tudo]` encerra mantendo só o
vínculo do dono já feito (o vínculo nunca se perde por desistência na etapa da
usina). O TTL do Redis garante que um fluxo abandonado expira sozinho.

### 3. Backend reusável (`src/modules/supabase.ts`)

- `searchClientesParaVinculo(term, limit)` — **já existe na branch** (busca em
  `leads` por nome/telefone, ignora inativos).
- `vincularClienteExistente({ sistema_id, lead_id })` — **já existe na branch**
  (seta `sistemas_clientes.lead_id`, valida sistema e lead).
- `criarClienteEVincular({ sistema_id, name, phone, email?, city?, uf?, cep? })`
  — **novo**. Extrai a criação de lead que hoje está inline no router do
  dashboard, insere em `leads` (com os campos opcionais quando vierem) e seta
  `lead_id`. Usado pelo zap **e** pelo dashboard (DRY).
- `atualizarDadosUsina({ sistema_id, apelido?, potencia_kwp?, cidade?, uf?,
  data_instalacao?, inversor_modelo?, observacoes? })` — **novo**. Atualiza só os
  campos informados em `sistemas_clientes` (não sobrescreve com vazio). Pode
  reusar o handler de update de usina que o dashboard já tem (extrair pra função
  compartilhada). Valida tipos (ex: `potencia_kwp` numérico, `uf` 2 letras,
  `data_instalacao` data ISO).

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
         → novo:   nome → telefone → email/cidade/uf/cep (pular) → criarClienteEVincular
      → etapa "dados da usina": pergunta só os campos vazios (pular) → atualizarDadosUsina
   → sistemas_clientes.lead_id setado (+ dados completados) → usina NÃO é mais órfã
   → próximo alerta dela: nome do dono + botões normais (Eva avisar/Eu ligar)
```

## Tratamento de erros e bordas

- **Usina já vinculada quando o botão é clicado** (corrida — outro alerta mais
  antigo, ou vinculou pelo dashboard nesse meio tempo): valida no Passo 0 e
  encerra com mensagem amigável.
- **Busca sem resultado:** oferece criar novo / cancelar.
- **Telefone inválido / vazio no "Criar novo":** Eva repete a pergunta uma vez.
- **Usina já tem todos os dados:** a etapa "dados da usina" é pulada por inteiro —
  a Eva NUNCA re-pergunta um campo já preenchido pela integração de monitoramento.
  Lê o estado atual da usina antes de perguntar e só aborda os vazios.
- **Resposta "pular" num campo opcional:** segue pro próximo sem gravar nada
  naquele campo (não grava string "pular" nem vazio por cima de dado existente).
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
- Máquina de estado `dono-cad`: transições escolha → busca → pick → dados-usina →
  fim; escolha → novo (nome→telefone→email→cidade→uf→cep) → dados-usina → fim;
  `pular` em cada campo opcional; cancelar em cada etapa; estado expirado.
- **"Pular":** responder `pular` num campo opcional não grava nada ali; nome e
  telefone NÃO aceitam pular (repete a pergunta).
- **Só completa o que falta:** dada uma usina com `apelido` e `cidade`
  preenchidos e o resto vazio, a Eva pergunta só os vazios; usina 100% preenchida
  pula a etapa inteira; `pular` num campo da usina não sobrescreve com vazio.
- `criarClienteEVincular`: cria lead com os campos informados (nome+telefone
  obrigatórios, resto opcional) e seta o `lead_id`; erro se sistema não existe.
- `atualizarDadosUsina`: grava só os campos passados; não zera os existentes;
  valida tipos (potência numérica, uf 2 letras, data ISO).
- Idempotência/corrida: clicar "Cadastrar dono" numa usina já vinculada não
  cria nada e responde "já vinculada".
- Regressão: alertas de usinas COM dono continuam com os botões e o
  comportamento de hoje, inalterados.

## Sequência de implementação sugerida

1. Merge da branch `feat/proprietario-usinas` na main (dashboard + funções de
   backend), com a suíte verde. *(componente 4)*
2. `criarClienteEVincular` (campos completos) + `atualizarDadosUsina` reusáveis +
   refatorar o router do dashboard pra usá-las. *(3)*
3. Status do dono + botões da órfã no `format.ts`. *(1)*
4. Máquina de estado `dono-cad` (cliente completo c/ pular + etapa dados da usina
   só-completa-vazios) + handlers de botão + roteamento de texto. *(2)*

Cada etapa: TDD, e code review antes de cada commit (regra do Junior).
