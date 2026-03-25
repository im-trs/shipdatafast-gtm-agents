import { computeSurvivalMetrics } from "../core/metrics/survival"
import { closeDb } from "../core/utils/db"

async function main() {
  const metrics = await computeSurvivalMetrics()

  console.log("\n=== SURVIVAL METRICS ===\n")

  console.log("Totals:")
  console.log(`  leads:         ${metrics.totals.leads}`)
  console.log(`  replies:       ${metrics.totals.replies}`)
  console.log(`  responses:     ${metrics.totals.responses}`)
  console.log(`  qualified:     ${metrics.totals.qualified}`)
  console.log(`  demos:         ${metrics.totals.demos}`)
  console.log(`  conversions:   ${metrics.totals.conversions}`)
  console.log(`  revenue_gbp:   £${metrics.totals.revenue_gbp.toFixed(2)}`)

  console.log("\nRates:")
  console.log(`  response_rate:       ${(metrics.rates.response_rate * 100).toFixed(2)}%`)
  console.log(`  qualification_rate:  ${(metrics.rates.qualification_rate * 100).toFixed(2)}%`)
  console.log(`  demo_rate:           ${(metrics.rates.demo_rate * 100).toFixed(2)}%`)
  console.log(`  conversion_rate:     ${(metrics.rates.conversion_rate * 100).toFixed(2)}%`)

  console.log("\nSurvival Score:")
  console.log(`  ${metrics.survival_score.toFixed(4)} / 1.0000\n`)

  await closeDb()
}

main().catch(async (err) => {
  console.error(err)
  await closeDb()
  process.exit(1)
})
