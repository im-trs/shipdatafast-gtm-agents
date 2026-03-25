import { query } from "../core/utils/db"
import { logTelemetryEvent } from "../core/repositories/telemetry"

const AGENT_NAME = "qualifier"

type InboundInteraction = {
  id: string
  lead_id: string
  message_text: string
  status: string
}

const QUALIFIED_KEYWORDS = [
  "work",
  "client",
  "company",
  "project",
  "data",
  "files",
  "how",
  "can you",
  "what",
  "details",
  "send",
  "interested",
  "yes",
]

const IGNORED_KEYWORDS = [
  "thanks",
  "ok",
  "cool",
  "nice",
  "lol",
  "haha",
]

function classifyMessage(text: string): "qualified" | "ignored" {
  const lower = text.toLowerCase()

  for (const keyword of QUALIFIED_KEYWORDS) {
    if (lower.includes(keyword)) return "qualified"
  }

  for (const keyword of IGNORED_KEYWORDS) {
    if (lower.includes(keyword)) return "ignored"
  }

  return "ignored"
}

export async function runQualifier(limit = 20): Promise<void> {
  await logTelemetryEvent(AGENT_NAME, "run_started", { limit })

  const interactions = await query<InboundInteraction>(
    `
    SELECT
      i.id,
      i.lead_id,
      i.message_text,
      l.status
    FROM interactions i
    JOIN leads l ON l.id = i.lead_id
    WHERE i.direction = 'inbound'
      AND l.status IN ('engaged', 'ignored')
    ORDER BY i.created_at ASC
    LIMIT $1
    `,
    [limit]
  )

  let processed = 0
  let qualified = 0
  let ignored = 0
  let errors = 0

  for (const interaction of interactions) {
    try {
      const classification = classifyMessage(interaction.message_text)

      if (classification === "qualified") {
        await query(
          `
          UPDATE interactions
          SET outcome = 'qualified',
              metadata = metadata || jsonb_build_object('qualification', 'qualified')
          WHERE id = $1
          `,
          [interaction.id]
        )

        await query(
          `
          UPDATE leads
          SET status = 'qualified',
              updated_at = NOW()
          WHERE id = $1
          `,
          [interaction.lead_id]
        )

        await logTelemetryEvent(
          AGENT_NAME,
          "classified",
          { classification: "qualified" },
          interaction.lead_id
        )

        qualified += 1
      } else {
        await query(
          `
          UPDATE interactions
          SET outcome = 'ignored',
              metadata = metadata || jsonb_build_object('qualification', 'ignored')
          WHERE id = $1
          `,
          [interaction.id]
        )

        await query(
          `
          UPDATE leads
          SET status = 'dead',
              updated_at = NOW()
          WHERE id = $1
          `,
          [interaction.lead_id]
        )

        await logTelemetryEvent(
          AGENT_NAME,
          "classified",
          { classification: "ignored" },
          interaction.lead_id
        )

        ignored += 1
      }

      processed += 1
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"

      await logTelemetryEvent(
        AGENT_NAME,
        "qualification_error",
        {
          error: errorMessage,
          interaction_id: interaction.id,
        },
        interaction.lead_id
      )

      errors += 1
    }
  }

  await logTelemetryEvent(AGENT_NAME, "run_completed", {
    limit,
    processed,
    qualified,
    ignored,
    errors,
  })
}
