import { launchRedditPersistentContext, getProfileDir } from "../core/playwright/reddit-session"

async function main() {
  console.log("\n=== Reddit DOM Inspector ===\n")
  console.log(`Profile directory: ${getProfileDir()}\n`)

  const browser = await launchRedditPersistentContext(false)
  const page = await browser.newPage()

  // Navigate to Reddit
  console.log("Opening Reddit...")
  await page.goto("https://www.reddit.com", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  })

  await page.waitForTimeout(3000)

  console.log(`Page URL: ${page.url()}`)
  console.log(`Page title: ${await page.title()}\n`)

  // Take a screenshot for visual reference
  await page.screenshot({ path: "reddit-debug-screenshot.png" })
  console.log("📸 Screenshot saved to: reddit-debug-screenshot.png\n")

  // Scan for ALL potential login indicators
  console.log("=== Scanning for Login Indicators ===\n")

  const loginIndicators = await page.evaluate(() => {
    const results: Array<{ selector: string; found: boolean; count: number; text?: string }> = []

    const selectors = [
      // User menu variations
      '[data-testid="user-menu"]',
      'button[aria-label*="user"]',
      'button[aria-label*="account"]',
      'button[aria-label*="profile"]',
      
      // Avatar variations
      'img[alt*="avatar"]',
      'img[alt*="Avatar"]',
      'img[data-testid*="avatar"]',
      'img[src*="avatar"]',
      'img[src*="redditstatic"]',
      'button img',
      
      // Profile links
      'a[href*="/user/"]',
      'a[href*="/u/"]',
      'nav a[href*="/user/"]',
      'header a[href*="/user/"]',
      
      // Username displays
      'span[data-testid*="username"]',
      'button span',
      'header button',
      
      // Logged out indicators
      'button:has-text("Log In")',
      'button:has-text("Sign In")',
      'a:has-text("Log In")',
      'button:has-text("Sign Up")',
      'a:has-text("Sign Up")',
    ]

    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector)
      const firstElement = elements[0] as HTMLElement | undefined
      
      results.push({
        selector,
        found: elements.length > 0,
        count: elements.length,
        text: firstElement?.textContent?.trim().slice(0, 50) || undefined,
      })
    })

    return results
  })

  console.log("Selector scan results:")
  loginIndicators.forEach(result => {
    if (result.found) {
      console.log(`✅ ${result.selector}`)
      console.log(`   Count: ${result.count}, Text: "${result.text}"`)
    }
  })

  const foundCount = loginIndicators.filter(r => r.found).length
  console.log(`\nFound ${foundCount}/${loginIndicators.length} selectors\n`)

  // Check for CAPTCHA
  const pageTitle = await page.title()
  const isCaptcha = pageTitle.includes("Prove your humanity") || pageTitle.includes("captcha")
  console.log(`CAPTCHA page detected: ${isCaptcha ? "✅ YES" : "❌ NO"}\n`)

  // Scan header/navigation for user info
  console.log("=== Scanning Header/Navigation ===\n")

  const headerInfo = await page.evaluate(() => {
    const header = document.querySelector('header') || document.querySelector('nav')
    if (!header) return { html: "No header/nav found" }
    
    return {
      html: header.innerHTML.slice(0, 2000),
      text: header.textContent?.trim().slice(0, 500),
    }
  })

  console.log("Header text content:")
  console.log(headerInfo.text || "Could not extract")
  console.log()

  // List all buttons in header
  console.log("=== All Buttons on Page ===\n")
  const buttons = await page.evaluate(() => {
    const btns = document.querySelectorAll('button, a[role="button"]')
    return Array.from(btns).map((btn, i) => ({
      index: i,
      text: (btn as HTMLElement).textContent?.trim().slice(0, 50),
      ariaLabel: (btn as HTMLElement).getAttribute('aria-label'),
      visible: btn.getBoundingClientRect().width > 0,
    })).filter(b => b.visible && (b.text || b.ariaLabel))
  })

  buttons.forEach(btn => {
    console.log(`Button ${btn.index}: "${btn.text || btn.ariaLabel}"`)
  })

  console.log("\n=== Instructions ===")
  console.log("1. Check the screenshot: reddit-debug-screenshot.png")
  console.log("2. Look for your username/avatar in the screenshot")
  console.log("3. Compare with selector results above")
  console.log("4. Send me the output so I can fix the detection")
  console.log("\nBrowser will close in 30 seconds...\n")

  await page.waitForTimeout(30000)
  await browser.close()

  console.log("✅ Debug complete\n")
}

main().catch(async (err) => {
  console.error("Debug failed:", err)
  process.exit(1)
})
