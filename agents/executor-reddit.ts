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
    console.log(`[LIVE] Navigating to: ${url}`)
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
    await sleep(randomDelay(2000, 3000))

    // Check page title for debugging
    const pageTitle = await page.title()
    console.log(`[LIVE] Page title: ${pageTitle}`)

    // Check if we're on a Reddit page (not login wall)
    const currentUrl = page.url()
    if (currentUrl.includes("login") || currentUrl.includes("signin")) {
      throw new Error("Redirected to login page - session may have expired")
    }

    // Find reply/textarea element
    const textareaSelectors = [
      'textarea[placeholder*="comment"]',
      'textarea[aria-label*="comment"]',
      'div[contenteditable="true"]',
      'textarea',
    ]

    let textarea = null
    let matchedSelector = ""
    for (const selector of textareaSelectors) {
      try {
        textarea = await page.locator(selector).first()
        const isVisible = await textarea.isVisible()
        if (isVisible) {
          matchedSelector = selector
          break
        }
        textarea = null
      } catch {
        continue
      }
    }

    if (!textarea) {
      console.log(`[LIVE] Available textareas on page:`)
      const availableTextareas = await page.evaluate(() => {
        const elements = document.querySelectorAll('textarea, div[contenteditable="true"]')
        return Array.from(elements).map((el, i) => ({
          tag: el.tagName,
          placeholder: (el as HTMLTextAreaElement).placeholder,
          visible: el.getBoundingClientRect().width > 0,
        }))
      })
      console.log(JSON.stringify(availableTextareas, null, 2))
      throw new Error("Could not find reply textarea")
    }

    console.log(`[LIVE] Found textarea with selector: ${matchedSelector}`)

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
    let matchedSubmitSelector = ""
    for (const selector of submitSelectors) {
      try {
        submitButton = await page.locator(selector).first()
        const isVisible = await submitButton.isVisible()
        if (isVisible) {
          matchedSubmitSelector = selector
          break
        }
        submitButton = null
      } catch {
        continue
      }
    }

    if (submitButton) {
      console.log(`[LIVE] Found submit button with selector: ${matchedSubmitSelector}`)
      await submitButton.click()
      await sleep(randomDelay(2000, 3000))
    } else {
      console.log(`[LIVE] No submit button found, pressing Enter as fallback`)
      // If no submit button found, try pressing Enter
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
    console.error(`[LIVE] Posting failed: ${message}`)
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
          // Safe mode: log but DON'T mutate queue or lead status
          console.log(`[SAFE MODE] Would post to: ${threadUrl}`)
          console.log(`[SAFE MODE] Reply text: ${replyText.slice(0, 100)}...`)

          // Log interaction for visibility, but mark as simulated
          await insertInteraction({
            lead_id: item.lead_id,
            channel: "reddit",
            direction: "outbound_post",
            message_text: replyText,
            outcome: "simulated",
            metadata: {
              queue_id: item.id,
              mode: "safe",
              note: "Safe mode - no actual post made",
            },
          })

          // Do NOT mark execution as posted - leave it queued for live run
          // Do NOT update lead status in safe mode
          // Reset status back to queued so live run can process it
          await query(
            `UPDATE execution_queue SET status = 'queued', updated_at = NOW() WHERE id = $1`,
            [item.id]
          )

          await logTelemetryEvent(
            AGENT_NAME,
            "execution_simulated",
            {
              queue_id: item.id,
              mode: "safe",
            },
            item.lead_id
          )

          skipped += 1
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

  console.log(`\nRun complete: ${posted} posted, ${failed} failed, ${skipped} simulated (safe mode)`)
}
