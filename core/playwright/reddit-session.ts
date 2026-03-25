import { chromium } from "playwright"
import * as path from "path"

export function getProfileDir(): string {
  return path.join(process.cwd(), ".browser-profile")
}

export async function launchRedditPersistentContext(headless = false) {
  const userDataDir = getProfileDir()

  return chromium.launchPersistentContext(userDataDir, {
    headless,
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  })
}

export async function detectRedditLogin(page: any) {
  const indicators: Record<string, boolean | null> = {}

  try {
    // Check for logged-in indicators
    indicators.hasUserMenu = await page
      .locator('[data-testid="user-menu"]')
      .isVisible()
      .catch(() => false)

    indicators.hasAvatar = await page
      .locator('img[alt="User Avatar"], img[data-testid="avatar"]')
      .isVisible()
      .catch(() => false)

    indicators.hasProfileLink = await page
      .locator('a[href*="/user/"], a[href*="/u/"]')
      .isVisible()
      .catch(() => false)

    // Check for logged-out indicators
    indicators.hasLoginButton = await page
      .locator('button:has-text("Log In"), button:has-text("Sign In")')
      .isVisible()
      .catch(() => false)

    indicators.hasSignupButton = await page
      .locator('button:has-text("Sign Up")')
      .isVisible()
      .catch(() => false)
  } catch (err) {
    console.error("Login detection error:", err)
  }

  // Determine overall status
  const isLoggedIn =
    indicators.hasUserMenu ||
    indicators.hasAvatar ||
    indicators.hasProfileLink

  const isLoggedOut =
    indicators.hasLoginButton || indicators.hasSignupButton

  indicators.overall = isLoggedIn ? "logged_in" : isLoggedOut ? "logged_out" : "unknown"

  return indicators
}

export function logDetectionResult(indicators: Record<string, boolean | null>) {
  console.log("\n=== Login Detection Result ===")
  console.log(`User menu visible: ${indicators.hasUserMenu ? "✅" : "❌"}`)
  console.log(`Avatar visible: ${indicators.hasAvatar ? "✅" : "❌"}`)
  console.log(`Profile link visible: ${indicators.hasProfileLink ? "✅" : "❌"}`)
  console.log(`Login button visible: ${indicators.hasLoginButton ? "❌ (bad)" : "✅ (good)"}`)
  console.log(`Signup button visible: ${indicators.hasSignupButton ? "❌ (bad)" : "✅ (good)"}`)
  console.log(`\nOverall status: ${indicators.overall?.toUpperCase()}`)

  if (indicators.overall === "logged_in") {
    console.log("\n✅ Appears to be LOGGED IN\n")
  } else if (indicators.overall === "logged_out") {
    console.log("\n❌ Appears to be LOGGED OUT\n")
  } else {
    console.log("\n⚠️  Login status unclear - inspect manually\n")
  }
}
