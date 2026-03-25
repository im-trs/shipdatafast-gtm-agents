import { runRedditExecutor } from "../agents/executor-reddit"
import { closeDb } from "../core/utils/db"

async function main() {
  const limit = Number(process.argv[2] || "5")
  const mode = process.env.REDDIT_EXECUTION_MODE || "safe"
  
  console.log(`Running Reddit executor with limit: ${limit}`)
  console.log(`Execution mode: ${mode.toUpperCase()}`)
  
  if (mode === "safe") {
    console.log("⚠️  SAFE MODE: No real posts will be made")
  } else {
    console.log("⚠️  LIVE MODE: Real Reddit posts will be made")
  }
  
  await runRedditExecutor(limit)
  console.log("Reddit executor complete.")
  await closeDb()
}

main().catch(async (err) => {
  console.error(err)
  await closeDb()
  process.exit(1)
})
