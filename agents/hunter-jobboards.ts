import { chromium } from "playwright"
import type { RawLead } from "./hunter-types"

function getEnvList(name: string, fallback: string[]): string[] {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  return raw
    .split(",")
    .map(v => v.trim())
    .filter(Boolean)
}

function getMaxResults(): number {
  const raw = Number(process.env.HUNTER_MAX_RESULTS_PER_TERM || "10")
  if (!Number.isFinite(raw) || raw <= 0) return 10
  return Math.min(raw, 25)
}

function sanitizeExternalId(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[^\w]+/g, "_")
    .slice(0, 180)
}

export async function discoverJobBoardLeads(): Promise<RawLead[]> {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  })

  const searchTerms = getEnvList("JOB_SEARCH_TERMS", [
    "data reconciliation",
    "finance data analyst",
    "data quality analyst",
    "reporting analyst",
    "etl analyst",
    "operations analyst",
  ])

  const maxResults = getMaxResults()
  const collected: RawLead[] = []
  const seen = new Set<string>()

  try {
    for (const term of searchTerms) {
      const query = `${term} site:indeed.com OR site:reed.co.uk OR site:totaljobs.com OR site:linkedin.com/jobs`
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 })
      await page.waitForTimeout(2500)

      const items = await page.locator("a").evaluateAll((anchors) => {
        const results: Array<{ href: string; text: string }> = []

        for (const a of anchors) {
          const href = a.getAttribute("href") || ""
          const text = (a.textContent || "").trim()

          if (!href || !text) continue
          if (!href.startsWith("http")) continue

          results.push({ href, text })
        }

        return results
      })

      let count = 0

      for (const item of items) {
        if (count >= maxResults) break

        const lowerHref = item.href.toLowerCase()
        const allowed =
          lowerHref.includes("indeed.") ||
          lowerHref.includes("reed.co.uk") ||
          lowerHref.includes("totaljobs.") ||
          lowerHref.includes("linkedin.com/jobs")

        if (!allowed) continue

        const externalId = sanitizeExternalId(item.href)
        if (seen.has(externalId)) continue
        seen.add(externalId)

        collected.push({
          source: "job_board",
          source_type: "job_post",
          external_id: externalId,
          url: item.href,
          title: item.text,
          body: `Job posting discovered from search term: ${term}`,
        })

        count += 1
      }
    }

    return collected
  } finally {
    await page.close()
    await browser.close()
  }
}
