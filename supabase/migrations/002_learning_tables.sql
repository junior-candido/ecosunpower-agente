-- Learning tables for continuous improvement

CREATE TABLE IF NOT EXISTS learning_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  topic text NOT NULL,
  detail text,
  frequency integer DEFAULT 1,
  resolved boolean DEFAULT false,
  resolved_action text,
  source_lead_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type text NOT NULL,
  question text NOT NULL,
  successful_response text,
  times_used integer DEFAULT 1,
  effectiveness text DEFAULT 'unknown',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_type ON learning_insights(type);
CREATE INDEX IF NOT EXISTS idx_learning_frequency ON learning_insights(frequency);
CREATE INDEX IF NOT EXISTS idx_patterns_used ON conversation_patterns(times_used);

ALTER TABLE learning_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON learning_insights FOR ALL USING (true);
CREATE POLICY "Service role full access" ON conversation_patterns FOR ALL USING (true);
