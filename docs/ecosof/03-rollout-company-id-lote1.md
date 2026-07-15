# Rollout de `company_id` — Fase 1, Lote 1

**Data:** 15/07/2026 · **Autor:** Lucas · **Decisão base:** `docs/ecosof/02-decisao-vocabulario.md`
(Opção A, aprovada pelo Junior em 15/07/2026).

Este documento é o runbook da Tarefa 2 do bloco "esqueleto do prédio". Cobre o que o **Lote 1**
(este PR) entrega, e os comandos prontos pros **lotes seguintes** (aplicados por você, à mão, um
grupo de tabelas por vez).

⚠️ **Antes de aplicar qualquer coisa aqui:** confirme os números `077`/`078` no grupo do WhatsApp
(regra do CLAUDE.md) — foram escolhidos com base no `076` sendo a última migration na `main` no
momento do push; se alguém aplicou uma `077`/`078` diferente nesse meio tempo, renumere antes de
rodar.

---

## ⚠️ Achado do Lote 1 (15/07/2026): banco de produção pode estar atrás das migrations

Ao aplicar a `077`, o Junior encontrou `elo_memoria` (criada na migration `072`) **inexistente**
no banco de produção — a `072` nunca tinha sido aplicada lá, mesmo já estando na `main` havia
tempo. Corrigido na hora (aplicou a `072` a mão, depois o `company_id`), mas fica o alerta: **não
dá pra assumir que "está na `main`" = "está no banco"** — o fluxo é manual (SQL Editor, sem
`supabase db push`/tracking automático), então drift é possível e silencioso até travar em algo.

**Antes de qualquer lote de backfill (Passo 2 em diante), rode as duas queries abaixo no SQL
Editor.** São só `SELECT` — não mudam nada, pode rodar quantas vezes quiser.

**Query 1 — alguma tabela esperada não existe no banco?**
```sql
WITH esperadas(tabela) AS (
  VALUES
    ('alertas_sistema'),
    ('app_flags'),
    ('audit_log'),
    ('blog_drafts'),
    ('channel_daily_metrics'),
    ('companies'),
    ('conversation_patterns'),
    ('conversations'),
    ('custos_fixos'),
    ('custos_ia_uso'),
    ('dashboard_roles'),
    ('dashboard_users'),
    ('dm_messages'),
    ('dm_threads'),
    ('dossiers'),
    ('elo_memoria'),
    ('elo_uso'),
    ('email_descadastro'),
    ('email_modelos'),
    ('email_sequencia'),
    ('empresa_config'),
    ('empresa_kits'),
    ('engineers'),
    ('eva_cadence'),
    ('eva_intro_pending'),
    ('eva_knowledge_chunks'),
    ('eventos_elo'),
    ('external_articles'),
    ('fechamentos'),
    ('financeiro_anexos'),
    ('financeiro_atividades'),
    ('financeiro_categorias'),
    ('financeiro_contas_a_receber'),
    ('financeiro_lancamentos'),
    ('financeiro_materiais_compras'),
    ('financeiro_parametros'),
    ('financeiro_recebimentos'),
    ('financeiro_receita_mensal'),
    ('followups'),
    ('geracao_diaria'),
    ('lead_anexos'),
    ('lead_atividades'),
    ('lead_ia_conversas'),
    ('lead_tarefas'),
    ('leads'),
    ('learning_insights'),
    ('logs'),
    ('maintenance_reminders'),
    ('manutencoes'),
    ('marketing_alerts'),
    ('marketing_campaign_logs'),
    ('marketing_campaigns'),
    ('marketing_creative_logs'),
    ('marketing_creatives'),
    ('marketing_drafts'),
    ('marketing_personas'),
    ('meta_ads_insights'),
    ('meta_leadgen_events'),
    ('monitoring_abordagens'),
    ('monitoring_alerts'),
    ('monitoring_config'),
    ('monitoring_treino'),
    ('ordens_servico'),
    ('os_fotos'),
    ('pos_venda_sugestao_memoria'),
    ('post_install_touches'),
    ('proposta_attachments'),
    ('proposta_visualizacoes'),
    ('propostas_publicas'),
    ('reengagement_touches'),
    ('relatorio_slugs'),
    ('relatorios_pos_instalacao'),
    ('rh_candidatos'),
    ('rh_vagas'),
    ('sistemas_clientes'),
    ('telemetria_catalogo'),
    ('telemetria_medicoes'),
    ('telemetria_medicoes_2026_07'),
    ('telemetria_medicoes_2026_08'),
    ('telemetria_medicoes_2026_09'),
    ('telemetria_medicoes_2026_10'),
    ('telemetria_medicoes_2026_11'),
    ('telemetria_medicoes_2026_12'),
    ('telemetria_medicoes_2027_01'),
    ('telemetria_medicoes_2027_02'),
    ('telemetria_medicoes_2027_03'),
    ('telemetria_medicoes_2027_04'),
    ('telemetria_medicoes_2027_05'),
    ('telemetria_medicoes_2027_06'),
    ('telemetria_resumo'),
    ('testimonials')
)
SELECT e.tabela AS tabela_esperada_mas_ausente
FROM esperadas e
LEFT JOIN pg_tables t ON t.schemaname = 'public' AND t.tablename = e.tabela
WHERE t.tablename IS NULL
ORDER BY 1;
-- Resultado vazio = banco em dia com as 91 tabelas que as migrations definem hoje.
-- Cada linha que aparecer é uma migration que criou aquela tabela e nunca rodou aqui.
```

