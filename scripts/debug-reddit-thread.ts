import { chromium } from "playwright"
import * as path from "path"

async function main() {
  const threadUrl = process.argv[2]

  if (!threadUrl) {
    console.log("\nUsage: pnpm tsx scripts/debug-reddit-thread.ts <reddit-thread-url>")
    console.log("Example: pnpm tsx scripts/debug-reddit-thread.ts https://www.reddit.com/r/Accounting/comments/abc123/test/\n")
    process.exit(1)
  }

  const userDataDir = path.join(process.cwd(), ".browser-profile")

  console.log("\n=== Reddit Thread UI Debug ===")
  console.log(`Thread URL: ${threadUrl}`)
  console.log(`Profile directory: ${userDataDir}\n`)

  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  })

  const page = await browser.newPage()

  try {
    console.log("Loading thread...")
    await page.goto(threadUrl, { waitUntil: "domcontentloaded", timeout: 30000 })
    await page.waitForTimeout(3000)

    const pageTitle = await page.title()
    console.log(`Page title: ${pageTitle}`)

    // Check login status
    const loginStatus = await page.evaluate(() => {
      const indicators: Record<string, boolean | null> = {}
      indicators.hasUserMenu = !!document.querySelector('[data-testid="user-menu"]')
      indicators.hasAvatar = !!document.querySelector('img[alt="User Avatar"]')
      return indicators
    })
    console.log(`Login status: ${loginStatus.hasUserMenu || loginStatus.hasAvatar ? "✅ Logged in" : "❌ Logged out"}`)

    // Test textarea selectors
    console.log("\n--- Testing Textarea Selectors ---")
    const textareaSelectors = [
      'textarea[placeholder*="comment"]',
      'textarea[aria-label*="comment"]',
      'div[contenteditable="true"]',
      'textarea',
    ]

    for (const selector of textareaSelectors) {
      try {
        const element = await page.locator(selector).first()
        const isVisible = await element.isVisible().catch(() => false)
        console.log(`${selector}: ${isVisible ? "✅ FOUND (visible)" : "⚠️  Found but hidden"}`)
      } catch (err) {
        console.log(`${selector}: ❌ Not found`)
      }
    }

    // Test submit button selectors
    console.log("\n--- Testing Submit Button Selectors ---")
    const submitSelectors = [
      'button[type="submit"]',
      'button:has-text("Comment")',
      'button:has-text("Reply")',
      '[data-testid="post-comment"]',
    ]

    for (const selector of submitSelectors) {
      try {
        const element = await page.locator(selector).first()
        const isVisible = await element.isVisible().catch(() => false)
        console.log(`${selector}: ${isVisible ? "✅ FOUND (visible)" : "⚠️  Found but hidden"}`)
      } catch (err) {
        console.log(`${selector}: ❌ Not found`)
      }
    }

    // Try to find the main comment area with a broader search
    console.log("\n--- Broad Search for Comment UI ---")
    const broadSearch = await page.evaluate(() => {
      const results: Array<{ tag: string; text: string; visible: boolean }> = []

      // Find all textareas and contenteditables
      const elements = document.querySelectorAll('textarea, div[contenteditable="true"], button')
      elements.forEach((el) => {
        const text = (el.textContent || "").trim().slice(0, 50)
        const placeholder = (el as HTMLTextAreaElement).placeholder || ""
        const rect = el.getBoundingClientRect()
        const visible = rect.width > 0 && rect.height > 0

        if (text || placeholder || el.tagName === "BUTTON") {
          results.push({
            tag: el.tagName.toLowerCase(),
            text: placeholder || text,
            visible,
          })
        }
      })

      return results.slice(0, 20)
    })

    console.log("Found elements:")
    broadSearch.forEach((item) => {
      console.log(`  <${item.tag}> "${item.text}" ${item.visible ? "(visible)" : "(hidden)"}`)
    })

    console.log("\n--- Instructions ---")
    console.log("1. Scroll to the comment section manually")
    console.log("2. Click 'Comment' or 'Reply' to expand the comment box")
    console.log("3. Observe which selectors might work")
    console.log("4. Close browser when done\n")

    // Keep browser open for manual inspection
    await page.waitForTimeout(60000)
  } catch (error) {
    console.error("Error during debug:", error)
  } finally {
    await browser.close()
    console.log("Debug session complete.\n")
  }
}

main().catch((err) => {
  console.error("Debug failed:", err)
  process.exit(1)
})
