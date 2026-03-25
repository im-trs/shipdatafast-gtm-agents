import { query } from "../utils/db"

export async function logTelemetryEvent(
  agentName: string,
  eventType: string,
  payload: Record<string, unknown> = {},
  leadId?: string
): Promise<void> {
  await query(
    `
    INSERT INTO telemetry_events (
      agent_name,
      event_type,
      lead_id,
      payload
    )
    VALUES ($1,$2,$3,$4::jsonb)
    `,
    [agentName, eventType, leadId ?? null, JSON.stringify(payload)]
  )
}
