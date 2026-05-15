# Eva RAG Nível 2 — Design

**Data:** 2026-05-15
**Status:** Aprovado (brainstorming) — pronto para writing-plans
**Repo:** `ecosunpower-agente` (Node 20 + TypeScript ESM + Supabase + Vitest)

## Problema

A Eva injeta hoje ~71k tokens de knowledge por query (todos os `.md` core da raiz de `conhecimento/` sempre + especializados via topic-detector). Isso é caro, dilui as instruções e ainda assim a Eva responde fraca em profundidade técnica (ver incidente 14-15/05: lead técnico mal atendido). RAG resolve: injeta só o que é relevante por similaridade semântica, cortando ~87% dos tokens e melhorando a precisão técnica.

## Estado atual (verificado 15/05)

- `src/modules/knowledge.ts` — `KnowledgeBase` com 2 tiers: **Core** = TODOS os `.md` na raiz de `conhecimento/` (não-recursivo), **sempre** injetados; **Especializado** = `.md` em `conhecimento/especializado/`, carregados sob demanda via `getSpecialized(filenames)`.
- `src/modules/knowledge-topics.ts` — `detectTopics(text)` mapeia keyword → arquivo especializado (será substituído por retrieval semântico).
- `conhecimento/`: ~33 `.md` (16 raiz + 17 em `especializado/`).
- `OPENAI_API_KEY` já existe como env opcional em `src/config.ts` (decisão 2; confirmar linha na implementação).
- Última migration: `029_proposta_visualizacoes.sql`. Próxima: **030**.
- Sem deps de embedding instaladas (precisa add `openai`). `@supabase/supabase-js` já presente.
- Supabase prod = `kupnsoyymulbdzakqlqc`. MCP aponta projeto errado → migration aplicada **manual** pelo Junior via SQL Editor.

## Decisões fechadas (1–8)

1. **Multi-tenant ready** — coluna `tenant_id` em `eva_knowledge_chunks`, default `'ecosunpower'`. Fase 2 (SaaS) só adiciona UI upload + Storage, sem refactor estrutural.
2. **Embedding:** OpenAI `text-embedding-3-small` (1536 dims, ~$0.02/1M tokens, R$ 1-3/mês). Reusa `OPENAI_API_KEY` existente.
3. **Chunking recursivo** 600 tokens / 80 overlap, prioridade de split H2 → H3 → parágrafo → fixed.
4. **Brain híbrido:** 6 arquivos core **fixos sempre injetados** — `empresa.md`, `faq.md`, `objecoes.md`, `perguntas-qualificacao.md`, `processo.md`, `indicacao.md` (~6k tokens). Todo o resto (demais `.md` da raiz + todos de `especializado/`) vira corpus RAG dinâmico. Alvo ~9k tokens/query (6k core + ~3k RAG) vs ~71k hoje.
5. **Ingest:** `npm run ingest` manual + smart-sync no startup por `file_hash` (re-embeda só arquivos que mudaram) + o `news-scraper` dispara re-embed **somente** de `especializado/canal-solar.md` quando o reescreve em runtime.
6. **Corpus MVP:** apenas os `.md` limpos não-core de `conhecimento/`. **SolaX = fast-follow nº1**, NÃO no MVP: o OCR (`Downloads/pdfs-eva/conhecimento Solax/solax-ocr-consolidado.md`, 944 linhas) é **cru e sujo** — Claude rascunha `conhecimento/especializado/solax.md` limpo, Junior **valida as specs** (spec errada em RAG = Eva mente número técnico pro cliente), só então ingere. PDFs datasheets = fase posterior (precisa `pdf-parse`/`unpdf`).
7. **Retrieval:** Top-K=5, similarity threshold ≈ 0.35 (cosine). Ambos via env (`RAG_TOP_K`, `RAG_MIN_SIMILARITY`) — calibração em prod sem deploy. **Fallback:** se nenhum chunk ≥ threshold, usa só os 6 core (NÃO injeta chunk de baixa similaridade — evita citar irrelevante/errado).
8. **Migration pgvector 030** (aplicada manual pelo Junior). Schema + índice abaixo.

## Arquitetura

### Migration `030_eva_knowledge_chunks.sql` (Junior aplica manual no prod)

```sql
create extension if not exists vector;

create table eva_knowledge_chunks (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null default 'ecosunpower',
  source_file text not null,                 -- ex 'especializado/dimensionamento.md'
  chunk_index int  not null,
  content     text not null,
  token_count int,
  file_hash   text not null,                 -- hash do ARQUIVO fonte (smart-sync)
  embedding   vector(1536) not null,
  created_at  timestamptz default now(),
  unique (tenant_id, source_file, chunk_index)
);
create index on eva_knowledge_chunks using hnsw (embedding vector_cosine_ops);
create index on eva_knowledge_chunks (tenant_id, source_file);
```

`hnsw` (não `ivfflat`): melhor recall, sem tuning de `lists` para o tamanho de corpus atual.

### Componentes (unidades isoladas e testáveis)

