import { chromium, type Page } from "playwright"
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
import { launchRedditPersistentContext, isLocatorVisible } from "../core/playwright/reddit-session"
import { PLAYWRIGHT_TIMEOUTS } from "../core/playwright/config"
import { startTiming, endTiming, timed, logStep, logInteraction, logNavigation, logSelectorMatch } from "../core/playwright/timing"

const AGENT_NAME = "executor_reddit"

// Configurable headless mode (default: false for debugging)
const HEADLESS = process.env.PLAYWRIGHT_HEADLESS === "true"
const SAFE_MODE = process.env.REDDIT_EXECUTION_MODE !== "live"
const VERBOSE_TIMING = process.env.PLAYWRIGHT_VERBOSE === "true"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function postToReddit(
  page: Page,
  url: string,
  replyText: string
): Promise<{ success: boolean; externalId?: string }> {
  const totalTimer = startTiming("postToReddit.total")

  try {
    // Step 1: Navigate to thread
    logStep(`[LIVE] Navigating to: ${url}`)
    const navTimer = startTiming("page.goto")
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: PLAYWRIGHT_TIMEOUTS.navigation })
    endTiming(navTimer)

    // Wait for network to be idle
    const networkTimer = startTiming("waitForLoadState.networkidle")
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
    endTiming(networkTimer)

    await sleep(randomDelay(1000, 2000))

    // Check page title
    const titleTimer = startTiming("page.title")
    const pageTitle = await page.title()
    endTiming(titleTimer)
    console.log(`[LIVE] Page title: ${pageTitle}`)

    // Check if we're on a Reddit page (not login wall)
    const currentUrl = page.url()
    if (currentUrl.includes("login") || currentUrl.includes("signin")) {
      throw new Error("Redirected to login page - session may have expired")
    }

    // Step 2: Find reply textarea
    logStep("[LIVE] Finding reply textbox...")
    const findTextareaTimer = startTiming("find.textarea")

    const textarea = page
      .getByRole('textbox', { name: /comment|reply/i })
      .or(page.locator('textarea[placeholder*="comment"]'))
      .or(page.locator('textarea[aria-label*="comment"]'))
      .or(page.locator('div[contenteditable="true"]'))
      .first()

    const textareaVisible = await isLocatorVisible(textarea, PLAYWRIGHT_TIMEOUTS.elementWait)
    endTiming(findTextareaTimer, textareaVisible ? "found" : "not found")

    if (!textareaVisible) {
      console.log(`[LIVE] Available textareas on page:`)
      const availableTimer = startTiming("evaluate.textareas")
      const availableTextareas = await page.evaluate(() => {
        const elements = document.querySelectorAll('textarea, div[contenteditable="true"]')
        return Array.from(elements).map((el, i) => ({
          tag: el.tagName,
          placeholder: (el as HTMLTextAreaElement).placeholder,
          visible: el.getBoundingClientRect().width > 0,
        }))
      })
      endTiming(availableTimer)
      console.log(JSON.stringify(availableTextareas, null, 2))
      throw new Error("Could not find reply textarea")
    }

    logSelectorMatch(textarea.toString(), findTextareaTimer.start - Date.now())

    // Step 3: Fill reply text
    logStep("[LIVE] Filling reply text...")
    const fillTimer = startTiming("textarea.fill")
    await textarea.fill(replyText)
    endTiming(fillTimer)

    await sleep(randomDelay(500, 1000))

    // Step 4: Find and click submit button
    logStep("[LIVE] Finding submit button...")
    const findSubmitTimer = startTiming("find.submitButton")

    const submitButton = page
      .getByRole('button', { name: /comment|reply|post/i })
      .or(page.locator('button[type="submit"]'))
      .or(page.locator('[data-testid="post-comment"]'))
      .first()

    const submitVisible = await isLocatorVisible(submitButton, PLAYWRIGHT_TIMEOUTS.elementWait)
    endTiming(findSubmitTimer, submitVisible ? "found" : "not found")

    if (submitVisible) {
      logStep("[LIVE] Clicking submit button...")
      const clickTimer = startTiming("submitButton.click")
      await submitButton.click()
      endTiming(clickTimer)
    } else {
      logStep("[LIVE] No submit button found, pressing Enter as fallback")
      const pressTimer = startTiming("textarea.press.Enter")
      await textarea.press("Enter")
      endTiming(pressTimer)
    }

    // Wait for potential navigation or update
    const postWaitTimer = startTiming("postSubmission.wait")
    await sleep(randomDelay(2000, 3000))
    endTiming(postWaitTimer)

    // Generate external ID
    const externalId = `reddit_${Date.now()}_${url.slice(-8)}`

    endTiming(totalTimer)
    console.log(`✅ [LIVE] Post action complete - Total: ${Date.now() - totalTimer.start}ms\n`)

    return {
      success: true,
      externalId,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown posting error"
    console.error(`[LIVE] Posting failed: ${message}`)
    endTiming(totalTimer, "FAILED")
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
  const browser = await launchRedditPersistentContext(HEADLESS)

  try {
    const page = await browser.newPage()

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
