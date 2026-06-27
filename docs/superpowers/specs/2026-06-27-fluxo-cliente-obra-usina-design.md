# Fluxo do cliente: do Fechamento à Usina e ao Pós-venda

**Data:** 2026-06-27
**Status:** design aprovado verbalmente — aguardando revisão do spec escrito
**Autor:** Junior + Claude

## 1. Problema

Hoje existem dois mundos que **não se conversam**:

- **Venda fechada (closing/Eva):** "Fechar" a proposta grava um registro em `fechamentos`
  (contrato + procuração + docs, ligado ao lead). **Não** cria obra, **não** toca no
  kanban, **não** cria usina. Verificado em `src/modules/closing/closing-persist.ts`.
- **Usina (`sistemas_clientes`, o que o kanban e o pós-venda leem):** só é criada pelo
  importador de monitoramento (`src/modules/monitoring/service.ts`), que puxa do painel do
  inversor e insere **sem `lead_id`** (casa por `apelido`).

Consequências atuais:

- O cliente que fecha a venda **não entra em fluxo nenhum** de obra/pós-venda.
- As usinas importadas **não têm `lead_id`** → o pós-venda (`listarClientesPosVenda`,
  que filtra `ativo = true AND lead_id IS NOT NULL`) **não as mostra**. É o "tem todos os
  nomes mas o sistema não puxa".
- Como a coluna `etapa_obra` tem **default `'projeto'`** (migration 060), toda usina
  importada (que na verdade já está operando) aparece **em "Projeto"** no kanban — errado.

## 2. O fluxo alvo (a jornada completa)

```
CLIENTE NOVO (fluxo completo):
  Lead → Proposta → FECHAR proposta  ──(gatilho)──▶  entra no fluxo de obra
     │  (botão no dash + comando na Eva; reversível — ver §4)
     ▼
  🆕 VISITA TÉCNICA  (tira fotos + adiciona dados do projeto)   ← gate
     ▼
  KANBAN DE OBRAS (do Lucas, 6 etapas, fica igual):
     Projeto → Aprovação → Instalação → Comissionamento(vistoria) → Homologação(troca medidor) → Operação
     │  no comissionamento a ficha ganha o monitoramento (passa a puxar geração = "vira usina")
     ▼
  PÓS-VENDA  (sai do kanban; vive na tela de Pós-venda, que é módulo próprio e rico)

USINA QUE JÁ OPERA (as atuais / importadas do monitoramento):
  Criar/identificar conta → casar com o cliente do CRM (preenche lead_id) → entra DIRETO no Pós-venda
     │  monitoramento conecta quando tiver credenciais
```

## 3. Modelo de dados: **uma ficha que evolui** (obra → usina)

Decisão: **não** criar entidade separada de "obra". A mesma linha em `sistemas_clientes`
nasce como obra (no Fechar+visita), caminha pelo kanban via `etapa_obra`, e **no
comissionamento passa a ser monitorada** (ganha `api_credentials`/`marca_inversor`).
"A usina nasce no comissionamento" = a ficha passa a puxar geração ali. O cliente é
digitado **uma vez** (no contrato, com CPF e tudo); a ficha puxa via `lead_id`, nada
se redigita.

Isso aproveita o kanban do Lucas (que já usa `sistemas_clientes.etapa_obra`) e evita
duplicação de dados do cliente.

### Armadilhas a tratar (decorrem do modelo de ficha única)

1. **`marca_inversor` é NOT NULL + CHECK** de marcas válidas. Uma ficha em obra (antes do
   comissionamento) não tem inversor → precisa de migration que aceite um valor tipo
   `'pendente'` (ou tornar nullable).
2. **O cron de monitoramento não pode tentar ler ficha sem credenciais** (daria erro/spam
   toda madrugada). O cron deve pular as `'pendente'` / sem `api_credentials`.
3. **Não duplicar usina:** quando o monitoramento é conectado no comissionamento, deve
   **preencher a ficha existente** (achando pelo `lead_id`/nome), não inserir nova. O
   importador hoje casa por `apelido` e insere se não achar.

