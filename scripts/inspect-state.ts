import { query, closeDb } from "../core/utils/db"

async function main() {
  const leads = await query(`
    SELECT id, source, external_id, title, pain_score, urgency_score, fit_score, status, created_at
    FROM leads
    ORDER BY created_at DESC
    LIMIT 20
  `)

  const replies = await query(`
    SELECT lead_id, agent_name, variant_name, selected, left(reply_text, 160) AS preview, created_at
    FROM reply_variants
    ORDER BY created_at DESC
    LIMIT 20
  `)

  const telemetry = await query(`
    SELECT agent_name, event_type, lead_id, created_at
    FROM telemetry_events
    ORDER BY created_at DESC
    LIMIT 30
  `)

  console.log("\n=== LEADS ===")
  console.table(leads)

  console.log("\n=== REPLY VARIANTS ===")
  console.table(replies)

  console.log("\n=== TELEMETRY ===")
  console.table(telemetry)

  await closeDb()
}

main().catch(async (err) => {
  console.error(err)
  await closeDb()
  process.exit(1)
})