| Arquivo | Responsabilidade | Depende de | Teste |
|---|---|---|---|
| `src/modules/rag/chunker.ts` | **Puro.** markdown → `{content, index}[]` (recursivo 600/80, H2→H3→¶→fixed) | — | TDD unitário exaustivo |
| `src/modules/rag/embeddings.ts` | Wrapper OpenAI `text-embedding-3-small` (batch + retry + erro gracioso) | `openai` (dep nova) | mock fetch |
| `src/modules/rag/ingest.ts` | Varre `conhecimento/` (exceto 6 core), hash-diff por arquivo, chunk, embed, upsert; `delete where source_file=X` + reinsere quando hash muda | chunker, embeddings, supabase | integração c/ fixtures |
| `src/modules/rag/retrieve.ts` | Embeda query → busca pgvector (RPC cosine, top-K, threshold) → `chunk[]`; fallback vazio | embeddings, supabase | integração |
| `src/modules/brain.ts` (mod) | Contexto = 6 core fixos + `retrieve(query)`, no lugar do `KnowledgeBase` 2-tier + topic-detector | retrieve | regressão |
| `scripts/ingest.ts` + `package.json` `"ingest"` | Entry point manual `npm run ingest` | ingest | — |
| Startup em `src/index.ts` | Chama smart-sync do ingest **não-bloqueante** (após boot via setTimeout, não trava readiness; idempotente por hash) | ingest | — |
| `src/modules/news-scraper.ts` (mod) | Após reescrever `canal-solar.md`, dispara re-embed só desse arquivo | ingest | — |

Função RPC no Postgres (**incluída na migration 030**, mesma aplicação manual) para a busca vetorial:

```sql
create or replace function match_eva_chunks(
  query_embedding vector(1536), p_tenant text, match_count int, min_similarity float
) returns table (source_file text, content text, similarity float)
language sql stable as $$
  select source_file, content, 1 - (embedding <=> query_embedding) as similarity
  from eva_knowledge_chunks
  where tenant_id = p_tenant
    and 1 - (embedding <=> query_embedding) >= min_similarity
  order by embedding <=> query_embedding
  limit match_count;
$$;
```

### Fluxo de dados

**Ingest (deploy/startup ou `npm run ingest`):** lista `.md` de `conhecimento/` exceto os 6 core → para cada, calcula hash → se hash != guardado (ou novo): `delete where source_file=X`, chunk, embed em batch, insere. Idempotente.

**Runtime scraper:** `news-scraper` reescreve `canal-solar.md` → chama `ingest.syncFile('especializado/canal-solar.md')` (só esse).

**Query do cliente:** brain monta system context = (6 core lidos do disco) + `retrieve(mensagemDoCliente)` → embeda query → `match_eva_chunks(emb, tenant, RAG_TOP_K, RAG_MIN_SIMILARITY)` → injeta os chunks. Se 0 chunks → só core.

### Erro / edge

- `OPENAI_API_KEY` ausente → ingest e retrieve fazem no-op logado; brain cai em **só core** (degrada, não quebra). Eva continua funcionando como hoje (sem RAG) até a key existir.
- Embedding API falha (timeout/rate) → retry exponencial; ingest falha de 1 arquivo não aborta os outros; retrieve falha → fallback core-only.
- Chunk sem nenhum match ≥ threshold → core-only (decisão 7).
- Re-sync sempre idempotente (hash). Migration falha → Junior vê no SQL Editor; nada quebra em prod (tabela só usada se existir + key setada).

### Testes (TDD onde puro)

- `chunker.ts`: red→green exaustivo — H2/H3/parágrafo/fixed, overlap, markdown sujo, vazio, arquivo > limite, code fence.
- `embeddings.ts`: mock — batching, retry, erro gracioso.
- `ingest.ts` / `retrieve.ts`: integração com fixtures (sem chamar OpenAI/Supabase reais — mock).
- `brain.ts`: regressão — contexto montado com 6 core + chunks; fallback core-only quando retrieve vazio; não reintroduz markdown cru (mantém `toWhatsAppText`).
- Migration: SQL aplicado manual pelo Junior + SELECT de verificação fornecido.

## Sequenciamento de implementação

1. **MVP pipeline:** dep `openai`, migration 030 (Junior), chunker (TDD), embeddings, ingest (`npm run ingest` + startup), retrieve, brain híbrido, env vars no Easypanel. Corpus = `.md` limpos não-core. Validar economia de tokens + qualidade de retrieval em prod, calibrar threshold.
2. **Fast-follow nº1 — SolaX:** Claude rascunha `conhecimento/especializado/solax.md` a partir do OCR cru → Junior valida specs → entra no corpus (só re-ingest, zero código novo).
3. **Fase posterior — PDFs datasheets:** add `pdf-parse`/`unpdf`, parser, ingerir `Downloads/pdfs-eva/*.pdf`. Sem mudança de arquitetura (só mais fontes).

## Fora de escopo (YAGNI)

Sem UI de upload (Fase 2 SaaS), sem PDFs no MVP, sem re-rank / multi-query / HyDE, sem multi-touch, sem trocar o provider de embedding. Migração do `knowledge-topics.ts` (topic-detector) é substituída por retrieval — o arquivo pode ser removido quando o brain híbrido estiver validado em prod (não antes).

## Critérios de sucesso

- Tokens/query de knowledge caem de ~71k para ~9k (medido em prod).
- Pergunta técnica real (ex: spec de inversor/bateria) retorna chunk relevante (similarity ≥ 0.35) e a Eva responde com precisão.
- Fallback core-only nunca deixa a Eva sem resposta nem citando lixo.
- Ingest idempotente: deploy sem mudança de conhecimento = zero chamada de embedding (custo zero).
