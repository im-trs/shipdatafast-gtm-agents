import { runRedditIngestor } from "../agents/ingestor-reddit-responses"
import { closeDb } from "../core/utils/db"

async function main() {
  const limit = Number(process.argv[2] || "10")
  console.log(`Running Reddit response ingestor with limit: ${limit}`)
  await runRedditIngestor(limit)
  console.log("Reddit response ingestor complete.")
  await closeDb()
}

main().catch(async (err) => {
  console.error(err)
  await closeDb()
  process.exit(1)
})
