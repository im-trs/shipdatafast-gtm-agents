import { getSelectedRepliesForExecution } from "../core/repositories/replies-extended"
import { enqueueExecution } from "../core/repositories/execution"
import { updateLeadStatus } from "../core/repositories/leads"
import { insertInteraction } from "../core/repositories/interactions"
import { logTelemetryEvent } from "../core/repositories/telemetry"

const AGENT_NAME = "executor_queue_builder"

export async function runQueueBuilder(limit = 10): Promise<void> {
  await logTelemetryEvent(AGENT_NAME, "run_started", { limit })

  const selectedReplies = await getSelectedRepliesForExecution(limit)
  let queued = 0

  for (const item of selectedReplies) {
    await enqueueExecution({
      lead_id: item.lead_id,
      reply_variant_id: item.reply_variant_id,
      platform: item.source,
      action_type: "post_reply",
      payload: {
        source_type: item.source_type,
        url: item.url,
        title: item.title,
      },
    })

    await insertInteraction({
      lead_id: item.lead_id,
      channel: item.source,
      direction: "internal_queue",
      message_text: item.reply_text,
      message_version: `${item.prompt_version}:${item.variant_name}`,
      outcome: "queued_for_execution",
      metadata: {
        reply_variant_id: item.reply_variant_id,
      },
    })

    await updateLeadStatus(item.lead_id, "queued")
    await logTelemetryEvent(
      AGENT_NAME,
      "reply_queued",
      {
        platform: item.source,
        reply_variant_id: item.reply_variant_id,
      },
      item.lead_id
    )

    queued += 1
  }

  await logTelemetryEvent(AGENT_NAME, "run_completed", {
    limit,
    queued,
  })
}
