# Backend Hardening — server.py Fixes #2–5, #9

**Applied:** 2026-03-06  
**Script:** `upgrade_backend_harden.py`  
**Syntax verified:** ✅ `ast.parse` — no errors  
**File size:** 192,508 → 204,544 chars (+12,036 chars)

---

## Fix #2 — CORS Lockdown (line 24 → lines 31–39)

**Status:** ✅ Applied

Replaced the open wildcard CORS policy with an explicit allowlist:

```python
ALLOWED_ORIGINS = [
    "https://saintsallabs.com",
    "https://www.saintsallabs.com",
    "https://saintsal.ai",
    "https://www.saintsal.ai",
    "http://localhost:3000",
    "http://localhost:5173",
]
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=True, ...)
```

**Before:** `allow_origins=["*"]` (any origin could call the API)  
**After:** Locked to production domains + local dev ports only. `allow_credentials=True` added.

---

## Fix #3 — Rate Limiting via slowapi (lines 22–29, 360, 2370, 2418, 2464, 2801, 2888)

**Status:** ✅ Applied

**Dependency:** `pip install slowapi`

### Imports added (after supabase import):
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
```

### Middleware added (before CORS):
```python
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

### Rate limits applied:

| Endpoint | Limit |
|---|---|
| `POST /api/chat` | 30/minute |
| `POST /api/studio/generate/image` | 10/minute |
| `POST /api/studio/generate/video` | 5/minute |
| `POST /api/studio/generate/audio` | 10/minute |
| `POST /api/auth/signup` | 5/minute |
| `POST /api/auth/magic-link` | 5/minute |

**Note:** `auth_signup` and `auth_magic_link` had `request: Request` added to their function signatures (required by slowapi). Pydantic body model parameter (`data: AuthSignup` / `data: AuthMagicLink`) preserved.

---

## Fix #4 — Connector Credentials → Supabase Vault (lines 3329–3390)

**Status:** ✅ Applied

**Dependency:** `pip install cryptography`

Replaced the bare `connector_credentials = {}` dict with a Supabase-backed encrypted vault approach:

- **`store_connector_credential(user_id, connector_id, cred_type, credentials)`** — upserts to `connector_credentials` table in Supabase; encrypts with Fernet if `CONNECTOR_ENCRYPT_KEY` env var is set
- **`get_connector_credential(user_id, connector_id)`** — reads from Supabase, decrypts if needed
- **Fallback:** in-memory `connector_credentials = {}` dict still present for when Supabase is unavailable

### New env vars:
| Variable | Purpose |
|---|---|
| `CONNECTOR_ENCRYPT_KEY` | 44-char Fernet base64 key for encrypting credentials at rest |

### Required Supabase table:
```sql
CREATE TABLE connector_credentials (
  user_id UUID NOT NULL,
  connector_id TEXT NOT NULL,
  cred_type TEXT,
  credentials JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, connector_id)
);
```

---

## Fix #5 — Stripe Webhook Handler (lines 3534–3606)

**Status:** ✅ Applied

New endpoint added at `POST /api/webhooks/stripe` — inserted before the static file serving section.

### Features:
- **Signature verification** using `stripe.Webhook.construct_event()` when `STRIPE_WEBHOOK_SECRET` is set
- **Graceful fallback** (unverified, with warning log) when secret is not configured
- **Event handlers:**
  - `checkout.session.completed` → sets `stripe_customer_id` + `plan_tier: starter` on profile
  - `customer.subscription.updated` → maps price IDs to plan tiers (`free/starter/pro/teams/enterprise`)
  - `customer.subscription.deleted` → downgrades to `free`
  - `invoice.payment_failed` → logs without immediately downgrading (Stripe retries)
- Always returns HTTP 200 to prevent Stripe retries on our own processing errors

### New env vars:
| Variable | Purpose |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret from Stripe dashboard |

### Price ID → Plan tier mapping (hardcoded):
| Price ID | Tier |
|---|---|
| `price_1T5bkAL47U80vDLAslOm3HoX` | free |
| `price_1T5bkAL47U80vDLAaChP4Hqg` | starter |
| `price_1T5bkBL47U80vDLALiVDkOgb` | pro |
| `price_1T5bkCL47U80vDLANsCa647K` | teams |
| `price_1T5bkDL47U80vDLANXWF33A7` | enterprise |

---

## Fix #9 — Real Distressed Property Data via RentCast (lines 1625–1726)

**Status:** ✅ Applied

Both distressed endpoints now attempt a live RentCast API call before falling back to mock data.

### `GET /api/realestate/distressed/summary`
1. If `RENTCAST_API_KEY` env var is set → calls `https://api.rentcast.io/v1/listings/sale?status=Foreclosure&limit=20&state=CA`
2. On success, transforms RentCast response format to our format, returns with `"source": "rentcast_live"`
3. On failure or missing key → returns existing mock counts with `"source": "cached"`

### `GET /api/realestate/distressed/{category}`
1. For `category == "foreclosure"` with `RENTCAST_API_KEY` set → calls RentCast with optional `state`/`city` filters
2. On success → returns live properties with `"source": "rentcast_live"`
3. On failure or non-foreclosure category → falls back to mock data with `"source": "cached"`

### New env vars:
| Variable | Purpose |
|---|---|
| `RENTCAST_API_KEY` | RentCast API key (https://app.rentcast.io) |

---

## Deployment Checklist

- [ ] `pip install slowapi cryptography` in server environment
- [ ] Set `CONNECTOR_ENCRYPT_KEY` — generate with: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
- [ ] Set `STRIPE_WEBHOOK_SECRET` from Stripe Dashboard → Webhooks → your endpoint
- [ ] Configure Stripe webhook endpoint URL: `https://saintsallabs.com/api/webhooks/stripe`
- [ ] Subscribe to Stripe events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- [ ] Set `RENTCAST_API_KEY` for live distressed property data
- [ ] Create `connector_credentials` table in Supabase (schema above)
- [ ] Add `stripe_customer_id TEXT` and `plan_tier TEXT` columns to `profiles` table if not present