**Query 2 — das 61 tabelas do Lote 1, alguma ficou sem a coluna `company_id`?**
```sql
WITH tenant_tabelas(tabela) AS (
  VALUES
    ('alertas_sistema'),
    ('blog_drafts'),
    ('channel_daily_metrics'),
    ('conversation_patterns'),
    ('conversations'),
    ('custos_fixos'),
    ('custos_ia_uso'),
    ('dm_messages'),
    ('dm_threads'),
    ('dossiers'),
    ('elo_memoria'),
    ('elo_uso'),
    ('email_descadastro'),
    ('email_modelos'),
    ('email_sequencia'),
    ('engineers'),
    ('eva_cadence'),
    ('eva_intro_pending'),
    ('external_articles'),
    ('fechamentos'),
    ('financeiro_atividades'),
    ('financeiro_categorias'),
    ('financeiro_contas_a_receber'),
    ('financeiro_lancamentos'),
    ('financeiro_materiais_compras'),
    ('financeiro_parametros'),
    ('financeiro_recebimentos'),
    ('financeiro_receita_mensal'),
    ('followups'),
    ('geracao_diaria'),
    ('lead_anexos'),
    ('learning_insights'),
    ('maintenance_reminders'),
    ('manutencoes'),
    ('marketing_alerts'),
    ('marketing_campaign_logs'),
    ('marketing_campaigns'),
    ('marketing_creative_logs'),
    ('marketing_creatives'),
    ('marketing_drafts'),
    ('marketing_personas'),
    ('meta_ads_insights'),
    ('meta_leadgen_events'),
    ('monitoring_abordagens'),
    ('monitoring_alerts'),
    ('ordens_servico'),
    ('os_fotos'),
    ('pos_venda_sugestao_memoria'),
    ('post_install_touches'),
    ('proposta_attachments'),
    ('proposta_visualizacoes'),
    ('propostas_publicas'),
    ('reengagement_touches'),
    ('relatorio_slugs'),
    ('relatorios_pos_instalacao'),
    ('rh_candidatos'),
    ('rh_vagas'),
    ('sistemas_clientes'),
    ('telemetria_medicoes'),
    ('telemetria_resumo'),
    ('testimonials')
)
SELECT tt.tabela AS tabela_sem_company_id
FROM tenant_tabelas tt
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = tt.tabela AND c.column_name = 'company_id'
)
ORDER BY 1;
-- Resultado vazio = as 61 tabelas do Lote 1 estão todas com a coluna. Confirma o "61/61".
```

Se a Query 1 apontar alguma tabela faltando, o jeito é o mesmo que o Junior já fez com a
`elo_memoria`: aplicar a migration que cria aquela tabela primeiro (na ordem certa, olhando o
número dela), depois seguir com o `company_id`. Vale rodar a Query 1 de novo depois, pra confirmar
que não sobrou nenhuma.

**Nota de manutenção:** essas duas listas (91 e 61 tabelas) são uma fotografia de hoje
(migrations até `078`). Se novas migrations entrarem depois, as listas ficam desatualizadas — me
avisa que eu regenero a partir do `supabase/migrations/` atual antes do próximo lote.

---

## O que o Lote 1 entrega (este PR)

| Arquivo | O que faz | Risco |
|---|---|---|
| `supabase/migrations/077_tenant_company_id_step1_nullable.sql` | `ADD COLUMN company_id uuid DEFAULT <EcoSun>` (nullable) em 61 tabelas | Nenhum — metadata-only, não escaneia nem reescreve tabela |
| `supabase/migrations/078_tenant_company_id_backfill_procedures.sql` | Cria 2 procedures de backfill em lote. **Não roda em nenhuma linha sozinha** | Nenhum — só cria as procedures |
| `tests/migrations-tenant-guard.test.ts` | Guarda de regressão: toda `CREATE TABLE` nova sem `company_id` fora da allowlist quebra o `vitest` | — |

Depois que o Junior aplicar `077` + `078` no Supabase e confirmar, os lotes seguintes (passo 2, 3 e
4 por tabela) usam os comandos das seções abaixo — sem precisar de PR novo pra cada tabela, a menos
que você prefira revisar em grupos.

