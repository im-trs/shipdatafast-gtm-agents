import { chat } from "../core/utils/openrouter"
import { getLeadsNeedingReplies, updateLeadStatus, type LeadRecord } from "../core/repositories/leads"
import { insertReplyVariant } from "../core/repositories/replies"
import { insertInteraction } from "../core/repositories/interactions"
import { logTelemetryEvent } from "../core/repositories/telemetry"
import * as fs from "fs"
import * as path from "path"

const AGENT_NAME = "sniper"
const DEFAULT_PROMPT_VERSION = "sniper_v1"

type PromptVersion = "sniper_v1" | "sniper_v2"

let promptV1: string | null = null
let promptV2: string | null = null

function loadPrompts(): void {
  const promptsDir = path.join(process.cwd(), "prompts")
  
  // Load v1 (required)
  const v1Path = path.join(promptsDir, "sniper_v1.md")
  try {
    promptV1 = fs.readFileSync(v1Path, "utf-8").trim()
  } catch {
    promptV1 = null
  }

  // Load v2 (optional)
  const v2Path = path.join(promptsDir, "sniper_v2.md")
  try {
    if (fs.existsSync(v2Path)) {
      promptV2 = fs.readFileSync(v2Path, "utf-8").trim()
    }
  } catch {
    promptV2 = null
  }
}

function selectPromptVersion(): PromptVersion {
  // If v2 exists, use 50/50 split
  if (promptV2 !== null && Math.random() < 0.5) {
    return "sniper_v2"
  }
  return "sniper_v1"
}

function getPromptContent(version: PromptVersion): string | null {
  if (version === "sniper_v1") {
    return promptV1
  }
  return promptV2
}

function buildPrompt(lead: LeadRecord, version: PromptVersion): string {
  const promptContent = getPromptContent(version)
  
  // If prompt file is empty or null, use default inline prompt
  if (!promptContent) {
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

  // Replace placeholders in prompt template
  return promptContent
    .replace(/\{\{title\}\}/g, lead.title ?? "")
    .replace(/\{\{body\}\}/g, lead.body ?? "")
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

async function generateVariantsForLead(lead: LeadRecord, version: PromptVersion): Promise<string[]> {
  const prompt = buildPrompt(lead, version)

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
  // Load prompts at startup
  loadPrompts()

  await logTelemetryEvent(AGENT_NAME, "run_started", { 
    limit,
    v1_loaded: promptV1 !== null,
    v2_loaded: promptV2 !== null,
  })

  const leads = await getLeadsNeedingReplies(limit)

  let processed = 0

  for (const lead of leads) {
    // Select prompt version for this lead (50/50 split if v2 exists)
    const version = selectPromptVersion()

    await logTelemetryEvent(
      AGENT_NAME,
      "prompt_selected",
      { version },
      lead.id
    )

    const variants = await generateVariantsForLead(lead, version)

    for (let i = 0; i < variants.length; i += 1) {
      const variantName = `variant_${i + 1}`
      const replyText = variants[i]

      await insertReplyVariant({
        lead_id: lead.id,
        agent_name: AGENT_NAME,
        variant_name: variantName,
        prompt_version: version,
        reply_text: replyText,
        selected: i === 0,
      })

      await insertInteraction({
        lead_id: lead.id,
        channel: lead.source,
        direction: "outbound_draft",
        message_text: replyText,
        message_version: `${version}:${variantName}`,
        outcome: "generated",
        metadata: {
          selected: i === 0,
          prompt_version: version,
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
        prompt_version: version,
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
