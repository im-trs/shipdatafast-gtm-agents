import { query } from "../core/utils/db"
import { logTelemetryEvent } from "../core/repositories/telemetry"
import { computeSurvivalMetrics } from "../core/metrics/survival"
import { generateCandidatePrompt } from "./mutator"
import { evaluateCandidate } from "./evaluator"
import type { ReplyExample } from "./types"

const AGENT_NAME = "optimizer"

export async function runAutoresearch(): Promise<void> {
  await logTelemetryEvent(AGENT_NAME, "run_started", {})

  // Fetch successes: replies with inbound responses
  const successes = await query<ReplyExample>(`
    SELECT DISTINCT ON (rv.id)
      rv.reply_text,
      i.outcome
    FROM reply_variants rv
    INNER JOIN interactions i ON i.lead_id = rv.lead_id
    WHERE i.direction = 'inbound'
      AND rv.selected = true
    ORDER BY rv.id, i.created_at DESC
    LIMIT 50
  `)

  // Fetch failures: replies with NO inbound response
  const failures = await query<ReplyExample>(`
    SELECT DISTINCT ON (rv.id)
      rv.reply_text,
      'no_response' AS outcome
    FROM reply_variants rv
    LEFT JOIN interactions i ON i.lead_id = rv.lead_id AND i.direction = 'inbound'
    WHERE rv.selected = true
      AND i.id IS NULL
    ORDER BY rv.id
    LIMIT 50
  `)

  // Check if we have enough data
  if (successes.length < 5 || failures.length < 5) {
    await logTelemetryEvent(AGENT_NAME, "insufficient_data", {
      successes_count: successes.length,
      failures_count: failures.length,
    })
    return
  }

  await logTelemetryEvent(AGENT_NAME, "data_collected", {
    successes_count: successes.length,
    failures_count: failures.length,
  })

  // Generate candidate prompt
  const candidate = await generateCandidatePrompt({
    successes: successes.map(s => ({ reply_text: s.reply_text, outcome: s.outcome })),
    failures: failures.map(f => ({ reply_text: f.reply_text, outcome: f.outcome })),
  })

  await logTelemetryEvent(AGENT_NAME, "candidate_generated", {
    reasoning: candidate.reasoning,
    has_new_prompt: candidate.new_prompt.length > 0,
  })

  // Compute current metrics
  const metrics = await computeSurvivalMetrics()

  // Evaluate candidate
  const accepted = await evaluateCandidate(metrics.survival_score, candidate.new_prompt)

  if (accepted && candidate.new_prompt.length > 0) {
    // Write new prompt file
    const fs = await import("fs")
    const path = await import("path")
    
    const promptsDir = path.join(process.cwd(), "prompts")
    const newPromptPath = path.join(promptsDir, "sniper_v2.md")

    const promptContent = `# Sniper Prompt v2 (Auto-generated)

${candidate.reasoning}

## Instructions

${candidate.new_prompt}
`

    fs.writeFileSync(newPromptPath, promptContent)

    await logTelemetryEvent(AGENT_NAME, "candidate_accepted", {
      survival_score: metrics.survival_score,
      new_prompt_file: "sniper_v2.md",
    })
  } else {
    await logTelemetryEvent(AGENT_NAME, "candidate_rejected", {
      survival_score: metrics.survival_score,
      reason: metrics.survival_score >= 0.05 ? "score_above_threshold" : "empty_prompt",
    })
  }
}
