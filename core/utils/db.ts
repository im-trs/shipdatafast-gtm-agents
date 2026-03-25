import { Pool } from "pg"
import dotenv from "dotenv"

dotenv.config()

const sslEnabled = String(process.env.POSTGRES_SSL || "false").toLowerCase() === "true"

export const pool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB || "shipdatafast_gtm",
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "postgres",
  ssl: sslEnabled ? { rejectUnauthorized: false } : false,
})

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const result = await pool.query(text, params)
  return result.rows as T[]
}

export async function closeDb(): Promise<void> {
  await pool.end()
}