## 4. Regras transversais

- **Gatilho = "Fechar" já existente** (dash + Eva). Não criar gatilho novo; plugar o Fechar
  no início do fluxo, nos dois lugares.
- **Automático com gatilho manual:** cada passagem de etapa acontece sozinha quando dá, e
  tem botão/comando manual (dash e Eva) pra forçar.
- **Reversível (cancelamento):** a entrada no fluxo pode ser **cancelada** a qualquer
  momento, por **Eva, Junior ou qualquer vendedor**. Ao cancelar, a ficha **some da etapa
  pra onde iria** (não bagunça o kanban/fluxo). Modelar como **cancelar/arquivar** (some da
  tela, mas guarda histórico pra auditoria — não deletar). Cobre o medo do "fluxo reverso /
  venda cancelada".
- **Edição manual** quando precisar, como já é feito hoje.
- **Operação → Pós-venda:** automático após **5 dias** em Operação + botão manual; ao migrar,
  **sai do kanban**.
- **Usina que já opera:** entra **direto no Pós-venda** (pula projeto→homologação).

## 5. Decomposição em entregas

Cada entrega vira seu próprio spec → plano → implementação, na raia certa
(kanban/pós-venda = dashboard/Junior; Fechar/Eva = raia da Eva).

1. **🔥 Usina que já opera → entra certo no Pós-venda + casa com o cliente do CRM**
   *(dor de HOJE — menor e mais valiosa)*. Detalhe em §6.
2. **Fechamento → ficha entra no fluxo** (gatilho do Fechar, auto + manual, dash + Eva) +
   **reversibilidade/cancelamento** (§4).
3. **Etapa de Visita Técnica** (tela nova: fotos + dados do projeto) — a maior, feature nova.
4. **Operação → Pós-venda** (automático nos 5 dias + botão manual; sai do kanban).
5. **Reordenar menu** (Kanban de Obras → Monitoramento → Pós-venda, seguindo a jornada) —
   trivial, vai de carona.
6. **🆕 Enriquecer o Pós-venda** (datas, lembretes, ações a fazer, planos, envio automático
   de mensagem, relatórios) — entrega grande por si só.

## 6. Detalhe da Entrega 1 (a primeira)

**Objetivo:** fazer as usinas que já operam aparecerem no Pós-venda, ligadas ao cliente
certo, e saírem do "Projeto" do kanban.

Sub-pontos (a refinar no plano de implementação):

- **Casar usina ↔ lead/cliente:** preencher `lead_id` nas usinas importadas. Por nome
  (`apelido` ↔ `leads.name`) com confirmação, e/ou vínculo manual no dashboard. Reusar o
  que já existe de vínculo (ver `tests/supabase-vincular-novo.test.ts` e a lógica de
  "cadastro de dono de usina órfã" já no sistema).
- **Definir o estado "já opera":** a usina que opera deve sair de `etapa_obra='projeto'`.
  Decidir se "estar no pós-venda" é representado por `etapa_obra='operacao'`, por um estado
  novo (ex.: `pos_venda`), ou pela coluna `acompanhamento` (já existe em `sistemas_clientes`).
- **Pós-venda já filtra `ativo AND lead_id NOT NULL`** (`pos-venda-queries.ts:40-42`) — então,
  uma vez com `lead_id`, a usina aparece. Validar se precisa de filtro de etapa também.
- **Não quebrar o kanban:** garantir que a usina que foi pro pós-venda não fique também
  poluindo o kanban de obras.

## 7. Pontos a confirmar na fase de plano (não bloqueiam o design)

- Como exatamente representar "saiu do kanban / está no pós-venda" no dado (estado novo vs
  coluna `acompanhamento`).
- Critério do casamento automático por nome (e o que fazer com ambíguos / sem match).
- Onde mora o "5 dias" (campo `etapa_obra_updated_at` já existe — dá pra calcular).
```
