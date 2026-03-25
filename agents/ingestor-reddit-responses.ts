import { chromium } from "playwright"
import { query } from "../core/utils/db"
import { insertInteraction } from "../core/repositories/interactions"
import { logTelemetryEvent } from "../core/repositories/telemetry"

const AGENT_NAME = "ingestor_reddit_responses"

type LeadToCheck = {
  id: string
  url: string
  title: string | null
}

type ResponseResult = {
  hasResponse: boolean
  commentCount: number
  sentiment: "positive" | "neutral" | "negative"
  sampleComment: string
}

const POSITIVE_KEYWORDS = ["yes", "interested", "send", "how", "can you", "dm", "details", "thanks", "helpful", "appreciate"]
const NEGATIVE_KEYWORDS = ["no", "not interested", "spam", "stop", "scam", "fuck off", "piss off"]

function classifySentiment(text: string): "positive" | "neutral" | "negative" {
  const lower = text.toLowerCase()

  for (const keyword of NEGATIVE_KEYWORDS) {
    if (lower.includes(keyword)) return "negative"
  }

  for (const keyword of POSITIVE_KEYWORDS) {
    if (lower.includes(keyword)) return "positive"
  }

  return "neutral"
}

async function scrapeRedditResponses(url: string): Promise<ResponseResult> {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  })

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
    await page.waitForTimeout(2000)

    // Try multiple selectors for Reddit comments
    const selectors = [
      'div[data-testid="comment"]',
      'shreddit-comment',
      '.comment',
      '[data-click-id="comment"]',
      'article[data-testid="comment"]',
    ]

    let comments: string[] = []

    for (const selector of selectors) {
      try {
        comments = await page.locator(selector).evaluateAll((elements) => {
          return elements
            .map((el) => (el.textContent || "").trim())
            .filter((text) => text.length > 10)
        })

        if (comments.length > 0) break
      } catch {
        continue
      }
    }

    // Fallback: grab all visible text blocks that look like comments
    if (comments.length === 0) {
      comments = await page.evaluate(() => {
        const blocks = document.querySelectorAll("p, div")
        const texts: string[] = []
        blocks.forEach((el) => {
          const text = (el.textContent || "").trim()
          if (text.length > 20 && text.length < 500) {
            texts.push(text)
          }
        })
        return texts.slice(0, 20)
      })
    }

    const commentCount = comments.length

    if (commentCount === 0) {
      return {
        hasResponse: false,
        commentCount: 0,
        sentiment: "neutral",
        sampleComment: "",
      }
    }

    // Check if any comment is a response (not the OP's original post)
    // We consider any comment as a potential response
    const sampleComment = comments[0] || ""
    const sentiment = classifySentiment(sampleComment)

    return {
      hasResponse: true,
      commentCount,
      sentiment,
      sampleComment,
    }
  } catch (error) {
    // On error, return no response but log the error
    return {
      hasResponse: false,
      commentCount: 0,
      sentiment: "neutral",
      sampleComment: `Error scraping: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  } finally {
    await page.close()
    await browser.close()
  }
}

export async function runRedditIngestor(limit = 10): Promise<void> {
  await logTelemetryEvent(AGENT_NAME, "run_started", { limit })

  const leads = await query<LeadToCheck>(
    `
    SELECT id, url, title
    FROM leads
    WHERE status = 'posted'
      AND source = 'reddit'
    ORDER BY created_at ASC
    LIMIT $1
    `,
    [limit]
  )

  let processed = 0
  let engaged = 0
  let ignored = 0
  let errors = 0

  for (const lead of leads) {
    try {
      await logTelemetryEvent(AGENT_NAME, "lead_checked", { url: lead.url }, lead.id)

      const result = await scrapeRedditResponses(lead.url)

      if (result.hasResponse) {
        await insertInteraction({
          lead_id: lead.id,
          channel: "reddit",
          direction: "inbound",
          message_text: result.sampleComment || `Found ${result.commentCount} comment(s)`,
          outcome: "response_detected",
          metadata: {
            sentiment: result.sentiment,
            comment_count: result.commentCount,
          },
        })

        await query(
          `
          UPDATE leads
          SET status = 'engaged',
              updated_at = NOW()
          WHERE id = $1
          `,
          [lead.id]
        )

        await logTelemetryEvent(
          AGENT_NAME,
          "response_detected",
          {
            sentiment: result.sentiment,
            comment_count: result.commentCount,
          },
          lead.id
        )

        engaged += 1
      } else {
        await insertInteraction({
          lead_id: lead.id,
          channel: "reddit",
          direction: "inbound",
          message_text: "No responses found on Reddit thread",
          outcome: "no_response",
          metadata: {
            sentiment: "neutral",
            comment_count: 0,
          },
        })

        await query(
          `
          UPDATE leads
          SET status = 'ignored',
              updated_at = NOW()
          WHERE id = $1
          `,
          [lead.id]
        )

        await logTelemetryEvent(AGENT_NAME, "no_response", {}, lead.id)

        ignored += 1
      }

      processed += 1
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"

      await logTelemetryEvent(
        AGENT_NAME,
        "ingestion_error",
        {
          error: errorMessage,
          url: lead.url,
        },
        lead.id
      )

      errors += 1
    }
  }

  await logTelemetryEvent(AGENT_NAME, "run_completed", {
    limit,
    processed,
    engaged,
    ignored,
    errors,
  })
}
