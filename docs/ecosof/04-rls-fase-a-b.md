# RLS de verdade — Fase A (portas trancadas) e Fase B (chave por empresa)

**Data:** 16/07/2026 · **Autores:** Junior + Claude · **Tarefa:** Passo 5 do bloco
multi-tenant (a "tarefa do Jonnata" — Jonnata: revisar este doc, a Fase B é sua).
Base: blueprints de 12/07 (`arquitetura-multitenant-eva-ecosunpower.md` §6) e
`02-decisao-vocabulario.md` (Opção A: `company_id`/`companies`).

## Estado encontrado no pré-voo (16/07, produção)

- RLS **ligado** em ~91 tabelas (padrão Supabase), **FORCE desligado** em todas.
- **12 tabelas com política `USING (true)`** ("Service role full access") —
  inclusive `leads`, `conversations`, `custos_*`, `logs`. service_role BYPASSA
  RLS, então essas políticas só serviam pra abrir a tabela pra OUTROS papéis.
- `public_reviews` tem políticas de `anon` INTENCIONAIS (site lê depoimentos
  aprovados, insere avaliação) — não mexer.
- Papéis: `postgres` e `service_role` têm `BYPASSRLS`; `anon`/`authenticated`/
  `authenticator` não (pré-requisito do FORCE sem sustos confirmado).
- Fundação pronta (Passos 1–4, concluídos 15–16/07): `company_id` NOT NULL +
  DEFAULT EcoSun + índice em 69 tabelas (61 do Lote 1 + 8 antigas + `leads`,
  que estava sem DEFAULT — consertada em 16/07).

## Fase A — migration `079_rls_forca_e_isolamento.sql` (aplicada por Junior)

O que faz (detalhe no cabeçalho da própria migration):
1. `ENABLE` + `FORCE ROW LEVEL SECURITY` nas 69 tabelas com `company_id` + `companies`.
2. Aposenta as políticas `USING (true)`.
3. Política `company_isolation` em cada tabela:
   `company_id = coalesce(GUC app.company_id, claim company_id do JWT)` —
   `USING` + `WITH CHECK` (leitura E escrita). `companies` isola por `id`.
4. `logs`: sem política (global; só bypass lê).

**Impacto:** zero pro app (service_role bypassa) e pro SQL Editor (postgres
bypassa). anon/authenticated: negado em tudo que não for `public_reviews`.

**Smoke test pós-aplicação:** (a) dashboard abre e lista leads; (b) Eva responde
uma mensagem; (c) site continua mostrando depoimentos; (d) `SELECT count(*) FROM
leads` no Editor devolve o total (bypass funcionando).

## Fase B — a chave por empresa (Jonnata)

**Problema:** o app fala com o banco como `service_role` (bypass). Enquanto for
assim, o isolamento depende de TODO caminho de código filtrar por `company_id`
— um esquecimento = vazamento. A Fase B faz o Postgres impor.

**Desenho proposto (revisar antes de codar):**
1. **Cliente por empresa no backend:** o Express, ao atender uma requisição de
   tenant, usa um client Supabase com JWT próprio (assinado no servidor com o
   segredo do projeto) contendo `role: 'authenticated'` e claim
   `company_id: <uuid>`. A política da 079 já lê esse claim — nada de SQL novo.
2. **`company_id` NUNCA vem do frontend** (body/header/query). Sai da SESSÃO do
   operador logado (dashboard) ou do `phone_number_id` do webhook (Eva).
3. **Migração strangler:** módulo a módulo troca `this.client` (service) pelo
   client-do-tenant. service_role fica só pra: webhooks de sistema, jobs, e o
   que for genuinamente cross-tenant (billing, telemetria de plataforma).
4. **Teste de vazamento no CI** (obrigatório, blueprint §9): sobe 2 empresas
   fake, grava lead em cada uma, e prova que o client da empresa A não lê nem
   escreve na B. Roda com Postgres/Supabase local (`supabase start`) — os
   testes atuais rodam sem segredo, este ganha um job próprio.
5. **Guarda de regressão:** teste estático (padrão `migrations-tenant-guard`)
   — `CREATE TABLE` novo sem `ENABLE ROW LEVEL SECURITY` + política na mesma
   migration quebra o vitest (allowlist pra globais).

**Fora de escopo da Fase B:** trocar supabase-js por pool pg com
`set local app.company_id` (o predicado da 079 já aceita esse caminho se um dia
a conexão virar direta — nada a refazer).

**Pergunta em aberto pro Jonnata:** onde nasce o JWT por empresa (helper único
em `modules/supabase.ts`?) e qual o TTL/rotação. Combinar antes de codar.
