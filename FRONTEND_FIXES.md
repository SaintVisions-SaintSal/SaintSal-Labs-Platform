# SaintSal Labs — Frontend Fixes
**Applied:** Friday, March 06, 2026  
**Script:** `upgrade_frontend_harden.py`  
**Files modified:** `app.js`, `index.html`, `style.css`

---

## Summary of Changes

### FIX #1 — Medical Nav Broken (`app.js`)
**Bug:** In `switchVertical()`, the `var grid` and `var engagement` declarations were inside the `else if (realestate)` block (line ~146), but the `if (medical)` block above tried to use them before they were assigned. JavaScript `var` hoists the *declaration* but not the *assignment*, so both variables were `undefined` when the medical branch ran.

**Fix:** Moved both `var grid = document.getElementById('discoverGrid')` and `var engagement = document.getElementById('engagementSection')` to just *before* the `if/else if` chain. Removed the duplicate declarations from inside the `else if` block.

**Location:** `switchVertical()` function, lines ~140–160

---

### FIX #6 — Account Profile Page (`app.js`)
**Problem:** Clicking Account in the sidebar only showed a login modal for all users, with no real profile page for authenticated users.

**Fix:** Added three new functions:
- `renderAccountProfile()` — renders a full profile page (usage stats, billing, settings, sign-out) for logged-in users; renders a guest prompt with Sign In / Create Account buttons for anonymous users. Reads from `window.__salUser`.
- `fetchAccountUsage()` — hits `/api/auth/usage` to refresh usage card data after render.
- `setDefaultTier(tier)` — persists compute tier preference to `localStorage`.

Also updated `handleLogout()` to call `renderAccountProfile()` after clearing the session so the view refreshes in place.

Wired `setView()` so that when `view === 'account'` is activated, it syncs `window.__salUser = currentUser` and calls `setTimeout(renderAccountProfile, 50)`.

**Locations:** New functions inserted after `handleLogout()` (~line 2423); `setView()` account branch added at ~line 58.

---

### FIX #7 — SEO Meta Tags (`index.html`)
**Added after the existing `<meta name="description">` tag:**
- Open Graph tags: `og:type`, `og:url`, `og:title`, `og:description`, `og:image`, `og:site_name`
- Twitter Card tags: `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`
- `<link rel="canonical" href="https://saintsallabs.com">`
- JSON-LD `SoftwareApplication` structured data block (Schema.org)

**Location:** `index.html` `<head>`, line ~33

---

### FIX #10 — Onboarding Tour (`app.js`)
**Added:** `showOnboardingTour()` — a first-run modal overlay with a 6-step guided tour. Features:
- Progress dots (pending / active / done states)
- Step content: Welcome, 7 Verticals, SAL Studio, Medical Intelligence, 88 Connectors, You're Ready
- Back / Next / Get Started / Skip controls
- Fade-in / fade-out animation on dismiss
- Persists completion via `localStorage.setItem('sal_onboarding_done', '1')` — never shows again after dismissed

`window.onboardNext`, `window.onboardPrev`, and `window.onboardDone` exposed as globals for inline `onclick` handlers.

Triggered via `document.addEventListener('DOMContentLoaded', ...)` with a 1-second delay so it appears after the page loads.

**Location:** Appended to end of `app.js` (~line 3062)

---

### FIX #11 — AI Fallback Chains (`app.js`)
**Added two helper functions** inserted immediately before `sendMessage()`:
- `retryWithFallback(query, vertical)` — cycles through `AI_FALLBACK_CHAIN = ['grok-4', 'claude-sonnet-4-6', 'gpt-4o', 'gemini-2.0-flash']` using `currentModelIndex`. Shows a system message ("Switching to {model}...") and re-calls `sendMessage()`. After exhausting all models, resets index and shows a final "all models unavailable" message.
- `appendSystemMessage(msg)` — injects a styled `.system-message` div into the chat area with a lightning bolt icon.

**Enhanced** the `.catch()` block in the SSE fetch path of `sendMessage()` to check if the error message includes `'timeout'`, `'500'`, or `'503'` and call `retryWithFallback(query, currentVertical)` instead of showing a static error.

**Location:** Helpers at ~line 506; catch enhancement at ~line 675

---

### CSS Additions (`style.css`)
**Appended to end of style.css:**

| Block | Classes added |
|---|---|
| Account Profile | `.account-guest`, `.account-guest-icon`, `.account-guest-title`, `.account-guest-sub`, `.account-guest-actions`, `.account-profile`, `.account-header`, `.account-avatar`, `.account-name`, `.account-plan-badge`, `.account-section`, `.account-section-title`, `.account-usage-grid`, `.account-usage-card`, `.account-usage-value`, `.account-usage-label`, `.account-billing`, `.account-billing-row`, `.account-settings`, `.account-setting-row`, `.account-select`, `.btn-outline-sm`, `.btn-outline-danger`, `.account-danger` |
| Onboarding Tour | `.onboard-overlay`, `.onboard-card`, `.onboard-progress`, `.onboard-dot`, `.onboard-icon`, `.onboard-title`, `.onboard-desc`, `.onboard-actions`, `.onboard-btn-next`, `.onboard-btn-back`, `.onboard-skip` |
| System Messages | `.system-message`, `.system-msg-icon` |
| Animations | `@keyframes fadeIn`, `@keyframes fadeOut` |

---

## File Size Changes

| File | Before | After |
|---|---|---|
| `app.js` | 145,129 chars / 2,879 lines | 155,405 chars / 3,114 lines |
| `index.html` | 104,193 chars / 1,229 lines | 105,814 chars / 1,328 lines |
| `style.css` | 149,466 chars / 3,328 lines | 154,730 chars / 3,552 lines |

---

## Notes
- The upgrade script is **idempotent** for FIX #10 and the CSS additions — it checks `if 'showOnboardingTour' not in app_js` and `if 'onboard-overlay' not in style_css` before appending, so re-running will not duplicate those blocks.
- FIX #1, #6, #7, and #11 use exact string replacement — running twice would fail to find the already-replaced pattern and print a warning, leaving the file unchanged.
- The `handleLogout` function that existed in `app.js` (line ~2377) was preserved; the new `handleLogout` inside the `renderAccountProfile` section is a *separate* version designed for use by the profile page's Sign Out button — both ultimately call `clearSession()` / `fetch logout`.
