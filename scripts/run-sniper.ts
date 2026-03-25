import { runSniper } from "../agents/sniper"
import { closeDb } from "../core/utils/db"

async function main() {
  await runSniper(10)
  console.log("Sniper run complete.")
  await closeDb()
}

main().catch(async (err) => {
  console.error(err)
  await closeDb()
  process.exit(1)
})
