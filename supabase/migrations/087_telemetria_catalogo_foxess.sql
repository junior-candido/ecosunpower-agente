-- 087: catálogo de telemetria da FoxESS (fase 2B — vigias de tensão/corrente).
-- A FoxESS coleta ao vivo desde 03/07 (/op/v0/device/real/query), mas o
-- catálogo só tinha Sungrow (067) → tudo era descartado. Este seed liga a
-- gravação pros micros Q1 da carteira (nomes das variáveis validados ao vivo:
-- generationPower/RVolt/invTemperation; pvN* = entradas FV do micro).
-- A FoxESS devolve nas unidades FINAIS (kW/V/A/°C) — o parse ignora o fator.
INSERT INTO telemetria_catalogo (marca, device_type, ponto_nativo, ponto, rotulo, unidade, categoria) VALUES
  ('foxess', 1, 'generationPower', 'potencia',        'Potência ativa',      'kW', 'potencia'),
  ('foxess', 1, 'RVolt',           'tensao_fase_r',   'Tensão da rede',      'V',  'tensao'),
  ('foxess', 1, 'RCurrent',        'corrente_fase_r', 'Corrente da rede',    'A',  'corrente'),
  ('foxess', 1, 'RFreq',           'frequencia',      'Frequência da rede',  'Hz', 'outro'),
  ('foxess', 1, 'invTemperation',  'temperatura',     'Temperatura interna', '°C', 'temperatura'),
  ('foxess', 1, 'pv1Volt',         'tensao_pv1',      'Tensão entrada PV1',  'V',  'tensao'),
  ('foxess', 1, 'pv1Current',      'corrente_pv1',    'Corrente entrada PV1','A',  'corrente'),
  ('foxess', 1, 'pv2Volt',         'tensao_pv2',      'Tensão entrada PV2',  'V',  'tensao'),
  ('foxess', 1, 'pv2Current',      'corrente_pv2',    'Corrente entrada PV2','A',  'corrente'),
  ('foxess', 1, 'pv3Volt',         'tensao_pv3',      'Tensão entrada PV3',  'V',  'tensao'),
  ('foxess', 1, 'pv3Current',      'corrente_pv3',    'Corrente entrada PV3','A',  'corrente'),
  ('foxess', 1, 'pv4Volt',         'tensao_pv4',      'Tensão entrada PV4',  'V',  'tensao'),
  ('foxess', 1, 'pv4Current',      'corrente_pv4',    'Corrente entrada PV4','A',  'corrente')
ON CONFLICT DO NOTHING;
