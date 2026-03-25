import { chromium } from "playwright"
import * as path from "path"

async function main() {
  const redditUrl = process.argv[2] || "https://www.reddit.com"
  const userDataDir = path.join(process.cwd(), ".browser-profile")

  console.log("\n=== Reddit Session Debug ===")
  console.log(`Profile directory: ${userDataDir}`)
  console.log(`Opening: ${redditUrl}`)
  console.log("\nInstructions:")
  console.log("1. If NOT logged in: log in to Reddit manually")
  console.log("2. Verify your account appears in top-right")
  console.log("3. Close browser when done\n")

  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  })

  const page = await browser.newPage()

  await page.goto(redditUrl, { waitUntil: "domcontentloaded" })

  // Check for login indicators
  await page.waitForTimeout(3000)

  const loginStatus = await page.evaluate(() => {
    const indicators: Record<string, boolean | null> = {}

    // Check for user menu/avatar (logged in)
    indicators.hasUserMenu = !!document.querySelector('[data-testid="user-menu"]')
    indicators.hasAvatar = !!document.querySelector('img[alt="User Avatar"]')
    indicators.hasProfileLink = !!document.querySelector('a[href*="/user/"]')

    // Check for login/signup buttons (NOT logged in)
    indicators.hasLoginButton = !!document.querySelector('button:has-text("Log In")')
    indicators.hasSignupButton = !!document.querySelector('button:has-text("Sign Up")')

    // Try to find username in various places
    const usernameElements = document.querySelectorAll('[data-testid="user-menu"] span, a[href*="/user/"]')
    indicators.foundUsername = usernameElements.length > 0

    return indicators
  })

  console.log("Login Status Detection:")
  console.log(JSON.stringify(loginStatus, null, 2))

  const isLoggedIn =
    loginStatus.hasUserMenu ||
    loginStatus.hasAvatar ||
    loginStatus.hasProfileLink ||
    loginStatus.foundUsername

  const isLoggedOut = loginStatus.hasLoginButton || loginStatus.hasSignupButton

  if (isLoggedIn) {
    console.log("\n✅ Appears to be LOGGED IN")
  } else if (isLoggedOut) {
    console.log("\n❌ Appears to be LOGGED OUT")
  } else {
    console.log("\n⚠️  Login status unclear - inspect manually")
  }

  console.log("\nBrowser will remain open for 60 seconds for manual inspection...")
  console.log("Or close it manually.\n")

  // Keep browser open for inspection
  await page.waitForTimeout(60000)

  await browser.close()
  console.log("Debug session complete.\n")
}

main().catch(async (err) => {
  console.error("Debug session failed:", err)
  process.exit(1)
})
