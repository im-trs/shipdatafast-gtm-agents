# Playwright Execution Layer Audit
**Date:** 2026-03-25  
**Scope:** Reddit executor, Playwright setup, browser persistence, safe mode

---

## 1. AUDIT SUMMARY

### What Works ✅

1. **Playwright Initialization**
   - Uses `chromium.launchPersistentContext()` correctly
   - Profile path: `./.browser-profile` (absolute path from `process.cwd()`)
   - Browser profile persists across runs (verified: directory exists with cookies, sessions)
   - Headless: false (correct for manual login)

2. **Browser Profile Persistence**
   - `.browser-profile/` directory created and populated
   - Contains: `Default/`, `Cookies`, `Local State`, `Network Persistent State`
   - Gitignored correctly in `.gitignore`
   - Session cookies persist between runs

3. **Safe Mode / Live Mode Split**
   - `REDDIT_EXECUTION_MODE=safe` (default) - no real posts
   - `REDDIT_EXECUTION_MODE=live` - real posting
   - Clear console warnings about mode

4. **Queue Integration**
   - Loads from `execution_queue` table correctly
   - Filters by `platform = 'reddit'`
   - Status transitions: `queued` → `running` → `posted` (live) or back to `queued` (safe)

5. **Telemetry**
   - Logs: `run_started`, `executor_reddit_started`, `execution_posted`/`execution_simulated`, `run_completed`
   - Includes queue_id, mode, lead_id

6. **Error Handling**
   - Try/catch around each queue item
   - Failed items marked with `markExecutionFailed()`
   - Continues processing remaining items

### What Is Fake / Unsafe / Incomplete ❌

1. **CRITICAL BUG (FIXED)**
   - **Problem:** Safe mode was marking queue items as `posted` and updating lead status to `posted`
   - **Risk:** Database showed "posted" even though nothing was actually posted
   - **Fix:** Safe mode now:
     - Leaves queue items as `queued`
     - Does NOT update lead status
     - Logs interaction with `outcome = 'simulated'`
     - Uses telemetry `execution_simulated` instead of `execution_posted`

2. **Reddit Login Model**
   - **NOT automated** - depends on manual login
   - This is BY DESIGN and acceptable
   - User must manually log in via debug script or first live run
   - Session persists via browser profile

3. **Selector Robustness**
   - Uses layered selector strategy (good)
   - Textarea selectors: 4 fallbacks
   - Submit button selectors: 4 fallbacks
   - **BUT:** No verification that comment actually posted successfully
   - **RISK:** Assumes success after button click - Reddit may have CAPTCHA, rate limiting, or async failures

4. **No Post Verification**
   - Does NOT check if comment actually appears on page
   - Does NOT capture permalink or comment ID
   - `externalId` is generated client-side: `reddit_${timestamp}_${url.slice(-8)}`
   - **This is NOT a real Reddit comment ID**

5. **Rate Limiting**
   - Has random delay: 5-15 seconds between posts (live mode)
   - **BUT:** No daily limit enforcement
   - **BUT:** No account age / karma considerations
   - **BUT:** No CAPTCHA detection

6. **Duplicate Protection**
   - Queue-based (each lead queued once)
   - **BUT:** No check if comment already exists on thread
   - **BUT:** Can re-queue same lead multiple times

---

## 2. LOGIN MODEL

### How It Works Today

```typescript
const userDataDir = path.join(process.cwd(), ".browser-profile")

const browser = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: { width: 1280, height: 800 },
  userAgent: "Mozilla/5.0...",
})
```

**Key Points:**

1. **Manual Login Required**
   - Code does NOT automate login
   - User must manually log in to Reddit
   - First run: open debug script, log in, close browser
   - Subsequent runs: cookies persist

2. **Session Persistence**
   - Profile path: `./.browser-profile`
   - Cookies stored in: `.browser-profile/Default/Cookies`
   - Persists across script runs
   - Survives computer restarts

