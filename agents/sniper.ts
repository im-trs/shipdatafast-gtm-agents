import { chat } from "../core/utils/openrouter"
import { getLeadsNeedingReplies, updateLeadStatus, type LeadRecord } from "../core/repositories/leads"
import { insertReplyVariant } from "../core/repositories/replies"
import { insertInteraction } from "../core/repositories/interactions"
import { logTelemetryEvent } from "../core/repositories/telemetry"

const AGENT_NAME = "sniper"
const PROMPT_VERSION = "sniper_v1"

function buildPrompt(lead: LeadRecord): string {
  return `
You are a guerrilla B2B outreach assistant for ShipDataFast.

Goal:
Write 3 short human replies to the lead below.

Rules:
- sound human, not corporate
- do not hard pitch
- acknowledge the pain
- ask a smart follow-up question
- mention that the process can be done locally without uploading sensitive data
- do not use emojis
- do not use markdown bullets
- each variant must be under 300 characters
- output ONLY valid JSON in this exact format:
{"variants":["...","...","..."]}

Lead title:
${lead.title ?? ""}

Lead body:
${lead.body ?? ""}
`.trim()
}

function safeParseVariants(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as { variants?: string[] }

    if (!parsed.variants || !Array.isArray(parsed.variants)) return []

    return parsed.variants
      .map(v => String(v).trim())
      .filter(Boolean)
      .slice(0, 3)
  } catch {
    return []
  }
}

async function generateVariantsForLead(lead: LeadRecord): Promise<string[]> {
  const prompt = buildPrompt(lead)

  const raw = await chat([
    { role: "system", content: "You generate concise B2B outreach replies." },
    { role: "user", content: prompt },
  ])

  const variants = safeParseVariants(raw)

  if (variants.length > 0) return variants

  return [
    "This sounds painfully manual. Are the biggest issues duplicate rows, mismatched keys, or schema drift? I built a local-first way to compare files without uploading sensitive data.",
    "That kind of reconciliation work usually burns hours fast. Is the real pain in month-end reporting, audit checks, or file matching? This can be handled locally without sending data anywhere.",
    "This looks like a file comparison problem disguised as ops pain. Are you comparing exports with stable keys or messy datasets? I've built a local approach for this kind of work.",
  ]
}

export async function runSniper(limit = 10): Promise<void> {
  await logTelemetryEvent(AGENT_NAME, "run_started", { limit })

  const leads = await getLeadsNeedingReplies(limit)

  let processed = 0

  for (const lead of leads) {
    const variants = await generateVariantsForLead(lead)

    for (let i = 0; i < variants.length; i += 1) {
      const variantName = `variant_${i + 1}`
      const replyText = variants[i]

      await insertReplyVariant({
        lead_id: lead.id,
        agent_name: AGENT_NAME,
        variant_name: variantName,
        prompt_version: PROMPT_VERSION,
        reply_text: replyText,
        selected: i === 0,
      })

      await insertInteraction({
        lead_id: lead.id,
        channel: lead.source,
        direction: "outbound_draft",
        message_text: replyText,
        message_version: `${PROMPT_VERSION}:${variantName}`,
        outcome: "generated",
        metadata: {
          selected: i === 0,
        },
      })
    }

    await updateLeadStatus(lead.id, "replied")

    await logTelemetryEvent(
      AGENT_NAME,
      "reply_variants_generated",
      {
        variantCount: variants.length,
        source: lead.source,
      },
      lead.id
    )

    processed += 1
  }

  await logTelemetryEvent(AGENT_NAME, "run_completed", {
    limit,
    processed,
  })
}
