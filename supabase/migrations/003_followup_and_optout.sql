-- Follow-up tracking and opt-out support

-- Add opt_out and contact_type to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS opt_out boolean DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_type text DEFAULT 'cliente';
-- contact_type: 'cliente', 'parceiro', 'amigo', 'vendedor', 'dono'

-- Add 'perdido' to lead status if not exists (client bought from competitor)
-- Note: enum already has the values we need, 'perdido' will be stored as text in status

-- Follow-ups tracking table
CREATE TABLE IF NOT EXISTS followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  step integer NOT NULL,
  message_sent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followups_lead_id ON followups(lead_id);
CREATE INDEX IF NOT EXISTS idx_followups_created_at ON followups(created_at);

ALTER TABLE followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON followups FOR ALL USING (true);
