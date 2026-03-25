import { runQualifier } from "../agents/qualifier"
import { closeDb } from "../core/utils/db"

async function main() {
  const limit = Number(process.argv[2] || "20")
  console.log(`Running qualifier with limit: ${limit}`)
  await runQualifier(limit)
  console.log("Qualifier complete.")
  await closeDb()
}

main().catch(async (err) => {
  console.error(err)
  await closeDb()
  process.exit(1)
})
