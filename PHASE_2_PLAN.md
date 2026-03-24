# PHASE 2 PLAN — SaintSal Labs Platform
> Audit date: 2026-03-24 | Do not touch until Phase 1 is fully deployed

---

## Summary Scorecard

| Feature | Readiness | Blocking Issues |
|---------|-----------|-----------------|
| Real Estate | 60% | `RENTCAST_API_KEY` not set, distressed data is mock |
| Business Formation (CorpNet) | 40% | Staging API only, name check stub, orders not persisted |
| Domain Search | 50% | Purchase flow incomplete, DNS/WHOIS stub |
| Builder IDE | 50% | Projects not persisted to DB, no code sandbox |
| Social Studio | 40% | Video generation broken (storyboard only), gallery not persisted |
| Medical | 80% | No blocking issues — rate limiting + clinical tools stub |
| Career Suite | 60% | Job tracker not persisted, no PDF resume support |

---

## 1. Real Estate Vertical

### Files
- `server.py` — `/api/realestate/*` (lines ~2384–2677, 10733–10808, 12152)
- `realestate-view.js` — full frontend (5 tabs: Search, Comps, Distressed, Market, Deal Analyzer)
- `realestate.css`

### Endpoints
| Method | Path | Data Source | Status |
|--------|------|-------------|--------|
| GET | `/api/realestate/search` | RentCast live | ✅ Real when key set |
| GET | `/api/realestate/value` | RentCast AVM | ✅ Real when key set |
| GET | `/api/realestate/rent` | RentCast | ✅ Real when key set |
| GET | `/api/realestate/listings/sale` | RentCast | ✅ Real when key set |
| GET | `/api/realestate/listings/rental` | RentCast | ✅ Real when key set |
| GET | `/api/realestate/market` | RentCast | ✅ Real when key set |
| GET | `/api/realestate/distressed/summary` | RentCast + hardcoded fallback | ⚠️ Partial |
| GET | `/api/realestate/distressed/{category}` | Hardcoded 12 demo properties | ❌ Mock |
| GET | `/api/realestate/deal-analysis` | Calculated | ✅ Works |
| GET | `/api/realestate/portfolio` | Supabase | ⚠️ Stub only |

### Required Env Vars
- `RENTCAST_API_KEY` — **CRITICAL**, nothing real works without it

### Broken / Missing
1. Distressed categories (bankruptcy, cash_buyer, notes_due, off_market) have no RentCast mapping — always return 12 hardcoded Houston/Phoenix/Atlanta demo properties
2. Portfolio endpoint is a stub — no real implementation
3. No pagination on any listing endpoint
4. No caching — every search hits RentCast API fresh (costs money per call)
5. Property images in demo data use Unsplash URLs — will 404 eventually

### To Make Production-Ready
- [ ] Set `RENTCAST_API_KEY` in Render env vars
- [ ] Implement real distressed property search or source a proper data feed
- [ ] Persist portfolio to `re_portfolio` Supabase table (schema exists, endpoint is a stub)
- [ ] Add response caching (Redis or simple TTL cache) for market data
- [ ] Add pagination to listing endpoints

---

## 2. Business Formation (CorpNet)

### Files
- `server.py` — `/api/corpnet/*` (lines ~1783–2143)
- `connectors-view.js` — links into formation UI

### Endpoints
| Method | Path | Data Source | Status |
|--------|------|-------------|--------|
| GET | `/api/corpnet/entity-types` | Hardcoded | ⚠️ Mock |
| GET | `/api/corpnet/states` | Hardcoded filing fees | ⚠️ Mock |
| GET | `/api/corpnet/packages` | CorpNet staging API + fallback | ⚠️ Staging only |
| GET | `/api/corpnet/name-check` | Returns `null` | ❌ Not implemented |
| POST | `/api/corpnet/formation` | CorpNet staging API + in-memory | ⚠️ Staging + no DB |
| GET | `/api/corpnet/orders` | 2 demo orders + in-memory | ❌ Mock |
| POST | `/api/corpnet/checkout` | Stripe live | ✅ Works |
| GET | `/api/corpnet/compliance/{state}` | Hardcoded text | ⚠️ Mock |

### Required Env Vars
- `CORPNET_DATA_API_KEY` — staging only (`api.staging24.corpnet.com`)
- `CORPNET_API_KEY` — staging only
- `STRIPE_SECRET_KEY` — checkout works

### Broken / Missing
1. **CorpNet API is pointed at staging** (`api.staging24.corpnet.com`) — not production
2. **Name availability check returns null** — endpoint is a stub
3. **Formation orders stored in-memory** — lost every server restart
4. **Orders not in Supabase** — no `launch_pad_orders` persistence wired up
5. **Stripe prices hardcoded** — only 3 packages × 2 entity types; nonprofits/partnerships not supported
6. **No order status updates** — once submitted, user never gets progress updates
7. **Filing fees hardcoded from 2024** — may be stale

