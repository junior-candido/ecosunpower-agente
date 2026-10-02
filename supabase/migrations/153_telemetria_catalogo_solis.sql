-- supabase/migrations/153_telemetria_catalogo_solis.sql
-- Catálogo de telemetria da SOLIS (Energy Studio, Marco 2 — 02/10/2026).
-- Liga a coleta de tensão da rede (aba "Rede" da usina + vigia tensao_rede_alta)
-- para as usinas Solis. Campos do inverterDetail confirmados no documento
-- oficial "SolisCloud Platform API Document V2.0". O código converte pac pela
-- unidade que a própria API manda (pacStr) e descarta fase inexistente (0 V).
INSERT INTO telemetria_catalogo (marca, device_type, ponto_nativo, ponto, rotulo, unidade, categoria) VALUES
  ('solis', 1, 'pac',  'potencia',      'Potência ativa',        'kW', 'potencia'),
  ('solis', 1, 'uAc1', 'tensao_fase_a', 'Tensão da rede fase A', 'V',  'tensao'),
  ('solis', 1, 'uAc2', 'tensao_fase_b', 'Tensão da rede fase B', 'V',  'tensao'),
  ('solis', 1, 'uAc3', 'tensao_fase_c', 'Tensão da rede fase C', 'V',  'tensao'),
  ('solis', 1, 'fac',  'frequencia',    'Frequência da rede',    'Hz', 'outro')
ON CONFLICT DO NOTHING;

-- Conferência
SELECT ponto_nativo, ponto, unidade FROM telemetria_catalogo WHERE marca = 'solis' ORDER BY ponto;
