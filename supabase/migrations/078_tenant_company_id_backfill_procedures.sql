-- Migration 078: Fase 1 da fundacao multi-tenant -- infraestrutura do Passo 2/4 (backfill)
-- So CRIA as procedures. NAO faz backfill de nenhuma linha sozinha -- quem dispara e o
-- "CALL" (feito a mao, tabela por tabela, nos lotes seguintes). Ver
-- docs/ecosof/03-rollout-company-id-lote1.md pra ordem e comandos prontos.
--
-- Por que procedure (nao 1 UPDATE gigante nem script local):
--   - "UPDATE tabela SET company_id = X WHERE company_id IS NULL" de uma vez so segura o
--     lock da tabela ate terminar -- exatamente o que a regra "nunca travar tabela grande
--     em producao" proibe.
--   - Procedure com COMMIT dentro do loop e o unico jeito de fazer isso em lotes DENTRO do
--     SQL Editor do Supabase (o time ja usa esse fluxo -- CLAUDE.md), sem precisar de um
--     script local com credencial de servico.
--   - FOR UPDATE SKIP LOCKED: se alguma linha do lote estiver sendo escrita por outra
--     transacao no momento, o lote pula ela (pega na proxima chamada) em vez de esperar
--     um lock.
--
-- backfill_company_id(): generica, para as tabelas com "id uuid PRIMARY KEY" (a maioria).
-- backfill_telemetria_company_id(): so para telemetria_medicoes/telemetria_resumo -- essas
--   duas nao tem coluna "id" (PK composta em sistema_id+device_key+ponto+ts/dia), entao
--   herdam o company_id de sistemas_clientes via JOIN por sistema_id. PRE-REQUISITO:
--   sistemas_clientes precisa estar com o backfill dela feita ANTES de rodar essa.

CREATE OR REPLACE PROCEDURE backfill_company_id(
  p_table      text,
  p_batch_size int  DEFAULT 2000,
  p_company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows  int;
  v_total int := 0;
BEGIN
  LOOP
    EXECUTE format(
      $sql$
        WITH lote AS (
          SELECT id FROM %I
          WHERE company_id IS NULL
          LIMIT %s
          FOR UPDATE SKIP LOCKED
        )
        UPDATE %I t SET company_id = %L
        FROM lote WHERE t.id = lote.id
      $sql$,
      p_table, p_batch_size, p_table, p_company_id
    );
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
    RAISE NOTICE '% : % linhas neste lote (% no total)', p_table, v_rows, v_total;
    COMMIT;
    EXIT WHEN v_rows = 0;
    PERFORM pg_sleep(0.05);
  END LOOP;
  RAISE NOTICE '% : backfill concluido, % linhas no total', p_table, v_total;
END;
$$;

COMMENT ON PROCEDURE backfill_company_id(text, int, uuid) IS
  'Passo 2/4 do rollout de company_id. Uso: CALL backfill_company_id(''nome_da_tabela'');
   So funciona em tabela com coluna "id" como PK. Idempotente -- rodar de novo so continua
   de onde parou (WHERE company_id IS NULL). Ver docs/ecosof/03-rollout-company-id-lote1.md.';

CREATE OR REPLACE PROCEDURE backfill_telemetria_company_id(
  p_table      text,
  p_batch_size int DEFAULT 2000
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows  int;
  v_total int := 0;
BEGIN
  IF p_table NOT IN ('telemetria_medicoes', 'telemetria_resumo') THEN
    RAISE EXCEPTION 'backfill_telemetria_company_id so aceita telemetria_medicoes ou telemetria_resumo, recebeu %', p_table;
  END IF;

  LOOP
    EXECUTE format(
      $sql$
        WITH lote AS (
          SELECT t.ctid AS row_ctid
          FROM %I t
          WHERE t.company_id IS NULL
          LIMIT %s
          FOR UPDATE SKIP LOCKED
        )
        UPDATE %I t SET company_id = s.company_id
        FROM sistemas_clientes s, lote
        WHERE t.ctid = lote.row_ctid AND s.id = t.sistema_id
      $sql$,
      p_table, p_batch_size, p_table
    );
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
    RAISE NOTICE '% : % linhas neste lote (% no total)', p_table, v_rows, v_total;
    COMMIT;
    EXIT WHEN v_rows = 0;
    PERFORM pg_sleep(0.05);
  END LOOP;
  RAISE NOTICE '% : backfill concluido, % linhas no total', p_table, v_total;
END;
$$;

COMMENT ON PROCEDURE backfill_telemetria_company_id(text, int) IS
  'Passo 2/4 so pra telemetria_medicoes/telemetria_resumo (sem coluna id, herdam
   company_id de sistemas_clientes via sistema_id). PRE-REQUISITO: rodar
   CALL backfill_company_id(''sistemas_clientes''); primeiro. Ver
   docs/ecosof/03-rollout-company-id-lote1.md.';