### To Make Production-Ready
- [ ] Get production CorpNet API credentials and update base URL
- [ ] Implement real name availability check
- [ ] Persist orders to `launch_pad_orders` Supabase table
- [ ] Add Stripe webhook handler for formation payment confirmation
- [ ] Add email notification when order status changes
- [ ] Expand Stripe price IDs to cover all entity types

---

## 3. Domain Search

### Files
- `server.py` — `/api/domains/*` and `/api/godaddy/*` (lines ~1424–1578, 5262–5533, 6514–6624)
- `domains-view.js` — 5 tabs (Search, My Domains, SSL, DNS Manager, Transfer)

### Endpoints
| Method | Path | Data Source | Status |
|--------|------|-------------|--------|
| GET | `/api/domains/search` | GoDaddy API | ✅ Real when keys set |
| GET | `/api/domains/tlds` | GoDaddy API | ✅ Real when keys set |
| POST | `/api/domains/purchase` | Redirect to storefront | ⚠️ No checkout |
| GET | `/api/godaddy/storefront` | Hardcoded config | ⚠️ Config only |
| GET | `/api/domains/managed` | Demo data | ❌ Mock |
| GET | `/api/domains/dns/{domain}` | Not implemented | ❌ Stub |
| GET | `/api/domains/whois/{domain}` | Not implemented | ❌ Stub |
| POST | `/api/godaddy/purchase` | GoDaddy API | ⚠️ Needs keys |
| GET | `/api/godaddy/available/{domain}` | GoDaddy API | ✅ Real when keys set |

### Required Env Vars
- `GODADDY_API_KEY` — **CRITICAL**
- `GODADDY_API_SECRET` — **CRITICAL**
- `GODADDY_PL_ID` — Private Label reseller ID
- `GODADDY_STOREFRONT_URL` — Reseller storefront URL

### Broken / Missing
1. **Purchase flow incomplete** — `/api/domains/purchase` redirects to GoDaddy storefront without handling payment or confirmation
2. **Managed domains are demo-only** — hardcoded 5 domains (hacpglobal.ai, saintsallabs.com, etc.)
3. **DNS management is a stub** — no actual DNS record CRUD
4. **WHOIS is a stub** — returns nothing
5. **No domain expiry tracking** — no renewal reminders
6. **SSL tab is UI-only** — no backend integration

### To Make Production-Ready
- [ ] Set all 4 GoDaddy env vars in Render
- [ ] Implement Stripe checkout for domain purchase (vs. just redirecting to GoDaddy)
- [ ] Persist user domains to Supabase after purchase
- [ ] Implement DNS management via GoDaddy API
- [ ] Add domain expiry tracking + email reminders

---

## 4. Builder IDE

### Files
- `server.py` — `/api/builder/*` and `/api/studio/publish/*` (lines ~1099–1215, 7275–7875, 8019–8136)
- `builder-publish.js` — GitHub/Vercel/Render deployment UI
- `builder-ide.css`
- `app.js` — Builder sections

### Endpoints
| Method | Path | Data Source | Status |
|--------|------|-------------|--------|
| POST | `/api/builder/v2/generate` | Claude → Grok → Gemini | ✅ Works |
| POST | `/api/builder/chat` | Claude → Grok → Gemini + SSE | ✅ Works |
| POST | `/api/builder/design` | Gemini/Stitch | ✅ Works |
| POST | `/api/builder/agent` | Claude multi-turn | ✅ Works |
| POST | `/api/builder/save-project` | In-memory | ❌ Not persisted |
| GET | `/api/builder/load-project/{name}` | In-memory | ❌ Not persisted |
| POST | `/api/studio/publish/github` | GitHub API | ✅ Works when PAT set |
| POST | `/api/studio/publish/vercel` | Vercel API | ✅ Works when token set |
| POST | `/api/studio/publish/render` | Render API | ✅ Works when key set |
| POST | `/api/studio/publish/download` | ZIP file | ✅ Works |

### AI Model Chain
- Primary: `claude-sonnet-4-6` (Anthropic)
- Fallback 1: `grok-3` (xAI)
- Fallback 2: `gemini-2.5-flash` (Google)

### Required Env Vars
- `ANTHROPIC_API_KEY` — **CRITICAL**
- `SAL_GATEWAY_SECRET` — Required for `/v2/generate` auth
- `GITHUB_PAT` — For GitHub publishing
- `VERCEL_TOKEN` — For Vercel deployment
- `RENDER_API_KEY` — For Render deployment
- Optional: `XAI_API_KEY`, `GEMINI_API_KEY`

