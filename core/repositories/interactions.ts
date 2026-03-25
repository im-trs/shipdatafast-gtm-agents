import { query } from "../utils/db"

export type InteractionInput = {
  lead_id: string
  channel: string
  direction: string
  message_text: string
  message_version?: string | null
  outcome?: string | null
  metadata?: Record<string, unknown>
}

export async function insertInteraction(input: InteractionInput): Promise<void> {
  await query(
    `
    INSERT INTO interactions (
      lead_id,
      channel,
      direction,
      message_text,
      message_version,
      outcome,
      metadata
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
    `,
    [
      input.lead_id,
      input.channel,
      input.direction,
      input.message_text,
      input.message_version ?? null,
      input.outcome ?? null,
      JSON.stringify(input.metadata ?? {}),
    ]
  )
}
