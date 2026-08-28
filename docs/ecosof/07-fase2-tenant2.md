# 07 — Fase 2: o caminho até o tenant #2 pago

> Estado em 22/07/2026. Pré-requisitos PRONTOS: RLS 079 (FORCE em 70 tabelas),
> ~40 rotas do dashboard no crachá da sessão (RLS_TENANT_ROTAS=1 em prod desde
> 18/07), Eva MT fatias 3a-3e no ar + prova de vazamento do caminho da Eva no
> CI (PR #134), webhook resolvendo empresa por `companies.waba_phone_number_id`
> (081, fail-closed), `getOrCreateLeadByPhone(phone, nome, companyId)`.

## O que um tenant #2 REAL ainda esbarra (inventário honesto)

1. **`empresa()` é um singleton global** (`empresa-config.ts`): cache ÚNICO
   carregado da tabela `empresa_config` (1 linha, EcoSun). Dezenas de call
   sites (proposta, contrato, prompts da Eva, e-mail, pranchas) leem a config
   da EcoSun — sob tenant #2 sairia proposta com CNPJ/PIX/RT errados.
2. **RAG**: `eva_knowledge_chunks.tenant_id` JÁ EXISTE (retrieve aceita
   `p_tenant`, ingest parametriza) — mas todo mundo chama com o default
   `'ecosunpower'`. Falta passar o tenant da mensagem + decidir o que é
   conhecimento COMUM (datasheets de produto?) vs. do tenant.
3. **WABA/Meta por tenant**: `META_ACCESS_TOKEN`/número são env únicos. O
   envio (`meta-whatsapp.ts`) responde sempre pelo número da EcoSun. Tenant
   com WhatsApp próprio precisa de token/número por empresa (e é segredo —
   não vai em coluna aberta; pensar storage/secret).
4. **Operadores do tenant**: `dashboard_users.company_id` existe e o crachá
   da sessão funciona — falta o FLUXO de criar usuário do tenant (hoje é SQL
   na mão) e um smoke de que ele só vê o mundo dele.
5. **Leituras restantes do caminho da mensagem no serviço** (histórico/
   contexto da conversa — nota do 06): inofensivas com 1 tenant; migrar pro
   crachá antes do tenant #2 ter WhatsApp próprio.
6. **Rotas "shape errado"** (`/clientes*`, `/cerebro` via
   `supabaseService.*`/`monitoringService`): precisam de injeção de client
   pra rodar no crachá (Fase B pendência).
7. **Caches globais por processo**: `lead-insights` (revisar), resolver de
   tenant (ok, por número), `empresa()` (item 1). Regra: cache sempre
   chaveado por company_id.
8. **Billing/onboarding** (comercial): companies ganha plano/status; fora do
   escopo técnico imediato.

## Decisão que MUDA o escopo (pro Junior bater o martelo)

**O tenant #2 da fila é o Sabion (monitoramento multi-marca)** — ele NÃO
precisa da Eva WhatsApp nem de proposta no dia 1. O MVP dele é DASHBOARD +
MONITORAMENTO isolados. Isso corta os itens 2, 3 e 5 do MVP:

- **MVP Sabion (fatias A)**: A1 usuários do tenant (item 4) → A2 `empresa()`
  por empresa NOS PONTOS QUE O DASHBOARD USA (título/logo/nome — item 1
  parcial) → A3 monitoramento por company (sistemas_clientes/monitoring já
  têm company_id na 079; conferir `monitoring_config` global e os crons
  multi-tenant) → A4 smoke de isolamento com o usuário real do Sabion.
- **Eva completa pro tenant (fatias B — quando um tenant quiser WhatsApp)**:
  B1 config por empresa em TODOS os call sites (item 1 completo) → B2 RAG
  por tenant (item 2) → B3 WABA por tenant (item 3) → B4 leituras do caminho
  da mensagem no crachá (item 5).
- **Paralelo (qualquer hora, sem risco)**: item 6 (shape errado) e item 7
  (caches) — são dívida do dashboard, não bloqueiam o MVP Sabion.

## Regras que continuam valendo

- Strangler sempre: flag nova por fatia, flag-off = byte-idêntico, teste que
  prova a identidade (padrão das fatias 3a-3e).
- Tabela nova ≥080 exige RLS + policy (guarda de migration no CI).
- `empresa_config` hoje é 1 linha — virar keyed por `company_id` é migration
  aditiva (linha da EcoSun ganha o id dela; `empresa()` legado lê a da
  EcoSun; `empresaDaCompany(id)` novo lê a certa, cache por id).
- Storage (logos por tenant) fica no serviço (079 não cobre storage.objects).

## Próxima sessão sugerida

Fatia A1: fluxo de criar operador do tenant (tela admin simples ou script
assistido) + A2 mínimo (nome/logo no dashboard pelo company da sessão) — os
dois juntos dão a demo "login do Sabion vê o prédio dele vazio".

## Trilho B — tenant SEM Meta: instância Evolution própria por QR (migration 107, 28/08/2026)

Caso: Conquista Solar ("Clara", número 77 99961-0038) conecta por QR numa instância
própria (`conquista-solar`) na MESMA Evolution API da Eva — mesma jornada com que a
Eva nasceu. Sem WABA/Meta na fase 1.

**Como funciona**
- `companies.evolution_instance` (107, único parcial) amarra instância → empresa.
- `POST /webhook` lê `body.instance`: mapeada → job entra na fila com `companyId`;
  instância da Eva (`EVOLUTION_INSTANCE`) → EcoSun como hoje; **qualquer outra
  instância não mapeada → RETIDA** (`instancia_nao_mapeada`, falha-fechado: typo,
  cadastro faltando, `ativo=false` ou banco fora nunca viram lead da EcoSun).
- Consumer roda cada job em `comEmpresaDe(companyId)` (persona/marca/critério do
  `empresa_config` do tenant) + `comCanal({companyId, evolutionInstance})`.
- `EvolutionService` usa a instância do contexto (AsyncLocalStorage); o wrapper
  `sendText`/`getMediaBase64`/`sendMedia` do index escolhe Evolution quando o
  contexto tem instância própria — mesmo com WABA ligada pra EcoSun.
- Dono do tenant digitando no próprio zap (`fromMe`): só takeover (pausa) e
  `clara on`/`eva on` (volta). Comandos administrativos da Eva não passam.

**Pré-requisitos por tenant**: empresa + admin (tela Empresas) · linha em
`empresa_config` (nome_atendente etc.) · instância criada na Evolution com webhook
`/webhook?token=<WEBHOOK_TOKEN>` + evento MESSAGES_UPSERT + base64 · `UPDATE
companies SET evolution_instance='...'` (cache 5 min).

**Limitações (fase 2)**: crons fora do consumer (followup, cadência, reengajamento,
follow-up vivo, pós-instalação) ficam **restritos à EcoSun** (`company_id = EcoSun`
nas queries) até ganharem contexto por lead · alertas de qualificação vão pro
`engineerPhone` (EcoSun) · `takeover` é por telefone (global) · logo no bucket.
