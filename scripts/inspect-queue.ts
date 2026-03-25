import { query, closeDb } from "../core/utils/db"

async function main() {
  const queue = await query(`
    SELECT
      id,
      lead_id,
      platform,
      action_type,
      status,
      attempt_count,
      left(coalesce(last_error, ''), 120) AS last_error,
      external_message_id,
      created_at
    FROM execution_queue
    ORDER BY created_at DESC
    LIMIT 50
  `)

  console.log("\n=== EXECUTION QUEUE ===")
  console.table(queue)

  const leads = await query(`
    SELECT
      id,
      source,
      status,
      left(coalesce(title, ''), 80) AS title,
      created_at
    FROM leads
    ORDER BY created_at DESC
    LIMIT 30
  `)

  console.log("\n=== LEADS ===")
  console.table(leads)

  await closeDb()
}

main().catch(async (err) => {
  console.error(err)
  await closeDb()
  process.exit(1)
})
