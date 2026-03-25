import { query } from "../utils/db"

export type QueueItem = {
  id: string
  lead_id: string
  reply_variant_id: string
  platform: string
  action_type: string
  status: string
  execute_after: string
  attempt_count: number
  last_error: string | null
  external_message_id: string | null
  payload: Record<string, unknown>
  created_at: string
  updated_at: string
}

export async function enqueueExecution(input: {
  lead_id: string
  reply_variant_id: string
  platform: string
  action_type: string
  payload?: Record<string, unknown>
}): Promise<void> {
  await query(
    `
    INSERT INTO execution_queue (
      lead_id,
      reply_variant_id,
      platform,
      action_type,
      payload
    )
    VALUES ($1,$2,$3,$4,$5::jsonb)
    `,
    [
      input.lead_id,
      input.reply_variant_id,
      input.platform,
      input.action_type,
      JSON.stringify(input.payload ?? {}),
    ]
  )
}

export async function getQueuedExecutions(limit = 10): Promise<QueueItem[]> {
  return query<QueueItem>(
    `
    SELECT *
    FROM execution_queue
    WHERE status = 'queued'
      AND execute_after <= NOW()
    ORDER BY created_at ASC
    LIMIT $1
    `,
    [limit]
  )
}

export async function markExecutionRunning(id: string): Promise<void> {
  await query(
    `
    UPDATE execution_queue
    SET status = 'running',
        updated_at = NOW()
    WHERE id = $1
    `,
    [id]
  )
}

export async function markExecutionPosted(
  id: string,
  externalMessageId?: string | null
): Promise<void> {
  await query(
    `
    UPDATE execution_queue
    SET status = 'posted',
        external_message_id = $2,
        updated_at = NOW()
    WHERE id = $1
    `,
    [id, externalMessageId ?? null]
  )
}

export async function markExecutionFailed(
  id: string,
  errorMessage: string
): Promise<void> {
  await query(
    `
    UPDATE execution_queue
    SET status = 'failed',
        attempt_count = attempt_count + 1,
        last_error = $2,
        updated_at = NOW()
    WHERE id = $1
    `,
    [id, errorMessage]
  )
}
