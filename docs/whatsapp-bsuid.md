# WhatsApp BSUID (ID do usuário por empresa) — fase 1

Doc da Meta: <https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids/>

## O que mudou na Meta

Todo webhook de mensagem da Cloud API passou a trazer um **BSUID** (business-scoped user ID,
formato `BR.1234…` / `US.1349…`), único por empresa:

- `contacts[].user_id`, `contacts[].parent_user_id`, `contacts[].profile.username`
- `messages[].from_user_id`, `messages[].from_parent_user_id`
- status: `statuses[].recipient_user_id` (+ `contacts[]`); `recipient_id` pode sumir
- webhook `system` avisa quando o usuário troca de número (o BSUID é gerado de novo)

Quando o usuário **esconde o telefone atrás de um @username** (e não falou com a gente nos
últimos 30 dias / não está na agenda), **`messages[].from` e `contacts[].wa_id` NÃO VÊM**.

## O bug que a fase 1 fecha

`parseMessage` fazia `from = msg.from ?? ''`. O `''` passava por todos os filtros do
`POST /webhook-waba`, ia pra fila e virava `getLeadByPhone('')` / `upsertLead({ phone: '' })`.
Como `leads.phone` é `UNIQUE NOT NULL` e aceitava `''`, **todo mundo sem telefone caía no MESMO
lead** (conversa, takeover e dados compartilhados — vazamento LGPD) e a resposta ia pra `to: ''`
e falhava.

## O que a fase 1 faz (sem mudar nada pra quem mostra o telefone)

1. **Trava no webhook** (`src/index.ts` → `src/modules/whatsapp-bsuid.ts`): mensagem cujo `from`
   não é telefone (vazio / não numérico) **não entra na fila**. Loga e avisa o **admin da empresa
   dona** (mesma regra LGPD dos outros avisos: `destinoAdminDaEmpresa`), 1x por hora por pessoa
   (chave da trava = BSUID, ou `username`/nome quando não vier BSUID — nunca o `messageId`, que é
   único por mensagem e não travaria nada), com nome, @username, BSUID e o começo da mensagem. A
   assistente NÃO responde.
   - Esse aviso vai como **texto livre pela WABA** (`sendText`) — só entrega se o admin falou com
     a Eva nas últimas 24h; fora da janela a Meta recusa e o envio fica **só logado** (o admin não
     recebe nada). Fase 2 pode trocar por um **template aprovado** pra funcionar sempre.
   - Se `companyDoNumero` (resolve o tenant dono do número) falhar, este caminho **não cai** no
     fallback de EcoSun do fluxo normal — resolve para "sem empresa" e só loga, pra nunca mandar
     texto de cliente de um tenant pro admin de outro.
2. **Banco recusa telefone vazio**: `upsertLead` e `getOrCreateLeadByPhone` lançam erro com
   telefone vazio/sem dígito/com letra; `getLeadByPhone` devolve `null` sem consultar.
3. **Parse**: `IncomingMessage` e `QueueMessage` ganharam `fromUserId`, `fromParentUserId`,
   `username` (opcionais). `from` continua sendo SEMPRE telefone — o BSUID nunca vai pra `from`.
   `parseStatusUpdates` lê `recipient_user_id` (`recipientUserId`).
4. **Backfill**: mensagem com telefone **e** BSUID → depois da resposta, grava `wa_user_id` /
   `wa_username` no lead achado pelo telefone (só na empresa dona; BSUID diferente do salvo é
   trocado e logado). Best-effort: nunca bloqueia nem derruba a resposta.
   `getLeadByWaUserId(companyId, userId)` já existe pra fase 2.
5. **Migration 135** (`supabase/migrations/135_leads_whatsapp_bsuid.sql`): colunas
   `leads.wa_user_id` / `leads.wa_username`, índice único `(company_id, wa_user_id)` parcial,
   e `check (btrim(phone) <> '')`. Lead que já tinha `phone = ''` **não é apagado**: vira
   `sem-telefone-<id>` (o código nunca casa isso com telefone de ninguém). Antes do apelido, a
   migration desliga `eva_active` desses leads e cancela (`status='cancelled'`) os toques JÁ
   AGENDADOS neles em `eva_cadence` e `proposta_followup_vivo` — senão o cron da cadência ia tentar
   mandar mensagem pro telefone inventado. Toda etapa nova é guardada com
   `DO $$ ... exception when undefined_table or undefined_column then null; end $$` pra nunca
   quebrar a migration num ambiente onde a tabela ainda não existe (pré-check SQL: ver "Ordem do
   deploy" abaixo).
6. **Telefone "sujo" nunca vira envio**: `normalizeBrazilianPhone` (`meta-leadgen.ts`),
   `telefoneParaEnvio` (`phone.ts`) e os dois `normalizarTelefone` (`dashboard/pos-venda-envio.ts` e
   o privado de `proposal-followup.ts`) recusam de cara qualquer valor com LETRA (ex.:
   `sem-telefone-<uuid>`, BSUID `BR.123...`) — sem essa trava, o `replace(/\D/g,'')` de cada um
   sobrava com os dígitos do meio do uuid/BSUID e podia virar sem querer um "telefone" válido.

## Ordem do deploy

1. **Aplicar a migration 135** no Supabase (SQL Editor).
   Antes, se quiser ver o estrago: `select id, name, created_at from leads where btrim(phone) = '';`
2. Depois, Implantar o código.

(Se o código subir antes da migration, o backfill só loga erro de coluna inexistente — a
resposta ao cliente não é afetada.)

## Fase 2 — o que falta (fora deste PR)

- **Responder por BSUID**: envio com o campo `recipient` (no lugar de `to`) — liberado pela Meta
  desde julho/2026. Exige: `sendText`/templates/mídia aceitando BSUID, e a trava LGPD
  (`envioProibido`) e o anti-equipe (`ehTelefoneDaEquipe`, `identificarInterno`) entendendo BSUID.
- **Lead sem telefone**: tirar o `NOT NULL` de `leads.phone` (ou chave própria), criar/achar o lead
  por `getLeadByWaUserId`, e trocar as ~dezenas de chaves por telefone (takeover, fila, conversa,
  cadência) por uma identidade do contato.
- **Pedir o telefone**: botão `REQUEST_CONTACT_INFO` pra o usuário compartilhar o número.
- **Webhook `system`** (troca de número): hoje é ignorado; na fase 2, atualizar o `wa_user_id`.
- **Versão da Graph API**: hoje `v21.0` em `meta-whatsapp.ts` — conferir a mínima exigida pro
  `recipient`.
- **Evolution `@lid`**: o canal Evolution tem o problema irmão (JID `@lid` sem telefone) — tratar
  separado.
