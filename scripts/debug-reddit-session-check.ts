import { launchRedditPersistentContext, detectRedditLogin, logDetectionResult, getProfileDir } from "../core/playwright/reddit-session"
import { PLAYWRIGHT_TIMEOUTS } from "../core/playwright/config"
import { startTiming, endTiming, logStep, logNavigation } from "../core/playwright/timing"

async function main() {
  // Handle both quoted and unquoted arguments
  let searchQuery = process.argv[2] || "data reconciliation"

  // If user passed -- "query", the actual query is at index 3
  if (process.argv[3]) {
    searchQuery = process.argv[3]
  }

  console.log("\n=== Reddit Session Validation ===\n")
  console.log(`Profile directory: ${getProfileDir()}`)
  console.log(`Search query: ${searchQuery}\n`)

  const totalTimer = startTiming("session-validation.total")
  const browser = await launchRedditPersistentContext(false)

  try {
    const page = await browser.newPage()

    // Step 1: Open Reddit and verify login
    logStep("Opening Reddit...")
    const navTimer = startTiming("page.goto.reddit")
    await page.goto("https://www.reddit.com", {
      waitUntil: "domcontentloaded",
      timeout: PLAYWRIGHT_TIMEOUTS.navigation,
    })
    endTiming(navTimer)

    const titleTimer = startTiming("page.title")
    console.log(`Page title: ${await page.title()}\n`)
    endTiming(titleTimer)

    console.log("--- Step 1: Login Status ---")
    const loginTimer = startTiming("detectRedditLogin")
    const indicators = await detectRedditLogin(page)
    endTiming(loginTimer)
    logDetectionResult(indicators)

    // Allow challenge page to pass through (user may be logged in but Reddit shows CAPTCHA)
    if (indicators.overall === "logged_out") {
      console.log("❌ Not logged in. Run 'pnpm debug:reddit:login' first.\n")
      await browser.close()
      process.exit(1)
    }

    if (indicators.overall === "challenge_page") {
      console.log("⚠️  Challenge page detected. You may still be logged in.")
      console.log("Continuing with search test...\n")
    }

    // Step 2: Search Reddit
    console.log("--- Step 2: Search Reddit ---")
    const searchUrl = `https://www.reddit.com/search/?q=${encodeURIComponent(searchQuery)}&type=posts`
    logNavigation(searchUrl, 0)

    const searchNavTimer = startTiming("page.goto.search")
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: PLAYWRIGHT_TIMEOUTS.navigation,
    })
    endTiming(searchNavTimer)

    logStep("Waiting for search results to load...")
    const waitTimer = startTiming("waitForTimeout.search")
    await page.waitForTimeout(2000)
    endTiming(waitTimer)

    const searchTitleTimer = startTiming("page.title.search")
    console.log(`Search results page title: ${await page.title()}\n`)
    endTiming(searchTitleTimer)

    // Step 3: Find and open first post
    console.log("--- Step 3: Open First Post ---")
    logStep("Scanning for post links...")

    let firstPostLink: string | null = null
    let matchedSelector = ""

    // Use user-facing locators with chaining
    const findPostTimer = startTiming("find.firstPost")
    const post = page
      .getByRole('link', { name: /r\/|comments/i })
      .filter({ hasText: /r\// })
      .first()

    try {
      await post.waitFor({ state: 'visible', timeout: 5000 })
      const href = await post.getAttribute('href')
      if (href) {
        firstPostLink = href
        endTiming(findPostTimer, `found: ${href}`)
        console.log(`✅ Found post link: ${href}\n`)
      }
    } catch {
      // Fallback to CSS selectors
      const postSelectors = [
        'a[href*="/comments/"][data-click-id="post"]',
        'shreddit-post a[slot="title"]',
        'h3 a[href*="/comments/"]',
        '[data-testid="post-title"]',
        'a[href*="/comments/"]',
      ]

      for (const selector of postSelectors) {
        try {
          const selectorTimer = startTiming(`selector.${selector.slice(0, 30)}`)
          const element = await page.locator(selector).first()
          const isVisible = await element.isVisible()
          const href = await element.getAttribute("href")

          if (isVisible && href && href.includes("/comments/")) {
            firstPostLink = href
            matchedSelector = selector
            endTiming(selectorTimer, "matched")
            console.log(`✅ Found post with selector: ${selector}`)
            console.log(`   Post href: ${href}\n`)
            break
          }
          endTiming(selectorTimer, "no match")
        } catch {
          // Silent fail, try next selector
        }
      }
    }
    endTiming(findPostTimer, firstPostLink ? "success" : "failed")

    if (!firstPostLink) {
      console.log("❌ Could not find any post links on search results page")
      console.log("This may mean:")
      console.log("  - No results for this query")
      console.log("  - Reddit UI changed")
      console.log("  - Search results are blocked")
      console.log("\nBrowser will remain open for manual inspection (30 seconds)...\n")
      await page.waitForTimeout(30000)
      await browser.close()
      process.exit(1)
    }

    // Normalize URL
    const fullUrl = firstPostLink.startsWith("http")
      ? firstPostLink
      : `https://www.reddit.com${firstPostLink}`

    console.log(`Opening post: ${fullUrl}\n`)
    logStep("Navigating to post...")

    const postNavTimer = startTiming("page.goto.post")
    await page.goto(fullUrl, {
      waitUntil: "domcontentloaded",
      timeout: PLAYWRIGHT_TIMEOUTS.navigation,
    })
    endTiming(postNavTimer)

    logStep("Post loaded, waiting for comments section...")
    const postWaitTimer = startTiming("waitForTimeout.post")
    await page.waitForTimeout(2000)
    endTiming(postWaitTimer)

    const postTitleTimer = startTiming("page.title.post")
    console.log(`Post page title: ${await page.title()}\n`)
    endTiming(postTitleTimer)

    // Step 4: Detect comments using user-facing locators
    console.log("--- Step 4: Detect Comments ---")
    logStep("Scanning for comments...")

    let commentCount = 0
    let matchedCommentSelector = ""

    // Try role-based locator first
    const findCommentsTimer = startTiming("find.comments")
    const comments = page.getByRole('article').filter({ hasText: /comment/i })

    try {
      await comments.first().waitFor({ state: 'visible', timeout: 5000 })
      commentCount = await comments.count()
      endTiming(findCommentsTimer, `${commentCount} found`)
      console.log(`✅ Found ${commentCount} comments with role-based locator`)
    } catch {
      // Fallback to CSS selectors
      const commentSelectors = [
        'shreddit-comment',
        '[data-testid="comment"]',
        '.comment',
        '[data-click-id="comment"]',
        'article[data-testid="comment"]',
      ]

      for (const selector of commentSelectors) {
        try {
          const selectorTimer = startTiming(`selector.${selector.slice(0, 30)}`)
          const commentElements = await page.locator(selector)
          const count = await commentElements.count()
          if (count > 0) {
            commentCount = count
            matchedCommentSelector = selector
            endTiming(selectorTimer, `${count} found`)
            console.log(`✅ Found ${count} comments with selector: ${selector}`)
            break
          }
          endTiming(selectorTimer, "no match")
        } catch {
          continue
        }
      }
      endTiming(findCommentsTimer, `${commentCount} found (fallback)`)
    }

    if (commentCount === 0) {
      // Fallback: try to find any text that looks like comments
      const fallbackTimer = startTiming("evaluate.comments.fallback")
      const fallbackCount = await page.evaluate(() => {
        const elements = document.querySelectorAll('[data-testid="comment"], .comment, shreddit-comment')
        return elements.length
      })
      endTiming(fallbackTimer, `${fallbackCount} found`)
      commentCount = fallbackCount
      if (fallbackCount > 0) {
        console.log(`Found ${fallbackCount} comments (fallback detection)`)
      }
    }

    console.log(`\nComments visible: ${commentCount > 0 ? "✅ YES" : "❌ NO"}`)
    if (commentCount > 0) {
      console.log(`Comment count: ${commentCount}`)
    }

    // Summary
    console.log("\n=== Summary ===")
    console.log(`Login status: ${indicators.overall}`)
    console.log(`Search query: ${searchQuery}`)
    console.log(`Search URL: ${searchUrl}`)
    console.log(`Post URL: ${fullUrl}`)
    console.log(`Comments visible: ${commentCount > 0 ? "✅ YES" : "❌ NO"}`)
    console.log()

    // Keep browser open briefly for manual inspection
    console.log("Browser will close in 5 seconds...\n")
    await page.waitForTimeout(5000)

    endTiming(totalTimer)
  } finally {
    await browser.close()
  }

  console.log("✅ Session validation complete.\n")
}

main().catch(async (err) => {
  console.error("Session validation failed:", err)
  process.exit(1)
})