---

## Classificação completa das tabelas (79 no total)

### Já tinham `company_id` antes deste PR (9) — não mexidas
`companies`, `dashboard_roles`, `dashboard_users`, `audit_log`, `leads`, `lead_atividades`,
`lead_tarefas`, `lead_ia_conversas`, `eventos_elo` (migrations 056/057/061/069).

### Conceito diferente (1) — não mexida
`eva_knowledge_chunks` — já tem `tenant_id` (text, slug do RAG). Ver `02-decisao-vocabulario.md`
§3.

### Excluídas — globais/singleton/referência (8) — não recebem `company_id`
| Tabela | Motivo |
|---|---|
| `app_flags` | flags de app, key/value global |
| `logs` | log de sistema, global |
| `monitoring_config` | singleton (`id=1`), config de autonomia do monitoramento |
| `monitoring_treino` | regras de treino internas (ajuste do Junior), não é dado de cliente |
| `telemetria_catalogo` | catálogo de referência marca→código normalizado |
| `empresa_config` | singleton (`id=1`) — identidade da implantação, eixo **SILO** do Kit Clone, diferente do pool `company_id` (ver `02-decisao-vocabulario.md` §1.5) |
| `empresa_kits` | catálogo de kits da implantação, mesmo eixo SILO do `empresa_config` |
| `financeiro_anexos` | tabela de referência fixa dos anexos do Simples Nacional (lei federal, não dado de cliente) |

### Recebem `company_id` no Lote 1 — 61 tabelas, agrupadas pra facilitar backfill/confirmação

Ordem sugerida pros lotes de backfill (grupos pequenos, confirme um antes do próximo):

**Grupo A — CRM/Eva (10):** `dossiers`, `conversations`, `conversation_patterns`,
`learning_insights`, `eva_cadence`, `eva_intro_pending`, `followups`, `lead_anexos`, `fechamentos`,
`testimonials`

**Grupo B — Financeiro (10):** `financeiro_atividades`, `financeiro_categorias`,
`financeiro_contas_a_receber`, `financeiro_lancamentos`, `financeiro_materiais_compras`,
`financeiro_parametros`, `financeiro_recebimentos`, `financeiro_receita_mensal`, `custos_fixos`,
`custos_ia_uso`

**Grupo C — Marketing (14):** `marketing_alerts`, `marketing_campaign_logs`,
`marketing_campaigns`, `marketing_creative_logs`, `marketing_creatives`, `marketing_drafts`,
`marketing_personas`, `meta_ads_insights`, `meta_leadgen_events`, `channel_daily_metrics`,
`blog_drafts`, `external_articles`, `dm_threads`, `dm_messages`

**Grupo D — Propostas (4):** `proposta_attachments`, `proposta_visualizacoes`,
`propostas_publicas`, `relatorio_slugs`

**Grupo E — Monitoramento/Usinas (7, ORDEM IMPORTA):** `sistemas_clientes` **primeiro** (as outras
duas do grupo dependem dela), `geracao_diaria`, `alertas_sistema`, `monitoring_abordagens`,
`monitoring_alerts`, depois `telemetria_medicoes` e `telemetria_resumo` (procedure especial, ver
§Passo 2 abaixo)

**Grupo F — Pós-venda/OS (8):** `manutencoes`, `maintenance_reminders`, `ordens_servico`,
`os_fotos`, `post_install_touches`, `reengagement_touches`, `relatorios_pos_instalacao`,
`pos_venda_sugestao_memoria`

**Grupo G — RH (2):** `rh_candidatos`, `rh_vagas`

**Grupo H — Elo/E-mail (5):** `elo_memoria`, `elo_uso`, `email_descadastro`, `email_modelos`,
`email_sequencia`

**Grupo I — Engenharia (1):** `engineers`

---

## Passo 2 — Backfill em lote (roda no SQL Editor do Supabase, depois que 077+078 estiverem aplicadas)

Pra qualquer tabela dos grupos A–D, F–I (tem coluna `id uuid`):

```sql
CALL backfill_company_id('conversations');
```

Roda até esgotar os `NULL`, com `COMMIT` a cada 2000 linhas — pode acompanhar pelas mensagens
`RAISE NOTICE` no SQL Editor. É idempotente: se parar no meio, rodar de novo só continua.

Pra trocar o tamanho do lote (tabela muito grande, quer ir mais devagar):
```sql
CALL backfill_company_id('conversations', 500);
```

**Grupo E é diferente.** `sistemas_clientes` usa a procedure normal, mas **precisa rodar antes**
das outras duas — `telemetria_medicoes`/`telemetria_resumo` não têm coluna `id` (chave composta em
`sistema_id`) e herdam o `company_id` de `sistemas_clientes` via `JOIN`:

