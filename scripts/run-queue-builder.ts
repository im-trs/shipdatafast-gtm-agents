import { runQueueBuilder } from "../agents/executor-queue-builder"
import { closeDb } from "../core/utils/db"

async function main() {
  const limit = Number(process.argv[2] || "10")
  await runQueueBuilder(limit)
  console.log("Queue builder complete.")
  await closeDb()
}

main().catch(async (err) => {
  console.error(err)
  await closeDb()
  process.exit(1)
})
