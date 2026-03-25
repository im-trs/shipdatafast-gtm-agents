import { query } from "../utils/db"
import { logTelemetryEvent } from "../repositories/telemetry"

export async function computeSurvivalMetrics(): Promise<{
  totals: {
    leads: number
    replies: number
    responses: number
    qualified: number
    demos: number
    conversions: number
    revenue_gbp: number
  }
  rates: {
    response_rate: number
    qualification_rate: number
    demo_rate: number
    conversion_rate: number
  }
  survival_score: number
}> {
  const totalsRaw = await query<Record<string, unknown>>(`
    SELECT
      (SELECT COUNT(*) FROM leads) AS total_leads,
      (SELECT COUNT(*) FROM interactions WHERE direction = 'outbound') AS total_replies,
      (SELECT COUNT(*) FROM interactions WHERE direction = 'inbound') AS total_responses,
      (SELECT COUNT(*) FROM leads WHERE status = 'qualified') AS qualified_leads,
      (SELECT COUNT(*) FROM leads WHERE status = 'demo_requested') AS demo_requested,
      (SELECT COUNT(*) FROM conversions) AS conversions_count,
      (SELECT COALESCE(SUM(value_gbp), 0) FROM conversions) AS revenue_gbp
  `)

  const totals = totalsRaw[0]

  const leads = Number(totals.total_leads ?? 0)
  const replies = Number(totals.total_replies ?? 0)
  const responses = Number(totals.total_responses ?? 0)
  const qualified = Number(totals.qualified_leads ?? 0)
  const demos = Number(totals.demo_requested ?? 0)
  const conversions = Number(totals.conversions_count ?? 0)
  const revenue_gbp = Number(totals.revenue_gbp ?? 0)

  const response_rate = replies > 0 ? Number((responses / replies).toFixed(4)) : 0
  const qualification_rate = responses > 0 ? Number((qualified / responses).toFixed(4)) : 0
  const demo_rate = qualified > 0 ? Number((demos / qualified).toFixed(4)) : 0
  const conversion_rate = demos > 0 ? Number((conversions / demos).toFixed(4)) : 0

  const survival_score = Number(
    (
      response_rate * 0.3 +
      qualification_rate * 0.2 +
      demo_rate * 0.2 +
      conversion_rate * 0.3
    ).toFixed(4)
  )

  await logTelemetryEvent(
    "metrics",
    "snapshot_generated",
    { survival_score }
  )

  return {
    totals: {
      leads,
      replies,
      responses,
      qualified,
      demos,
      conversions,
      revenue_gbp,
    },
    rates: {
      response_rate,
      qualification_rate,
      demo_rate,
      conversion_rate,
    },
    survival_score,
  }
}
