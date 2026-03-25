import { insertLead, findLeadBySourceExternalId } from "../core/repositories/leads"
import { logTelemetryEvent } from "../core/repositories/telemetry"
import { scoreLead } from "../core/scoring/lead-score"
import type { RawLead } from "./hunter-types"

const AGENT_NAME = "hunter"

export async function ingestRawLeads(rawLeads: RawLead[]): Promise<void> {
  await logTelemetryEvent(AGENT_NAME, "run_started", {
    rawLeadCount: rawLeads.length,
  })

  let inserted = 0
  let skipped = 0

  for (const raw of rawLeads) {
    const existing = await findLeadBySourceExternalId(raw.source, raw.external_id)

    if (existing) {
      skipped += 1

      await logTelemetryEvent(
        AGENT_NAME,
        "lead_skipped_duplicate",
        {
          source: raw.source,
          external_id: raw.external_id,
        },
        existing.id
      )

      continue
    }

    const fullText = [raw.title ?? "", raw.body ?? ""].join("\n").trim()
    const scores = scoreLead(fullText)

    const lead = await insertLead({
      source: raw.source,
      source_type: raw.source_type,
      external_id: raw.external_id,
      author_handle: raw.author_handle ?? null,
      url: raw.url ?? null,
      title: raw.title ?? null,
      body: raw.body ?? null,
      pain_score: scores.painScore,
      urgency_score: scores.urgencyScore,
      fit_score: scores.fitScore,
      status: "found",
    })

    inserted += 1

    await logTelemetryEvent(
      AGENT_NAME,
      "lead_inserted",
      {
        source: raw.source,
        external_id: raw.external_id,
        scores,
      },
      lead.id
    )
  }

  await logTelemetryEvent(AGENT_NAME, "run_completed", {
    rawLeadCount: rawLeads.length,
    inserted,
    skipped,
  })
}
