import dotenv from "dotenv"

dotenv.config()

export const ENV = {
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || "openrouter/auto",
  OPENROUTER_FALLBACK_MODEL: process.env.OPENROUTER_FALLBACK_MODEL || "anthropic/claude-3-haiku",
}