3. **No Profile Wipe**
   - Code never deletes `.browser-profile/`
   - Gitignored (won't commit accidentally)
   - **Safe for long-term use**

4. **Login Verification**
   - Debug script available: `pnpm debug:reddit:session`
   - Checks for: user menu, avatar, profile link
   - Reports login status to console

### Is This Acceptable?

**YES** - for MVP / early production:
- Manual login is more robust than automated (avoids CAPTCHA triggers)
- Persistent sessions mean login once, use many times
- Lower risk of account bans

**NO** - for scale:
- Requires human intervention for each new account
- Session expiration requires manual re-login
- No multi-account support

---

## 3. CODE CHANGES

### Files Changed

1. **agents/executor-reddit.ts**
   - Fixed safe mode to NOT mutate queue status
   - Added selector match logging
   - Added page title / URL logging
   - Added login redirect detection
   - Added available textarea debugging on failure

2. **scripts/run-executor-reddit.ts**
   - No changes (already correct)

3. **scripts/debug-reddit-session.ts** (NEW)
   - Opens persistent browser to Reddit
   - Detects login status automatically
   - Keeps browser open for 60 seconds
   - Reports: user menu, avatar, profile link presence

4. **scripts/debug-reddit-thread.ts** (NEW)
   - Opens specific thread URL
   - Tests all textarea selectors
   - Tests all submit button selectors
   - Reports which selectors match
   - Lists all available form elements

5. **package.json**
   - Added: `debug:reddit:session`
   - Added: `debug:reddit:thread`

---

## 4. TEST COMMANDS

### 1. Session Debug (Verify Login)

```bash
# Opens Reddit with persistent profile
# Shows login status
# Keep browser open for 60 seconds
pnpm debug:reddit:session
```

**Expected Output:**
```
=== Reddit Session Debug ===
Profile directory: /path/to/project/.browser-profile
Opening: https://www.reddit.com

Login Status Detection:
{
  "hasUserMenu": true,
  "hasAvatar": true,
  ...
}

✅ Appears to be LOGGED IN
```

---

### 2. Thread UI Debug (Verify Selectors)

```bash
# Test specific thread
pnpm debug:reddit:thread https://www.reddit.com/r/Accounting/comments/abc123/test/
```

**Expected Output:**
```
=== Reddit Thread UI Debug ===
Thread URL: https://...
Page title: "Test Post : r/Accounting"
Login status: ✅ Logged in

--- Testing Textarea Selectors ---
textarea[placeholder*="comment"]: ✅ FOUND (visible)
...

--- Testing Submit Button Selectors ---
button:has-text("Comment"): ✅ FOUND (visible)
```

---

### 3. Safe Mode Test (No Real Posts)

```bash
# Process queue without posting
REDDIT_EXECUTION_MODE=safe pnpm agent:execute:reddit 5
```

**Expected Output:**
```
Execution mode: SAFE
⚠️  SAFE MODE: No real posts will be made
[SAFE MODE] Would post to: https://reddit.com/...
[SAFE MODE] Reply text: ...

Run complete: 0 posted, 0 failed, 3 simulated (safe mode)
```

**Verify Queue Unchanged:**
```bash
docker exec postgres-db psql -U postgres -d shipdatafast_gtm -c \
  "SELECT status, COUNT(*) FROM execution_queue WHERE platform='reddit' GROUP BY status;"
```

Expected:
```
 status | count 
--------+-------
 queued |     4
```

---

### 4. Live Mode Test (Real Posts)

```bash
# WARNING: Will post real comments to Reddit
REDDIT_EXECUTION_MODE=live pnpm agent:execute:reddit 2
```

**Expected Output:**
```
Execution mode: LIVE
⚠️  LIVE MODE: Real Reddit posts will be made
[LIVE] Navigating to: https://reddit.com/...
[LIVE] Page title: "..."
[LIVE] Found textarea with selector: textarea[placeholder*="comment"]
[LIVE] Found submit button with selector: button:has-text("Comment")

Run complete: 2 posted, 0 failed, 0 simulated (live mode)
```

---

## 5. PRODUCTION READINESS VERDICT

### **READY FOR LIMITED LIVE REDDIT TESTING**

**Conditions:**
1. ✅ Manual login completed via debug script
2. ✅ Session verified (debug script shows "LOGGED IN")
3. ✅ Safe mode tested (queue unchanged after run)
4. ✅ Thread UI debug shows selectors working
5. ⚠️ Start with 1-2 posts maximum
6. ⚠️ Monitor Reddit account for CAPTCHA / rate limiting

**NOT Ready For:**
- ❌ High-volume posting (>10 posts/day)
- ❌ Unattended operation
- ❌ Multi-account scaling
- ❌ Mission-critical production without monitoring

---

## 6. WHAT IS MISSING / FRAGILE

### Missing Features

1. **Post Success Verification**
   - Should check if comment appears on page after submit
   - Should capture actual Reddit comment permalink
   - Should verify comment not removed by spam filter

2. **CAPTCHA Detection**
   - No detection if Reddit shows CAPTCHA
   - Will fail silently or mark as "posted" incorrectly

3. **Rate Limiting Intelligence**
   - Fixed 5-15 second delays
   - No adaptive backoff on failures
   - No daily limit enforcement

4. **Account Health Monitoring**
   - No karma checking
   - No account age verification
   - No shadowban detection

### Fragile Points

1. **Selector Dependencies**
   - Reddit UI changes could break selectors
   - Multiple fallbacks help, but not future-proof

2. **Session Expiration**
   - No automatic re-login
   - User must notice and re-run debug script

3. **Thread URL Validity**
   - Assumes lead.url is valid Reddit thread
   - No 404 / deleted thread handling

4. **Reply Text Length**
   - No validation before posting
   - Reddit has minimum character limits sometimes

---

## 7. PLATFORM COVERAGE AUDIT

### Current Production Loop Needs

| Platform | Needed Now? | Status |
|----------|-------------|--------|
| **Reddit** | ✅ YES | **Implemented (this audit)** |
| LinkedIn | ❌ Not yet | Not implemented |
| Job Boards | ❌ Scraping only | Hunter scrapes, no posting |
| DMs / Direct Messages | ❌ Not yet | Not implemented |
| Email | ❌ Not yet | Not implemented |
| Twitter/X | ❌ Not yet | Not implemented |

### Playwright Prepared For

- ✅ Reddit (executor-reddit.ts)
- ✅ Reddit search (hunter-reddit.ts)
- ❌ LinkedIn (no code exists)
- ❌ Job board posting (only scraping in hunter-jobboards.ts)
- ❌ Any other platform

**Conclusion:** Only Reddit is production-ready for execution. Other platforms need separate executors built when needed.

---

## 8. RECOMMENDED NEXT STEPS

1. **Test Live Mode (Low Volume)**
   ```bash
   # 1. Verify login
   pnpm debug:reddit:session

   # 2. Test with 1 post
   REDDIT_EXECUTION_MODE=live pnpm agent:execute:reddit 1

   # 3. Check Reddit account for posted comment
   # 4. Verify database updated correctly
   ```

2. **Add Post Verification (If Step 1 succeeds)**
   - Wait for comment to appear
   - Capture actual Reddit comment ID
   - Store real permalink in metadata

3. **Add CAPTCHA Detection**
   - Check for CAPTCHA elements after submit
   - Fail gracefully with clear error
   - Alert user to manual intervention

4. **Add Daily Limits**
   - Environment variable: `REDDIT_MAX_POSTS_PER_DAY=10`
   - Track in DB
   - Skip execution if limit reached

---

## 9. FINAL VERDICT

**Current State:** READY FOR LIMITED LIVE REDDIT TESTING

**Strengths:**
- ✅ Playwright working correctly
- ✅ Browser profile persistence working
- ✅ Safe mode fixed (no longer lies about posting)
- ✅ Debug tools available
- ✅ Logging and telemetry in place
- ✅ Error handling prevents crashes

**Weaknesses:**
- ⚠️ No post success verification
- ⚠️ No CAPTCHA detection
- ⚠️ Manual login required
- ⚠️ No rate limit intelligence

**Recommendation:**
Proceed with **controlled live testing** (1-2 posts) to validate real-world behavior. Monitor account closely. Add post verification before scaling.
