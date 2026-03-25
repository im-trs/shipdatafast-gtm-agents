import { launchRedditPersistentContext, detectRedditLogin, logDetectionResult, getProfileDir } from "../core/playwright/reddit-session"
import * as readline from "readline"

async function main() {
  console.log("\n=== Reddit Login Bootstrap ===\n")
  console.log(`Profile directory: ${getProfileDir()}`)
  console.log("Opening Reddit in headed browser...\n")

  const browser = await launchRedditPersistentContext(false)
  const page = await browser.newPage()

  await page.goto("https://www.reddit.com", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  })

  console.log(`Current URL: ${page.url()}`)
  console.log(`Page title: ${await page.title()}\n`)

  console.log("=".repeat(50))
  console.log("INSTRUCTIONS:")
  console.log("1. If NOT logged in, log in to Reddit manually")
  console.log("2. Wait for page to fully load after login")
  console.log("3. Press ENTER in this terminal when finished")
  console.log("=".repeat(50))
  console.log()

  // Wait for user to press ENTER
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  await new Promise<void>((resolve) => {
    rl.question("", () => {
      resolve()
    })
  })

  rl.close()

  // Detect login status
  console.log("\nDetecting login status...\n")
  const indicators = await detectRedditLogin(page)
  logDetectionResult(indicators)

  // Also navigate to a different page to bypass CAPTCHA
  console.log("Navigating to r/reddit to verify session...")
  await page.goto("https://www.reddit.com/r/reddit/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  })
  await page.waitForTimeout(2000)
  
  console.log(`Current URL: ${page.url()}`)
  console.log(`Page title: ${await page.title()}\n`)
  
  const indicators2 = await detectRedditLogin(page)
  logDetectionResult(indicators2)

  // Save current state
  console.log("Closing browser (session will be persisted)...\n")
  await browser.close()

  console.log("✅ Login bootstrap complete.")
  console.log("Next step: run 'pnpm debug:reddit:check' to verify session persists\n")
}

main().catch(async (err) => {
  console.error("Login bootstrap failed:", err)
  process.exit(1)
})
