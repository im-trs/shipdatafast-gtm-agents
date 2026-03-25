import { runCloser } from "../agents/closer"
import { closeDb } from "../core/utils/db"

async function main() {
  const limit = Number(process.argv[2] || "10")
  console.log(`Running closer with limit: ${limit}`)
  await runCloser(limit)
  console.log("Closer complete.")
  await closeDb()
}

main().catch(async (err) => {
  console.error(err)
  await closeDb()
  process.exit(1)
})