### Broken / Missing
1. **Projects not persisted** — `save-project` and `load-project` use in-memory storage, lost on restart
2. **No code sandbox** — Generated code runs directly in user's browser iframe (security risk)
3. **Context window limit** — Iterative refinement limited to last 10 messages
4. **GitHub org permission** — Repo creation in `SaintVisions-SaintSal` org may fail for non-members
5. **Max 15 files per generation** — Large apps can't be fully generated

### To Make Production-Ready
- [ ] Persist projects to `builder_projects` + `builder_files` Supabase tables
- [ ] Add sandboxed iframe with CSP headers for preview
- [ ] Set `SAL_GATEWAY_SECRET` in Render env vars
- [ ] Expand context window / implement project-level memory
- [ ] Add file count limit messaging in UI

---

## 5. Social Studio

### Files
- `server.py` — `/api/studio/*` and `/api/social-studio/*` (lines ~3938–4490, 8327–8600, 10015–10400)
- `social-studio.css`
- `app.js` — Social Studio sections

### Endpoints
| Method | Path | Data Source | Status |
|--------|------|-------------|--------|
| GET | `/api/studio/models` | Hardcoded | ⚠️ Config only |
| POST | `/api/studio/generate/image` | DALL-E 3 → Grok → Gemini | ✅ Works when keys set |
| POST | `/api/studio/generate/video` | Storyboard only | ❌ Broken |
| POST | `/api/studio/generate/audio` | ElevenLabs → Gemini TTS | ✅ Works when key set |
| POST | `/api/studio/generate/code` | Claude chain | ✅ Works |
| GET | `/api/studio/gallery` | In-memory list | ❌ Not persisted |
| GET | `/api/studio/media/{type}/{filename}` | Disk file | ✅ Works |
| POST | `/api/studio/upload` | Disk storage | ✅ Works |
| POST | `/api/studio/transcribe` | OpenAI Whisper | ✅ Works when key set |
| POST | `/api/social-studio/brand-dna` | Claude analysis | ✅ Works |
| POST | `/api/social-studio/campaigns` | Claude | ✅ Works |
| POST | `/api/social-studio/generate` | Claude | ✅ Works |

### Required Env Vars
- `OPENAI_API_KEY` — For DALL-E image + Whisper transcription
- `XAI_API_KEY` — For Grok image fallback
- `GEMINI_API_KEY` — For Gemini image/TTS fallback
- `ELEVENLABS_API_KEY` — For audio generation
- `STITCH_API_KEY` — For UI design

### Broken / Missing
1. **Video generation is storyboard only** — Returns 202 + scene description, no actual video file. Would need Sora/Runway/Veo API key
2. **Media gallery not persisted** — In-memory list lost on server restart
3. **Media files stored on disk** — Will fill up disk on Render with no cleanup
4. **Social platform OAuth not implemented** — `/api/social/platforms` returns platform list but no actual OAuth connection flow
5. **Post scheduling not implemented** — Campaign posts can't be auto-scheduled

### To Make Production-Ready
- [ ] Persist media gallery to `media_library` Supabase table
- [ ] Move file storage to Supabase Storage or S3 (not local disk)
- [ ] Decide on video provider (Sora/Runway/Veo) and implement or remove the feature
- [ ] Implement social platform OAuth (Twitter/LinkedIn/Instagram)
- [ ] Add file cleanup / retention policy

---

## 6. Medical Vertical

### Files
- `server.py` — `/api/medical/*` (lines ~6043–6174)
- `medical-view.js` — 4 tabs (ICD-10, NPI Registry, Drug Reference, Clinical Tools)
- `medical.css`

### Endpoints
| Method | Path | Data Source | Status |
|--------|------|-------------|--------|
| GET | `/api/medical/icd10` | NLM public API + Tavily fallback | ✅ Works |
| GET | `/api/medical/npi` | NPPES public API | ✅ Works |
| GET | `/api/medical/drugs` | openFDA public API | ✅ Works |

### Required Env Vars
- `TAVILY_API_KEY` — Optional fallback for ICD-10

### Broken / Missing
1. ICD-10 Tavily fallback returns web search results, not actual ICD codes
2. Clinical Tools tab is an empty UI placeholder
3. No rate limiting protection — NLM/FDA may throttle
4. No drug interaction checking
5. No EMR integration

### To Make Production-Ready
- [ ] Add Clinical Tools implementation (symptom checker, dosage calculator, etc.)
- [ ] Add rate limiting + caching on public API calls
- [ ] Improve ICD-10 fallback (use direct FHIR API instead of Tavily)
- [ ] This is the most complete vertical — minimal work needed

---

## 7. Career Suite

### Files
- `server.py` — `/api/career/*` (lines ~8851–9217)
- `career-suite.js` — 9 tabs (Overview, Job Search, Tracker, Resume, Cards, Signatures, AI Coach, Interview Prep, Backgrounds)

