import { runDryExecutor } from "../agents/executor-dryrun"
import { closeDb } from "../core/utils/db"

async function main() {
  const limit = Number(process.argv[2] || "10")
  await runDryExecutor(limit)
  console.log("Dry executor complete.")
  await closeDb()
}

main().catch(async (err) => {
  console.error(err)
  await closeDb()
  process.exit(1)
})
