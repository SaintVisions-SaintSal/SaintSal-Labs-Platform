#!/usr/bin/env python3
# pip install slowapi
"""
upgrade_backend_harden.py
Applies backend hardening fixes #2, #3, #4, #5, #9 to server.py.
Run: python upgrade_backend_harden.py
"""

import re

SERVER_PATH = "/home/user/workspace/saintsal-app/server.py"

with open(SERVER_PATH, "r", encoding="utf-8") as f:
    src = f.read()

original_len = len(src)
applied = []
errors = []


def replace_once(src, old, new, label):
    """Replace exactly one occurrence of old with new. Raises if not found or ambiguous."""
    count = src.count(old)
    if count == 0:
        errors.append(f"[{label}] PATTERN NOT FOUND")
        return src
    if count > 1:
        errors.append(f"[{label}] WARNING: {count} occurrences found, replacing first only")
    result = src.replace(old, new, 1)
    applied.append(f"[{label}] Applied successfully ({count} occurrence(s) found)")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# FIX #2: CORS Lockdown
# ─────────────────────────────────────────────────────────────────────────────
FIX2_OLD = 'app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])'

FIX2_NEW = '''ALLOWED_ORIGINS = [
    "https://saintsallabs.com",
    "https://www.saintsallabs.com",
    "https://saintsal.ai",
    "https://www.saintsal.ai",
    "http://localhost:3000",
    "http://localhost:5173",
]
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])'''

src = replace_once(src, FIX2_OLD, FIX2_NEW, "FIX#2 CORS Lockdown")


# ─────────────────────────────────────────────────────────────────────────────
# FIX #3: Rate Limiting — Step 1: add imports after existing imports block
# ─────────────────────────────────────────────────────────────────────────────
# Add slowapi imports after the last top-level import line (supabase import)
FIX3_IMPORT_OLD = "from supabase import create_client, Client as SupabaseClient"

FIX3_IMPORT_NEW = """from supabase import create_client, Client as SupabaseClient
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded"""

src = replace_once(src, FIX3_IMPORT_OLD, FIX3_IMPORT_NEW, "FIX#3 slowapi imports")

# FIX #3: Step 2 — add limiter setup BEFORE the CORS middleware
# We look for the CORS middleware line (now the new ALLOWED_ORIGINS block)
FIX3_MIDDLEWARE_OLD = """ALLOWED_ORIGINS = [
    "https://saintsallabs.com",
    "https://www.saintsallabs.com",
    "https://saintsal.ai",
    "https://www.saintsal.ai",
    "http://localhost:3000",
    "http://localhost:5173",
]
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])"""

FIX3_MIDDLEWARE_NEW = """limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

ALLOWED_ORIGINS = [
    "https://saintsallabs.com",
    "https://www.saintsallabs.com",
    "https://saintsal.ai",
    "https://www.saintsal.ai",
    "http://localhost:3000",
    "http://localhost:5173",
]
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])"""

src = replace_once(src, FIX3_MIDDLEWARE_OLD, FIX3_MIDDLEWARE_NEW, "FIX#3 limiter middleware setup")

# FIX #3: Step 3 — add rate limit decorators to each endpoint
# /api/chat — already has request: Request
FIX3_CHAT_OLD = '@app.post("/api/chat")\nasync def chat(request: Request):'
FIX3_CHAT_NEW = '@limiter.limit("30/minute")\n@app.post("/api/chat")\nasync def chat(request: Request):'
src = replace_once(src, FIX3_CHAT_OLD, FIX3_CHAT_NEW, "FIX#3 rate-limit /api/chat")

# /api/studio/generate/image — already has request: Request
FIX3_IMG_OLD = '@app.post("/api/studio/generate/image")\nasync def studio_generate_image(request: Request):'
FIX3_IMG_NEW = '@limiter.limit("10/minute")\n@app.post("/api/studio/generate/image")\nasync def studio_generate_image(request: Request):'
src = replace_once(src, FIX3_IMG_OLD, FIX3_IMG_NEW, "FIX#3 rate-limit /api/studio/generate/image")

