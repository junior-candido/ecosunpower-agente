-- supabase/migrations/157_modulo_studio_3d.sql
-- STUDIO 3D (Energy Studio, 02/10/2026): projeto FV 3D pelo voo do drone, dentro
-- do painel (/dashboard/studio-3d). Módulo vendável próprio: 'studio_3d'.
-- A EcoSun (casa) já nasce com ele ligado; tenant só com contrato.
COMMENT ON COLUMN empresa_modulos.modulo IS
  'eva | email | pasta_digital | monitoramento | financeiro | fiscal | rh | marketing | medicao | previsto_real | studio_3d';

INSERT INTO empresa_modulos (company_id, modulo, ativo, contratado_em, observacao)
VALUES ('00000000-0000-0000-0000-000000000001', 'studio_3d', true, current_date, 'casa — Studio 3D (migration 157)')
ON CONFLICT (company_id, modulo) DO UPDATE SET ativo = true, updated_at = now();

-- Conferência: deve listar a EcoSun com studio_3d ativo.
SELECT company_id, modulo, ativo FROM empresa_modulos WHERE modulo = 'studio_3d';
