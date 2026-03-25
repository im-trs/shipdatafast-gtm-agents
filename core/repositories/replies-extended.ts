import { query } from "../utils/db"

export type SelectedReplyRecord = {
  lead_id: string
  reply_variant_id: string
  reply_text: string
  variant_name: string
  prompt_version: string
  source: string
  source_type: string
  url: string | null
  title: string | null
}

export async function getSelectedRepliesForExecution(limit = 10): Promise<SelectedReplyRecord[]> {
  return query<SelectedReplyRecord>(
    `
    SELECT
      l.id AS lead_id,
      rv.id AS reply_variant_id,
      rv.reply_text,
      rv.variant_name,
      rv.prompt_version,
      l.source,
      l.source_type,
      l.url,
      l.title
    FROM leads l
    INNER JOIN reply_variants rv
      ON rv.lead_id = l.id
    WHERE l.status = 'replied'
      AND rv.selected = true
    ORDER BY l.created_at ASC
    LIMIT $1
    `,
    [limit]
  )
}