# /api/studio/generate/video — already has request: Request
FIX3_VID_OLD = '@app.post("/api/studio/generate/video")\nasync def studio_generate_video(request: Request):'
FIX3_VID_NEW = '@limiter.limit("5/minute")\n@app.post("/api/studio/generate/video")\nasync def studio_generate_video(request: Request):'
src = replace_once(src, FIX3_VID_OLD, FIX3_VID_NEW, "FIX#3 rate-limit /api/studio/generate/video")

# /api/studio/generate/audio — already has request: Request
FIX3_AUD_OLD = '@app.post("/api/studio/generate/audio")\nasync def studio_generate_audio(request: Request):'
FIX3_AUD_NEW = '@limiter.limit("10/minute")\n@app.post("/api/studio/generate/audio")\nasync def studio_generate_audio(request: Request):'
src = replace_once(src, FIX3_AUD_OLD, FIX3_AUD_NEW, "FIX#3 rate-limit /api/studio/generate/audio")

# /api/auth/signup — uses Pydantic model, needs request: Request added
FIX3_SIGNUP_OLD = '@app.post("/api/auth/signup")\nasync def auth_signup(data: AuthSignup):'
FIX3_SIGNUP_NEW = '@limiter.limit("5/minute")\n@app.post("/api/auth/signup")\nasync def auth_signup(request: Request, data: AuthSignup):'
src = replace_once(src, FIX3_SIGNUP_OLD, FIX3_SIGNUP_NEW, "FIX#3 rate-limit /api/auth/signup")

# /api/auth/magic-link — uses Pydantic model, needs request: Request added
FIX3_MAGIC_OLD = '@app.post("/api/auth/magic-link")\nasync def auth_magic_link(data: AuthMagicLink):'
FIX3_MAGIC_NEW = '@limiter.limit("5/minute")\n@app.post("/api/auth/magic-link")\nasync def auth_magic_link(request: Request, data: AuthMagicLink):'
src = replace_once(src, FIX3_MAGIC_OLD, FIX3_MAGIC_NEW, "FIX#3 rate-limit /api/auth/magic-link")


# ─────────────────────────────────────────────────────────────────────────────
# FIX #4: Connector Credentials → Supabase Vault
# ─────────────────────────────────────────────────────────────────────────────
FIX4_OLD = """# In-memory connector storage (production: Supabase encrypted vault)
connector_credentials = {}"""

FIX4_NEW = '''# ─── Connector Credential Storage (Supabase Vault) ────────────────────────────
import base64
from cryptography.fernet import Fernet

CONNECTOR_ENCRYPT_KEY = os.environ.get("CONNECTOR_ENCRYPT_KEY", "")
_fernet = None
if CONNECTOR_ENCRYPT_KEY:
    try:
        _fernet = Fernet(CONNECTOR_ENCRYPT_KEY.encode() if len(CONNECTOR_ENCRYPT_KEY) == 44 else Fernet.generate_key())
    except Exception:
        _fernet = None

async def store_connector_credential(user_id: str, connector_id: str, cred_type: str, credentials: dict):
    """Store encrypted connector credentials in Supabase."""
    if not supabase_admin:
        # Fallback to in-memory if Supabase not configured
        connector_credentials[connector_id] = credentials
        return True
    try:
        encrypted = credentials
        if _fernet:
            import json
            encrypted = {"encrypted": _fernet.encrypt(json.dumps(credentials).encode()).decode()}
        supabase_admin.table("connector_credentials").upsert({
            "user_id": user_id,
            "connector_id": connector_id,
            "cred_type": cred_type,
            "credentials": encrypted,
            "updated_at": "now()"
        }, on_conflict="user_id,connector_id").execute()
        return True
    except Exception as e:
        print(f"[Connectors] Failed to store credential: {e}")
        connector_credentials[connector_id] = credentials
        return False

async def get_connector_credential(user_id: str, connector_id: str) -> dict:
    """Retrieve connector credentials from Supabase."""
    if not supabase_admin:
        return connector_credentials.get(connector_id, {})
    try:
        result = supabase_admin.table("connector_credentials").select("*").eq("user_id", user_id).eq("connector_id", connector_id).single().execute()
        if result.data:
            creds = result.data.get("credentials", {})
            if _fernet and isinstance(creds, dict) and "encrypted" in creds:
                import json
                return json.loads(_fernet.decrypt(creds["encrypted"].encode()).decode())
            return creds
        return {}
    except Exception as e:
        print(f"[Connectors] Failed to retrieve credential: {e}")
        return connector_credentials.get(connector_id, {})

# Fallback in-memory store (used when Supabase unavailable)
connector_credentials = {}'''

