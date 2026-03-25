import { runAutoresearch } from "../autoresearch/loop"
import { logTelemetryEvent } from "../core/repositories/telemetry"
import { closeDb } from "../core/utils/db"

const AGENT_NAME = "optimizer"

export async function runOptimizer(): Promise<void> {
  try {
    await runAutoresearch()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    
    await logTelemetryEvent(
      AGENT_NAME,
      "optimizer_error",
      { error: errorMessage }
    )
  }
}
