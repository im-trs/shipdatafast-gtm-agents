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

function normalizeUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  return `https://www.reddit.com${url}`
}

function extractExternalIdFromUrl(url: string): string {
  const match = url.match(/\/comments\/([a-z0-9]+)\//i)
  return match?.[1] ?? url
}

export async function discoverRedditLeads(): Promise<RawLead[]> {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  })

  const searchTerms = getEnvList("REDDIT_SEARCH_TERMS", [
    "data reconciliation",
    "compare csv",
    "manual reconciliation",
    "data quality",
    "mismatch reporting",
    "excel reconciliation",
  ])

  const maxResults = getMaxResults()
  const collected: RawLead[] = []
  const seen = new Set<string>()

  try {
    for (const term of searchTerms) {
      const searchUrl = `https://www.reddit.com/search/?q=${encodeURIComponent(term)}&type=posts&sort=new`
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 })
      await page.waitForTimeout(2500)

      const items = await page.locator("a[href*='/comments/']").evaluateAll((anchors) => {
        const results: Array<{
          href: string
          text: string
        }> = []

        for (const a of anchors) {
          const href = a.getAttribute("href") || ""
          const text = (a.textContent || "").trim()
          if (!href || !text) continue
          results.push({ href, text })
        }

        return results
      })

      let count = 0

      for (const item of items) {
        if (count >= maxResults) break

        const url = normalizeUrl(item.href)
        const externalId = extractExternalIdFromUrl(url)
        if (seen.has(externalId)) continue
        seen.add(externalId)

        collected.push({
          source: "reddit",
          source_type: "post",
          external_id: externalId,
          url,
          title: item.text,
          body: `Reddit post discovered from search term: ${term}`,
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
