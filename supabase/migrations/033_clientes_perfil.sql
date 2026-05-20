-- supabase/migrations/033_clientes_perfil.sql
-- Perfil do Cliente Fatia A1
-- Spec: docs/superpowers/specs/2026-05-20-perfil-cliente-a1-design.md

-- 1. Campos novos em leads (cadastro completo + rateio MMGD)
alter table leads add column if not exists cpf_cnpj text;
alter table leads add column if not exists data_nascimento date;
alter table leads add column if not exists estado_civil text;
-- adiciona 'rural' ao enum lead_profile antes do UPDATE
alter type lead_profile add value if not exists 'rural';
update leads set profile = 'rural'::lead_profile where profile = 'agronegocio'::lead_profile;
alter table leads add column if not exists cep text;
alter table leads add column if not exists endereco_rua text;
alter table leads add column if not exists endereco_numero text;
alter table leads add column if not exists endereco_complemento text;
alter table leads add column if not exists uf text;
alter table leads add column if not exists concessionaria text;
alter table leads add column if not exists uc_numero text;
alter table leads add column if not exists tarifa_classe text;
alter table leads add column if not exists tarifa_modalidade text;
alter table leads add column if not exists consumo_medio_kwh integer;
alter table leads add column if not exists conta_media_brl numeric(10,2);
alter table leads add column if not exists consumo_mensal_json jsonb;
alter table leads add column if not exists forma_pagamento text;
alter table leads add column if not exists banco_financiamento text;
alter table leads add column if not exists eh_consumidor_rateio boolean not null default false;
alter table leads add column if not exists uc_geradora_lead_id uuid references leads(id) on delete set null;
alter table leads add column if not exists percentual_rateio numeric(5,2);
alter table leads add column if not exists credito_esperado_kwh integer;
alter table leads add column if not exists vendedor_responsavel text;
alter table leads add column if not exists observacoes_perfil text;

-- 2. Tabela lead_anexos (Supabase Storage)
create table lead_anexos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  tipo text not null,
  descricao text,
  storage_path text not null,
  mime_type text,
  size_bytes integer,
  created_at timestamptz not null default now(),
  created_by text
);
create index lead_anexos_by_lead on lead_anexos (lead_id, created_at desc);
create index lead_anexos_by_tipo on lead_anexos (lead_id, tipo);
