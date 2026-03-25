import { launchRedditPersistentContext, detectRedditLogin, logDetectionResult, getProfileDir } from "../core/playwright/reddit-session"

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

  const browser = await launchRedditPersistentContext(false)
  const page = await browser.newPage()

  // Step 1: Open Reddit and verify login
  console.log("Opening Reddit...")
  await page.goto("https://www.reddit.com", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  })

  console.log(`Page title: ${await page.title()}\n`)

  console.log("--- Step 1: Login Status ---")
  const indicators = await detectRedditLogin(page)
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
  console.log(`Navigating to: ${searchUrl}`)

  await page.goto(searchUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  })

  console.log("Waiting for search results to load...")
  await page.waitForTimeout(2000)

  console.log(`Search results page title: ${await page.title()}\n`)

  // Step 3: Find and open first post
  console.log("--- Step 3: Open First Post ---")
  console.log("Scanning for post links...")

  // Try multiple selectors for post links - optimized parallel approach
  const postSelectors = [
    'a[href*="/comments/"][data-click-id="post"]',
    'shreddit-post a[slot="title"]',
    'h3 a[href*="/comments/"]',
    '[data-testid="post-title"]',
    'a[href*="/comments/"]',
  ]

  let firstPostLink = null
  let matchedSelector = ""

  for (const selector of postSelectors) {
    try {
      const element = await page.locator(selector).first()
      const isVisible = await element.isVisible()
      const href = await element.getAttribute("href")

      if (isVisible && href && href.includes("/comments/")) {
        firstPostLink = href
        matchedSelector = selector
        console.log(`✅ Found post with selector: ${selector}`)
        console.log(`   Post href: ${href}\n`)
        break
      }
    } catch {
      // Silent fail, try next selector
    }
  }

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
  console.log("Navigating to post...")

  await page.goto(fullUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  })

  console.log("Post loaded, waiting for comments section...")
  await page.waitForTimeout(2000)

  console.log(`Post page title: ${await page.title()}\n`)

  // Step 4: Detect comments
  console.log("--- Step 4: Detect Comments ---")
  console.log("Scanning for comments...")

  const commentSelectors = [
    'shreddit-comment',
    '[data-testid="comment"]',
    '.comment',
    '[data-click-id="comment"]',
    'article[data-testid="comment"]',
  ]

  let commentCount = 0
  let matchedCommentSelector = ""

  for (const selector of commentSelectors) {
    try {
      const comments = await page.locator(selector)
      const count = await comments.count()
      if (count > 0) {
        commentCount = count
        matchedCommentSelector = selector
        console.log(`✅ Found ${count} comments with selector: ${selector}`)
        break
      }
    } catch {
      continue
    }
  }

  if (commentCount === 0) {
    // Fallback: try to find any text that looks like comments
    const fallbackCount = await page.evaluate(() => {
      const elements = document.querySelectorAll('[data-testid="comment"], .comment, shreddit-comment')
      return elements.length
    })
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

  await browser.close()
  console.log("✅ Session validation complete.\n")
}

main().catch(async (err) => {
  console.error("Session validation failed:", err)
  process.exit(1)
})
