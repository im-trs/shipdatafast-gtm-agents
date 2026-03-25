import { query, closeDb } from "../core/utils/db"

async function main() {
  const rows = await query(`
    SELECT
      source,
      source_type,
      external_id,
      left(title, 120) AS title,
      pain_score,
      urgency_score,
      fit_score,
      status,
      created_at
    FROM leads
    ORDER BY created_at DESC
    LIMIT 50
  `)

  console.table(rows)
  await closeDb()
}

main().catch(async (err) => {
  console.error(err)
  await closeDb()
  process.exit(1)
})