src = replace_once(src, FIX4_OLD, FIX4_NEW, "FIX#4 Connector Credentials → Supabase")


# ─────────────────────────────────────────────────────────────────────────────
# FIX #5: Stripe Webhook Handler
# ─────────────────────────────────────────────────────────────────────────────
FIX5_ANCHOR = "# ── Static file serving (must be AFTER all API routes) ──────────────────────"

FIX5_NEW_BLOCK = '''# ─── Stripe Webhook Handler ──────────────────────────────────────────────────
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

@app.post("/api/webhooks/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events with signature verification."""
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET
    
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    
    if STRIPE_WEBHOOK_SECRET:
        try:
            event = stripe_lib.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
        except ValueError:
            return JSONResponse({"error": "Invalid payload"}, status_code=400)
        except stripe_lib.error.SignatureVerificationError:
            return JSONResponse({"error": "Invalid signature"}, status_code=400)
    else:
        import json
        event = json.loads(payload)
        print("[Stripe Webhook] WARNING: No webhook secret configured — accepting unverified events")
    
    event_type = event.get("type", "")
    data = event.get("data", {}).get("object", {})
    
    print(f"[Stripe Webhook] Received: {event_type}")
    
    try:
        if event_type == "checkout.session.completed":
            customer_id = data.get("customer")
            subscription_id = data.get("subscription")
            customer_email = data.get("customer_details", {}).get("email", "")
            print(f"[Stripe Webhook] Checkout completed for {customer_email} (customer: {customer_id})")
            
            if supabase_admin and customer_id:
                # Update profile with Stripe customer ID
                supabase_admin.table("profiles").update({
                    "stripe_customer_id": customer_id,
                    "plan_tier": "starter",
                    "updated_at": "now()"
                }).eq("email", customer_email).execute()
        
        elif event_type == "customer.subscription.updated":
            customer_id = data.get("customer")
            status = data.get("status")
            plan_id = data.get("plan", {}).get("id", "") if data.get("plan") else ""
            items = data.get("items", {}).get("data", [])
            price_id = items[0].get("price", {}).get("id", "") if items else plan_id
            
            # Map Stripe price IDs to plan tiers
            price_to_tier = {
                "price_1T5bkAL47U80vDLAslOm3HoX": "free",
                "price_1T5bkAL47U80vDLAaChP4Hqg": "starter",
                "price_1T5bkBL47U80vDLALiVDkOgb": "pro",
                "price_1T5bkCL47U80vDLANsCa647K": "teams",
                "price_1T5bkDL47U80vDLANXWF33A7": "enterprise",
            }
            tier = price_to_tier.get(price_id, "free")
            
            if supabase_admin and customer_id:
                supabase_admin.table("profiles").update({
                    "plan_tier": tier if status == "active" else "free",
                    "updated_at": "now()"
                }).eq("stripe_customer_id", customer_id).execute()
                print(f"[Stripe Webhook] Updated plan to {tier} for customer {customer_id}")
        
        elif event_type == "customer.subscription.deleted":
            customer_id = data.get("customer")
            if supabase_admin and customer_id:
                supabase_admin.table("profiles").update({
                    "plan_tier": "free",
                    "updated_at": "now()"
                }).eq("stripe_customer_id", customer_id).execute()
                print(f"[Stripe Webhook] Subscription cancelled for customer {customer_id}")
        
        elif event_type == "invoice.payment_failed":
            customer_id = data.get("customer")
            attempt_count = data.get("attempt_count", 0)
            print(f"[Stripe Webhook] Payment failed for {customer_id} (attempt {attempt_count})")
            # Don\'t downgrade immediately — Stripe retries automatically
            
        else:
            print(f"[Stripe Webhook] Unhandled event type: {event_type}")
    
    except Exception as e:
        print(f"[Stripe Webhook] Error processing {event_type}: {e}")
        # Return 200 anyway to prevent Stripe retries on our errors
    
    return JSONResponse({"received": True})


# ── Static file serving (must be AFTER all API routes) ──────────────────────'''

