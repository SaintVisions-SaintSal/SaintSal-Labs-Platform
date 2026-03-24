# Known Bugs — SaintSal Labs Platform

## BUG-001 — Supabase RLS Not Enabled (SECURITY CRITICAL)
- **Status:** Open
- **Severity:** Critical
- **Description:** Row Level Security is not enabled on approximately 18 Supabase tables. Any authenticated user can read/write all rows.
- **Fix:** Enable RLS on all tables and add appropriate policies per table.

## BUG-002 — Frontend Empty Base URL
- **Status:** Open
- **Severity:** High
- **Description:** `var API = ""` in frontend — empty string base URL causes all API calls to hit the wrong endpoint in production.
- **Fix:** Set `API` to the correct production API base URL (e.g. `https://api.saintsallabs.com`).

## BUG-003 — CORS Wildcard in vercel.json
- **Status:** Open
- **Severity:** High
- **Description:** Node.js API gateway `vercel.json` has `Access-Control-Allow-Origin: *` which allows any origin to call the API.
- **Fix:** Lock CORS to specific origins: `https://saintsallabs.com`, `https://www.saintsallabs.com`, `https://saintsal.ai`, `https://www.saintsal.ai`.

## BUG-004 — Stripe Webhook Not Configured
- **Status:** Open
- **Severity:** High
- **Description:** Stripe webhook endpoint may not be configured — subscription events (payment success, cancellation, etc.) may not be processed.
- **Fix:** Verify webhook endpoint is registered in Stripe dashboard and `STRIPE_WEBHOOK_SECRET` env var is set.
