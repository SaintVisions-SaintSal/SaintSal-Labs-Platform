# Launch Checklist — SaintSal Labs Platform

---

## Phase 1 — Launch Stabilization

### 1.1 Supabase RLS Security Fix
- [ ] Enable RLS on all ~18 tables
- [ ] Add read/write policies scoped to `auth.uid()` per table
- [ ] Verify no table is left with RLS disabled in production

### 1.2 Auth Flow
- [ ] Signup (email + password, Supabase auth)
- [ ] Login (session returned and stored)
- [ ] Session persistence (reload does not log user out)
- [ ] Logout (session cleared, redirect to landing)
- [ ] Profile (user data loads correctly after login)

### 1.3 AI Chat
- [ ] SSE streaming works end-to-end
- [ ] Vertical switching (switch between AI assistants/modes)
- [ ] Conversation persistence (history saved and reloaded)
- [ ] Fallback chain (graceful degradation if primary model fails)

### 1.4 Pricing + Payments
- [ ] 5 tiers defined: Free ($0), Starter ($27), Pro ($97), Business ($297), Enterprise ($497)
- [ ] Stripe checkout flow works for each paid tier
- [ ] Metering enforced: SAL Mini / SAL Pro / SAL Max model tiers per plan
- [ ] Upgrade/downgrade handled correctly
- [ ] Webhook receives and processes Stripe events (see BUG-004)

### 1.5 Landing Page
- [ ] Page loads fast (no blocking resources)
- [ ] Zero console errors on load
- [ ] Mobile responsive (tested at 375px, 768px, 1280px)

### 1.6 Deployment
- [ ] All required env vars set in Vercel/Render
- [ ] CORS locked to allowed origins (see BUG-003)
- [ ] No API keys exposed in frontend bundle or public files
- [ ] Supabase URL and anon key are public-safe (RLS must be on first — see BUG-001)

---

## Phase 2 — Post-Launch (do not touch until Phase 1 is complete)
- Builder / IDE features
- Social Studio
- Real Estate vertical
- Medical vertical
- CorpNet
