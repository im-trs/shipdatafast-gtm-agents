import { pool } from "../core/utils/db"

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source TEXT NOT NULL,
      source_type TEXT NOT NULL,
      external_id TEXT,
      author_handle TEXT,
      url TEXT,
      title TEXT,
      body TEXT,
      pain_score NUMERIC(5,4) DEFAULT 0,
      urgency_score NUMERIC(5,4) DEFAULT 0,
      fit_score NUMERIC(5,4) DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'found',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS interactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      direction TEXT NOT NULL,
      message_text TEXT NOT NULL,
      message_version TEXT,
      outcome TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reply_variants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
      agent_name TEXT NOT NULL,
      variant_name TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      reply_text TEXT NOT NULL,
      selected BOOLEAN NOT NULL DEFAULT false,
      performance_label TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      conversion_type TEXT NOT NULL,
      value_gbp NUMERIC(12,2) DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'GBP',
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS telemetry_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      lead_id UUID,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_source_type ON leads(source_type);
    CREATE INDEX IF NOT EXISTS idx_interactions_lead_id ON interactions(lead_id);
    CREATE INDEX IF NOT EXISTS idx_reply_variants_lead_id ON reply_variants(lead_id);
    CREATE INDEX IF NOT EXISTS idx_conversions_lead_id ON conversions(lead_id);
    CREATE INDEX IF NOT EXISTS idx_telemetry_agent_name ON telemetry_events(agent_name);
    CREATE INDEX IF NOT EXISTS idx_telemetry_event_type ON telemetry_events(event_type);
  `)

  console.log("Postgres schema initialized.")
  await pool.end()
}

main().catch(async (err) => {
  console.error("Failed to initialize DB:", err)
  await pool.end()
  process.exit(1)
})
