-- supabase/migrations/049_empresa_config.sql
-- EcoSof Kit Clone: parametrização por empresa. A instância da EcoSunPower é o
-- "cliente nº 0" — o seed abaixo são os dados REAIS dela e o comportamento não
-- muda em nada. Num clone, a implantação edita esta linha (e os kits).
-- Inventário do que isso substitui: docs/ecosof/01-inventario-clone.md

CREATE TABLE IF NOT EXISTS empresa_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- identidade
  razao_social text NOT NULL,
  nome_fantasia text NOT NULL,
  cnpj text NOT NULL,
  endereco text NOT NULL,
  cidade text NOT NULL,
  uf text NOT NULL,
  cep text,
  email text NOT NULL,
  site_url text NOT NULL,
  atuacao_desde int NOT NULL DEFAULT 2019,
  -- Campos que entram em prompt da Eva — limite de tamanho evita injeção de
  -- texto gigante via SQL Editor degradando/poluindo o prompt.
  descricao_curta text NOT NULL CHECK (char_length(descricao_curta) <= 500),   -- "empresa de engenharia em energia..."
  regiao_atuacao text NOT NULL CHECK (char_length(regiao_atuacao) <= 500),     -- texto pro prompt ("Brasília e Entorno (DF) + GO até 100km...")
  -- atendente IA
  nome_atendente text NOT NULL DEFAULT 'Eva' CHECK (char_length(nome_atendente) <= 40),
  telefone_atendente text,                  -- chip do WhatsApp do negócio (wa.me)
  -- responsável técnico
  rt_nome text NOT NULL,
  rt_titulo text NOT NULL DEFAULT 'Responsável Técnico CREA/CFT' CHECK (char_length(rt_titulo) <= 80),
  rt_cpf text,
  rt_rg text,
  rt_registro text,
  -- comercial
  pix_chave text,
  criterio_lead_valor numeric(10,2) NOT NULL DEFAULT 700 CHECK (criterio_lead_valor >= 0),
  criterio_lead_kwh numeric(10,2) NOT NULL DEFAULT 700 CHECK (criterio_lead_kwh >= 0),
  marcas_permitidas text[] NOT NULL DEFAULT '{}',
  marcas_bloqueadas text[] NOT NULL DEFAULT '{}',
  garantia_instalacao_meses int NOT NULL DEFAULT 12,
  fator_perda_padrao numeric(4,2) NOT NULL DEFAULT 0.78 CHECK (fator_perda_padrao > 0 AND fator_perda_padrao <= 1),
  belenus_ativo boolean NOT NULL DEFAULT false,  -- tabela de cartão específica da EcoSun
  -- região técnica (fallback quando a UF do cliente NÃO está no solar-params)
  hsp_padrao numeric(4,2) CHECK (hsp_padrao > 0),                   -- ex.: 5.40; null = usa o resolver atual por UF
  tarifa_kwh_padrao numeric(6,3) CHECK (tarifa_kwh_padrao > 0),     -- ex.: 1.050; null = resolver atual
  concessionaria_padrao text,                                        -- ex.: 'CEMIG-MG'; null = resolver atual
  -- branding
  logo_storage_path text,                    -- bucket 'branding'; null = logo embutida (fallback)
  updated_at timestamptz NOT NULL DEFAULT now() -- sem trigger: editou via SQL Editor, atualize na mão (ou ignore o campo)
);

INSERT INTO empresa_config (
  id, razao_social, nome_fantasia, cnpj, endereco, cidade, uf, cep, email, site_url,
  atuacao_desde, descricao_curta, regiao_atuacao, nome_atendente, telefone_atendente,
  rt_nome, rt_titulo, rt_cpf, rt_rg, rt_registro, pix_chave,
  criterio_lead_valor, criterio_lead_kwh, marcas_permitidas, marcas_bloqueadas,
  garantia_instalacao_meses, fator_perda_padrao, belenus_ativo
) VALUES (
  1,
  'ECOSUNPOWER ENERGIA SOLAR LTDA',
  'EcoSunPower',
  '33.020.459/0001-06',
  'SHA Conjunto 01 Chácara 44C Lote 6, Arniqueira',
  'Brasília', 'DF', '71993-150',
  'junior@ecosunpower.eng.br',
  'https://ecosunpower.eng.br',
  2019,
  'empresa de engenharia em energia com atuação em Brasília-DF e Goiás desde 2019',
  'Brasília e Entorno (DF) e cidades de Goiás até ~100 km (Águas Lindas, Valparaíso, Luziânia, Anápolis, Goiânia)',
  'Eva',
  '5561996978781',
  'ANTONIO CANDIDO RODRIGUES JUNIOR',
  'Responsável Técnico CREA/CFT',
  '989.404.571-53', '2.202.520 SSP-DF', '98940457153',
  '33.020.459/0001-06',
  700, 700,
  ARRAY['Trina Solar','JA Solar','Risen','Jinko Solar','LONGi','Honor','SolarEdge','Deye','Sungrow','Huawei','Hoymiles','Enphase','FoxESS','NEP','Solis','SolaX'],
  ARRAY['Growatt'],
  12, 0.78, true
) ON CONFLICT (id) DO NOTHING;

-- Kits comerciais (preço é DO CLIENTE — hoje hardcoded em index.ts:2754)
CREATE TABLE IF NOT EXISTS empresa_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem int NOT NULL,
  kwp numeric(6,2) NOT NULL CHECK (kwp > 0),
  modulos int NOT NULL CHECK (modulos > 0),
  microinversores int,
  geracao_kwh_mes numeric(8,1) NOT NULL CHECK (geracao_kwh_mes > 0),
  preco_brl numeric(12,2) NOT NULL CHECK (preco_brl > 0),
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now() -- sem trigger: editou via SQL Editor, atualize na mão (ou ignore o campo)
);

-- Índice único parcial: dentro dos kits ativos, a ordem é única.
-- Kits inativos podem reusar números de ordem sem conflito.
CREATE UNIQUE INDEX IF NOT EXISTS idx_empresa_kits_ordem_ativo ON empresa_kits (ordem) WHERE ativo;

-- Seed = os 6 kits OnGrid (valores EXATOS de src/index.ts:2754-2760)
INSERT INTO empresa_kits (ordem, kwp, modulos, microinversores, geracao_kwh_mes, preco_brl)
SELECT * FROM (VALUES
  (1,  5.67::numeric,  9, 3, 700.0::numeric,  15800.61::numeric),
  (2,  7.56::numeric, 12, 3, 900.0::numeric,  18476.35::numeric),
  (3, 10.08::numeric, 16, 4, 1200.0::numeric, 22985.00::numeric),
  (4, 12.60::numeric, 20, 5, 1500.0::numeric, 28038.54::numeric),
  (5, 16.38::numeric, 26, 7, 2000.0::numeric, 33766.60::numeric),
  (6, 20.79::numeric, 33, 9, 2500.0::numeric, 42039.77::numeric)
) AS v(ordem, kwp, modulos, microinversores, geracao_kwh_mes, preco_brl)
WHERE NOT EXISTS (SELECT 1 FROM empresa_kits);
