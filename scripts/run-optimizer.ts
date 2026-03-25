import { runOptimizer } from "../agents/optimizer"
import { closeDb } from "../core/utils/db"

async function main() {
  console.log("Running optimizer (autoresearch loop)...")
  await runOptimizer()
  console.log("Optimizer complete.")
  await closeDb()
}

main().catch(async (err) => {
  console.error(err)
  await closeDb()
  process.exit(1)
})
