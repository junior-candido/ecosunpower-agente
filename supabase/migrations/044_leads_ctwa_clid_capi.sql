-- Migration 044: guarda o click id CTWA + estagios ja reportados pra Meta CAPI
--
-- ctwa_clid: click id do anuncio Click-to-WhatsApp, vem no referral da 1a
--   mensagem do lead (parseado em meta-whatsapp.ts). E a chave que a Meta usa
--   pra casar o evento de conversao de volta com o clique no anuncio.
--   Leads antigos / organicos ficam NULL (sem clique pra casar) — esperado.
alter table leads add column if not exists ctwa_clid text;

-- capi_stages_sent: estagios de funil ja devolvidos pra Meta (idempotencia).
--   Ex: {'Lead','lead_qualificado'}. Evita mandar o mesmo carimbo 2x.
alter table leads add column if not exists capi_stages_sent text[] not null default '{}';

-- Index pra achar rapido leads com clique (os que rendem evento CAPI).
create index if not exists idx_leads_ctwa_clid on leads(ctwa_clid) where ctwa_clid is not null;
