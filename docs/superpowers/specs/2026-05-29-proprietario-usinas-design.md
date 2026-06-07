# Gestão de Proprietário das Usinas — Design

**Data:** 2026-05-29
**Branch:** `feat/proprietario-usinas`
**Status:** Aprovado, pronto para plano de implementação

## Problema

No dashboard de monitoramento, ao abrir uma usina e clicar em **Editar**, só é possível
editar dados técnicos (apelido, potência, painel, telhado, etc.). **Não há campo para
cadastrar/vincular o proprietário (dono) da usina.**

Usinas migradas em massa dos painéis externos (Deye, SolarEdge, NEP, ABB) nascem **órfãs**
(`lead_id = NULL`) e precisam ser associadas ao cliente dono — que, na maioria dos casos,
**já está cadastrado** na base.

Hoje existe apenas um caminho parcial e pouco óbvio: na página **Clientes**, usinas órfãs
aparecem como cards e um modal permite **vincular criando um cliente novo**. Limitações:
não dá pra vincular a cliente existente, não dá pra trocar/desvincular, e não há acesso a
partir da própria usina.

## Objetivo

Entregar gestão completa de proprietário, nível produto (essa feature será vendida a
integradores / Rede Superbom B2B). Reaproveita o vínculo que **já existe** no banco —
`sistemas_clientes.lead_id → leads.id` — sem mudar o modelo de dados.

## Estado atual (referências de código)

- **Tabela usinas:** `sistemas_clientes` — migration `supabase/migrations/021_monitoring_systems.sql`.
  Já tem a coluna `lead_id` (FK → `leads.id`, `ON DELETE SET NULL`).
- **Tabela clientes:** `leads` — migration `001_initial_schema.sql` (+ perfil em `033_clientes_perfil.sql`).
  Identificador principal: `phone` (UNIQUE).
- **Editar usina (form):** `src/modules/dashboard/views.ts` → `renderEditarSistemaPage()` (~L997-1140).
  **Não expõe `lead_id`.**
- **Editar usina (rota):** `src/modules/dashboard/router.ts` — `GET/POST /dashboard/monitoramento/:id/editar` (~L864-912).
- **Update backend:** `src/modules/monitoring/service.ts` → `atualizarSistema()` (~L449-490).
  Allowlist de campos **não inclui `lead_id`**.
- **Órfãs:** `src/modules/supabase.ts` → `listSistemasOrfaos()` (~L1283-1295); cards em
  `src/modules/dashboard/clientes-queries.ts` (~L22-30).
- **Vincular (só cria novo):** modal em `src/modules/dashboard/clientes-views.ts` (~L196-210);
  rota `POST /dashboard/clientes/vincular-sistema` em `router.ts` (~L1276-1290);
  função `vincularNovoLeadAoSistema()` em `supabase.ts` (~L1300-1343) — cria lead com
  `installation_status='operando'` + linka.
- **Import em massa (gera órfãs):** `service.ts` → `importarSitesEmMassa()` (~L270-353) e
  `descobrirNovosSites()` (~L360-416). Não capturam proprietário.

## Solução

### Componente 1 — Seletor de cliente reutilizável (autocomplete + criar novo)

O bloco central, reaproveitado em todos os pontos de entrada.

- **API de busca:** `GET /dashboard/api/clientes/search?q=<termo>` — busca em `leads` por
  **nome OU telefone** (case-insensitive, telefone normaliza dígitos), retorna até ~10
  resultados `{ id, name, phone, city }`. Exclui clientes arquivados.
- **UI:** input com dropdown de resultados ao digitar. Abaixo, botão **"+ Criar novo cliente"**
  que expande um mini-form (nome + telefone) — caso raro.
- Implementado como fragmento HTML/JS reutilizável (sem framework, seguindo o padrão atual
  do dashboard).

### Componente 2 — Seção "Proprietário" no Editar usina

Em `renderEditarSistemaPage()`:
- Exibe **dono atual** (nome + link `/dashboard/clientes/:id`) quando houver.
- Seletor de cliente (Componente 1) para **vincular** ou **trocar**.
- Botão **"Desvincular"** quando houver dono (volta a usina a órfã).
- Backend (`atualizarSistema`): adicionar `lead_id` à allowlist, aceitando **UUID** (vincular/
  trocar) ou **null** (desvincular). Validar que o `lead_id` existe em `leads`.

### Componente 3 — Vincular a cliente existente na página Clientes

No modal de vinculação de órfãs (`clientes-views.ts`):
- Adicionar **toggle**: **"Cliente existente"** (usa Componente 1) | **"Criar novo"** (fluxo atual).
- Nova rota/handler para o caminho "existente" → chama `vincularClienteExistente()`.

### Componente 4 — Mostrar proprietário no detalhe da usina (monitoramento)

Na tela de detalhe da usina:
- Exibir **nome do proprietário** + link, ou aviso **"Sem proprietário — definir"**
  (atalho para a seção do Componente 2) quando órfã.

## Backend — funções

- `atualizarSistema()`: incluir `lead_id` na allowlist (UUID | null) + validação de existência.
- **Nova** `vincularClienteExistente(sistema_id, lead_id)` em `service.ts`/`supabase.ts`:
  apenas seta `sistemas_clientes.lead_id`. **Não altera nenhum dado do cliente.**
- Reaproveitar `vincularNovoLeadAoSistema()` no caminho "criar novo".
- **Novo** endpoint de busca de clientes (Componente 1).

## Regras de comportamento

- **Vincular/trocar cliente existente NÃO altera dados do cliente** (status, `installed_at`,
  etc.). Só cria/reaponta o vínculo. *(O caminho "criar novo" mantém o comportamento atual de
  marcar `installation_status='operando'`.)*
- **1 usina = 1 dono**; **1 cliente pode ter N usinas** (modelo atual, mantido).
- **Trocar** = reaponta `lead_id`. **Desvincular** = `lead_id = null` → reaparece nos cards de órfãs.
- **Telefone obrigatório apenas** no fluxo "criar novo".

## Fora de escopo (YAGNI)

- Multi-tenancy (isolamento por integrador) — visão futura; o design não impede.
- Captura automática de proprietário no import em massa — os painéis externos não fornecem
  esse dado de forma confiável; vinculação permanece manual.
- Histórico de troca de proprietário (auditoria de quem foi dono antes).

## Testes (TDD)

- `GET /dashboard/api/clientes/search`: busca por nome, por telefone, limite, exclui arquivados.
- `vincularClienteExistente`: cria vínculo; **não** altera dados do cliente; rejeita usina
  inexistente; rejeita lead inexistente.
- `atualizarSistema` com `lead_id`: aceita UUID válido, aceita null (desvincular), rejeita UUID
  inexistente, mantém os demais campos da allowlist funcionando (zero-regressão).
- Trocar dono: reaponta corretamente; a usina some dos órfãos.
- Desvincular: `lead_id` vira null; usina reaparece nos órfãos.
