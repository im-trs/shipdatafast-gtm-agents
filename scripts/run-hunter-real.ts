import dotenv from "dotenv"
import { ingestRawLeads } from "../agents/hunter"
import { discoverRedditLeads } from "../agents/hunter-reddit"
import { discoverJobBoardLeads } from "../agents/hunter-jobboards"
import { closeDb } from "../core/utils/db"

dotenv.config()

async function main() {
  console.log("Running real hunter...")

  const [redditLeads, jobBoardLeads] = await Promise.all([
    discoverRedditLeads(),
    discoverJobBoardLeads(),
  ])

  const allLeads = [...redditLeads, ...jobBoardLeads]

  console.log(`Discovered ${redditLeads.length} Reddit leads`)
  console.log(`Discovered ${jobBoardLeads.length} job board leads`)
  console.log(`Total discovered: ${allLeads.length}`)

  await ingestRawLeads(allLeads)

  console.log("Real hunter ingestion complete.")
  await closeDb()
}

main().catch(async (err) => {
  console.error("run-hunter-real failed:", err)
  await closeDb()
  process.exit(1)
})