```sql
CALL backfill_company_id('sistemas_clientes');   -- primeiro, sempre
CALL backfill_company_id('geracao_diaria');
CALL backfill_company_id('alertas_sistema');
CALL backfill_company_id('monitoring_abordagens');
CALL backfill_company_id('monitoring_alerts');
CALL backfill_telemetria_company_id('telemetria_medicoes');  -- depois de sistemas_clientes
CALL backfill_telemetria_company_id('telemetria_resumo');    -- idem
```

Como conferir que uma tabela terminou (0 linhas `NULL` restantes):
```sql
SELECT count(*) FROM <tabela> WHERE company_id IS NULL;  -- espera 0
```

---

## Passo 3 — `NOT NULL` (só depois do Passo 2 confirmado com 0 NULLs na tabela)

**Não use `ALTER TABLE ... ALTER COLUMN company_id SET NOT NULL;` direto** — em Postgres isso
segura lock `ACCESS EXCLUSIVE` (bloqueia leitura E escrita) pelo tempo do scan de validação, que é
exatamente o que a regra "nunca travar tabela grande" proíbe.

Template seguro (3 statements, o 3º sai instantâneo porque o Postgres 12+ reconhece que o CHECK já
provou a mesma coisa):

```sql
-- troque <tabela> pelo nome real
ALTER TABLE <tabela> ADD CONSTRAINT <tabela>_company_id_not_null
  CHECK (company_id IS NOT NULL) NOT VALID;          -- instantâneo, não escaneia

ALTER TABLE <tabela> VALIDATE CONSTRAINT <tabela>_company_id_not_null;
  -- escaneia, mas só segura lock leve (SHARE UPDATE EXCLUSIVE) — não bloqueia leitura/escrita

ALTER TABLE <tabela> ALTER COLUMN company_id SET NOT NULL;
  -- instantâneo: Postgres vê o CHECK já validado e pula o re-scan

ALTER TABLE <tabela> DROP CONSTRAINT <tabela>_company_id_not_null;
  -- cosmético: a NOT NULL da coluna já cobre o mesmo caso
```

---

## Passo 4 — Índice `CONCURRENTLY`

**Tabelas normais** (todas exceto `telemetria_medicoes`):
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_<tabela>_company_id ON <tabela>(company_id);
```
`CONCURRENTLY` não pode rodar dentro de bloco de transação — no SQL Editor do Supabase, rode essa
linha sozinha (não junto com outras em uma única "execução" se o editor agrupar em transação).

**`telemetria_medicoes` é especial** (tabela particionada — `CREATE INDEX CONCURRENTLY` direto no
pai não é suportado pelo Postgres do jeito normal). Padrão documentado pra isso: criar o índice
`CONCURRENTLY` em cada partição, depois anexar ao índice do pai:

```sql
-- 1) uma vez por partição (troque _2026_07 pelo sufixo de cada uma das 12)
CREATE INDEX CONCURRENTLY idx_telemetria_medicoes_2026_07_company_id
  ON telemetria_medicoes_2026_07(company_id);
-- ...repita pras outras 11 partições (2026_08 .. 2027_06)

-- 2) cria o índice "guarda-chuva" no pai, sem forçar as partições (ONLY = não escaneia)
CREATE INDEX idx_telemetria_medicoes_company_id ON ONLY telemetria_medicoes(company_id);

-- 3) anexa cada índice de partição ao índice do pai (uma vez por partição)
ALTER INDEX idx_telemetria_medicoes_company_id
  ATTACH PARTITION idx_telemetria_medicoes_2026_07_company_id;
-- ...repita pras outras 11

-- quando TODAS as partições estiverem anexadas, o índice do pai fica "valid" sozinho.
```

---

## Decisões em aberto (não resolvidas nesta tarefa, ficam pro Junior)

- **FK `REFERENCES companies(id)`:** as 61 tabelas do Lote 1 ganharam `company_id uuid` **sem** a
  constraint de FK (só a coluna). Adicionar depois é o mesmo padrão do Passo 3 (`ADD CONSTRAINT
  ... NOT VALID` → `VALIDATE CONSTRAINT`), mas não foi pedido nesta fase — decisão separada.
- **RLS de verdade:** todas as tabelas continuam sem policy de isolamento por tenant (só
  `company_id` como filtro de aplicação). É a Tarefa do Jonnata (Passo 5 do bloco), combinar a
  ordem com ele antes de destravar.
- **`tenant_id`/`company_id` nunca vem do frontend** — regra de app-code pra quando alguém for
  fazer os módulos escreverem `company_id` explicitamente nos INSERTs novos (hoje o `DEFAULT`
  cobre a lacuna, mas só enquanto existir um único tenant real). Fora do escopo desta tarefa
  (migrations), repetido aqui como lembrete pra quem mexer no código depois.
