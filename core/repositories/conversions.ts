import { query } from "../utils/db"

export type ConversionInput = {
  lead_id: string
  conversion_type: string
  value_gbp?: number
  currency?: string
  notes?: string | null
}

export async function insertConversion(input: ConversionInput): Promise<void> {
  await query(
    `
    INSERT INTO conversions (
      lead_id,
      conversion_type,
      value_gbp,
      currency,
      notes
    )
    VALUES ($1,$2,$3,$4,$5)
    `,
    [
      input.lead_id,
      input.conversion_type,
      input.value_gbp ?? 0,
      input.currency ?? "GBP",
      input.notes ?? null,
    ]
  )
}
