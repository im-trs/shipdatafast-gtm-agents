import { pool } from "../core/utils/db"

async function main() {
  await pool.query(`
    ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS selected_reply_variant_id UUID NULL;
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS execution_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      reply_variant_id UUID NOT NULL REFERENCES reply_variants(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      action_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      execute_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      attempt_count INT NOT NULL DEFAULT 0,
      last_error TEXT,
      external_message_id TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_execution_queue_status
    ON execution_queue(status, execute_after);
  `)

  console.log("Execution layer migration complete.")
  await pool.end()
}

main().catch(async (err) => {
  console.error(err)
  await pool.end()
  process.exit(1)
})
