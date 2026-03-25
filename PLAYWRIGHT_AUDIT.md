# Playwright Code Audit

**Standard:** [Playwright Official Best Practices](https://playwright.dev/docs/best-practices)
**Date:** 2026-03-25
**Audited files:**
- `core/playwright/reddit-session.ts`
- `agents/hunter-reddit.ts`
- `agents/executor-reddit.ts`
- `scripts/debug-reddit-dom.ts`
- `scripts/debug-reddit-login.ts`
- `scripts/debug-reddit-session.ts`
- `scripts/debug-reddit-session-check.ts`
- `scripts/debug-reddit-thread.ts`

---

## Project Context

This project uses [`playwright`](https://www.npmjs.com/package/playwright) (`^1.58.2`) as a **browser-automation library** — not `@playwright/test` (the test framework). The distinction matters: many official best practices refer specifically to the test runner (`test()` fixtures, `expect()` assertions, `playwright.config.ts`, traces, reporters). Where a recommendation is test-runner-specific it is noted, along with the equivalent automation-context alternative.

No `playwright.config.ts` file exists in the repository.

---

## Severity Legend

| Level | Meaning |
|---|---|
| 🔴 Critical | Causes silent failures, data loss, or broken automation |
| 🟠 High | Fragile, likely to break on Reddit UI/timing changes |
| 🟡 Medium | Violates best practice, reduces maintainability |
| 🔵 Low | Style / ergonomics improvement |

---

## Findings

---

### F-01 — `page: any` Bypasses All TypeScript Safety
**Severity:** 🔴 Critical
**File:** [`agents/executor-reddit.ts`](agents/executor-reddit.ts) — function signature `postToReddit`
**Best practice:** *"TypeScript in Playwright works out of the box and gives you better IDE integrations. Your IDE will show you everything you can do and highlight when you do something wrong."*

**Current code:**
```ts
async function postToReddit(
  page: any,        // ← kills all type checking
  url: string,
  replyText: string
)
```

**Recommended fix:**
```ts
import type { Page } from "playwright"

async function postToReddit(
  page: Page,
  url: string,
  replyText: string
)
```
This restores full IDE autocompletion, catches wrong method names at compile time, and ensures the correct library's `Page` type is used throughout.

---

### F-02 — Manual `.isVisible()` Instead of Web-First Assertions
**Severity:** 🔴 Critical
**File:** [`core/playwright/reddit-session.ts`](core/playwright/reddit-session.ts) — `detectRedditLogin()`
**Best practice:** *"Don't use manual assertions that are not awaiting the expect… When using assertions such as isVisible() the test won't wait a single second, it will just check the locator is there and return immediately."*

**Current code:**
```ts
indicators.hasUserMenu = await page
  .locator('[data-testid="user-menu"]')
  .isVisible()
  .catch(() => false)
```
`.isVisible()` returns immediately with whatever the current DOM state is. If the page hasn't finished loading the logged-in header yet, it silently returns `false`, causing a false "logged out" result.

**Recommended fix:** Use `waitFor` with a short timeout instead of the pointillist `.isVisible().catch()` pattern:
```ts
async function isLocatorVisible(locator: Locator, timeout = 3000): Promise<boolean> {
  try {
    await locator.waitFor({ state: "visible", timeout })
    return true
  } catch {
    return false
  }
}

indicators.hasUserMenu = await isLocatorVisible(
  page.locator('[data-testid="user-menu"]')
)
```
This gives the DOM time to render before concluding the element is absent.

---

### F-03 — CSS Selectors and `:has-text()` Instead of Semantic Locators
**Severity:** 🟠 High
**Files:** [`core/playwright/reddit-session.ts`](core/playwright/reddit-session.ts), [`agents/executor-reddit.ts`](agents/executor-reddit.ts), [`scripts/debug-reddit-thread.ts`](scripts/debug-reddit-thread.ts), [`scripts/debug-reddit-session-check.ts`](scripts/debug-reddit-session-check.ts)
**Best practice:** *"Prefer user-facing attributes to XPath or CSS selectors… Use locators that are resilient to changes in the DOM."* The recommended hierarchy: `getByRole` → `getByText` → `getByLabel` → `getByTestId` → CSS last resort.

**Current violations (representative sample):**
```ts
// reddit-session.ts
'button:has-text("Log In"), button:has-text("Sign In"), a:has-text("Log In")'
'button:has-text("Sign Up")'
'img[alt="User Avatar"], img[data-testid="avatar"], img[src*="avatar"]'
'a[href*="/user/"], a[href*="/u/"], nav a[href*="/user/"]'

// executor-reddit.ts
'button:has-text("Comment")'
'button:has-text("Reply")'
```

**Recommended fix:**
```ts
// Role + name — most resilient
page.getByRole('button', { name: /log in/i })
page.getByRole('button', { name: /sign up/i })

// Alt text for images
page.getByAltText('User Avatar')

// data-testid via dedicated helper
page.getByTestId('user-menu')

// Chained for scoped searches
page.locator('nav').getByRole('link', { name: /\/u\//i })

// Comment / Reply buttons
page.getByRole('button', { name: /comment/i })
page.getByRole('button', { name: /reply/i })
```

---

### F-04 — `page.evaluate()` With Raw `document.querySelector()` Instead of Locators
**Severity:** 🟠 High
**Files:** [`scripts/debug-reddit-session.ts`](scripts/debug-reddit-session.ts), [`scripts/debug-reddit-thread.ts`](scripts/debug-reddit-thread.ts), [`scripts/debug-reddit-dom.ts`](scripts/debug-reddit-dom.ts)
**Best practice:** Use built-in locators which carry auto-waiting and retry-ability. `page.evaluate()` executes once, with no retry, against whatever DOM state exists at that instant.

**Current code (debug-reddit-session.ts):**
```ts
const loginStatus = await page.evaluate(() => {
  const indicators: Record<string, boolean | null> = {}
  indicators.hasUserMenu = !!document.querySelector('[data-testid="user-menu"]')
  indicators.hasAvatar  = !!document.querySelector('img[alt="User Avatar"]')
  indicators.hasProfileLink = !!document.querySelector('a[href*="/user/"]')
  // ...
  return indicators
})
```

**Recommended fix:** Replace the evaluate block with `page.locator()` calls using the `isLocatorVisible` helper from F-02. For bulk DOM introspection (as in `debug-reddit-dom.ts`) `page.evaluate()` is acceptable but should be clearly marked as a debug-only utility.

---

### F-05 — `locator.evaluateAll()` Exits Auto-Waiting Context
**Severity:** 🟠 High
**File:** [`agents/hunter-reddit.ts`](agents/hunter-reddit.ts)
**Best practice:** Locators come with auto-waiting. `evaluateAll()` synchronously snapshots the matched set and hands it into the browser JS context — if called before the page has fully rendered, zero results are returned silently.

**Current code:**
```ts
const items = await page.locator("a[href*='/comments/']").evaluateAll((anchors) => {
  // purely DOM js — no auto-wait
})
```

**Recommended fix:** Wait for at least one result to appear before extracting the full set:
```ts
// Wait until at least one post link is present
await page.locator("a[href*='/comments/']").first().waitFor({ state: "attached", timeout: 10000 })

const items = await page.locator("a[href*='/comments/']").evaluateAll((anchors) =>
  anchors
    .map(a => ({ href: a.getAttribute("href") ?? "", text: a.textContent?.trim() ?? "" }))
    .filter(r => r.href && r.text)
)
```

---

### F-06 — Hardcoded `waitForTimeout` / `sleep` Instead of Event-Based Waits
**Severity:** 🟠 High
**Files:** All Playwright files
**Best practice:** *"Never use arbitrary timeouts"* (implicit throughout the docs). `waitForTimeout` makes tests slow on fast machines and flaky on slow ones.

**Current violations:**
```ts
// hunter-reddit.ts
await page.waitForTimeout(2500)

// debug-reddit-dom.ts
await page.waitForTimeout(3000)
await page.waitForTimeout(30000)

// debug-reddit-login.ts
await page.waitForTimeout(2000)

// debug-reddit-thread.ts
await page.waitForTimeout(3000)
await page.waitForTimeout(60000)

// executor-reddit.ts (via sleep helper)
await sleep(randomDelay(2000, 3000))
await sleep(500)
await sleep(randomDelay(1000, 2000))
```

**Recommended fix:** Replace timing waits with state-based waits:
```ts
// Instead of waitForTimeout after goto:
await page.goto(url, { waitUntil: "domcontentloaded" })
await page.waitForSelector('[data-testid="user-menu"], button:text("Log In")', { timeout: 10000 })

// Instead of sleep after fill before click:
await textarea.fill(replyText)
// No wait needed — fill already completes before returning

// Instead of sleep after click:
await submitButton.click()
await page.waitForURL(/reddit\.com/, { timeout: 10000 }) // or waitForSelector for confirmation element
```
The intent of `randomDelay` for human-like behavior in the executor is understood, but at minimum replace the post-navigation `sleep` calls with proper load-state checks and keep the typing delay only where genuinely needed.

---

### F-07 — Duplicated Browser Launch Configuration (DRY Violation)
**Severity:** 🟡 Medium
**Files:** [`agents/executor-reddit.ts`](agents/executor-reddit.ts), [`scripts/debug-reddit-session.ts`](scripts/debug-reddit-session.ts), [`scripts/debug-reddit-thread.ts`](scripts/debug-reddit-thread.ts)
**Best practice:** Playwright recommends centralizing browser configuration. `launchRedditPersistentContext()` already exists in `core/playwright/reddit-session.ts` for exactly this purpose — it is not used in three of the four consumers.

**Current — repeated in 3 files:**
```ts
const userDataDir = path.join(process.cwd(), ".browser-profile")
const browser = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: { width: 1280, height: 800 },
  userAgent: "Mozilla/5.0 ...",
})
```

**Recommended fix:** Use the shared utility everywhere:
```ts
// agents/executor-reddit.ts
import { launchRedditPersistentContext } from "../core/playwright/reddit-session"
const browser = await launchRedditPersistentContext(process.env.HEADLESS !== "false")
```
And delete the three inline copies. Any variation (e.g. headless mode flag) should be a parameter on `launchRedditPersistentContext`.

---

### F-08 — `headless: false` Hardcoded in Production Execution Agent
**Severity:** 🟡 Medium
**File:** [`agents/executor-reddit.ts`](agents/executor-reddit.ts)
**Best practice:** CI/server environments cannot display a headed browser. Hardcoding `headless: false` prevents the executor from ever running in a non-desktop environment.

**Current code:**
```ts
const browser = await chromium.launchPersistentContext(userDataDir, {
  headless: false, // Show browser for debugging and manual login
```

**Recommended fix:**
```ts
const headless = process.env.PLAYWRIGHT_HEADLESS !== "false"  // default: headless
const browser = await launchRedditPersistentContext(headless)
```

---

### F-09 — Silent Error Swallowing in Selector Waterfalls
**Severity:** 🟡 Medium
**Files:** [`agents/executor-reddit.ts`](agents/executor-reddit.ts), [`scripts/debug-reddit-session-check.ts`](scripts/debug-reddit-session-check.ts), [`scripts/debug-reddit-thread.ts`](scripts/debug-reddit-thread.ts)
**Best practice:** Errors should surface. Silent catch-and-continue loops discard diagnostic information and can result in acting on the wrong element.

**Current code pattern (executor-reddit.ts):**
```ts
for (const selector of textareaSelectors) {
  try {
    textarea = await page.locator(selector).first()
    const isVisible = await textarea.isVisible()
    if (isVisible) { matchedSelector = selector; break }
    textarea = null
  } catch {
    continue   // ← swallows every error silently
  }
}
```

**Recommended fix:** Log at least a debug message on failures:
```ts
for (const selector of textareaSelectors) {
  try {
    const el = page.locator(selector).first()
    await el.waitFor({ state: "visible", timeout: 2000 })
    textarea = el
    matchedSelector = selector
    break
  } catch (err) {
    console.debug(`[selector-fallback] ${selector} not found: ${(err as Error).message}`)
  }
}
```

---

### F-10 — No `try/finally` in `debug-reddit-login.ts` (Browser Leak on Error)
**Severity:** 🟡 Medium
**File:** [`scripts/debug-reddit-login.ts`](scripts/debug-reddit-login.ts)
**Best practice:** Browser processes should always be cleaned up. If an unhandled exception occurs after the browser is opened but before `browser.close()`, the Chromium process is orphaned.

**Current code:**
```ts
const browser = await launchRedditPersistentContext(false)
const page = await browser.newPage()
// ... many await calls with no try/finally
await browser.close()   // ← never reached on error
```

**Recommended fix:**
```ts
const browser = await launchRedditPersistentContext(false)
try {
  const page = await browser.newPage()
  // ... all logic here
} finally {
  await browser.close()
}
```
`agents/hunter-reddit.ts` already does this correctly. `debug-reddit-thread.ts` also has a `try/finally`. Extend this pattern to the remaining scripts.

---

### F-11 — No Centralized Timeout Configuration
**Severity:** 🟡 Medium
**Files:** All Playwright files
**Best practice:** Centralizing timeouts via `playwright.config.ts` (or a shared constants file in this automation context) makes them easy to tune without hunting across files.

**Current state:** The value `30000` (30 s) appears hardcoded in at least 7 different places:
```ts
// repeated across: goto, locator.waitFor, page.waitForTimeout...
timeout: 30000
timeout: 60000  // hunter-reddit.ts
```

**Recommended fix:** Create `core/playwright/config.ts`:
```ts
export const PLAYWRIGHT_TIMEOUTS = {
  navigation:   30_000,
  elementWait:  10_000,
  longNavigation: 60_000,
} as const
```
Import and use `PLAYWRIGHT_TIMEOUTS.navigation` in all `goto` and `waitFor` calls.

---

### F-12 — Unnecessary `click()` Before `fill()` in Executor
**Severity:** 🔵 Low
**File:** [`agents/executor-reddit.ts`](agents/executor-reddit.ts)
**Best practice:** `fill()` focuses the element automatically before writing. A preceding `click()` is redundant and adds a potential race condition between the click event and the fill.

**Current code:**
```ts
await textarea.click()
await sleep(500)
await textarea.fill(replyText)
```

**Recommended fix:**
```ts
await textarea.fill(replyText)
```

---

### F-13 — No Trace Recording or Screenshot-on-Failure in Automation Code
**Severity:** 🔵 Low
**Files:** All Playwright files
**Best practice:** *"For CI failures, use the Playwright trace viewer… Traces are configured in the Playwright config file and are set to run on CI on the first retry of a failed test."*

The only screenshot call in the codebase is in `debug-reddit-dom.ts` (manually triggered). No traces, no automatic failure screenshots are captured in `executor-reddit.ts` or `hunter-reddit.ts`.

**Recommended fix:** Wrap the production Playwright sessions with failure-capture:
```ts
try {
  await postToReddit(page, url, replyText)
} catch (err) {
  // Capture a screenshot for diagnosis
  await page.screenshot({ path: `logs/failure-${Date.now()}.png` })
  throw err
}
```
For full trace capture (if migrating to `@playwright/test`), configure `trace: 'on-first-retry'` in `playwright.config.ts`.

---

### F-14 — No ESLint Rule for Missing `await` on Playwright Calls
**Severity:** 🔵 Low
**Best practice:** *"Use @typescript-eslint/no-floating-promises ESLint rule to make sure there are no missing awaits before the asynchronous calls to the Playwright API."*

No ESLint config (`.eslintrc`, `eslint.config.*`) found in the repository. A missing `await` on a Playwright call (e.g. `page.click(...)` without `await`) silently does nothing, which is extremely hard to debug.

**Recommended fix:** Add ESLint with the rule:
```json
// .eslintrc.json
{
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "rules": {
    "@typescript-eslint/no-floating-promises": "error"
  }
}
```
And add `"lint": "eslint agents/ core/ scripts/ --ext .ts"` to `package.json` scripts, plus run it on CI with `tsc --noEmit`.

---

### F-15 — Not Using `@playwright/test` for Any Automation Self-Testing
**Severity:** 🔵 Low
**Best practice:** *"Setup CI/CD and run your tests frequently."*

The Playwright automation code itself has no tests. There is no `playwright.config.ts`, no `.spec.ts` files, and no CI workflow (`.github/workflows/`) in the repository. The scraping and posting logic cannot be regression-tested without running against live Reddit.

**Recommended fix:** Consider:
1. Adding integration smoke-tests using `@playwright/test` with `page.route()` to mock Reddit responses (avoids hitting live Reddit).
2. A GitHub Actions workflow running `npx playwright test` on each push.
3. Installing only what's needed on CI: `npx playwright install chromium --with-deps`.

---

## Summary Table

| # | Severity | Finding | File(s) |
|---|---|---|---|
| F-01 | 🔴 Critical | `page: any` type — kills TypeScript safety | `executor-reddit.ts` |
| F-02 | 🔴 Critical | `.isVisible().catch()` returns stale DOM state | `reddit-session.ts` |
| F-03 | 🟠 High | CSS / `:has-text()` selectors instead of semantic locators | All files |
| F-04 | 🟠 High | `page.evaluate()` + `querySelector` instead of locators | `debug-*.ts` |
| F-05 | 🟠 High | `evaluateAll()` without waiting for elements | `hunter-reddit.ts` |
| F-06 | 🟠 High | Hardcoded `waitForTimeout` / `sleep()` delays | All files |
| F-07 | 🟡 Medium | Browser launch config duplicated in 3 files | `executor-reddit.ts`, `debug-reddit-session.ts`, `debug-reddit-thread.ts` |
| F-08 | 🟡 Medium | `headless: false` hardcoded in production agent | `executor-reddit.ts` |
| F-09 | 🟡 Medium | Silent error swallowing in selector waterfalls | `executor-reddit.ts`, `debug-*.ts` |
| F-10 | 🟡 Medium | No `try/finally` → browser leak on error | `debug-reddit-login.ts` |
| F-11 | 🟡 Medium | Timeout values hardcoded, not centralized | All files |
| F-12 | 🔵 Low | Redundant `click()` before `fill()` | `executor-reddit.ts` |
| F-13 | 🔵 Low | No trace recording / screenshot-on-failure | `executor-reddit.ts`, `hunter-reddit.ts` |
| F-14 | 🔵 Low | No `no-floating-promises` ESLint rule | Project-wide |
| F-15 | 🔵 Low | No Playwright test suite or CI workflow | Project-wide |

---

## Quick-Win Priority Order

1. **F-01** — Add `Page` type import to `executor-reddit.ts` (5-min fix, zero risk)
2. **F-07** — Remove 3 duplicate browser-launch blocks, route everything through `launchRedditPersistentContext()`
3. **F-08** — Make headless configurable via env var
4. **F-10** — Add `try/finally` to `debug-reddit-login.ts`
5. **F-03** — Migrate `:has-text()` selectors to `getByRole()` / `getByText()` / `getByTestId()` — start with `detectRedditLogin()` in `reddit-session.ts`
6. **F-02** — Replace `.isVisible().catch()` with `waitFor({ state: 'visible', timeout })` helper
7. **F-06** — Replace post-`goto` `waitForTimeout` calls with `waitForSelector` on a known landmark
8. **F-05** — Add `first().waitFor()` before `evaluateAll()` in `hunter-reddit.ts`
9. **F-11** — Extract timeout constants to `core/playwright/config.ts`
10. **F-14** — Add ESLint + `no-floating-promises`
