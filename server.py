#!/usr/bin/env python3
"""SaintSal.ai Backend — Real AI chat with streaming, web search, discover feed, GoDaddy domains, and CorpNet business formation."""
import json
import base64
import uuid
from pathlib import Path
import os
import asyncio
import httpx
import traceback
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, File, UploadFile, Form, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, Response, FileResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from anthropic import Anthropic
import openai
from pydantic import BaseModel
from supabase import create_client, Client as SupabaseClient
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

app = FastAPI()
limiter = Limiter(key_func=get_remote_address)
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
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Initialize Anthropic client (requires ANTHROPIC_API_KEY env var)
try:
    client = Anthropic()
    print(f"✅ Anthropic client initialized")
except Exception as e:
    client = None
    print(f"⚠️ Anthropic client not initialized (set ANTHROPIC_API_KEY): {e}")

# Initialize xAI/Grok client (OpenAI-compatible fallback)
XAI_API_KEY = os.environ.get("XAI_API_KEY", "")
xai_client = None
if XAI_API_KEY:
    try:
        xai_client = openai.OpenAI(api_key=XAI_API_KEY, base_url="https://api.x.ai/v1")
        print(f"✅ xAI/Grok client initialized (fallback LLM)")
    except Exception as e:
        print(f"⚠️ xAI/Grok client not initialized: {e}")

ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "sk_20510a2269d6cc6cd4e505efcde230d1d87b31bc5aae98a2")
print(f"{'✅' if ELEVENLABS_API_KEY else '⚠️'} ElevenLabs API key {'configured' if ELEVENLABS_API_KEY else 'not set'}")

# ─── Supabase Client ──────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://euxrlpuegeiggedqbkiv.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# Public client (for user-scoped operations)
supabase: Optional[SupabaseClient] = None
# Service client (for admin operations like credit deduction)
supabase_admin: Optional[SupabaseClient] = None

if SUPABASE_URL and SUPABASE_ANON_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        print(f"✅ Supabase public client initialized: {SUPABASE_URL}")
    except Exception as e:
        print(f"⚠️ Supabase public client failed: {e}")

if SUPABASE_URL and SUPABASE_SERVICE_KEY:
    try:
        supabase_admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        print(f"✅ Supabase admin client initialized")
    except Exception as e:
        print(f"⚠️ Supabase admin client failed: {e}")


# v7.40.0 — Auto-create conversations table on startup
@app.on_event("startup")
async def _ensure_conversations_table():
    """Create conversations table in Supabase if it doesn't exist."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return
    try:
        async with httpx.AsyncClient(timeout=15) as hc:
            # Quick check: try to read from conversations
            r = await hc.get(
                f"{SUPABASE_URL}/rest/v1/conversations",
                headers={"apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
                params={"limit": "1"},
            )
            if r.status_code == 200:
                print("✅ Supabase conversations table exists")
            elif r.status_code in (404, 400):
                # Table doesn't exist — create it via SQL RPC
                # First create an exec_sql function, then use it
                sql = """
                CREATE TABLE IF NOT EXISTS public.conversations (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL,
                    title TEXT NOT NULL DEFAULT 'New Conversation',
                    conv_type TEXT NOT NULL DEFAULT 'chat',
                    vertical TEXT DEFAULT 'search',
                    messages JSONB DEFAULT '[]'::jsonb,
                    message_count INTEGER DEFAULT 0,
                    preview TEXT DEFAULT '',
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now()
                );
                CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
                CREATE INDEX IF NOT EXISTS idx_conversations_user_type ON public.conversations(user_id, conv_type);
                CREATE INDEX IF NOT EXISTS idx_conversations_updated ON public.conversations(updated_at DESC);
                """
                print(f"⚠️ Conversations table not found (HTTP {r.status_code}). Table needs to be created via Supabase SQL Editor.")
                print(f"   Conversation persistence will fall back to filesystem until table is created.")
            else:
                print(f"⚠️ Conversations table check returned HTTP {r.status_code}")
    except Exception as e:
        print(f"⚠️ Conversations table check failed: {e}")


async def get_current_user(authorization: Optional[str] = Header(None)):
    """Extract and verify user from JWT Bearer token."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.replace("Bearer ", "")
    if not supabase:
        return None
    try:
        user_resp = supabase.auth.get_user(token)
        if user_resp and user_resp.user:
            return {"id": str(user_resp.user.id), "email": user_resp.user.email, "token": token}
    except Exception:
        pass
    return None


# ─── Media Storage ────────────────────────────────────────────────────────────
MEDIA_DIR = Path("media_uploads")
MEDIA_DIR.mkdir(exist_ok=True)
(MEDIA_DIR / "images").mkdir(exist_ok=True)
(MEDIA_DIR / "videos").mkdir(exist_ok=True)
(MEDIA_DIR / "audio").mkdir(exist_ok=True)
(MEDIA_DIR / "uploads").mkdir(exist_ok=True)

# In-memory gallery (production: use DB)
media_gallery = []

# In-memory upload context (files attached to Builder prompts)
builder_uploads = []  # [{id, filename, content_type, size, url, extracted_text}]

# In-memory social connections (production: use DB + encrypted storage)
social_connections = {}

# ─── API Keys ─────────────────────────────────────────────────────────────────

GODADDY_API_KEY = os.environ.get("GODADDY_API_KEY", "fYfvRW8R6NBK_P7LYBzA3hSUAWMXGNMkpJT")
GODADDY_API_SECRET = os.environ.get("GODADDY_API_SECRET", "XxC9jFsNJuL1TW7YH6yxkE")
GODADDY_PL_ID = os.environ.get("GODADDY_PL_ID", "600402")
GODADDY_STOREFRONT_URL = os.environ.get("GODADDY_STOREFRONT_URL", "https://www.secureserver.net/?pl_id=600402")
GODADDY_BASE = os.environ.get("GODADDY_BASE", "https://api.godaddy.com")  # switch to api.ote-godaddy.com for testing
CORPNET_DATA_API_KEY = os.environ.get("CORPNET_STAGING_TOKEN", os.environ.get("CORPNET_DATA_API_KEY", "0D3DB6A514DAED0CEF4F97D71DC9292BA84C895FE25A4EB34D09CDF4F2242F95DB554C9C88D3044F5A05F67457B4F82C44F6"))
CORPNET_API_KEY = os.environ.get("CORPNET_API_KEY", "7E90-738C-175F-41BD-886C")
CORPNET_BASE_URL = os.environ.get("CORPNET_API_BASE_STAGING", "https://api.staging24.corpnet.com")

# ─── Real Estate API Keys ────────────────────────────────────────────────────
RENTCAST_API_KEY = os.environ.get("RENTCAST_API_KEY", "e14286fed9e243c6afcba08fcce4bd8f")
RENTCAST_BASE = "https://api.rentcast.io/v1"

# PropertyAPI for parcel/property data
PROPERTY_API_KEY = os.environ.get("PROPERTY_API_KEY", "papi_70d8da74b40ac2bf57b6be8f576cd9bb47ebac1a947ca2c8")
PROPERTY_API_BASE = "https://propertyapi.co/api/v1"
PROPERTY_API_HEADERS = {"X-Api-Key": PROPERTY_API_KEY}
GOOGLE_MAPS_KEY = os.environ.get("GOOGLE_MAPS_KEY", "AIzaSyA2RxjYuME6mEa1-Sb-8ZfZjR0ujJ-lITQ")