### Endpoints
| Method | Path | Data Source | Status |
|--------|------|-------------|--------|
| GET | `/api/career/jobs/search` | Exa → Tavily → Perplexity | ✅ Works |
| GET | `/api/career/company-intel` | Apollo + Claude | ✅ Works |
| POST | `/api/career/resume/ai-enhance` | Claude | ✅ Works |
| POST | `/api/career/coach/chat` | Claude | ✅ Works |
| POST | `/api/career/coach/interview-prep` | Claude | ✅ Works |
| POST | `/api/career/tracker/add` | In-memory | ❌ Not persisted |
| GET | `/api/career/tracker/all` | In-memory | ❌ Not persisted |
| PUT | `/api/career/tracker/{job_id}/status` | In-memory | ❌ Not persisted |
| GET | `/api/career/backgrounds/templates` | Empty list | ❌ Stub |

### Required Env Vars
- `EXA_API_KEY` — **CRITICAL** for job search
- `TAVILY_API_KEY` — Fallback for job search
- `ANTHROPIC_API_KEY` — **CRITICAL** for AI features
- `APOLLO_API_KEY` — Company intel enrichment
- `PPLX_API_KEY` — Final search fallback

### Broken / Missing
1. **Job tracker not persisted** — Kanban board (Wishlist/Applied/Interview/Offer/Rejected) stored in-memory, lost on restart
2. **Video backgrounds stub** — Returns empty template list
3. **Resume enhancement text-only** — Can't process uploaded PDF resumes
4. **Salary data hardcoded** — Interview prep returns placeholder salary ranges, not real market data
5. **No skill-to-job matching** — Search is keyword/semantic only

### To Make Production-Ready
- [ ] Persist job tracker to Supabase (use `saved_searches` or add `job_tracker` table)
- [ ] Add PDF parsing for resume upload (use PyPDF2 or similar)
- [ ] Integrate real salary data (BLS API or Levels.fyi)
- [ ] Add video background templates (can be static assets)
- [ ] Set `EXA_API_KEY`, `APOLLO_API_KEY` in Render env vars

---

## Phase 2 Build Order (Recommended)

### Sprint 1 — Persistence (everything that loses data on restart)
1. Builder projects → `builder_projects` + `builder_files` tables
2. Job tracker → Supabase (new table or `saved_searches`)
3. Formation orders → `launch_pad_orders` table
4. Media gallery → `media_library` table + move files to Supabase Storage

### Sprint 2 — Broken Features
5. Real Estate distressed data → real data feed or remove mock properties
6. CorpNet → migrate to production API, implement name check
7. Social Studio video → decide on provider or clearly label as "Coming Soon"
8. Domain purchase → Stripe checkout + persist to Supabase

### Sprint 3 — API Keys + Config
9. Set all missing env vars in Render: `RENTCAST_API_KEY`, `EXA_API_KEY`, `APOLLO_API_KEY`, `GODADDY_*`
10. CorpNet production credentials
11. Video provider key (if pursuing video)

### Sprint 4 — Polish
12. Medical Clinical Tools tab
13. Career resume PDF support
14. Social platform OAuth (Twitter/LinkedIn/Instagram)
15. Domain expiry tracking + renewal emails

---

## Env Vars Master Checklist (Render Dashboard)

| Var | Used By | Priority |
|-----|---------|----------|
| `RENTCAST_API_KEY` | Real Estate | 🔴 Critical |
| `EXA_API_KEY` | Career Suite | 🔴 Critical |
| `ANTHROPIC_API_KEY` | Builder, Career, Social | 🔴 Critical |
| `GODADDY_API_KEY` | Domains | 🔴 Critical |
| `GODADDY_API_SECRET` | Domains | 🔴 Critical |
| `GODADDY_PL_ID` | Domains | 🔴 Critical |
| `GODADDY_STOREFRONT_URL` | Domains | 🔴 Critical |
| `OPENAI_API_KEY` | Social Studio images | 🟡 High |
| `ELEVENLABS_API_KEY` | Social Studio audio | 🟡 High |
| `GEMINI_API_KEY` | Builder fallback, Social | 🟡 High |
| `XAI_API_KEY` | Builder fallback | 🟡 High |
| `TAVILY_API_KEY` | Career, Medical fallback | 🟡 High |
| `APOLLO_API_KEY` | Career company intel | 🟡 High |
| `CORPNET_DATA_API_KEY` | Business Formation | 🟡 High (staging) |
| `GITHUB_PAT` | Builder publish | 🟡 High |
| `VERCEL_TOKEN` | Builder publish | 🟠 Medium |
| `PPLX_API_KEY` | Career + search fallback | 🟠 Medium |
| `SAL_GATEWAY_SECRET` | Builder v2 auth | 🟠 Medium |
| `STITCH_API_KEY` | Builder design | 🟠 Medium |
| `RENDER_API_KEY` | Builder publish | 🟠 Medium |
