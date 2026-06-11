# Extensões e Funções/RPCs — EcoSof Kit Clone

## Extensões PostgreSQL

| Extensão | Instalada por | Finalidade |
|----------|--------------|------------|
| `pgcrypto` | migrations 016, 021, 040, 046, 047, 048 | `gen_random_uuid()` — geração de UUIDs. Já habilitada por padrão em projetos Supabase novos. |
| `vector` | migration 030 | Embeddings vetoriais para RAG (busca semântica na base de conhecimento da Eva). Supabase já inclui esta extensão. |

> Ambas as extensões são instaladas com `CREATE EXTENSION IF NOT EXISTS`, portanto são idempotentes.

---

## Funções/RPCs criadas pelas migrations

### `normalize_email_lower()` — migration 026
- **Tipo:** Trigger function
- **Linguagem:** PL/pgSQL
- **Uso:** Disparada antes de INSERT/UPDATE na coluna `leads.email`. Converte o e-mail para lowercase e remove espaços.
- **Chamada via RPC:** Não (é trigger, não chamada diretamente pelo app).

### `match_eva_chunks(query_embedding, p_tenant, match_count, min_similarity)` — migration 030
- **Tipo:** Função SQL estável
- **Linguagem:** SQL
- **Retorno:** `TABLE(source_file text, content text, similarity float)`
- **Uso:** RAG Nível 2 — busca os chunks de conhecimento da Eva mais similares ao embedding da pergunta do usuário.
- **Chamada via RPC:** `client.rpc('match_eva_chunks', { query_embedding, p_tenant, match_count, min_similarity })`

### `increment_pi_access(p_slug)` — migration 034
- **Tipo:** Função SQL, `security definer`
- **Linguagem:** SQL
- **Uso:** Incremento atômico do contador de acessos em `relatorios_pos_instalacao`. Evita race condition em acessos simultâneos.
- **Chamada via RPC:** `client.rpc('increment_pi_access', { p_slug })`

### `fin_somar_receita_mes(p_competencia, p_atividade_id, p_valor)` — migration 046
- **Tipo:** Função SQL
- **Linguagem:** SQL
- **Retorno:** `void`
- **Uso:** Soma atômica de receita no bucket mensal (`financeiro_receita_mensal`). Faz UPSERT evitando race condition em lançamentos concorrentes.
- **Chamada via RPC:** `client.rpc('fin_somar_receita_mes', { p_competencia, p_atividade_id, p_valor })`

---

## View criada pelas migrations

### `v_marketing_dashboard_today` — migration 025
- **Tipo:** View
- **Uso:** Helper para dashboard de marketing. Agrega métricas de `meta_ads_insights` para o dia atual (spend, leads, clicks, impressões, CPL).
- **Query:** `SELECT * FROM v_marketing_dashboard_today`

---

## Trigger criado pelas migrations

### `trg_normalize_email` — migration 026
- **Tabela:** `leads`
- **Evento:** `BEFORE INSERT OR UPDATE OF email`
- **Função:** `normalize_email_lower()`
- **Efeito:** Garante que todos os e-mails no banco ficam em lowercase.
