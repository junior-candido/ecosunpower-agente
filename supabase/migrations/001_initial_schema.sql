-- Ecosunpower Agent - Initial Schema
-- Run this in Supabase SQL Editor

-- Enum types
CREATE TYPE lead_profile AS ENUM ('residencial', 'comercial', 'agronegocio', 'indefinido');
CREATE TYPE lead_status AS ENUM ('novo', 'qualificando', 'qualificado', 'agendado', 'transferido', 'inativo');
CREATE TYPE session_status AS ENUM ('active', 'paused', 'completed', 'expired');
CREATE TYPE dossier_status AS ENUM ('draft', 'sent', 'read', 'actioned');
CREATE TYPE log_level AS ENUM ('info', 'warn', 'error', 'debug');

-- Leads
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  name text,
  city text,
  neighborhood text,
  profile lead_profile DEFAULT 'indefinido',
  origin text,
  status lead_status DEFAULT 'novo',
  energy_data jsonb DEFAULT '{}',
  opportunities jsonb DEFAULT '{}',
  future_demand text,
  consent_given boolean DEFAULT false,
  consent_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  anonymized_at timestamptz
);

-- Conversations
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  session_status session_status DEFAULT 'active',
  qualification_step text DEFAULT 'inicio',
  messages jsonb[] DEFAULT '{}',
  summary text,
  message_count integer DEFAULT 0,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '2 hours')
);

-- Dossiers
CREATE TABLE dossiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  content jsonb DEFAULT '{}',
  formatted_text text,
  status dossier_status DEFAULT 'draft',
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Engineers
CREATE TABLE engineers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  region text[] DEFAULT '{}',
  calendar_id text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Logs
CREATE TABLE logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level log_level DEFAULT 'info',
  module text,
  message text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_leads_phone ON leads(phone);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX idx_conversations_status ON conversations(session_status);
CREATE INDEX idx_dossiers_lead_id ON dossiers(lead_id);
CREATE INDEX idx_dossiers_status ON dossiers(status);
CREATE INDEX idx_logs_level ON logs(level);
CREATE INDEX idx_logs_created_at ON logs(created_at);

-- RLS (Row Level Security)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineers ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

-- Service role policies (server uses service key, full access)
CREATE POLICY "Service role full access" ON leads FOR ALL USING (true);
CREATE POLICY "Service role full access" ON conversations FOR ALL USING (true);
CREATE POLICY "Service role full access" ON dossiers FOR ALL USING (true);
CREATE POLICY "Service role full access" ON engineers FOR ALL USING (true);
CREATE POLICY "Service role full access" ON logs FOR ALL USING (true);
