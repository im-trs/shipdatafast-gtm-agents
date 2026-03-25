import { chromium } from "playwright"
import { query } from "../core/utils/db"
import { insertInteraction } from "../core/repositories/interactions"
import { logTelemetryEvent } from "../core/repositories/telemetry"
import {
  getQueuedExecutions,
  markExecutionRunning,
  markExecutionPosted,
  markExecutionFailed,
  type QueueItem,
} from "../core/repositories/execution"
import { updateLeadStatus } from "../core/repositories/leads"
import * as path from "path"

const AGENT_NAME = "executor_reddit"

const SAFE_MODE = process.env.REDDIT_EXECUTION_MODE !== "live"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function postToReddit(
  page: any,
  url: string,
  replyText: string
): Promise<{ success: boolean; externalId?: string }> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
    await sleep(randomDelay(2000, 3000))

    // Find reply/textarea element
    const textareaSelectors = [
      'textarea[placeholder*="comment"]',
      'textarea[aria-label*="comment"]',
      'div[contenteditable="true"]',
      'textarea',
    ]

    let textarea = null
    for (const selector of textareaSelectors) {
      try {
        textarea = await page.locator(selector).first()
        const isVisible = await textarea.isVisible()
        if (isVisible) break
        textarea = null
      } catch {
        continue
      }
    }

    if (!textarea) {
      throw new Error("Could not find reply textarea")
    }

    // Click to focus
    await textarea.click()
    await sleep(500)

    // Type the reply (simulate human typing)
    await textarea.fill(replyText)
    await sleep(randomDelay(500, 1000))

    // Find and click submit button
    const submitSelectors = [
      'button[type="submit"]',
      'button:has-text("Comment")',
      'button:has-text("Reply")',
      '[data-testid="post-comment"]',
    ]

    let submitButton = null
    for (const selector of submitSelectors) {
      try {
        submitButton = await page.locator(selector).first()
        const isVisible = await submitButton.isVisible()
        if (isVisible) break
        submitButton = null
      } catch {
        continue
      }
    }

    if (submitButton) {
      await submitButton.click()
      await sleep(randomDelay(2000, 3000))
    } else {
      // If no submit button found, assume fill was enough (some Reddit UIs auto-submit)
      // Or try pressing Enter
      await textarea.press("Enter")
      await sleep(randomDelay(1000, 2000))
    }

    // Generate external ID
    const externalId = `reddit_${Date.now()}_${url.slice(-8)}`

    return {
      success: true,
      externalId,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown posting error"
    return {
      success: false,
    }
  }
}

export async function runRedditExecutor(limit = 5): Promise<void> {
  await logTelemetryEvent(AGENT_NAME, "run_started", {
    limit,
    mode: SAFE_MODE ? "safe" : "live",
  })

  const queue = await getQueuedExecutions(limit)
  const redditQueue = queue.filter((item) => item.platform === "reddit")

  if (redditQueue.length === 0) {
    await logTelemetryEvent(AGENT_NAME, "no_reddit_items", {})
    return
  }

  let posted = 0
  let failed = 0
  let skipped = 0

  // Launch browser with persistent context (allows manual login)
  const userDataDir = path.join(process.cwd(), ".browser-profile")
  
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // Show browser for debugging and manual login
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  })

  const page = await browser.newPage()

  try {
    for (const item of redditQueue) {
      try {
        await markExecutionRunning(item.id)

        await logTelemetryEvent(
          AGENT_NAME,
          "executor_reddit_started",
          {
            queue_id: item.id,
            url: item.payload.url as string,
            mode: SAFE_MODE ? "safe" : "live",
          },
          item.lead_id
        )

        // Fetch reply text
        const replyRows = await query<{ reply_text: string }>(
          `SELECT reply_text FROM reply_variants WHERE id = $1 LIMIT 1`,
          [item.reply_variant_id]
        )

        const replyText = replyRows[0]?.reply_text
        if (!replyText) {
          throw new Error("Reply variant not found")
        }

        const threadUrl = item.payload.url as string

        if (SAFE_MODE) {
          // Safe mode: log but don't post
          console.log(`[SAFE MODE] Would post to: ${threadUrl}`)
          console.log(`[SAFE MODE] Reply text: ${replyText.slice(0, 100)}...`)

          const fakeExternalId = `safe_${Date.now()}_${item.id.slice(0, 8)}`

          await insertInteraction({
            lead_id: item.lead_id,
            channel: "reddit",
            direction: "outbound_post",
            message_text: replyText,
            outcome: "posted_safe",
            metadata: {
              queue_id: item.id,
              external_message_id: fakeExternalId,
              payload: item.payload,
              mode: "safe",
            },
          })

          await markExecutionPosted(item.id, fakeExternalId)
          await updateLeadStatus(item.lead_id, "posted")

          await logTelemetryEvent(
            AGENT_NAME,
            "execution_posted_safe",
            {
              queue_id: item.id,
              external_message_id: fakeExternalId,
              mode: "safe",
            },
            item.lead_id
          )

          posted += 1
        } else {
          // Live mode: actually post
          const result = await postToReddit(page, threadUrl, replyText)

          if (result.success && result.externalId) {
            await insertInteraction({
              lead_id: item.lead_id,
              channel: "reddit",
              direction: "outbound_post",
              message_text: replyText,
              outcome: "posted",
              metadata: {
                queue_id: item.id,
                external_message_id: result.externalId,
                payload: item.payload,
                mode: "live",
              },
            })

            await markExecutionPosted(item.id, result.externalId)
            await updateLeadStatus(item.lead_id, "posted")

            await logTelemetryEvent(
              AGENT_NAME,
              "execution_posted",
              {
                queue_id: item.id,
                external_message_id: result.externalId,
                mode: "live",
              },
              item.lead_id
            )

            posted += 1

            // Rate limiting
            await sleep(randomDelay(5000, 15000))
          } else {
            throw new Error("Posting failed")
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown execution error"

        await markExecutionFailed(item.id, message)

        await logTelemetryEvent(
          AGENT_NAME,
          "execution_failed",
          {
            queue_id: item.id,
            error: message,
          },
          item.lead_id
        )

        failed += 1
      }
    }
  } finally {
    await browser.close()
  }

  await logTelemetryEvent(AGENT_NAME, "run_completed", {
    limit,
    posted,
    failed,
    skipped,
    mode: SAFE_MODE ? "safe" : "live",
  })
}