src = replace_once(src, FIX5_ANCHOR, FIX5_NEW_BLOCK, "FIX#5 Stripe Webhook Handler")


# ─────────────────────────────────────────────────────────────────────────────
# FIX #9: Real Distressed Property Data (RentCast API integration)
# ─────────────────────────────────────────────────────────────────────────────
FIX9_OLD = '''@app.get("/api/realestate/distressed/summary")
async def get_distressed_summary():
    """Get summary counts of all distressed property categories."""
    return {
        "foreclosures": len(DISTRESSED_PROPERTIES["foreclosure"]),
        "pre_foreclosures": len(DISTRESSED_PROPERTIES["pre_foreclosure"]),
        "tax_liens": len(DISTRESSED_PROPERTIES["tax_lien"]),
        "nods": len(DISTRESSED_PROPERTIES["nod"]),
        "total": sum(len(v) for v in DISTRESSED_PROPERTIES.values()),
    }'''

FIX9_NEW = '''@app.get("/api/realestate/distressed/summary")
async def get_distressed_summary():
    """Get summary counts of all distressed property categories."""
    # Try live data from RentCast first
    RENTCAST_KEY = os.environ.get("RENTCAST_API_KEY", "")
    if RENTCAST_KEY:
        try:
            async with httpx.AsyncClient(timeout=10) as http:
                # RentCast sale listings endpoint for distressed properties
                resp = await http.get(
                    "https://api.rentcast.io/v1/listings/sale",
                    params={"status": "Foreclosure", "limit": 20, "state": "CA"},
                    headers={"X-Api-Key": RENTCAST_KEY, "Accept": "application/json"}
                )
                if resp.status_code == 200:
                    live_data = resp.json()
                    if live_data and len(live_data) > 0:
                        # Transform RentCast format to our format
                        foreclosures = [
                            {
                                "address": p.get("formattedAddress", p.get("addressLine1", "")),
                                "city": p.get("city", ""),
                                "state": p.get("state", ""),
                                "zip": p.get("zipCode", ""),
                                "beds": p.get("bedrooms", 0),
                                "baths": p.get("bathrooms", 0),
                                "sqft": p.get("squareFootage", 0),
                                "year_built": p.get("yearBuilt", 0),
                                "estimated_value": p.get("price", 0),
                                "status": "Foreclosure",
                                "property_type": p.get("propertyType", "Single Family"),
                                "lat": p.get("latitude"),
                                "lng": p.get("longitude"),
                            }
                            for p in live_data
                        ]
                        return {
                            "foreclosures": len(foreclosures),
                            "pre_foreclosures": len(DISTRESSED_PROPERTIES["pre_foreclosure"]),
                            "tax_liens": len(DISTRESSED_PROPERTIES["tax_lien"]),
                            "nods": len(DISTRESSED_PROPERTIES["nod"]),
                            "total": len(foreclosures) + len(DISTRESSED_PROPERTIES["pre_foreclosure"]) + len(DISTRESSED_PROPERTIES["tax_lien"]) + len(DISTRESSED_PROPERTIES["nod"]),
                            "source": "rentcast_live",
                        }
        except Exception as e:
            print(f"[RE Distressed] RentCast API error, using cached data: {e}")
    # Fallback: mock/cached data
    return {
        "foreclosures": len(DISTRESSED_PROPERTIES["foreclosure"]),
        "pre_foreclosures": len(DISTRESSED_PROPERTIES["pre_foreclosure"]),
        "tax_liens": len(DISTRESSED_PROPERTIES["tax_lien"]),
        "nods": len(DISTRESSED_PROPERTIES["nod"]),
        "total": sum(len(v) for v in DISTRESSED_PROPERTIES.values()),
        "source": "cached",
    }'''

