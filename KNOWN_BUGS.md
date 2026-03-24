# Known Bugs — SaintSal Labs Platform

## BUG-001 — Supabase RLS Not Enabled (SECURITY CRITICAL)
- **Status:** Migration written — needs to be applied
- **Severity:** Critical
- **Fix:** Run `migrations/rls_phase1.sql` in Supabase SQL Editor (covers all 22 tables).

## BUG-002 — Frontend Empty Base URL
- **Status:** Fixed — commit `c632649` on `launch-hardening`
- **Severity:** High
- **Fix:** `var API` now auto-detects: `localhost:8000` in dev, same-origin in production.

## BUG-003 — CORS Wildcard in vercel.json
- **Status:** Fixed — commit `c4f9e0e` on `launch-hardening` (saintsallabs-v2)
- **Severity:** High
- **Fix:** Wildcard removed from `vercel.json`. Next.js middleware now dynamically sets
  `Access-Control-Allow-Origin` only for allowed origins (saintsallabs.com, saintsal.ai).

## BUG-004 — Stripe Webhook Not Configured
- **Status:** Handler exists — registration required
- **Severity:** High
- **Description:** Webhook route exists at `/api/webhooks/stripe` and handles all events.
- **ACTION NEEDED:** Register `https://saintsallabs.com/api/webhooks/stripe` in Stripe Dashboard
  → Developers → Webhooks. Set `STRIPE_WEBHOOK_SECRET` env var in Vercel.

## BUG-005 — plan_tier Column Mismatch (NEW — FOUND DURING AUDIT)
- **Status:** Fixed — commit `a96c660` on `launch-hardening` (saintsallabs-v2)
- **Severity:** Critical
- **Description:** `use-auth.ts` was reading `data.plan_tier` but DB column is `tier`.
  All paying users showed as free tier — metering and model access were wrong.
- **Fix:** Now reads `data.tier ?? data.plan_tier` with fallback for compatibility.
