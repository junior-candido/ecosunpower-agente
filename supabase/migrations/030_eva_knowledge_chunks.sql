-- 030_eva_knowledge_chunks.sql — RAG Nivel 2 (aplicar MANUAL no prod kupnsoyymulbdzakqlqc)
create extension if not exists vector;

create table if not exists eva_knowledge_chunks (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null default 'ecosunpower',
  source_file text not null,
  chunk_index int  not null,
  content     text not null,
  token_count int,
  file_hash   text not null,
  embedding   vector(1536) not null,
  created_at  timestamptz default now(),
  unique (tenant_id, source_file, chunk_index)
);
create index if not exists eva_kc_embedding_idx
  on eva_knowledge_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists eva_kc_file_idx
  on eva_knowledge_chunks (tenant_id, source_file);

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
