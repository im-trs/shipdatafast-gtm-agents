import { runSniper } from "../agents/sniper"
import { closeDb } from "../core/utils/db"

async function main() {
  const limit = Number(process.argv[2]) || 5
  console.log(`Running sniper with limit: ${limit}`)
  await runSniper(limit)
  console.log("Sniper run complete.")
  await closeDb()
}

main().catch(async (err) => {
  console.error(err)
  await closeDb()
  process.exit(1)
})
