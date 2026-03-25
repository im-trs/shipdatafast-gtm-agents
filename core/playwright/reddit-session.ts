import { chromium, type BrowserContext, type Locator, type Page } from "playwright"
import * as path from "path"
import { DEFAULT_VIEWPORT, DEFAULT_USER_AGENT, PLAYWRIGHT_TIMEOUTS } from "./config"

export function getProfileDir(): string {
  return path.join(process.cwd(), ".browser-profile")
}

export async function launchRedditPersistentContext(headless = false): Promise<BrowserContext> {
  const userDataDir = getProfileDir()

  return chromium.launchPersistentContext(userDataDir, {
    headless,
    viewport: DEFAULT_VIEWPORT,
    userAgent: DEFAULT_USER_AGENT,
  })
}

/**
 * Helper to check if a locator is visible with auto-wait
 * Returns false if element doesn't appear within timeout (doesn't throw)
 */
export async function isLocatorVisible(
  locator: Locator,
  timeout: number = PLAYWRIGHT_TIMEOUTS.quickCheck
): Promise<boolean> {
  try {
    await locator.waitFor({ state: "visible", timeout })
    return true
  } catch {
    return false
  }
}

export async function detectRedditLogin(page: Page) {
  const indicators: Record<string, boolean | null> = {}

  try {
    // Check for CAPTCHA / challenge page
    const pageTitle = await page.title()
    indicators.isChallengePage = pageTitle.includes("Prove your humanity") || pageTitle.includes("captcha")

    // Use user-facing locators with auto-wait
    indicators.hasUserMenu = await isLocatorVisible(
      page.getByTestId("user-menu"),
      PLAYWRIGHT_TIMEOUTS.quickCheck
    )

    // Prefer role-based locators with .or() chaining
    indicators.hasAvatar = await isLocatorVisible(
      page.getByRole("img", { name: /avatar/i })
        .or(page.locator('img[data-testid="avatar"]'))
        .or(page.locator('img[src*="avatar"]'))
    )

    indicators.hasProfileLink = await isLocatorVisible(
      page.getByRole("link", { name: /profile|user|u\//i })
    )

    // Alternative: check for username in header
    indicators.hasUsernameInHeader = await isLocatorVisible(
      page.locator('header [data-testid="user-menu"] span')
        .or(page.locator('header button[aria-label*="user"]'))
    )

    // Check for logged-out indicators
    indicators.hasLoginButton = await isLocatorVisible(
      page.getByRole("button", { name: /log in|sign in/i })
        .or(page.getByRole("link", { name: /log in/i }))
    )

    indicators.hasSignupButton = await isLocatorVisible(
      page.getByRole("button", { name: /sign up/i })
    )
  } catch (err) {
    console.error("Login detection error:", err)
  }

  // Determine overall status
  const isLoggedIn =
    indicators.hasUserMenu ||
    indicators.hasAvatar ||
    indicators.hasProfileLink ||
    indicators.hasUsernameInHeader

  const isLoggedOut =
    indicators.hasLoginButton || indicators.hasSignupButton

  if (indicators.isChallengePage) {
    indicators.overall = "challenge_page"
  } else if (isLoggedIn) {
    indicators.overall = "logged_in"
  } else if (isLoggedOut) {
    indicators.overall = "logged_out"
  } else {
    indicators.overall = "unknown"
  }

  return indicators
}

export function logDetectionResult(indicators: Record<string, boolean | null>) {
  console.log("\n=== Login Detection Result ===")

  if (indicators.isChallengePage) {
    console.log("\n⚠️  REDDIT CAPTCHA/CHALLENGE PAGE DETECTED")
    console.log("Reddit is showing a 'Prove your humanity' or CAPTCHA page.")
    console.log("This is normal for automated browsers.")
    console.log("Complete the challenge manually if prompted.")
  }

  console.log(`User menu visible: ${indicators.hasUserMenu ? "✅" : "❌"}`)
  console.log(`Avatar visible: ${indicators.hasAvatar ? "✅" : "❌"}`)
  console.log(`Profile link visible: ${indicators.hasProfileLink ? "✅" : "❌"}`)
  console.log(`Username in header: ${indicators.hasUsernameInHeader ? "✅" : "❌"}`)
  console.log(`Login button visible: ${indicators.hasLoginButton ? "❌ (logged out)" : "✅ (not logged out)"}`)
  console.log(`Signup button visible: ${indicators.hasSignupButton ? "❌ (logged out)" : "✅ (not logged out)"}`)
  console.log(`\nOverall status: ${indicators.overall?.toUpperCase()}`)

  if (indicators.overall === "logged_in") {
    console.log("\n✅ Appears to be LOGGED IN\n")
  } else if (indicators.overall === "logged_out") {
    console.log("\n❌ Appears to be LOGGED OUT\n")
  } else if (indicators.overall === "challenge_page") {
    console.log("\n⚠️  Challenge page detected - complete CAPTCHA manually if shown\n")
  } else {
    console.log("\n⚠️  Login status unclear - inspect manually\n")
  }
}
