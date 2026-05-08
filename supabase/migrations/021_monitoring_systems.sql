-- Migration 021: Modulo 5 — Sistemas monitorados + geracao diaria
--
-- Schema unificado pra suportar varias marcas de inversor (SolarEdge, Sungrow,
-- Deye, Hoymiles, etc) sem refactor. Adapter por marca le credenciais do JSONB
-- api_credentials e popula geracao_diaria.
--
-- Cron diario (madrugada) puxa dados de todos os sistemas ativos.
-- Dashboard le da geracao_diaria pra mostrar estatisticas + alertas.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================================
-- 1. sistemas_clientes — 1 linha por sistema FV instalado
-- =========================================================================
CREATE TABLE IF NOT EXISTS sistemas_clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vinculo com lead/cliente. NULL = sistema sem cliente associado (raro)
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  -- Identificacao humana ("Casa Antonio Carlos · Brasilia")
  apelido TEXT NOT NULL,

  -- Marca do inversor — define qual adapter usar
  marca_inversor TEXT NOT NULL CHECK (marca_inversor IN (
    'solaredge', 'sungrow', 'deye', 'hoymiles', 'goodwe', 'huawei', 'foxess', 'nep'
  )),

  -- Credenciais especificas por marca. Ex SolarEdge: {"site_id": "1234567", "api_key": "ABC..."}
  -- Ex Sungrow: {"appkey": "...", "secret_key": "...", "ps_id": "..."}
  -- Sempre validar/sanitizar no adapter, nao no DB.
  api_credentials JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Specs do sistema (opcional, mas util pra calcular performance ratio)
  potencia_kwp NUMERIC,
  data_instalacao DATE,

  -- Localizacao (opcional, util pra dashboard agrupar por regiao)
  cidade TEXT,
  uf TEXT CHECK (uf IS NULL OR length(uf) = 2),

  -- Estado do monitoramento
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ultima_sincronizacao TIMESTAMPTZ,
  ultimo_erro TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sistemas_clientes_lead
  ON sistemas_clientes(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sistemas_clientes_ativos_marca
  ON sistemas_clientes(marca_inversor) WHERE ativo;

COMMENT ON TABLE sistemas_clientes IS
  'Sistemas FV de clientes monitorados via API. 1 linha = 1 sistema instalado. Chave de busca pelo cron diario.';
COMMENT ON COLUMN sistemas_clientes.api_credentials IS
  'JSONB com credenciais especificas por marca. NUNCA logar essa coluna em texto.';

-- =========================================================================
-- 2. geracao_diaria — bucket diario de kWh por sistema
-- =========================================================================
CREATE TABLE IF NOT EXISTS geracao_diaria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema_id UUID NOT NULL REFERENCES sistemas_clientes(id) ON DELETE CASCADE,

  data DATE NOT NULL,
  geracao_kwh NUMERIC NOT NULL CHECK (geracao_kwh >= 0),

  -- Auditoria: quando foi puxada essa info, e da onde
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fetched_source TEXT NOT NULL DEFAULT 'cron',  -- 'cron' | 'manual_refresh'

  UNIQUE (sistema_id, data)
);

CREATE INDEX IF NOT EXISTS idx_geracao_diaria_sistema_data
  ON geracao_diaria(sistema_id, data DESC);

COMMENT ON TABLE geracao_diaria IS
  'Geracao FV em kWh por sistema por dia. Puxado pelo cron de monitoramento. UPSERT por (sistema_id, data).';

-- =========================================================================
-- 3. alertas_sistema — alertas detectados pelo agente IA proativo (Modulo 6)
-- =========================================================================
CREATE TABLE IF NOT EXISTS alertas_sistema (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema_id UUID NOT NULL REFERENCES sistemas_clientes(id) ON DELETE CASCADE,

  tipo TEXT NOT NULL CHECK (tipo IN (
    'queda_geracao', 'sistema_offline', 'manutencao_devida',
    'milestone_economia', 'oportunidade_upsell', 'falha_inversor'
  )),
  severidade TEXT NOT NULL DEFAULT 'info' CHECK (severidade IN ('info', 'aviso', 'urgente')),
  descricao TEXT NOT NULL,
  payload JSONB,                        -- contexto: queda %, dias offline, etc

  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_to_junior_at TIMESTAMPTZ,
  notified_to_cliente_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alertas_pendentes
  ON alertas_sistema(detected_at DESC)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE alertas_sistema IS
  'Alertas detectados sobre sistemas monitorados. Agente IA proativo (Modulo 6) processa e notifica Junior/cliente.';
