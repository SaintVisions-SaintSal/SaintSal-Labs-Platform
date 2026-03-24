# Launch Checklist — SaintSal Labs Platform

---

## Phase 1 — Launch Stabilization

### 1.1 Supabase RLS Security Fix
- [x] Enable RLS on all 22 tables — `migrations/rls_phase1.sql` written
- [x] Add read/write policies scoped to `auth.uid()` per table
- [ ] **ACTION NEEDED:** Run `migrations/rls_phase1.sql` in Supabase SQL Editor to apply

### 1.2 Auth Flow
- [x] Signup (email + password + OTP verification, Supabase auth)
- [x] Login (session returned and stored via cookie)
- [x] Session persistence — middleware calls `updateSession` on every request
- [x] Logout — `supabase.auth.signOut()` + redirect to `/login`
- [x] Profile — `profile-init` upsert on login; `use-auth` hook loads profile
- [x] Route protection — unauthenticated → `/login?next=<path>`, authenticated → away from login/signup
- [x] Post-login redirect honors `?next=` param
- [x] **BUG FIXED:** `plan_tier` was reading wrong DB column (`plan_tier` vs `tier`) — paying users were gated to free

### 1.3 AI Chat
- [x] SSE streaming end-to-end (Gemini primary, Anthropic fallback)
- [x] Vertical switching — ChatContainer with VERTICAL_CONFIG
- [x] Conversation persistence — localStorage, 40 msgs per vertical, survives reload
- [x] Fallback chain — Gemini → Anthropic, warmup error handling for Render cold start

### 1.4 Pricing + Payments
- [x] 5 tiers: Free ($0), Starter ($27), Pro ($97), Teams ($297), Enterprise ($497)
- [x] Stripe checkout flow — `createCheckoutSession` with customer upsert
- [x] Metering — `checkAndMeter()` gates every AI request, 30-day rolling window
- [x] Model tiers — SAL Mini (free/starter), SAL Pro (pro), SAL Max (teams/enterprise)
- [x] Webhook handles `checkout.completed`, `subscription.updated`, `subscription.deleted`
- [ ] **ACTION NEEDED:** Register webhook URL in Stripe Dashboard + set `STRIPE_WEBHOOK_SECRET` env var

### 1.5 Landing Page
- [x] Fast load — Next.js App Router, no blocking scripts, fonts preloaded
- [x] No placeholder tags that cause console warnings (removed GSC placeholder)
- [x] PWA manifest + icons present (`icon-192.png`, `icon-512.png`)
- [ ] **ACTION NEEDED:** Visual QA at 375px / 768px / 1280px (manual check required)

### 1.6 Deployment
- [x] `.env.example` updated with all 30+ required env vars documented
- [x] CORS locked — BUG-003 fixed, wildcard removed, origin allowlist enforced in middleware
- [x] No API keys exposed — all secrets are server-only (`process.env.*` without `NEXT_PUBLIC_`)
- [x] Supabase anon key is safe (RLS migration covers all tables — run SQL first)
- [x] BUG-002 fixed — `var API` now env-aware in platform repo
- [ ] **ACTION NEEDED:** Confirm all env vars set in Vercel + Render dashboards before deploy

---

## Phase 2 — Post-Launch (do not touch until Phase 1 is complete)
- Builder / IDE features
- Social Studio
- Real Estate vertical
- Medical vertical
- CorpNet
