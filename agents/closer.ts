import { query } from "../core/utils/db"
import { insertInteraction } from "../core/repositories/interactions"
import { logTelemetryEvent } from "../core/repositories/telemetry"

const AGENT_NAME = "closer"

const DEMO_MESSAGE = "Send me 2 files. I'll run a comparison and show you mismatches. No upload needed."

type QualifiedLead = {
  id: string
  source: string
  url: string | null
}

export async function runCloser(limit = 10): Promise<void> {
  await logTelemetryEvent(AGENT_NAME, "run_started", { limit })

  const leads = await query<QualifiedLead>(
    `
    SELECT id, source, url
    FROM leads
    WHERE status = 'qualified'
    ORDER BY updated_at ASC
    LIMIT $1
    `,
    [limit]
  )

  let processed = 0
  let errors = 0

  for (const lead of leads) {
    try {
      await insertInteraction({
        lead_id: lead.id,
        channel: lead.source,
        direction: "outbound",
        message_text: DEMO_MESSAGE,
        outcome: "demo_requested",
        metadata: {
          type: "closer_message",
          strategy: "direct_demo_offer",
        },
      })

      await query(
        `
        UPDATE leads
        SET status = 'demo_requested',
            updated_at = NOW()
        WHERE id = $1
        `,
        [lead.id]
      )

      await logTelemetryEvent(
        AGENT_NAME,
        "demo_requested",
        {
          strategy: "direct_demo_offer",
        },
        lead.id
      )

      processed += 1
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"

      await logTelemetryEvent(
        AGENT_NAME,
        "closer_error",
        {
          error: errorMessage,
          lead_id: lead.id,
        },
        lead.id
      )

      errors += 1
    }
  }

  await logTelemetryEvent(AGENT_NAME, "run_completed", {
    limit,
    processed,
    errors,
  })
}
