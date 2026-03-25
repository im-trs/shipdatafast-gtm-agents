import { query } from "../utils/db"

export type ReplyVariantInput = {
  lead_id: string
  agent_name: string
  variant_name: string
  prompt_version: string
  reply_text: string
  selected?: boolean
  performance_label?: string | null
}

export type ReplyVariantRecord = {
  id: string
  lead_id: string
  agent_name: string
  variant_name: string
  prompt_version: string
  reply_text: string
  selected: boolean
  performance_label: string | null
  created_at: string
}

export async function insertReplyVariant(input: ReplyVariantInput): Promise<ReplyVariantRecord> {
  const rows = await query<ReplyVariantRecord>(
    `
    INSERT INTO reply_variants (
      lead_id,
      agent_name,
      variant_name,
      prompt_version,
      reply_text,
      selected,
      performance_label
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *
    `,
    [
      input.lead_id,
      input.agent_name,
      input.variant_name,
      input.prompt_version,
      input.reply_text,
      input.selected ?? false,
      input.performance_label ?? null,
    ]
  )

  return rows[0]
}

export async function getRepliesForLead(leadId: string): Promise<ReplyVariantRecord[]> {
  return query<ReplyVariantRecord>(
    `
    SELECT *
    FROM reply_variants
    WHERE lead_id = $1
    ORDER BY created_at ASC
    `,
    [leadId]
  )
}
