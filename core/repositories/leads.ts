import { query } from "../utils/db"

export type LeadInput = {
  source: string
  source_type: string
  external_id?: string | null
  author_handle?: string | null
  url?: string | null
  title?: string | null
  body?: string | null
  pain_score?: number
  urgency_score?: number
  fit_score?: number
  status?: string
}

export type LeadRecord = {
  id: string
  source: string
  source_type: string
  external_id: string | null
  author_handle: string | null
  url: string | null
  title: string | null
  body: string | null
  pain_score: string
  urgency_score: string
  fit_score: string
  status: string
  created_at: string
  updated_at: string
}

export async function insertLead(input: LeadInput): Promise<LeadRecord> {
  const rows = await query<LeadRecord>(
    `
    INSERT INTO leads (
      source,
      source_type,
      external_id,
      author_handle,
      url,
      title,
      body,
      pain_score,
      urgency_score,
      fit_score,
      status
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
    `,
    [
      input.source,
      input.source_type,
      input.external_id ?? null,
      input.author_handle ?? null,
      input.url ?? null,
      input.title ?? null,
      input.body ?? null,
      input.pain_score ?? 0,
      input.urgency_score ?? 0,
      input.fit_score ?? 0,
      input.status ?? "found",
    ]
  )

  return rows[0]
}

export async function findLeadBySourceExternalId(
  source: string,
  externalId: string
): Promise<LeadRecord | null> {
  const rows = await query<LeadRecord>(
    `
    SELECT *
    FROM leads
    WHERE source = $1
      AND external_id = $2
    LIMIT 1
    `,
    [source, externalId]
  )

  return rows[0] ?? null
}

export async function getLeadsNeedingReplies(limit = 10): Promise<LeadRecord[]> {
  return query<LeadRecord>(
    `
    SELECT *
    FROM leads
    WHERE status IN ('found', 'qualified')
    ORDER BY created_at ASC
    LIMIT $1
    `,
    [limit]
  )
}

export async function updateLeadStatus(id: string, status: string): Promise<void> {
  await query(
    `
    UPDATE leads
    SET status = $2,
        updated_at = NOW()
    WHERE id = $1
    `,
    [id, status]
  )
}
