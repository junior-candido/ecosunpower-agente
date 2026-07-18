# Fase B — plano de execução (migrar rotas pro crachá por empresa)

**Data:** 2026-07-18 · **Autores:** Junior + Claude · **Dono da Fase B:** Jonnata
(revisar/ajustar — é a sua raia). Base: `04-rls-fase-a-b.md` (desenho) e o código
já mergeado (`src/modules/tenant-client.ts`).

> Objetivo da Fase B: parar de depender de "todo caminho de código lembrar de
> filtrar por company_id". O Postgres passa a impor o isolamento (RLS 079), e o
> app fala com o banco como a EMPRESA (crachá), não como `service_role` (chave-mestra).

## Estado atual (o que já está na main)

- **Fase A (079) aplicada em produção:** `FORCE ROW LEVEL SECURITY` + política
  `company_isolation` em 69 tabelas; políticas `USING(true)` aposentadas.
  **Isolamento provado** no SQL Editor (empresa falsa lê 0 · EcoSun lê 476 ·
  INSERT da falsa = 42501).
- **Trilhos da Fase B prontos** (`src/modules/tenant-client.ts`):
  - `jwtDaEmpresa(companyId, segredo, agoraMs, ttl=600)` — JWT HS256 nativo, role
    `authenticated` + claim `company_id`, TTL 10 min. Puro/testável.
  - `clientDaEmpresa(companyId, env)` — client Supabase com apikey anon + o crachá.
  - `clientDoOperador(req, env)` — crachá a partir da **SESSÃO** (`req.dashUser.companyId`);
    `company_id` NUNCA de body/header/query.
  - `bancoDoOperador(req, servico, env=process.env)` — **o SWITCH strangler**: com
    `RLS_TENANT_ROTAS=1` **E** env completa → client-do-operador; senão → o `servico`
    de hoje. **Desligado por padrão = zero mudança em produção.**
  - `tenantEnvDoProcesso()` — lê `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_JWT_SECRET`.
- **1ª rota migrada:** `GET /dashboard/leads` (usa `bancoDoOperador`).
- **Pergunta em aberto da spec 04 já resolvida:** o JWT nasce no helper único
  `tenant-client.ts`; TTL = 10 min re-assinado por uso.

## Buracos / riscos (a fechar)

1. Só 1 rota migrada — `router.ts` ainda tem ~105 usos de `supabase`/`supabaseService` crus.
2. Sem **teste-guarda ratchet** na main (impedir regressão enquanto migra).
3. `scripts/teste-vazamento-rls.ts` é **script manual**, não job de CI (a spec 04 §B.4
   exige que 2 tenants fake quebrem o build se vazar).
4. Sem **guarda estático de migration** (tabela nova sem RLS+política deve quebrar o vitest).
5. **Eva/webhook ainda é full-bypass** (o crachá pelo `phone_number_id` fica pra depois).

## Receita — migrar UMA rota (o padrão da Fatia 4)

Regra de decisão (blueprint §6):
- **Dado do TENANT** (leads, clientes, propostas, contratos, usinas, pós-venda,
  monitoramento…) → trocar `supabase` por **`bancoDoOperador(req, supabase)`**.
- **Global / cross-tenant** (audit/logs, `app_flags`, `dashboard_users`, webhooks de
  sistema, slug público, billing/telemetria de plataforma) → **continua no serviço**
  (`supabaseService`), NUNCA no crachá.

Passos por rota:
1. Localizar o handler no `router.ts` (ou módulo) e o(s) `supabase.from(...)`.
2. Confirmar que é dado do tenant (tem/deveria ter `company_id`). Se global → deixar.
3. Trocar o client: `const db = bancoDoOperador(req, supabase);` e usar `db.from(...)`.
   - `req` precisa ter `dashUser.companyId` (sessão do dashboard). Conferir que o
     middleware de auth já popula isso na rota.
4. **NÃO** filtrar por `company_id` no código (o RLS faz) — mas deixar o filtro
   existente não atrapalha (é redundante e seguro).
5. Baixar o teto no teste-guarda ratchet (ver Fatia 4b).
6. `npx tsc --noEmit` limpo + `npx vitest run` verde.

## Fatias

