/**
 * Playwright configuration constants
 * Centralized timeouts for consistent behavior across all scripts
 */

export const PLAYWRIGHT_TIMEOUTS = {
  /** Navigation timeout (page.goto) */
  navigation: 30_000,
  /** Element visibility wait timeout */
  elementWait: 10_000,
  /** Long navigation for slow pages */
  longNavigation: 60_000,
  /** Quick check for element presence */
  quickCheck: 3_000,
  /** Human-like delay range (min, max) */
  humanDelay: { min: 1000, max: 3000 },
} as const

/**
 * Default viewport for all browser sessions
 */
export const DEFAULT_VIEWPORT = { width: 1280, height: 800 } as const

/**
 * Default user agent for all browser sessions
 */
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