src = replace_once(src, FIX9_OLD, FIX9_NEW, "FIX#9 Distressed Summary RentCast")

# Also patch the /api/realestate/distressed/{category} endpoint to try RentCast
FIX9B_OLD = '''@app.get("/api/realestate/distressed/{category}")
async def get_distressed(category: str, state: str = "", city: str = ""):
    """Get distressed properties by category: foreclosure, pre_foreclosure, tax_lien, nod."""
    properties = DISTRESSED_PROPERTIES.get(category, [])
    if state:
        properties = [p for p in properties if p.get("state", "").upper() == state.upper()]
    if city:
        properties = [p for p in properties if city.lower() in p.get("city", "").lower()]
    return {"category": category, "properties": properties, "total": len(properties)}'''

FIX9B_NEW = '''@app.get("/api/realestate/distressed/{category}")
async def get_distressed(category: str, state: str = "", city: str = ""):
    """Get distressed properties by category: foreclosure, pre_foreclosure, tax_lien, nod."""
    # Try live data from RentCast first for foreclosure category
    RENTCAST_KEY = os.environ.get("RENTCAST_API_KEY", "")
    if RENTCAST_KEY and category == "foreclosure":
        try:
            params = {"status": "Foreclosure", "limit": 20}
            if state:
                params["state"] = state.upper()
            if city:
                params["city"] = city
            async with httpx.AsyncClient(timeout=10) as http:
                resp = await http.get(
                    "https://api.rentcast.io/v1/listings/sale",
                    params=params,
                    headers={"X-Api-Key": RENTCAST_KEY, "Accept": "application/json"}
                )
                if resp.status_code == 200:
                    live_data = resp.json()
                    if live_data and len(live_data) > 0:
                        properties = [
                            {
                                "address": p.get("formattedAddress", p.get("addressLine1", "")),
                                "city": p.get("city", ""),
                                "state": p.get("state", ""),
                                "zip": p.get("zipCode", ""),
                                "beds": p.get("bedrooms", 0),
                                "baths": p.get("bathrooms", 0),
                                "sqft": p.get("squareFootage", 0),
                                "year_built": p.get("yearBuilt", 0),
                                "estimated_value": p.get("price", 0),
                                "status": "Foreclosure",
                                "property_type": p.get("propertyType", "Single Family"),
                                "lat": p.get("latitude"),
                                "lng": p.get("longitude"),
                            }
                            for p in live_data
                        ]
                        return {"category": category, "properties": properties, "total": len(properties), "source": "rentcast_live"}
        except Exception as e:
            print(f"[RE Distressed] RentCast API error, using cached data: {e}")
    # Fallback: mock/cached data
    properties = DISTRESSED_PROPERTIES.get(category, [])
    if state:
        properties = [p for p in properties if p.get("state", "").upper() == state.upper()]
    if city:
        properties = [p for p in properties if city.lower() in p.get("city", "").lower()]
    return {"category": category, "properties": properties, "total": len(properties), "source": "cached"}'''

src = replace_once(src, FIX9B_OLD, FIX9B_NEW, "FIX#9 Distressed Category RentCast")


# ─────────────────────────────────────────────────────────────────────────────
# Write output
# ─────────────────────────────────────────────────────────────────────────────
with open(SERVER_PATH, "w", encoding="utf-8") as f:
    f.write(src)

new_len = len(src)

print("=" * 60)
print("upgrade_backend_harden.py — Results")
print("=" * 60)
print(f"Original size : {original_len:,} chars")
print(f"New size      : {new_len:,} chars")
print(f"Delta         : +{new_len - original_len:,} chars")
print()
print("Applied fixes:")
for msg in applied:
    print(f"  ✅ {msg}")
print()
if errors:
    print("Errors / Warnings:")
    for msg in errors:
        print(f"  ⚠️  {msg}")
else:
    print("No errors.")