### Fatia 4 — migrar rotas de LEITURA do dashboard (em lote) + teste-guarda
- **4a:** migrar, seguindo a receita: resto de `/leads/*`, Home/Cockpit, Clientes
  (listar/arquivar/desarquivar/excluir). Depois: Pós-venda (8), Usinas/monit/manut (13),
  Propostas/Contratos (7). **Delicadas** (checar `company_id` no schema antes): slug
  público e custos.
- **4b:** criar `tests/tenant-rota-guard.test.ts` (ratchet): conta os usos de
  `supabase.from` (não-migrado) e `supabaseService` (global intencional) no router e
  falha se **passar do teto**. Começar com o teto atual e **baixar a cada rota migrada**
  (impede regressão silenciosa). Allowlist explícita pras rotas globais.
- **Ordem:** leitura antes de escrita (leitura é reversível; escrita com RLS errado
  pode barrar gravação legítima). Escrita (`insert/update/delete`) numa sub-fatia depois,
  com o teste-vazamento cobrindo INSERT/UPDATE cross-tenant.

### Fatia 5 — teste-vazamento no CI (blueprint §9, obrigatório)
- Job de CI que roda `supabase start` (Postgres local com as migrations), cria **2
  empresas fake** (A e B), grava 1 lead em cada via crachá, e prova:
  - crachá de A **lê** só os dados de A (não vê B);
  - crachá de A **NÃO grava** em B (INSERT/UPDATE com company_id de B → 42501);
  - `service_role` (bypass) enxerga os dois (controle).
- Aproveitar `scripts/teste-vazamento-rls.ts` (já faz 5 provas via HTTP) — adaptar pra
  rodar contra o Supabase local no CI, não contra produção. **Falhar = quebra o build.**

### Fatia 6 — guarda estático de migration
- Teste vitest que varre `supabase/migrations/*.sql`: todo `CREATE TABLE` novo tem que
  ter, na mesma migration, `ENABLE`+`FORCE ROW LEVEL SECURITY` + política de isolamento
  (ou estar numa **allowlist** de globais/singletons). Sem isso → vermelho. Impede que
  uma tabela nova nasça "aberta" e vaze.

### Fatia 7 — travas de produção (ANTES de virar a flag)
1. **Segredo de sessão falhar-fechado:** conferir onde a sessão do dashboard é assinada
   hoje (o `auth.ts` da nota antiga não existe mais — localizar o módulo atual) e garantir
   que, sem segredo forte no env, o app **não sobe** (em vez de usar fallback fraco).
2. Chaves no EasyPanel: `SUPABASE_JWT_SECRET` (Supabase → Settings → API → JWT Secret) +
   `SUPABASE_ANON_KEY`. Conferir também no `.env` local.
3. Rodar o **teste-vazamento** como smoke (Fatia 5) antes e depois de virar a flag.

### Ativação
- Ligar `RLS_TENANT_ROTAS=1` no EasyPanel → o `bancoDoOperador` passa a emitir crachá
  nas rotas migradas. Rodar o teste-vazamento. Monitorar logs (erros 42501 inesperados =
  rota que precisa de dado de outra empresa OU rota global que virou crachá por engano).
- **Rollback instantâneo:** tirar a flag → volta pro `service_role`. Zero migration.

### Depois (fora desta rodada)
- **Eva/webhook:** crachá a partir do `phone_number_id` → company_id (mapa
  tenant↔número). Hoje é full-bypass.
- `getOrCreateLeadByPhone` (supabase.ts) passar `company_id` explícito (achado: criava
  lead sem company_id → órfão, já consertado no banco, falta no código de escrita).
- FK `companies(id)` nas colunas company_id (deixada de fora na Fase 1 pra evitar scan).

## Coordenação
- Raia do **Jonnata** — combinar no grupo antes de migrar rotas em lote (evita colidir/
  merge feio). Migração é **rota a rota, PRs pequenos**, cada um baixando o teto do ratchet.
- SQL sempre pelo **SQL Editor** do projeto de produção (`kupnsoyymulbdzakqlqc`). Backup
  PITR antes de qualquer migration nova.
- Regra de ouro: **não quebrar produção.** A flag desligada é a rede de segurança —
  migrar com ela desligada, provar no vazamento, só então ativar.
