import { query, closeDb } from "../core/utils/db"

async function testDB() {
  try {
    console.log("🔌 Connecting to PostgreSQL...")
    const res = await query<{ now: string; version: string }>("SELECT NOW() as now, version() as version")
    console.log("✅ Connected successfully!")
    console.log("📊 Query result:", res[0])
    await closeDb()
    console.log("👋 Connection closed.")
  } catch (err) {
    console.error("❌ Connection failed:", err)
    process.exit(1)
  }
}

testDB()
