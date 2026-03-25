import { getQueuedExecutions, markExecutionRunning, markExecutionPosted, markExecutionFailed } from "../core/repositories/execution"
import { query } from "../core/utils/db"
import { updateLeadStatus } from "../core/repositories/leads"
import { insertInteraction } from "../core/repositories/interactions"
import { logTelemetryEvent } from "../core/repositories/telemetry"

const AGENT_NAME = "executor_dryrun"

type ReplyLookup = {
  reply_text: string
}

export async function runDryExecutor(limit = 10): Promise<void> {
  await logTelemetryEvent(AGENT_NAME, "run_started", { limit })

  const queue = await getQueuedExecutions(limit)
  let posted = 0
  let failed = 0

  for (const item of queue) {
    try {
      await markExecutionRunning(item.id)

      const rows = await query<ReplyLookup>(
        `
        SELECT reply_text
        FROM reply_variants
        WHERE id = $1
        LIMIT 1
        `,
        [item.reply_variant_id]
      )

      const replyText = rows[0]?.reply_text
      if (!replyText) throw new Error("Reply variant not found")

      const fakeExternalId = `dryrun_${Date.now()}_${item.id.slice(0, 8)}`

      await insertInteraction({
        lead_id: item.lead_id,
        channel: item.platform,
        direction: "outbound_post",
        message_text: replyText,
        outcome: "posted_dryrun",
        metadata: {
          queue_id: item.id,
          external_message_id: fakeExternalId,
          payload: item.payload,
        },
      })

      await markExecutionPosted(item.id, fakeExternalId)
      await updateLeadStatus(item.lead_id, "posted")

      await logTelemetryEvent(
        AGENT_NAME,
        "execution_posted_dryrun",
        {
          queue_id: item.id,
          external_message_id: fakeExternalId,
        },
        item.lead_id
      )

      posted += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown execution error"

      await markExecutionFailed(item.id, message)

      await logTelemetryEvent(
        AGENT_NAME,
        "execution_failed",
        {
          queue_id: item.id,
          error: message,
        },
        item.lead_id
      )

      failed += 1
    }
  }

  await logTelemetryEvent(AGENT_NAME, "run_completed", {
    limit,
    posted,
    failed,
  })
}
