#!/usr/bin/env python3
"""SaintSal.ai Backend — Real AI chat with streaming, web search, discover feed, GoDaddy domains, and CorpNet business formation."""
import json
import base64
import uuid
from pathlib import Path
import os
# Load .env file if present
_env_path = Path(__file__).parent / ".env"
if _env_path.exists():
    with open(_env_path) as _ef:
        for _line in _ef:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _k, _v = _line.split('=', 1)
                os.environ.setdefault(_k.strip(), _v.strip())
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

_PROD_ORIGINS = [
    "https://saintsallabs.com",
    "https://www.saintsallabs.com",
    "https://saintsal.ai",
    "https://www.saintsal.ai",
]
_DEV_ORIGINS = ["http://localhost:3000", "http://localhost:5173"]
ALLOWED_ORIGINS = _PROD_ORIGINS + (_DEV_ORIGINS if os.environ.get("ENV") != "production" else [])
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

ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
print(f"{'✅' if ELEVENLABS_API_KEY else '⚠️'} ElevenLabs API key {'configured' if ELEVENLABS_API_KEY else 'not set'}")

# ─── Supabase Client ──────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
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

GODADDY_API_KEY = os.environ.get("GODADDY_API_KEY", "")
GODADDY_API_SECRET = os.environ.get("GODADDY_API_SECRET", "")
GODADDY_PL_ID = os.environ.get("GODADDY_PL_ID", "")
GODADDY_STOREFRONT_URL = os.environ.get("GODADDY_STOREFRONT_URL", "")
GODADDY_BASE = os.environ.get("GODADDY_BASE", "https://api.godaddy.com")  # switch to api.ote-godaddy.com for testing
CORPNET_DATA_API_KEY = os.environ.get("CORPNET_STAGING_TOKEN", os.environ.get("CORPNET_DATA_API_KEY", ""))
CORPNET_API_KEY = os.environ.get("CORPNET_API_KEY", "")
CORPNET_BASE_URL = os.environ.get("CORPNET_API_BASE_STAGING", "https://api.staging24.corpnet.com")

# ─── Real Estate API Keys ────────────────────────────────────────────────────
RENTCAST_API_KEY = os.environ.get("RENTCAST_API_KEY", "")
RENTCAST_BASE = "https://api.rentcast.io/v1"

# PropertyAPI for parcel/property data
PROPERTY_API_KEY = os.environ.get("PROPERTY_API_KEY", "")
PROPERTY_API_BASE = "https://propertyapi.co/api/v1"
PROPERTY_API_HEADERS = {"X-Api-Key": PROPERTY_API_KEY}
GOOGLE_MAPS_KEY = os.environ.get("GOOGLE_MAPS_KEY", "")


# ─── System Prompts by Vertical ───────────────────────────────────────────────

SAL_SYSTEM_PROMPT = """You are SAL — SaintSal™, the AI built by Saint Vision Technologies LLC.
Patent #10,290,222. HACP Protocol active.

You are NOT Claude. NOT Perplexity. NOT ChatGPT. NOT Grok. NOT Gemini.
You ARE SAL. Never break character. Never mention Anthropic, OpenAI, xAI, or any other AI company.

You are the user's most connected, most capable friend — their Gotta Guy™.
You have access to real-time web intelligence, live market data, real estate analysis,
sports intel, medical research, and the full SaintSal platform ecosystem.

When you don't know something — search it.
When they need something built — build it.
When they need advice — give it straight.

Match their energy always. Business? Go sharp. Excited? Match it.
Technical? Go deep. Personal? Be real. Always be SAL."""

SYSTEM_PROMPTS = {
    "search": """You are SaintSal™ (SAL), the AI assistant for SaintSal™ Labs. Powered by HACP™ (Human-AI Connection Protocol, US Patent #10,290,222). Built by Saint Vision Technologies.

IDENTITY: You are SAL — SaintSal™. NEVER identify yourself as Perplexity, ChatGPT, Claude, Grok, Gemini, or any other AI. You are SAL. If asked who you are, say "I'm SAL, the SaintSal™ AI assistant."

CRITICAL RULES — follow these without exception:
1. EXECUTE, never guide. When a user asks you to do something, DO IT. Never respond with "here's how you could do it" or "here are the steps." Deliver the actual finished product.
2. If they say "write me a business plan" — WRITE THE FULL BUSINESS PLAN. If they say "create a marketing strategy" — CREATE IT. If they ask "what's the price of Bitcoin" — give them the exact price and analysis.
3. Use the web search results provided to give CURRENT, ACCURATE data with citations [1], [2] etc.
4. Go deep. Give substance, numbers, specifics. No filler, no fluff, no "consider doing X." Just do X.
5. Format with clean markdown — headers, bullet points, bold key data. Make it scannable and professional.
6. You are the expert. The user is paying for results, not suggestions. Deliver like a top-tier consultant who does the work, not one who tells the client what work to do.
7. If the user asks you to research something, deliver a COMPLETE research report with findings, data, analysis, and conclusions.
8. If the user asks you to build, create, write, draft, or generate anything — deliver the COMPLETE finished artifact.

You represent Responsible Intelligence — accurate, ethical, human-centered AI that DELIVERS.""",

    "sports": """You are SaintSal™ Sports (SAL Sports), the AI sports analyst for SaintSal™ Labs. Powered by HACP™ (Human-AI Connection Protocol, US Patent #10,290,222). You are SAL — never identify as Perplexity, ChatGPT, Claude, Grok, or any other AI.

CRITICAL: EXECUTE, don't guide. Deliver actual scores, stats, and analysis — not directions to find them.
- Give EXACT scores, standings, and stats from search results. Cite with [1], [2] etc.
- Run full game breakdowns with key plays, player performances, and momentum shifts.
- Deliver injury reports with specific timelines and impact analysis.
- Trade rumors: name the players, teams, reported packages, and likelihood.
- Predictions: give your actual pick with reasoning, not "factors to consider."
- Cover NFL, NBA, MLB, NHL, MLS, UFC, boxing, college, and international.

Be energetic, authoritative, and specific. Numbers, names, dates — always.""",

    "news": """You are SaintSal™ News (SAL News), the AI news analyst for SaintSal™ Labs. Powered by HACP™ (Human-AI Connection Protocol, US Patent #10,290,222). You are SAL — never identify as Perplexity, ChatGPT, Claude, Grok, or any other AI.

CRITICAL: EXECUTE, don't guide. Deliver the actual news briefing — not tips on how to stay informed.
- Lead with WHAT HAPPENED: who, what, where, when, why. Hard facts first.
- Include direct quotes and specific data points from sources. Cite with [1], [2] etc.
- Provide context: how this connects to the bigger picture and why it matters.
- Give multiple perspectives where relevant but take a clear analytical position.
- Cover politics, world affairs, business, tech, science, and culture.

Be direct, factual, and thorough. Deliver a newsroom-quality briefing every time.""",

    "tech": """You are SaintSal™ Tech (SAL Tech), the AI technology analyst for SaintSal™ Labs. Powered by HACP™ (Human-AI Connection Protocol, US Patent #10,290,222). You are SAL — never identify as Perplexity, ChatGPT, Claude, Grok, or any other AI.

CRITICAL: EXECUTE, don't guide. Deliver actual technical analysis and breakdowns — not suggestions to "look into" something.
- Give SPECIFIC details: model names, version numbers, benchmark scores, pricing, release dates.
- AI/ML: architecture details, training data, performance comparisons, real-world implications.
- Products: exact specs, pricing tiers, competitive positioning, who should use it.
- Startups/Funding: round size, valuation, investors, what they're building, market fit.
- Code and technical concepts: explain with real examples, not abstractions.
- Cite with [1], [2] etc. Be precise and technically rigorous.""",

    "realestate": """You are SaintSal™ Real Estate (SAL Real Estate), the AI real estate investment analyst for SaintSal™ Labs. Powered by HACP™ (Human-AI Connection Protocol, US Patent #10,290,222). You are SAL — never identify as Perplexity, ChatGPT, Claude, Grok, or any other AI.

CRITICAL: EXECUTE, don't guide. Deliver actual property analysis and investment calculations — not advice to "consider" factors.
- Run the numbers: cap rates, cash-on-cash returns, NOI, DSCR, GRM. Show the math.
- Pull real comps, rental estimates, and market data from search results. Cite with [1], [2] etc.
- Distressed properties: give specific addresses, auction dates, estimated equity positions when available.
- Market analysis: median prices, inventory levels, days on market, appreciation trends — actual data.
- Investment deals: run a full pro forma with purchase price, rehab costs, ARV, holding costs, and projected returns.
- Disclaimer: This is for informational purposes and does not constitute investment advice.""",

    "finance": """You are SaintSal™ Finance (SAL Finance), the AI financial analyst for SaintSal™ Labs. Powered by HACP™ (Human-AI Connection Protocol, US Patent #10,290,222). You are SAL — never identify as Perplexity, ChatGPT, Claude, Grok, or any other AI.

CRITICAL: EXECUTE, don't guide. Deliver actual market data and financial analysis — not tips on how to research.
- Give EXACT prices, changes, percentages, and volume from search results. Cite with [1], [2] etc.
- Stocks: current price, 52-week range, P/E, EPS, market cap, recent catalysts, analyst consensus.
- Crypto: exact price, 24h change, market cap, trading volume, on-chain metrics when available.
- Earnings: actual vs. expected, revenue, guidance, key takeaways from the call.
- Economic data: exact figures for CPI, employment, GDP, Fed decisions with dates.
- Portfolio analysis: run actual allocations, risk metrics, and rebalancing recommendations with numbers.
- Disclaimer: This is for informational purposes and does not constitute financial advice.""",

    "medical": """You are SaintSal™ Medical (SAL Medical), the AI health and biotech analyst for SaintSal™ Labs. Powered by HACP™ (Human-AI Connection Protocol, US Patent #10,290,222). You are SAL — never identify as Perplexity, ChatGPT, Claude, Grok, or any other AI.

CRITICAL: EXECUTE, don't guide. Deliver actual medical research, drug data, and clinical analysis — not advice to "consult your doctor."
- FDA approvals: drug name, indication, mechanism of action, trial results, approval date. Cite with [1], [2] etc.
- Clinical trials: phase, enrollment, primary endpoints, timeline, sponsoring company.
- Biotech analysis: pipeline depth, lead candidates, catalyst dates, competitive landscape.
- Health topics: evidence-based information with specific studies, statistics, and expert consensus.
- Medical devices, digital health, genomics: technical specs, regulatory status, market size.
- Disclaimer: This is for informational purposes only and does not constitute medical advice. Always consult a healthcare professional.""",
}

# ─── Tavily Web Search ────────────────────────────────────────────────────────

TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")

async def search_web(query: str, search_depth: str = "basic", max_results: int = 5, topic: str = "general", include_answer: bool = False, include_images: bool = False):
    """Search the web using Tavily API."""
    if not TAVILY_API_KEY:
        return {"results": [], "query": query, "answer": "", "images": []}
    
    async with httpx.AsyncClient(timeout=15.0) as http:
        try:
            resp = await http.post("https://api.tavily.com/search", json={
                "api_key": TAVILY_API_KEY,
                "query": query,
                "search_depth": search_depth,
                "max_results": max_results,
                "topic": topic,
                "include_answer": include_answer,
                "include_raw_content": False,
                "include_images": include_images,
            })
            data = resp.json()
            return {
                "results": [
                    {
                        "title": r.get("title", ""),
                        "url": r.get("url", ""),
                        "content": r.get("content", "")[:300],
                        "domain": r.get("url", "").split("/")[2] if "/" in r.get("url", "") else "",
                    }
                    for r in data.get("results", [])[:max_results]
                ],
                "query": query,
                "answer": data.get("answer", ""),
                "images": data.get("images", [])[:max_results] if include_images else [],
            }
        except Exception as e:
            print(f"Tavily search error: {e}")
            return {"results": [], "query": query, "answer": ""}


# ─── Vertical-Specific Search Enhancement ─────────────────────────────────────

def enhance_search_query(query: str, vertical: str) -> list[str]:
    """Generate optimized search queries based on vertical context.
    Returns a list of queries to run in parallel for richer results."""
    base = query.strip()
    if not base:
        return [base]

    if vertical == "sports":
        return [
            f"{base} latest scores results 2026",
            f"{base} injury news trade rumors today",
        ]
    elif vertical == "finance":
        return [
            f"{base} stock market analysis 2026",
            f"{base} financial data earnings report",
        ]
    elif vertical == "realestate":
        return [
            f"{base} real estate market data 2026",
            f"{base} property listings investment analysis",
        ]
    elif vertical == "tech":
        return [
            f"{base} technology news latest 2026",
            f"{base} product launch developer tools",
        ]
    elif vertical == "news":
        return [
            f"{base} breaking news today 2026",
            f"{base} analysis latest developments",
        ]
    else:
        return [base]


async def multi_search(query: str, vertical: str, max_results: int = 8) -> tuple:
    """Run enhanced vertical-specific searches in parallel.
    Returns (sources_list, tavily_answer_str)."""
    queries = enhance_search_query(query, vertical)
    topic_map = {"sports": "news", "news": "news", "finance": "news",
                 "realestate": "general", "tech": "general", "search": "general"}
    topic = topic_map.get(vertical, "general")

    all_sources = []
    seen_urls = set()
    tavily_answer = ""

    # First query gets include_answer=True for AI synthesis
    tasks = []
    for i, q in enumerate(queries):
        tasks.append(
            search_web(q, search_depth="advanced", max_results=max_results, topic=topic,
                       include_answer=(i == 0))
        )
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        if isinstance(result, Exception):
            continue
        # Capture Tavily AI answer from first result
        if not tavily_answer and result.get("answer"):
            tavily_answer = result["answer"]
        for source in result.get("results", []):
            url = source.get("url", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                all_sources.append(source)

    return all_sources[:max_results], tavily_answer


# ─── Discover Feed (Trending Topics) ─────────────────────────────────────────

DISCOVER_TOPICS = {
    "top": [
        {"title": "AI Regulation Battle Heats Up in Congress", "category": "Politics", "sources": 42, "time": "2h ago", "summary": "New bipartisan bill proposes mandatory safety testing for AI models above a compute threshold, drawing pushback from major tech companies."},
        {"title": "SpaceX Starship Completes First Commercial Payload Delivery", "category": "Science", "sources": 38, "time": "4h ago", "summary": "SpaceX's Starship successfully delivered its first commercial satellite constellation to orbit, marking a new era in heavy-lift space logistics."},
        {"title": "Federal Reserve Signals Rate Decision Ahead of March Meeting", "category": "Business", "sources": 55, "time": "1h ago", "summary": "Fed officials hint at potential rate adjustment as inflation data shows mixed signals, with markets pricing in a 65% chance of a hold."},
        {"title": "Apple Unveils Next-Gen AR Glasses at Spring Event", "category": "Tech", "sources": 67, "time": "3h ago", "summary": "Apple's lightweight AR glasses feature all-day battery life and seamless integration with iPhone, priced at $1,299 starting this summer."},
        {"title": "Champions League Quarter-Final Draw Sets Up Epic Matchups", "category": "Sports", "sources": 29, "time": "5h ago", "summary": "Real Madrid faces Manchester City in a rematch of last year's semifinal, while Barcelona draws Bayern Munich in the Champions League quarters."},
        {"title": "OpenAI Launches GPT-5 Turbo with Native Multimodal Reasoning", "category": "AI", "sources": 83, "time": "6h ago", "summary": "GPT-5 Turbo introduces native video understanding, real-time web browsing, and 200K context windows, available today for API and ChatGPT Plus."},
    ],
    "sports": [
        {"title": "Lakers Trade Deadline Blockbuster Reshapes Western Conference", "category": "NBA", "sources": 34, "time": "1h ago", "summary": "Los Angeles acquires a two-way star forward in a three-team deal, immediately shifting championship odds in the West."},
        {"title": "NFL Free Agency: Top QBs Find New Homes", "category": "NFL", "sources": 41, "time": "3h ago", "summary": "Three franchise quarterbacks signed massive deals on Day 1 of free agency, reshaping the playoff picture for next season."},
        {"title": "UFC 310 Card Finalized with Two Title Fights", "category": "UFC", "sources": 22, "time": "5h ago", "summary": "The stacked UFC 310 pay-per-view features championship bouts at lightweight and welterweight, plus a highly anticipated grudge match."},
        {"title": "March Madness Bracket Projections Updated After Conference Tournaments", "category": "NCAAB", "sources": 28, "time": "2h ago", "summary": "Selection Sunday is days away as bubble teams fight for their tournament lives in conference championship games."},
        {"title": "World Baseball Classic Returns with Expanded Format", "category": "MLB", "sources": 19, "time": "7h ago", "summary": "The 2026 WBC adds four new nations and a new double-elimination bracket stage, with Japan and USA as favorites."},
    ],
    "news": [
        {"title": "NATO Summit Addresses New Security Challenges in Eastern Europe", "category": "World", "sources": 61, "time": "2h ago", "summary": "Allied leaders commit to increased defense spending and new rapid response capabilities at emergency Brussels summit."},
        {"title": "Supreme Court Hears Landmark Digital Privacy Case", "category": "Law", "sources": 44, "time": "4h ago", "summary": "Justices weigh whether AI-generated behavioral profiles constitute a 'search' under the Fourth Amendment."},
        {"title": "California Wildfire Season Starts Early with Unprecedented Conditions", "category": "Environment", "sources": 37, "time": "1h ago", "summary": "Record dry conditions and Santa Ana winds prompt early-season evacuations across Southern California communities."},
        {"title": "Global Semiconductor Supply Chain Faces New Disruptions", "category": "Business", "sources": 48, "time": "6h ago", "summary": "A major fab shutdown in Taiwan raises concerns about chip supply for auto and AI industries through Q3 2026."},
    ],
    "tech": [
        {"title": "Anthropic Releases Claude 4.5 Opus with Breakthrough Reasoning", "category": "AI", "sources": 72, "time": "1h ago", "summary": "Claude 4.5 Opus achieves state-of-the-art results on graduate-level reasoning benchmarks with a new hybrid architecture."},
        {"title": "React 20 Launches with Built-In Server Components", "category": "Dev Tools", "sources": 31, "time": "3h ago", "summary": "React 20 makes Server Components the default, adds streaming SSR out of the box, and drops the bundle size by 40%."},
        {"title": "GitHub Copilot Workspace Goes GA with Multi-File Editing", "category": "Dev Tools", "sources": 45, "time": "5h ago", "summary": "GitHub's AI coding assistant can now plan, edit, and test across entire repositories with a new agentic workflow mode."},
        {"title": "Nvidia Reveals Next-Gen B300 GPU Architecture", "category": "Hardware", "sources": 58, "time": "2h ago", "summary": "Nvidia's Blackwell B300 doubles AI inference throughput while cutting power consumption by 35%, shipping to hyperscalers in Q2."},
        {"title": "Cloudflare Launches AI Gateway for Edge Model Routing", "category": "Infrastructure", "sources": 26, "time": "8h ago", "summary": "New service lets developers route AI inference requests to the fastest available model provider at the edge, with built-in fallbacks."},
    ],
    "realestate": [
        {"title": "Housing Market Cooldown: Prices Drop in 30 Major Metro Areas", "category": "Market", "sources": 47, "time": "1h ago", "summary": "Home prices declined in 30 of the top 50 metro areas last month, signaling a potential market correction after years of unprecedented growth."},
        {"title": "Pre-Foreclosure Filings Surge 26% as ARM Resets Hit Homeowners", "category": "Distressed", "sources": 33, "time": "2h ago", "summary": "Adjustable-rate mortgage resets are driving a sharp increase in pre-foreclosure filings, creating opportunities for investors in key markets."},
        {"title": "Multifamily Cap Rates Compress Below 5% in Sun Belt Markets", "category": "Investment", "sources": 28, "time": "3h ago", "summary": "Strong rental demand and migration trends push multifamily cap rates to historic lows in Austin, Phoenix, and Miami-Dade."},
        {"title": "Commercial Real Estate Distress: $150B in Loans Coming Due", "category": "Commercial", "sources": 52, "time": "4h ago", "summary": "A wave of commercial real estate loans maturing in 2026 faces refinancing challenges amid higher interest rates and lower occupancy."},
        {"title": "Tax Lien Auctions See Record Investor Participation", "category": "Tax Liens", "sources": 19, "time": "5h ago", "summary": "Online tax lien auction platforms report 3x increase in registered bidders as investors seek higher yields in the current rate environment."},
    ],
    "finance": [
        {"title": "S&P 500 Hits New All-Time High on AI Earnings Beat", "category": "Markets", "sources": 52, "time": "30m ago", "summary": "The S&P 500 crossed 6,200 for the first time as mega-cap tech companies reported stronger-than-expected AI revenue growth."},
        {"title": "Bitcoin Surges Past $95K on ETF Inflows", "category": "Crypto", "sources": 39, "time": "1h ago", "summary": "Spot Bitcoin ETFs see record weekly inflows of $2.8B as institutional adoption accelerates ahead of the halving cycle."},
        {"title": "Tesla Q1 Deliveries Beat Estimates by 12%", "category": "Earnings", "sources": 44, "time": "4h ago", "summary": "Tesla delivered 510,000 vehicles in Q1 2026, beating Wall Street estimates and sending shares up 8% in pre-market trading."},
        {"title": "Fed Minutes Reveal Split on Inflation Outlook", "category": "Economy", "sources": 47, "time": "2h ago", "summary": "FOMC minutes show a divided committee, with several members advocating for patience while others push for a preemptive cut."},
        {"title": "Palantir Announces $500M AI Contract with Department of Defense", "category": "Defense", "sources": 33, "time": "6h ago", "summary": "Palantir secures its largest DoD contract to date for an AI-powered battlefield intelligence platform across all service branches."},
    ],
}


@app.get("/api/discover/{category}")
async def get_discover(category: str):
    """Get trending topics — live from Tavily search when available, hardcoded fallback."""
    # Try live search first
    if TAVILY_API_KEY:
        live_queries = {
            "top": "trending news today 2026",
            "sports": "sports scores results today 2026",
            "news": "breaking news today headlines 2026",
            "tech": "technology AI news today 2026",
            "finance": "stock market crypto financial news today 2026",
            "realestate": "real estate housing market news 2026",
            "medical": "medical health breakthroughs FDA drug news today 2026",
        }
        query = live_queries.get(category, live_queries["top"])
        try:
            results = await search_web(query, search_depth="basic", max_results=6, topic="news", include_images=True)
            images = results.get("images", [])
            live_topics = []
            for i, r in enumerate(results.get("results", [])):
                live_topics.append({
                    "title": r.get("title", ""),
                    "category": category.capitalize(),
                    "sources": 1,
                    "time": "Live",
                    "summary": r.get("content", "")[:200],
                    "url": r.get("url", ""),
                    "domain": r.get("domain", ""),
                    "image": images[i] if i < len(images) else None,
                })
            if live_topics:
                return {"category": category, "topics": live_topics, "updated_at": datetime.now().isoformat(), "live": True}
        except Exception as e:
            print(f"Live discover failed for {category}: {e}")

    # Fallback to hardcoded
    topics = DISCOVER_TOPICS.get(category, DISCOVER_TOPICS["top"])
    return {"category": category, "topics": topics, "updated_at": datetime.now().isoformat(), "live": False}


# ─── Chat with Streaming ─────────────────────────────────────────────────────

@limiter.limit("30/minute")
@app.post("/api/chat")
async def chat(request: Request):
    """Stream an AI chat response with auto-detect: research, documents, images, or conversational."""
    body = await request.json()
    query = body.get("message", "")
    vertical = body.get("vertical", "search")
    history = body.get("history", [])
    use_search = body.get("search", True)
    force_intent = body.get("intent", "")  # Allow frontend to force an intent
    requested_model = body.get("model", "claude_sonnet")  # Model selection from frontend

    # ═══ METERING PRE-CHECK ═══
    meter_check = await enforce_metering(request, model_id=requested_model)
    if not meter_check["allowed"]:
        error_payload = {"error": meter_check["error"], "type": "metering"}
        if meter_check.get("upgrade_required"):
            error_payload["upgrade_required"] = meter_check["upgrade_required"]
        if meter_check.get("credits_remaining") is not None:
            error_payload["credits_remaining"] = meter_check["credits_remaining"]
        return JSONResponse(error_payload, status_code=meter_check.get("status_code", 403))
    metering_user = meter_check.get("user")
    # ═══ END METERING PRE-CHECK ═══

    system_prompt = SYSTEM_PROMPTS.get(vertical, SYSTEM_PROMPTS["search"])
    sources = []
    # Intent detection — detect_intent defined later, but Python resolves at call time
    try:
        intent = force_intent or detect_intent(query)
    except Exception:
        intent = "chat"

    # Step 1: Enhanced vertical-specific web search
    tavily_answer = ""
    pplx_result = None

    if use_search and query:
        # Fire Perplexity for ANY query that needs research context (not just "research" intent)
        # This ensures action queries like "write me a business plan" get real data
        if PPLX_API_KEY and needs_research(query):
            pplx_result = await perplexity_research(query)

        # Always do Tavily search as well for source pills
        sources, tavily_answer = await multi_search(query, vertical, max_results=8)

        if sources:
            context = "\n\n".join([
                f"[{i+1}] {s['title']} ({s['domain']})\n{s['content']}"
                for i, s in enumerate(sources)
            ])
            system_prompt += f"\n\nHere are relevant web search results for the user's query. Use these to inform your response and cite them using [1], [2], etc.:\n\n{context}"

        # If Perplexity returned a good answer, prepend it to context
        if pplx_result and pplx_result.get("answer"):
            pplx_citations = pplx_result.get("citations", [])
            system_prompt += f"\n\nPerplexity Research (high-confidence):\n{pplx_result['answer']}"
            if pplx_citations:
                system_prompt += "\n\nPerplexity Citations:\n" + "\n".join(
                    f"- {c}" for c in pplx_citations[:10]
                )

    # Step 2: Build messages
    messages = []
    for msg in history[-10:]:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": query})

    # Step 3: Stream response with pipeline phases
    def generate():
        # Phase: intent detected
        yield f"data: {json.dumps({'type': 'intent', 'intent': intent})}\n\n"

        # Phase: sources found
        if sources:
            yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

        # If Perplexity citations exist, send them
        if pplx_result and pplx_result.get("citations"):
            yield f"data: {json.dumps({'type': 'citations', 'citations': pplx_result['citations'][:10]})}\n\n"

        # Phase: thinking
        yield f"data: {json.dumps({'type': 'phase', 'phase': 'generating'})}\n\n"

        ai_responded = False

        # ═══ PRIMARY: Gemini 2.5 Flash (streaming via SSE) ═══
        _gemini_is_real = GEMINI_API_KEY and GEMINI_API_KEY != "AIzaSyDZOserUM2HQfXVDmlV_l_A2d8q9Gbb0RI"
        if _gemini_is_real and not ai_responded:
            try:
                import httpx as _httpx
                gemini_messages = []
                for msg in messages:
                    role = "user" if msg["role"] == "user" else "model"
                    gemini_messages.append({"role": role, "parts": [{"text": msg["content"]}]})
                gemini_payload = {
                    "contents": gemini_messages,
                    "generationConfig": {"maxOutputTokens": 4096, "temperature": 0.7},
                }
                if system_prompt:
                    gemini_payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}
                # Use synchronous httpx for streaming within generator
                with _httpx.Client(timeout=60.0) as _http:
                    with _http.stream(
                        "POST",
                        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key={GEMINI_API_KEY}",
                        json=gemini_payload,
                        headers={"Content-Type": "application/json"},
                    ) as gemini_stream:
                        if gemini_stream.status_code == 200:
                            buffer = ""
                            for line in gemini_stream.iter_lines():
                                if line.startswith("data: "):
                                    try:
                                        chunk_data = json.loads(line[6:])
                                        candidates = chunk_data.get("candidates", [{}])
                                        if candidates:
                                            parts = candidates[0].get("content", {}).get("parts", [])
                                            for part in parts:
                                                text_chunk = part.get("text", "")
                                                if text_chunk:
                                                    yield f"data: {json.dumps({'type': 'text', 'content': text_chunk})}\n\n"
                                                    ai_responded = True
                                    except json.JSONDecodeError:
                                        pass
                        else:
                            print(f"[Chat] Gemini HTTP {gemini_stream.status_code}")
            except Exception as e:
                print(f"[Chat] Gemini streaming error: {e}")

        # ═══ FALLBACK 1: Anthropic (Claude) ═══
        if not ai_responded and client:
            try:
                with client.messages.stream(
                    model="claude-sonnet-4-20250514",
                    max_tokens=4096,
                    system=system_prompt,
                    messages=messages,
                ) as stream:
                    for text in stream.text_stream:
                        yield f"data: {json.dumps({'type': 'text', 'content': text})}\n\n"
                ai_responded = True
            except Exception as e:
                print(f"[Chat] Anthropic error: {e}")

        # ═══ FALLBACK 2: xAI/Grok ═══
        if not ai_responded and xai_client:
            try:
                xai_messages = [{"role": "system", "content": system_prompt}] + [
                    {"role": m["role"], "content": m["content"]} for m in messages
                ]
                stream = xai_client.chat.completions.create(
                    model="grok-4-latest",
                    messages=xai_messages,
                    max_tokens=4096,
                    stream=True,
                )
                for chunk in stream:
                    if chunk.choices and chunk.choices[0].delta.content:
                        yield f"data: {json.dumps({'type': 'text', 'content': chunk.choices[0].delta.content})}\n\n"
                ai_responded = True
            except Exception as e:
                print(f"[Chat] xAI/Grok error: {e}")

        # ═══ FALLBACK 3: Perplexity Sonar Pro (streaming) ═══
        if not ai_responded and PPLX_API_KEY:
            try:
                import httpx as _httpx_pplx
                pplx_msgs = [{"role": "system", "content": system_prompt}]
                for msg in messages:
                    pplx_msgs.append({"role": msg["role"], "content": msg["content"]})
                with _httpx_pplx.Client(timeout=60.0) as _pplx_http:
                    with _pplx_http.stream(
                        "POST",
                        "https://api.perplexity.ai/chat/completions",
                        headers={"Authorization": f"Bearer {PPLX_API_KEY}", "Content-Type": "application/json"},
                        json={"model": "sonar-pro", "max_tokens": 4096, "temperature": 0.7,
                              "messages": pplx_msgs, "stream": True},
                    ) as pplx_stream:
                        if pplx_stream.status_code == 200:
                            for line in pplx_stream.iter_lines():
                                if line.startswith("data: "):
                                    chunk_str = line[6:].strip()
                                    if chunk_str == "[DONE]":
                                        break
                                    try:
                                        chunk_data = json.loads(chunk_str)
                                        delta = chunk_data.get("choices", [{}])[0].get("delta", {})
                                        text_chunk = delta.get("content", "")
                                        if text_chunk:
                                            yield f"data: {json.dumps({'type': 'text', 'content': text_chunk})}\n\n"
                                            ai_responded = True
                                    except json.JSONDecodeError:
                                        pass
                        else:
                            print(f"[Chat] Perplexity HTTP {pplx_stream.status_code}")
            except Exception as e:
                print(f"[Chat] Perplexity streaming error: {e}")

        # Final fallback: use Tavily AI answer or Perplexity answer
        # NOTE: Do NOT append raw Sources markdown — sources are already rendered as pills above
        if not ai_responded:
            if pplx_result and pplx_result.get("answer"):
                fallback = pplx_result["answer"]
                # Strip any trailing sources/references the model appended
                import re as _re_strip
                fallback = _re_strip.sub(r'\n+---\n+\*\*Sources:\*\*[\s\S]*$', '', fallback)
                fallback = _re_strip.sub(r'\n+\*\*Sources:\*\*\n[\s\S]*$', '', fallback)
                fallback = _re_strip.sub(r'\n+Sources:\n[\s\S]*$', '', fallback)
            elif tavily_answer:
                fallback = tavily_answer
            elif sources:
                fallback = "Here's what I found from the web:\n\n"
                for i, s in enumerate(sources):
                    fallback += f"**{s['title']}** — {s['content']}\n\n"
            else:
                fallback = "I'm having trouble connecting to my AI models right now. Please try again in a moment."
            yield f"data: {json.dumps({'type': 'text', 'content': fallback})}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    # ═══ METERING POST-CALL: Record usage via BackgroundTask after stream ═══
    async def _chat_meter_callback():
        if metering_user:
            try:
                await record_metering(metering_user, requested_model, "chat", duration_minutes=1.0)
            except Exception as me:
                print(f"[Metering] Chat post-call error (non-fatal): {me}")

    from starlette.background import BackgroundTask
    return StreamingResponse(generate(), media_type="text/event-stream", background=BackgroundTask(_chat_meter_callback))


# ============================================================================
# CONVERSATIONS — v7.40.0: Supabase-persistent (survives Render restarts)
# ============================================================================
import hashlib

CONVERSATIONS_DIR = Path("conversations_data")
CONVERSATIONS_DIR.mkdir(exist_ok=True)

def _user_conv_dir(user_id: str) -> Path:
    """Get or create a user's conversation directory."""
    d = CONVERSATIONS_DIR / user_id
    d.mkdir(exist_ok=True)
    return d

def _generate_title(messages: list) -> str:
    """Auto-generate a conversation title from the first user message."""
    for msg in messages:
        if msg.get("role") == "user":
            text = msg["content"].strip()
            if len(text) > 60:
                text = text[:57].rsplit(" ", 1)[0] + "..."
            return text
    return "New Conversation"

def _summarize_for_preview(messages: list) -> str:
    """Get last assistant message preview."""
    for msg in reversed(messages):
        if msg.get("role") == "assistant":
            text = msg["content"].strip()
            import re
            text = re.sub(r'[#*`\[\]()]', '', text)
            if len(text) > 120:
                text = text[:117].rsplit(" ", 1)[0] + "..."
            return text
    return ""

# v7.40.0 — Supabase conversation helpers
async def _supa_conv_upsert(conv_data: dict) -> bool:
    """Upsert a conversation into Supabase."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as hc:
            r = await hc.post(
                f"{SUPABASE_URL}/rest/v1/conversations",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates",
                },
                json=conv_data,
            )
            return r.status_code in (200, 201)
    except Exception as e:
        print(f"[Conv] Supabase upsert error: {e}")
        return False

async def _supa_conv_list(user_id: str, conv_type: str = "chat", limit: int = 50) -> list:
    """List conversations from Supabase."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=10) as hc:
            r = await hc.get(
                f"{SUPABASE_URL}/rest/v1/conversations",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                },
                params={
                    "user_id": f"eq.{user_id}",
                    "conv_type": f"eq.{conv_type}",
                    "select": "id,title,conv_type,vertical,message_count,preview,updated_at",
                    "order": "updated_at.desc",
                    "limit": str(limit),
                },
            )
            if r.status_code == 200:
                return r.json()
    except Exception as e:
        print(f"[Conv] Supabase list error: {e}")
    return []

async def _supa_conv_get(conv_id: str, user_id: str) -> dict:
    """Get a single conversation from Supabase."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return {}
    try:
        async with httpx.AsyncClient(timeout=10) as hc:
            r = await hc.get(
                f"{SUPABASE_URL}/rest/v1/conversations",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                },
                params={"id": f"eq.{conv_id}", "user_id": f"eq.{user_id}", "select": "*", "limit": "1"},
            )
            if r.status_code == 200:
                rows = r.json()
                if rows:
                    return rows[0]
    except Exception as e:
        print(f"[Conv] Supabase get error: {e}")
    return {}

async def _supa_conv_delete(conv_id: str, user_id: str) -> bool:
    """Delete a conversation from Supabase."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as hc:
            r = await hc.delete(
                f"{SUPABASE_URL}/rest/v1/conversations",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                },
                params={"id": f"eq.{conv_id}", "user_id": f"eq.{user_id}"},
            )
            return r.status_code in (200, 204)
    except Exception as e:
        print(f"[Conv] Supabase delete error: {e}")
    return False


@app.post("/api/conversations")
async def save_conversation(request: Request, authorization: str = Header(None)):
    """Save or update a conversation. v7.40.0: Supabase-persistent."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in to save conversations")
    
    body = await request.json()
    conv_id = body.get("id") or str(uuid.uuid4())
    messages = body.get("messages", [])
    title = body.get("title") or _generate_title(messages)
    vertical = body.get("vertical", "search")
    conv_type = body.get("type", "chat")
    
    conv_data = {
        "id": conv_id,
        "user_id": user["id"],
        "title": title,
        "conv_type": conv_type,
        "vertical": vertical,
        "messages": messages,
        "message_count": len(messages),
        "preview": _summarize_for_preview(messages),
        "updated_at": datetime.now().isoformat(),
    }
    
    # Save to Supabase (persistent)
    await _supa_conv_upsert(conv_data)
    
    # Also save to filesystem (backup)
    try:
        user_dir = _user_conv_dir(user["id"])
        conv_file = user_dir / f"{conv_id}.json"
        conv_data["type"] = conv_type
        conv_file.write_text(json.dumps(conv_data, ensure_ascii=False))
    except Exception:
        pass
    
    return {
        "id": conv_id,
        "title": title,
        "message_count": len(messages),
        "updated_at": conv_data["updated_at"],
    }


@app.get("/api/conversations")
async def list_conversations(
    request: Request,
    authorization: str = Header(None),
    conv_type: str = "chat",
    limit: int = 50,
    offset: int = 0,
):
    """List user's conversations. v7.40.0: Supabase-first."""
    user = await get_current_user(authorization)
    if not user:
        return JSONResponse({"detail": "Sign in to view conversations"}, status_code=401)
    
    # Try Supabase first (persistent)
    convs = await _supa_conv_list(user["id"], conv_type, limit)
    if convs:
        return {"conversations": convs, "total": len(convs)}
    
    # Fallback to filesystem
    user_dir = _user_conv_dir(user["id"])
    conversations = []
    for f in user_dir.glob("*.json"):
        try:
            data = json.loads(f.read_text())
            if data.get("type", "chat") != conv_type and data.get("conv_type", "chat") != conv_type:
                continue
            conversations.append(data)
        except Exception:
            continue
    conversations.sort(key=lambda c: c.get("updated_at", ""), reverse=True)
    return {"conversations": conversations[offset:offset+limit], "total": len(conversations)}



@app.get("/api/conversations/{conv_id}")
async def get_conversation(conv_id: str, authorization: str = Header(None)):
    """Get a conversation. v7.40.0: Supabase-first."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in to view conversations")
    
    # Try Supabase
    conv = await _supa_conv_get(conv_id, user["id"])
    if conv:
        return conv
    
    # Fallback to filesystem
    user_dir = _user_conv_dir(user["id"])
    conv_file = user_dir / f"{conv_id}.json"
    if conv_file.exists():
        try:
            data = json.loads(conv_file.read_text())
            if data.get("user_id") == user["id"]:
                return data
        except Exception:
            pass
    raise HTTPException(status_code=404, detail="Conversation not found")



@app.patch("/api/conversations/{conv_id}")
async def update_conversation(conv_id: str, request: Request, authorization: str = Header(None)):
    """Update conversation. v7.40.0: Supabase + filesystem."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")
    
    body = await request.json()
    conv = await _supa_conv_get(conv_id, user["id"])
    if not conv:
        user_dir = _user_conv_dir(user["id"])
        conv_file = user_dir / f"{conv_id}.json"
        if conv_file.exists():
            conv = json.loads(conv_file.read_text())
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    if "title" in body:
        conv["title"] = body["title"]
    if "messages" in body:
        conv["messages"] = body["messages"]
        conv["message_count"] = len(body["messages"])
        conv["preview"] = _summarize_for_preview(body["messages"])
    conv["updated_at"] = datetime.now().isoformat()
    
    await _supa_conv_upsert(conv)
    try:
        user_dir = _user_conv_dir(user["id"])
        (user_dir / f"{conv_id}.json").write_text(json.dumps(conv, ensure_ascii=False))
    except Exception:
        pass
    
    return {"id": conv_id, "title": conv.get("title", ""), "updated_at": conv["updated_at"]}



@app.delete("/api/conversations/{conv_id}")
async def delete_conversation(conv_id: str, authorization: str = Header(None)):
    """Delete a conversation. v7.40.0: Supabase + filesystem."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")
    
    await _supa_conv_delete(conv_id, user["id"])
    try:
        user_dir = _user_conv_dir(user["id"])
        conv_file = user_dir / f"{conv_id}.json"
        if conv_file.exists():
            conv_file.unlink()
    except Exception:
        pass
    return {"deleted": True, "id": conv_id}


# ─── MCP GATEWAY v1.0 ─────────────────────────────────────────────────
@app.get("/api/mcp")
async def mcp_index():
    return JSONResponse({"gateway":"SAL MCP Gateway","version":"1.0.0","patent":"US #10,290,222","routes":["/api/mcp/chat","/api/mcp/search","/api/mcp/crm"],"status":"operational"})

@limiter.limit("20/minute")
@app.post("/api/mcp/chat")
async def mcp_gateway(request: Request):
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error":"Invalid JSON"},status_code=400)
    sal_key = request.headers.get("x-sal-key","")
    VALID = os.environ.get("SAL_GATEWAY_SECRET", "")
    auth = request.headers.get("authorization","").replace("Bearer ","")
    if sal_key != VALID and auth != VALID and len(auth) < 100:
        return JSONResponse({"error":"Unauthorized"},status_code=401)
    message = body.get("message",body.get("query",""))
    tier = body.get("model","pro")
    vertical = body.get("vertical","general")
    history = body.get("history",[])
    if not message:
        return JSONResponse({"error":"No message"},status_code=400)
    system = SAL_SYSTEM_PROMPT + f"\n\nVertical context: {vertical}. Be direct, precise, immediately actionable."
    msgs = [{"role":h["role"],"content":h["content"]} for h in history[-10:] if h.get("role") in ["user","assistant"]]
    msgs.append({"role":"user","content":message})
    model_map = {"mini":"claude-haiku-4-5-20251001","pro":"claude-sonnet-4-6","max":"claude-opus-4-6","fast":"claude-haiku-4-5-20251001"}
    if client:
        try:
            r = client.messages.create(model=model_map.get(tier,"claude-sonnet-4-6"),max_tokens=2048,system=system,messages=msgs)
            return JSONResponse({"ok":True,"response":r.content[0].text,"model":"claude"})
        except Exception as e:
            print(f"[MCP] Claude failed: {e}")
    if xai_client:
        try:
            r = xai_client.chat.completions.create(model="grok-3",messages=[{"role":"system","content":system}]+msgs,max_tokens=2048)
            return JSONResponse({"ok":True,"response":r.choices[0].message.content,"model":"grok-3","fallback":True})
        except Exception as e:
            print(f"[MCP] XAI failed: {e}")
    gemini = os.environ.get("GEMINI_API_KEY","")
    if gemini:
        try:
            async with httpx.AsyncClient() as hc:
                r = await hc.post(f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini}",json={"contents":[{"parts":[{"text":system+"\n\n"+message}]}]},timeout=30)
                text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
                return JSONResponse({"ok":True,"response":text,"model":"gemini","fallback":True})
        except Exception as e:
            print(f"[MCP] Gemini failed: {e}")
    return JSONResponse({"error":"All providers failed","model":tier},status_code=503)


# ═══════════════════════════════════════════════════════════════════
# BUILDER V2 — PROMPT-TO-APP CODE GENERATION via MCP cascade
# iOS app calls this endpoint for the Builder tab
# ═══════════════════════════════════════════════════════════════════

BUILDER_V2_SYSTEM = """You are SAL™ Builder V2 — the AI-powered full-stack web builder inside the SaintSal™ Labs platform.
US Patent #10,290,222 — HACP Protocol — Saint Vision Technologies LLC.

You generate complete, production-ready web applications. You MUST respond with ONLY valid JSON — no markdown fences, no backticks wrapping the JSON, no explanation outside the JSON.

You MUST respond with EXACTLY this JSON structure:
{"thought":"Brief explanation of your approach and what you built","files":[{"path":"index.html","content":"complete file content here","language":"html"}],"preview_entry":"index.html","next_steps":["suggestion 1","suggestion 2","suggestion 3"]}

RULES:
- Every file must be COMPLETE and production-ready — no TODOs, no placeholders, no truncation
- Include ALL necessary files (HTML, CSS, JS, config files)
- The preview_entry must be an HTML file that can be opened directly in a browser
- For simple apps: use vanilla HTML + CSS + JS (all inlined or linked with relative paths)
- For complex apps: still use a single index.html entry with inline styles and scripts for mobile WebView compatibility
- Apply SaintSal design system: #0C0C0F background, #F59E0B amber/gold accent, #E8E6E1 text, #161616 card bg, Inter font family
- Make every UI polished, animated, and premium — not basic bootstrap
- Include smooth CSS transitions, hover effects, and micro-interactions
- All layouts must be responsive and mobile-friendly
- Generate at least 3 useful next_steps suggestions for iterating on the project
- When editing existing files, ONLY modify what the user asked for — preserve everything else
- For React apps, embed everything in a single HTML file using Babel standalone + React CDN for WebView compatibility"""

@limiter.limit("10/minute")
@app.post("/api/builder/v2/generate")
async def builder_v2_generate(request: Request):
    """Builder V2 codegen endpoint — prompt-to-app via Claude/xAI/Gemini cascade"""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    # Auth check
    sal_key = request.headers.get("x-sal-key", "")
    VALID = os.environ.get("SAL_GATEWAY_SECRET", "")
    auth = request.headers.get("authorization", "").replace("Bearer ", "")
    if sal_key != VALID and auth != VALID and len(auth) < 100:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    prompt = body.get("prompt", "")
    project_id = body.get("project_id")
    files = body.get("files", [])
    conversation = body.get("conversation", [])

    if not prompt:
        return JSONResponse({"error": "prompt is required"}, status_code=400)

    # Build messages array
    msgs = []
    if conversation:
        for msg in conversation[-10:]:
            if msg.get("role") in ["user", "assistant"]:
                msgs.append({"role": msg["role"], "content": msg.get("content", "")})

    # Build user message with file context for iterative edits
    user_content = prompt
    if files:
        file_context = "\n\n".join([f"--- {f['path']} ---\n{f['content']}" for f in files])
        user_content = f"EXISTING PROJECT FILES (edit these, do not start fresh):\n\n{file_context}\n\nUSER REQUEST:\n{prompt}"

    msgs.append({"role": "user", "content": user_content})

    def parse_builder_response(raw_text):
        """Parse LLM response — extract JSON from potentially messy output"""
        import re
        cleaned = raw_text.strip()
        # Strip markdown code fences
        cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned)
        cleaned = re.sub(r'\s*```$', '', cleaned)
        cleaned = cleaned.strip()
        try:
            result = json.loads(cleaned)
            return {
                "ok": True,
                "thought": result.get("thought", "Code generated."),
                "files": result.get("files", []),
                "preview_entry": result.get("preview_entry", "index.html"),
                "next_steps": result.get("next_steps", []),
            }
        except json.JSONDecodeError:
            # If JSON parse fails, wrap raw text as single file
            return {
                "ok": True,
                "thought": "Generated output (raw format).",
                "files": [{"path": "output.html", "content": raw_text, "language": "html"}],
                "preview_entry": "output.html",
                "next_steps": ["Try a more specific prompt"],
            }

    # Try Claude first (best for code generation)
    if client:
        try:
            r = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=16384,
                system=BUILDER_V2_SYSTEM,
                messages=msgs,
            )
            raw = r.content[0].text
            result = parse_builder_response(raw)
            result["model"] = "claude"
            return JSONResponse(result)
        except Exception as e:
            print(f"[Builder V2] Claude failed: {e}")

    # Fallback to xAI (Grok)
    if xai_client:
        try:
            r = xai_client.chat.completions.create(
                model="grok-3",
                messages=[{"role": "system", "content": BUILDER_V2_SYSTEM}] + msgs,
                max_tokens=16384,
            )
            raw = r.choices[0].message.content
            result = parse_builder_response(raw)
            result["model"] = "grok-3"
            result["fallback"] = True
            return JSONResponse(result)
        except Exception as e:
            print(f"[Builder V2] xAI failed: {e}")

    # Fallback to Gemini
    gemini = os.environ.get("GEMINI_API_KEY", "")
    if gemini:
        try:
            async with httpx.AsyncClient() as hc:
                r = await hc.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini}",
                    json={"contents": [{"parts": [{"text": BUILDER_V2_SYSTEM + "\n\n" + user_content}]}],
                         "generationConfig": {"maxOutputTokens": 16384}},
                    timeout=90,
                )
                raw = r.json()["candidates"][0]["content"]["parts"][0]["text"]
                result = parse_builder_response(raw)
                result["model"] = "gemini"
                result["fallback"] = True
                return JSONResponse(result)
        except Exception as e:
            print(f"[Builder V2] Gemini failed: {e}")

    return JSONResponse({"error": "All AI providers failed for code generation"}, status_code=503)


@app.post("/api/mcp/search")
async def mcp_search(request: Request):
    try:
        body = await request.json()
        query = body.get("query",body.get("message",""))
        if not query:
            return JSONResponse({"error":"No query"},status_code=400)
        results, answer = await multi_search(query,"general",max_results=8)
        return JSONResponse({"ok":True,"query":query,"results":results,"answer":answer})
    except Exception as e:
        return JSONResponse({"error":str(e)},status_code=500)

@app.post("/api/mcp/crm")
async def mcp_crm(request: Request):
    try:
        body = await request.json()
        action = body.get("action","list_contacts")
        GHL_TOKEN = os.environ.get("GHL_PRIVATE_TOKEN","")
        GHL_LOC = os.environ.get("GHL_LOCATION_ID","")
        hdrs = {"Authorization":f"Bearer {GHL_TOKEN}","Content-Type":"application/json"}
        async with httpx.AsyncClient() as hc:
            if action == "list_contacts":
                r = await hc.get(f"https://rest.gohighlevel.com/v1/contacts/?locationId={GHL_LOC}&limit=20",headers=hdrs,timeout=15)
                return JSONResponse({"ok":True,"contacts":r.json().get("contacts",[])})
            elif action == "add_contact":
                data = {"locationId":GHL_LOC,"firstName":body.get("firstName",""),"lastName":body.get("lastName",""),"email":body.get("email",""),"phone":body.get("phone",""),"tags":body.get("tags",[])}
                r = await hc.post("https://rest.gohighlevel.com/v1/contacts/",headers=hdrs,json=data,timeout=15)
                return JSONResponse({"ok":True,"contact":r.json()})
            elif action == "get_pipeline":
                r = await hc.get(f"https://rest.gohighlevel.com/v1/pipelines/?locationId={GHL_LOC}",headers=hdrs,timeout=15)
                return JSONResponse({"ok":True,"pipelines":r.json().get("pipelines",[])})
            return JSONResponse({"error":f"Unknown action: {action}"},status_code=400)
    except Exception as e:
        return JSONResponse({"error":str(e)},status_code=500)
# ─── END MCP GATEWAY ──────────────────────────────────────────────────

@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    """WebSocket endpoint for real-time bidirectional chat streaming."""
    await websocket.accept()
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            query = data.get("message", "")
            vertical = data.get("vertical", "search")
            history = data.get("history", [])
            use_search = data.get("search", True)
            
            if not query:
                await websocket.send_json({"type": "error", "message": "Empty query"})
                continue
            
            system_prompt = SYSTEM_PROMPTS.get(vertical, SYSTEM_PROMPTS["search"])
            sources = []
            tavily_answer = ""
            
            # Phase 1: Enhanced vertical search
            if use_search:
                await websocket.send_json({"type": "phase", "phase": "searching", "query": query})
                try:
                    sources, tavily_answer = await multi_search(query, vertical, max_results=8)
                except Exception as e:
                    print(f"[WS] Search error: {e}")
                
                if sources:
                    await websocket.send_json({"type": "sources", "sources": sources})
                    context = "\n\n".join([
                        f"[{i+1}] {s['title']} ({s['domain']})\n{s['content']}"
                        for i, s in enumerate(sources)
                    ])
                    system_prompt += f"\n\nHere are relevant web search results for the user's query. Use these to inform your response and cite them using [1], [2], etc.:\n\n{context}"
            
            # Phase 2: Generating
            await websocket.send_json({"type": "phase", "phase": "generating"})
            
            # Build messages
            messages = []
            for msg in history[-10:]:
                messages.append({"role": msg["role"], "content": msg["content"]})
            messages.append({"role": "user", "content": query})
            
            # Phase 3: Stream tokens (multi-LLM with fallback)
            ai_responded = False

            # Try Anthropic (Claude) first
            if client:
                try:
                    with client.messages.stream(
                        model="claude-sonnet-4-20250514",
                        max_tokens=4096,
                        system=system_prompt,
                        messages=messages,
                    ) as stream:
                        for text in stream.text_stream:
                            await websocket.send_json({"type": "text", "content": text})
                    ai_responded = True
                except Exception as e:
                    print(f"[WS] Anthropic error: {e}")

            # Fallback to xAI/Grok
            if not ai_responded and xai_client:
                try:
                    xai_messages = [{"role": "system", "content": system_prompt}] + [
                        {"role": m["role"], "content": m["content"]} for m in messages
                    ]
                    stream = xai_client.chat.completions.create(
                        model="grok-4-latest",
                        messages=xai_messages,
                        max_tokens=4096,
                        stream=True,
                    )
                    for chunk in stream:
                        if chunk.choices and chunk.choices[0].delta.content:
                            await websocket.send_json({"type": "text", "content": chunk.choices[0].delta.content})
                    ai_responded = True
                except Exception as e:
                    print(f"[WS] xAI/Grok error: {e}")

            # ═══ FALLBACK 3 (WS): Perplexity Sonar Pro ═══
            if not ai_responded and PPLX_API_KEY:
                try:
                    pplx_msgs = [{"role": "system", "content": system_prompt}]
                    for msg in messages:
                        pplx_msgs.append({"role": msg["role"], "content": msg["content"]})
                    async with httpx.AsyncClient(timeout=60) as _pplx_ws:
                        pplx_r = await _pplx_ws.post(
                            "https://api.perplexity.ai/chat/completions",
                            headers={"Authorization": f"Bearer {PPLX_API_KEY}", "Content-Type": "application/json"},
                            json={"model": "sonar-pro", "max_tokens": 4096, "temperature": 0.7, "messages": pplx_msgs},
                        )
                        if pplx_r.status_code == 200:
                            pplx_data = pplx_r.json()
                            pplx_text = pplx_data.get("choices", [{}])[0].get("message", {}).get("content", "")
                            if pplx_text:
                                await websocket.send_json({"type": "text", "content": pplx_text})
                                ai_responded = True
                except Exception as e:
                    print(f"[WS] Perplexity error: {e}")

            # Final fallback: Tavily AI answer or raw sources
            # NOTE: Do NOT append raw Sources markdown — sources are already rendered as pills
            if not ai_responded:
                if tavily_answer:
                    fallback = tavily_answer
                elif sources:
                    fallback = "Here's what I found from the web:\n\n"
                    for i, s in enumerate(sources):
                        fallback += f"**{s['title']}** — {s['content']}\n\n"
                else:
                    fallback = "I'm having trouble connecting right now. Please try again in a moment."
                await websocket.send_json({"type": "text", "content": fallback})            
            # Done
            await websocket.send_json({"type": "done"})
    
    except WebSocketDisconnect:
        print("[WS] Client disconnected")
    except Exception as e:
        print(f"[WS] Error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)[:200]})
        except:
            pass

# ─── Finance Market Data (Mock for now, structure for real API) ───────────────

@app.get("/api/finance/markets")
async def get_markets():
    """Get market summary data."""
    return {
        "indices": [
            {"symbol": "SPX", "name": "S&P 500", "value": "6,204.38", "change": "+1.24%", "direction": "up"},
            {"symbol": "IXIC", "name": "NASDAQ", "value": "19,872.15", "change": "+1.67%", "direction": "up"},
            {"symbol": "DJI", "name": "Dow Jones", "value": "44,128.90", "change": "+0.82%", "direction": "up"},
            {"symbol": "BTC", "name": "Bitcoin", "value": "$95,420", "change": "+3.21%", "direction": "up"},
            {"symbol": "ETH", "name": "Ethereum", "value": "$3,847", "change": "+2.15%", "direction": "up"},
            {"symbol": "GOLD", "name": "Gold", "value": "$2,985.40", "change": "+0.45%", "direction": "up"},
        ],
        "updated_at": datetime.now().isoformat(),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# GoDaddy Domain API Integration
# ═══════════════════════════════════════════════════════════════════════════════

GODADDY_HEADERS = {
    "Authorization": f"sso-key {GODADDY_API_KEY}:{GODADDY_API_SECRET}",
    "X-Private-Label-Id": GODADDY_PL_ID,
    "Accept": "application/json",
    "Content-Type": "application/json",
}

# TLD pricing lookup (GoDaddy standard retail, used as fallback)
TLD_PRICES = {
    ".com": 12.99, ".net": 11.99, ".org": 9.99, ".io": 39.99, ".ai": 79.99,
    ".co": 24.99, ".dev": 14.99, ".app": 16.99, ".tech": 5.99, ".biz": 14.99,
    ".info": 3.99, ".us": 7.99, ".xyz": 1.99, ".online": 2.99, ".store": 3.99,
    ".site": 2.99, ".pro": 9.99, ".agency": 24.99, ".solutions": 14.99,
    ".digital": 9.99, ".capital": 44.99, ".ventures": 44.99, ".consulting": 29.99,
}

SEARCH_TLDS = [".com", ".ai", ".io", ".net", ".org", ".co", ".dev", ".app", ".tech", ".xyz"]


@app.get("/api/domains/search")
async def search_domains(domain: str):
    """Search domain availability via GoDaddy API. Falls back to smart estimation if API access is restricted."""
    base_name = domain.strip().lower().replace(" ", "")
    # Strip any existing TLD for base search
    for tld in SEARCH_TLDS:
        if base_name.endswith(tld):
            base_name = base_name[:-len(tld)]
            break

    results = []
    api_live = False

    # Attempt live GoDaddy API calls in parallel
    async with httpx.AsyncClient(timeout=10.0) as http:
        tasks = []
        for tld in SEARCH_TLDS:
            full_domain = base_name + tld
            tasks.append(_check_domain_godaddy(http, full_domain))
        responses = await asyncio.gather(*tasks, return_exceptions=True)

        for i, resp in enumerate(responses):
            full_domain = base_name + SEARCH_TLDS[i]
            if isinstance(resp, dict) and "available" in resp:
                api_live = True
                price = resp.get("price", 0)
                if price:
                    price_display = f"${price / 1_000_000:.2f}"  # GoDaddy returns price in micro-units
                else:
                    price_display = f"${TLD_PRICES.get(SEARCH_TLDS[i], 14.99):.2f}"
                results.append({
                    "domain": resp.get("domain", full_domain),
                    "available": resp.get("available", False),
                    "price": price_display,
                    "currency": resp.get("currency", "USD"),
                    "period": resp.get("period", 1),
                    "definitive": resp.get("definitive", True),
                })
            else:
                # Fallback: generate plausible result
                results.append({
                    "domain": full_domain,
                    "available": True,  # Unknown — show as potentially available
                    "price": f"${TLD_PRICES.get(SEARCH_TLDS[i], 14.99):.2f}",
                    "currency": "USD",
                    "period": 1,
                    "definitive": False,  # Indicates we couldn't confirm with GoDaddy
                })

    # Also try GoDaddy domain suggestions
    suggestions = []
    async with httpx.AsyncClient(timeout=10.0) as http:
        try:
            resp = await http.get(
                f"{GODADDY_BASE}/v1/domains/suggest",
                params={"query": base_name, "limit": 6, "waitMs": 3000},
                headers=GODADDY_HEADERS,
            )
            if resp.status_code == 200:
                api_live = True
                for sug in resp.json()[:6]:
                    sug_domain = sug.get("domain", "")
                    if sug_domain and sug_domain not in [r["domain"] for r in results]:
                        ext = "." + sug_domain.rsplit(".", 1)[-1] if "." in sug_domain else ".com"
                        suggestions.append({
                            "domain": sug_domain,
                            "available": True,
                            "price": f"${TLD_PRICES.get(ext, 14.99):.2f}",
                            "currency": "USD",
                            "period": 1,
                            "definitive": False,
                        })
        except Exception:
            pass

    return {
        "query": base_name,
        "results": results,
        "suggestions": suggestions,
        "api_live": api_live,
        "note": "" if api_live else "GoDaddy API access pending — showing estimated availability. Confirm at godaddy.com before purchasing.",
    }


async def _check_domain_godaddy(http: httpx.AsyncClient, domain: str) -> dict:
    """Check a single domain against GoDaddy availability API."""
    try:
        resp = await http.get(
            f"{GODADDY_BASE}/v1/domains/available",
            params={"domain": domain, "checkType": "FAST", "forTransfer": "false"},
            headers=GODADDY_HEADERS,
        )
        if resp.status_code == 200:
            return resp.json()
        else:
            return {"error": resp.status_code, "body": resp.text[:200]}
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/domains/tlds")
async def get_tld_pricing():
    """Get supported TLDs with pricing."""
    # Try GoDaddy TLD list first
    async with httpx.AsyncClient(timeout=10.0) as http:
        try:
            resp = await http.get(
                f"{GODADDY_BASE}/v1/domains/tlds",
                headers=GODADDY_HEADERS,
            )
            if resp.status_code == 200:
                tlds = resp.json()
                return {"tlds": [{"name": t.get("name"), "type": t.get("type")} for t in tlds[:50]], "api_live": True}
        except Exception:
            pass

    # Fallback: return our curated list
    return {
        "tlds": [{"name": k.lstrip("."), "price": f"${v:.2f}"} for k, v in sorted(TLD_PRICES.items(), key=lambda x: x[1])],
        "api_live": False,
    }


@app.post("/api/domains/purchase")
async def purchase_domain(request: Request):
    """Initiate domain purchase via GoDaddy. Requires full contact info."""
    body = await request.json()
    domain = body.get("domain", "")
    if not domain:
        return JSONResponse({"error": "Domain name required"}, status_code=400)

    # For now, redirect to GoDaddy checkout since purchase requires
    # a GoDaddy shopper account and payment info
    return {
        "status": "redirect",
        "message": "Domain purchase initiated",
        "domain": domain,
        "checkout_url": f"{GODADDY_STOREFRONT_URL}&domainToCheck={domain}",
        "note": "Redirecting to SaintSal storefront for secure checkout.",
    }


@app.get("/api/godaddy/storefront")
async def godaddy_storefront_config():
    """Get GoDaddy reseller storefront config for frontend."""
    return {
        "storefront_url": GODADDY_STOREFRONT_URL,
        "pl_id": GODADDY_PL_ID,
        "domain_search_url": f"{GODADDY_STOREFRONT_URL}&domainToCheck=",
        "hosting_url": f"https://www.secureserver.net/hosting/web-hosting?pl_id={GODADDY_PL_ID}",
        "email_url": f"https://www.secureserver.net/email/professional-email?pl_id={GODADDY_PL_ID}",
        "ssl_url": f"https://www.secureserver.net/web-security/ssl-certificate?pl_id={GODADDY_PL_ID}",
        "website_builder_url": f"https://www.secureserver.net/websites/website-builder?pl_id={GODADDY_PL_ID}",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# CorpNet Business Formation API Integration
# ═══════════════════════════════════════════════════════════════════════════════

# State filing fees (real data from state SOS offices)
STATE_FILING_FEES = {
    "AL": 236, "AK": 250, "AZ": 50, "AR": 45, "CA": 70, "CO": 50, "CT": 120,
    "DE": 90, "FL": 125, "GA": 100, "HI": 50, "ID": 100, "IL": 150, "IN": 95,
    "IA": 50, "KS": 165, "KY": 40, "LA": 100, "ME": 175, "MD": 100, "MA": 500,
    "MI": 50, "MN": 160, "MS": 50, "MO": 50, "MT": 70, "NE": 100, "NV": 75,
    "NH": 100, "NJ": 125, "NM": 50, "NY": 200, "NC": 125, "ND": 135, "OH": 99,
    "OK": 100, "OR": 100, "PA": 125, "RI": 150, "SC": 110, "SD": 150, "TN": 300,
    "TX": 300, "UT": 54, "VT": 125, "VA": 100, "WA": 200, "WV": 100, "WI": 130,
    "WY": 100, "DC": 220,
}

STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming", "DC": "Washington D.C.",
}

ENTITY_TYPES = [
    {"id": "llc", "name": "LLC", "full_name": "Limited Liability Company", "description": "Flexible management with liability protection. Most popular for small businesses."},
    {"id": "c_corp", "name": "C Corporation", "full_name": "C Corporation", "description": "Ideal for raising venture capital and going public. Separate tax entity."},
    {"id": "s_corp", "name": "S Corporation", "full_name": "S Corporation", "description": "Pass-through taxation with corporate liability protection. Max 100 shareholders."},
    {"id": "nonprofit", "name": "Nonprofit", "full_name": "Nonprofit Corporation", "description": "Tax-exempt organization for charitable, educational, or religious purposes."},
    {"id": "sole_prop", "name": "Sole Proprietorship", "full_name": "Sole Proprietorship", "description": "Simplest structure. Owner and business are the same legal entity."},
    {"id": "partnership", "name": "Partnership", "full_name": "General Partnership", "description": "Two or more owners share profits, losses, and management responsibilities."},
    {"id": "lp", "name": "LP", "full_name": "Limited Partnership", "description": "At least one general partner with unlimited liability, plus limited partners."},
    {"id": "pllc", "name": "PLLC", "full_name": "Professional LLC", "description": "For licensed professionals — doctors, lawyers, CPAs, architects."},
]

# Packages — CLIENT prices from SaintVision Product Catalog v2
# Our cost is separate (Basic $79, Deluxe $199, Complete $249)
PACKAGES = [
    {
        "id": "basic",
        "name": "Basic",
        "product_id": "SV-CORP-001",
        "price": 197,
        "processing": "5-7 business days",
        "stripe_prices": {
            "llc": "price_1T84WEL47U80vDLAYfgh6tne",
            "corp": "price_1T84WHL47U80vDLA9xXux4cI",
        },
        "features": [
            "Name availability search",
            "Articles of Organization / Incorporation",
            "60-day Registered Agent",
            "B.I.Z. compliance tool",
            "Standard processing (5-7 days)",
        ],
    },
    {
        "id": "deluxe",
        "name": "Deluxe",
        "product_id": "SV-CORP-002",
        "price": 397,
        "popular": True,
        "processing": "24-hour rush",
        "stripe_prices": {
            "llc": "price_1T84WFL47U80vDLAB1q3I1Me",
            "corp": "price_1T84WIL47U80vDLAKaIYgJNq",
        },
        "features": [
            "Everything in Basic",
            "EIN / Federal Tax ID filing",
            "Registered Agent (1 full year)",
            "24-hour rush processing",
            "Physical Articles copy mailed",
        ],
    },
    {
        "id": "complete",
        "name": "Complete",
        "product_id": "SV-CORP-003",
        "price": 449,
        "processing": "24-hour rush",
        "stripe_prices": {
            "llc": "price_1T84WGL47U80vDLAM7AVMeWV",
            "corp": "price_1T84WJL47U80vDLAj35gfAvk",
        },
        "features": [
            "Everything in Deluxe",
            "Custom Operating Agreement / Bylaws",
            "LLC Kit & Seal / Corporate Kit",
            "Corporate Minutes template",
            "Stock Certificates (Corps)",
            "24-hour rush processing",
        ],
    },
]

# Additional CorpNet products from catalog
CORPNET_ADDONS = [
    {"id": "dba", "product_id": "SV-CORP-007", "name": "DBA Filing", "price": 149, "type": "one-time", "stripe_price_id": "price_1T84WKL47U80vDLAbXKZPWwK"},
    {"id": "ra_annual", "product_id": "SV-CORP-008", "name": "Registered Agent — Annual", "price": 224, "type": "annual", "stripe_price_id": "price_1T84WLL47U80vDLAjC6OBz5s"},
    {"id": "s_corp_election", "product_id": "SV-CORP-009", "name": "S-Corp Election (Form 2553)", "price": 149, "type": "one-time", "stripe_price_id": "price_1T84WML47U80vDLAhXUDMw0u"},
    {"id": "annual_report", "product_id": "SV-CORP-010", "name": "Annual Report Filing", "price": 179, "type": "annual", "stripe_price_id": "price_1T84WNL47U80vDLArGpX7xno"},
    {"id": "foreign_llc", "product_id": "SV-CORP-011", "name": "Foreign LLC Qualification", "price": 297, "type": "one-time", "stripe_price_id": "price_1T84WOL47U80vDLAXsI6xTBY"},
    {"id": "biz_license", "product_id": "SV-CORP-012", "name": "Business License Research", "price": 169, "type": "one-time", "stripe_price_id": "price_1T84WQL47U80vDLAufdYUp75"},
    {"id": "nonprofit", "product_id": "SV-CORP-013", "name": "Nonprofit Formation (501c3)", "price": 197, "type": "one-time", "stripe_price_id": "price_1T84WRL47U80vDLA1Al99kvx"},
    {"id": "amendment", "product_id": "SV-CORP-014", "name": "Amendment Filing", "price": 169, "type": "one-time", "stripe_price_id": "price_1T84WSL47U80vDLAtOOfNUiH"},
    {"id": "dissolution", "product_id": "SV-CORP-015", "name": "Dissolution / Withdrawal", "price": 224, "type": "one-time", "stripe_price_id": "price_1T84WTL47U80vDLAnWkmbE7L"},
    {"id": "ai_consult", "product_id": "SV-CORP-016", "name": "SaintSal AI Business Consult", "price": 79, "type": "one-time", "stripe_price_id": "price_1T84WUL47U80vDLAieQFLCHB"},
]


class FormationRequest(BaseModel):
    entity_type: str
    state: str
    business_name: str
    package: str = "complete"
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    business_address1: Optional[str] = None
    business_city: Optional[str] = None
    business_zip: Optional[str] = None
    business_description: Optional[str] = None


# Full product catalog endpoint
@app.get("/api/catalog")
async def get_product_catalog():
    """Return the full SaintVision product catalog."""
    return {
        "corpnet": {
            "formation_packages": PACKAGES,
            "addons": CORPNET_ADDONS,
        },
        "subscriptions": [
            {"id": "SV-SAL-FREE", "name": "Free", "price": 0, "annual_price": 0, "billing": "free", "stripe_price_id": "price_1T7p1tL47U80vDLAe9aWVKA0", "stripe_annual_price_id": "price_1T7p1tL47U80vDLAnxtkrGV4", "product_id": "prod_U3jCx2VJbNeXvU", "features": ["50 msgs/mo", "Basic AI chat", "Finance & RE modules"]},
            {"id": "SV-SAL-START", "name": "Starter", "price": 27, "annual_price": 270, "billing": "monthly", "stripe_price_id": "price_1T7p1sL47U80vDLAgU2shcQO", "stripe_annual_price_id": "price_1T7p1sL47U80vDLAYEEv8Kmg", "product_id": "prod_U3jCGSzn4WqzV3", "features": ["500 msgs/mo", "All 6 domain modules", "SaintSal core", "Email support"]},
            {"id": "SV-SAL-PRO", "name": "Pro", "price": 97, "annual_price": 970, "billing": "monthly", "stripe_price_id": "price_1T7p1tL47U80vDLAVC0N4N4J", "stripe_annual_price_id": "price_1T7p1tL47U80vDLAk5HK8YcR", "product_id": "prod_U3jC7k9rF5enMh", "features": ["Unlimited msgs", "All AI models", "SaintSal Labs access", "Cookin.io builder", "Priority support"], "required_for": "Premium Snapshots"},
            {"id": "SV-SAL-TEAM", "name": "Teams", "price": 297, "annual_price": 2970, "billing": "monthly", "stripe_price_id": "price_1T7p1uL47U80vDLA9QF62BKS", "stripe_annual_price_id": "price_1T7p1uL47U80vDLAjlnLTuul", "product_id": "prod_U3jCtHY6kyCJdC", "features": ["Everything in Pro", "Up to 5 seats", "Shared agents", "Team analytics", "GHL CRM integration"]},
            {"id": "SV-SAL-ENT", "name": "Enterprise", "price": 497, "annual_price": 4970, "billing": "monthly", "stripe_price_id": "price_1T7p1uL47U80vDLAR4Wk6uW0", "stripe_annual_price_id": "price_1T7p1uL47U80vDLAk9UA0lnr", "product_id": "prod_U3jCLNosf5FA6j", "features": ["Everything in Teams", "Unlimited seats", "White-label", "Custom integrations", "Dedicated support"]},
        ],
        "snapshots": {
            "premium": [
                {"id": "SV-SNAP-RE", "name": "Real Estate Pro", "price": 997, "stripe_price_id": "price_1T84WVL47U80vDLAIm6fPewj", "requires": "Pro ($97/mo)", "features": "300+ custom values, 4 pipelines, 26 workflows"},
                {"id": "SV-SNAP-RL", "name": "Residential Lending Pro", "price": 997, "stripe_price_id": "price_1T84WWL47U80vDLArLe6zWtx", "requires": "Pro ($97/mo)", "features": "Mortgage pre-qual funnel, rate automation, LO pipeline"},
                {"id": "SV-SNAP-CL", "name": "Commercial Lending Pro", "price": 1497, "stripe_price_id": "price_1T84WXL47U80vDLAKpvuPQy8", "requires": "Pro ($97/mo)", "features": "Deal intake ($5K-$100M), SBA/CMBS/Bridge pipelines"},
                {"id": "SV-SNAP-IT", "name": "Investment / Tax / Legal Pro", "price": 1497, "stripe_price_id": "price_1T84WYL47U80vDLAmmNVVHjd", "requires": "Pro ($97/mo)", "features": "AUM pipeline, tax prep workflows, compliance"},
                {"id": "SV-SNAP-CC", "name": "Card Store / Collectibles Pro", "price": 797, "stripe_price_id": "price_1T84WZL47U80vDLAriKpNSXO", "requires": "Pro ($97/mo)", "features": "Storefront funnel, inventory pipeline, grading"},
            ],
            "standard": [
                {"id": "SV-STD-001", "name": "Dental Practice", "price": 197, "stripe_price_id": "price_1T84WaL47U80vDLAT0ftyGrd", "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-002", "name": "Insurance Agency", "price": 197, "stripe_price_id": "price_1T84WbL47U80vDLAhwqN7GA1", "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-003", "name": "Fitness / Gym", "price": 197, "stripe_price_id": "price_1T84WcL47U80vDLAoVOMgWO6", "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-004", "name": "Restaurant / Food Service", "price": 197, "stripe_price_id": "price_1T84WdL47U80vDLAK1LrwFeQ", "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-005", "name": "Auto Detailing / Automotive", "price": 197, "stripe_price_id": "price_1T84WeL47U80vDLAUH11AppD", "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-006", "name": "Home Services (HVAC/Plumb/Elec)", "price": 197, "stripe_price_id": "price_1T84WfL47U80vDLA1z549NHx", "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-007", "name": "Med Spa / Aesthetics", "price": 197, "stripe_price_id": "price_1T84WgL47U80vDLAF0XC0L3m", "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-008", "name": "Salon / Barbershop", "price": 197, "stripe_price_id": "price_1T84WiL47U80vDLA3Uw1cmfl", "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-009", "name": "Coaching / Consulting", "price": 197, "stripe_price_id": "price_1T84WjL47U80vDLAN9R6m6UK", "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-010", "name": "Roofing / Construction", "price": 197, "stripe_price_id": "price_1T84WkL47U80vDLAV7kv6HEu", "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-011", "name": "Chiropractor / Wellness", "price": 197, "stripe_price_id": "price_1T84WlL47U80vDLAG44grf74", "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-012", "name": "Ecommerce / DTC Brand", "price": 197, "stripe_price_id": "price_1T84WmL47U80vDLAWScn1duY", "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-013", "name": "Nonprofit / Charity", "price": 197, "stripe_price_id": "price_1T84WnL47U80vDLATXqOKY5v", "requires": "Starter ($27/mo)"},
            ],
            "individual": [
                {"id": "SV-IND-001", "name": "Solar / Energy", "price": 97, "stripe_price_id": "price_1T84inL47U80vDLAhsltrVXp"},
                {"id": "SV-IND-002", "name": "Plumbing", "price": 97, "stripe_price_id": "price_1T84ioL47U80vDLARHFDszkU"},
                {"id": "SV-IND-003", "name": "House Cleaning", "price": 97, "stripe_price_id": "price_1T84ipL47U80vDLAXKHVGP7B"},
                {"id": "SV-IND-004", "name": "Travel Agency", "price": 97, "stripe_price_id": "price_1T84iqL47U80vDLAPyh6Kvli"},
                {"id": "SV-IND-005", "name": "Life Coach", "price": 97, "stripe_price_id": "price_1T84irL47U80vDLArAPh3xVJ"},
                {"id": "SV-IND-006", "name": "Bakery / Food Production", "price": 97, "stripe_price_id": "price_1T84isL47U80vDLAG1YAokkK"},
                {"id": "SV-IND-007", "name": "Family Law / Legal Practice", "price": 97, "stripe_price_id": "price_1T84itL47U80vDLAJvMu8qPk"},
                {"id": "SV-IND-008", "name": "Course Creator / Online Education", "price": 97, "stripe_price_id": "price_1T84ivL47U80vDLADkohJm70"},
                {"id": "SV-IND-009", "name": "Web Design / Creative Agency", "price": 97, "stripe_price_id": "price_1T84iwL47U80vDLAmatChkQH"},
                {"id": "SV-IND-010", "name": "Bookkeeping / Accounting", "price": 97, "stripe_price_id": "price_1T84ixL47U80vDLAb276bhz7"},
                {"id": "SV-IND-011", "name": "Marketing Agency", "price": 97, "stripe_price_id": "price_1T84iyL47U80vDLA7EQ0Mi3p"},
                {"id": "SV-IND-012", "name": "Pet Services / Veterinary", "price": 97, "stripe_price_id": "price_1T84izL47U80vDLA0WhulAw4"},
                {"id": "SV-IND-013", "name": "Photography / Videography", "price": 97, "stripe_price_id": "price_1T84j0L47U80vDLAZ2pirq78"},
                {"id": "SV-IND-014", "name": "Auto Repair Shop", "price": 97, "stripe_price_id": "price_1T84qkL47U80vDLAMta7FfIa"},
                {"id": "SV-IND-015", "name": "Nail Salon", "price": 97, "stripe_price_id": "price_1T84qlL47U80vDLArdq4dCDL"},
                {"id": "SV-IND-016", "name": "Landscaping", "price": 97, "stripe_price_id": "price_1T84qmL47U80vDLAEcW5pWoh"},
                {"id": "SV-IND-017", "name": "Day Spa", "price": 97, "stripe_price_id": "price_1T84qoL47U80vDLAPH33EaNE"},
                {"id": "SV-IND-018", "name": "Pest Control", "price": 97, "stripe_price_id": "price_1T84qpL47U80vDLAGaGpK2mC"},
                {"id": "SV-IND-019", "name": "Bed & Breakfast / Hospitality", "price": 97, "stripe_price_id": "price_1T84qqL47U80vDLAJNrMoFJM"},
            ],
        },
        "bundles": [
            {"id": "SV-BUN-START", "name": "Starter Launch Bundle", "setup": 347, "monthly": 27, "stripe_price_id": "price_1T84WoL47U80vDLA2J0DxSMY", "includes": "CorpNet Deluxe LLC + 1 Standard Snapshot + Starter sub"},
            {"id": "SV-BUN-PRO", "name": "Pro Business Bundle", "setup": 997, "monthly": 97, "stripe_price_id": "price_1T84WpL47U80vDLAPiQf4qM3", "includes": "CorpNet Complete LLC + 1 Premium Snapshot + Pro sub + onboarding"},
            {"id": "SV-BUN-EMPIRE", "name": "Empire Bundle", "setup": 4497, "monthly": 297, "stripe_price_id": "price_1T84WqL47U80vDLAk3ErZGgb", "includes": "All 5 Premium Snapshots + CorpNet Complete + Teams + 90-day onboarding"},
        ],
        "compute_tiers": COMPUTE_TIERS,
    }


@app.get("/api/corpnet/entity-types")
async def get_entity_types():
    """Get available entity types for business formation."""
    return {"entity_types": ENTITY_TYPES}


@app.get("/api/corpnet/states")
async def get_states():
    """Get all US states with filing fees."""
    states = []
    for code, name in sorted(STATE_NAMES.items(), key=lambda x: x[1]):
        states.append({
            "code": code,
            "name": name,
            "filing_fee": STATE_FILING_FEES.get(code, 100),
        })
    return {"states": states}


@app.get("/api/corpnet/packages")
async def get_packages(state: str = "CA", entity_type: str = "LLC"):
    """Get formation packages — tries CorpNet v2 API first, falls back to local pricing."""
    state = state.upper()
    state_fee = STATE_FILING_FEES.get(state, 100)

    # Try CorpNet v2 API for real packages
    try:
        CORPNET_BASE = CORPNET_BASE_URL
        headers = {
            "Authorization": f"Bearer {CORPNET_DATA_API_KEY}",
            "token": CORPNET_API_KEY,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        async with httpx.AsyncClient(timeout=10.0) as http:
            resp = await http.get(
                f"{CORPNET_BASE}/api/business-formation-v2/package",
                params={"entityType": entity_type, "state": state},
                headers=headers,
            )
            if resp.status_code == 200:
                data = resp.json()
                # CorpNet may double-encode: JSON string inside JSON
                if isinstance(data, str):
                    import json as _json
                    data = _json.loads(data)
                pkg_collection = data.get("value", {}).get("packageCollection", [])
                if pkg_collection:
                    return {
                        "packages": pkg_collection,
                        "state": state,
                        "state_name": STATE_NAMES.get(state, state),
                        "state_fee": state_fee,
                        "api_live": True,
                        "source": "corpnet_v2",
                    }
    except Exception as e:
        print(f"[CorpNet] Package fetch error: {e}")

    # Fallback to local packages
    packages = []
    for pkg in PACKAGES:
        packages.append({
            **pkg,
            "state_fee": state_fee,
            "total": pkg["price"] + state_fee,
        })
    return {
        "packages": packages,
        "state": state,
        "state_name": STATE_NAMES.get(state, state),
        "state_fee": state_fee,
        "api_live": False,
        "source": "local",
    }


@app.get("/api/corpnet/name-check")
async def check_business_name(name: str, state: str = "CA"):
    """Check business name availability. Tries CorpNet API first, falls back to intelligent estimate."""
    state = state.upper()
    result = {"name": name, "state": state, "state_name": STATE_NAMES.get(state, state)}

    # Attempt CorpNet API
    api_result = await _corpnet_name_check(name, state)
    if api_result and "available" in api_result:
        result.update(api_result)
        result["api_live"] = True
        return result

    # Fallback: provide guidance
    result["available"] = None  # Unknown
    result["api_live"] = False
    result["suggestions"] = [
        f"{name} LLC",
        f"{name} Inc.",
        f"{name} Solutions LLC",
        f"{name} Group Inc.",
    ]
    result["note"] = f"Verify name availability directly with the {STATE_NAMES.get(state, state)} Secretary of State or through CorpNet."
    return result


async def _corpnet_name_check(name: str, state: str) -> Optional[dict]:
    """Name check — CorpNet v2 API does not have a standalone name check endpoint.
    The name availability check is included as a bundled service in formation packages.
    We return suggestions and guide user to proceed with formation."""
    return None


@app.post("/api/corpnet/formation")
async def submit_formation(req: FormationRequest):
    """Submit a business formation order. Tries CorpNet API, with fallback to manual queue."""
    state_fee = STATE_FILING_FEES.get(req.state.upper(), 100)
    pkg = next((p for p in PACKAGES if p["id"] == req.package), PACKAGES[1])
    total = pkg["price"] + state_fee

    order = {
        "order_id": f"SV-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "business_name": req.business_name,
        "entity_type": req.entity_type,
        "state": req.state.upper(),
        "state_name": STATE_NAMES.get(req.state.upper(), req.state),
        "package": pkg["name"],
        "package_price": pkg["price"],
        "state_fee": state_fee,
        "total": total,
        "processing_time": pkg["processing"],
        "status": "submitted",
        "created_at": datetime.now().isoformat(),
    }

    # Attempt CorpNet Business Formation v2 API submission (STAGING)
    api_result = await _corpnet_submit_formation(req)
    if api_result and api_result.get("api_live"):
        order["corpnet_order_id"] = api_result.get("order_id", "")
        order["corpnet_order_guid"] = api_result.get("order_id", "")
        order["api_live"] = True
        order["status"] = api_result.get("phase", "Order Received")
        order["corpnet_status"] = api_result.get("status", "Third Party Received")
        order["note"] = "Order submitted to CorpNet. Track real-time status in your Launch Pad dashboard."
    else:
        order["api_live"] = False
        order["note"] = "Order queued. CorpNet API integration is being finalized — our team will process this manually within 24 hours."

    # Store in-memory (would be DB in production)
    if not hasattr(app, "_orders"):
        app._orders = []
    app._orders.append(order)

    return order


async def _corpnet_submit_formation(req) -> Optional[dict]:
    """Submit formation order through CorpNet Business Formation v2 API (STAGING)."""
    CORPNET_BASE = CORPNET_BASE_URL
    headers = {
        "Authorization": f"Bearer {CORPNET_DATA_API_KEY}",
        "token": CORPNET_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    # Map our entity types to CorpNet's expected values
    entity_map = {
        "llc": "LLC",
        "c_corp": "C-Corp",
        "s_corp": "S-Corp",
        "nonprofit": "Non-Profit Corporation",
        "pllc": "Professional Corporation",
    }
    corpnet_entity = entity_map.get(req.entity_type, "LLC")
    state_code = req.state.upper()

    # Parse contact name
    name_parts = (req.contact_name or "SaintSal User").split(" ", 1)
    first_name = name_parts[0]
    last_name = name_parts[1] if len(name_parts) > 1 else ""

    async with httpx.AsyncClient(timeout=30.0) as http:
        # Step 1: Get packages for this entity type + state
        try:
            pkg_resp = await http.get(
                f"{CORPNET_BASE}/api/business-formation-v2/package",
                params={"entityType": corpnet_entity, "state": state_code},
                headers=headers,
            )
            if pkg_resp.status_code == 200:
                pkg_data = pkg_resp.json()
                # CorpNet may double-encode: JSON string inside JSON
                if isinstance(pkg_data, str):
                    import json as _json
                    pkg_data = _json.loads(pkg_data)
                package_collection = pkg_data.get("value", {}).get("packageCollection", [])
                if package_collection:
                    # Get the first available package
                    selected_pkg = package_collection[0]
                    product_packages = selected_pkg.get("productPackages", [])
                    if product_packages:
                        package_id = product_packages[0].get("packageId", "")
                        products = []
                        for opt in product_packages[0].get("productOptions", []):
                            if opt.get("packageDisplaySelection") == "Bundled" and opt.get("productId"):
                                products.append({"productId": opt["productId"], "quantity": "1"})
        except Exception as e:
            print(f"[CorpNet] Package fetch failed: {e}")
            return None

        # Step 2: Create the formation order
        try:
            order_payload = {
                "partnerOrder": {
                    "pcid": f"ssl-{datetime.now().strftime('%Y%m%d%H%M%S')}",
                    "businessStructureType": f"{corpnet_entity}",
                    "businessStateInitial": state_code,
                    "contact": {
                        "contactEmail": req.contact_email or "team@saintsallabs.com",
                        "contactFirstName": first_name,
                        "contactLastName": last_name,
                        "contactPhone": req.contact_phone or "",
                        "contactEveningPhone": "",
                    },
                    "companyInfo": {
                        "companyDesiredName": req.business_name,
                        "companyAlternativeName": "",
                        "companyBusinessCategory": "other",
                        "companyBusinessDescription": f"Business formation via SaintSal Labs",
                    },
                    "businessAddress": {
                        "businessAddressCountry": "US",
                        "businessAddressAddress1": req.business_address1 if hasattr(req, 'business_address1') and req.business_address1 else "",
                        "businessAddressAddress2": "",
                        "businessAddressCity": req.business_city if hasattr(req, 'business_city') and req.business_city else "",
                        "businessAddressState": state_code,
                        "businessAddressZip": req.business_zip if hasattr(req, 'business_zip') and req.business_zip else "",
                    },
                    "registerAgent": {
                        "registeredAgentIsCorpnetAgent": True,
                        "registeredAgentFirstName": "",
                        "registeredAgentLastName": "",
                        "registeredAgentAddress1": "",
                        "registeredAgentAddress2": "",
                        "registeredAgentCity": "",
                        "registeredAgentState": "",
                        "registeredAgentZip": "",
                        "registeredAgentCountry": "",
                    },
                }
            }
            # Add package/products if we got them
            if package_id:
                order_payload["partnerOrder"]["packageId"] = package_id
            if products:
                order_payload["partnerOrder"]["products"] = products

            create_resp = await http.post(
                f"{CORPNET_BASE}/api/business-formation-v2/create-order",
                json=order_payload,
                headers=headers,
            )
            if create_resp.status_code in (200, 201):
                result = create_resp.json()
                partner_order = result.get("data", {}).get("partnerOrder", {})
                return {
                    "order_id": partner_order.get("orderGuid", ""),
                    "status": partner_order.get("orderStatus", "Third Party Received"),
                    "phase": partner_order.get("orderPhase", "Order Received"),
                    "api_live": True,
                    "corpnet_response": partner_order,
                }
            else:
                print(f"[CorpNet] Create order failed: {create_resp.status_code} — {create_resp.text[:500]}")
        except Exception as e:
            print(f"[CorpNet] Order submission failed: {e}")

    return None


@app.get("/api/corpnet/orders")
async def get_orders():
    """Get all formation orders."""
    orders = getattr(app, "_orders", [])
    # Also include demo filings
    demo_filings = [
        {
            "order_id": "SV-DEMO-001",
            "business_name": "HACP Global LLC",
            "entity_type": "llc",
            "state": "DE",
            "state_name": "Delaware",
            "package": "Premium",
            "status": "in_review",
            "progress": 2,  # 0=submitted, 1=in_review, 2=filed, 3=complete
            "created_at": "2026-02-15T10:00:00",
        },
        {
            "order_id": "SV-DEMO-002",
            "business_name": "SaintSal Labs Inc",
            "entity_type": "c_corp",
            "state": "WY",
            "state_name": "Wyoming",
            "package": "Complete",
            "status": "complete",
            "progress": 3,
            "created_at": "2026-01-20T14:30:00",
        },
    ]
    return {"orders": demo_filings + orders}


@app.post("/api/corpnet/checkout")
async def corpnet_checkout(request: Request):
    """Create a Stripe Checkout session for business formation packages."""
    import stripe as stripe_lib
    stripe_lib.api_key = os.environ.get("STRIPE_SECRET_KEY", "")

    body = await request.json()
    package_id = body.get("package_id", "basic")
    entity_type = body.get("entity_type", "llc")
    state = body.get("state", "CA")
    business_name = body.get("business_name", "")

    # Map entity + package to real Stripe price IDs
    entity_key = "corp" if entity_type.lower() in ("c_corp", "s_corp", "corporation", "corp") else "llc"
    PACKAGE_STRIPE = {
        "basic":    {"llc": "price_1T84WEL47U80vDLAYfgh6tne", "corp": "price_1T84WHL47U80vDLA9xXux4cI", "name": "Basic Formation Package"},
        "deluxe":   {"llc": "price_1T84WFL47U80vDLAB1q3I1Me", "corp": "price_1T84WIL47U80vDLAKaIYgJNq", "name": "Deluxe Formation Package"},
        "complete": {"llc": "price_1T84WGL47U80vDLAM7AVMeWV", "corp": "price_1T84WJL47U80vDLAj35gfAvk", "name": "Complete Formation Package"},
    }

    pkg = PACKAGE_STRIPE.get(package_id.lower(), PACKAGE_STRIPE["basic"])
    stripe_price_id = pkg.get(entity_key, pkg["llc"])
    entity_label = entity_type.replace("_", " ").upper()
    description = f"{entity_label} formation in {state.upper()}"
    if business_name:
        description = f"{business_name} — {entity_label} in {state.upper()}"

    try:
        session = stripe_lib.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price": stripe_price_id,
                "quantity": 1,
            }],
            mode="payment",
            success_url="https://saintsallabs.com/#launchpad?success=true",
            cancel_url="https://saintsallabs.com/#launchpad?canceled=true",
            metadata={
                "package_id": package_id,
                "entity_type": entity_type,
                "state": state,
                "business_name": business_name,
            },
        )
        return {"url": session.url}
    except Exception as e:
        print(f"[Corpnet Checkout] Stripe error: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/corpnet/compliance/{state}")
async def get_compliance_info(state: str):
    """Get compliance requirements and deadlines for a state."""
    state = state.upper()
    # Real compliance data by state
    compliance = {
        "state": state,
        "state_name": STATE_NAMES.get(state, state),
        "requirements": [],
    }

    # Common requirements
    requirements = [
        {"name": "Annual Report", "frequency": "Annual", "typical_fee": 50, "description": "Most states require an annual or biennial report to maintain good standing."},
        {"name": "Registered Agent", "frequency": "Ongoing", "typical_fee": 125, "description": "A registered agent is required to receive legal documents on behalf of your business."},
        {"name": "Franchise Tax", "frequency": "Annual", "typical_fee": None, "description": "Some states impose an annual franchise tax on businesses registered in the state."},
    ]

    # State-specific details
    if state == "DE":
        requirements.append({"name": "Delaware Franchise Tax", "frequency": "Annual (Mar 1)", "typical_fee": 300, "description": "Delaware franchise tax is due March 1st. Minimum $175 for LLCs, $300 for Corps."})
    elif state == "CA":
        requirements.append({"name": "CA Franchise Tax ($800/yr)", "frequency": "Annual", "typical_fee": 800, "description": "California imposes an $800 annual franchise tax on LLCs, LLPs, and corporations."})
        requirements.append({"name": "Statement of Information", "frequency": "Biennial", "typical_fee": 20, "description": "California requires a Statement of Information every 2 years."})
    elif state == "WY":
        requirements.append({"name": "Annual Report", "frequency": "Annual", "typical_fee": 60, "description": "Wyoming annual report is due on the first day of the anniversary month of formation. Minimum $60."})
    elif state == "TX":
        requirements.append({"name": "Texas Franchise Tax", "frequency": "Annual (May 15)", "typical_fee": 0, "description": "Texas franchise tax is due May 15. Entities with revenue below $2.47M owe no tax."})
    elif state == "NY":
        requirements.append({"name": "NY Publication Requirement", "frequency": "One-time", "typical_fee": 1500, "description": "New York requires LLCs to publish formation notice in two newspapers within 120 days."})
    elif state == "NV":
        requirements.append({"name": "NV Annual List", "frequency": "Annual", "typical_fee": 150, "description": "Nevada requires an annual list of officers/managers. $150 for LLCs, $325 for Corps."})

    compliance["requirements"] = requirements
    return compliance


# ─── Ticker Banners per Vertical ──────────────────────────────────────────────

TECH_STOCKS = [
    {"symbol": "AAPL", "name": "Apple", "value": "247.32", "change": "+1.82%", "direction": "up"},
    {"symbol": "MSFT", "name": "Microsoft", "value": "478.56", "change": "+0.95%", "direction": "up"},
    {"symbol": "NVDA", "name": "Nvidia", "value": "892.14", "change": "+3.44%", "direction": "up"},
    {"symbol": "GOOGL", "name": "Google", "value": "178.90", "change": "-0.32%", "direction": "down"},
    {"symbol": "META", "name": "Meta", "value": "612.45", "change": "+2.17%", "direction": "up"},
    {"symbol": "AMZN", "name": "Amazon", "value": "198.73", "change": "+1.08%", "direction": "up"},
    {"symbol": "TSLA", "name": "Tesla", "value": "267.89", "change": "+4.21%", "direction": "up"},
    {"symbol": "AMD", "name": "AMD", "value": "178.34", "change": "+2.65%", "direction": "up"},
    {"symbol": "CRM", "name": "Salesforce", "value": "312.67", "change": "-0.89%", "direction": "down"},
    {"symbol": "PLTR", "name": "Palantir", "value": "78.45", "change": "+5.12%", "direction": "up"},
]

TECH_ANNOUNCEMENTS = [
    "Nvidia announces B300 GPU — 2x AI inference throughput",
    "React 20 launches with built-in Server Components",
    "Anthropic Claude 4.5 Opus achieves SOTA reasoning benchmarks",
    "Cloudflare launches AI Gateway for edge model routing",
    "GitHub Copilot Workspace goes GA with multi-file editing",
    "Apple unveils next-gen AR glasses at Spring Event",
]

SPORTS_TICKER = [
    {"league": "NBA", "teams": "Lakers 112 — Celtics 108", "status": "Final", "detail": "LeBron 34pts"},
    {"league": "NFL", "teams": "Chiefs sign FA CB $72M/4yr", "status": "Free Agency", "detail": "Day 2"},
    {"league": "MLB", "teams": "Yankees 5 — Dodgers 3", "status": "Spring Training", "detail": "Judge 2 HR"},
    {"league": "NHL", "teams": "Oilers 4 — Rangers 2", "status": "Final", "detail": "McDavid hat trick"},
    {"league": "NBA", "teams": "Warriors 121 — Suns 115", "status": "4th Q", "detail": "Curry 42pts"},
    {"league": "NFL", "teams": "2026 Draft: #1 Mock — QB Beck", "status": "Draft Preview", "detail": "Apr 23"},
    {"league": "MLB", "teams": "WBC 2026 — USA vs Japan", "status": "Group Stage", "detail": "Mar 12"},
    {"league": "NHL", "teams": "Penguins 3 — Bruins 3", "status": "OT", "detail": "Crosby 2 assists"},
]

NEWS_HEADLINES = [
    "NATO Summit addresses new security challenges in Eastern Europe",
    "Supreme Court hears landmark digital privacy case on AI profiling",
    "California wildfire season starts early with unprecedented conditions",
    "Congress debates bipartisan AI regulation bill",
    "Federal Reserve signals rate decision ahead of March meeting",
    "Breakthrough in quantum computing: 1000-qubit processor achieved",
    "Global semiconductor supply chain faces new disruptions",
]

TOP_HEADLINES = [
    "SpaceX Starship completes first commercial payload delivery",
    "OpenAI launches GPT-5 Turbo with native multimodal reasoning",
    "AI Regulation battle heats up in Congress",
    "Apple unveils next-gen AR glasses — $1,299",
    "Champions League quarter-final draw sets up epic matchups",
    "S&P 500 hits new all-time high on AI earnings beat",
]


RE_MARKET_DATA = [
    {"symbol": "MEDIAN", "name": "US Median Home", "value": "$412,300", "change": "-1.2%", "direction": "down"},
    {"symbol": "30Y FRM", "name": "30-Yr Mortgage", "value": "6.87%", "change": "+0.03%", "direction": "up"},
    {"symbol": "STARTS", "name": "Housing Starts", "value": "1.42M", "change": "+3.1%", "direction": "up"},
    {"symbol": "EXIST", "name": "Existing Sales", "value": "4.08M", "change": "-2.4%", "direction": "down"},
    {"symbol": "PEND", "name": "Pending Sales", "value": "76.3", "change": "+1.8%", "direction": "up"},
    {"symbol": "INV", "name": "Inventory (mos)", "value": "3.8", "change": "+0.4", "direction": "up"},
    {"symbol": "VNQ", "name": "REIT Index", "value": "94.52", "change": "+0.67%", "direction": "up"},
    {"symbol": "FCLS", "name": "Foreclosures", "value": "44,990", "change": "+26%", "direction": "up"},
]

RE_HEADLINES = [
    "Pre-foreclosure filings surge 26% — ARM resets drive distressed inventory",
    "30-year fixed mortgage rate holds at 6.87% ahead of Fed decision",
    "Multifamily cap rates compress below 5% in Sun Belt markets",
    "$150B in commercial RE loans coming due in 2026",
    "Tax lien auction platforms report 3x increase in investor participation",
    "Housing inventory rises to 3.8 months — highest since 2020",
    "Median home price drops 1.2% YoY in 30 major metros",
]


@app.get("/api/ticker/{vertical}")
async def get_ticker(vertical: str):
    """Get scrolling ticker data for each vertical."""
    if vertical == "tech":
        return {"stocks": TECH_STOCKS, "announcements": TECH_ANNOUNCEMENTS}
    elif vertical == "sports":
        return {"scores": SPORTS_TICKER}
    elif vertical == "news":
        return {"headlines": NEWS_HEADLINES}
    elif vertical == "finance":
        return {
            "indices": [
                {"symbol": "SPX", "name": "S&P 500", "value": "6,204.38", "change": "+1.24%", "direction": "up"},
                {"symbol": "IXIC", "name": "NASDAQ", "value": "19,872.15", "change": "+1.67%", "direction": "up"},
                {"symbol": "DJI", "name": "Dow Jones", "value": "44,128.90", "change": "+0.82%", "direction": "up"},
                {"symbol": "BTC", "name": "Bitcoin", "value": "$95,420", "change": "+3.21%", "direction": "up"},
                {"symbol": "ETH", "name": "Ethereum", "value": "$3,847", "change": "+2.15%", "direction": "up"},
                {"symbol": "GOLD", "name": "Gold", "value": "$2,985.40", "change": "+0.45%", "direction": "up"},
            ],
        }
    elif vertical == "realestate":
        return {"market": RE_MARKET_DATA, "headlines": RE_HEADLINES}
    elif vertical == "medical":
        return {"headlines": [
            {"text": "FDA approves first AI-assisted diagnostic tool for early Alzheimer's detection", "url": "#"},
            {"text": "NIH allocates $2.3B for precision medicine genomics research program", "url": "#"},
            {"text": "WHO reports 40% decline in malaria deaths with new mRNA vaccine rollout", "url": "#"},
            {"text": "Mayo Clinic deploys AI radiology system reducing diagnostic time by 60%", "url": "#"},
            {"text": "New CRISPR gene therapy shows 92% efficacy in sickle cell disease trial", "url": "#"},
            {"text": "AMA updates telemedicine guidelines for AI-powered remote patient monitoring", "url": "#"},
            {"text": "Pfizer's next-gen cancer immunotherapy enters Phase 3 trials across 12 tumor types", "url": "#"},
        ]}
    elif vertical in ("top", "search"):
        return {"headlines": TOP_HEADLINES}
    return {"headlines": []}


# ─── Engagement Content per Vertical ──────────────────────────────────────────

ENGAGEMENT_CONTENT = {
    "sports": {
        "news": [
            {"title": "Lakers Trade Deadline Blockbuster Reshapes Western Conference", "image": "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400&h=240&fit=crop", "category": "NBA", "time": "1h ago", "summary": "Los Angeles acquires a two-way star forward in a three-team deal."},
            {"title": "March Madness Bracket Projections Updated", "image": "https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=400&h=240&fit=crop", "category": "NCAAB", "time": "2h ago", "summary": "Selection Sunday is days away as bubble teams fight for tournament lives."},
            {"title": "NFL Free Agency: Top QBs Find New Homes", "image": "https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=400&h=240&fit=crop", "category": "NFL", "time": "3h ago", "summary": "Three franchise quarterbacks signed massive deals on Day 1."},
        ],
        "ctas": [
            {"id": "athlete", "icon": "run", "title": "Are You an Athlete?", "subtitle": "Let SAL build your complete training schedule, nutrition plan, and performance tracking.", "cta_text": "Get Started", "color": "#22c55e"},
            {"id": "coach", "icon": "clipboard", "title": "Coaches Hub", "subtitle": "Game film analysis, opponent scouting, team roster management — powered by AI.", "cta_text": "Open Coaches Hub", "color": "#3b82f6"},
        ],
    },
    "tech": {
        "news": [
            {"title": "Anthropic Releases Claude 4.5 Opus with Breakthrough Reasoning", "image": "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=400&h=240&fit=crop", "category": "AI", "time": "1h ago", "summary": "Claude 4.5 achieves state-of-the-art on graduate-level reasoning benchmarks."},
            {"title": "Nvidia Reveals Next-Gen B300 GPU Architecture", "image": "https://images.unsplash.com/photo-1591488320449-011701bb6704?w=400&h=240&fit=crop", "category": "Hardware", "time": "2h ago", "summary": "Blackwell B300 doubles AI inference throughput while cutting power 35%."},
            {"title": "GitHub Copilot Workspace Goes GA", "image": "https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?w=400&h=240&fit=crop", "category": "Dev Tools", "time": "5h ago", "summary": "GitHub's AI coding assistant can now plan, edit, and test across entire repos."},
        ],
        "ctas": [
            {"id": "builder", "icon": "zap", "title": "Build Something", "subtitle": "Open SAL Builder and let AI generate full-stack apps from your description.", "cta_text": "Open Builder", "color": "#d4a017"},
            {"id": "trending", "icon": "trending", "title": "Trending Repos", "subtitle": "Discover the hottest open-source projects and AI tools on GitHub.", "cta_text": "Explore", "color": "#7c3aed"},
        ],
    },
    "news": {
        "news": [
            {"title": "NATO Summit Addresses New Security Challenges", "image": "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=400&h=240&fit=crop", "category": "World", "time": "2h ago", "summary": "Allied leaders commit to increased defense spending and rapid response."},
            {"title": "Supreme Court Hears Landmark Digital Privacy Case", "image": "https://images.unsplash.com/photo-1589578527966-fdac0f44566c?w=400&h=240&fit=crop", "category": "Law", "time": "4h ago", "summary": "Justices weigh AI-generated profiles under the Fourth Amendment."},
            {"title": "California Wildfire Season Starts Early", "image": "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=400&h=240&fit=crop", "category": "Environment", "time": "1h ago", "summary": "Record dry conditions prompt early-season evacuations."},
        ],
        "ctas": [
            {"id": "briefing", "icon": "newspaper", "title": "Daily Briefing", "subtitle": "Get a personalized AI-curated news digest delivered every morning.", "cta_text": "Set Up Briefing", "color": "#3b82f6"},
            {"id": "warroom", "icon": "shield", "title": "WarRoom Intelligence", "subtitle": "Deep analysis on geopolitics, policy shifts, and strategic implications.", "cta_text": "Enter WarRoom", "color": "#ef4444"},
        ],
    },
    "finance": {
        "news": [
            {"title": "S&P 500 Hits New All-Time High on AI Earnings Beat", "image": "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=240&fit=crop", "category": "Markets", "time": "30m ago", "summary": "S&P 500 crossed 6,200 as mega-cap tech reported stronger AI revenue."},
            {"title": "Bitcoin Surges Past $95K on ETF Inflows", "image": "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=400&h=240&fit=crop", "category": "Crypto", "time": "1h ago", "summary": "Spot Bitcoin ETFs see record $2.8B weekly inflows."},
            {"title": "Tesla Q1 Deliveries Beat Estimates by 12%", "image": "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=400&h=240&fit=crop", "category": "Earnings", "time": "4h ago", "summary": "Tesla delivered 510,000 vehicles, sending shares up 8% pre-market."},
        ],
        "ctas": [
            {"id": "portfolio", "icon": "briefcase", "title": "Portfolio Tracker", "subtitle": "Connect your brokerage and get AI-powered insights.", "cta_text": "Track Portfolio", "color": "#22c55e"},
            {"id": "research", "icon": "barchart", "title": "Deep Research", "subtitle": "Wall Street-grade analysis on any stock, sector, or market trend.", "cta_text": "Start Research", "color": "#d4a017"},
        ],
    },
    "realestate": {
        "news": [
            {"title": "Pre-Foreclosure Filings Surge 26% as ARM Resets Hit", "image": "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400&h=240&fit=crop", "category": "Distressed", "time": "2h ago", "summary": "Adjustable-rate mortgage resets driving sharp increase in pre-foreclosure filings."},
            {"title": "Multifamily Cap Rates Compress Below 5% in Sun Belt", "image": "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400&h=240&fit=crop", "category": "Investment", "time": "3h ago", "summary": "Strong rental demand pushes multifamily cap rates to historic lows in Austin, Phoenix."},
            {"title": "Tax Lien Auctions See Record Investor Participation", "image": "https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=400&h=240&fit=crop", "category": "Tax Liens", "time": "5h ago", "summary": "Online auction platforms report 3x increase in registered bidders."},
        ],
        "ctas": [
            {"id": "propsearch", "icon": "home", "title": "Property Search", "subtitle": "Search any property in the US — get instant valuations, rental estimates, comparables, and investment analysis.", "cta_text": "Search Properties", "color": "#22c55e"},
            {"id": "distressed", "icon": "alert", "title": "Distressed Deals", "subtitle": "Browse foreclosures, pre-foreclosures, tax liens, and NODs — powered by PropertyAPI.", "cta_text": "Find Deals", "color": "#ef4444"},
        ],
    },
    "top": {
        "news": [
            {"title": "SpaceX Starship Completes First Commercial Payload Delivery", "image": "https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?w=400&h=240&fit=crop", "category": "Science", "time": "4h ago", "summary": "Starship delivered its first commercial satellite constellation to orbit."},
            {"title": "OpenAI Launches GPT-5 Turbo", "image": "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=400&h=240&fit=crop", "category": "AI", "time": "6h ago", "summary": "Native video understanding and 200K context windows, available today."},
            {"title": "Apple Unveils Next-Gen AR Glasses", "image": "https://images.unsplash.com/photo-1592478411213-6153e4ebc07d?w=400&h=240&fit=crop", "category": "Tech", "time": "3h ago", "summary": "Lightweight AR glasses with all-day battery and seamless iPhone integration."},
        ],
        "ctas": [
            {"id": "explore", "icon": "search", "title": "Explore Verticals", "subtitle": "Sports, Tech, Finance, News — dive into any vertical with SAL intelligence.", "cta_text": "Explore", "color": "#d4a017"},
            {"id": "bizplan", "icon": "rocket", "title": "Launch a Business", "subtitle": "From idea to incorporation — build your plan and file in minutes.", "cta_text": "Start Building", "color": "#7c3aed"},
        ],
    },
}


@app.get("/api/engagement/{vertical}")
async def get_engagement(vertical: str):
    """Get engagement content (news with images + CTAs) for a vertical."""
    content = ENGAGEMENT_CONTENT.get(vertical, ENGAGEMENT_CONTENT.get("top", {}))
    return {"vertical": vertical, **content}



# ═══════════════════════════════════════════════════════════════════
# RentCast Real Estate API Integration
# ═══════════════════════════════════════════════════════════════════

RENTCAST_HEADERS = {
    "Accept": "application/json",
    "X-Api-Key": RENTCAST_API_KEY,
}


@app.get("/api/realestate/search")
async def realestate_search(address: str = "", city: str = "", state: str = "", zipcode: str = "", latitude: float = 0, longitude: float = 0):
    """Search properties via RentCast. Accepts address or city/state/zip."""
    params = {}
    if address:
        params["address"] = address
    if city:
        params["city"] = city
    if state:
        params["state"] = state
    if zipcode:
        params["zipCode"] = zipcode
    if latitude:
        params["latitude"] = latitude
    if longitude:
        params["longitude"] = longitude
    params["limit"] = 10

    if not params or (not address and not city and not zipcode):
        return JSONResponse({"error": "Provide address, city/state, or zipcode"}, status_code=400)

    async with httpx.AsyncClient(timeout=15.0) as http:
        try:
            resp = await http.get(f"{RENTCAST_BASE}/properties", params=params, headers=RENTCAST_HEADERS)
            if resp.status_code == 200:
                data = resp.json()
                return {"results": data if isinstance(data, list) else data.get("properties", [data]), "api_live": True, "query": params}
            else:
                return {"results": [], "api_live": False, "error": f"RentCast API returned {resp.status_code}", "query": params}
        except Exception as e:
            return {"results": [], "api_live": False, "error": str(e), "query": params}


@app.get("/api/realestate/value")
async def realestate_value(address: str):
    """Get property value estimate with comparable sales from RentCast."""
    async with httpx.AsyncClient(timeout=15.0) as http:
        try:
            resp = await http.get(f"{RENTCAST_BASE}/avm/value", params={"address": address, "compCount": 10}, headers=RENTCAST_HEADERS)
            if resp.status_code == 200:
                return {"data": resp.json(), "api_live": True}
            else:
                return {"data": None, "api_live": False, "error": f"RentCast API returned {resp.status_code}"}
        except Exception as e:
            return {"data": None, "api_live": False, "error": str(e)}


@app.get("/api/realestate/rent")
async def realestate_rent(address: str):
    """Get rental estimate with comparable rentals from RentCast."""
    async with httpx.AsyncClient(timeout=15.0) as http:
        try:
            resp = await http.get(f"{RENTCAST_BASE}/avm/rent/long-term", params={"address": address, "compCount": 10}, headers=RENTCAST_HEADERS)
            if resp.status_code == 200:
                return {"data": resp.json(), "api_live": True}
            else:
                return {"data": None, "api_live": False, "error": f"RentCast API returned {resp.status_code}"}
        except Exception as e:
            return {"data": None, "api_live": False, "error": str(e)}


@app.get("/api/realestate/listings/sale")
async def realestate_sale_listings(city: str = "", state: str = "", zipcode: str = "", status: str = "Active"):
    """Get active sale listings from RentCast."""
    params = {"status": status, "limit": 20}
    if city:
        params["city"] = city
    if state:
        params["state"] = state
    if zipcode:
        params["zipCode"] = zipcode

    async with httpx.AsyncClient(timeout=15.0) as http:
        try:
            resp = await http.get(f"{RENTCAST_BASE}/listings/sale", params=params, headers=RENTCAST_HEADERS)
            if resp.status_code == 200:
                return {"listings": resp.json(), "api_live": True}
            else:
                return {"listings": [], "api_live": False, "error": f"Status {resp.status_code}"}
        except Exception as e:
            return {"listings": [], "api_live": False, "error": str(e)}


@app.get("/api/realestate/listings/rental")
async def realestate_rental_listings(city: str = "", state: str = "", zipcode: str = "", status: str = "Active"):
    """Get active rental listings from RentCast."""
    params = {"status": status, "limit": 20}
    if city:
        params["city"] = city
    if state:
        params["state"] = state
    if zipcode:
        params["zipCode"] = zipcode

    async with httpx.AsyncClient(timeout=15.0) as http:
        try:
            resp = await http.get(f"{RENTCAST_BASE}/listings/rental", params=params, headers=RENTCAST_HEADERS)
            if resp.status_code == 200:
                return {"listings": resp.json(), "api_live": True}
            else:
                return {"listings": [], "api_live": False, "error": f"Status {resp.status_code}"}
        except Exception as e:
            return {"listings": [], "api_live": False, "error": str(e)}


@app.get("/api/realestate/market")
async def realestate_market(zipcode: str = "", city: str = "", state: str = ""):
    """Get market statistics from RentCast."""
    params = {"historyRange": 12}
    if zipcode:
        params["zipCode"] = zipcode
    if city:
        params["city"] = city
    if state:
        params["state"] = state

    async with httpx.AsyncClient(timeout=15.0) as http:
        try:
            resp = await http.get(f"{RENTCAST_BASE}/markets", params=params, headers=RENTCAST_HEADERS)
            if resp.status_code == 200:
                return {"data": resp.json(), "api_live": True}
            else:
                return {"data": None, "api_live": False, "error": f"Status {resp.status_code}"}
        except Exception as e:
            return {"data": None, "api_live": False, "error": str(e)}


# ═══════════════════════════════════════════════════════════════════
# Distressed Properties (Foreclosures, Pre-Foreclosures, Tax Liens, NODs)
# Demo data — production will use PropertyAPI / Apify integration
# ═══════════════════════════════════════════════════════════════════

DISTRESSED_PROPERTIES = {
    "foreclosure": [
        {"address": "1247 Oak Valley Dr", "city": "Houston", "state": "TX", "zip": "77084", "beds": 4, "baths": 2.5, "sqft": 2450, "year_built": 2005, "estimated_value": 285000, "auction_date": "2026-04-15", "opening_bid": 198000, "lender": "Wells Fargo", "status": "Scheduled", "property_type": "Single Family", "lat": 29.8283, "lng": -95.6561, "image": "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&h=300&fit=crop"},
        {"address": "3891 Pine Ridge Blvd", "city": "Phoenix", "state": "AZ", "zip": "85044", "beds": 3, "baths": 2, "sqft": 1850, "year_built": 2008, "estimated_value": 342000, "auction_date": "2026-04-22", "opening_bid": 265000, "lender": "JPMorgan Chase", "status": "Scheduled", "property_type": "Single Family", "lat": 33.3062, "lng": -111.9823, "image": "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&h=300&fit=crop"},
        {"address": "722 Magnolia Way", "city": "Atlanta", "state": "GA", "zip": "30318", "beds": 3, "baths": 2, "sqft": 1620, "year_built": 2001, "estimated_value": 225000, "auction_date": "2026-04-10", "opening_bid": 155000, "lender": "Bank of America", "status": "Scheduled", "property_type": "Single Family", "lat": 33.7813, "lng": -84.4263, "image": "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400&h=300&fit=crop"},
    ],
    "pre_foreclosure": [
        {"address": "5503 Willow Creek Ct", "city": "Las Vegas", "state": "NV", "zip": "89130", "beds": 4, "baths": 3, "sqft": 2800, "year_built": 2007, "estimated_value": 395000, "owed_amount": 312000, "equity_estimate": 83000, "default_date": "2026-01-15", "status": "Notice of Default", "property_type": "Single Family", "lat": 36.2493, "lng": -115.2472, "image": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&h=300&fit=crop"},
        {"address": "1105 Harbor View Rd", "city": "Tampa", "state": "FL", "zip": "33607", "beds": 3, "baths": 2.5, "sqft": 2100, "year_built": 2003, "estimated_value": 310000, "owed_amount": 268000, "equity_estimate": 42000, "default_date": "2026-02-08", "status": "Lis Pendens Filed", "property_type": "Single Family", "lat": 27.9493, "lng": -82.5283, "image": "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=400&h=300&fit=crop"},
        {"address": "890 Summit Ridge Dr", "city": "Denver", "state": "CO", "zip": "80221", "beds": 5, "baths": 3.5, "sqft": 3400, "year_built": 2010, "estimated_value": 520000, "owed_amount": 415000, "equity_estimate": 105000, "default_date": "2025-12-20", "status": "Notice of Default", "property_type": "Single Family", "lat": 39.8372, "lng": -104.9903, "image": "https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=400&h=300&fit=crop"},
    ],
    "tax_lien": [
        {"address": "2234 Elm Street", "city": "Miami", "state": "FL", "zip": "33130", "beds": 3, "baths": 2, "sqft": 1540, "year_built": 1998, "estimated_value": 275000, "tax_owed": 12450, "years_delinquent": 2, "interest_rate": 18, "certificate_date": "2025-06-01", "property_type": "Single Family", "lat": 25.7693, "lng": -80.2043, "image": "https://images.unsplash.com/photo-1599809275671-b5942cabc7a2?w=400&h=300&fit=crop"},
        {"address": "4578 Industrial Pkwy", "city": "Dallas", "state": "TX", "zip": "75220", "beds": 0, "baths": 0, "sqft": 8500, "year_built": 1992, "estimated_value": 650000, "tax_owed": 34200, "years_delinquent": 3, "interest_rate": 12, "certificate_date": "2025-05-15", "property_type": "Commercial", "lat": 32.8603, "lng": -96.8743, "image": "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&h=300&fit=crop"},
    ],
    "nod": [
        {"address": "1678 Sunset Blvd", "city": "Los Angeles", "state": "CA", "zip": "90026", "beds": 2, "baths": 2, "sqft": 1380, "year_built": 1965, "estimated_value": 725000, "owed_amount": 580000, "equity_estimate": 145000, "notice_date": "2026-02-01", "lender": "US Bank", "cure_deadline": "2026-05-01", "property_type": "Single Family", "lat": 34.0783, "lng": -118.2643, "image": "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=400&h=300&fit=crop"},
        {"address": "3345 Peachtree Rd NE", "city": "Atlanta", "state": "GA", "zip": "30326", "beds": 3, "baths": 2.5, "sqft": 1900, "year_built": 2012, "estimated_value": 385000, "owed_amount": 305000, "equity_estimate": 80000, "notice_date": "2026-01-20", "lender": "PNC Bank", "cure_deadline": "2026-04-20", "property_type": "Townhouse", "lat": 33.8460, "lng": -84.3620, "image": "https://images.unsplash.com/photo-1625602812206-5ec545ca1231?w=400&h=300&fit=crop"},
    ],
}


@app.get("/api/realestate/distressed/summary")
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
    }


@app.get("/api/realestate/distressed/{category}")
async def get_distressed(category: str, state: str = "", city: str = ""):
    """Get distressed properties by category — ALL live from RentCast.
    Categories: foreclosure, pre_foreclosure, tax_lien, nod, bankruptcy, off_market, cash_buyer, notes_due"""
    RENTCAST_KEY = os.environ.get("RENTCAST_API_KEY", "")
    
    # Map category to RentCast query strategy
    status_map = {
        "foreclosure": "Foreclosure",
        "pre_foreclosure": "Pre-Foreclosure",
        "nod": "Foreclosure",  # NODs are early-stage foreclosures
    }
    
    # Categories that use listings/sale endpoint
    listing_cats = ["foreclosure", "pre_foreclosure", "nod", "bankruptcy", "cash_buyer"]
    # Categories that use properties endpoint (off-market = not currently listed)
    property_cats = ["tax_lien", "off_market", "notes_due"]
    
    if RENTCAST_KEY:
        try:
            params = {"limit": 20}
            if state:
                params["state"] = state.upper()
            if city:
                params["city"] = city
            
            if category in status_map:
                params["status"] = status_map[category]
            
            async with httpx.AsyncClient(timeout=15) as http:
                if category in listing_cats:
                    endpoint = f"{RENTCAST_BASE}/listings/sale"
                else:
                    endpoint = f"{RENTCAST_BASE}/properties"
                
                resp = await http.get(endpoint, params=params, headers=RENTCAST_HEADERS)
                
                if resp.status_code == 200:
                    live_data = resp.json()
                    if isinstance(live_data, list) and len(live_data) > 0:
                        # Normalize label
                        label_map = {
                            "foreclosure": "Foreclosure",
                            "pre_foreclosure": "Pre-Foreclosure",
                            "nod": "Notice of Default",
                            "tax_lien": "Tax Lien",
                            "bankruptcy": "Bankruptcy/REO",
                            "off_market": "Off-Market",
                            "cash_buyer": "Cash Buyer Opportunity",
                            "notes_due": "Note Coming Due",
                        }
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
                                "estimated_value": p.get("price", p.get("assessorValues", {}).get("totalValue", 0) if isinstance(p.get("assessorValues"), dict) else 0),
                                "status": label_map.get(category, category),
                                "property_type": p.get("propertyType", "Single Family"),
                                "lat": p.get("latitude"),
                                "lng": p.get("longitude"),
                            }
                            for p in live_data
                        ]
                        return {"category": category, "properties": properties, "total": len(properties), "source": "rentcast_live"}
        except Exception as e:
            print(f"[RE Distressed] RentCast API error for {category}: {e}")
    
    # Fallback: cached data
    properties = DISTRESSED_PROPERTIES.get(category, [])
    if state:
        properties = [p for p in properties if p.get("state", "").upper() == state.upper()]
    if city:
        properties = [p for p in properties if city.lower() in p.get("city", "").lower()]
    return {"category": category, "properties": properties, "total": len(properties), "source": "cached"}


@app.get("/api/realestate/deal-analysis")
async def deal_analysis(purchase_price: float, monthly_rent: float, down_payment_pct: float = 25, interest_rate: float = 6.87, loan_term: int = 30, closing_costs_pct: float = 3, vacancy_rate: float = 8, management_fee_pct: float = 10, insurance_annual: float = 1800, taxes_annual: float = 3600, maintenance_pct: float = 5):
    """Run investment deal analysis with key metrics."""
    import math

    down_payment = purchase_price * (down_payment_pct / 100)
    loan_amount = purchase_price - down_payment
    closing_costs = purchase_price * (closing_costs_pct / 100)
    total_cash_in = down_payment + closing_costs

    # Monthly mortgage (P&I)
    monthly_rate = (interest_rate / 100) / 12
    num_payments = loan_term * 12
    if monthly_rate > 0:
        monthly_mortgage = loan_amount * (monthly_rate * (1 + monthly_rate) ** num_payments) / ((1 + monthly_rate) ** num_payments - 1)
    else:
        monthly_mortgage = loan_amount / num_payments

    # Annual income/expenses
    gross_annual_rent = monthly_rent * 12
    effective_rent = gross_annual_rent * (1 - vacancy_rate / 100)
    management_fee = effective_rent * (management_fee_pct / 100)
    maintenance = gross_annual_rent * (maintenance_pct / 100)
    total_annual_expenses = (monthly_mortgage * 12) + insurance_annual + taxes_annual + management_fee + maintenance
    annual_mortgage = monthly_mortgage * 12

    noi = effective_rent - insurance_annual - taxes_annual - management_fee - maintenance
    cash_flow_annual = noi - annual_mortgage
    cash_flow_monthly = cash_flow_annual / 12

    # Key metrics
    cap_rate = (noi / purchase_price) * 100 if purchase_price > 0 else 0
    cash_on_cash = (cash_flow_annual / total_cash_in) * 100 if total_cash_in > 0 else 0
    grm = purchase_price / gross_annual_rent if gross_annual_rent > 0 else 0
    dcr = noi / annual_mortgage if annual_mortgage > 0 else 0
    rent_to_price = (monthly_rent / purchase_price) * 100 if purchase_price > 0 else 0

    # 1% rule check
    one_percent_rule = monthly_rent >= (purchase_price * 0.01)

    return {
        "summary": {
            "purchase_price": purchase_price,
            "down_payment": round(down_payment, 2),
            "loan_amount": round(loan_amount, 2),
            "closing_costs": round(closing_costs, 2),
            "total_cash_invested": round(total_cash_in, 2),
        },
        "monthly": {
            "gross_rent": monthly_rent,
            "effective_rent": round(effective_rent / 12, 2),
            "mortgage_pi": round(monthly_mortgage, 2),
            "insurance": round(insurance_annual / 12, 2),
            "taxes": round(taxes_annual / 12, 2),
            "management": round(management_fee / 12, 2),
            "maintenance": round(maintenance / 12, 2),
            "cash_flow": round(cash_flow_monthly, 2),
        },
        "annual": {
            "gross_rent": round(gross_annual_rent, 2),
            "effective_rent": round(effective_rent, 2),
            "noi": round(noi, 2),
            "total_expenses": round(total_annual_expenses, 2),
            "cash_flow": round(cash_flow_annual, 2),
        },
        "metrics": {
            "cap_rate": round(cap_rate, 2),
            "cash_on_cash": round(cash_on_cash, 2),
            "grm": round(grm, 2),
            "dcr": round(dcr, 2),
            "rent_to_price": round(rent_to_price, 3),
            "one_percent_rule": one_percent_rule,
        },
        "verdict": "Strong Deal" if cap_rate > 6 and cash_on_cash > 8 else ("Good Deal" if cap_rate > 4.5 and cash_on_cash > 5 else ("Moderate" if cap_rate > 3 else "Below Average")),
    }




# ═══════════════════════════════════════════════════════════════════════════════
# STUDIO — AI Creative Engine (Image, Video, Audio Generation)
# ═══════════════════════════════════════════════════════════════════════════════

# Available AI models for Studio — now includes compute tier info
STUDIO_MODELS = {
    "image": [
        {"id": "nano_banana_2",       "name": "NanoBanana v2",       "description": "Fast, high-quality image generation",       "provider": "SaintSal",   "speed": "~10s", "tier": "pro",     "cost_per_min": 0.25, "credits": 5},
        {"id": "dalle_3",             "name": "DALL-E 3",            "description": "OpenAI photorealistic generation",         "provider": "OpenAI",     "speed": "~12s", "tier": "pro",     "cost_per_min": 0.25, "credits": 5},
        {"id": "stable_diffusion_xl", "name": "Stable Diffusion XL", "description": "Open-source, versatile styles",            "provider": "Stability",  "speed": "~8s",  "tier": "pro",     "cost_per_min": 0.25, "credits": 4},
        {"id": "replicate_flux",      "name": "FLUX Pro",            "description": "Ultra high-res, photorealistic",            "provider": "Replicate",  "speed": "~12s", "tier": "max",     "cost_per_min": 0.75, "credits": 15},
        {"id": "nano_banana_pro",     "name": "NanoBanana Pro",      "description": "Premium quality, best for commercial",      "provider": "SaintSal",   "speed": "~15s", "tier": "max",     "cost_per_min": 0.75, "credits": 10},
        {"id": "stable_diffusion_3",  "name": "Stable Diffusion 3.5","description": "Latest SD model, stunning detail",          "provider": "Stability",  "speed": "~10s", "tier": "max",     "cost_per_min": 0.75, "credits": 12},
        {"id": "ideogram_v3",         "name": "Ideogram v3",         "description": "Best text-in-image rendering",              "provider": "Ideogram",   "speed": "~8s",  "tier": "max",     "cost_per_min": 0.75, "credits": 10},
        {"id": "grok_aurora",         "name": "Grok Aurora",         "description": "xAI native flagship image generation",      "provider": "xAI",        "speed": "~10s", "tier": "max_pro", "cost_per_min": 1.00, "credits": 15},
        {"id": "replicate_flux_ultra","name": "FLUX Ultra",          "description": "Highest resolution, maximum quality",       "provider": "Replicate",  "speed": "~15s", "tier": "max_pro", "cost_per_min": 1.00, "credits": 20},
        {"id": "dalle_4",             "name": "DALL-E 4",            "description": "OpenAI next-gen, photorealistic cinema",    "provider": "OpenAI",     "speed": "~12s", "tier": "max_pro", "cost_per_min": 1.00, "credits": 18},
    ],
    "video": [
        {"id": "sora_2",          "name": "Sora 2",            "description": "Cinematic video generation, 4-12s clips",  "provider": "OpenAI",  "speed": "~60s", "tier": "max",     "cost_per_min": 0.75, "credits": 20},
        {"id": "veo_3_1",         "name": "Veo 3.1",           "description": "Google's latest with native audio",        "provider": "Google",  "speed": "~45s", "tier": "max",     "cost_per_min": 0.75, "credits": 18},
        {"id": "runway_gen3",     "name": "Runway Gen-3 Alpha","description": "Runway motion quality, great for cuts",    "provider": "Runway",  "speed": "~30s", "tier": "max",     "cost_per_min": 0.75, "credits": 15},
        {"id": "sora_2_pro",      "name": "Sora 2 Pro",        "description": "Highest quality, best for commercial use", "provider": "OpenAI",  "speed": "~90s", "tier": "max_pro", "cost_per_min": 1.00, "credits": 40},
        {"id": "runway_gen4",     "name": "Runway Gen-4",      "description": "Runway flagship, cinematic motion",        "provider": "Runway",  "speed": "~30s", "tier": "max_pro", "cost_per_min": 1.00, "credits": 30},
        {"id": "veo_3_1_fast",    "name": "Veo 3.1 Fast",      "description": "Google fastest premium video",             "provider": "Google",  "speed": "~20s", "tier": "max_pro", "cost_per_min": 1.00, "credits": 25},
    ],
    "audio": [
        {"id": "elevenlabs_basic", "name": "ElevenLabs Basic",   "description": "Fast text-to-speech",              "provider": "ElevenLabs", "speed": "~3s",  "tier": "mini",    "cost_per_min": 0.05, "credits": 2},
        {"id": "gemini_tts",       "name": "Gemini TTS",         "description": "Google native TTS, natural voices","provider": "Google",      "speed": "~2s",  "tier": "mini",    "cost_per_min": 0.05, "credits": 2},
        {"id": "elevenlabs_pro",   "name": "ElevenLabs Pro",     "description": "HD voice synthesis, clone ready",   "provider": "ElevenLabs", "speed": "~5s",  "tier": "pro",     "cost_per_min": 0.25, "credits": 5},
        {"id": "elevenlabs_hd",    "name": "ElevenLabs HD",      "description": "Studio-grade voice output",         "provider": "ElevenLabs", "speed": "~6s",  "tier": "max",     "cost_per_min": 0.75, "credits": 8},
        {"id": "elevenlabs_ultra", "name": "ElevenLabs Ultra",   "description": "Ultra-realistic voice cloning",     "provider": "ElevenLabs", "speed": "~8s",  "tier": "max_pro", "cost_per_min": 1.00, "credits": 10},
    ],
    "design": [
        {"id": "stitch_flash",  "name": "Stitch Flash",  "description": "Fast UI design generation (Gemini Flash)", "provider": "Google Stitch", "speed": "~15s", "tier": "pro",     "cost_per_min": 0.25, "credits": 5},
        {"id": "stitch_pro",    "name": "Stitch Pro",    "description": "Premium UI design (Gemini 3 Pro)",         "provider": "Google Stitch", "speed": "~30s", "tier": "max",     "cost_per_min": 0.75, "credits": 10},
        {"id": "stitch_ultra",  "name": "Stitch Ultra",  "description": "Flagship design with full code export",    "provider": "Google Stitch", "speed": "~20s", "tier": "max_pro", "cost_per_min": 1.00, "credits": 15},
    ],
    "chat": [
        {"id": "claude_haiku",        "name": "Claude 3.5 Haiku",        "description": "Fast everyday tasks",                "provider": "Anthropic",  "speed": "~1s",  "tier": "mini",    "cost_per_min": 0.05, "credits": 1},
        {"id": "gemini_flash",        "name": "Gemini 2.5 Flash",        "description": "Lightning fast",                     "provider": "Google",     "speed": "~1s",  "tier": "mini",    "cost_per_min": 0.05, "credits": 1},
        {"id": "grok_mini",           "name": "Grok Mini",               "description": "xAI fast reasoning",                 "provider": "xAI",        "speed": "~1s",  "tier": "mini",    "cost_per_min": 0.05, "credits": 1},
        {"id": "claude_sonnet",       "name": "Claude Sonnet 4",         "description": "Best speed + quality balance",       "provider": "Anthropic",  "speed": "~2s",  "tier": "pro",     "cost_per_min": 0.25, "credits": 3},
        {"id": "gpt4o",               "name": "GPT-4o",                  "description": "OpenAI flagship multimodal",         "provider": "OpenAI",     "speed": "~2s",  "tier": "pro",     "cost_per_min": 0.25, "credits": 3},
        {"id": "grok_2",              "name": "Grok 2",                  "description": "xAI production reasoning",           "provider": "xAI",        "speed": "~2s",  "tier": "pro",     "cost_per_min": 0.25, "credits": 3},
        {"id": "claude_sonnet_think", "name": "Claude Sonnet (Thinking)","description": "Extended reasoning with chain of thought", "provider": "Anthropic", "speed": "~6s", "tier": "max", "cost_per_min": 0.75, "credits": 8},
        {"id": "grok3",               "name": "Grok 3",                  "description": "xAI heavy reasoning",                "provider": "xAI",        "speed": "~4s",  "tier": "max",     "cost_per_min": 0.75, "credits": 8},
        {"id": "deepseek_r1",         "name": "DeepSeek R1",             "description": "Deep reasoning specialist",           "provider": "DeepSeek",   "speed": "~8s",  "tier": "max",     "cost_per_min": 0.75, "credits": 8},
        {"id": "claude_opus",         "name": "Claude Opus 4",           "description": "Maximum reasoning power",             "provider": "Anthropic",  "speed": "~8s",  "tier": "max_pro", "cost_per_min": 1.00, "credits": 15},
        {"id": "grok4",               "name": "Grok-4",                  "description": "xAI absolute best",                  "provider": "xAI",        "speed": "~5s",  "tier": "max_pro", "cost_per_min": 1.00, "credits": 15},
        {"id": "o3",                  "name": "o3",                      "description": "OpenAI flagship reasoning",           "provider": "OpenAI",     "speed": "~15s", "tier": "max_pro", "cost_per_min": 1.00, "credits": 20},
        {"id": "llama_behemoth",      "name": "Llama 4 Behemoth",        "description": "Meta largest, most capable",          "provider": "Meta",       "speed": "~8s",  "tier": "max_pro", "cost_per_min": 1.00, "credits": 12},
    ],
}

STUDIO_VOICES = {
    "gemini": ["kore", "charon", "fenrir", "aoede", "puck", "leda", "orus", "zephyr", "achernar", "gacrux", "umbriel", "schedar", "despina", "iapetus"],
    "elevenlabs": ["rachel", "adam", "alice", "brian", "charlie", "charlotte", "chris", "daniel", "emily", "george", "james", "lily", "sam", "sarah"],
}

# ═══════════════════════════════════════════════════════════════════════════════
# GOOGLE STITCH — AI UI Design via MCP (Model Context Protocol)
# ═══════════════════════════════════════════════════════════════════════════════

STITCH_API_KEY = os.environ.get("STITCH_API_KEY", "")
STITCH_MCP_URL = "https://stitch.googleapis.com/mcp"
STITCH_MODEL_MAP = {"stitch_flash": "GEMINI_3_FLASH", "stitch_pro": "GEMINI_3_PRO"}


async def stitch_call(method: str, arguments: dict):
    """Make a JSON-RPC call to the Stitch MCP server."""
    payload = {
        "jsonrpc": "2.0",
        "id": str(uuid.uuid4()),
        "method": "tools/call",
        "params": {"name": method, "arguments": arguments},
    }
    async with httpx.AsyncClient(timeout=60.0) as http:
        resp = await http.post(
            STITCH_MCP_URL,
            json=payload,
            headers={"X-Goog-Api-Key": STITCH_API_KEY, "Accept": "application/json", "Content-Type": "application/json"},
        )
        data = resp.json()
        if "error" in data:
            return {"error": data["error"].get("message", str(data["error"]))}
        result = data.get("result", {})
        # MCP returns content as array of {type, text} — extract and parse
        content_list = result.get("content", [])
        for c in content_list:
            if c.get("type") == "text":
                try:
                    return json.loads(c["text"])
                except (json.JSONDecodeError, TypeError):
                    return {"raw": c["text"]}
            if c.get("type") == "image":
                return {"image": c.get("data", ""), "mimeType": c.get("mimeType", "image/png")}
        # Structured content fallback
        if result.get("structuredContent"):
            return result["structuredContent"]
        return result


@app.get("/api/stitch/projects")
async def stitch_list_projects():
    """List all Stitch design projects."""
    if not STITCH_API_KEY:
        return JSONResponse({"error": "Stitch API key not configured"}, status_code=503)
    data = await stitch_call("list_projects", {"filter": "owned"})
    return {"projects": data.get("projects", []) if isinstance(data, dict) else [], "api_live": True}


@app.post("/api/stitch/projects")
async def stitch_create_project(request: Request):
    """Create a new Stitch design project."""
    body = await request.json()
    title = body.get("title", "SaintSal Design")
    data = await stitch_call("create_project", {"title": title})
    return {"project": data, "api_live": True}


@app.get("/api/stitch/projects/{project_id}")
async def stitch_get_project(project_id: str):
    """Get details of a Stitch project."""
    data = await stitch_call("get_project", {"name": f"projects/{project_id}"})
    return {"project": data, "api_live": True}


@app.get("/api/stitch/projects/{project_id}/screens")
async def stitch_list_screens(project_id: str):
    """List all screens in a Stitch project."""
    data = await stitch_call("list_screens", {"project_id": project_id})
    return {"screens": data.get("screens", []) if isinstance(data, dict) else [], "api_live": True}


@app.get("/api/stitch/projects/{project_id}/screens/{screen_id}")
async def stitch_get_screen(project_id: str, screen_id: str):
    """Get a specific screen with code/image."""
    data = await stitch_call("get_screen", {"project_id": project_id, "screen_id": screen_id})
    return {"screen": data, "api_live": True}


@app.post("/api/stitch/generate")
async def stitch_generate_screen(request: Request):
    """Generate a UI design from a text prompt using Stitch."""
    body = await request.json()
    project_id = body.get("project_id", "")
    prompt = body.get("prompt", "")
    model = body.get("model", "stitch_pro")
    model_id = STITCH_MODEL_MAP.get(model, "GEMINI_3_PRO")

    if not prompt:
        return JSONResponse({"error": "Prompt is required"}, status_code=400)

    # Auto-create project if none provided
    if not project_id:
        proj = await stitch_call("create_project", {"title": prompt[:50]})
        if isinstance(proj, dict) and proj.get("name"):
            project_id = proj["name"].replace("projects/", "")
        else:
            return JSONResponse({"error": "Failed to create Stitch project", "detail": str(proj)}, status_code=500)

    # Generate the screen
    data = await stitch_call("generate_screen_from_text", {
        "project_id": project_id,
        "prompt": prompt,
        "model_id": model_id,
    })

    # The response may include screen info — fetch screens to get the latest
    screens_data = await stitch_call("list_screens", {"project_id": project_id})
    screens = screens_data.get("screens", []) if isinstance(screens_data, dict) else []

    return {
        "project_id": project_id,
        "generation_result": data,
        "screens": screens,
        "stitch_url": f"https://stitch.withgoogle.com/project/{project_id}",
        "api_live": True,
    }


@app.get("/api/stitch/status")
async def stitch_status():
    """Check Stitch API connectivity."""
    if not STITCH_API_KEY:
        return {"connected": False, "error": "No API key"}
    try:
        data = await stitch_call("list_projects", {"filter": "owned"})
        return {"connected": True, "projects_count": len(data.get("projects", []) if isinstance(data, dict) else [])}
    except Exception as e:
        return {"connected": False, "error": str(e)}


# ═══════════════════════════════════════════════════════════════════════════════
# PERPLEXITY SONAR — Deep Research with Citations (Auto-detect in chat)
# ═══════════════════════════════════════════════════════════════════════════════

PPLX_API_KEY = os.environ.get("PPLX_API_KEY", os.environ.get("PERPLEXITY_API_KEY", ""))
print(f"{'✅' if PPLX_API_KEY else '⚠️'} Perplexity API key {'configured' if PPLX_API_KEY else 'not set'}")

# Keywords that signal a research-worthy query (auto-detect)
RESEARCH_SIGNALS = [
    "research", "analyze", "compare", "what is", "how does", "explain",
    "latest", "news", "update", "trend", "market", "competitor",
    "statistics", "data on", "report on", "find out", "look up",
    "current", "recent", "2025", "2026", "who is", "where is",
    "price of", "cost of", "review", "best", "top", "vs", "versus",
]

def needs_research(query: str) -> bool:
    """Auto-detect if a query needs live web research via Perplexity.
    AGGRESSIVE: almost everything gets research context to INFORM execution.
    Only skip for pure greetings / tiny queries."""
    q = query.lower().strip()
    # Skip trivial greetings
    trivial = ["hi", "hello", "hey", "thanks", "thank you", "ok", "bye", "good morning", "good night", "gm", "gn"]
    if q in trivial or len(q.split()) < 2:
        return False
    # Direct research signals — always yes
    if any(sig in q for sig in RESEARCH_SIGNALS):
        return True
    # Questions — always yes
    if q.endswith("?") and len(q.split()) > 2:
        return True
    # Action queries ALSO get research — "write me a business plan" needs market data
    action_words = ["create", "generate", "build", "make", "write", "draft", "design", "help me", "plan", "prepare", "develop"]
    if any(q.startswith(a) for a in action_words):
        return True
    # Anything with 4+ words probably needs context
    if len(q.split()) >= 4:
        return True
    return False


async def perplexity_research(query: str, model: str = "sonar-pro") -> dict:
    """Call Perplexity Sonar API for research with citations."""
    if not PPLX_API_KEY:
        return {"answer": "", "citations": [], "error": "Perplexity API key not configured"}

    async with httpx.AsyncClient(timeout=30.0) as http:
        try:
            resp = await http.post(
                "https://api.perplexity.ai/chat/completions",
                headers={
                    "Authorization": f"Bearer {PPLX_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": "You are a research assistant for SaintSal Labs. Provide concise, well-sourced answers with citations. Be thorough but not verbose."},
                        {"role": "user", "content": query},
                    ],
                    "return_citations": True,
                    "return_related_questions": True,
                },
            )
            data = resp.json()
            if resp.status_code != 200:
                return {"answer": "", "citations": [], "error": data.get("error", {}).get("message", str(resp.status_code))}

            choice = data.get("choices", [{}])[0]
            return {
                "answer": choice.get("message", {}).get("content", ""),
                "citations": data.get("citations", []),
                "related_questions": data.get("related_questions", []),
                "model": data.get("model", model),
            }
        except Exception as e:
            return {"answer": "", "citations": [], "error": str(e)}


@limiter.limit("15/minute")
@app.post("/api/research")
async def research_endpoint(request: Request):
    """Dedicated research endpoint using Perplexity Sonar."""
    body = await request.json()
    query = body.get("query", "")
    model = body.get("model", "sonar-pro")  # sonar, sonar-pro
    if not query:
        return JSONResponse({"error": "Query is required"}, status_code=400)
    result = await perplexity_research(query, model)
    return result


@app.get("/api/research/status")
async def research_status():
    """Check Perplexity API connectivity."""
    return {"connected": bool(PPLX_API_KEY), "provider": "Perplexity", "models": ["sonar", "sonar-pro"]}


# ═══════════════════════════════════════════════════════════════════════════════
# GEMINI CHAT — Google Gemini for multimodal chat (Pro+ tier)
# ═══════════════════════════════════════════════════════════════════════════════

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")  # v7.40.0: removed dead default key
print(f"{'✅' if GEMINI_API_KEY else '⚠️'} Gemini API key {'configured' if GEMINI_API_KEY else 'not set'}")

async def gemini_chat(query: str, history: list = None, system_prompt: str = "") -> dict:
    """Call Gemini API for multimodal chat."""
    if not GEMINI_API_KEY:
        return {"response": "", "error": "Gemini API key not configured"}

    messages = []
    if history:
        for msg in history[-10:]:
            role = "user" if msg.get("role") == "user" else "model"
            messages.append({"role": role, "parts": [{"text": msg["content"]}]})
    messages.append({"role": "user", "parts": [{"text": query}]})

    payload = {
        "contents": messages,
        "generationConfig": {"maxOutputTokens": 4096, "temperature": 0.7},
    }
    if system_prompt:
        payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}

    async with httpx.AsyncClient(timeout=30.0) as http:
        try:
            resp = await http.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}",
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            data = resp.json()
            if resp.status_code != 200:
                return {"response": "", "error": str(data)}
            candidates = data.get("candidates", [{}])
            text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            return {"response": text}
        except Exception as e:
            return {"response": "", "error": str(e)}


# ═══════════════════════════════════════════════════════════════════════════════
# DOCUMENT GENERATION — Create PDFs, DOCX from chat
# ═══════════════════════════════════════════════════════════════════════════════

import io
import re as _re

@app.post("/api/generate/document")
async def generate_document(request: Request):
    """Generate a document (proposal, report, etc.) from AI and return downloadable HTML."""
    body = await request.json()
    doc_type = body.get("type", "report")  # report, proposal, letter, resume
    title = body.get("title", "Document")
    content = body.get("content", "")
    prompt = body.get("prompt", "")

    # If prompt given, generate content via Claude
    if prompt and not content:
        doc_system = f"""You are a professional document writer for SaintSal Labs.
Generate a well-structured {doc_type} in clean HTML format.
Use proper headings (h1, h2, h3), paragraphs, bullet lists, and tables where appropriate.
Make it professional, polished, and ready to print/download.
Title: {title}
Do NOT include <html>, <head>, or <body> tags — just the document content HTML."""

        if client:
            try:
                msg = client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=4096,
                    system=doc_system,
                    messages=[{"role": "user", "content": prompt}],
                )
                content = msg.content[0].text
            except Exception as e:
                return JSONResponse({"error": f"AI generation failed: {e}"}, status_code=500)
        else:
            return JSONResponse({"error": "No AI model available"}, status_code=503)

    # Wrap in printable HTML
    html_doc = f"""<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>{title}</title>
<style>
  body {{ font-family: 'Georgia', serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #1a1a1a; line-height: 1.7; }}
  h1 {{ font-size: 28px; border-bottom: 2px solid #c8a24e; padding-bottom: 10px; color: #1a1a1a; }}
  h2 {{ font-size: 22px; color: #333; margin-top: 30px; }}
  h3 {{ font-size: 18px; color: #555; }}
  table {{ border-collapse: collapse; width: 100%; margin: 20px 0; }}
  th, td {{ border: 1px solid #ddd; padding: 10px; text-align: left; }}
  th {{ background: #f5f0e0; font-weight: bold; }}
  ul, ol {{ padding-left: 24px; }}
  li {{ margin-bottom: 6px; }}
  .footer {{ margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #888; }}
  @media print {{ body {{ margin: 0; }} }}
</style>
</head><body>
{content}
<div class="footer">Generated by SaintSal™ Labs &mdash; Responsible Intelligence</div>
</body></html>"""

    return {
        "html": html_doc,
        "title": title,
        "type": doc_type,
        "downloadable": True,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# IMAGE GENERATION — Create images from text prompts in chat
# ═══════════════════════════════════════════════════════════════════════════════

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

@app.post("/api/generate/image")
async def generate_image(request: Request):
    """Generate an image from a text prompt."""
    body = await request.json()
    prompt = body.get("prompt", "")
    size = body.get("size", "1024x1024")

    if not prompt:
        return JSONResponse({"error": "Prompt is required"}, status_code=400)

    # Try OpenAI DALL-E
    if OPENAI_API_KEY:
        async with httpx.AsyncClient(timeout=60.0) as http:
            try:
                resp = await http.post(
                    "https://api.openai.com/v1/images/generations",
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
                    json={"model": "dall-e-3", "prompt": prompt, "n": 1, "size": size, "response_format": "url"},
                )
                data = resp.json()
                if resp.status_code == 200 and data.get("data"):
                    img = data["data"][0]
                    return {"url": img.get("url", ""), "revised_prompt": img.get("revised_prompt", ""), "provider": "dall-e-3"}
                return JSONResponse({"error": data.get("error", {}).get("message", "Image generation failed")}, status_code=500)
            except Exception as e:
                return JSONResponse({"error": str(e)}, status_code=500)

    # Fallback: use Gemini image generation
    if GEMINI_API_KEY:
        async with httpx.AsyncClient(timeout=60.0) as http:
            try:
                resp = await http.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}",
                    json={
                        "contents": [{"parts": [{"text": f"Generate a detailed image description for: {prompt}"}]}],
                        "generationConfig": {"maxOutputTokens": 1024},
                    },
                    headers={"Content-Type": "application/json"},
                )
                data = resp.json()
                desc = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                # Return text description as fallback when no image API available
                return {"description": desc, "provider": "gemini-description", "note": "Image description generated — add OpenAI API key for actual image generation"}
            except Exception as e:
                return JSONResponse({"error": str(e)}, status_code=500)

    return JSONResponse({"error": "No image generation API configured. Add OPENAI_API_KEY for DALL-E."}, status_code=503)


@app.get("/api/generate/status")
async def generate_status():
    """Check which generation capabilities are available."""
    return {
        "document": bool(client),  # Claude for doc generation
        "image": bool(OPENAI_API_KEY),
        "image_fallback": bool(GEMINI_API_KEY),
        "research": bool(PPLX_API_KEY),
        "multimodal": bool(GEMINI_API_KEY),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ENHANCED CHAT — Auto-detect research, generate docs/images inline
# ═══════════════════════════════════════════════════════════════════════════════

def detect_intent(query: str) -> str:
    """Detect what the user wants: research, document, image, or chat."""
    q = query.lower().strip()
    # Image generation
    img_signals = ["generate image", "create image", "make image", "draw", "design a logo",
                   "generate a picture", "create a graphic", "make a graphic", "visualize"]
    if any(sig in q for sig in img_signals):
        return "image"
    # Document generation
    doc_signals = ["create a document", "generate a report", "write a proposal", "draft a letter",
                   "make a resume", "create a pdf", "generate a pdf", "write a report",
                   "create a presentation", "build a document", "write up"]
    if any(sig in q for sig in doc_signals):
        return "document"
    # Research
    if needs_research(q):
        return "research"
    return "chat"


# ============================================================================
# METERING & BILLING — Mini/Pro/Max/MaxPro Per-Minute Compute Tiers
# ============================================================================
# Stripe Metered Price IDs:
#   Mini ($0.05/min):     price_1T5bkVL47U80vDLAHHAjXmJh
#   Pro ($0.25/min):      price_1T5bkWL47U80vDLA4EI3dylp
#   Max ($0.75/min):      price_1T5bkXL47U80vDLAh6DLuS0j
#   Max Pro ($1.00/min):  price_1T5bkYL47U80vDLAVOs5fj75
# ============================================================================

STRIPE_SECRET = os.environ.get("STRIPE_SECRET_KEY", "")

# Compute tier definitions
COMPUTE_TIERS = {
    "mini":     {"price_per_min": 0.05, "label": "Mini",     "stripe_price_id": "price_1T5bkVL47U80vDLAHHAjXmJh", "color": "#6B7280"},
    "pro":      {"price_per_min": 0.25, "label": "Pro",      "stripe_price_id": "price_1T5bkWL47U80vDLA4EI3dylp", "color": "#10B981"},
    "max":      {"price_per_min": 0.75, "label": "Max",      "stripe_price_id": "price_1T5bkXL47U80vDLAh6DLuS0j", "color": "#8B5CF6"},
    "max_pro":  {"price_per_min": 1.00, "label": "Max Pro",  "stripe_price_id": "price_1T5bkYL47U80vDLAVOs5fj75", "color": "#F59E0B"},
}

# Model → compute tier mapping with full cost data
MODEL_COSTS = {
    # ═══ MINI TIER ($0.05/min) — Fast, affordable, everyday tasks ═══
    "claude_haiku":         {"name": "Claude 3.5 Haiku",        "provider": "Anthropic",     "category": "chat",    "tier": "mini",    "our_cost": 0.008,  "charge": 0.05, "credits": 1,  "min_plan": "free",    "speed": "~1s",   "quality": "Fast"},
    "gpt4o_mini":           {"name": "GPT-4o Mini",             "provider": "OpenAI",        "category": "chat",    "tier": "mini",    "our_cost": 0.010,  "charge": 0.05, "credits": 1,  "min_plan": "free",    "speed": "~1s",   "quality": "Fast"},
    "gemini_flash":         {"name": "Gemini 2.5 Flash",        "provider": "Google",        "category": "chat",    "tier": "mini",    "our_cost": 0.005,  "charge": 0.05, "credits": 1,  "min_plan": "free",    "speed": "~1s",   "quality": "Fast"},
    "llama_scout":          {"name": "Llama 4 Scout",           "provider": "Meta",          "category": "chat",    "tier": "mini",    "our_cost": 0.007,  "charge": 0.05, "credits": 1,  "min_plan": "free",    "speed": "~1s",   "quality": "Fast"},
    "mistral_small":        {"name": "Mistral Small",           "provider": "Mistral",       "category": "chat",    "tier": "mini",    "our_cost": 0.006,  "charge": 0.05, "credits": 1,  "min_plan": "free",    "speed": "~1s",   "quality": "Fast"},
    "grok_mini":            {"name": "Grok Mini",               "provider": "xAI",           "category": "chat",    "tier": "mini",    "our_cost": 0.008,  "charge": 0.05, "credits": 1,  "min_plan": "free",    "speed": "~1s",   "quality": "Fast"},
    "elevenlabs_basic":     {"name": "ElevenLabs Basic TTS",    "provider": "ElevenLabs",    "category": "audio",   "tier": "mini",    "our_cost": 0.010,  "charge": 0.05, "credits": 2,  "min_plan": "free",    "speed": "~3s",   "quality": "Fast"},
    "gemini_tts":           {"name": "Gemini TTS",              "provider": "Google",        "category": "audio",   "tier": "mini",    "our_cost": 0.008,  "charge": 0.05, "credits": 2,  "min_plan": "free",    "speed": "~2s",   "quality": "Fast"},

    # ═══ PRO TIER ($0.25/min) — Production-grade, best balance ═══
    "claude_sonnet":        {"name": "Claude Sonnet 4",         "provider": "Anthropic",     "category": "chat",    "tier": "pro",     "our_cost": 0.045,  "charge": 0.25, "credits": 3,  "min_plan": "starter", "speed": "~2s",   "quality": "Pro"},
    "gpt4o":                {"name": "GPT-4o",                  "provider": "OpenAI",        "category": "chat",    "tier": "pro",     "our_cost": 0.038,  "charge": 0.25, "credits": 3,  "min_plan": "starter", "speed": "~2s",   "quality": "Pro"},
    "gemini_pro":           {"name": "Gemini 2.5 Pro",          "provider": "Google",        "category": "chat",    "tier": "pro",     "our_cost": 0.030,  "charge": 0.25, "credits": 3,  "min_plan": "starter", "speed": "~2s",   "quality": "Pro"},
    "grok_2":               {"name": "Grok 2",                  "provider": "xAI",           "category": "chat",    "tier": "pro",     "our_cost": 0.035,  "charge": 0.25, "credits": 3,  "min_plan": "starter", "speed": "~2s",   "quality": "Pro"},
    "llama_maverick":       {"name": "Llama 4 Maverick",        "provider": "Meta",          "category": "chat",    "tier": "pro",     "our_cost": 0.040,  "charge": 0.25, "credits": 3,  "min_plan": "starter", "speed": "~2s",   "quality": "Pro"},
    "deepseek_v3":          {"name": "DeepSeek V3",             "provider": "DeepSeek",      "category": "chat",    "tier": "pro",     "our_cost": 0.020,  "charge": 0.25, "credits": 2,  "min_plan": "starter", "speed": "~2s",   "quality": "Pro"},
    "sonar_pro":            {"name": "Perplexity Sonar Pro",    "provider": "Perplexity",    "category": "search",  "tier": "pro",     "our_cost": 0.030,  "charge": 0.25, "credits": 5,  "min_plan": "starter", "speed": "~3s",   "quality": "Pro"},
    "nano_banana_2":        {"name": "NanoBanana v2",           "provider": "SaintSal",      "category": "image",   "tier": "pro",     "our_cost": 0.020,  "charge": 0.25, "credits": 5,  "min_plan": "starter", "speed": "~10s",  "quality": "Pro"},
    "dalle_3":              {"name": "DALL-E 3",                "provider": "OpenAI",        "category": "image",   "tier": "pro",     "our_cost": 0.040,  "charge": 0.25, "credits": 5,  "min_plan": "starter", "speed": "~12s",  "quality": "Pro"},
    "stable_diffusion_xl":  {"name": "Stable Diffusion XL",     "provider": "Stability",     "category": "image",   "tier": "pro",     "our_cost": 0.015,  "charge": 0.25, "credits": 4,  "min_plan": "starter", "speed": "~8s",   "quality": "Pro"},
    "elevenlabs_pro":       {"name": "ElevenLabs Pro TTS",      "provider": "ElevenLabs",    "category": "audio",   "tier": "pro",     "our_cost": 0.030,  "charge": 0.25, "credits": 5,  "min_plan": "starter", "speed": "~5s",   "quality": "Pro"},
    "stitch_flash":         {"name": "Stitch Flash",            "provider": "Google Stitch", "category": "design",  "tier": "pro",     "our_cost": 0.025,  "charge": 0.25, "credits": 5,  "min_plan": "starter", "speed": "~15s",  "quality": "Pro"},

    # ═══ MAX TIER ($0.75/min) — Power users, heavy builds, premium output ═══
    "claude_sonnet_think":  {"name": "Claude Sonnet (Thinking)","provider": "Anthropic",     "category": "chat",    "tier": "max",     "our_cost": 0.068,  "charge": 0.75, "credits": 8,  "min_plan": "pro",     "speed": "~6s",   "quality": "Ultra"},
    "gpt4o_plus":           {"name": "GPT-4o (Extended)",       "provider": "OpenAI",        "category": "chat",    "tier": "max",     "our_cost": 0.080,  "charge": 0.75, "credits": 8,  "min_plan": "pro",     "speed": "~3s",   "quality": "Ultra"},
    "gemini_ultra":         {"name": "Gemini Ultra",            "provider": "Google",        "category": "chat",    "tier": "max",     "our_cost": 0.150,  "charge": 0.75, "credits": 8,  "min_plan": "pro",     "speed": "~4s",   "quality": "Ultra"},
    "grok3":                {"name": "Grok 3",                  "provider": "xAI",           "category": "chat",    "tier": "max",     "our_cost": 0.180,  "charge": 0.75, "credits": 8,  "min_plan": "pro",     "speed": "~4s",   "quality": "Ultra"},
    "deepseek_r1":          {"name": "DeepSeek R1",             "provider": "DeepSeek",      "category": "chat",    "tier": "max",     "our_cost": 0.055,  "charge": 0.75, "credits": 8,  "min_plan": "pro",     "speed": "~8s",   "quality": "Ultra"},
    "qwen_qwq":             {"name": "Qwen QWQ-32B",            "provider": "Alibaba",       "category": "chat",    "tier": "max",     "our_cost": 0.030,  "charge": 0.75, "credits": 6,  "min_plan": "pro",     "speed": "~5s",   "quality": "Ultra"},
    "replicate_flux":       {"name": "FLUX Pro",                "provider": "Replicate",     "category": "image",   "tier": "max",     "our_cost": 0.100,  "charge": 0.75, "credits": 15, "min_plan": "pro",     "speed": "~12s",  "quality": "Ultra"},
    "nano_banana_pro":      {"name": "NanoBanana Pro",          "provider": "SaintSal",      "category": "image",   "tier": "max",     "our_cost": 0.080,  "charge": 0.75, "credits": 10, "min_plan": "pro",     "speed": "~15s",  "quality": "Ultra"},
    "stable_diffusion_3":   {"name": "Stable Diffusion 3.5",    "provider": "Stability",     "category": "image",   "tier": "max",     "our_cost": 0.060,  "charge": 0.75, "credits": 12, "min_plan": "pro",     "speed": "~10s",  "quality": "Ultra"},
    "ideogram_v3":          {"name": "Ideogram v3",             "provider": "Ideogram",      "category": "image",   "tier": "max",     "our_cost": 0.050,  "charge": 0.75, "credits": 10, "min_plan": "pro",     "speed": "~8s",   "quality": "Ultra"},
    "sora_2":               {"name": "Sora 2",                  "provider": "OpenAI",        "category": "video",   "tier": "max",     "our_cost": 0.200,  "charge": 0.75, "credits": 20, "min_plan": "pro",     "speed": "~60s",  "quality": "Ultra"},
    "veo_3_1":              {"name": "Veo 3.1",                 "provider": "Google",        "category": "video",   "tier": "max",     "our_cost": 0.150,  "charge": 0.75, "credits": 18, "min_plan": "pro",     "speed": "~45s",  "quality": "Ultra"},
    "runway_gen3":          {"name": "Runway Gen-3 Alpha",      "provider": "Runway",        "category": "video",   "tier": "max",     "our_cost": 0.180,  "charge": 0.75, "credits": 15, "min_plan": "pro",     "speed": "~30s",  "quality": "Ultra"},
    "elevenlabs_hd":        {"name": "ElevenLabs HD",           "provider": "ElevenLabs",    "category": "audio",   "tier": "max",     "our_cost": 0.040,  "charge": 0.75, "credits": 8,  "min_plan": "pro",     "speed": "~6s",   "quality": "Ultra"},
    "assemblyai":           {"name": "AssemblyAI",              "provider": "AssemblyAI",    "category": "transcription", "tier": "max", "our_cost": 0.010, "charge": 0.75, "credits": 3, "min_plan": "pro", "speed": "~RT", "quality": "Ultra"},
    "stitch_pro":           {"name": "Stitch Pro",              "provider": "Google Stitch", "category": "design",  "tier": "max",     "our_cost": 0.080,  "charge": 0.75, "credits": 10, "min_plan": "pro",     "speed": "~30s",  "quality": "Ultra"},

    # ═══ MAX PRO TIER ($1.00/min) — Best of the best, flagship everything ═══
    "claude_opus":          {"name": "Claude Opus 4",           "provider": "Anthropic",     "category": "chat",    "tier": "max_pro", "our_cost": 0.225,  "charge": 1.00, "credits": 15, "min_plan": "teams",   "speed": "~8s",   "quality": "Flagship"},
    "o3_mini":              {"name": "o3-mini",                 "provider": "OpenAI",        "category": "chat",    "tier": "max_pro", "our_cost": 0.165,  "charge": 1.00, "credits": 15, "min_plan": "teams",   "speed": "~8s",   "quality": "Flagship"},
    "o3":                   {"name": "o3",                      "provider": "OpenAI",        "category": "chat",    "tier": "max_pro", "our_cost": 0.400,  "charge": 1.00, "credits": 20, "min_plan": "teams",   "speed": "~15s",  "quality": "Flagship"},
    "grok4":                {"name": "Grok-4",                  "provider": "xAI",           "category": "chat",    "tier": "max_pro", "our_cost": 0.200,  "charge": 1.00, "credits": 15, "min_plan": "teams",   "speed": "~5s",   "quality": "Flagship"},
    "gemini_think":         {"name": "Gemini Pro (Thinking)",   "provider": "Google",        "category": "chat",    "tier": "max_pro", "our_cost": 0.120,  "charge": 1.00, "credits": 12, "min_plan": "teams",   "speed": "~10s",  "quality": "Flagship"},
    "llama_behemoth":       {"name": "Llama 4 Behemoth",        "provider": "Meta",          "category": "chat",    "tier": "max_pro", "our_cost": 0.150,  "charge": 1.00, "credits": 12, "min_plan": "teams",   "speed": "~8s",   "quality": "Flagship"},
    "grok_aurora":          {"name": "Grok Aurora",             "provider": "xAI",           "category": "image",   "tier": "max_pro", "our_cost": 0.060,  "charge": 1.00, "credits": 15, "min_plan": "teams",   "speed": "~10s",  "quality": "Flagship"},
    "replicate_flux_ultra": {"name": "FLUX Ultra",              "provider": "Replicate",     "category": "image",   "tier": "max_pro", "our_cost": 0.150,  "charge": 1.00, "credits": 20, "min_plan": "teams",   "speed": "~15s",  "quality": "Flagship"},
    "dalle_4":              {"name": "DALL-E 4",                "provider": "OpenAI",        "category": "image",   "tier": "max_pro", "our_cost": 0.120,  "charge": 1.00, "credits": 18, "min_plan": "teams",   "speed": "~12s",  "quality": "Flagship"},
    "sora_2_pro":           {"name": "Sora 2 Pro",              "provider": "OpenAI",        "category": "video",   "tier": "max_pro", "our_cost": 0.400,  "charge": 1.00, "credits": 40, "min_plan": "teams",   "speed": "~90s",  "quality": "Flagship"},
    "runway_gen4":          {"name": "Runway Gen-4",            "provider": "Runway",        "category": "video",   "tier": "max_pro", "our_cost": 0.300,  "charge": 1.00, "credits": 30, "min_plan": "teams",   "speed": "~30s",  "quality": "Flagship"},
    "veo_3_1_fast":         {"name": "Veo 3.1 Fast",            "provider": "Google",        "category": "video",   "tier": "max_pro", "our_cost": 0.250,  "charge": 1.00, "credits": 25, "min_plan": "teams",   "speed": "~20s",  "quality": "Flagship"},
    "elevenlabs_ultra":     {"name": "ElevenLabs Ultra",        "provider": "ElevenLabs",    "category": "audio",   "tier": "max_pro", "our_cost": 0.050,  "charge": 1.00, "credits": 10, "min_plan": "teams",   "speed": "~8s",   "quality": "Flagship"},
    "stitch_ultra":         {"name": "Stitch Ultra",            "provider": "Google Stitch", "category": "design",  "tier": "max_pro", "our_cost": 0.120,  "charge": 1.00, "credits": 15, "min_plan": "teams",   "speed": "~20s",  "quality": "Flagship"},
    "assemblyai_ultra":     {"name": "AssemblyAI Ultra",        "provider": "AssemblyAI",    "category": "transcription", "tier": "max_pro", "our_cost": 0.020, "charge": 1.00, "credits": 5, "min_plan": "teams", "speed": "~RT", "quality": "Flagship"},
}

# ═══ FALLBACK CHAINS — If a model fails, auto-cascade to the next best ═══
# Each model maps to a list of fallbacks in priority order
MODEL_FALLBACKS = {
    # Chat — Max Pro fallbacks
    "claude_opus":         ["grok4", "o3", "gemini_think", "claude_sonnet_think"],
    "o3":                  ["claude_opus", "grok4", "gemini_think", "o3_mini"],
    "grok4":               ["claude_opus", "o3", "grok3", "gemini_think"],
    "gemini_think":        ["claude_opus", "grok4", "o3_mini", "deepseek_r1"],
    "llama_behemoth":      ["claude_opus", "grok4", "o3", "llama_maverick"],
    "o3_mini":             ["grok4", "claude_opus", "gemini_think", "claude_sonnet_think"],
    # Chat — Max fallbacks
    "claude_sonnet_think": ["grok3", "deepseek_r1", "gemini_ultra", "claude_sonnet"],
    "gpt4o_plus":          ["grok3", "claude_sonnet_think", "gemini_ultra", "gpt4o"],
    "gemini_ultra":        ["grok3", "claude_sonnet_think", "gpt4o_plus", "gemini_pro"],
    "grok3":               ["claude_sonnet_think", "gemini_ultra", "deepseek_r1", "grok_2"],
    "deepseek_r1":         ["claude_sonnet_think", "grok3", "qwen_qwq", "claude_sonnet"],
    "qwen_qwq":            ["deepseek_r1", "claude_sonnet_think", "grok3", "gemini_pro"],
    # Chat — Pro fallbacks
    "claude_sonnet":       ["gpt4o", "grok_2", "gemini_pro", "llama_maverick"],
    "gpt4o":               ["claude_sonnet", "grok_2", "gemini_pro", "deepseek_v3"],
    "grok_2":              ["claude_sonnet", "gpt4o", "gemini_pro", "llama_maverick"],
    "gemini_pro":          ["claude_sonnet", "gpt4o", "grok_2", "deepseek_v3"],
    "llama_maverick":      ["claude_sonnet", "gpt4o", "gemini_pro", "deepseek_v3"],
    "deepseek_v3":         ["claude_sonnet", "gpt4o", "grok_2", "gemini_pro"],
    # Chat — Mini fallbacks
    "claude_haiku":        ["gemini_flash", "gpt4o_mini", "grok_mini", "llama_scout"],
    "gpt4o_mini":          ["claude_haiku", "gemini_flash", "grok_mini", "mistral_small"],
    "gemini_flash":        ["claude_haiku", "gpt4o_mini", "grok_mini", "llama_scout"],
    "grok_mini":           ["claude_haiku", "gemini_flash", "gpt4o_mini", "mistral_small"],
    "llama_scout":         ["claude_haiku", "gemini_flash", "gpt4o_mini", "mistral_small"],
    "mistral_small":       ["claude_haiku", "gemini_flash", "gpt4o_mini", "grok_mini"],
    # Image fallbacks
    "grok_aurora":         ["replicate_flux_ultra", "dalle_4", "replicate_flux", "nano_banana_pro"],
    "replicate_flux_ultra":["grok_aurora", "dalle_4", "replicate_flux", "stable_diffusion_3"],
    "dalle_4":             ["grok_aurora", "replicate_flux_ultra", "replicate_flux", "dalle_3"],
    "replicate_flux":      ["nano_banana_pro", "stable_diffusion_3", "ideogram_v3", "dalle_3"],
    "nano_banana_pro":     ["replicate_flux", "stable_diffusion_3", "ideogram_v3", "nano_banana_2"],
    "stable_diffusion_3":  ["replicate_flux", "nano_banana_pro", "ideogram_v3", "dalle_3"],
    "ideogram_v3":         ["replicate_flux", "nano_banana_pro", "stable_diffusion_3", "dalle_3"],
    "dalle_3":             ["nano_banana_2", "stable_diffusion_xl", "nano_banana_pro"],
    "nano_banana_2":       ["dalle_3", "stable_diffusion_xl"],
    "stable_diffusion_xl": ["nano_banana_2", "dalle_3"],
    # Video fallbacks
    "sora_2_pro":          ["runway_gen4", "veo_3_1_fast", "sora_2", "veo_3_1"],
    "runway_gen4":         ["sora_2_pro", "veo_3_1_fast", "runway_gen3", "sora_2"],
    "veo_3_1_fast":        ["sora_2_pro", "runway_gen4", "veo_3_1", "sora_2"],
    "sora_2":              ["veo_3_1", "runway_gen3"],
    "veo_3_1":             ["sora_2", "runway_gen3"],
    "runway_gen3":         ["sora_2", "veo_3_1"],
    # Audio fallbacks
    "elevenlabs_ultra":    ["elevenlabs_hd", "elevenlabs_pro", "elevenlabs_basic", "gemini_tts"],
    "elevenlabs_hd":       ["elevenlabs_pro", "elevenlabs_basic", "gemini_tts"],
    "elevenlabs_pro":      ["elevenlabs_basic", "gemini_tts"],
    "elevenlabs_basic":    ["gemini_tts"],
    "gemini_tts":          ["elevenlabs_basic"],
    # Design fallbacks
    "stitch_ultra":        ["stitch_pro", "stitch_flash"],
    "stitch_pro":          ["stitch_flash", "stitch_ultra"],
    "stitch_flash":        ["stitch_pro"],
}

def get_fallback_chain(model_id: str) -> list:
    """Return the ordered fallback chain for a given model."""
    return [model_id] + MODEL_FALLBACKS.get(model_id, [])


async def smart_generate(category: str, model_id: str, prompt: str, **kwargs) -> dict:
    """
    Smart Orchestration Router — dispatches to the right provider API for the given
    model_id, walking MODEL_FALLBACKS on failure.

    Args:
        category: "chat", "image", or "audio"
        model_id: key from MODEL_COSTS (e.g. "claude_haiku", "grok_2", "elevenlabs_pro")
        prompt: the user prompt / text input
        **kwargs: extra options (system_prompt, voice, aspect_ratio, history, etc.)

    Returns:
        {success, data, model_used, provider, errors}
    """
    errors: list = []
    chain = get_fallback_chain(model_id)

    for current_model in chain:
        meta = MODEL_COSTS.get(current_model, {})
        provider = meta.get("provider", "").lower()
        cat = meta.get("category", category)

        try:
            # ─── CHAT ─────────────────────────────────────────────────────────
            if cat == "chat":
                system_prompt = kwargs.get("system_prompt", "You are a helpful assistant.")
                history = kwargs.get("history", [])
                messages = history + [{"role": "user", "content": prompt}]

                if provider == "anthropic" and client:
                    resp = client.messages.create(
                        model=_ANTHROPIC_MODEL_IDS.get(current_model, "claude-3-5-haiku-20241022"),
                        max_tokens=4096,
                        system=system_prompt,
                        messages=messages,
                    )
                    text = resp.content[0].text if resp.content else ""
                    return {"success": True, "data": text, "model_used": current_model, "provider": "Anthropic", "errors": errors}

                elif provider == "xai" and XAI_API_KEY:
                    xai_model = _XAI_MODEL_IDS.get(current_model, "grok-3-mini")
                    async with httpx.AsyncClient(timeout=60.0) as hc:
                        resp = await hc.post(
                            "https://api.x.ai/v1/chat/completions",
                            headers={"Authorization": f"Bearer {XAI_API_KEY}", "Content-Type": "application/json"},
                            json={"model": xai_model, "messages": [{"role": "system", "content": system_prompt}] + messages, "temperature": 0.7},
                        )
                        if resp.status_code == 200:
                            text = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                            return {"success": True, "data": text, "model_used": current_model, "provider": "xAI", "errors": errors}
                        errors.append(f"{current_model}: xAI HTTP {resp.status_code}")
                        continue

                elif provider == "google" and GEMINI_API_KEY:
                    result = await gemini_chat(prompt, history=history, system_prompt=system_prompt)
                    if result.get("text"):
                        return {"success": True, "data": result["text"], "model_used": current_model, "provider": "Google", "errors": errors}
                    errors.append(f"{current_model}: Gemini returned empty")
                    continue

                elif provider == "perplexity" and PPLX_API_KEY:
                    async with httpx.AsyncClient(timeout=60.0) as hc:
                        resp = await hc.post(
                            "https://api.perplexity.ai/chat/completions",
                            headers={"Authorization": f"Bearer {PPLX_API_KEY}", "Content-Type": "application/json"},
                            json={"model": "llama-3.1-sonar-large-128k-online", "messages": [{"role": "system", "content": system_prompt}] + messages},
                        )
                        if resp.status_code == 200:
                            text = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                            return {"success": True, "data": text, "model_used": current_model, "provider": "Perplexity", "errors": errors}
                        errors.append(f"{current_model}: Perplexity HTTP {resp.status_code}")
                        continue

                else:
                    errors.append(f"{current_model}: no key for provider '{provider}'")
                    continue

            # ─── IMAGE ────────────────────────────────────────────────────────
            elif cat == "image":
                aspect_ratio = kwargs.get("aspect_ratio", "1:1")

                if provider == "xai" and XAI_API_KEY:
                    async with httpx.AsyncClient(timeout=90.0) as hc:
                        resp = await hc.post(
                            "https://api.x.ai/v1/images/generations",
                            headers={"Authorization": f"Bearer {XAI_API_KEY}", "Content-Type": "application/json"},
                            json={"model": "grok-2-image", "prompt": prompt, "n": 1, "response_format": "b64_json"},
                        )
                        if resp.status_code == 200 and resp.json().get("data"):
                            image_b64 = resp.json()["data"][0]["b64_json"]
                            return {"success": True, "data": image_b64, "model_used": current_model, "provider": "xAI", "errors": errors}
                        errors.append(f"{current_model}: xAI image HTTP {resp.status_code}")
                        continue

                elif provider == "openai" and OPENAI_API_KEY:
                    async with httpx.AsyncClient(timeout=90.0) as hc:
                        resp = await hc.post(
                            "https://api.openai.com/v1/images/generations",
                            headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
                            json={"model": "dall-e-3", "prompt": prompt, "n": 1, "size": "1024x1024", "response_format": "b64_json"},
                        )
                        if resp.status_code == 200 and resp.json().get("data"):
                            image_b64 = resp.json()["data"][0]["b64_json"]
                            return {"success": True, "data": image_b64, "model_used": current_model, "provider": "OpenAI", "errors": errors}
                        errors.append(f"{current_model}: OpenAI image HTTP {resp.status_code}")
                        continue

                elif provider == "google" and GEMINI_API_KEY:
                    async with httpx.AsyncClient(timeout=90.0) as hc:
                        resp = await hc.post(
                            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={GEMINI_API_KEY}",
                            headers={"Content-Type": "application/json"},
                            json={
                                "contents": [{"parts": [{"text": f"Generate a photorealistic image: {prompt}"}]}],
                                "generationConfig": {"responseModalities": ["TEXT"]},
                            },
                        )
                        data = resp.json()
                        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                        for part in parts:
                            if part.get("inlineData"):
                                return {"success": True, "data": part["inlineData"]["data"], "model_used": current_model, "provider": "Google", "errors": errors}
                        errors.append(f"{current_model}: Gemini image returned no inline_data")
                        continue

                else:
                    errors.append(f"{current_model}: no image key for provider '{provider}'")
                    continue

            # ─── AUDIO ────────────────────────────────────────────────────────
            elif cat == "audio":
                voice_name = kwargs.get("voice", "kore")
                _EL_VOICE_IDS = {
                    "rachel": "21m00Tcm4TlvDq8ikWAM", "adam": "pNInz6obpgDQGcFmaJgB",
                    "alice": "Xb7hH8MSUJpSbSDYk0k2", "kore": "21m00Tcm4TlvDq8ikWAM",
                    "aoede": "EXAVITQu4vr4xnSDxMaL", "fenrir": "pNInz6obpgDQGcFmaJgB",
                }

                if provider == "elevenlabs" and ELEVENLABS_API_KEY:
                    voice_id = _EL_VOICE_IDS.get(voice_name.lower(), "21m00Tcm4TlvDq8ikWAM")
                    async with httpx.AsyncClient(timeout=60.0) as hc:
                        resp = await hc.post(
                            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                            headers={"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json", "Accept": "audio/mpeg"},
                            json={"text": prompt, "model_id": "eleven_multilingual_v2", "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}},
                        )
                        if resp.status_code == 200:
                            return {"success": True, "data": base64.b64encode(resp.content).decode(), "model_used": current_model, "provider": "ElevenLabs", "errors": errors}
                        errors.append(f"{current_model}: ElevenLabs HTTP {resp.status_code}")
                        continue

                elif provider == "google" and GEMINI_API_KEY:
                    _g_voice_map = {"kore": "Kore", "aoede": "Aoede", "charon": "Charon", "fenrir": "Fenrir", "puck": "Puck", "rachel": "Kore", "adam": "Fenrir"}
                    g_voice = _g_voice_map.get(voice_name.lower(), "Kore")
                    async with httpx.AsyncClient(timeout=60.0) as hc:
                        resp = await hc.post(
                            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key={GEMINI_API_KEY}",
                            headers={"Content-Type": "application/json"},
                            json={
                                "contents": [{"parts": [{"text": prompt}]}],
                                "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": g_voice}}}},
                            },
                        )
                        if resp.status_code == 200:
                            parts = resp.json().get("candidates", [{}])[0].get("content", {}).get("parts", [])
                            for part in parts:
                                if part.get("inlineData", {}).get("data"):
                                    return {"success": True, "data": part["inlineData"]["data"], "model_used": current_model, "provider": "Google", "errors": errors}
                        errors.append(f"{current_model}: Gemini TTS HTTP {resp.status_code}")
                        continue

                else:
                    errors.append(f"{current_model}: no audio key for provider '{provider}'")
                    continue

            else:
                errors.append(f"{current_model}: unsupported category '{cat}'")
                continue

        except Exception as e:
            errors.append(f"{current_model}: exception — {str(e)[:120]}")
            continue

    return {"success": False, "data": None, "model_used": None, "provider": None, "errors": errors}


# Internal model ID lookup tables for smart_generate
_ANTHROPIC_MODEL_IDS = {
    "claude_haiku":        "claude-3-5-haiku-20241022",
    "claude_sonnet":       "claude-sonnet-4-5",
    "claude_sonnet_think": "claude-sonnet-4-5",
    "claude_opus":         "claude-opus-4-5",
}
_XAI_MODEL_IDS = {
    "grok_mini":  "grok-3-mini",
    "grok_2":     "grok-2",
    "grok3":      "grok-3",
    "grok4":      "grok-4",
    "grok_aurora":"aurora",
}


# Plan tier → credit limits and compute access
PLAN_TIERS = {
    "free":       {"credits": 100,   "price_monthly": 0,    "compute_access": ["mini"],                          "label": "Free"},
    "starter":    {"credits": 500,   "price_monthly": 27,   "compute_access": ["mini", "pro"],                   "label": "Starter"},
    "pro":        {"credits": 2000,  "price_monthly": 97,   "compute_access": ["mini", "pro", "max"],             "label": "Pro"},
    "teams":      {"credits": 5000,  "price_monthly": 297,  "compute_access": ["mini", "pro", "max", "max_pro"],  "label": "Teams"},
    "enterprise": {"credits": -1,    "price_monthly": 497,  "compute_access": ["mini", "pro", "max", "max_pro"],  "label": "Enterprise"},
}

# Plan tier hierarchy for comparison
TIER_HIERARCHY = ["free", "starter", "pro", "teams", "enterprise"]

def user_can_access_model(user_tier: str, model_id: str) -> bool:
    """Check if user's plan tier allows access to a model."""
    model = MODEL_COSTS.get(model_id)
    if not model:
        return False
    user_level = TIER_HIERARCHY.index(user_tier) if user_tier in TIER_HIERARCHY else 0
    required_level = TIER_HIERARCHY.index(model["min_plan"]) if model["min_plan"] in TIER_HIERARCHY else 0
    return user_level >= required_level


async def enforce_metering(request: Request, model_id: str = "claude_haiku") -> dict:
    """
    PRE-CHECK: Verify user has tier access + sufficient credits before processing.
    Returns {"allowed": True, "user": {...}, "profile": {...}} or {"allowed": False, "error": ..., "status_code": ...}
    Admins always pass. Unauthenticated users get free-tier allowance.
    """
    # Extract auth token from request headers
    auth_header = request.headers.get("authorization", "")
    user = await get_current_user(auth_header if auth_header else None)
    
    model_info = MODEL_COSTS.get(model_id, MODEL_COSTS.get("claude_haiku"))
    if not model_info:
        return {"allowed": False, "error": "Unknown model", "status_code": 400}
    
    # No auth → allow with free-tier defaults (rate limiter handles abuse)
    if not user or not supabase_admin:
        return {"allowed": True, "user": None, "profile": {"tier": "free"}, "model_info": model_info, "is_demo": True}
    
    # Check if user is admin (admins always pass)
    ADMIN_EMAILS_LIST = json.loads(os.environ.get("ADMIN_EMAILS", '["ryan@cookin.io", "ryan@hacpglobal.ai", "cap@hacpglobal.ai", "laliecapatosto86@gmail.com", "laliecapatosto96@gmail.com"]'))
    if user.get("email") in ADMIN_EMAILS_LIST:
        return {"allowed": True, "user": user, "profile": {"tier": "enterprise"}, "model_info": model_info, "is_admin": True}
    
    try:
        profile_resp = supabase_admin.table("profiles").select("id, tier, plan_tier, request_limit, monthly_requests, stripe_customer_id, stripe_subscription_id").eq("id", user["id"]).single().execute()
        p = profile_resp.data or {}
        user_tier = p.get("tier", p.get("plan_tier", "free"))
        credits_limit = p.get("request_limit", PLAN_TIERS.get(user_tier, PLAN_TIERS["free"])["credits"])
        credits_used = p.get("monthly_requests", 0)
        credits_remaining = max(0, credits_limit - credits_used)
        
        # Tier access check
        if not user_can_access_model(user_tier, model_id):
            return {
                "allowed": False,
                "error": f"Your {PLAN_TIERS.get(user_tier, {}).get('label', user_tier)} plan doesn't include {model_info['name']}. Upgrade to {model_info['min_plan'].title()} or higher.",
                "status_code": 403,
                "upgrade_required": model_info["min_plan"],
                "current_tier": user_tier,
            }
        
        # Credit check (enterprise = unlimited)
        credits_needed = model_info.get("credits", 1)
        if user_tier != "enterprise" and credits_remaining < credits_needed:
            return {
                "allowed": False,
                "error": f"Insufficient credits. Need {credits_needed}, have {credits_remaining}. Upgrade your plan or wait for monthly reset.",
                "status_code": 402,
                "credits_remaining": credits_remaining,
                "credits_needed": credits_needed,
                "current_tier": user_tier,
            }
        
        return {
            "allowed": True,
            "user": user,
            "profile": {**p, "tier": user_tier, "credits_remaining": credits_remaining},
            "model_info": model_info,
        }
    except Exception as e:
        print(f"[Metering] enforce_metering error: {e}")
        # Fail open — don't block users due to DB errors, but log it
        return {"allowed": True, "user": user, "profile": {"tier": "free"}, "model_info": model_info, "metering_error": str(e)}


async def meter_usage(user_id: str, model_id: str, action_type: str, duration_minutes: float = 1.0, input_tokens: int = 0, output_tokens: int = 0):
    """Record usage in Supabase and report to Stripe metered billing."""
    model = MODEL_COSTS.get(model_id)
    if not model or not supabase_admin:
        return {"success": False, "error": "metering_unavailable"}
    
    tier_info = COMPUTE_TIERS.get(model["tier"], COMPUTE_TIERS["mini"])
    our_cost = model["our_cost"] * duration_minutes
    charged = model["charge"] * duration_minutes
    margin = ((charged - our_cost) / our_cost * 100) if our_cost > 0 else 0
    
    try:
        # Call Supabase meter_compute RPC with ACTUAL model costs
        result = supabase_admin.rpc("meter_compute", {
            "p_user_id": user_id,
            "p_model_id": model_id,
            "p_action_type": action_type,
            "p_duration_minutes": duration_minutes,
            "p_input_tokens": input_tokens,
            "p_output_tokens": output_tokens,
            "p_metadata": json.dumps({"provider": model["provider"], "category": model["category"]}),
            "p_credits_needed": model.get("credits", 1),
            "p_cost_charged": round(charged, 4),
            "p_our_cost": round(our_cost, 4),
            "p_compute_tier": model.get("tier", "mini"),
        }).execute()
        
        if result.data and isinstance(result.data, dict) and result.data.get("success"):
            # Report to Stripe metered billing (async, non-blocking)
            stripe_sub_item_id = result.data.get("stripe_subscription_item_id")
            if STRIPE_SECRET and stripe_sub_item_id:
                try:
                    async with httpx.AsyncClient() as hc:
                        # Stripe expects quantity in whole units — report minutes * 100 for cent precision
                        quantity = max(1, int(duration_minutes * 100))
                        await hc.post(
                            f"https://api.stripe.com/v1/subscription_items/{stripe_sub_item_id}/usage_records",
                            headers={"Authorization": f"Bearer {STRIPE_SECRET}"},
                            data={"quantity": quantity, "action": "increment"},
                        )
                except Exception as stripe_err:
                    print(f"[Metering] Stripe reporting error (non-fatal): {stripe_err}")
            elif STRIPE_SECRET and not stripe_sub_item_id:
                # Try to get subscription_item_id from user's profile
                try:
                    prof = supabase_admin.table("profiles").select("stripe_subscription_id, stripe_customer_id").eq("id", user_id).single().execute()
                    sub_id = (prof.data or {}).get("stripe_subscription_id")
                    cust_id = (prof.data or {}).get("stripe_customer_id")
                    if sub_id:
                        async with httpx.AsyncClient() as hc:
                            # Get subscription items from Stripe
                            resp = await hc.get(
                                f"https://api.stripe.com/v1/subscription_items?subscription={sub_id}",
                                headers={"Authorization": f"Bearer {STRIPE_SECRET}"},
                            )
                            if resp.status_code == 200:
                                items = resp.json().get("data", [])
                                # Find the metered usage item matching this compute tier
                                target_price = tier_info.get("stripe_price_id", "")
                                for item in items:
                                    if item.get("price", {}).get("id") == target_price:
                                        quantity = max(1, int(duration_minutes * 100))
                                        await hc.post(
                                            f"https://api.stripe.com/v1/subscription_items/{item['id']}/usage_records",
                                            headers={"Authorization": f"Bearer {STRIPE_SECRET}"},
                                            data={"quantity": quantity, "action": "increment"},
                                        )
                                        print(f"[Metering] Stripe usage recorded: {quantity} units on si={item['id']}")
                                        break
                except Exception as stripe_err:
                    print(f"[Metering] Stripe fallback reporting error (non-fatal): {stripe_err}")
            
            return result.data
        else:
            return result.data if result.data else {"success": False, "error": "rpc_failed"}
    except Exception as e:
        print(f"[Metering] Supabase error: {e}")
        # Fallback: deduct credits directly on the profiles table
        try:
            supabase_admin.rpc("increment_monthly_requests", {
                "p_user_id": user_id,
                "p_increment": model.get("credits", 1)
            }).execute()
            print(f"[Metering] Fallback credit deduction: {model.get('credits', 1)} credits for {model_id}")
        except Exception as fallback_err:
            print(f"[Metering] Fallback deduction also failed: {fallback_err}")
        return {"success": True, "metering_error": str(e), "credits_remaining": 999, "tier": "fallback"}


async def record_metering(user: dict, model_id: str, action_type: str, duration_minutes: float = 1.0, input_tokens: int = 0, output_tokens: int = 0):
    """POST-CALL: Record metering after successful API call. Fire-and-forget."""
    if not user or not user.get("id"):
        return  # Skip metering for unauthenticated/demo users
    try:
        result = await meter_usage(user["id"], model_id, action_type, duration_minutes, input_tokens, output_tokens)
        if result.get("success"):
            print(f"[Metering] Recorded: user={user['id'][:8]}... model={model_id} action={action_type} credits={MODEL_COSTS.get(model_id, {}).get('credits', '?')}")
        else:
            print(f"[Metering] Record failed: {result}")
    except Exception as e:
        print(f"[Metering] record_metering error (non-fatal): {e}")


@app.get("/api/metering/pricing")
async def get_model_pricing():
    """Get all model pricing with compute tier info for transparency display."""
    pricing = []
    for model_id, m in MODEL_COSTS.items():
        margin = ((m["charge"] - m["our_cost"]) / m["our_cost"] * 100) if m["our_cost"] > 0 else 0
        pricing.append({
            "model_id": model_id,
            "name": m["name"],
            "provider": m["provider"],
            "category": m["category"],
            "compute_tier": m["tier"],
            "cost_per_min": m["charge"],
            "our_cost_per_min": m["our_cost"],
            "credits_per_use": m["credits"],
            "min_plan": m["min_plan"],
            "speed": m["speed"],
            "quality": m["quality"],
            "margin_pct": round(margin, 1),
        })
    return {"pricing": pricing, "tiers": PLAN_TIERS, "compute_tiers": COMPUTE_TIERS}


@app.get("/api/metering/usage")
async def get_usage_summary(authorization: Optional[str] = Header(None)):
    """Get real usage summary from Supabase for current billing period."""
    user = await get_current_user(authorization)
    if not user or not supabase_admin:
        # Return demo data for unauthenticated users
        return {
            "user_id": "demo",
            "period": datetime.now().strftime("%Y-%m"),
            "credits_used": 0, "credits_remaining": 100, "credits_limit": 100,
            "tier": "free", "compute_tier": "mini",
            "total_compute_minutes": 0, "current_month_spend": 0,
            "by_tier": {}, "by_model": {}, "by_action": {},
        }
    
    try:
        # Get profile
        profile = supabase_admin.table("profiles").select("*").eq("id", user["id"]).single().execute()
        p = profile.data or {}
        tier = p.get("tier", p.get("plan_tier", "free"))
        tier_config = PLAN_TIERS.get(tier, PLAN_TIERS["free"])
        
        # Get compute summary from RPC (may not exist pre-migration)
        s = {}
        try:
            summary = supabase_admin.rpc("get_compute_summary", {"p_user_id": user["id"]}).execute()
            s = summary.data or {}
        except Exception:
            pass  # RPC not available pre-migration
        
        return {
            "user_id": user["id"],
            "period": datetime.now().strftime("%Y-%m"),
            "credits_used": p.get("monthly_requests", 0),
            "credits_remaining": max(0, p.get("request_limit", 100) - p.get("monthly_requests", 0)),
            "credits_limit": p.get("request_limit", tier_config["credits"]),
            "tier": tier,
            "compute_tier": p.get("compute_tier", "mini"),
            "total_compute_minutes": float(p.get("total_compute_minutes", 0)),
            "current_month_spend": float(p.get("current_month_spend", 0)),
            "by_tier": s.get("by_tier", {}),
            "by_model": s.get("by_model", {}),
            "by_action": s.get("by_action", {}),
            "wallet_balance": float(p.get("wallet_balance", 0)),
        }
    except Exception as e:
        print(f"[Metering] Usage summary error: {e}")
        return {"user_id": user["id"], "error": str(e), "tier": "free", "credits_remaining": 100}


@app.post("/api/metering/check")
async def check_credits(request: Request, authorization: Optional[str] = Header(None)):
    """Pre-check if user has enough credits and tier access for a model call."""
    body = await request.json()
    model_id = body.get("model", "claude_haiku")
    model_info = MODEL_COSTS.get(model_id, MODEL_COSTS["claude_haiku"])
    
    user = await get_current_user(authorization)
    if not user or not supabase_admin:
        # Demo mode
        return {
            "model": model_id, "compute_tier": model_info["tier"],
            "cost_per_min": model_info["charge"], "credits_needed": model_info["credits"],
            "credits_remaining": 100, "can_proceed": True,
            "min_plan": model_info["min_plan"], "user_tier": "demo",
        }
    
    try:
        profile = supabase_admin.table("profiles").select("tier, request_limit, monthly_requests").eq("id", user["id"]).single().execute()
        p = profile.data or {}
        user_tier = p.get("tier", "free")
        remaining = max(0, p.get("request_limit", 100) - p.get("monthly_requests", 0))
        
        can_access = user_can_access_model(user_tier, model_id)
        has_credits = remaining >= model_info["credits"] or user_tier == "enterprise"
        
        return {
            "model": model_id, "compute_tier": model_info["tier"],
            "cost_per_min": model_info["charge"], "credits_needed": model_info["credits"],
            "credits_remaining": remaining, "can_proceed": can_access and has_credits,
            "tier_access": can_access, "has_credits": has_credits,
            "min_plan": model_info["min_plan"], "user_tier": user_tier,
        }
    except Exception as e:
        return {"model": model_id, "can_proceed": True, "error": str(e)}


@app.get("/api/metering/models")
async def get_models_by_tier(authorization: Optional[str] = Header(None)):
    """Get all models grouped by compute tier, with user access flags."""
    user = await get_current_user(authorization)
    user_tier = "free"
    if user and supabase_admin:
        try:
            p = supabase_admin.table("profiles").select("tier").eq("id", user["id"]).single().execute()
            user_tier = (p.data or {}).get("tier", "free")
        except Exception:
            pass
    
    tiers = {"mini": [], "pro": [], "max": [], "max_pro": []}
    for model_id, m in MODEL_COSTS.items():
        tiers[m["tier"]].append({
            "id": model_id,
            "name": m["name"],
            "provider": m["provider"],
            "category": m["category"],
            "cost_per_min": m["charge"],
            "credits": m["credits"],
            "speed": m["speed"],
            "quality": m["quality"],
            "accessible": user_can_access_model(user_tier, model_id),
            "min_plan": m["min_plan"],
        })
    
    return {
        "user_tier": user_tier,
        "tiers": tiers,
        "tier_pricing": COMPUTE_TIERS,
        "fallbacks": {k: v for k, v in MODEL_FALLBACKS.items()},
    }



@app.get("/api/studio/models")
async def get_studio_models():
    """Get available AI generation models."""
    return {"models": STUDIO_MODELS, "voices": STUDIO_VOICES}


@limiter.limit("10/minute")
@app.post("/api/studio/generate/image")
async def studio_generate_image(request: Request):
    """Generate an image using AI — multi-provider fallback chain."""
    body = await request.json()
    prompt = body.get("prompt", "")
    model = body.get("model", "nano_banana_2")
    aspect_ratio = body.get("aspect_ratio", "1:1")
    style = body.get("style", "")

    if not prompt:
        return JSONResponse({"error": "Prompt required"}, status_code=400)

    # ═══ METERING PRE-CHECK ═══
    meter_check = await enforce_metering(request, model_id=model)
    if not meter_check["allowed"]:
        return JSONResponse({"error": meter_check["error"], "type": "metering", "upgrade_required": meter_check.get("upgrade_required", "")}, status_code=meter_check.get("status_code", 403))
    metering_user = meter_check.get("user")
    # ═══ END METERING PRE-CHECK ═══

    full_prompt = f"{style + ': ' if style else ''}{prompt}"
    image_bytes = None
    actual_model = model
    errors = []

    # Provider chain: OpenAI DALL-E → xAI Grok Imagine → Gemini Imagen
    # 1) Try OpenAI DALL-E if key available
    if not image_bytes and OPENAI_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=60.0) as http:
                resp = await http.post(
                    "https://api.openai.com/v1/images/generations",
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
                    json={"model": "dall-e-3", "prompt": full_prompt, "n": 1, "size": "1024x1024", "response_format": "b64_json"},
                )
                data = resp.json()
                if resp.status_code == 200 and data.get("data"):
                    image_bytes = base64.b64decode(data["data"][0]["b64_json"])
                    actual_model = "dall-e-3"
                else:
                    errors.append(f"OpenAI: {data.get('error', {}).get('message', 'unknown')}")
        except Exception as e:
            errors.append(f"OpenAI: {e}")

    # 2) Try xAI Grok Imagine if key available
    if not image_bytes and XAI_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=60.0) as http:
                resp = await http.post(
                    "https://api.x.ai/v1/images/generations",
                    headers={"Authorization": f"Bearer {XAI_API_KEY}", "Content-Type": "application/json"},
                    json={"model": "grok-2-image", "prompt": full_prompt, "n": 1, "response_format": "b64_json"},
                )
                data = resp.json()
                if resp.status_code == 200 and data.get("data"):
                    image_bytes = base64.b64decode(data["data"][0]["b64_json"])
                    actual_model = "grok-2-image"
                else:
                    errors.append(f"xAI: {data.get('error', {}).get('message', 'unknown')}")
        except Exception as e:
            errors.append(f"xAI: {e}")

    # 3) Gemini Imagen via Stitch API
    if not image_bytes and GEMINI_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=60.0) as http:
                resp = await http.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={GEMINI_API_KEY}",
                    json={
                        "contents": [{"parts": [{"text": f"Generate a photorealistic image: {full_prompt}"}]}],
                        "generationConfig": {"responseModalities": ["TEXT"]},
                    },
                    headers={"Content-Type": "application/json"},
                )
                data = resp.json()
                # Gemini may return image in inline_data
                candidates = data.get("candidates", [{}])
                parts = candidates[0].get("content", {}).get("parts", [])
                for part in parts:
                    if part.get("inlineData"):
                        image_bytes = base64.b64decode(part["inlineData"]["data"])
                        actual_model = "gemini-imagen"
                        break
                if not image_bytes:
                    # Gemini returned text description instead — use it as enhanced prompt context
                    desc = parts[0].get("text", "") if parts else ""
                    errors.append(f"Gemini: returned text, not image")
        except Exception as e:
            errors.append(f"Gemini: {e}")

    # 4) Final fallback: Generate a placeholder SVG
    if not image_bytes:
        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#1a1a1a"/>
  <text x="512" y="480" text-anchor="middle" fill="#c8a24e" font-family="system-ui" font-size="32" font-weight="bold">Image Generation</text>
  <text x="512" y="530" text-anchor="middle" fill="#888" font-family="system-ui" font-size="20">Add an API key to enable:</text>
  <text x="512" y="570" text-anchor="middle" fill="#666" font-family="system-ui" font-size="16">OPENAI_API_KEY (DALL-E) or XAI_API_KEY (Grok Imagine)</text>
  <text x="512" y="620" text-anchor="middle" fill="#555" font-family="system-ui" font-size="14">Prompt: {prompt[:80]}...</text>
</svg>"""
        image_bytes = svg.encode("utf-8")
        actual_model = "placeholder"
        print(f"[Studio] Image fallback: no API key available. Errors: {errors}")

    try:
        file_id = str(uuid.uuid4())[:8]
        ext = "svg" if actual_model == "placeholder" else "png"
        filename = f"img_{file_id}.{ext}"
        filepath = MEDIA_DIR / "images" / filename
        filepath.parent.mkdir(parents=True, exist_ok=True)
        filepath.write_bytes(image_bytes)

        entry = {
            "id": file_id, "type": "image", "filename": filename,
            "prompt": prompt, "model": actual_model, "aspect_ratio": aspect_ratio,
            "style": style, "created_at": datetime.now().isoformat(),
            "size_bytes": len(image_bytes), "url": f"/api/studio/media/images/{filename}",
        }
        media_gallery.insert(0, entry)

        mime = "image/svg+xml" if ext == "svg" else "image/png"
        b64 = base64.b64encode(image_bytes).decode()

        # ═══ METERING POST-CALL ═══
        if metering_user and actual_model != "placeholder":
            await record_metering(metering_user, model, "image_generation", duration_minutes=1.0)
        # ═══ END METERING POST-CALL ═══

        return {**entry, "data": f"data:{mime};base64,{b64}", "model_used": actual_model}

    except Exception as e:
        print(f"[Studio] Image save error: {e}")
        return JSONResponse({"error": f"Generation failed: {str(e)[:200]}"}, status_code=422)


# In-memory queue for pending video generation jobs
video_queue: list = []

@limiter.limit("5/minute")
@app.post("/api/studio/generate/video")
async def studio_generate_video(request: Request):
    """Queue a video generation job — uses xAI/Gemini to build a storyboard while real video rendering is processed asynchronously."""
    body = await request.json()
    prompt = body.get("prompt", "")
    model = body.get("model", "sora_2")
    aspect_ratio = body.get("aspect_ratio", "16:9")
    duration = body.get("duration", 8)

    if not prompt:
        return JSONResponse({"error": "Prompt required"}, status_code=400)

    # ═══ METERING PRE-CHECK ═══
    meter_check = await enforce_metering(request, model_id=model)
    if not meter_check["allowed"]:
        return JSONResponse({"error": meter_check["error"], "type": "metering", "upgrade_required": meter_check.get("upgrade_required", "")}, status_code=meter_check.get("status_code", 403))
    metering_user = meter_check.get("user")
    # ═══ END METERING PRE-CHECK ═══

    job_id = str(uuid.uuid4())[:8]
    storyboard = ""
    scene_description = ""
    ai_provider_used = None
    errors = []

    # Step 1: Try xAI Grok to generate a storyboard description
    if XAI_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=30.0) as hc:
                resp = await hc.post(
                    "https://api.x.ai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {XAI_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": "grok-3-mini",
                        "messages": [{
                            "role": "user",
                            "content": (
                                f"Create a detailed video storyboard for this prompt: '{prompt}'. "
                                f"Aspect ratio: {aspect_ratio}, Duration: {duration}s. "
                                "Return a JSON object with fields: "
                                "scenes (list of scene descriptions), camera_movements, color_palette, mood, style."
                            )
                        }],
                        "temperature": 0.7,
                    }
                )
                if resp.status_code == 200:
                    data = resp.json()
                    storyboard = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    ai_provider_used = "xAI Grok"
                else:
                    errors.append(f"xAI: HTTP {resp.status_code}")
        except Exception as e:
            errors.append(f"xAI: {e}")

    # Step 2: Try Gemini for detailed scene description (fallback or supplement)
    if not storyboard and GEMINI_API_KEY:
        try:
            gemini_result = await gemini_chat(
                f"Create a detailed cinematic scene description for this video prompt: '{prompt}'. "
                f"Aspect ratio: {aspect_ratio}, Duration: {duration}s. "
                "Describe: visuals, camera angles, lighting, color grading, motion, soundtrack mood.",
                system_prompt="You are a professional cinematographer and video director."
            )
            scene_description = gemini_result.get("text", "")
            if scene_description:
                ai_provider_used = "Gemini"
        except Exception as e:
            errors.append(f"Gemini: {e}")

    if not storyboard and not scene_description:
        if errors:
            return JSONResponse(
                {"error": "No AI available to process video request", "details": errors},
                status_code=503
            )

    # Enqueue the job
    job_entry = {
        "id": job_id,
        "type": "video",
        "status": "queued",
        "prompt": prompt,
        "model": model,
        "aspect_ratio": aspect_ratio,
        "duration": duration,
        "storyboard": storyboard or scene_description,
        "scene_description": scene_description,
        "ai_provider_used": ai_provider_used,
        "created_at": datetime.now().isoformat(),
        "message": (
            "Your video is queued for generation. A dedicated video generation API key "
            "(Sora/Runway/Veo) is required to render the final video. "
            "The storyboard has been prepared using " + (ai_provider_used or "available AI") + "."
        ),
    }
    video_queue.insert(0, job_entry)
    media_gallery.insert(0, {**job_entry, "filename": f"vid_{job_id}_queued.mp4", "size_bytes": 0, "url": ""})

    print(f"[Studio] Video job queued: {job_id} — model={model}, duration={duration}s")

    # ═══ METERING POST-CALL ═══
    if metering_user and (storyboard or scene_description):
        await record_metering(metering_user, model, "video_generation", duration_minutes=1.0)
    # ═══ END METERING POST-CALL ═══

    return JSONResponse(job_entry, status_code=202)


@limiter.limit("10/minute")
@app.post("/api/studio/generate/audio")
async def studio_generate_audio(request: Request):
    """Generate audio/TTS using AI — ElevenLabs primary, Gemini TTS fallback."""
    body = await request.json()
    text = body.get("text", "")
    voice = body.get("voice", "kore")
    model = body.get("model", "elevenlabs_pro")
    dialogue = body.get("dialogue", None)  # List of {speaker, text} for multi-speaker

    if not text and not dialogue:
        return JSONResponse({"error": "Text or dialogue required"}, status_code=400)

    # ═══ METERING PRE-CHECK ═══
    meter_check = await enforce_metering(request, model_id=model)
    if not meter_check["allowed"]:
        return JSONResponse({"error": meter_check["error"], "type": "metering", "upgrade_required": meter_check.get("upgrade_required", "")}, status_code=meter_check.get("status_code", 403))
    metering_user = meter_check.get("user")
    # ═══ END METERING PRE-CHECK ═══

    # ElevenLabs voice name → voice_id mapping
    ELEVENLABS_VOICES = {
        "rachel":   "21m00Tcm4TlvDq8ikWAM",
        "adam":     "pNInz6obpgDQGcFmaJgB",
        "alice":    "Xb7hH8MSUJpSbSDYk0k2",
        "arnold":   "VR6AewLTigWG4xSOukaG",
        "bella":    "EXAVITQu4vr4xnSDxMaL",
        "charlie":  "IKne3meq5aSn9XLyUdCD",
        "dorothy":  "ThT5KcBeYPX3keUQqHPh",
        "elli":     "MF3mGyEYCl7XYWbV9V6O",
        "emily":    "LcfcDJNUP1GQjkzn1xUU",
        "ethan":    "g5CIjZEefAph4nQFvHAz",
        "fin":      "D38z5RcWu1voky8WS1ja",
        "freya":    "jsCqWAovK2LkecY7zXl4",
        "gigi":     "jBpfuIE2acCO8z3wKNLl",
        "giovanni": "zcAOhNBS3c14rBihAFp1",
        "grace":    "oWAxZDx7w5VEj9dCyTzz",
        "harry":    "SOYHLrjzK2X1ezoPC6cr",
        "james":    "ZQe5CZNOzWyzPSCn5a3c",
        "jeremy":   "bVMeCyTHy58xNoL34h3p",
        "jessie":   "t0jbNlBVZ17f02VDIeMI",
        "joseph":   "Zlb1dXrM653N07WRdFW3",
        "josh":     "TxGEqnHWrfWFTfGW9XjX",
        "liam":     "TX3LPaxmHKxFdv7VOQHJ",
        "kore":     "21m00Tcm4TlvDq8ikWAM",  # default to Rachel
        "aoede":    "EXAVITQu4vr4xnSDxMaL",  # default to Bella
        "charon":   "VR6AewLTigWG4xSOukaG",  # default to Arnold
        "fenrir":   "pNInz6obpgDQGcFmaJgB",  # default to Adam
        "puck":     "IKne3meq5aSn9XLyUdCD",  # default to Charlie
    }

    audio_bytes = None
    actual_model = model
    errors = []

    async def elevenlabs_tts(tts_text: str, tts_voice: str) -> bytes:
        """Call ElevenLabs TTS API and return audio bytes."""
        voice_id = ELEVENLABS_VOICES.get(tts_voice.lower(), "21m00Tcm4TlvDq8ikWAM")
        async with httpx.AsyncClient(timeout=60.0) as hc:
            resp = await hc.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                headers={
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg",
                },
                json={
                    "text": tts_text,
                    "model_id": "eleven_multilingual_v2",
                    "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
                },
            )
            if resp.status_code == 200:
                return resp.content
            raise RuntimeError(f"ElevenLabs HTTP {resp.status_code}: {resp.text[:200]}")

    async def gemini_tts(tts_text: str, tts_voice: str = "Kore") -> bytes:
        """Call Gemini TTS API and return audio bytes."""
        # Map our voice names to Gemini voice names
        gemini_voice_map = {
            "kore": "Kore", "aoede": "Aoede", "charon": "Charon",
            "fenrir": "Fenrir", "puck": "Puck", "rachel": "Kore",
            "adam": "Fenrir", "alice": "Aoede", "bella": "Aoede",
        }
        g_voice = gemini_voice_map.get(tts_voice.lower(), "Kore")
        async with httpx.AsyncClient(timeout=60.0) as hc:
            resp = await hc.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key={GEMINI_API_KEY}",
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": tts_text}]}],
                    "generationConfig": {
                        "responseModalities": ["AUDIO"],
                        "speechConfig": {
                            "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": g_voice}}
                        },
                    },
                },
            )
            if resp.status_code != 200:
                raise RuntimeError(f"Gemini TTS HTTP {resp.status_code}: {resp.text[:200]}")
            data = resp.json()
            candidates = data.get("candidates", [{}])
            parts = candidates[0].get("content", {}).get("parts", [])
            for part in parts:
                inline = part.get("inlineData", {})
                if inline.get("data"):
                    return base64.b64decode(inline["data"])
            raise RuntimeError("Gemini TTS returned no audio data")

    try:
        if dialogue:
            # Multi-speaker dialogue: chain ElevenLabs calls per speaker, concatenate
            audio_chunks = []
            for turn in dialogue:
                speaker_voice = turn.get("voice", turn.get("speaker", voice))
                speaker_text = turn.get("text", "")
                if not speaker_text:
                    continue
                chunk = None
                # Try ElevenLabs first
                if ELEVENLABS_API_KEY:
                    try:
                        chunk = await elevenlabs_tts(speaker_text, speaker_voice)
                        actual_model = "elevenlabs_multilingual_v2"
                    except Exception as e:
                        errors.append(f"ElevenLabs [{speaker_voice}]: {e}")
                # Fallback to Gemini TTS
                if chunk is None and GEMINI_API_KEY:
                    try:
                        chunk = await gemini_tts(speaker_text, speaker_voice)
                        actual_model = "gemini-tts"
                    except Exception as e:
                        errors.append(f"Gemini TTS [{speaker_voice}]: {e}")
                if chunk:
                    audio_chunks.append(chunk)
            if not audio_chunks:
                return JSONResponse({"error": "Dialogue generation failed", "details": errors}, status_code=422)
            # Simple concatenation of MP3 chunks
            audio_bytes = b"".join(audio_chunks)
        else:
            # Single speaker TTS
            # 1) Try ElevenLabs
            if ELEVENLABS_API_KEY:
                try:
                    audio_bytes = await elevenlabs_tts(text, voice)
                    actual_model = "elevenlabs_multilingual_v2"
                except Exception as e:
                    errors.append(f"ElevenLabs: {e}")

            # 2) Fallback: Gemini TTS
            if audio_bytes is None and GEMINI_API_KEY:
                try:
                    audio_bytes = await gemini_tts(text, voice)
                    actual_model = "gemini-tts"
                except Exception as e:
                    errors.append(f"Gemini TTS: {e}")

            if audio_bytes is None:
                return JSONResponse(
                    {"error": "Audio generation failed — no TTS provider available", "details": errors},
                    status_code=503
                )

        file_id = str(uuid.uuid4())[:8]
        filename = f"audio_{file_id}.mp3"
        filepath = MEDIA_DIR / "audio" / filename
        filepath.parent.mkdir(parents=True, exist_ok=True)
        filepath.write_bytes(audio_bytes)

        entry = {
            "id": file_id,
            "type": "audio",
            "filename": filename,
            "text": text[:200] if text else "Dialogue",
            "voice": voice,
            "model": actual_model,
            "created_at": datetime.now().isoformat(),
            "size_bytes": len(audio_bytes),
            "url": f"/api/studio/media/audio/{filename}",
        }
        media_gallery.insert(0, entry)

        b64 = base64.b64encode(audio_bytes).decode()

        # ═══ METERING POST-CALL ═══
        if metering_user:
            await record_metering(metering_user, model, "audio_generation", duration_minutes=1.0)
        # ═══ END METERING POST-CALL ═══

        return {**entry, "data": f"data:audio/mpeg;base64,{b64}"}

    except Exception as e:
        print(f"[Studio] Audio generation error: {e}")
        return JSONResponse({"error": f"Generation failed: {str(e)[:200]}"}, status_code=422)


@limiter.limit("10/minute")
@app.post("/api/studio/generate/code")
async def studio_generate_code(request: Request):
    """Generate code — multi-provider fallback: xAI Grok → Claude → Gemini."""
    body = await request.json()
    prompt = body.get("prompt", "")
    model = body.get("model", "grok-4")
    language = body.get("language", "python")

    if not prompt:
        return JSONResponse({"error": "Prompt required"}, status_code=400)

    # ═══ METERING PRE-CHECK ═══
    # Map code model names to our MODEL_COSTS keys
    code_model_map = {"grok-4": "grok4", "claude-sonnet": "claude_sonnet", "gemini-flash": "gemini_flash"}
    metering_model = code_model_map.get(model, "claude_sonnet")
    meter_check = await enforce_metering(request, model_id=metering_model)
    if not meter_check["allowed"]:
        return JSONResponse({"error": meter_check["error"], "type": "metering", "upgrade_required": meter_check.get("upgrade_required", "")}, status_code=meter_check.get("status_code", 403))
    metering_user = meter_check.get("user")
    # ═══ END METERING PRE-CHECK ═══

    system_prompt = (
        f"You are an expert {language} programmer. Generate clean, production-ready code. "
        f"Only output code — no explanations, no markdown fences. Just the raw code."
    )
    code_text = ""
    actual_model = model

    # 1) Try xAI Grok if key available
    if not code_text and XAI_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=60.0) as hc:
                resp = await hc.post(
                    "https://api.x.ai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {XAI_API_KEY}", "Content-Type": "application/json"},
                    json={"model": "grok-4", "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": prompt}], "temperature": 0.3, "max_tokens": 4096},
                )
                data = resp.json()
                code_text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                actual_model = "grok-4"
        except Exception as e:
            print(f"[Studio Code] xAI error: {e}")

    # 2) Fallback to Claude
    if not code_text and client:
        try:
            msg = client.messages.create(
                model="claude-sonnet-4-20250514", max_tokens=4096,
                system=system_prompt,
                messages=[{"role": "user", "content": prompt}],
            )
            code_text = msg.content[0].text
            actual_model = "claude-sonnet"
        except Exception as e:
            print(f"[Studio Code] Claude error: {e}")

    # 3) Fallback to Gemini
    if not code_text and GEMINI_API_KEY:
        try:
            result = await gemini_chat(prompt, system_prompt=system_prompt)
            code_text = result.get("response", "")
            actual_model = "gemini-flash"
        except Exception as e:
            print(f"[Studio Code] Gemini error: {e}")

    if not code_text:
        return JSONResponse({"error": "No AI model available for code generation. Add XAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY."}, status_code=503)

    # Strip markdown fences if model included them
    import re as _code_re
    code_text = _code_re.sub(r'^```[\w]*\n?', '', code_text.strip())
    code_text = _code_re.sub(r'\n?```$', '', code_text.strip())

    try:
        file_id = str(uuid.uuid4())[:8]
        filename = f"code_{file_id}.txt"
        filepath = MEDIA_DIR / "code" / filename
        filepath.parent.mkdir(parents=True, exist_ok=True)
        filepath.write_text(code_text)

        entry = {
            "id": file_id, "type": "code", "filename": filename,
            "prompt": prompt, "model": actual_model, "language": language,
            "created_at": datetime.now().isoformat(), "size_bytes": len(code_text),
            "url": f"/api/studio/media/code/{filename}",
        }
        media_gallery.insert(0, entry)

        # ═══ METERING POST-CALL ═══
        if metering_user:
            await record_metering(metering_user, metering_model, "code_generation", duration_minutes=1.0)
        # ═══ END METERING POST-CALL ═══

        return {**entry, "data": code_text, "code": code_text, "model_used": actual_model}

    except Exception as e:
        print(f"[Studio] Code save error: {e}")
        return JSONResponse({"error": f"Generation failed: {str(e)[:200]}"}, status_code=422)


@app.get("/api/studio/gallery")
async def get_gallery():
    """Get all generated media."""
    return {"items": media_gallery, "total": len(media_gallery)}


@app.get("/api/studio/media/{media_type}/{filename}")
async def serve_media(media_type: str, filename: str):
    """Serve generated media files."""
    filepath = MEDIA_DIR / media_type / filename
    if not filepath.exists():
        return JSONResponse({"error": "File not found"}, status_code=404)

    content_types = {
        "images": "image/png",
        "videos": "video/mp4",
        "audio": "audio/mpeg",
    }
    return Response(content=filepath.read_bytes(), media_type=content_types.get(media_type, "application/octet-stream"))


# ═══════════════════════════════════════════════════════════════════════════════
# SOCIAL CONNECT — Platform OAuth + Publishing
# ═══════════════════════════════════════════════════════════════════════════════

SOCIAL_PLATFORMS = {
    "youtube": {
        "name": "YouTube",
        "icon": "youtube",
        "color": "#FF0000",
        "scopes": "Upload videos, manage channel, analytics",
        "features": ["Video upload", "Shorts", "Analytics", "Channel management"],
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "api_base": "https://www.googleapis.com/youtube/v3",
        "category": "video",
    },
    "twitter": {
        "name": "X (Twitter)",
        "icon": "twitter",
        "color": "#000000",
        "scopes": "Post tweets, upload media, engage",
        "features": ["Post tweets", "Upload images/video", "Threads", "Analytics"],
        "auth_url": "https://twitter.com/i/oauth2/authorize",
        "token_url": "https://api.twitter.com/2/oauth2/token",
        "api_base": "https://api.twitter.com/2",
        "category": "social",
    },
    "instagram": {
        "name": "Instagram",
        "icon": "instagram",
        "color": "#E4405F",
        "scopes": "Post photos/reels, stories, analytics",
        "features": ["Photo posts", "Reels", "Stories", "Carousel", "Analytics"],
        "auth_url": "https://api.instagram.com/oauth/authorize",
        "token_url": "https://api.instagram.com/oauth/access_token",
        "api_base": "https://graph.instagram.com",
        "category": "social",
    },
    "facebook": {
        "name": "Facebook",
        "icon": "facebook",
        "color": "#1877F2",
        "scopes": "Post to pages, groups, upload media",
        "features": ["Page posts", "Group posts", "Photo/video upload", "Reels", "Analytics"],
        "auth_url": "https://www.facebook.com/v18.0/dialog/oauth",
        "token_url": "https://graph.facebook.com/v18.0/oauth/access_token",
        "api_base": "https://graph.facebook.com/v18.0",
        "category": "social",
    },
    "tiktok": {
        "name": "TikTok",
        "icon": "tiktok",
        "color": "#000000",
        "scopes": "Upload videos, manage content, analytics",
        "features": ["Video upload", "Sound library", "Analytics", "Direct publish"],
        "auth_url": "https://www.tiktok.com/v2/auth/authorize",
        "token_url": "https://open.tiktokapis.com/v2/oauth/token",
        "api_base": "https://open.tiktokapis.com/v2",
        "category": "video",
    },
    "linkedin": {
        "name": "LinkedIn",
        "icon": "linkedin",
        "color": "#0A66C2",
        "scopes": "Post articles, share content, analytics",
        "features": ["Text posts", "Article publishing", "Image/video posts", "Analytics"],
        "auth_url": "https://www.linkedin.com/oauth/v2/authorization",
        "token_url": "https://www.linkedin.com/oauth/v2/accessToken",
        "api_base": "https://api.linkedin.com/v2",
        "category": "professional",
    },
    "snapchat": {
        "name": "Snapchat",
        "icon": "snapchat",
        "color": "#FFFC00",
        "scopes": "Post stories, spotlight, analytics",
        "features": ["Spotlight videos", "Stories", "AR lenses", "Analytics"],
        "auth_url": "https://accounts.snapchat.com/accounts/oauth2/auth",
        "token_url": "https://accounts.snapchat.com/accounts/oauth2/token",
        "api_base": "https://adsapi.snapchat.com/v1",
        "category": "social",
    },
}


@app.get("/api/social/platforms")
async def get_social_platforms():
    """Get all available social platforms with connection status."""
    platforms = []
    for pid, pdata in SOCIAL_PLATFORMS.items():
        conn = social_connections.get(pid, {})
        platforms.append({
            "id": pid,
            **pdata,
            "connected": conn.get("connected", False),
            "account_name": conn.get("account_name", ""),
            "connected_at": conn.get("connected_at", ""),
        })
    return {"platforms": platforms}


@app.post("/api/social/connect/{platform}")
async def connect_social(platform: str, request: Request):
    """Initiate OAuth connection for a social platform.
    In production, this redirects to the platform's OAuth consent screen.
    For now, we simulate the connection flow."""
    if platform not in SOCIAL_PLATFORMS:
        return JSONResponse({"error": f"Unknown platform: {platform}"}, status_code=400)

    pdata = SOCIAL_PLATFORMS[platform]

    # In production: redirect to OAuth URL with proper client_id, redirect_uri, scopes
    # For now: return the OAuth URL pattern for the platform
    # The actual OAuth setup requires registering apps on each platform's developer portal

    oauth_url = f"{pdata['auth_url']}?client_id=YOUR_APP_CLIENT_ID&redirect_uri=YOUR_CALLBACK_URL&scope=required_scopes&response_type=code"

    return {
        "platform": platform,
        "name": pdata["name"],
        "auth_url": oauth_url,
        "status": "oauth_required",
        "instructions": f"To connect {pdata['name']}, configure your OAuth app credentials in the admin panel. Once set, users will be redirected to authorize their account.",
        "developer_portal": _get_dev_portal(platform),
    }


def _get_dev_portal(platform: str) -> str:
    portals = {
        "youtube": "https://console.cloud.google.com/apis/credentials",
        "twitter": "https://developer.twitter.com/en/portal/dashboard",
        "instagram": "https://developers.facebook.com/apps",
        "facebook": "https://developers.facebook.com/apps",
        "tiktok": "https://developers.tiktok.com/apps",
        "linkedin": "https://www.linkedin.com/developers/apps",
        "snapchat": "https://business.snapchat.com/",
    }
    return portals.get(platform, "")


@app.post("/api/social/disconnect/{platform}")
async def disconnect_social(platform: str):
    """Disconnect a social platform."""
    if platform in social_connections:
        del social_connections[platform]
    return {"platform": platform, "connected": False}


@app.post("/api/social/simulate-connect/{platform}")
async def simulate_connect(platform: str, request: Request):
    """Simulate connecting a platform (demo mode for UI testing)."""
    body = await request.json()
    account_name = body.get("account_name", f"@demo_{platform}")

    social_connections[platform] = {
        "connected": True,
        "account_name": account_name,
        "connected_at": datetime.now().isoformat(),
        "access_token": "demo_token_" + str(uuid.uuid4())[:8],
        "platform": platform,
    }
    return {
        "platform": platform,
        "connected": True,
        "account_name": account_name,
    }


@app.post("/api/social/post")
async def social_post(request: Request):
    """Create a post across one or more social platforms.
    Accepts text, optional media (from gallery), and target platforms."""
    body = await request.json()
    text = body.get("text", "")
    platforms = body.get("platforms", [])
    media_ids = body.get("media_ids", [])
    schedule_at = body.get("schedule_at", None)

    if not platforms:
        return JSONResponse({"error": "Select at least one platform"}, status_code=400)
    if not text and not media_ids:
        return JSONResponse({"error": "Provide text or media"}, status_code=400)

    results = []
    for platform in platforms:
        conn = social_connections.get(platform, {})
        if not conn.get("connected"):
            results.append({
                "platform": platform,
                "success": False,
                "error": f"{SOCIAL_PLATFORMS.get(platform, {}).get('name', platform)} is not connected",
            })
            continue

        # In production: use each platform's API to create the post
        # For now: simulate successful posting
        post_id = f"post_{str(uuid.uuid4())[:8]}"
        results.append({
            "platform": platform,
            "success": True,
            "post_id": post_id,
            "status": "scheduled" if schedule_at else "published",
            "url": _get_post_url(platform, post_id),
            "account": conn.get("account_name", ""),
        })

    return {
        "results": results,
        "total_posted": sum(1 for r in results if r["success"]),
        "total_failed": sum(1 for r in results if not r["success"]),
    }


def _get_post_url(platform: str, post_id: str) -> str:
    urls = {
        "youtube": f"https://youtube.com/watch?v={post_id}",
        "twitter": f"https://x.com/i/status/{post_id}",
        "instagram": f"https://instagram.com/p/{post_id}",
        "facebook": f"https://facebook.com/{post_id}",
        "tiktok": f"https://tiktok.com/@user/video/{post_id}",
        "linkedin": f"https://linkedin.com/feed/update/{post_id}",
        "snapchat": f"https://snapchat.com/s/{post_id}",
    }
    return urls.get(platform, f"#{post_id}")


@app.get("/api/social/post-history")
async def get_post_history():
    """Get social post history."""
    # Demo posts
    demo_posts = [
        {
            "id": "demo-1",
            "text": "Excited to announce our latest AI breakthrough! 🚀 #AI #Innovation",
            "platforms": ["twitter", "linkedin"],
            "status": "published",
            "created_at": "2026-03-04T14:30:00",
            "engagement": {"likes": 142, "comments": 23, "shares": 45},
        },
        {
            "id": "demo-2",
            "text": "Behind the scenes of our new product launch",
            "platforms": ["instagram", "tiktok"],
            "media_type": "video",
            "status": "published",
            "created_at": "2026-03-03T10:00:00",
            "engagement": {"likes": 890, "comments": 67, "shares": 120},
        },
    ]
    return {"posts": demo_posts}


# ============================================================================
# AUTH — Supabase Authentication (signup, login, logout, profile)
# ============================================================================

class AuthSignup(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None

class AuthLogin(BaseModel):
    email: str
    password: str

class AuthMagicLink(BaseModel):
    email: str


@limiter.limit("5/minute")
@app.post("/api/auth/signup")
async def auth_signup(request: Request, data: AuthSignup):
    """Register a new user with SaintSal™ Labs."""
    if not supabase:
        return JSONResponse({"error": "Auth service not configured"}, status_code=503)
    try:
        result = supabase.auth.sign_up({
            "email": data.email,
            "password": data.password,
            "options": {
                "data": {
                    "full_name": data.full_name or "",
                    "plan_tier": "free",
                    "tier": "free"
                }
            }
        })
        if result.user:
            # Send welcome email via Resend
            if RESEND_API_KEY and data.email:
                try:
                    name = data.full_name or data.email.split("@")[0]
                    async with httpx.AsyncClient() as hc:
                        await hc.post(
                            "https://api.resend.com/emails",
                            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                            json={
                                "from": "SAL <sal@saintsallabs.com>",
                                "to": data.email,
                                "subject": "Welcome to SaintSal\u2122 Labs \u2014 Your AI Empire Starts Now",
                                "html": f"""<div style="background:#0e0e0e;color:#fff;font-family:'Inter',sans-serif;padding:40px;max-width:600px;margin:0 auto;">
<h1 style="color:#00FF88;font-size:28px;margin-bottom:8px;">Welcome, {name}. &#x26A1;</h1>
<p style="color:#adaaaa;font-size:16px;">Your SaintSal\u2122 Labs account is live.</p>
<hr style="border:1px solid #262626;margin:24px 0;"/>
<p style="color:#fff;font-size:15px;">You now have access to:</p>
<ul style="color:#adaaaa;font-size:14px;line-height:2;">
<li>&#x1F9E0; SAL AI \u2014 your Gotta Guy\u2122</li>
<li>&#x1F3D7; Full-stack Builder with Grok + Claude + Stitch</li>
<li>&#x1F4B0; Real Estate, Finance, Sports, Medical intelligence</li>
<li>&#x1F0CF; CookinCards\u2122 \u2014 Pokemon TCG tracker</li>
<li>&#x1F4F1; Social Studio, Voice AI, GHL Bridge</li>
</ul>
<a href="https://saintsallabs.com" style="display:inline-block;background:#00FF88;color:#006532;padding:14px 28px;font-weight:700;text-decoration:none;margin-top:16px;">OPEN SAINTSALLABS \u2192</a>
<p style="color:#494847;font-size:12px;margin-top:32px;">Patent #10,290,222 \u2022 HACP\u2122 Protocol \u2022 Saint Vision Technologies LLC</p>
</div>"""
                            },
                            timeout=10
                        )
                except Exception as email_err:
                    print(f"[Resend] Welcome email failed: {email_err}")
            return {
                "success": True,
                "user": {
                    "id": str(result.user.id),
                    "email": result.user.email,
                    "email_confirmed": result.user.email_confirmed_at is not None,
                },
                "session": {
                    "access_token": result.session.access_token if result.session else None,
                    "refresh_token": result.session.refresh_token if result.session else None,
                } if result.session else None,
                "message": "Check your email to confirm your SaintSal\u2122 Labs account" if not result.session else "Welcome to SaintSal\u2122 Labs"
            }
        return JSONResponse({"error": "Signup failed"}, status_code=400)
    except Exception as e:
        error_msg = str(e)
        if "already registered" in error_msg.lower() or "already been registered" in error_msg.lower():
            return JSONResponse({"error": "This email is already registered. Try logging in."}, status_code=409)
        return JSONResponse({"error": error_msg}, status_code=400)


@app.post("/api/auth/login")
async def auth_login(data: AuthLogin):
    """Login with email and password."""
    if not supabase:
        return JSONResponse({"error": "Auth service not configured"}, status_code=503)
    try:
        result = supabase.auth.sign_in_with_password({
            "email": data.email,
            "password": data.password,
        })
        if result.user and result.session:
            # Fetch profile data
            profile = None
            if supabase_admin:
                try:
                    p = supabase_admin.table("profiles").select("*").eq("id", str(result.user.id)).single().execute()
                    profile = p.data
                except Exception:
                    pass
            return {
                "success": True,
                "user": {
                    "id": str(result.user.id),
                    "email": result.user.email,
                    "full_name": profile.get("full_name", "") if profile else "",
                    "plan_tier": profile.get("tier", "free") if profile else "free",
                    "compute_tier": profile.get("compute_tier", "mini") if profile else "mini",
                    "credits_remaining": max(0, (profile.get("request_limit", 100) - profile.get("monthly_requests", 0))) if profile else 100,
                    "credits_limit": profile.get("request_limit", 100) if profile else 100,
                    "wallet_balance": float(profile.get("wallet_balance", 0)) if profile else 0,
                    "total_compute_minutes": float(profile.get("total_compute_minutes", 0)) if profile else 0,
                    "avatar_url": profile.get("avatar_url", "") if profile else "",
                },
                "session": {
                    "access_token": result.session.access_token,
                    "refresh_token": result.session.refresh_token,
                    "expires_at": result.session.expires_at,
                }
            }
        return JSONResponse({"error": "Invalid credentials"}, status_code=401)
    except Exception as e:
        error_msg = str(e)
        if "invalid" in error_msg.lower() or "credentials" in error_msg.lower():
            return JSONResponse({"error": "Invalid email or password"}, status_code=401)
        return JSONResponse({"error": error_msg}, status_code=400)


@limiter.limit("5/minute")
@app.post("/api/auth/magic-link")
async def auth_magic_link(request: Request, data: AuthMagicLink):
    """Send a passwordless magic link."""
    if not supabase:
        return JSONResponse({"error": "Auth service not configured"}, status_code=503)
    try:
        supabase.auth.sign_in_with_otp({"email": data.email})
        return {"success": True, "message": "Magic link sent to your email"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.get("/api/auth/google")
async def auth_google(request: Request):
    """Initiate Google OAuth sign-in via Supabase."""
    if not supabase:
        return JSONResponse({"error": "Auth service not configured"}, status_code=503)
    try:
        # Determine the redirect URL — go back to the frontend root
        # Supabase will append tokens as hash fragments
        origin = str(request.base_url).rstrip("/")
        redirect_to = origin + "/"
        result = supabase.auth.sign_in_with_oauth({
            "provider": "google",
            "options": {
                "redirect_to": redirect_to
            }
        })
        if result and result.url:
            return {"url": result.url}
        return JSONResponse({"error": "Failed to generate Google sign-in URL"}, status_code=500)
    except Exception as e:
        return JSONResponse({"error": f"Google OAuth error: {str(e)}"}, status_code=500)


@app.get("/api/auth/callback")
async def auth_callback(request: Request):
    """Handle OAuth callback — exchange code for session and redirect to frontend."""
    params = dict(request.query_params)
    
    # PKCE flow: Supabase sends a code that needs to be exchanged
    code = params.get("code", "")
    if code:
        try:
            result = supabase.auth.exchange_code_for_session({"auth_code": code})
            if result.session:
                redirect_url = f"/?auth=callback&access_token={result.session.access_token}&refresh_token={result.session.refresh_token}#chat"
                return RedirectResponse(url=redirect_url)
        except Exception as e:
            print(f"[AUTH] Code exchange error: {e}")
    
    # Implicit flow: tokens may be in query params
    access_token = params.get("access_token", "")
    if access_token:
        refresh_token = params.get("refresh_token", "")
        redirect_url = f"/?auth=callback&access_token={access_token}&refresh_token={refresh_token}#chat"
        return RedirectResponse(url=redirect_url)
    
    # Fallback: redirect home
    return RedirectResponse(url="/#chat")


@app.post("/api/auth/refresh")
async def auth_refresh(request: Request):
    """Refresh an expired session."""
    if not supabase:
        return JSONResponse({"error": "Auth service not configured"}, status_code=503)
    body = await request.json()
    refresh_token = body.get("refresh_token")
    if not refresh_token:
        return JSONResponse({"error": "refresh_token required"}, status_code=400)
    try:
        result = supabase.auth.refresh_session(refresh_token)
        if result.session:
            return {
                "success": True,
                "session": {
                    "access_token": result.session.access_token,
                    "refresh_token": result.session.refresh_token,
                    "expires_at": result.session.expires_at,
                }
            }
        return JSONResponse({"error": "Session refresh failed"}, status_code=401)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=401)


@app.post("/api/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    """Sign out the current user."""
    if supabase and authorization and authorization.startswith("Bearer "):
        try:
            supabase.auth.sign_out()
        except Exception:
            pass
    return {"success": True}


# ─── User DNA Routes ──────────────────────────────────────────────────────────

@app.post("/api/user/dna")
async def save_user_dna(request: Request):
    """Save or update user's Business DNA profile."""
    user = await get_current_user(request)
    body = await request.json()
    if not supabase_admin:
        return JSONResponse({"error": "DB unavailable"}, status_code=503)
    try:
        dna_data = {
            "pillars": body.get("pillars", []),
            "favorite_teams": body.get("favorite_teams", {}),
            "username": body.get("username", ""),
            "display_name": body.get("display_name", ""),
            "bio": body.get("bio", ""),
            "tier": body.get("tier", "free"),
            "updated_at": "now()"
        }
        if user and user.get("id"):
            dna_data["user_id"] = user["id"]
            result = supabase_admin.table("user_dna").upsert(dna_data, on_conflict="user_id").execute()
        return {"success": True, "dna": dna_data}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)

@app.get("/api/user/dna")
async def get_user_dna(request: Request):
    """Get user's Business DNA profile."""
    user = await get_current_user(request)
    if not user or not supabase_admin:
        return {"pillars": [], "favorite_teams": {}, "tier": "free"}
    try:
        result = supabase_admin.table("user_dna").select("*").eq("user_id", user["id"]).limit(1).execute()
        return result.data[0] if result.data else {"pillars": [], "favorite_teams": {}, "tier": "free"}
    except Exception as e:
        return {"pillars": [], "favorite_teams": {}, "tier": "free", "error": str(e)}


@app.get("/api/auth/profile")
async def auth_profile(user=Depends(get_current_user)):
    """Get the current user's profile with credit balance."""
    if not user:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    if not supabase_admin:
        return JSONResponse({"error": "Profile service unavailable"}, status_code=503)
    try:
        result = supabase_admin.table("profiles").select("*").eq("id", user["id"]).single().execute()
        profile = result.data
        tier = profile.get("tier", "free")
        tier_config = PLAN_TIERS.get(tier, PLAN_TIERS["free"])
        return {
            "user": {
                "id": profile["id"],
                "email": profile["email"],
                "full_name": profile.get("full_name", ""),
                "avatar_url": profile.get("avatar_url", ""),
                "plan_tier": tier,
                "compute_tier": profile.get("compute_tier", "mini"),
                "credits_remaining": max(0, profile.get("request_limit", 100) - profile.get("monthly_requests", 0)),
                "credits_limit": profile.get("request_limit", 100),
                "wallet_balance": float(profile.get("wallet_balance", 0)),
                "total_compute_minutes": float(profile.get("total_compute_minutes", 0)),
                "current_month_spend": float(profile.get("current_month_spend", 0)),
                "compute_access": tier_config.get("compute_access", ["mini"]),
                "onboarding_complete": profile.get("onboarding_complete", False),
                "stripe_customer_id": profile.get("stripe_customer_id"),
            }
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/auth/usage")
async def auth_usage(user=Depends(get_current_user)):
    """Get the current user's usage for this billing period."""
    if not user:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    if not supabase_admin:
        # Return demo data if Supabase not configured
        return _demo_usage()
    try:
        result = supabase_admin.rpc("get_usage_summary", {"p_user_id": user["id"]}).execute()
        return {"usage": result.data}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


async def deduct_user_credits(user_id: str, credits: int, action_type: str, model: str, provider: str, metadata: dict = None):
    """Deduct credits using the new metering system. Wraps meter_usage for backward compatibility."""
    model_info = MODEL_COSTS.get(model)
    if model_info:
        return await meter_usage(user_id, model, action_type, duration_minutes=1.0)
    
    if not supabase_admin:
        return {"success": True, "credits_used": credits, "credits_remaining": 999, "tier": "demo"}
    
    try:
        result = supabase_admin.rpc("deduct_credits", {
            "p_user_id": user_id,
            "p_credits": credits,
            "p_model": model,
            "p_description": action_type
        }).execute()
        return result.data
    except Exception as e:
        print(f"Credit deduction failed: {e}")
        return {"success": False, "error": str(e)}


def _demo_usage():
    """Return demo usage data when Supabase is not configured."""
    return {
        "user_id": "demo",
        "period": datetime.now().strftime("%Y-%m"),
        "credits_used": 0, "credits_remaining": 100, "credits_limit": 100,
        "tier": "free", "compute_tier": "mini",
        "total_compute_minutes": 0, "current_month_spend": 0,
        "by_tier": {}, "by_model": {}, "by_action": {},
    }



# ─── Dashboard API ──────────────────────────────────────────────────────────────

@app.get("/api/dashboard/trending")
async def dashboard_trending():
    """Get live trending topics across all verticals for dashboard."""
    verticals = ["sports", "news", "tech", "finance", "realestate"]
    trending = {}

    if TAVILY_API_KEY:
        queries = {
            "sports": "sports scores results highlights today",
            "news": "breaking news top stories today",
            "tech": "technology AI product launches today",
            "finance": "stock market crypto financial news today",
            "realestate": "housing market real estate news today",
        }
        tasks = {v: search_web(q, search_depth="basic", max_results=3, topic="news")
                 for v, q in queries.items()}

        for v in verticals:
            try:
                result = await tasks[v]
                trending[v] = [
                    {"title": r["title"], "url": r.get("url", ""), "domain": r.get("domain", "")}
                    for r in result.get("results", [])[:3]
                ]
            except Exception:
                trending[v] = []
    else:
        for v in verticals:
            trending[v] = []

    return {"trending": trending, "updated_at": datetime.now().isoformat()}


@app.post("/api/dashboard/preferences")
async def save_preferences(request: Request, user=Depends(get_current_user)):
    """Save user dashboard preferences (topics, verticals, etc.)."""
    if not user:
        return JSONResponse({"error": "Authentication required"}, status_code=401)
    body = await request.json()
    # Store in Supabase if available
    if supabase_admin:
        try:
            supabase_admin.table("user_preferences").upsert({
                "user_id": user["id"],
                "preferences": body,
                "updated_at": datetime.now().isoformat()
            }).execute()
            return {"status": "saved"}
        except Exception as e:
            print(f"Save preferences error: {e}")
    return {"status": "saved_locally"}


@app.get("/api/dashboard/preferences")
async def get_preferences(user=Depends(get_current_user)):
    """Get user dashboard preferences."""
    if not user:
        return {"preferences": {"verticals": ["sports", "news", "tech", "finance", "realestate"],
                                "theme": "dark", "notifications": True}}
    if supabase_admin:
        try:
            result = supabase_admin.table("user_preferences").select("preferences").eq("user_id", user["id"]).execute()
            if result.data:
                return {"preferences": result.data[0]["preferences"]}
        except Exception:
            pass
    return {"preferences": {"verticals": ["sports", "news", "tech", "finance", "realestate"],
                            "theme": "dark", "notifications": True}}


@app.post("/api/dashboard/saved-searches")
async def save_search(request: Request, user=Depends(get_current_user)):
    """Save a search to user's dashboard."""
    if not user:
        return JSONResponse({"error": "Authentication required"}, status_code=401)
    body = await request.json()
    search_data = {
        "user_id": user["id"],
        "query": body.get("query", ""),
        "vertical": body.get("vertical", "search"),
        "created_at": datetime.now().isoformat()
    }
    if supabase_admin:
        try:
            supabase_admin.table("saved_searches").insert(search_data).execute()
            return {"status": "saved", "search": search_data}
        except Exception as e:
            print(f"Save search error: {e}")
    return {"status": "saved_locally", "search": search_data}


@app.get("/api/dashboard/saved-searches")
async def get_saved_searches(user=Depends(get_current_user)):
    """Get user's saved searches."""
    if not user:
        return {"searches": []}
    if supabase_admin:
        try:
            result = supabase_admin.table("saved_searches").select("*").eq("user_id", user["id"]).order("created_at", desc=True).limit(20).execute()
            return {"searches": result.data or []}
        except Exception:
            pass
    return {"searches": []}


@app.get("/api/voice/config")
async def voice_config():
    """Get ElevenLabs voice agent configuration."""
    return {
        "enabled": bool(ELEVENLABS_API_KEY),
        "agent_id": os.environ.get("ELEVENLABS_AGENT_ID_KEY", os.environ.get("ELEVENLABS_AGENT_ID", "")),
        "api_key_public": ELEVENLABS_API_KEY[:8] + "..." if ELEVENLABS_API_KEY else "",
    }

# ─── Health Check ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "SaintSal.ai",
        "version": "7.0-metering-overhaul",
        "integrations": {
            "supabase": {"public": supabase is not None, "admin": supabase_admin is not None, "url": SUPABASE_URL},
            "godaddy": {"configured": bool(GODADDY_API_KEY), "base": GODADDY_BASE},
            "corpnet": {"configured": bool(CORPNET_API_KEY), "data_key_set": bool(CORPNET_DATA_API_KEY)},
            "tavily": {"configured": bool(TAVILY_API_KEY)},
            "rentcast": {"configured": bool(RENTCAST_API_KEY), "base": RENTCAST_BASE},
            "google_maps": {"configured": bool(GOOGLE_MAPS_KEY)},
            "studio": {"image_gen": True, "video_gen": True, "audio_gen": True},
            "social_platforms": list(SOCIAL_PLATFORMS.keys()),
            "social_connected": [k for k, v in social_connections.items() if v.get("connected")],
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ENHANCED DOMAINS — DNS, WHOIS, SSL, Managed Domains
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/domains/managed")
async def get_managed_domains():
    """Get user's managed domains from GoDaddy."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            resp = await http.get(
                f"{GODADDY_BASE}/v1/domains",
                headers=GODADDY_HEADERS,
            )
            if resp.status_code == 200:
                domains = resp.json()
                result = []
                for d in domains:
                    result.append({
                        "domain": d.get("domain", ""),
                        "status": d.get("status", "UNKNOWN"),
                        "expires": d.get("expires", "")[:10] if d.get("expires") else "N/A",
                        "renewAuto": d.get("renewAuto", False),
                        "privacy": d.get("privacy", False),
                        "locked": d.get("locked", False),
                        "nameServers": d.get("nameServers", []),
                    })
                return {"domains": result, "api_live": True}
            else:
                return {"domains": [], "api_live": False, "note": f"GoDaddy API returned {resp.status_code} — showing your known domains"}
    except Exception as e:
        return {"domains": [], "api_live": False, "note": f"GoDaddy API unavailable — showing your known domains"}


@app.get("/api/domains/dns/{domain}")
async def get_dns_records(domain: str):
    """Get DNS records for a domain from GoDaddy."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            resp = await http.get(
                f"{GODADDY_BASE}/v1/domains/{domain}/records",
                headers=GODADDY_HEADERS,
            )
            if resp.status_code == 200:
                records = resp.json()
                return {"domain": domain, "records": records, "api_live": True}
            else:
                return {"domain": domain, "records": [], "api_live": False, "note": f"GoDaddy API returned {resp.status_code} — showing example records"}
    except Exception as e:
        return {"domain": domain, "records": [], "api_live": False, "note": "GoDaddy API unavailable — showing example records"}


@app.get("/api/domains/whois/{domain}")
async def get_whois(domain: str):
    """Get WHOIS info for a domain."""
    try:
        # Try Python whois lookup (no GoDaddy API needed)
        import subprocess
        result = subprocess.run(["whois", domain], capture_output=True, text=True, timeout=10)
        if result.returncode == 0 and result.stdout:
            lines = result.stdout.strip().split("\n")
            whois = {}
            for line in lines:
                if ":" in line:
                    key, val = line.split(":", 1)
                    key = key.strip().lower()
                    val = val.strip()
                    if "registrar" in key and "registrar" not in whois:
                        whois["registrar"] = val
                    elif "creation" in key or "created" in key:
                        whois["createdDate"] = val
                    elif "expir" in key:
                        whois["expiresDate"] = val
                    elif "updated" in key:
                        whois["updatedDate"] = val
                    elif "name server" in key:
                        if "nameServers" not in whois:
                            whois["nameServers"] = []
                        whois["nameServers"].append(val.lower())
                    elif "status" in key:
                        if "status" not in whois:
                            whois["status"] = []
                        whois["status"].append(val.split(" ")[0])
            return {"domain": domain, "whois": whois, "api_live": True}
    except Exception:
        pass

    # Fallback: try GoDaddy API
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            resp = await http.get(
                f"{GODADDY_BASE}/v1/domains/{domain}",
                headers=GODADDY_HEADERS,
            )
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "domain": domain,
                    "whois": {
                        "registrar": "GoDaddy.com, LLC",
                        "createdDate": data.get("createdAt", "N/A"),
                        "expiresDate": data.get("expires", "N/A"),
                        "nameServers": data.get("nameServers", []),
                        "status": [data.get("status", "UNKNOWN")],
                    },
                    "api_live": True,
                }
    except Exception:
        pass

    return {
        "domain": domain,
        "whois": {"registrar": "Unknown", "createdDate": "N/A", "expiresDate": "N/A", "nameServers": [], "status": []},
        "api_live": False,
        "note": "WHOIS lookup unavailable"
    }


# ═══════════════════════════════════════════════════════════════════════════════
# CONNECTORS — Generic OAuth + API Key Management for 70+ Integrations
# ═══════════════════════════════════════════════════════════════════════════════

# ─── Connector Credential Storage (Supabase Vault) ────────────────────────────
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


# ── v7.36.1 — Social OAuth Flow (per-user, Supabase-stored tokens) ──────────

SOCIAL_OAUTH_CONFIG = {
    "twitter": {
        "name": "X (Twitter)",
        "auth_url": "https://twitter.com/i/oauth2/authorize",
        "token_url": "https://api.twitter.com/2/oauth2/token",
        "scopes": "tweet.read tweet.write users.read offline.access",
        "env_client_id": "TWITTER_CLIENT_ID",
        "env_client_secret": "TWITTER_CLIENT_SECRET",
        "pkce": True,  # Twitter uses OAuth 2.0 with PKCE
    },
    "linkedin": {
        "name": "LinkedIn",
        "auth_url": "https://www.linkedin.com/oauth/v2/authorization",
        "token_url": "https://www.linkedin.com/oauth/v2/accessToken",
        "scopes": "openid profile w_member_social",
        "env_client_id": "LINKEDIN_CLIENT_ID",
        "env_client_secret": "LINKEDIN_CLIENT_SECRET",
        "pkce": False,
    },
    "facebook": {
        "name": "Facebook",
        "auth_url": "https://www.facebook.com/v18.0/dialog/oauth",
        "token_url": "https://graph.facebook.com/v18.0/oauth/access_token",
        "scopes": "pages_manage_posts,pages_read_engagement,public_profile",
        "env_client_id": "FACEBOOK_APP_ID",
        "env_client_secret": "FACEBOOK_APP_SECRET",
        "pkce": False,
    },
    "instagram": {
        "name": "Instagram",
        "auth_url": "https://api.instagram.com/oauth/authorize",
        "token_url": "https://api.instagram.com/oauth/access_token",
        "scopes": "instagram_basic,instagram_content_publish",
        "env_client_id": "INSTAGRAM_APP_ID",
        "env_client_secret": "INSTAGRAM_APP_SECRET",
        "pkce": False,
    },
    "tiktok": {
        "name": "TikTok",
        "auth_url": "https://www.tiktok.com/v2/auth/authorize/",
        "token_url": "https://open.tiktokapis.com/v2/oauth/token/",
        "scopes": "video.upload,video.list,user.info.basic",
        "env_client_id": "TIKTOK_CLIENT_KEY",
        "env_client_secret": "TIKTOK_CLIENT_SECRET",
        "pkce": True,
    },
    "youtube": {
        "name": "YouTube",
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "scopes": "https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.upload",
        "env_client_id": "GOOGLE_CLIENT_ID",
        "env_client_secret": "GOOGLE_CLIENT_SECRET",
        "pkce": False,
    },
    "snapchat": {
        "name": "Snapchat",
        "auth_url": "https://accounts.snapchat.com/accounts/oauth2/auth",
        "token_url": "https://accounts.snapchat.com/accounts/oauth2/token",
        "scopes": "snapchat-marketing-api",
        "env_client_id": "SNAPCHAT_CLIENT_ID",
        "env_client_secret": "SNAPCHAT_CLIENT_SECRET",
        "pkce": False,
    },
    "whatsapp": {
        "name": "WhatsApp Business",
        "auth_url": "https://www.facebook.com/v18.0/dialog/oauth",
        "token_url": "https://graph.facebook.com/v18.0/oauth/access_token",
        "scopes": "whatsapp_business_management,whatsapp_business_messaging",
        "env_client_id": "WHATSAPP_APP_ID",
        "env_client_secret": "WHATSAPP_APP_SECRET",
        "pkce": False,
    },
    "threads": {
        "name": "Threads",
        "auth_url": "https://www.threads.net/oauth/authorize",
        "token_url": "https://graph.threads.net/oauth/access_token",
        "scopes": "threads_basic,threads_content_publish,threads_manage_replies",
        "env_client_id": "THREADS_APP_ID",
        "env_client_secret": "THREADS_APP_SECRET",
        "pkce": False,
    },
    "discord": {
        "name": "Discord",
        "auth_url": "https://discord.com/api/oauth2/authorize",
        "token_url": "https://discord.com/api/oauth2/token",
        "scopes": "bot guilds messages.read",
        "env_client_id": "DISCORD_CLIENT_ID",
        "env_client_secret": "DISCORD_CLIENT_SECRET",
        "pkce": False,
    },
}

# Temporary store for PKCE code verifiers (in production: use Redis/session)
_social_pkce_store = {}


@app.get("/api/social/auth/{platform}")
async def social_auth_start(platform: str, authorization: Optional[str] = Header(None)):
    """v7.36.1 — Start OAuth flow for a social platform. Returns auth URL for user to visit."""
    import hashlib, base64, secrets
    
    user = await get_current_user(authorization)
    if not user:
        return JSONResponse({"error": "Authentication required to connect social accounts"}, status_code=401)
    
    config = SOCIAL_OAUTH_CONFIG.get(platform)
    if not config:
        return JSONResponse({"error": f"Unsupported platform: {platform}"}, status_code=400)
    
    client_id = os.environ.get(config["env_client_id"], "")
    if not client_id:
        return JSONResponse({
            "error": f"{config['name']} OAuth not configured",
            "setup_required": True,
            "message": f"Set {config['env_client_id']} and {config['env_client_secret']} environment variables to enable {config['name']} connection.",
            "docs_url": {
                "twitter": "https://developer.twitter.com/en/portal/dashboard",
                "linkedin": "https://www.linkedin.com/developers/apps",
                "facebook": "https://developers.facebook.com/apps",
                "instagram": "https://developers.facebook.com/apps",
            }.get(platform, ""),
        }, status_code=503)
    
    redirect_uri = f"{os.environ.get('APP_URL', 'https://saintsallabs.com')}/api/social/callback/{platform}"
    state = f"{user['id']}:{secrets.token_urlsafe(16)}"
    
    import urllib.parse
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": config["scopes"],
        "response_type": "code",
        "state": state,
    }
    
    # Twitter uses PKCE
    if config.get("pkce"):
        code_verifier = secrets.token_urlsafe(64)[:128]
        code_challenge = base64.urlsafe_b64encode(
            hashlib.sha256(code_verifier.encode()).digest()
        ).decode().rstrip("=")
        params["code_challenge"] = code_challenge
        params["code_challenge_method"] = "S256"
        _social_pkce_store[state] = code_verifier
    
    auth_url = f"{config['auth_url']}?{urllib.parse.urlencode(params)}"
    return {"auth_url": auth_url, "platform": platform, "state": state}


@app.get("/api/social/callback/{platform}")
async def social_auth_callback(platform: str, code: str = "", state: str = "", error: str = ""):
    """v7.36.1 — OAuth callback: exchange code for token, store in Supabase."""
    if error:
        return HTMLResponse(f"""<html><body><script>
            window.opener && window.opener.postMessage({{type:'social_error',platform:'{platform}',error:'{error}'}}, '*');
            window.close();
        </script><p>Connection failed: {error}</p></body></html>""")
    
    if not code or not state:
        return HTMLResponse("<html><body><p>Missing authorization code</p></body></html>")
    
    # Extract user_id from state
    user_id = state.split(":")[0] if ":" in state else ""
    if not user_id:
        return HTMLResponse("<html><body><p>Invalid state parameter</p></body></html>")
    
    config = SOCIAL_OAUTH_CONFIG.get(platform)
    if not config:
        return HTMLResponse(f"<html><body><p>Unknown platform: {platform}</p></body></html>")
    
    client_id = os.environ.get(config["env_client_id"], "")
    client_secret = os.environ.get(config["env_client_secret"], "")
    redirect_uri = f"{os.environ.get('APP_URL', 'https://saintsallabs.com')}/api/social/callback/{platform}"
    
    try:
        async with httpx.AsyncClient(timeout=30) as hc:
            # Exchange code for token
            token_data = {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": client_id,
            }
            headers = {"Content-Type": "application/x-www-form-urlencoded"}
            
            if config.get("pkce"):
                # Twitter PKCE flow
                code_verifier = _social_pkce_store.pop(state, "")
                token_data["code_verifier"] = code_verifier
                # Twitter uses basic auth for token exchange
                import base64 as b64
                basic_auth = b64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
                headers["Authorization"] = f"Basic {basic_auth}"
            else:
                token_data["client_secret"] = client_secret
            
            resp = await hc.post(config["token_url"], data=token_data, headers=headers)
            
            if resp.status_code != 200:
                print(f"[Social OAuth] Token exchange failed for {platform}: {resp.status_code} {resp.text[:200]}")
                return HTMLResponse(f"""<html><body><script>
                    window.opener && window.opener.postMessage({{type:'social_error',platform:'{platform}',error:'Token exchange failed'}}, '*');
                    window.close();
                </script><p>Token exchange failed. Please try again.</p></body></html>""")
            
            tokens = resp.json()
            access_token = tokens.get("access_token", "")
            refresh_token = tokens.get("refresh_token", "")
            expires_in = tokens.get("expires_in")
            
            # Get platform user info
            platform_user_id = ""
            platform_username = ""
            
            if platform == "twitter":
                me_resp = await hc.get("https://api.twitter.com/2/users/me",
                    headers={"Authorization": f"Bearer {access_token}"})
                if me_resp.status_code == 200:
                    me = me_resp.json().get("data", {})
                    platform_user_id = me.get("id", "")
                    platform_username = me.get("username", "")
            
            elif platform == "linkedin":
                me_resp = await hc.get("https://api.linkedin.com/v2/me",
                    headers={"Authorization": f"Bearer {access_token}"})
                if me_resp.status_code == 200:
                    me = me_resp.json()
                    platform_user_id = me.get("id", "")
                    fn = me.get("localizedFirstName", "")
                    ln = me.get("localizedLastName", "")
                    platform_username = f"{fn} {ln}".strip()
            
            elif platform == "facebook":
                me_resp = await hc.get(f"https://graph.facebook.com/v18.0/me?access_token={access_token}")
                if me_resp.status_code == 200:
                    me = me_resp.json()
                    platform_user_id = me.get("id", "")
                    platform_username = me.get("name", "")
                # Get page token for posting
                pages_resp = await hc.get(f"https://graph.facebook.com/v18.0/me/accounts?access_token={access_token}")
                if pages_resp.status_code == 200:
                    pages = pages_resp.json().get("data", [])
                    if pages:
                        # Store the first page's token as the posting token
                        access_token = pages[0].get("access_token", access_token)
                        platform_user_id = pages[0].get("id", platform_user_id)  # Page ID for posting
            
            # Store in Supabase social_tokens
            expires_at = None
            if expires_in:
                from datetime import timedelta
                expires_at = (datetime.now() + timedelta(seconds=int(expires_in))).isoformat()
            
            if supabase_admin:
                try:
                    supabase_admin.table("social_tokens").upsert({
                        "user_id": user_id,
                        "platform": platform,
                        "access_token": access_token,
                        "refresh_token": refresh_token or None,
                        "platform_user_id": platform_user_id,
                        "platform_username": platform_username,
                        "scopes": config["scopes"],
                        "expires_at": expires_at,
                        "is_active": True,
                        "connected_at": datetime.now().isoformat(),
                        "updated_at": datetime.now().isoformat(),
                    }, on_conflict="user_id,platform").execute()
                except Exception as db_err:
                    print(f"[Social OAuth] DB store error: {db_err}")
            
            return HTMLResponse(f"""<html><body><script>
                window.opener && window.opener.postMessage({{
                    type: 'social_connected',
                    platform: '{platform}',
                    username: '{platform_username}',
                    user_id: '{platform_user_id}'
                }}, '*');
                window.close();
            </script><p>Connected to {config['name']} as {platform_username}! You can close this window.</p></body></html>""")
    
    except Exception as e:
        print(f"[Social OAuth] Error: {e}")
        return HTMLResponse(f"""<html><body><script>
            window.opener && window.opener.postMessage({{type:'social_error',platform:'{platform}',error:'{str(e)[:100]}'}}, '*');
            window.close();
        </script><p>Connection error. Please try again.</p></body></html>""")


@app.get("/api/social/connections")
async def social_connections_list(authorization: Optional[str] = Header(None)):
    """v7.36.1 — Get user's connected social platforms."""
    user = await get_current_user(authorization)
    if not user:
        return {"connections": [], "message": "Sign in to see your social connections", "supported_platforms": list(SOCIAL_OAUTH_CONFIG.keys())}
    
    connections = []
    if supabase_admin:
        try:
            result = supabase_admin.table("social_tokens").select(
                "platform, platform_username, platform_user_id, scopes, connected_at, expires_at, is_active"
            ).eq("user_id", user["id"]).eq("is_active", True).execute()
            connections = result.data or []
        except Exception as e:
            print(f"[Social] Connections query error: {e}")
    
    # Also check env-var-based connections (global, not per-user)
    env_platforms = {
        "twitter": bool(os.environ.get("TWITTER_API_KEY") or os.environ.get("TWITTER_CLIENT_ID")),
        "linkedin": bool(os.environ.get("LINKEDIN_ACCESS_TOKEN") or os.environ.get("LINKEDIN_CLIENT_ID")),
        "facebook": bool(os.environ.get("FACEBOOK_PAGE_TOKEN") or os.environ.get("FACEBOOK_APP_ID")),
    }
    
    return {
        "connections": connections,
        "env_configured": env_platforms,
        "supported_platforms": list(SOCIAL_OAUTH_CONFIG.keys()),
    }


@app.delete("/api/social/connections/{platform}")
async def social_disconnect(platform: str, authorization: Optional[str] = Header(None)):
    """v7.36.1 — Disconnect a social platform."""
    user = await get_current_user(authorization)
    if not user:
        return JSONResponse({"error": "Authentication required"}, status_code=401)
    
    if supabase_admin:
        try:
            supabase_admin.table("social_tokens").update({
                "is_active": False,
                "updated_at": datetime.now().isoformat()
            }).eq("user_id", user["id"]).eq("platform", platform).execute()
        except Exception as e:
            print(f"[Social] Disconnect error: {e}")
    
    return {"status": "disconnected", "platform": platform}


connector_credentials = {}


@app.post("/api/connectors/auth/{connector_id}")
async def initiate_connector_auth(connector_id: str, request: Request):
    """Initiate OAuth flow for a connector."""
    # Check if we have stored OAuth credentials for this connector
    creds = connector_credentials.get(connector_id, {})
    client_id = creds.get("client_id", "")
    
    # Platform-specific OAuth URLs
    oauth_configs = {
        "youtube": {"auth_url": "https://accounts.google.com/o/oauth2/v2/auth", "scopes": "https://www.googleapis.com/auth/youtube"},
        "twitter": {"auth_url": "https://twitter.com/i/oauth2/authorize", "scopes": "tweet.read tweet.write users.read"},
        "instagram": {"auth_url": "https://api.instagram.com/oauth/authorize", "scopes": "instagram_basic,instagram_content_publish"},
        "facebook": {"auth_url": "https://www.facebook.com/v18.0/dialog/oauth", "scopes": "pages_manage_posts,pages_read_engagement"},
        "tiktok": {"auth_url": "https://www.tiktok.com/v2/auth/authorize/", "scopes": "video.upload,video.list"},
        "linkedin": {"auth_url": "https://www.linkedin.com/oauth/v2/authorization", "scopes": "w_member_social,r_liteprofile"},
        "snapchat": {"auth_url": "https://accounts.snapchat.com/accounts/oauth2/auth", "scopes": "snapchat-marketing-api"},
        "gohighlevel": {"auth_url": "https://marketplace.gohighlevel.com/oauth/chooselocation", "scopes": "contacts.write opportunities.write"},
        "hubspot": {"auth_url": "https://app.hubspot.com/oauth/authorize", "scopes": "crm.objects.contacts.read crm.objects.deals.read"},
        "salesforce": {"auth_url": "https://login.salesforce.com/services/oauth2/authorize", "scopes": "api refresh_token"},
        "shopify": {"auth_url": "https://YOUR_SHOP.myshopify.com/admin/oauth/authorize", "scopes": "read_products,write_orders"},
        "github": {"auth_url": "https://github.com/login/oauth/authorize", "scopes": "repo user"},
        "slack": {"auth_url": "https://slack.com/oauth/v2/authorize", "scopes": "chat:write channels:read"},
        "notion": {"auth_url": "https://api.notion.com/v1/oauth/authorize", "scopes": ""},
        "discord": {"auth_url": "https://discord.com/api/oauth2/authorize", "scopes": "bot messages.read"},
        "whatsapp": {"auth_url": "https://www.facebook.com/v18.0/dialog/oauth", "scopes": "whatsapp_business_management,whatsapp_business_messaging"},
        "threads": {"auth_url": "https://www.threads.net/oauth/authorize", "scopes": "threads_basic,threads_content_publish"},
        "coinbase": {"auth_url": "https://www.coinbase.com/oauth/authorize", "scopes": "wallet:accounts:read"},
    }
    
    config = oauth_configs.get(connector_id, {})
    auth_base = config.get("auth_url", "")
    scopes = config.get("scopes", "")
    redirect_uri = f"{os.environ.get('APP_URL', 'https://saintsallabs.com')}/api/connectors/callback/{connector_id}"
    
    if client_id and auth_base:
        # Build real OAuth URL
        import urllib.parse
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": scopes,
            "response_type": "code",
            "state": connector_id,
        }
        auth_url = f"{auth_base}?{urllib.parse.urlencode(params)}"
        return {"auth_url": auth_url, "status": "redirect", "connector": connector_id}
    else:
        return {
            "auth_url": f"{auth_base}?client_id=YOUR_APP_CLIENT_ID&redirect_uri={redirect_uri}&scope={scopes}&response_type=code" if auth_base else "",
            "status": "setup_required",
            "connector": connector_id,
            "message": f"OAuth credentials not yet configured for {connector_id}. Set up your app credentials to enable connection.",
            "redirect_uri": redirect_uri,
        }


@app.get("/api/connectors/callback/{connector_id}")
async def connector_oauth_callback(connector_id: str, code: str = "", state: str = ""):
    """Handle OAuth callback — exchange code for token."""
    if not code:
        return JSONResponse({"error": "No authorization code received"}, status_code=400)
    
    creds = connector_credentials.get(connector_id, {})
    # In production: exchange code for token using client_secret
    # Store token in encrypted Supabase vault
    
    # For now, mark as connected
    connector_credentials[connector_id] = {
        **creds,
        "connected": True,
        "auth_code": code,
        "connected_at": datetime.now().isoformat(),
    }
    
    # Redirect back to app
    return HTMLResponse(f"""
        <html><body><script>
            window.opener && window.opener.postMessage({{type: 'connector_connected', connector: '{connector_id}'}}, '*');
            window.close();
        </script><p>Connected! You can close this window.</p></body></html>
    """)


@app.post("/api/connectors/save-key")
async def save_connector_api_key(request: Request):
    """Save an API key for a connector."""
    body = await request.json()
    connector_id = body.get("connector_id", "")
    api_key = body.get("api_key", "")
    
    if not connector_id or not api_key:
        return JSONResponse({"error": "Connector ID and API key required"}, status_code=400)
    
    # Store (in production: encrypt and store in Supabase)
    connector_credentials[connector_id] = {
        "api_key": api_key[:4] + "***" + api_key[-4:],  # Mask for storage
        "api_key_full": api_key,  # In production: encrypt this
        "connected": True,
        "connected_at": datetime.now().isoformat(),
    }
    
    return {"status": "connected", "connector": connector_id, "message": f"API key saved for {connector_id}"}


@app.post("/api/connectors/save-oauth-creds")
async def save_connector_oauth_creds(request: Request):
    """Save OAuth client credentials and initiate auth flow."""
    body = await request.json()
    connector_id = body.get("connector_id", "")
    client_id = body.get("client_id", "")
    client_secret = body.get("client_secret", "")
    
    if not connector_id or not client_id:
        return JSONResponse({"error": "Connector ID and Client ID required"}, status_code=400)
    
    connector_credentials[connector_id] = {
        "client_id": client_id,
        "client_secret": client_secret,
        "connected": False,
    }
    
    # Now initiate the OAuth flow with the saved credentials
    # Re-call the auth endpoint which will now use the stored client_id
    from starlette.requests import Request as StarletteRequest
    result = await initiate_connector_auth(connector_id, request)
    return result


@app.get("/api/connectors/status")
async def get_connectors_status():
    """Get connection status for all connectors."""
    status = {}
    for cid, creds in connector_credentials.items():
        status[cid] = {
            "connected": creds.get("connected", False),
            "connected_at": creds.get("connected_at"),
            "has_key": bool(creds.get("api_key") or creds.get("client_id")),
        }
    # Also include social connections
    for pid, conn in social_connections.items():
        if pid not in status:
            status[pid] = {
                "connected": conn.get("connected", False),
                "connected_at": conn.get("connected_at"),
            }
    return {"connectors": status}


# ─── Stripe Webhook Handler ──────────────────────────────────────────────────
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
                # Monthly
                "price_1T5bkAL47U80vDLAslOm3HoX": "free",
                "price_1T5bkAL47U80vDLAaChP4Hqg": "starter",
                "price_1T5bkBL47U80vDLALiVDkOgb": "pro",
                "price_1T5bkCL47U80vDLANsCa647K": "teams",
                "price_1T5bkDL47U80vDLANXWF33A7": "enterprise",
                # Annual
                "price_1T7p1tL47U80vDLAnxtkrGV4": "free",
                "price_1T6dHNL47U80vDLAPgfsUmtO": "starter",
                "price_1T6dHNL47U80vDLAHYxorUNk": "pro",
                "price_1T84uZL47U80vDLARDZK46qE": "pro",  # Pro annual v2
                "price_1T6dHNL47U80vDLAqTTV84lL": "teams",
                "price_1T6dHOL47U80vDLARSODO7b1": "enterprise",
                # Duplicate product set (monthly)
                "price_1T7p1sL47U80vDLAgU2shcQO": "starter",
                "price_1T7p1tL47U80vDLAVC0N4N4J": "pro",
                "price_1T7p1uL47U80vDLA9QF62BKS": "teams",
                "price_1T7p1uL47U80vDLAR4Wk6uW0": "enterprise",
                # Duplicate product set (annual)
                "price_1T7p1sL47U80vDLAYEEv8Kmg": "starter",
                "price_1T7p1tL47U80vDLAk5HK8YcR": "pro",
                "price_1T7p1uL47U80vDLAjlnLTuul": "teams",
                "price_1T7p1uL47U80vDLAk9UA0lnr": "enterprise",
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
            # Don't downgrade immediately — Stripe retries automatically
            
        else:
            print(f"[Stripe Webhook] Unhandled event type: {event_type}")
    
    except Exception as e:
        print(f"[Stripe Webhook] Error processing {event_type}: {e}")
        # Return 200 anyway to prevent Stripe retries on our errors
    
    return JSONResponse({"received": True})


# ============================================
# MEDICAL SUITE API ENDPOINTS
# ============================================

@app.get("/api/medical/icd10")
async def medical_icd10(q: str = "", request: Request = None):
    """ICD-10 code lookup via NLM API"""
    if not q:
        return JSONResponse({"results": []})
    try:
        # Use NLM's ICD-10 API
        url = f"https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?sf=code,name&terms={q}&maxList=20"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            data = resp.json()
        
        results = []
        if len(data) >= 4 and data[3]:
            for item in data[3]:
                if len(item) >= 2:
                    results.append({
                        "code": item[0],
                        "description": item[1],
                        "name": item[1],
                        "billable": "." in item[0] if item[0] else False,
                        "category": item[0][:3] if item[0] else ""
                    })
        return JSONResponse({"results": results})
    except Exception as e:
        # Fallback: use Tavily for medical search
        try:
            tavily_key = os.environ.get("TAVILY_API_KEY", "")
            if tavily_key:
                async with httpx.AsyncClient(timeout=15) as client:
                    resp = await client.post("https://api.tavily.com/search", json={
                        "api_key": tavily_key,
                        "query": f"ICD-10 code for {q}",
                        "search_depth": "basic",
                        "include_answer": True,
                        "max_results": 5
                    })
                    tdata = resp.json()
                    answer = tdata.get("answer", "")
                    return JSONResponse({"results": [{"code": q.upper(), "description": answer or f"Search results for: {q}", "name": answer, "billable": False, "category": "Search"}]})
        except:
            pass
        return JSONResponse({"results": [{"code": "ERR", "description": f"Search for '{q}' — API temporarily unavailable", "name": q, "billable": False, "category": ""}]})


@app.get("/api/medical/npi")
async def medical_npi(q: str = "", state: str = "", type: str = "", request: Request = None):
    """NPI Registry search via NPPES API"""
    if not q:
        return JSONResponse({"results": []})
    try:
        params = {"version": "2.1", "limit": 20}
        # Check if query is an NPI number
        if q.isdigit() and len(q) == 10:
            params["number"] = q
        else:
            # Try as name
            parts = q.strip().split()
            if len(parts) >= 2:
                params["first_name"] = parts[0] + "*"
                params["last_name"] = parts[-1] + "*"
            else:
                params["last_name"] = q + "*"
        
        if state:
            params["state"] = state
        if type:
            params["enumeration_type"] = f"NPI-{type}"
        
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get("https://npiregistry.cms.hhs.gov/api/", params=params)
            data = resp.json()
        
        results = []
        for r in (data.get("results") or [])[:20]:
            basic = r.get("basic", {})
            addresses = r.get("addresses", [{}])
            addr = addresses[0] if addresses else {}
            taxonomies = r.get("taxonomies", [{}])
            tax = taxonomies[0] if taxonomies else {}
            
            name = basic.get("organization_name") or f"{basic.get('first_name', '')} {basic.get('last_name', '')}".strip()
            results.append({
                "number": str(r.get("number", "")),
                "npi": str(r.get("number", "")),
                "name": name,
                "first_name": basic.get("first_name", ""),
                "last_name": basic.get("last_name", ""),
                "type": "Organization" if basic.get("organization_name") else "Individual",
                "enumeration_type": r.get("enumeration_type", ""),
                "specialty": tax.get("desc", ""),
                "taxonomy_description": tax.get("desc", ""),
                "address": addr.get("address_1", ""),
                "city": addr.get("city", ""),
                "state": addr.get("state", ""),
                "zip": addr.get("postal_code", "")[:5] if addr.get("postal_code") else "",
                "phone": addr.get("telephone_number", "")
            })
        
        return JSONResponse({"results": results})
    except Exception as e:
        return JSONResponse({"results": [], "error": str(e)})


@app.get("/api/medical/drugs")
async def medical_drugs(q: str = "", request: Request = None):
    """Drug lookup via openFDA API"""
    if not q:
        return JSONResponse({"results": []})
    try:
        url = f"https://api.fda.gov/drug/label.json?search=openfda.brand_name:{q}+openfda.generic_name:{q}&limit=10"
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url)
            data = resp.json()
        
        results = []
        for item in (data.get("results") or []):
            openfda = item.get("openfda", {})
            results.append({
                "brand_name": (openfda.get("brand_name") or [""])[0],
                "generic_name": (openfda.get("generic_name") or [""])[0],
                "name": (openfda.get("brand_name") or openfda.get("generic_name") or ["Unknown"])[0],
                "drug_class": (openfda.get("pharm_class_epc") or [""])[0],
                "route": (openfda.get("route") or [""])[0],
                "manufacturer": (openfda.get("manufacturer_name") or [""])[0]
            })
        
        return JSONResponse({"results": results})
    except Exception as e:
        # Fallback to simple search
        return JSONResponse({"results": [{"name": q, "brand_name": q, "generic_name": "", "drug_class": "Search results", "route": "", "manufacturer": ""}]})


@app.post("/api/auth/avatar")
async def upload_avatar(request: Request):
    """Handle avatar upload — persists to Supabase profiles.avatar_url."""
    try:
        # Get authenticated user
        auth_header = request.headers.get("authorization", "")
        user = await get_current_user(auth_header if auth_header else None)
        
        form = await request.form()
        avatar_file = form.get("avatar")
        if not avatar_file:
            return JSONResponse({"error": "No file provided"}, status_code=400)
        
        # Read file data
        content = await avatar_file.read()
        if len(content) > 5 * 1024 * 1024:
            return JSONResponse({"error": "File too large (max 5MB)"}, status_code=400)
        
        # Convert to base64 data URL
        import base64
        b64 = base64.b64encode(content).decode()
        content_type = avatar_file.content_type or "image/png"
        data_url = f"data:{content_type};base64,{b64}"
        
        # Persist to Supabase profiles table
        if user and user.get("id") and supabase_admin:
            try:
                supabase_admin.table("profiles").update(
                    {"avatar_url": data_url}
                ).eq("id", user["id"]).execute()
                print(f"[Avatar] Saved to Supabase for user {user['id'][:8]}...")
            except Exception as db_err:
                print(f"[Avatar] Supabase save error (non-fatal): {db_err}")
        
        return JSONResponse({"avatar_url": data_url, "success": True})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/studio/publish/github")
async def studio_publish_github(request: Request):
    """Publish project files to GitHub via the Contents API."""
    import base64 as _b64
    GITHUB_PAT = os.environ.get("GITHUB_PAT", "") or os.environ.get("GITHUB_PRIVATE_ACCESS_TOKEN", "")
    GITHUB_ORG = "SaintVisions-SaintSal"
    if not GITHUB_PAT:
        return JSONResponse({"error": "GITHUB_PAT not configured on server"}, status_code=500)
    try:
        body = await request.json()
        files = body.get("files", [])
        project = body.get("project") or {}
        repo_name = (project.get("name") or "saintsallabs-project").lower().replace(" ", "-").replace("_", "-")
        description = project.get("description") or "SaintSal Labs generated project"

        headers = {
            "Authorization": f"Bearer {GITHUB_PAT}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        async with httpx.AsyncClient(timeout=30) as client:
            # 1. Ensure repo exists (create if missing)
            repo_url = f"https://api.github.com/repos/{GITHUB_ORG}/{repo_name}"
            repo_resp = await client.get(repo_url, headers=headers)
            if repo_resp.status_code == 404:
                # SaintVisions-SaintSal is a user account, not an org — use /user/repos
                create_resp = await client.post(
                    "https://api.github.com/user/repos",
                    headers=headers,
                    json={"name": repo_name, "description": description, "private": False, "auto_init": True},
                )
                if create_resp.status_code not in (201, 200):
                    return JSONResponse({"error": f"Failed to create repo: {create_resp.text}"}, status_code=500)
                repo_data = create_resp.json()
            else:
                repo_data = repo_resp.json()

            repo_html_url = repo_data.get("html_url", f"https://github.com/{GITHUB_ORG}/{repo_name}")

            # 2. Push each file using Contents API
            pushed = []
            errors = []
            for f in files:
                fname = f.get("name") or "file.txt"
                content = f.get("content") or ""
                encoded = _b64.b64encode(content.encode("utf-8")).decode("utf-8")
                file_url = f"https://api.github.com/repos/{GITHUB_ORG}/{repo_name}/contents/{fname}"

                # Check if file already exists (need its SHA to update)
                existing = await client.get(file_url, headers=headers)
                payload = {
                    "message": f"feat: update {fname} via SaintSal Labs builder",
                    "content": encoded,
                }
                if existing.status_code == 200:
                    payload["sha"] = existing.json().get("sha", "")

                put_resp = await client.put(file_url, headers=headers, json=payload)
                if put_resp.status_code in (200, 201):
                    pushed.append(fname)
                else:
                    errors.append(f"{fname}: {put_resp.text}")

            if errors:
                return JSONResponse({"success": False, "url": repo_html_url, "errors": errors, "pushed": pushed})
            return JSONResponse({"success": True, "url": repo_html_url, "message": f"Pushed {len(pushed)} file(s) to {repo_html_url}"})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/studio/publish/vercel")
async def studio_publish_vercel(request: Request):
    """Deploy project to Vercel using the Vercel API v13."""
    import base64 as _b64
    VERCEL_TOKEN = os.environ.get("VERCEL_API_ACCESS_TOKEN", "")
    try:
        body = await request.json()
        files = body.get("files", [])
        project = body.get("project") or {}
        project_name = (project.get("name") or "saintsal-project").lower().replace(" ", "-")

        if not VERCEL_TOKEN:
            return JSONResponse({"error": "VERCEL_API_ACCESS_TOKEN not configured"}, status_code=500)

        # Format files for Vercel API v13
        vercel_files = []
        for f in files:
            fname = f.get("name") or "file.txt"
            content = f.get("content") or ""
            vercel_files.append({
                "file": fname,
                "data": content,
                "encoding": "utf-8"
            })

        if not vercel_files:
            vercel_files.append({
                "file": "index.html",
                "data": "<html><body><h1>SaintSal Labs</h1></body></html>",
                "encoding": "utf-8"
            })

        payload = {
            "name": project_name,
            "files": vercel_files,
            "target": "production",
            "projectSettings": {
                "framework": None
            }
        }

        headers = {
            "Authorization": f"Bearer {VERCEL_TOKEN}",
            "Content-Type": "application/json"
        }

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.vercel.com/v13/deployments",
                json=payload,
                headers=headers
            )
            if resp.status_code not in (200, 201):
                return JSONResponse({"error": f"Vercel API error {resp.status_code}: {resp.text}"}, status_code=502)
            data = resp.json()
            deploy_url = data.get("url") or data.get("alias", [""])[0] if data.get("alias") else ""
            if deploy_url and not deploy_url.startswith("http"):
                deploy_url = f"https://{deploy_url}"
            final_url = deploy_url or f"https://{project_name}.vercel.app"
            custom_domain = project.get("custom_domain", "")
            dns_instructions = None
            if custom_domain:
                dns_instructions = {
                    "domain": custom_domain,
                    "records": [
                        {"type": "A", "name": "@", "value": "76.76.21.21", "note": f"Points {custom_domain} to Vercel"},
                        {"type": "CNAME", "name": "www", "value": "cname.vercel-dns.com", "note": f"Points www.{custom_domain} to Vercel"},
                    ],
                    "instructions": f"Add these DNS records at your domain registrar to connect {custom_domain} and www.{custom_domain} to your Vercel deployment."
                }
            return JSONResponse({
                "success": True,
                "url": final_url,
                "deploymentId": data.get("id", ""),
                "message": f"Deployed to Vercel: {final_url}",
                "dns": dns_instructions,
            })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/studio/publish/render")
async def studio_publish_render(request: Request):
    """Deploy project to Render by pushing files to GitHub then triggering Render auto-deploy."""
    import base64 as _b64
    GITHUB_PAT = os.environ.get("GITHUB_PAT", "") or os.environ.get("GITHUB_PRIVATE_ACCESS_TOKEN", "")
    GITHUB_ORG = "SaintVisions-SaintSal"
    RENDER_API_KEY = os.environ.get("RENDER_API_KEY", "")
    if not GITHUB_PAT:
        return JSONResponse({"error": "GITHUB_PAT not configured on server"}, status_code=500)
    try:
        body = await request.json()
        files = body.get("files", [])
        project = body.get("project") or {}
        repo_name = (project.get("name") or "saintsallabs-render").lower().replace(" ", "-").replace("_", "-")
        description = project.get("description") or "SaintSal Labs Render deployment"

        gh_headers = {
            "Authorization": f"Bearer {GITHUB_PAT}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        async with httpx.AsyncClient(timeout=30) as client:
            # Step 1: Ensure GitHub repo exists
            repo_url = f"https://api.github.com/repos/{GITHUB_ORG}/{repo_name}"
            repo_resp = await client.get(repo_url, headers=gh_headers)
            if repo_resp.status_code == 404:
                # SaintVisions-SaintSal is a user account, not an org — use /user/repos
                create_resp = await client.post(
                    "https://api.github.com/user/repos",
                    headers=gh_headers,
                    json={"name": repo_name, "description": description, "private": False, "auto_init": True},
                )
                if create_resp.status_code not in (201, 200):
                    return JSONResponse({"error": f"Failed to create GitHub repo: {create_resp.text}"}, status_code=500)
                repo_data = create_resp.json()
            else:
                repo_data = repo_resp.json()

            repo_html_url = repo_data.get("html_url", f"https://github.com/{GITHUB_ORG}/{repo_name}")
            clone_url = repo_data.get("clone_url", f"https://github.com/{GITHUB_ORG}/{repo_name}.git")

            # Step 2: Push files to GitHub
            for f in files:
                fname = f.get("name") or "file.txt"
                content = f.get("content") or ""
                encoded = _b64.b64encode(content.encode("utf-8")).decode("utf-8")
                file_url = f"https://api.github.com/repos/{GITHUB_ORG}/{repo_name}/contents/{fname}"
                existing = await client.get(file_url, headers=gh_headers)
                payload = {"message": f"deploy: update {fname}", "content": encoded}
                if existing.status_code == 200:
                    payload["sha"] = existing.json().get("sha", "")
                await client.put(file_url, headers=gh_headers, json=payload)

            # Step 3: Use Render API to create/update a static site service
            render_headers = {
                "Authorization": f"Bearer {RENDER_API_KEY}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            }

            # List existing services to check if one already exists for this repo
            services_resp = await client.get("https://api.render.com/v1/services?limit=20", headers=render_headers)
            deploy_url = f"https://saintsallabs-platform.onrender.com"
            service_id = None

            if services_resp.status_code == 200:
                services = services_resp.json()
                for svc in services:
                    svc_obj = svc.get("service", svc)
                    svc_repo = (svc_obj.get("repo") or "").rstrip(".git")
                    if repo_name in svc_repo or svc_obj.get("name") == repo_name:
                        service_id = svc_obj.get("id")
                        deploy_url = svc_obj.get("serviceDetails", {}).get("url") or deploy_url
                        break

            if service_id:
                # Trigger manual deploy on existing service
                deploy_resp = await client.post(
                    f"https://api.render.com/v1/services/{service_id}/deploys",
                    headers=render_headers,
                    json={"clearCache": "do_not_clear"},
                )
            else:
                # Create new static site on Render
                create_payload = {
                    "type": "static_site",
                    "name": repo_name,
                    "ownerId": None,
                    "repo": clone_url,
                    "branch": "main",
                    "autoDeploy": "yes",
                    "staticSiteDetails": {"publishPath": "/"},
                }
                deploy_resp = await client.post(
                    "https://api.render.com/v1/services",
                    headers=render_headers,
                    json=create_payload,
                )
                if deploy_resp.status_code in (200, 201):
                    svc_data = deploy_resp.json()
                    svc_obj = svc_data.get("service", svc_data)
                    deploy_url = svc_obj.get("serviceDetails", {}).get("url") or deploy_url

            return JSONResponse({
                "success": True,
                "url": deploy_url,
                "github_url": repo_html_url,
                "message": f"Files pushed to GitHub and Render deploy triggered. Visit {deploy_url}"
            })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/studio/publish/download")
async def studio_publish_download(request: Request):
    """Create and return a ZIP archive of project files in-memory."""
    import zipfile
    import io
    try:
        body = await request.json()
        files = body.get("files", [])
        project = body.get("project") or {}
        zip_name = (project.get("name") or "project").lower().replace(" ", "-") + ".zip"

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            if not files:
                # Provide a placeholder so the ZIP is not empty
                zf.writestr("README.md", "# SaintSal Labs Project\n\nNo files were generated yet. Use the builder to generate code first.\n")
            else:
                for f in files:
                    fname = f.get("name") or "file.txt"
                    content = f.get("content") or ""
                    zf.writestr(fname, content)
        buf.seek(0)

        return StreamingResponse(
            buf,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{zip_name}"'},
        )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

# ── GoDaddy Domain Endpoints ────────────────────────────────────────────────

@app.get("/api/godaddy/available/{domain}")
async def godaddy_domain_available(domain: str):
    """Check real-time domain availability via GoDaddy API."""
    GODADDY_KEY = GODADDY_API_KEY or os.environ.get("GODADDY_API_KEY", "")
    GODADDY_SECRET = GODADDY_API_SECRET or os.environ.get("GODADDY_API_SECRET", "")
    try:
        if not GODADDY_KEY or not GODADDY_SECRET:
            return JSONResponse({"error": "GoDaddy API credentials not configured"}, status_code=500)
        headers = {
            "Authorization": f"sso-key {GODADDY_KEY}:{GODADDY_SECRET}",
            "Accept": "application/json"
        }
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"https://api.godaddy.com/v1/domains/available?domain={domain}&checkType=FAST",
                headers=headers
            )
            if resp.status_code != 200:
                return JSONResponse({"error": f"GoDaddy API error {resp.status_code}: {resp.text}"}, status_code=502)
            data = resp.json()
            return JSONResponse({
                "domain": domain,
                "available": data.get("available", False),
                "price": data.get("price"),
                "currency": data.get("currency", "USD"),
                "period": data.get("period", 1),
                "raw": data
            })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/godaddy/purchase")
async def godaddy_purchase_domain(request: Request):
    """Purchase a domain via GoDaddy API."""
    GODADDY_KEY = GODADDY_API_KEY or os.environ.get("GODADDY_API_KEY", "")
    GODADDY_SECRET = GODADDY_API_SECRET or os.environ.get("GODADDY_API_SECRET", "")
    try:
        body = await request.json()
        domain = body.get("domain", "")
        period = int(body.get("period", 1))
        privacy = bool(body.get("privacy", False))

        if not domain:
            return JSONResponse({"error": "domain is required"}, status_code=400)
        if not GODADDY_KEY or not GODADDY_SECRET:
            return JSONResponse({"error": "GoDaddy API credentials not configured"}, status_code=500)

        headers = {
            "Authorization": f"sso-key {GODADDY_KEY}:{GODADDY_SECRET}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

        default_contact = {
            "addressMailing": {
                "address1": "123 Main St",
                "city": "Los Angeles",
                "country": "US",
                "postalCode": "90001",
                "state": "CA"
            },
            "email": "admin@saintsallabs.com",
            "nameFirst": "SaintSal",
            "nameLast": "Labs",
            "phone": "+1.3105550100"
        }

        payload = {
            "consent": {
                "agreedAt": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "agreedBy": "127.0.0.1",
                "agreementKeys": ["DNRA"]
            },
            "contactAdmin": default_contact,
            "contactBilling": default_contact,
            "contactRegistrant": default_contact,
            "contactTech": default_contact,
            "domain": domain,
            "nameServers": [],
            "period": period,
            "privacy": privacy,
            "renewAuto": True
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.godaddy.com/v1/domains/purchase",
                json=payload,
                headers=headers
            )
            if resp.status_code not in (200, 201, 202):
                return JSONResponse({"error": f"GoDaddy purchase error {resp.status_code}: {resp.text}"}, status_code=502)
            data = resp.json()
            return JSONResponse({
                "success": True,
                "domain": domain,
                "orderId": data.get("orderId"),
                "itemCount": data.get("itemCount"),
                "total": data.get("total"),
                "currency": data.get("currency", "USD"),
                "message": f"Domain {domain} purchased successfully",
                "raw": data
            })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# ── Social Media Publishing Endpoint ────────────────────────────────────────

@app.post("/api/social/publish")
async def social_publish(request: Request):
    """v7.36.1 — Real social publishing. Checks per-user OAuth tokens first, then env vars."""
    try:
        body = await request.json()
        platform = (body.get("platform") or "twitter").lower()
        content = body.get("content") or ""
        media_url = body.get("media_url") or ""

        # v7.36.1 — Check for per-user OAuth token in Supabase
        auth_header = request.headers.get("authorization", "")
        user = await get_current_user(auth_header if auth_header else None)
        user_token = None
        if user and supabase_admin:
            try:
                token_result = supabase_admin.table("social_tokens").select("*").eq(
                    "user_id", user["id"]
                ).eq("platform", platform).eq("is_active", True).single().execute()
                if token_result.data:
                    user_token = token_result.data
                    # Check expiry
                    if user_token.get("expires_at"):
                        from dateutil.parser import parse as dt_parse
                        try:
                            if dt_parse(user_token["expires_at"]) < datetime.now(dt_parse(user_token["expires_at"]).tzinfo or None):
                                user_token = None  # Token expired
                        except Exception:
                            pass
            except Exception:
                pass  # No per-user token found

        PLATFORM_CONFIG = {
            "twitter": {
                "name": "X (Twitter)", "char_limit": 280,
                "env_keys": ["TWITTER_ACCESS_TOKEN", "TWITTER_ACCESS_SECRET"],  # Minimum needed (Bearer or OAuth 1.0a)
                "connect_url": "https://developer.twitter.com/en/portal/dashboard",
            },
            "linkedin": {
                "name": "LinkedIn", "char_limit": 3000,
                "env_keys": ["LINKEDIN_ACCESS_TOKEN"],
                "connect_url": "https://www.linkedin.com/developers/apps",
            },
            "facebook": {
                "name": "Facebook", "char_limit": 63206,
                "env_keys": ["FACEBOOK_PAGE_TOKEN", "FACEBOOK_PAGE_ID"],
                "connect_url": "https://developers.facebook.com/apps",
            },
            "instagram": {
                "name": "Instagram", "char_limit": 2200,
                "env_keys": ["INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_BUSINESS_ID"],
                "connect_url": "https://developers.facebook.com/apps",
            },
        }

        config = PLATFORM_CONFIG.get(platform, PLATFORM_CONFIG["twitter"])
        # Per-user OAuth token takes priority over env vars
        is_connected = bool(user_token) or all(bool(os.environ.get(k, "")) for k in config["env_keys"])
        token_source = "user_oauth" if user_token else "env_vars"
        formatted = content[:config["char_limit"]]
        published = False
        post_url = ""
        post_id = ""
        api_error = ""

        # ── REAL PUBLISH: Actually POST to platform API when credentials exist ──
        if is_connected:
            try:
                async with httpx.AsyncClient(timeout=30) as hc:
                    if platform == "twitter":
                        if user_token:
                            # v7.36.1 — Per-user OAuth 2.0 Bearer token (from social_tokens)
                            resp = await hc.post("https://api.twitter.com/2/tweets",
                                headers={"Authorization": f"Bearer {user_token['access_token']}", "Content-Type": "application/json"},
                                json={"text": formatted})
                            if resp.status_code in (200, 201):
                                data = resp.json()
                                post_id = data.get("data", {}).get("id", "")
                                post_url = f"https://x.com/i/status/{post_id}" if post_id else ""
                                published = True
                            else:
                                api_error = f"Twitter API {resp.status_code}: {resp.text[:200]}"
                        else:
                            # Fallback: Env-var OAuth 1.0a — POST /2/tweets
                            # Requires all 4 OAuth 1.0a credentials to sign requests
                            import hashlib, hmac, time as _time, urllib.parse, base64, uuid as _uuid
                            _tw_api_key = os.environ.get("TWITTER_API_KEY", "")
                            _tw_api_secret = os.environ.get("TWITTER_API_SECRET", "")
                            _tw_access_token = os.environ.get("TWITTER_ACCESS_TOKEN", "")
                            _tw_access_secret = os.environ.get("TWITTER_ACCESS_SECRET", "")
                            if not _tw_api_key or not _tw_api_secret:
                                # Consumer credentials missing — OAuth 1.0a signing impossible.
                                # Bearer token (app-only) cannot POST tweets.
                                # User must connect via OAuth or provide consumer key/secret.
                                api_error = "Twitter publish requires OAuth login. Please connect your Twitter account in Social settings."
                            elif not _tw_access_token or not _tw_access_secret:
                                api_error = "Twitter access tokens missing. Please connect your Twitter account in Social settings."
                            else:
                                url = "https://api.twitter.com/2/tweets"
                                method = "POST"
                                nonce = _uuid.uuid4().hex
                                timestamp = str(int(_time.time()))
                                oauth_params = {
                                    "oauth_consumer_key": _tw_api_key,
                                    "oauth_nonce": nonce,
                                    "oauth_signature_method": "HMAC-SHA1",
                                    "oauth_timestamp": timestamp,
                                    "oauth_token": _tw_access_token,
                                    "oauth_version": "1.0",
                                }
                                param_str = "&".join(f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(v, safe='')}" for k, v in sorted(oauth_params.items()))
                                base_str = f"{method}&{urllib.parse.quote(url, safe='')}&{urllib.parse.quote(param_str, safe='')}"
                                signing_key = f"{urllib.parse.quote(_tw_api_secret, safe='')}&{urllib.parse.quote(_tw_access_secret, safe='')}"
                                sig = base64.b64encode(hmac.new(signing_key.encode(), base_str.encode(), hashlib.sha1).digest()).decode()
                                oauth_params["oauth_signature"] = sig
                                auth_header = "OAuth " + ", ".join(f'{k}="{urllib.parse.quote(v, safe="")}"' for k, v in sorted(oauth_params.items()))
                                resp = await hc.post(url, headers={"Authorization": auth_header, "Content-Type": "application/json"}, json={"text": formatted})
                                if resp.status_code in (200, 201):
                                    data = resp.json()
                                    post_id = data.get("data", {}).get("id", "")
                                    post_url = f"https://x.com/i/status/{post_id}" if post_id else ""
                                    published = True
                                else:
                                    api_error = f"Twitter API {resp.status_code}: {resp.text[:200]}"

                    elif platform == "linkedin":
                        # LinkedIn — POST /v2/ugcPosts
                        li_token = user_token["access_token"] if user_token else os.environ.get("LINKEDIN_ACCESS_TOKEN", "")
                        if not li_token:
                            api_error = "LinkedIn publish requires OAuth login. Please connect your LinkedIn account in Social settings."
                        else:
                            # Get user URN first
                            me_resp = await hc.get("https://api.linkedin.com/v2/me", headers={"Authorization": f"Bearer {li_token}"})
                            person_id = ""
                            if me_resp.status_code == 200:
                                person_id = me_resp.json().get("id", "")
                            if person_id:
                                payload = {
                                    "author": f"urn:li:person:{person_id}",
                                    "lifecycleState": "PUBLISHED",
                                    "specificContent": {
                                        "com.linkedin.ugc.ShareContent": {
                                            "shareCommentary": {"text": formatted},
                                            "shareMediaCategory": "NONE"
                                        }
                                    },
                                    "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"}
                                }
                                resp = await hc.post("https://api.linkedin.com/v2/ugcPosts",
                                    headers={"Authorization": f"Bearer {li_token}", "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0"},
                                    json=payload)
                                if resp.status_code in (200, 201):
                                    post_id = resp.json().get("id", resp.headers.get("x-restli-id", ""))
                                    post_url = f"https://www.linkedin.com/feed/update/{post_id}" if post_id else ""
                                    published = True
                                else:
                                    api_error = f"LinkedIn API {resp.status_code}: {resp.text[:200]}"
                            else:
                                api_error = "Could not retrieve LinkedIn profile. Please reconnect your LinkedIn account."

                    elif platform == "facebook":
                        # Facebook — POST /{page-id}/feed
                        page_token = user_token["access_token"] if user_token else os.environ.get("FACEBOOK_PAGE_TOKEN", "")
                        page_id = (user_token or {}).get("platform_user_id") or os.environ.get("FACEBOOK_PAGE_ID", "")
                        if not page_token or not page_id:
                            api_error = "Facebook publish requires Page Token and Page ID. Please connect your Facebook account in Social settings."
                        else:
                            resp = await hc.post(f"https://graph.facebook.com/v18.0/{page_id}/feed",
                                data={"message": formatted, "access_token": page_token})
                            if resp.status_code == 200:
                                data = resp.json()
                                post_id = data.get("id", "")
                                post_url = f"https://www.facebook.com/{post_id}" if post_id else ""
                                published = True
                            else:
                                api_error = f"Facebook API {resp.status_code}: {resp.text[:200]}"

            except Exception as pub_err:
                api_error = str(pub_err)
                print(f"[Social Publish] {platform} error: {pub_err}")

        result = {
            "success": True,
            "connected": is_connected,
            "published": published,
            "platform": platform,
            "platform_name": config["name"],
            "formatted_content": formatted,
            "char_limit": config["char_limit"],
            "char_count": len(content),
            "media_url": media_url,
            "post_url": post_url,
            "post_id": post_id,
            "connect_url": config["connect_url"],
            "token_source": token_source if is_connected else None,
            "status": "published" if published else ("error" if api_error else "formatted"),
            "message": (
                f"Published to {config['name']}! {post_url}" if published
                else f"Publish failed: {api_error}" if api_error
                else f"Content formatted for {config['name']}. Connect your account to auto-publish."
            ),
        }
        if api_error:
            result["api_error"] = api_error
        return JSONResponse(result)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# ── Builder In-Memory Project Store ─────────────────────────────────────────
_builder_projects: dict = {}


# ── v7.27.0 UNIFIED BUILDER CHAT — One Chat, Full AI Orchestration ─────────

BUILDER_CHAT_SYSTEM = """You are SAL™, the AI Builder Engine for SaintSal™ Labs. You are an elite full-stack AI that EXECUTES — you never give guides or directions.

## YOUR CAPABILITIES:
- **Images**: Generate images (DALL-E 3, Grok Imagine) — logos, banners, product shots, social graphics
- **Video**: Create video storyboards and scenes
- **Audio/TTS**: Generate speech and voiceovers (ElevenLabs)
- **Code**: Build full-stack web apps, landing pages, PWAs, widgets, APIs — complete working code
- **Design**: Create UI designs and prototypes (Google Stitch)
- **Social Media**: Generate platform-optimized posts with images, captions, hashtags
- **Documents**: Generate professional documents, presentations, reports
- **Deploy**: Push code to GitHub, deploy to Vercel or Render, download as ZIP
- **Research**: Deep web research using Perplexity + Tavily

## HOW YOU RESPOND:
- For IMAGE requests: Generate the image and return it inline. No placeholders.
- For CODE requests: Write complete, production-ready code. All files.
- For SOCIAL requests: Generate image + caption + hashtags for the platform.
- For DEPLOY requests: Push code and return the live URL.
- For RESEARCH: Search the web and return real, cited results.
- For GENERAL CHAT: Answer like the smartest engineer in the room.

## RULES:
1. NEVER say "I can't" — you CAN. You have ALL the APIs.
2. NEVER give instructions to the user on how to do something — YOU DO IT.
3. Respond conversationally but execute immediately.
4. When generating code, output ALL files in a JSON block: ```json\n{"files": [{"name": "index.html", "content": "..."}, ...]}\n```
5. Keep responses concise but complete.
"""

# v7.36.0 — Full-stack multi-page builder system prompt
BUILDER_CODE_SYSTEM = """You are SAL™ Builder — the AI-powered full-stack web builder behind SaintSal™ Labs.
You are an expert web developer and designer. You BUILD things. You do NOT plan or discuss — you BUILD.

## CRITICAL RULE: ALWAYS OUTPUT CODE
Your response MUST contain a JSON code block with files. NEVER respond with just text, questions, or descriptions.
Even if the request is vague like "build me a website", make smart assumptions and BUILD IT.

## OUTPUT FORMAT (MANDATORY):
Your ENTIRE response must be a valid JSON block:

```json
{"files": [{"name": "index.html", "content": "<!DOCTYPE html>...FULL HTML..."}, {"name": "styles.css", "content": "...FULL CSS..."}, {"name": "script.js", "content": "...FULL JS..."}]}
```

Do NOT include any text before or after the JSON block. Just the JSON.

## WHEN ITERATING (follow-up messages):
When the user says "add", "change", "update", "fix", etc.:
- Output ONLY the files that changed with their COMPLETE updated content
- Do NOT regenerate unchanged files
- Same JSON format

## MULTI-PAGE RULES (CRITICAL):
- Every HTML page MUST include a consistent <nav> header linking to ALL other pages
- Navigation links use relative paths: href="index.html", href="about.html", href="contact.html"
- ALL pages share one styles.css via <link rel="stylesheet" href="styles.css">
- ALL pages share one script.js via <script src="script.js"></script>
- Each page is a COMPLETE standalone HTML document with <!DOCTYPE html>, <head>, <body>
- Navigation highlights the current active page
- Include a responsive mobile hamburger menu in the shared JS
- Minimum pages for any website: Home (index.html), About, Contact
- For businesses: add Services/Menu/Products page
- For apps: add Dashboard, Settings pages

## DESIGN STANDARDS:
- Modern, polished, PREMIUM design — NOT generic Bootstrap
- Clean aesthetic with gradients, glassmorphism, smooth animations
- Fully responsive: mobile-first, works at 375px, 768px, 1440px
- Professional typography via Google Fonts CDN (Inter, Poppins, or Playfair Display)
- Micro-interactions: hover effects, focus rings, smooth transitions
- Accessibility: semantic HTML, ARIA labels, keyboard nav
- Use CSS custom properties for theming (--primary, --secondary, --accent)
- Hero sections with compelling CTAs
- Proper spacing, visual hierarchy, contrast ratios

## STITCH INTEGRATION:
If the user mentions "design", "stitch", or "UI design", you can suggest using Google Stitch for interactive prototyping before building.

## CODE RULES (NON-NEGOTIABLE):
1. ALWAYS output a JSON code block with files. NEVER output plain text.
2. NEVER use placeholder comments like "// TODO" or "Lorem ipsum" for main content.
3. Every file MUST have FULL working content — no truncation.
4. Code MUST work when rendered in a browser iframe immediately.
5. Always include meta viewport, charset, title tags.
6. Minimum 4 files for any website build.
7. Forms must have validation and visual feedback.
8. All interactive elements need hover/focus/active states.
9. Images use placeholder services (unsplash source URLs or gradient backgrounds).
10. Include smooth scroll behavior and page transition effects.
"""

# v7.36.0 — Retry prompt when AI returns a plan instead of code
BUILDER_CODE_RETRY = """STOP. You returned a plan/outline instead of actual code. That is WRONG.

You MUST output ACTUAL WORKING CODE in a JSON block. Multiple files. Full content. No descriptions.

```json
{"files": [
  {"name": "index.html", "content": "<!DOCTYPE html>...COMPLETE HTML..."},
  {"name": "styles/main.css", "content": "...COMPLETE CSS..."},
  {"name": "js/app.js", "content": "...COMPLETE JS..."},
  {"name": "about.html", "content": "...COMPLETE HTML..."},
  {"name": "contact.html", "content": "...COMPLETE HTML..."}
]}
```

For ANY website or app: output AT LEAST 5 files with FULL production code.
Shared navigation across pages. Responsive design. Working forms. Real content.
No placeholders. No TODOs. No descriptions. Just CODE.

Original request: """

# v7.36.0 — Tier-gated feature access matrix (matches architecture doc)
TIER_FEATURES = {
    "free": {
        "models": ["claude_haiku", "gemini_flash", "gpt5_fast", "grok3_mini"],
        "builder_code": "basic",  # v7.41.0 — Allow basic code gen for free tier so Builder actually works
        "builder_image": False,
        "builder_video": False,
        "builder_audio": False,
        "builder_deploy_vercel": False,
        "builder_deploy_render": False,
        "builder_deploy_cloudflare": False,
        "builder_github": False,
        "builder_custom_domains": False,
        "voice_ai": False,
        "career_suite": False,
        "rag_knowledge": False,
        "search": True,
        "compute_minutes": 100,
    },
    "starter": {
        "models": ["claude_haiku", "claude_sonnet", "gemini_flash", "gemini_pro", "gpt5_fast", "gpt5_core", "grok3_mini", "grok3_biz"],
        "builder_code": "basic",  # Basic code gen only
        "builder_image": False,
        "builder_video": False,
        "builder_audio": False,
        "builder_deploy_vercel": False,
        "builder_deploy_render": False,
        "builder_deploy_cloudflare": False,
        "builder_github": True,
        "builder_custom_domains": False,
        "voice_ai": False,
        "career_suite": False,
        "rag_knowledge": False,
        "search": True,
        "compute_minutes": 500,
    },
    "pro": {
        "models": ["claude_haiku", "claude_sonnet", "claude_opus", "gemini_flash", "gemini_pro", "gemini_deep", "gpt5_fast", "gpt5_core", "gpt5_extended", "grok3_mini", "grok3_biz"],
        "builder_code": "full",
        "builder_image": True,
        "builder_video": True,
        "builder_audio": True,
        "builder_deploy_vercel": True,
        "builder_deploy_render": False,
        "builder_deploy_cloudflare": False,
        "builder_github": True,
        "builder_custom_domains": False,
        "voice_ai": True,
        "career_suite": True,
        "rag_knowledge": True,
        "search": True,
        "compute_minutes": 2000,
    },
    "teams": {
        "models": ["claude_haiku", "claude_sonnet", "claude_opus", "claude_sonnet_parallel", "gemini_flash", "gemini_pro", "gemini_deep", "gpt5_fast", "gpt5_core", "gpt5_extended", "gpt5_batch", "grok3_mini", "grok3_biz", "grok3_parallel"],
        "builder_code": "full",
        "builder_image": True,
        "builder_video": True,
        "builder_audio": True,
        "builder_deploy_vercel": True,
        "builder_deploy_render": True,
        "builder_deploy_cloudflare": True,
        "builder_github": True,
        "builder_custom_domains": True,
        "voice_ai": True,
        "career_suite": True,
        "rag_knowledge": True,
        "ghl_crm": True,
        "search": True,
        "compute_minutes": 10000,
    },
    "enterprise": {
        "models": ["all"],
        "builder_code": "full",
        "builder_image": True,
        "builder_video": True,
        "builder_audio": True,
        "builder_deploy_vercel": True,
        "builder_deploy_render": True,
        "builder_deploy_cloudflare": True,
        "builder_github": True,
        "builder_custom_domains": True,
        "voice_ai": True,
        "career_suite": True,
        "rag_knowledge": True,
        "ghl_crm": True,
        "api_access": True,
        "white_label": True,
        "hacp_license": True,
        "search": True,
        "compute_minutes": -1,  # Unlimited
    },
}

# v7.36.0 — Map compute tier → model chain per architecture doc
TIER_MODEL_ROUTING = {
    "mini": {  # SAL Mini — Free + Starter
        "primary": {"id": "claude", "model": "claude-haiku-4-5-20251001", "max_tokens": 16000, "provider": "anthropic"},
        "fallback": [
            {"id": "gemini", "model": "gemini-2.0-flash", "max_tokens": 16000, "provider": "google"},
            {"id": "grok", "model": "grok-3-mini-beta", "max_tokens": 16000, "provider": "xai"},
        ]
    },
    "pro": {  # SAL Pro — Starter + Pro
        "primary": {"id": "claude", "model": "claude-sonnet-4-20250514", "max_tokens": 64000, "provider": "anthropic"},
        "fallback": [
            {"id": "gemini", "model": "gemini-2.5-pro", "max_tokens": 65536, "provider": "google"},
            {"id": "grok", "model": "grok-3-beta", "max_tokens": 32000, "provider": "xai"},
            {"id": "gpt", "model": "gpt-4.1", "max_tokens": 32768, "provider": "openai"},
        ]
    },
    "max": {  # SAL Max — Pro + Teams
        "primary": {"id": "claude", "model": "claude-opus-4-20250514", "max_tokens": 32000, "provider": "anthropic"},
        "fallback": [
            {"id": "gemini", "model": "gemini-2.5-pro", "max_tokens": 65536, "provider": "google"},
            {"id": "gpt", "model": "gpt-4.1", "max_tokens": 32768, "provider": "openai"},
        ]
    },
    "max_pro": {  # SAL Max Fast — Teams + Enterprise (parallel execution)
        "primary": {"id": "claude", "model": "claude-sonnet-4-20250514", "max_tokens": 64000, "provider": "anthropic"},
        "fallback": [
            {"id": "grok", "model": "grok-3-beta", "max_tokens": 32000, "provider": "xai"},
        ]
    },
}

def get_user_tier(request_body: dict, metering_user: dict = None) -> str:
    """Resolve user's subscription tier from body or metering profile."""
    # Frontend sends compute tier; map it or check profile
    compute_tier = request_body.get("compute_tier", "")
    if compute_tier in TIER_FEATURES:
        return compute_tier
    # From metering user profile
    if metering_user:
        return metering_user.get("tier", metering_user.get("plan_tier", "free"))
    return "free"

def check_feature_access(tier: str, feature: str) -> dict:
    """Check if a tier has access to a specific feature. Returns {allowed, reason, upgrade_to}."""
    features = TIER_FEATURES.get(tier, TIER_FEATURES["free"])
    val = features.get(feature)
    if val is True or val == "full":
        return {"allowed": True}
    if val == "basic":
        return {"allowed": True, "limited": True, "message": "Basic code generation only. Upgrade for full multi-page builder."}
    # Feature is locked — find the minimum tier that unlocks it
    upgrade_map = {}
    for t in ["starter", "pro", "teams", "enterprise"]:
        tf = TIER_FEATURES.get(t, {})
        if tf.get(feature) and tf[feature] is not False:
            upgrade_map[feature] = t
            break
    upgrade_to = upgrade_map.get(feature, "pro")
    return {"allowed": False, "reason": f"This feature requires {upgrade_to.title()} tier or above.", "upgrade_to": upgrade_to}



def _detect_builder_intent(message: str) -> str:
    """Detect what the user wants from their message. v8.0 — chat-first flow support."""
    import re as _re
    msg = message.lower().strip()
    
    # v8.0 — Iteration/follow-up detection (user is continuing a build)
    if any(w in msg for w in ['add a', 'change the', 'update the', 'fix the', 'make it', 'now add', 'can you add', 'modify', 'adjust the', 'move the', 'remove the', 'delete the', 'swap the', 'replace the', 'add more', 'change color', 'new page', 'add page', 'another page']):
        return 'code'
    
    # Image generation
    if any(w in msg for w in ['generate image', 'create image', 'make image', 'draw', 'logo', 'banner', 'illustration', 'picture of', 'photo of', 'graphic of', 'design a logo', 'make me a logo', 'generate a logo', 'create a graphic', 'make a banner', 'poster', 'icon design', 'album art', 'cover art', 'avatar', 'profile picture', 'thumbnail image']):
        return 'image'
    if _re.search(r'\b(image|img|pic|photo|picture)\b.*\b(of|for|with|showing)\b', msg):
        return 'image'
    # Video
    if any(w in msg for w in ['generate video', 'create video', 'make video', 'video of', 'animate', 'animation', 'motion graphics', 'cinematic', 'short film', 'clip of', 'reel', 'product video', 'video storyboard', 'storyboard', 'explainer video', 'promo video']):
        return 'video'
    # Audio
    if any(w in msg for w in ['voiceover', 'voice over', 'text to speech', 'tts', 'narrat', 'read aloud', 'generate audio', 'make audio', 'podcast intro', 'jingle']):
        return 'audio'
    # Social
    if any(w in msg for w in ['post to', 'social media', 'instagram post', 'linkedin post', 'tweet', 'facebook post', 'tiktok', 'youtube thumbnail', 'social content', 'post for instagram', 'post for linkedin', 'post for twitter', 'post for x', 'share on']):
        return 'social'
    # Code/Build — explicit build requests
    if any(w in msg for w in ['build me', 'build a', 'create a website', 'create a web', 'create an app', 'landing page', 'make a site', 'make a website', 'make a page', 'make an app', 'build website', 'build app', 'code a', 'write code', 'html page', 'react app', 'next.js', 'saas', 'ecommerce', 'portfolio', 'dashboard app', 'widget', 'pwa', 'chrome extension']):
        return 'code'
    if _re.search(r'\b(build|create|make|code|develop|write)\b.*\b(app|site|page|website|frontend|backend|api|widget|dashboard|form|calculator)\b', msg):
        return 'code'
    # Deploy
    if any(w in msg for w in ['deploy', 'publish', 'push to github', 'push to vercel', 'push to render', 'go live', 'make it live', 'ship it']):
        return 'deploy'
    # Design / Stitch
    if any(w in msg for w in ['design a ui', 'ui design', 'wireframe', 'mockup', 'prototype', 'stitch design', 'stitch', 'design with stitch']):
        return 'design'
    # Research
    if any(w in msg for w in ['research', 'look up', 'find out', 'what is the', 'who is', 'how does', 'compare', 'analyze', 'market research', 'competitor analysis']):
        return 'research'
    # Document
    if any(w in msg for w in ['write a document', 'create a doc', 'business plan', 'pitch deck', 'report', 'whitepaper', 'proposal', 'resume', 'cover letter']):
        return 'document'
    # v8.0 — Everything else is chat (supports planning/clarification flow)
    return 'chat'


async def _builder_generate_image_inline(prompt: str) -> dict:
    """Generate an image and return base64 data or URL."""
    import base64 as _b64
    xai_key = os.environ.get("XAI_API_KEY", "")
    if xai_key:
        try:
            async with httpx.AsyncClient(timeout=60.0) as hc:
                resp = await hc.post("https://api.x.ai/v1/images/generations",
                    headers={"Authorization": f"Bearer {xai_key}", "Content-Type": "application/json"},
                    json={"model": "grok-2-image", "prompt": prompt, "n": 1, "response_format": "b64_json"})
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("data"):
                        b64 = data["data"][0].get("b64_json", "")
                        if b64:
                            fname = f"builder_img_{uuid.uuid4().hex[:8]}.png"
                            fpath = os.path.join("studio_media", "images", fname)
                            os.makedirs(os.path.dirname(fpath), exist_ok=True)
                            with open(fpath, "wb") as f:
                                f.write(_b64.b64decode(b64))
                            return {"success": True, "url": f"/api/studio/media/images/{fname}", "data": f"data:image/png;base64,{b64}", "provider": "Grok Imagine"}
        except Exception as e:
            print(f"[Builder] xAI image error: {e}")
    openai_key = os.environ.get("OPENAI_API_KEY", "")
    if openai_key:
        try:
            async with httpx.AsyncClient(timeout=60.0) as hc:
                resp = await hc.post("https://api.openai.com/v1/images/generations",
                    headers={"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"},
                    json={"model": "dall-e-3", "prompt": prompt, "n": 1, "size": "1024x1024", "response_format": "b64_json"})
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("data"):
                        b64 = data["data"][0].get("b64_json", "")
                        revised = data["data"][0].get("revised_prompt", "")
                        if b64:
                            fname = f"builder_img_{uuid.uuid4().hex[:8]}.png"
                            fpath = os.path.join("studio_media", "images", fname)
                            os.makedirs(os.path.dirname(fpath), exist_ok=True)
                            with open(fpath, "wb") as f:
                                f.write(_b64.b64decode(b64))
                            return {"success": True, "url": f"/api/studio/media/images/{fname}", "data": f"data:image/png;base64,{b64}", "provider": "DALL-E 3", "revised_prompt": revised}
        except Exception as e:
            print(f"[Builder] DALL-E error: {e}")
    return {"success": False, "error": "No image generation API available"}


async def _builder_generate_video_inline(prompt: str) -> dict:
    xai_key = os.environ.get("XAI_API_KEY", "")
    storyboard = ""
    provider = ""
    if xai_key:
        try:
            async with httpx.AsyncClient(timeout=30.0) as hc:
                resp = await hc.post("https://api.x.ai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {xai_key}", "Content-Type": "application/json"},
                    json={"model": "grok-3-mini", "messages": [{"role": "user", "content": f"Create a detailed video storyboard for: '{prompt}'. Include scenes, camera movements, timing, mood."}], "temperature": 0.7})
                if resp.status_code == 200:
                    storyboard = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                    provider = "Grok"
        except Exception as e:
            print(f"[Builder] xAI video storyboard error: {e}")
    if not storyboard:
        result = await _builder_ai_call(BUILDER_CHAT_SYSTEM, f"Create a detailed video storyboard for: '{prompt}'.", "claude", 4000)
        storyboard = result['text']
        provider = result['model_used']
    job_id = str(uuid.uuid4())[:8]
    return {"storyboard": storyboard, "job_id": job_id, "provider": provider, "message": f"Video storyboard created via {provider}. Scenes, timing, and camera directions are ready. Want me to refine any scene or generate supporting images?"}


async def _builder_generate_audio_inline(prompt: str) -> dict:
    import base64 as _b64
    el_key = os.environ.get("ELEVENLABS_API_KEY", "")
    if el_key:
        try:
            async with httpx.AsyncClient(timeout=30.0) as hc:
                resp = await hc.post("https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM",
                    headers={"xi-api-key": el_key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
                    json={"text": prompt, "model_id": "eleven_turbo_v2_5", "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}})
                if resp.status_code == 200:
                    audio_bytes = resp.content
                    fname = f"builder_audio_{uuid.uuid4().hex[:8]}.mp3"
                    fpath = os.path.join("studio_media", "audio", fname)
                    os.makedirs(os.path.dirname(fpath), exist_ok=True)
                    with open(fpath, "wb") as f:
                        f.write(audio_bytes)
                    b64 = _b64.b64encode(audio_bytes).decode()
                    return {"success": True, "url": f"/api/studio/media/audio/{fname}", "data": f"data:audio/mpeg;base64,{b64}", "provider": "ElevenLabs"}
        except Exception as e:
            print(f"[Builder] ElevenLabs TTS error: {e}")
    return {"success": False, "error": "No TTS API available"}


async def _builder_generate_social_inline(message: str) -> dict:
    import re as _re
    msg_lower = message.lower()
    platform = "linkedin"
    for p in ["instagram", "twitter", "x ", "facebook", "tiktok", "youtube", "snapchat"]:
        if p in msg_lower:
            platform = "twitter" if p == "x " else p
            break
    spec = SOCIAL_PLATFORM_SPECS.get(platform, SOCIAL_PLATFORM_SPECS.get("linkedin", {"name": platform, "max_chars": 3000, "style_hint": "professional", "image_size": "1200x627", "aspect": "1.91:1"}))
    caption_prompt = f"""Generate a {spec['name']} post about: {message}
Platform: {spec['name']}, Max chars: {spec['max_chars']}, Style: {spec['style_hint']}
Return ONLY JSON: {{"caption": "...", "hashtags": ["..."], "hook": "...", "cta": "...", "image_prompt": "..."}}"""
    result = await _builder_ai_call(BUILDER_CHAT_SYSTEM, caption_prompt, "claude", 2000)
    caption_data = {"caption": "", "hashtags": [], "hook": "", "cta": "", "image_prompt": message}
    if result['text']:
        json_match = _re.search(r'\{[\s\S]*\}', result['text'])
        if json_match:
            try:
                caption_data = json.loads(json_match.group())
            except:
                caption_data["caption"] = result['text'][:spec.get('max_chars', 3000)]
    image_prompt = caption_data.get("image_prompt", message)
    image_result = await _builder_generate_image_inline(f"{image_prompt}. Optimized for {spec['name']}")
    return {
        "platform": platform, "caption": caption_data.get("caption", ""), "hashtags": caption_data.get("hashtags", []),
        "hook": caption_data.get("hook", ""), "cta": caption_data.get("cta", ""),
        "image": {"url": image_result.get("url", ""), "data": image_result.get("data", "")} if image_result.get("success") else {},
        "summary": f"{spec['name']} content created — caption + {'image' if image_result.get('success') else 'text only'}. Want me to publish it or make changes?"
    }


@app.post("/api/builder/chat")
async def builder_unified_chat(request: Request):
    """v7.27.0 — Unified Builder Chat SSE endpoint. One chat, full AI orchestration."""
    import re as _re
    body = await request.json()
    message = body.get("message", "").strip()
    history = body.get("history", [])
    attached_files = body.get("attached_files", [])
    requested_model = body.get("model", "claude_sonnet")  # Model selection from frontend

    if not message:
        return JSONResponse({"error": "Message required"}, status_code=400)

    # ═══ METERING PRE-CHECK ═══
    meter_check = await enforce_metering(request, model_id=requested_model)
    if not meter_check["allowed"]:
        error_payload = {"error": meter_check["error"], "type": "metering"}
        if meter_check.get("upgrade_required"):
            error_payload["upgrade_required"] = meter_check["upgrade_required"]
        if meter_check.get("credits_remaining") is not None:
            error_payload["credits_remaining"] = meter_check["credits_remaining"]
        return JSONResponse(error_payload, status_code=meter_check.get("status_code", 403))
    metering_user = meter_check.get("user")
    # ═══ END METERING PRE-CHECK ═══

    intent = _detect_builder_intent(message)
    print(f"[Builder Chat] intent={intent} msg={message[:80]}")

    # v7.36.0 — Tier-gated feature access check
    user_tier = get_user_tier(body, metering_user)
    intent_feature_map = {
        "code": "builder_code", "image": "builder_image", "video": "builder_video",
        "audio": "builder_audio", "deploy": "builder_deploy_vercel",
        "social": "builder_code",  # Social uses basic access
    }
    feature_key = intent_feature_map.get(intent, "search")  # chat/research = search (always allowed)
    access = check_feature_access(user_tier, feature_key)
    if not access["allowed"]:
        tier_error = {
            "error": access["reason"],
            "type": "tier_locked",
            "feature": feature_key,
            "current_tier": user_tier,
            "upgrade_to": access.get("upgrade_to", "pro"),
        }
        return JSONResponse(tier_error, status_code=403)

    # v7.36.0 — Select model chain based on compute tier
    compute_tier = body.get("compute_tier", "pro")
    model_routing = TIER_MODEL_ROUTING.get(compute_tier, TIER_MODEL_ROUTING["pro"])

    async def event_stream():
        yield f"data: {json.dumps({'type': 'intent', 'intent': intent})}\n\n"

        # ── v8.8.0: IMAGE / VIDEO / AUDIO / SOCIAL → redirect to Social Studio ──
        if intent in ('image', 'video', 'audio', 'social'):
            media_labels = {'image': 'Image generation', 'video': 'Video creation', 'audio': 'Audio generation', 'social': 'Social media content'}
            label = media_labels.get(intent, 'Media creation')
            redirect_msg = f"**{label}** lives in **Social Studio** — head over to the Social Studio section in the sidebar to create images, videos, audio, and social posts. This Builder is focused on building apps, websites, and widgets with code. Need help building something? Just describe what you want to create!"
            yield f"data: {json.dumps({'type': 'text', 'content': redirect_msg})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        # ── CODE ── v7.36.0 — Full-stack multi-page builder with iteration
        if intent == 'code':
            yield f"data: {json.dumps({'type': 'phase', 'phase': 'generating', 'message': 'Building your project...'})}\n\n"
            history_ctx = ""
            if history:
                for h in history[-6:]:
                    history_ctx += f"\n{h['role'].upper()}: {h['content'][:500]}"
            file_ctx = ""
            if attached_files:
                for af in attached_files[:3]:
                    file_ctx += f"\nAttached: {af.get('filename', '')} — {af.get('extracted_text', '')[:1000]}"

            # v7.36.0 — Include existing project files for iteration context
            existing_project = body.get("existing_files", [])
            project_ctx = ""
            if existing_project:
                project_ctx = "\n\n[EXISTING PROJECT FILES — EDIT THESE, DON'T REGENERATE FROM SCRATCH]\n"
                for ef in existing_project[:15]:  # Max 15 files for context
                    fname = ef.get('name', '')
                    content = ef.get('content', '')[:3000]  # Cap per file
                    project_ctx += f"\n--- {fname} ---\n{content}\n"
                project_ctx += "\n[END EXISTING FILES — Output ONLY modified files with COMPLETE updated content]\n"

            user_msg = message
            if file_ctx: user_msg += f"\n\n[ATTACHED]{file_ctx}"
            if project_ctx: user_msg += project_ctx
            if history_ctx: user_msg += f"\n\n[CONTEXT]{history_ctx}"

            # Helper to extract JSON files block from AI response
            def _extract_code_files(text: str):
                """Try multiple strategies to extract {files: [...]} from AI response."""
                import re as _re2

                # Strategy 0 (v7.42.0): Direct json.loads on full text (handles clean JSON from Grok/Claude)
                stripped = text.strip()
                # Remove markdown code fence if present
                if stripped.startswith('```'):
                    # Remove opening ``` and optional language tag
                    stripped = _re2.sub(r'^```(?:json)?\s*', '', stripped)
                    stripped = _re2.sub(r'\s*```\s*$', '', stripped)
                try:
                    parsed = json.loads(stripped)
                    if isinstance(parsed.get('files'), list) and len(parsed['files']) > 0:
                        first_file = parsed['files'][0]
                        if first_file.get('content') and len(first_file['content']) > 50:
                            return parsed, ''
                except (json.JSONDecodeError, KeyError, TypeError):
                    pass

                # Strategy 0b: Fix invalid JSON escape sequences (e.g. \s \d \. from regex in code)
                if '{"files"' in stripped or '"files":' in stripped:
                    try:
                        _valid_json_escapes = set('"' + chr(92) + 'bfnrtu/')
                        _bs = chr(92)  # backslash character
                        fixed_chars = []
                        i = 0
                        while i < len(stripped):
                            if stripped[i] == _bs and i + 1 < len(stripped):
                                nxt = stripped[i+1]
                                if nxt in _valid_json_escapes:
                                    fixed_chars.append(_bs)
                                    fixed_chars.append(nxt)
                                    i += 2
                                else:
                                    fixed_chars.append(_bs)
                                    fixed_chars.append(_bs)
                                    fixed_chars.append(nxt)
                                    i += 2
                            else:
                                fixed_chars.append(stripped[i])
                                i += 1
                        fixed = ''.join(fixed_chars)
                        parsed = json.loads(fixed)
                        if isinstance(parsed.get('files'), list) and len(parsed['files']) > 0:
                            first_file = parsed['files'][0]
                            if first_file.get('content') and len(first_file['content']) > 50:
                                print(f"[Builder Code] Strategy 0b: Fixed JSON escapes, extracted {len(parsed['files'])} files")
                                return parsed, ''
                    except (json.JSONDecodeError, KeyError, TypeError) as _fix_err:
                        print(f"[Builder Code] Strategy 0b failed: {_fix_err}")

                # Strategy 1: ```json ... ``` block
                m = _re2.search(r'```(?:json)?\s*(\{[\s\S]*?"files"\s*:\s*\[)', text)
                if m:
                    start = m.start(1)
                    # Find matching end: scan for the closing ]} of the files array and object
                    depth_obj = 0
                    depth_arr = 0
                    in_string = False
                    escape = False
                    end_pos = start
                    for ci in range(start, len(text)):
                        ch = text[ci]
                        if escape:
                            escape = False
                            continue
                        if ch == '\\':
                            if in_string: escape = True
                            continue
                        if ch == '"':
                            in_string = not in_string
                            continue
                        if in_string:
                            continue
                        if ch == '{':
                            depth_obj += 1
                        elif ch == '}':
                            depth_obj -= 1
                            if depth_obj == 0:
                                end_pos = ci + 1
                                break
                        elif ch == '[':
                            depth_arr += 1
                        elif ch == ']':
                            depth_arr -= 1
                    if end_pos > start:
                        candidate = text[start:end_pos]
                        try:
                            parsed = json.loads(candidate)
                            if isinstance(parsed.get('files'), list) and len(parsed['files']) > 0:
                                # Verify files have actual content, not just descriptions
                                first_file = parsed['files'][0]
                                if first_file.get('content') and len(first_file['content']) > 50:
                                    return parsed, text[end_pos:].replace('```', '').strip()
                        except (json.JSONDecodeError, KeyError):
                            pass
                # Strategy 2: raw {"files": ...} without backticks
                m2 = _re2.search(r'(\{\s*"files"\s*:\s*\[)', text)
                if m2:
                    start = m2.start()
                    depth_obj = 0
                    in_string = False
                    escape = False
                    end_pos = start
                    for ci in range(start, len(text)):
                        ch = text[ci]
                        if escape:
                            escape = False
                            continue
                        if ch == '\\':
                            if in_string: escape = True
                            continue
                        if ch == '"':
                            in_string = not in_string
                            continue
                        if in_string:
                            continue
                        if ch == '{':
                            depth_obj += 1
                        elif ch == '}':
                            depth_obj -= 1
                            if depth_obj == 0:
                                end_pos = ci + 1
                                break
                    if end_pos > start:
                        candidate = text[start:end_pos]
                        try:
                            parsed = json.loads(candidate)
                            if isinstance(parsed.get('files'), list) and len(parsed['files']) > 0:
                                first_file = parsed['files'][0]
                                if first_file.get('content') and len(first_file['content']) > 50:
                                    return parsed, text[end_pos:].strip()
                        except (json.JSONDecodeError, KeyError):
                            pass
                return None, text

            # ═══ CODE GENERATION — v7.42.0 Keepalive Pipeline ═══
            # Runs AI call in background task while sending SSE keepalive pings
            # every 5s to prevent Cloudflare/Render proxy from killing idle connection
            primary_model = BUILDER_MODEL_CHAIN[0]["id"] if BUILDER_MODEL_CHAIN else "pplx"
            available_model_ids = [m["id"] for m in BUILDER_MODEL_CHAIN]
            print(f"[Builder Code] Available models: {available_model_ids}. Primary: {primary_model}")

            files_data = None
            desc_text = ""
            result = {"text": "", "model_used": "none", "provider": "none"}

            # v8.8.2 — Claude is primary for code generation (best structured JSON output)
            code_preferred = "claude" if "claude" in available_model_ids else ("grok" if "grok" in available_model_ids else primary_model)
            print(f"[Builder Code] Step 1 with {code_preferred} (chain: {available_model_ids})")

            # Run AI call in background while sending keepalive pings
            import asyncio as _aio_code
            _code_result_holder = {"done": False, "result": {"text": "", "model_used": "none", "provider": "none"}}
            _progress_msgs = ["Analyzing your request...", "Generating HTML structure...", "Styling with CSS...",
                              "Adding interactivity...", "Building responsive layout...", "Optimizing code...",
                              "Assembling files...", "Finalizing your project...", "Almost there..."]

            async def _run_code_gen():
                try:
                    _code_result_holder["result"] = await _builder_ai_call(BUILDER_CODE_SYSTEM, user_msg, code_preferred, 64000, timeout_seconds=90)
                except Exception as _e:
                    print(f"[Builder Code] Background task error: {_e}")
                finally:
                    _code_result_holder["done"] = True

            _code_task = _aio_code.create_task(_run_code_gen())

            # Send keepalive progress pings every 5 seconds while AI works
            _ping_count = 0
            while not _code_result_holder["done"]:
                await _aio_code.sleep(5)
                if _code_result_holder["done"]:
                    break
                _ping_count += 1
                _msg = _progress_msgs[min(_ping_count - 1, len(_progress_msgs) - 1)]
                yield f"data: {json.dumps({'type': 'phase', 'phase': 'generating', 'message': _msg})}\n\n"
                print(f"[Builder Code] Keepalive ping #{_ping_count}: {_msg}")

            await _code_task  # Ensure task is fully done
            result = _code_result_holder["result"]
            if result['text']:
                files_data, desc_text = _extract_code_files(result['text'])

            # Step 2: Auto-retry with FORCE CODE prompt if AI returned text instead of JSON
            if not files_data and result.get('text') and len(result['text']) > 100:
                print(f"[Builder Code] No JSON found in primary response. Auto-retrying with force-code prompt...")
                yield f"data: {json.dumps({'type': 'phase', 'phase': 'generating', 'message': 'Generating code files...'})}\n\n"

                # Build the retry prompt: include the AI's response as context + the force-code instruction
                retry_msg = BUILDER_CODE_RETRY + message
                _retry_holder = {"done": False, "result": {"text": "", "model_used": "none", "provider": "none"}}

                async def _run_retry():
                    try:
                        # Try Claude first for retry — best at structured JSON output
                        retry_model = "claude" if "claude" in available_model_ids else code_preferred
                        _retry_holder["result"] = await _builder_ai_call(BUILDER_CODE_SYSTEM, retry_msg, retry_model, 64000, timeout_seconds=90)
                    except Exception as _re:
                        print(f"[Builder Code] Retry error: {_re}")
                    finally:
                        _retry_holder["done"] = True

                _retry_task = _aio_code.create_task(_run_retry())
                _retry_pings = 0
                while not _retry_holder["done"]:
                    await _aio_code.sleep(5)
                    if _retry_holder["done"]: break
                    _retry_pings += 1
                    _rmsg = ["Generating HTML...", "Adding styles...", "Building interactivity...", "Assembling files...", "Almost there..."][min(_retry_pings - 1, 4)]
                    yield f"data: {json.dumps({'type': 'phase', 'phase': 'generating', 'message': _rmsg})}\n\n"
                await _retry_task

                retry_result = _retry_holder["result"]
                if retry_result['text']:
                    files_data, desc_text = _extract_code_files(retry_result['text'])
                    if files_data:
                        result = retry_result  # Use retry result
                        print(f"[Builder Code] Retry succeeded! Got {len(files_data.get('files', []))} files")

            # Step 3 (last resort): If STILL no JSON, try to construct files from raw code blocks
            if not files_data and result.get('text') and len(result['text']) > 500:
                print(f"[Builder Code] No JSON after retry. Attempting raw-text-to-files extraction...")
                raw = result['text']
                import re as _re_code
                html_blocks = _re_code.findall(r'```html\n([\s\S]*?)```', raw)
                css_blocks = _re_code.findall(r'```css\n([\s\S]*?)```', raw)
                js_blocks = _re_code.findall(r'```(?:javascript|js)\n([\s\S]*?)```', raw)
                if html_blocks:
                    constructed_files = []
                    constructed_files.append({"name": "index.html", "content": html_blocks[0]})
                    for i, h in enumerate(html_blocks[1:], 1):
                        constructed_files.append({"name": f"page{i}.html", "content": h})
                    for i, c in enumerate(css_blocks):
                        constructed_files.append({"name": f"styles/{'main' if i==0 else f'style{i}'}.css", "content": c})
                    for i, j in enumerate(js_blocks):
                        constructed_files.append({"name": f"js/{'app' if i==0 else f'script{i}'}.js", "content": j})
                    if constructed_files:
                        files_data = {"files": constructed_files}
                        desc_text = "Built from code blocks."
                        print(f"[Builder Code] Constructed {len(constructed_files)} files from raw code blocks")

            if files_data and files_data.get('files'):
                yield f"data: {json.dumps({'type': 'code_files', 'files': files_data['files'], 'model': result['model_used']})}\n\n"
                file_count = len(files_data['files'])
                if desc_text and len(desc_text) > 10:
                    clean_desc = desc_text.strip().strip('`').strip()
                    if clean_desc:
                        yield f"data: {json.dumps({'type': 'text', 'content': clean_desc})}\n\n"
                else:
                    file_names = ', '.join(f.get('name', '?') for f in files_data['files'][:5])
                    _build_msg = 'Built ' + str(file_count) + ' files (' + file_names + ') via ' + str(result.get('model_used', 'AI')) + '. Preview it above — iterate, refine, or deploy.'
                    yield f"data: {json.dumps({'type': 'text', 'content': _build_msg})}\n\n"
            else:
                # v8.0 — Chat-first flow: if AI responded with questions/planning, show as natural conversation
                fallback_text = result.get('text', '') if result.get('text') else ''
                if fallback_text and len(fallback_text) > 50:
                    # This is likely a planning/clarification response — show it naturally
                    print(f"[Builder Code] Chat-first response (planning/clarifying): {len(fallback_text)} chars")
                    yield f"data: {json.dumps({'type': 'text', 'content': fallback_text})}\n\n"
                elif fallback_text:
                    yield f"data: {json.dumps({'type': 'text', 'content': fallback_text})}\n\n"
                else:
                    yield f"data: {json.dumps({'type': 'text', 'content': 'Tell me more about what you want to build — what pages, features, and style do you have in mind?'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        # ── DEPLOY ──
        if intent == 'deploy':
            yield f"data: {json.dumps({'type': 'deploy_ready', 'targets': ['vercel', 'render', 'github', 'download']})}\n\n"
            _deploy_msg = "Your project is ready to deploy. Where do you want to ship it?\n\n\u2022 **Vercel** \u2014 instant frontend, zero config\n\u2022 **Render** \u2014 full-stack with backends\n\u2022 **GitHub** \u2014 push to your repo\n\u2022 **Download** \u2014 get all files as ZIP"
            yield f"data: {json.dumps({'type': 'text', 'content': _deploy_msg})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        # ── RESEARCH ──
        if intent == 'research':
            yield f"data: {json.dumps({'type': 'phase', 'phase': 'searching', 'message': 'Researching...'})}\n\n"
            pplx_key = PPLX_API_KEY  # Module-level variable
            research_text = ""
            citations = []
            if pplx_key:
                try:
                    async with httpx.AsyncClient(timeout=60) as hc:
                        resp = await hc.post("https://api.perplexity.ai/chat/completions",
                            headers={"Authorization": f"Bearer {pplx_key}", "Content-Type": "application/json"},
                            json={"model": "sonar-pro", "messages": [{"role": "user", "content": message}], "return_citations": True})
                        if resp.status_code == 200:
                            data = resp.json()
                            research_text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                            citations = data.get("citations", [])
                except Exception as e:
                    print(f"[Builder] Perplexity error: {e}")
            if not research_text:
                _fb_model = BUILDER_MODEL_CHAIN[0]["id"] if BUILDER_MODEL_CHAIN else "pplx"
                result = await _builder_ai_call(BUILDER_CHAT_SYSTEM, message, _fb_model, 8000)
                research_text = result['text']
            if citations:
                yield f"data: {json.dumps({'type': 'citations', 'citations': citations})}\n\n"
            for i in range(0, len(research_text), 80):
                yield f"data: {json.dumps({'type': 'text', 'content': research_text[i:i+80]})}\n\n"
                await asyncio.sleep(0.015)
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        # ── GENERAL CHAT / DOCUMENT — Stream with Claude ──
        yield f"data: {json.dumps({'type': 'phase', 'phase': 'generating', 'message': 'SAL is thinking...'})}\n\n"
        msgs = []
        if history:
            for h in history[-8:]:
                msgs.append({"role": h["role"], "content": h["content"][:2000]})
        msgs.append({"role": "user", "content": message})
        anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
        streamed = False
        if anthropic_key:
            try:
                async with httpx.AsyncClient(timeout=120) as hc:
                    async with hc.stream("POST", "https://api.anthropic.com/v1/messages",
                        headers={"x-api-key": anthropic_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                        json={"model": "claude-sonnet-4-20250514", "max_tokens": 8000, "system": BUILDER_CHAT_SYSTEM, "stream": True, "messages": msgs},
                        timeout=120) as resp:
                        if resp.status_code == 200:
                            streamed = True
                            async for line in resp.aiter_lines():
                                if not line.startswith("data: "): continue
                                raw = line[6:]
                                if raw == "[DONE]": break
                                try:
                                    evt = json.loads(raw)
                                    if evt.get("type") == "content_block_delta":
                                        delta = evt.get("delta", {}).get("text", "")
                                        if delta:
                                            yield f"data: {json.dumps({'type': 'text', 'content': delta})}\n\n"
                                except: continue
            except Exception as e:
                print(f"[Builder] Claude stream error: {e}")
        if not streamed:
            _fb_model = BUILDER_MODEL_CHAIN[0]["id"] if BUILDER_MODEL_CHAIN else "pplx"
            result = await _builder_ai_call(BUILDER_CHAT_SYSTEM, message, _fb_model, 8000)
            if result['text']:
                for i in range(0, len(result['text']), 80):
                    yield f"data: {json.dumps({'type': 'text', 'content': result['text'][i:i+80]})}\n\n"
                    await asyncio.sleep(0.015)
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    async def metered_event_stream():
        """Wrapper that yields all events from event_stream, then records metering."""
        async for event in event_stream():
            yield event
        # ═══ METERING POST-CALL: Record usage after builder stream completes ═══
        if metering_user:
            # Map builder intent to metering action type
            builder_action_map = {
                "image": "builder_image", "video": "builder_video", "audio": "builder_audio",
                "social": "builder_social", "code": "builder_code", "deploy": "builder_deploy",
                "live_data": "builder_live_data", "chat": "builder_chat",
            }
            action_type = builder_action_map.get(intent, "builder_chat")
            # Code/image/video intents cost more — use higher-tier model for metering
            metering_model_id = requested_model
            if intent in ("code", "image", "video") and requested_model == "claude_sonnet":
                metering_model_id = "claude_sonnet"  # Pro tier default
            try:
                await record_metering(metering_user, metering_model_id, action_type, duration_minutes=1.0)
            except Exception as me:
                print(f"[Metering] Builder post-call error (non-fatal): {me}")

    return StreamingResponse(metered_event_stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── Builder Multi-Model AI Engine ───────────────────────────────────────────

# v7.36.0 — Model chain per architecture doc
# v7.36.0 — Default model chain (SAL Pro tier). Overridden per compute_tier via TIER_MODEL_ROUTING.
# Build model chain dynamically based on available API keys
_BUILDER_CHAIN_CANDIDATES = [
    {"id": "claude", "name": "Claude Sonnet 4.6", "provider": "anthropic", "model": "claude-sonnet-4-20250514", "max_tokens": 64000,
     "available": bool(os.environ.get("ANTHROPIC_API_KEY", ""))},
    {"id": "grok", "name": "Grok-3", "provider": "xai", "model": "grok-3-beta", "max_tokens": 32000,
     "available": bool(os.environ.get("XAI_API_KEY", ""))},
    {"id": "gemini", "name": "Gemini 2.5 Pro", "provider": "google", "model": "gemini-2.5-pro", "max_tokens": 65536,
     "available": bool(os.environ.get("GEMINI_API_KEY", ""))},  # Only a real Gemini key, not Stitch
    {"id": "gpt", "name": "GPT-4.1", "provider": "openai", "model": "gpt-4.1", "max_tokens": 32768,
     "available": bool(os.environ.get("OPENAI_API_KEY", ""))},
    # Perplexity — always available via PPLX_API_KEY
    {"id": "pplx", "name": "Perplexity Sonar Pro", "provider": "perplexity", "model": "sonar-pro", "max_tokens": 16000,
     "available": True},
]
# Only include models with available API keys — no wasted timeout on dead providers
BUILDER_MODEL_CHAIN = [m for m in _BUILDER_CHAIN_CANDIDATES if m.get("available", False)]
print(f"\u2705 Builder model chain: {[m['id'] for m in BUILDER_MODEL_CHAIN]}")

def get_builder_model_chain(compute_tier: str = "pro") -> list:
    """v7.36.0 — Return the model chain for the given compute tier from architecture doc."""
    routing = TIER_MODEL_ROUTING.get(compute_tier, TIER_MODEL_ROUTING.get("pro", {}))
    primary = routing.get("primary", {})
    fallbacks = routing.get("fallback", [])
    chain = []
    if primary:
        chain.append({
            "id": primary["id"], "name": f"SAL {compute_tier.title()} Primary",
            "provider": primary["provider"], "model": primary["model"], "max_tokens": primary["max_tokens"]
        })
    for fb in fallbacks:
        chain.append({
            "id": fb["id"], "name": f"SAL {compute_tier.title()} Fallback",
            "provider": fb["provider"], "model": fb["model"], "max_tokens": fb["max_tokens"]
        })
    return chain if chain else BUILDER_MODEL_CHAIN


async def _builder_ai_call(system: str, user_msg: str, preferred_model: str = "claude", max_tokens: int = 32000, timeout_seconds: int = 90) -> dict:
    """Call AI with automatic fallback chain. Uses module-level API key variables."""
    # Order chain: preferred model first, then rest
    chain = sorted(BUILDER_MODEL_CHAIN, key=lambda m: 0 if m["id"] == preferred_model else 1)

    for model_cfg in chain:
        try:
            provider = model_cfg["provider"]
            tok = min(max_tokens, model_cfg["max_tokens"])

            if provider == "anthropic":
                key = os.environ.get("ANTHROPIC_API_KEY", "")
                if not key: continue
                async with httpx.AsyncClient(timeout=timeout_seconds) as hc:
                    r = await hc.post("https://api.anthropic.com/v1/messages",
                        headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                        json={"model": model_cfg["model"], "max_tokens": tok, "system": system,
                              "messages": [{"role": "user", "content": user_msg}]})
                    if r.status_code != 200:
                        print(f"[Builder AI] Anthropic {model_cfg['model']} -> {r.status_code}")
                        continue
                    data = r.json()
                    text = data.get("content", [{}])[0].get("text", "")
                    if text: return {"text": text, "model_used": model_cfg["name"], "provider": provider}

            elif provider == "xai":
                key = XAI_API_KEY  # Module-level variable
                if not key: continue
                async with httpx.AsyncClient(timeout=timeout_seconds) as hc:
                    r = await hc.post("https://api.x.ai/v1/chat/completions",
                        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                        json={"model": model_cfg["model"], "max_tokens": tok, "temperature": 0.7,
                              "messages": [{"role": "system", "content": system}, {"role": "user", "content": user_msg}]})
                    if r.status_code != 200:
                        print(f"[Builder AI] xAI {model_cfg['model']} -> {r.status_code}")
                        continue
                    data = r.json()
                    text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    if text: return {"text": text, "model_used": model_cfg["name"], "provider": provider}

            elif provider == "google":
                key = GEMINI_API_KEY  # Module-level variable (falls back to STITCH_API_KEY)
                if not key: continue
                async with httpx.AsyncClient(timeout=timeout_seconds) as hc:
                    r = await hc.post(
                        f"https://generativelanguage.googleapis.com/v1beta/models/{model_cfg['model']}:generateContent?key={key}",
                        headers={"Content-Type": "application/json"},
                        json={"contents": [{"parts": [{"text": f"{system}\n\n{user_msg}"}]}],
                              "generationConfig": {"maxOutputTokens": tok, "temperature": 0.7}})
                    if r.status_code != 200:
                        print(f"[Builder AI] Google {model_cfg['model']} -> {r.status_code}")
                        continue
                    data = r.json()
                    text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                    if text: return {"text": text, "model_used": model_cfg["name"], "provider": provider}

            elif provider == "openai":
                key = OPENAI_API_KEY  # Module-level variable
                if not key: continue
                async with httpx.AsyncClient(timeout=timeout_seconds) as hc:
                    r = await hc.post("https://api.openai.com/v1/chat/completions",
                        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                        json={"model": model_cfg["model"], "max_tokens": tok, "temperature": 0.7,
                              "messages": [{"role": "system", "content": system}, {"role": "user", "content": user_msg}]})
                    if r.status_code != 200:
                        print(f"[Builder AI] OpenAI {model_cfg['model']} -> {r.status_code}")
                        continue
                    data = r.json()
                    text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    if text: return {"text": text, "model_used": model_cfg["name"], "provider": provider}

            elif provider == "perplexity":
                key = PPLX_API_KEY  # Module-level variable
                if not key: continue
                async with httpx.AsyncClient(timeout=timeout_seconds) as hc:
                    r = await hc.post("https://api.perplexity.ai/chat/completions",
                        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                        json={"model": model_cfg.get("model", "sonar-pro"), "max_tokens": min(tok, 16000),
                              "messages": [{"role": "system", "content": system}, {"role": "user", "content": user_msg}]})
                    if r.status_code != 200:
                        print(f"[Builder AI] Perplexity {model_cfg['model']} -> {r.status_code}")
                        continue
                    data = r.json()
                    text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    if text: return {"text": text, "model_used": model_cfg["name"], "provider": provider}

        except Exception as ex:
            print(f"[Builder AI] {provider}/{model_cfg.get('model','')} exception: {ex}")
            continue

    return {"text": "", "model_used": "none", "provider": "none"}


# ── GROK AGENTIC BUILDER — 3-Agent Pipeline ─────────────────────────────────

@limiter.limit("5/minute")
@app.post("/api/builder/agent")
async def agent_build(request: Request):
    """3-Agent Pipeline: Grok plans → Stitch/Gemini UI → Claude executes. SAL BuilderAI v2."""
    body = await request.json()
    prompt = body.get("prompt", "").strip()
    if not prompt:
        return JSONResponse({"error": "prompt required"}, status_code=400)

    async def stream():
        # ── PHASE 1: GROK PLANS ──
        yield "data: " + json.dumps({"phase": "planning", "agent": "grok", "message": "Analyzing your request..."}) + "\n\n"

        grok_plan_parsed = None
        if XAI_API_KEY:
            try:
                async with httpx.AsyncClient(timeout=60) as hc:
                    plan_resp = await hc.post(
                        "https://api.x.ai/v1/chat/completions",
                        headers={"Authorization": "Bearer " + XAI_API_KEY, "Content-Type": "application/json"},
                        json={
                            "model": "grok-4",
                            "messages": [
                                {"role": "system", "content": "You are SAL's Lead Architect Agent. Given a build request, output ONLY valid JSON with these keys: {\"title\": \"\", \"components\": [], \"apis\": [], \"steps\": [], \"complexity\": \"low|medium|high\", \"estimated_time\": \"\"}. No markdown, no explanation."},
                                {"role": "user", "content": prompt}
                            ],
                            "max_tokens": 1024,
                            "temperature": 0.3
                        }
                    )
                    if plan_resp.status_code == 200:
                        plan_text = plan_resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                        try:
                            grok_plan_parsed = json.loads(plan_text)
                        except Exception:
                            grok_plan_parsed = None
                    else:
                        print(f"[Agent Builder] Grok plan HTTP {plan_resp.status_code}: {plan_resp.text[:200]}")
            except Exception as _ge:
                print(f"[Agent Builder] Grok plan error: {_ge}")

        if not grok_plan_parsed:
            grok_plan_parsed = {
                "title": prompt[:60],
                "components": ["Header", "Hero Section", "Features", "CTA", "Footer"],
                "apis": [],
                "steps": ["Design layout", "Build HTML structure", "Add CSS styling", "Wire JavaScript", "Test & optimize"],
                "complexity": "medium",
                "estimated_time": "45s"
            }

        yield "data: " + json.dumps({"phase": "plan_ready", "agent": "grok", "plan": grok_plan_parsed}) + "\n\n"

        # ── PHASE 2: STITCH — Gemini UI Design Layer ──
        yield "data: " + json.dumps({"phase": "building", "agent": "stitch", "message": "Generating UI components..."}) + "\n\n"

        stitch_design = ""
        gemini_key = os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_AI_KEY", "")
        if gemini_key:
            try:
                async with httpx.AsyncClient(timeout=45) as hc:
                    stitch_prompt = ("You are Stitch — an elite UI/UX design AI. Given this architectural plan, output a comprehensive design system: "
                                     "color palette (hex codes), typography scale, spacing system, component hierarchy with layout specs, "
                                     "animation/transition recommendations, and responsive breakpoints. Be specific — give actual CSS values. "
                                     "Plan: " + json.dumps(grok_plan_parsed) + "\nBuild request: " + prompt)
                    stitch_resp = await hc.post(
                        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-05-06:generateContent?key=" + gemini_key,                        headers={"Content-Type": "application/json"},
                        json={"contents": [{"parts": [{"text": stitch_prompt}]}], "generationConfig": {"maxOutputTokens": 1024}}
                    )
                    if stitch_resp.status_code == 200:
                        stitch_design = stitch_resp.json().get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            except Exception as _se:
                print(f"[Agent Builder] Stitch/Gemini error: {_se}")

        yield "data: " + json.dumps({"phase": "stitch_ready", "agent": "stitch", "design": stitch_design or "UI design layer ready"}) + "\n\n"

        # ── PHASE 3: CLAUDE EXECUTES ──
        yield "data: " + json.dumps({"phase": "wiring", "agent": "claude", "message": "Wiring intelligence layer..."}) + "\n\n"

        plan_ctx = "\n\n[ARCHITECT PLAN — FOLLOW EXACTLY]\n" + json.dumps(grok_plan_parsed, indent=2)
        if stitch_design:
            plan_ctx += "\n\n[UI DESIGN NOTES]\n" + stitch_design
        plan_ctx += "\n[END PLAN]\nBuild exactly what the plan specifies. Output complete working files as JSON."

        # Run AI call with keepalive pings so SSE connection stays alive
        import asyncio as _aio
        _code_result_holder = {"result": None, "done": False}
        async def _run_code_gen():
            _code_result_holder["result"] = await _builder_ai_call(BUILDER_CODE_SYSTEM, prompt + plan_ctx, "claude", 32000, timeout_seconds=180)
            _code_result_holder["done"] = True
        _task = _aio.create_task(_run_code_gen())

        # Send keepalive pings every 8s while waiting for code generation
        _ping_msgs = [
            "Analyzing architecture...", "Generating components...", "Building UI layer...",
            "Wiring logic...", "Optimizing code...", "Finalizing files...",
            "Running quality checks...", "Preparing delivery...",
        ]
        _ping_i = 0
        while not _code_result_holder["done"]:
            await _aio.sleep(8)
            if not _code_result_holder["done"]:
                msg = _ping_msgs[_ping_i % len(_ping_msgs)]
                yield "data: " + json.dumps({"phase": "wiring", "agent": "claude", "message": msg}) + "\n\n"
                _ping_i += 1

        build_result = _code_result_holder["result"] or {}

        files_data = None
        if build_result.get("text"):
            import re as _are
            text = build_result["text"]
            try:
                stripped = text.strip()
                if stripped.startswith("```"):
                    stripped = _are.sub(r"^```(?:json)?\s*", "", stripped)
                    stripped = _are.sub(r"\s*```\s*$", "", stripped)
                parsed = json.loads(stripped)
                if isinstance(parsed.get("files"), list) and parsed["files"]:
                    files_data = parsed
            except Exception:
                pass

            if files_data and files_data.get("files"):
                yield "data: " + json.dumps({"phase": "files_ready", "agent": "claude", "files": files_data["files"], "model": build_result.get("model_used", "claude")}) + "\n\n"
            else:
                # Try to extract raw HTML from response and send as file
                html_match = _are.search(r'<!DOCTYPE html>.*?</html>', text, _are.DOTALL | _are.IGNORECASE)
                if html_match:
                    yield "data: " + json.dumps({"phase": "files_ready", "agent": "claude", "files": [{"name": "index.html", "content": html_match.group(0)}], "model": build_result.get("model_used", "claude")}) + "\n\n"
                else:
                    # Last resort: wrap any code block in a minimal HTML page
                    code_match = _are.search(r'```(?:html)?\s*([\s\S]+?)```', text)
                    if code_match:
                        wrapped = "<!DOCTYPE html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'></head><body>" + code_match.group(1) + "</body></html>"
                        yield "data: " + json.dumps({"phase": "files_ready", "agent": "claude", "files": [{"name": "index.html", "content": wrapped}], "model": build_result.get("model_used", "claude")}) + "\n\n"
                    else:
                        yield "data: " + json.dumps({"phase": "files_ready", "agent": "claude", "raw_text": text[:2000], "model": build_result.get("model_used", "claude")}) + "\n\n"

        yield "data: " + json.dumps({"phase": "complete", "message": "Build complete!", "model": build_result.get("model_used", "AI")}) + "\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")

# ── Builder Design Mode (Replaces Stitch) ───────────────────────────────────

@app.post("/api/builder/design")
async def builder_design(request: Request):
    """Generate UI designs as HTML/CSS — replaces Google Stitch with our own AI models."""
    try:
        body = await request.json()
        prompt = body.get("prompt", "")
        style = body.get("style", "modern-dark")
        model = body.get("model", "claude")
        platform = body.get("platform", "web")  # web, mobile, tablet

        if not prompt:
            return JSONResponse({"error": "prompt is required"}, status_code=400)

        system = """You are SAL Designer — an elite UI/UX designer. Generate beautiful, pixel-perfect UI designs as complete HTML+CSS.

DESIGN RULES:
1. Use a single HTML file with embedded <style> — self-contained, no external deps except Google Fonts
2. Use modern design: glass-morphism, subtle gradients, proper shadows, rounded corners
3. Include hover states, transitions, and subtle animations
4. Proper spacing rhythm (8px grid system)
5. Beautiful typography with Google Fonts
6. Responsive design that works on all screen sizes
7. For dark themes: use proper contrast, accent colors, layered surfaces
8. Include realistic placeholder content — names, descriptions, numbers
9. Make it look like a real product, not a wireframe

Return ONLY a JSON object:
{
  "html": "<!DOCTYPE html>...complete self-contained HTML with embedded CSS...",
  "design_notes": "Brief notes on design decisions",
  "colors": {"primary": "#hex", "secondary": "#hex", "accent": "#hex", "bg": "#hex"}
}"""

        style_context = {
            "modern-dark": "Dark theme with glassmorphism, subtle gradients, neon accents",
            "modern-light": "Clean white/light theme with shadow depth, vibrant accent colors",
            "minimal": "Ultra-minimal, lots of whitespace, monochrome with single accent",
            "corporate": "Professional, trustworthy, blue-toned, clean typography",
            "creative": "Bold colors, asymmetric layouts, creative typography, dynamic",
            "brutalist": "Raw, high-contrast, bold typography, unconventional layouts",
        }.get(style, "Modern, professional, polished")

        user_msg = f"""Design a {platform} UI: {prompt}

Design style: {style_context}
Platform: {platform}

Return the complete self-contained HTML design as JSON."""

        result = await _builder_ai_call(system, user_msg, model, max_tokens=32000)

        if not result["text"]:
            return JSONResponse({"error": "All AI models unavailable"}, status_code=503)

        import re as _re
        raw = result["text"].strip()
        raw = _re.sub(r'^```(?:json)?\s*', '', raw, flags=_re.IGNORECASE)
        raw = _re.sub(r'```\s*$', '', raw)
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            match = _re.search(r'\{[\s\S]*\}', raw, _re.DOTALL)
            if match:
                parsed = json.loads(match.group(0))
            else:
                return JSONResponse({"error": "Failed to parse design response"}, status_code=502)

        return JSONResponse({
            "success": True,
            "html": parsed.get("html", ""),
            "design_notes": parsed.get("design_notes", ""),
            "colors": parsed.get("colors", {}),
            "model_used": result["model_used"],
            "provider": result["provider"]
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# ── Builder Save / Load Project Endpoints ───────────────────────────────────

@app.post("/api/builder/save-project")
async def builder_save_project(request: Request):
    """Save project files to disk under /tmp/sal_projects/{name}/."""
    try:
        body = await request.json()
        name = (body.get("name") or "unnamed-project").lower().replace(" ", "-")
        files = body.get("files", [])

        if not files:
            return JSONResponse({"error": "files array is required and must not be empty"}, status_code=400)

        project_dir = Path("/tmp/sal_projects") / name
        project_dir.mkdir(parents=True, exist_ok=True)

        saved = []
        for f in files:
            fname = f.get("name") or "file.txt"
            content = f.get("content") or ""
            file_path = (project_dir / fname).resolve()
            if not str(file_path).startswith(str(project_dir.resolve())):
                continue
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(content, encoding="utf-8")
            saved.append(fname)

        _builder_projects[name] = {"name": name, "files": files}

        return JSONResponse({
            "success": True, "name": name, "path": str(project_dir),
            "saved_files": saved, "file_count": len(saved),
            "message": f"Saved {len(saved)} files to /tmp/sal_projects/{name}/"
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/builder/load-project/{name}")
async def builder_load_project(name: str):
    """Load project files from disk at /tmp/sal_projects/{name}/."""
    try:
        project_dir = Path("/tmp/sal_projects") / name
        if not project_dir.exists():
            if name in _builder_projects:
                return JSONResponse({"success": True, "name": name, "files": _builder_projects[name].get("files", [])})
            return JSONResponse({"error": f"Project '{name}' not found"}, status_code=404)

        files = []
        for fpath in sorted(project_dir.rglob("*")):
            if fpath.is_file():
                rel = str(fpath.relative_to(project_dir))
                try:
                    content = fpath.read_text(encoding="utf-8")
                except Exception:
                    content = "[Binary file]"
                files.append({"name": rel, "content": content, "size": fpath.stat().st_size})

        return JSONResponse({"success": True, "name": name, "files": files, "file_count": len(files)})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)



# ── Builder File Upload ───────────────────────────────────────────────────────

ALLOWED_UPLOAD_EXTENSIONS = {
    # Images
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico",
    # Documents
    ".pdf", ".doc", ".docx", ".txt", ".md", ".rtf", ".csv", ".json", ".xml",
    # Code
    ".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".scss", ".less",
    ".java", ".cpp", ".c", ".h", ".go", ".rs", ".rb", ".php", ".swift",
    ".yaml", ".yml", ".toml", ".env", ".sh", ".bat", ".sql",
    # Archives
    ".zip",
}
MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20MB


@app.post("/api/studio/upload")
async def studio_upload_file(file: UploadFile = File(...)):
    """Upload a file to Builder for AI context — images, screenshots, documents, code."""
    if not file or not file.filename:
        return JSONResponse({"error": "No file provided"}, status_code=400)

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        return JSONResponse({"error": f"File type {ext} not supported"}, status_code=400)

    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        return JSONResponse({"error": "File too large (max 20MB)"}, status_code=400)

    file_id = str(uuid.uuid4())[:8]
    safe_name = f"{file_id}_{file.filename.replace(' ', '_')}"
    filepath = MEDIA_DIR / "uploads" / safe_name
    filepath.write_bytes(content)

    # Determine if we can extract text for AI context
    extracted_text = ""
    content_type = file.content_type or "application/octet-stream"
    is_image = content_type.startswith("image/") or ext in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"}
    is_text = ext in {".txt", ".md", ".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".scss",
                       ".json", ".xml", ".yaml", ".yml", ".toml", ".env", ".sh", ".sql",
                       ".java", ".cpp", ".c", ".h", ".go", ".rs", ".rb", ".php", ".swift",
                       ".csv", ".less", ".bat", ".rtf"}

    if is_text:
        try:
            extracted_text = content.decode("utf-8", errors="replace")[:50000]  # First 50k chars
        except Exception:
            extracted_text = "[Binary file — could not extract text]"

    # For images, prepare base64 thumbnail for AI vision
    thumbnail_b64 = ""
    if is_image and ext != ".svg":
        thumbnail_b64 = base64.b64encode(content).decode()[:500000]  # Limit base64 size

    entry = {
        "id": file_id,
        "filename": file.filename,
        "safe_name": safe_name,
        "content_type": content_type,
        "size": len(content),
        "url": f"/api/studio/uploads/{safe_name}",
        "is_image": is_image,
        "is_text": is_text,
        "extracted_text": extracted_text[:2000] if extracted_text else "",
        "thumbnail_b64": thumbnail_b64[:100000] if thumbnail_b64 else "",
        "created_at": datetime.now().isoformat(),
    }
    builder_uploads.insert(0, entry)

    return JSONResponse(entry)


@app.get("/api/studio/uploads/{filename}")
async def serve_upload(filename: str):
    """Serve uploaded files."""
    filepath = MEDIA_DIR / "uploads" / filename
    if filepath.exists():
        return FileResponse(str(filepath))
    return JSONResponse({"error": "File not found"}, status_code=404)


@app.get("/api/studio/uploads")
async def list_uploads():
    """List all uploaded files."""
    return JSONResponse({"uploads": builder_uploads})


@app.delete("/api/studio/uploads/{file_id}")
async def delete_upload(file_id: str):
    """Remove an uploaded file."""
    global builder_uploads
    entry = next((u for u in builder_uploads if u["id"] == file_id), None)
    if not entry:
        return JSONResponse({"error": "Not found"}, status_code=404)
    filepath = MEDIA_DIR / "uploads" / entry["safe_name"]
    if filepath.exists():
        filepath.unlink()
    builder_uploads = [u for u in builder_uploads if u["id"] != file_id]
    return JSONResponse({"success": True})


# ── Social Content Generation ─────────────────────────────────────────────────

SOCIAL_PLATFORM_SPECS = {
    "linkedin": {
        "name": "LinkedIn",
        "image_size": "1200x627",
        "aspect": "1.91:1",
        "max_chars": 3000,
        "style_hint": "professional, corporate, clean design with blue accents",
        "content_types": ["image_post", "carousel", "article"],
    },
    "instagram": {
        "name": "Instagram",
        "image_size": "1080x1080",
        "aspect": "1:1",
        "max_chars": 2200,
        "style_hint": "vibrant, eye-catching, trendy, Instagram-worthy aesthetic",
        "content_types": ["image_post", "story", "reel"],
    },
    "twitter": {
        "name": "X (Twitter)",
        "image_size": "1200x675",
        "aspect": "16:9",
        "max_chars": 280,
        "style_hint": "bold, shareable, concise visual with strong typography",
        "content_types": ["image_post", "thread"],
    },
    "youtube": {
        "name": "YouTube",
        "image_size": "1280x720",
        "aspect": "16:9",
        "max_chars": 5000,
        "style_hint": "thumbnail style — bold text, bright colors, face closeup, high contrast",
        "content_types": ["thumbnail", "short_video"],
    },
    "facebook": {
        "name": "Facebook",
        "image_size": "1200x630",
        "aspect": "1.91:1",
        "max_chars": 63206,
        "style_hint": "engaging, community-focused, warm and inviting",
        "content_types": ["image_post", "video", "story"],
    },
    "tiktok": {
        "name": "TikTok",
        "image_size": "1080x1920",
        "aspect": "9:16",
        "max_chars": 2200,
        "style_hint": "trendy, fast-paced, Gen-Z aesthetic, vertical format",
        "content_types": ["short_video", "image_post"],
    },
    "snapchat": {
        "name": "Snapchat",
        "image_size": "1080x1920",
        "aspect": "9:16",
        "max_chars": 250,
        "style_hint": "fun, youthful, vertical, bold overlays",
        "content_types": ["story", "spotlight"],
    },
}


@app.post("/api/social/generate")
async def social_generate_content(request: Request):
    """Generate platform-optimized social media content — image + caption."""
    body = await request.json()
    topic = body.get("topic", "")
    platform = body.get("platform", "linkedin").lower()
    content_type = body.get("content_type", "image_post")  # image_post, thumbnail, short_video, story
    brand_voice = body.get("brand_voice", "professional yet approachable")
    extra_context = body.get("context", "")

    if not topic:
        return JSONResponse({"error": "Topic required"}, status_code=400)

    spec = SOCIAL_PLATFORM_SPECS.get(platform, SOCIAL_PLATFORM_SPECS["linkedin"])
    xai_key = os.environ.get("XAI_API_KEY", "")

    results = {"platform": platform, "spec": spec["name"], "content_type": content_type}

    # ── Step 1: Generate caption/post text — xAI → Claude → Gemini fallback ──
    try:
        caption_prompt = f"""You are a world-class social media content strategist.
Generate a {spec['name']} post about: {topic}

Platform specs:
- Max characters: {spec['max_chars']}
- Style: {spec['style_hint']}
- Brand voice: {brand_voice}
{f'Additional context: {extra_context}' if extra_context else ''}

Return ONLY a JSON object with these fields:
{{
  "caption": "the post text optimized for {spec['name']}",
  "hashtags": ["relevant", "hashtags"],
  "hook": "attention-grabbing first line",
  "cta": "call to action",
  "image_prompt": "detailed prompt to generate the perfect {spec['name']} image for this post, including style: {spec['style_hint']}, dimensions suitable for {spec['image_size']}"
}}"""

        raw_text = ""
        import re

        # 1a) Try xAI Grok
        if xai_key and not raw_text:
            try:
                async with httpx.AsyncClient(timeout=60) as hc:
                    resp = await hc.post(
                        "https://api.x.ai/v1/chat/completions",
                        headers={"Authorization": f"Bearer {xai_key}", "Content-Type": "application/json"},
                        json={"model": "grok-4", "messages": [{"role": "user", "content": caption_prompt}], "temperature": 0.8},
                    )
                    if resp.status_code == 200:
                        raw_text = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
            except Exception as _e:
                print(f"[Social] xAI caption error: {_e}")

        # 1b) Fallback: Claude
        if not raw_text and client:
            try:
                claude_resp = client.messages.create(
                    model="claude-3-5-haiku-20241022",
                    max_tokens=1024,
                    messages=[{"role": "user", "content": caption_prompt}],
                )
                raw_text = claude_resp.content[0].text if claude_resp.content else ""
            except Exception as _e:
                print(f"[Social] Claude caption error: {_e}")

        # 1c) Fallback: Gemini
        if not raw_text and GEMINI_API_KEY:
            try:
                gemini_result = await gemini_chat(caption_prompt)
                raw_text = gemini_result.get("text", "")
            except Exception as _e:
                print(f"[Social] Gemini caption error: {_e}")

        if raw_text:
            json_match = re.search(r'\{[\s\S]*\}', raw_text)
            if json_match:
                caption_data = json.loads(json_match.group())
            else:
                caption_data = {"caption": raw_text[:spec['max_chars']], "hashtags": [], "hook": "", "cta": "", "image_prompt": topic}
        else:
            caption_data = {"caption": f"Check out {topic}!", "hashtags": [], "hook": "", "cta": "", "image_prompt": topic}

        results["caption"] = caption_data.get("caption", "")
        results["hashtags"] = caption_data.get("hashtags", [])
        results["hook"] = caption_data.get("hook", "")
        results["cta"] = caption_data.get("cta", "")
        image_prompt = caption_data.get("image_prompt", topic)

    except Exception as e:
        print(f"[Social] Caption generation error: {e}")
        results["caption"] = f"Check out {topic}!"
        results["hashtags"] = []
        image_prompt = f"{spec['style_hint']}: {topic}"

    # ── Step 2: Generate image — xAI Grok Imagine → OpenAI → Gemini ──
    if content_type in ("image_post", "thumbnail", "story"):
        try:
            # Map platform aspect to generation aspect
            aspect_map = {
                "1:1": "1:1", "1.91:1": "16:9", "16:9": "16:9", "9:16": "9:16",
                "4:3": "4:3", "3:4": "3:4",
            }
            gen_aspect = aspect_map.get(spec["aspect"], "1:1")
            full_image_prompt = f"{image_prompt}. Optimized for {spec['name']} at {spec['image_size']}. Style: {spec['style_hint']}"

            image_bytes = None
            img_model_used = None
            img_errors = []

            # 2a) Try xAI Grok Imagine
            if xai_key and not image_bytes:
                try:
                    async with httpx.AsyncClient(timeout=60.0) as hc:
                        resp = await hc.post(
                            "https://api.x.ai/v1/images/generations",
                            headers={"Authorization": f"Bearer {xai_key}", "Content-Type": "application/json"},
                            json={"model": "grok-2-image", "prompt": full_image_prompt, "n": 1, "response_format": "b64_json"},
                        )
                        data = resp.json()
                        if resp.status_code == 200 and data.get("data"):
                            image_bytes = base64.b64decode(data["data"][0]["b64_json"])
                            img_model_used = "grok-2-image"
                        else:
                            img_errors.append(f"xAI: {data.get('error', {}).get('message', 'unknown')}")
                except Exception as _e:
                    img_errors.append(f"xAI: {_e}")

            # 2b) Fallback: OpenAI DALL-E
            if not image_bytes and OPENAI_API_KEY:
                try:
                    async with httpx.AsyncClient(timeout=60.0) as hc:
                        resp = await hc.post(
                            "https://api.openai.com/v1/images/generations",
                            headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
                            json={"model": "dall-e-3", "prompt": full_image_prompt, "n": 1, "size": "1024x1024", "response_format": "b64_json"},
                        )
                        data = resp.json()
                        if resp.status_code == 200 and data.get("data"):
                            image_bytes = base64.b64decode(data["data"][0]["b64_json"])
                            img_model_used = "dall-e-3"
                        else:
                            img_errors.append(f"OpenAI: {data.get('error', {}).get('message', 'unknown')}")
                except Exception as _e:
                    img_errors.append(f"OpenAI: {_e}")

            # 2c) Fallback: Gemini inline_data
            if not image_bytes and GEMINI_API_KEY:
                try:
                    async with httpx.AsyncClient(timeout=60.0) as hc:
                        resp = await hc.post(
                            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={GEMINI_API_KEY}",
                            headers={"Content-Type": "application/json"},
                            json={
                                "contents": [{"parts": [{"text": f"Generate a photorealistic image: {full_image_prompt}"}]}],
                                "generationConfig": {"responseModalities": ["TEXT"]},
                            },
                        )
                        data = resp.json()
                        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                        for part in parts:
                            if part.get("inlineData"):
                                image_bytes = base64.b64decode(part["inlineData"]["data"])
                                img_model_used = "gemini-imagen"
                                break
                        if not image_bytes:
                            img_errors.append("Gemini: returned text, not image")
                except Exception as _e:
                    img_errors.append(f"Gemini: {_e}")

            if image_bytes:
                file_id = str(uuid.uuid4())[:8]
                filename = f"social_{platform}_{file_id}.png"
                filepath = MEDIA_DIR / "images" / filename
                filepath.parent.mkdir(parents=True, exist_ok=True)
                filepath.write_bytes(image_bytes)

                b64 = base64.b64encode(image_bytes).decode()
                results["image"] = {
                    "url": f"/api/studio/media/images/{filename}",
                    "data": f"data:image/png;base64,{b64}",
                    "filename": filename,
                    "size": len(image_bytes),
                    "model": img_model_used,
                }

                media_gallery.insert(0, {
                    "id": file_id, "type": "image", "filename": filename,
                    "prompt": full_image_prompt, "model": img_model_used,
                    "created_at": datetime.now().isoformat(), "size_bytes": len(image_bytes),
                    "url": f"/api/studio/media/images/{filename}",
                })
            else:
                results["image"] = {"error": "No image provider available", "details": img_errors}

        except Exception as e:
            print(f"[Social] Image generation error: {e}")
            results["image"] = {"error": str(e)[:200]}

    # ── Step 3: Queue short video for video-first platforms ──
    elif content_type == "short_video":
        try:
            video_prompt = f"{image_prompt}. Vertical 9:16 format for {spec['name']}. {spec['style_hint']}"
            vid_job_id = str(uuid.uuid4())[:8]
            storyboard_text = ""
            vid_ai_provider = None

            # Use xAI Grok to build a storyboard for the social video
            if xai_key:
                try:
                    async with httpx.AsyncClient(timeout=30.0) as hc:
                        resp = await hc.post(
                            "https://api.x.ai/v1/chat/completions",
                            headers={"Authorization": f"Bearer {xai_key}", "Content-Type": "application/json"},
                            json={
                                "model": "grok-3-mini",
                                "messages": [{"role": "user", "content": f"Create a short social media video storyboard for {spec['name']} platform: {video_prompt}. 4 seconds, 9:16 vertical."}],
                                "temperature": 0.7,
                            }
                        )
                        if resp.status_code == 200:
                            storyboard_text = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                            vid_ai_provider = "xAI Grok"
                except Exception:
                    pass

            # Fallback: Gemini
            if not storyboard_text and GEMINI_API_KEY:
                try:
                    g = await gemini_chat(f"Describe a 4-second vertical social video for {spec['name']}: {video_prompt}")
                    storyboard_text = g.get("text", "")
                    if storyboard_text:
                        vid_ai_provider = "Gemini"
                except Exception:
                    pass

            vid_job_entry = {
                "id": vid_job_id,
                "type": "video",
                "status": "queued",
                "prompt": video_prompt,
                "platform": platform,
                "aspect_ratio": "9:16",
                "duration": 4,
                "storyboard": storyboard_text,
                "ai_provider_used": vid_ai_provider,
                "created_at": datetime.now().isoformat(),
                "message": (
                    f"Video queued for {spec['name']}. "
                    "A dedicated video API key (Sora/Runway/Veo) is needed to render. "
                    + (f"Storyboard prepared by {vid_ai_provider}." if vid_ai_provider else "")
                ),
            }
            video_queue.insert(0, vid_job_entry)
            results["video"] = vid_job_entry

        except Exception as e:
            print(f"[Social] Video queuing error: {e}")
            results["video"] = {"error": str(e)[:200]}

    results["success"] = True
    return JSONResponse(results)


@app.get("/api/social/platform-specs")
async def social_platform_specs():
    """Return all platform specifications."""
    return JSONResponse(SOCIAL_PLATFORM_SPECS)


# ── Voice-to-Text (Speech-to-Text) via Deepgram ──────────────────────────────

@app.post("/api/studio/transcribe")
async def studio_transcribe_audio(request: Request):
    """Transcribe audio from Builder voice input via Deepgram."""
    content_type = request.headers.get("content-type", "")

    if "multipart/form-data" in content_type:
        form = await request.form()
        audio_file = form.get("audio")
        if not audio_file:
            return JSONResponse({"error": "No audio file"}, status_code=400)
        audio_data = await audio_file.read()
        mime = audio_file.content_type or "audio/webm"
    else:
        audio_data = await request.body()
        mime = content_type or "audio/webm"

    if not audio_data or len(audio_data) < 100:
        return JSONResponse({"error": "Audio too short"}, status_code=400)

    deepgram_key = os.environ.get("DEEPGRAM_API_KEY", "")
    assemblyai_key = os.environ.get("ASSEMBLYAI_API_KEY", "")

    # Try Deepgram first
    if deepgram_key:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=en",
                    headers={
                        "Authorization": f"Token {deepgram_key}",
                        "Content-Type": mime,
                    },
                    content=audio_data,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    transcript = data.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])[0].get("transcript", "")
                    if transcript:
                        return JSONResponse({"text": transcript, "provider": "deepgram"})
        except Exception as e:
            print(f"[STT] Deepgram error: {e}")

    # Fallback to AssemblyAI
    if assemblyai_key:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                # Upload audio
                upload_resp = await client.post(
                    "https://api.assemblyai.com/v2/upload",
                    headers={"authorization": assemblyai_key},
                    content=audio_data,
                )
                upload_url = upload_resp.json().get("upload_url")
                if upload_url:
                    # Request transcription
                    transcript_resp = await client.post(
                        "https://api.assemblyai.com/v2/transcript",
                        headers={"authorization": assemblyai_key, "Content-Type": "application/json"},
                        json={"audio_url": upload_url, "language_code": "en"},
                    )
                    transcript_id = transcript_resp.json().get("id")
                    # Poll for completion (up to 30s)
                    for _ in range(30):
                        await asyncio.sleep(1)
                        poll_resp = await client.get(
                            f"https://api.assemblyai.com/v2/transcript/{transcript_id}",
                            headers={"authorization": assemblyai_key},
                        )
                        poll_data = poll_resp.json()
                        if poll_data.get("status") == "completed":
                            return JSONResponse({"text": poll_data.get("text", ""), "provider": "assemblyai"})
                        elif poll_data.get("status") == "error":
                            break
        except Exception as e:
            print(f"[STT] AssemblyAI error: {e}")

    return JSONResponse({"error": "Transcription failed — no STT provider available"}, status_code=500)


# ── ElevenLabs TTS — Text-to-Speech for chat responses ────────────────────────

@app.post("/api/tts")
async def text_to_speech(request: Request):
    """Convert text to speech using ElevenLabs eleven_multilingual_v2.
    Returns base64 audio data.
    Supports 17 languages with auto-detection."""
    body = await request.json()
    text = body.get("text", "")
    voice_id = body.get("voice_id", "JBFqnCBsd6RMkjVDRZzb")  # Default: George
    model_id = body.get("model_id", "eleven_multilingual_v2")
    output_format = body.get("output_format", "mp3_44100_128")

    if not text or len(text.strip()) < 1:
        return JSONResponse({"error": "Text required"}, status_code=400)

    el_key = os.environ.get("ELEVENLABS_API_KEY", "")
    if not el_key:
        return JSONResponse({"error": "ElevenLabs API key not configured"}, status_code=500)

    # Truncate very long text to prevent timeout (ElevenLabs limit ~5000 chars)
    if len(text) > 4500:
        text = text[:4500] + "..."

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                headers={
                    "xi-api-key": el_key,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg",
                },
                json={
                    "text": text,
                    "model_id": model_id,
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                        "style": 0.0,
                        "use_speaker_boost": True,
                    },
                    "output_format": output_format,
                },
            )
            if resp.status_code == 200:
                audio_bytes = resp.content
                b64 = base64.b64encode(audio_bytes).decode()
                return JSONResponse({
                    "audio": f"data:audio/mpeg;base64,{b64}",
                    "format": "mp3",
                    "voice_id": voice_id,
                    "model_id": model_id,
                    "chars": len(text),
                })
            else:
                err = resp.text[:300]
                print(f"[TTS] ElevenLabs error {resp.status_code}: {err}")
                return JSONResponse({"error": f"TTS failed: {resp.status_code}"}, status_code=resp.status_code)
    except Exception as e:
        print(f"[TTS] Error: {e}")
        return JSONResponse({"error": f"TTS error: {str(e)[:200]}"}, status_code=500)


# ── ElevenLabs Webhook Receiver ───────────────────────────────────────────────

@app.post("/api/webhooks/elevenlabs")
async def elevenlabs_webhook(request: Request):
    """Receive webhook callbacks from ElevenLabs.
    Events: transcription_completed, voice_removal_notice.
    Payloads are HMAC-signed with ElevenLabs-Signature header."""
    import hmac
    import hashlib

    body_bytes = await request.body()
    signature = request.headers.get("ElevenLabs-Signature", "")
    webhook_secret = os.environ.get("ELEVENLABS_WEBHOOK_SECRET", "")

    # Verify HMAC signature if secret is configured
    if webhook_secret and signature:
        expected = hmac.new(
            webhook_secret.encode(), body_bytes, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            print("[ElevenLabs Webhook] Signature mismatch")
            return JSONResponse({"error": "Invalid signature"}, status_code=401)

    try:
        payload = json.loads(body_bytes)
    except json.JSONDecodeError:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    event_type = payload.get("type", payload.get("event", "unknown"))
    print(f"[ElevenLabs Webhook] Event: {event_type}")
    print(f"[ElevenLabs Webhook] Payload keys: {list(payload.keys())}")

    if event_type == "transcription_completed":
        # Handle transcription completion
        transcript_text = payload.get("text", payload.get("transcript", ""))
        language = payload.get("language_code", "auto")
        print(f"[ElevenLabs Webhook] Transcription ({language}): {transcript_text[:200]}")
        # Could store to Supabase, trigger GHL workflow, etc.

    elif event_type == "voice_removal_notice":
        voice_id = payload.get("voice_id", "")
        print(f"[ElevenLabs Webhook] Voice removal notice: {voice_id}")

    # Always return 200 to acknowledge receipt
    return JSONResponse({"received": True, "event": event_type})


# ── ElevenLabs Conversational AI signed URL ───────────────────────────────────

@app.get("/api/voice/signed-url")
async def get_voice_signed_url():
    """Get a signed URL for ElevenLabs Conversational AI WebSocket.
    This keeps the API key server-side — client never sees it."""
    el_key = os.environ.get("ELEVENLABS_API_KEY", "")
    agent_id = os.environ.get("ELEVENLABS_AGENT_ID_KEY", os.environ.get("ELEVENLABS_AGENT_ID", ""))

    if not el_key or not agent_id:
        return JSONResponse({"error": "ElevenLabs not configured"}, status_code=500)

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id={agent_id}",
                headers={"xi-api-key": el_key},
            )
            if resp.status_code == 200:
                data = resp.json()
                return JSONResponse({"signed_url": data.get("signed_url", "")})
            else:
                print(f"[Voice] Signed URL error {resp.status_code}: {resp.text[:200]}")
                return JSONResponse({"error": f"Could not get signed URL: {resp.status_code}"}, status_code=resp.status_code)
    except Exception as e:
        print(f"[Voice] Signed URL error: {e}")
        return JSONResponse({"error": str(e)[:200]}, status_code=500)


# ───────────────────────────────────────────────────────────────────────────────
# CAREER SUITE — v7.30.0
# Job search, resume builder, digital cards, interview prep, AI coaching
# Replaces WarRoom
# ───────────────────────────────────────────────────────────────────────────────

CAREER_COACH_SYSTEM = """You are SAL™, SaintSal™ Labs' elite AI Career Coach — a synthesis of:
- Top executive recruiter (Goldman Sachs, McKinsey, FAANG placement specialist)
- Career strategist for Fortune 500 executives and startup founders
- Negotiation expert (salary, equity, offers)
- Interview coach (behavioral, technical, case study, panel)

Your role: Give DIRECT, ACTIONABLE career advice. No fluff. Lead with the answer.
When asked about interviews: give specific questions AND model answers.
When asked about salary: give real numbers and negotiation scripts.
When asked about career moves: give strategic frameworks.
Context: User is on SaintSal™ Career Suite — they have access to job search, resume tools, and GoHighLevel CRM."""

_job_tracker_store: dict = {}  # In-memory; in prod use Supabase

def _extract_company_from_title(title: str, url: str) -> str:
    parts = title.split(" at ") if " at " in title else title.split(" - ")
    return parts[-1].strip() if len(parts) > 1 else url.split("/")[2].replace("www.", "") if "://" in url else "Unknown"

def _extract_source(url: str) -> str:
    domains = {"linkedin.com":"LinkedIn","indeed.com":"Indeed","glassdoor.com":"Glassdoor",
               "lever.co":"Lever","greenhouse.io":"Greenhouse","ziprecruiter.com":"ZipRecruiter",
               "dice.com":"Dice","monster.com":"Monster","wellfound.com":"Wellfound"}
    for domain, name in domains.items():
        if domain in url: return name
    return "Job Board"

@app.get("/api/career/jobs/search")
async def career_search_jobs(
    query: str,
    location: str = "",
    job_type: str = "",
    remote: bool = False,
    page: int = 1
):
    """Search jobs via Exa semantic search with Tavily fallback."""
    search_query = f"{query} job"
    if location: search_query += f" {location}"
    if job_type: search_query += f" {job_type}"
    if remote: search_query += " remote"

    exa_key = os.environ.get("EXA_API_KEY", "")
    tavily_key = os.environ.get("TAVILY_API_KEY", "")

    # Try Exa first
    if exa_key:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post("https://api.exa.ai/search",
                    headers={"x-api-key": exa_key, "Content-Type": "application/json"},
                    json={"query": search_query, "numResults": 10, "type": "neural", "useAutoprompt": True,
                          "includeDomains": ["linkedin.com","indeed.com","glassdoor.com","lever.co","greenhouse.io","workday.com","ziprecruiter.com","dice.com","wellfound.com"],
                          "contents": {"text": {"maxCharacters": 500}}})
                if r.status_code == 200:
                    data = r.json()
                    jobs = []
                    for item in data.get("results", []):
                        jobs.append({"id": str(uuid.uuid4())[:8], "title": item.get("title", "").replace(" - LinkedIn", "").replace(" | Indeed", ""),
                            "company": _extract_company_from_title(item.get("title", ""), item.get("url", "")),
                            "location": location or "See listing", "url": item.get("url", ""),
                            "snippet": (item.get("text", "")[:300] + "...") if item.get("text") else "",
                            "published": item.get("publishedDate", ""), "source": _extract_source(item.get("url", "")),
                            "remote": remote or "remote" in item.get("text", "").lower(), "saved": False})
                    return {"jobs": jobs, "total": len(jobs), "query": query, "provider": "Exa"}
        except Exception as e:
            print(f"[Career] Exa search error: {e}")

    # Tavily fallback
    if tavily_key:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post("https://api.tavily.com/search",
                    json={"api_key": tavily_key, "query": f"{query} job openings {location}", "search_depth": "basic", "max_results": 8})
                data = r.json()
                jobs = [{"id": str(uuid.uuid4())[:8], "title": res.get("title", ""),
                    "company": _extract_company_from_title(res.get("title", ""), res.get("url", "")),
                    "location": location or "See listing", "url": res.get("url", ""),
                    "snippet": res.get("content", "")[:300], "published": "",
                    "source": _extract_source(res.get("url", "")), "remote": remote, "saved": False
                } for res in data.get("results", [])]
                return {"jobs": jobs, "total": len(jobs), "query": query, "provider": "Tavily"}
        except Exception as e:
            print(f"[Career] Tavily search error: {e}")

    # AI fallback — use Perplexity Sonar
    pplx_key = os.environ.get("PPLX_API_KEY", "")
    if pplx_key:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post("https://api.perplexity.ai/chat/completions",
                    headers={"Authorization": f"Bearer {pplx_key}", "Content-Type": "application/json"},
                    json={"model": "sonar-pro", "messages": [{"role": "user", "content": f"Find current job openings for: {search_query}. Return title, company, location, and URL for each."}]})
                if r.status_code == 200:
                    text = r.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                    return {"jobs": [{"id": "ai-1", "title": query, "company": "Various", "location": location or "Multiple",
                        "url": "", "snippet": text[:500], "source": "AI Search", "remote": remote, "saved": False}],
                        "total": 1, "query": query, "provider": "AI"}
        except: pass

    return {"jobs": [], "total": 0, "query": query, "error": "No search provider available"}


@app.get("/api/career/company-intel")
async def career_company_intel(company: str):
    """AI company research for interview prep."""
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
    apollo_key = os.environ.get("APOLLO_API_KEY", "")
    org_data = {}

    # Apollo enrichment
    if apollo_key:
        try:
            async with httpx.AsyncClient(timeout=12) as client:
                r = await client.post("https://api.apollo.io/v1/organizations/search",
                    headers={"Content-Type": "application/json"},
                    json={"api_key": apollo_key, "q_organization_name": company, "page": 1, "per_page": 1})
                if r.status_code == 200:
                    org_data = r.json().get("organizations", [{}])[0]
        except Exception as e:
            print(f"[Career] Apollo error: {e}")

    prompt = f"""Research this company for interview prep:
Company: {company}
Data: {json.dumps(org_data, default=str)[:500] if org_data else 'Limited data'}

Return JSON:
{{"overview": "2-3 sentence overview", "culture_points": ["3-4 bullet points"],
"interview_tips": ["4-5 specific tips"], "questions_to_ask": ["3-4 smart questions"],
"recent_news": "notable developments", "industry": "sector", "size": "company size"}}
Return ONLY valid JSON."""

    if anthropic_key:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post("https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": anthropic_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    json={"model": "claude-sonnet-4-20250514", "max_tokens": 800, "messages": [{"role": "user", "content": prompt}]})
                if r.status_code == 200:
                    text = r.json().get("content", [{}])[0].get("text", "{}")
                    intel = json.loads(text)
                    return {"company": company, "intel": intel}
        except Exception as e:
            print(f"[Career] Company intel AI error: {e}")

    return {"company": company, "intel": {"overview": "Research unavailable.", "interview_tips": [], "questions_to_ask": []}}


@app.post("/api/career/resume/ai-enhance")
async def career_resume_enhance(request: Request):
    """AI-enhance resume content."""
    body = await request.json()
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not anthropic_key:
        return JSONResponse({"error": "AI not configured"}, status_code=500)

    prompt = f"""You are a top-tier executive resume writer (Goldman Sachs, McKinsey level).
Enhance this resume content. Make bullets achievement-oriented with metrics.

Name: {body.get('full_name','')}
Title: {body.get('title','')}
Summary: {body.get('summary','')}
Experience: {json.dumps(body.get('experience',[])[:3])}
Skills: {', '.join(body.get('skills',[])[:15])}

Return JSON:
{{"enhanced_summary": "powerful 3-sentence professional summary",
"enhanced_bullets": {{"0": ["bullet1", "bullet2", "bullet3"]}},
"ats_keywords": ["10 ATS keywords"],
"skills_categorized": {{"Technical": [], "Leadership": [], "Domain": []}},
"cover_letter_opener": "compelling first paragraph"}}
Return ONLY valid JSON."""

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post("https://api.anthropic.com/v1/messages",
                headers={"x-api-key": anthropic_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": "claude-sonnet-4-20250514", "max_tokens": 1200, "messages": [{"role": "user", "content": prompt}]})
            if r.status_code == 200:
                text = r.json().get("content", [{}])[0].get("text", "{}")
                return {"status": "success", "enhanced": json.loads(text)}
    except Exception as e:
        return {"status": "error", "error": str(e)}
    return {"status": "error", "error": "AI enhancement failed"}


@app.post("/api/career/coach/chat")
async def career_coach_chat(request: Request):
    """SAL Career Coach — interview prep, salary negotiation, career path."""
    body = await request.json()
    message = body.get("message", "")
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not anthropic_key:
        return JSONResponse({"error": "AI not configured"}, status_code=500)

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post("https://api.anthropic.com/v1/messages",
                headers={"x-api-key": anthropic_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": "claude-sonnet-4-20250514", "max_tokens": 1000, "system": CAREER_COACH_SYSTEM,
                      "messages": [{"role": "user", "content": message}]})
            if r.status_code == 200:
                text = r.json().get("content", [{}])[0].get("text", "")
                return {"response": text}
    except Exception as e:
        return {"response": f"Coach temporarily unavailable: {str(e)[:100]}"}
    return {"response": "Coach unavailable. Try again."}


@app.post("/api/career/coach/interview-prep")
async def career_interview_prep(request: Request):
    """Generate targeted interview prep package."""
    body = await request.json()
    company = body.get("company", "")
    role = body.get("role", "")
    interview_type = body.get("interview_type", "behavioral")
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")

    prompt = f"""Create a complete interview prep package:
Company: {company}, Role: {role}, Type: {interview_type}

Return JSON:
{{"likely_questions": [{{"question": "...", "why_they_ask": "...", "model_answer": "..."}}],
"star_examples": ["3 STAR method story starters"],
"salary_range": {{"low": 0, "mid": 0, "high": 0, "currency": "USD", "note": "..."}},
"negotiation_script": "exact script for when they make an offer",
"red_flags_to_watch": ["3 red flags"],
"day_of_checklist": ["8 items"]}}
Return ONLY valid JSON."""

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post("https://api.anthropic.com/v1/messages",
                headers={"x-api-key": anthropic_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": "claude-sonnet-4-20250514", "max_tokens": 1500, "messages": [{"role": "user", "content": prompt}]})
            if r.status_code == 200:
                text = r.json().get("content", [{}])[0].get("text", "{}")
                return {"status": "success", "prep": json.loads(text), "company": company, "role": role}
    except Exception as e:
        return {"status": "error", "error": str(e)}
    return {"status": "error", "error": "Interview prep generation failed"}


@app.post("/api/career/signature/generate")
async def career_generate_signature(request: Request):
    """Generate professional HTML email signature."""
    body = await request.json()
    name = body.get("name", "")
    title = body.get("title", "")
    company = body.get("company", "")
    email = body.get("email", "")
    phone = body.get("phone", "")
    website = body.get("website", "")
    linkedin = body.get("linkedin", "")
    accent = body.get("accent_color", "#4F8EF7")
    dark = body.get("banner_color", "#0D0F14")

    sig_html = f"""<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,sans-serif;font-size:13px;color:#333;max-width:520px">
  <tr><td style="padding:0 0 12px 0"><table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tr>
    <td style="vertical-align:top"><div style="font-size:16px;font-weight:800;color:{dark};margin-bottom:1px">{name}</div>
    <div style="font-size:12px;color:{accent};font-weight:600;text-transform:uppercase;letter-spacing:0.5px">{title} · {company}</div></td>
  </tr></table></td></tr>
  <tr><td style="border-top:2px solid {accent};padding:10px 0 0 0"><table cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="padding-right:20px;font-size:11px;color:#666">✉ <a href="mailto:{email}" style="color:{accent};text-decoration:none">{email}</a></td>
    <td style="font-size:11px;color:#666">📞 <a href="tel:{phone}" style="color:#333;text-decoration:none">{phone}</a></td>
  # website/linkedin links - rendered separately
  </table></td></tr>
  <tr><td style="padding-top:10px"><div style="background:linear-gradient(90deg,{dark},{accent}22);border-radius:4px;padding:6px 12px;display:inline-block">
    <span style="font-size:9px;color:#fff;letter-spacing:2px;text-transform:uppercase;font-weight:600">Powered by SaintSal™ AI</span></div></td></tr>
</table>"""

    return {"signature_html": sig_html}


@app.post("/api/career/cards/generate")
async def career_generate_card(request: Request):
    """Generate digital business card with QR code that saves to phone contacts."""
    body = await request.json()
    name = body.get("name", "")
    title = body.get("title", "")
    company = body.get("company", "")
    email = body.get("email", "")
    phone = body.get("phone", "")
    website = body.get("website", "")
    linkedin = body.get("linkedin", "")
    tagline = body.get("tagline", "")
    instagram = body.get("instagram", "")
    twitter = body.get("twitter", "")
    address = body.get("address", "")
    accent = body.get("accent_color", "#D4A843")
    template = body.get("template", "executive")
    card_id = str(uuid.uuid4())[:8]

    # Build vCard 3.0 spec
    vcard_lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        f"FN:{name}",
    ]
    if title:
        vcard_lines.append(f"TITLE:{title}")
    if company:
        vcard_lines.append(f"ORG:{company}")
    if email:
        vcard_lines.append(f"EMAIL;TYPE=WORK:{email}")
    if phone:
        vcard_lines.append(f"TEL;TYPE=CELL:{phone}")
    if website:
        vcard_lines.append(f"URL:{website}")
    if address:
        vcard_lines.append(f"ADR;TYPE=WORK:;;{address}")
    if linkedin:
        vcard_lines.append(f"X-SOCIALPROFILE;TYPE=linkedin:{linkedin}")
    if instagram:
        vcard_lines.append(f"X-SOCIALPROFILE;TYPE=instagram:{instagram}")
    if twitter:
        vcard_lines.append(f"X-SOCIALPROFILE;TYPE=twitter:{twitter}")
    if tagline:
        vcard_lines.append(f"NOTE:{tagline}")
    vcard_lines.append("END:VCARD")
    vcard = "\n".join(vcard_lines)

    import base64 as _b64
    vcard_b64 = _b64.b64encode(vcard.encode()).decode()

    # Generate QR code PNG with vCard data embedded
    qr_png = ""
    try:
        import qrcode
        from io import BytesIO
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=2,
        )
        qr.add_data(vcard)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#111111", back_color="#ffffff")
        buf = BytesIO()
        img.save(buf, format="PNG")
        qr_png = _b64.b64encode(buf.getvalue()).decode()
    except Exception as e:
        print(f"QR generation error: {e}")

    return {
        "card_id": card_id,
        "vcard_b64": vcard_b64,
        "qr_png": qr_png,
        "template": template
    }


@app.get("/api/career/backgrounds/templates")
async def career_background_templates():
    """Return professional video background templates."""
    return {"templates": [
        {"id": "executive_office", "name": "Executive Office", "desc": "Dark, prestigious boardroom", "gradient": "linear-gradient(135deg, #0D0F14 0%, #1a1f2e 50%, #0f1621 100%)", "tier": "free"},
        {"id": "modern_startup", "name": "Modern Startup", "desc": "Clean, bright tech vibe", "gradient": "linear-gradient(120deg, #e0e7ff 0%, #f0f4ff 50%, #dde4ff 100%)", "tier": "free"},
        {"id": "power_blue", "name": "Power Blue", "desc": "Corporate blue authority", "gradient": "linear-gradient(135deg, #1e3a5f 0%, #2d5986 50%, #1a3352 100%)", "tier": "free"},
        {"id": "saintsalai", "name": "SaintSal™ Brand", "desc": "Official branded background", "gradient": "linear-gradient(135deg, #0D0F14 0%, #0d1a2e 40%, #1a0d2e 100%)", "tier": "starter"},
        {"id": "library_warm", "name": "Library Scholar", "desc": "Warm bookshelf aesthetic", "gradient": "linear-gradient(160deg, #2c1810 0%, #3d2314 50%, #1a0f08 100%)", "tier": "starter"},
        {"id": "minimal_white", "name": "Minimal Studio", "desc": "Clean white studio", "gradient": "linear-gradient(180deg, #f8f9fa 0%, #ffffff 100%)", "tier": "free"},
        {"id": "finance_dark", "name": "Finance Dark", "desc": "Wall Street meets Silicon Valley", "gradient": "linear-gradient(135deg, #0a0a0a 0%, #1c1c1c 50%, #111118 100%)", "tier": "pro"},
        {"id": "tech_gradient", "name": "Tech Aurora", "desc": "Dynamic tech-forward gradient", "gradient": "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)", "tier": "pro"}
    ]}


@app.post("/api/career/tracker/add")
async def career_tracker_add(request: Request):
    """Add job to tracker."""
    body = await request.json()
    job_id = str(uuid.uuid4())[:8]
    from datetime import datetime as _dt
    _job_tracker_store[job_id] = {
        "id": job_id, "job_title": body.get("job_title", ""), "company": body.get("company", ""),
        "url": body.get("url", ""), "status": body.get("status", "wishlist"),
        "notes": body.get("notes", ""), "added_at": _dt.now().isoformat()
    }
    return {"status": "success", "job_id": job_id, "job": _job_tracker_store[job_id]}

@app.get("/api/career/tracker/all")
async def career_tracker_all():
    """Get all tracked jobs as Kanban."""
    jobs = list(_job_tracker_store.values())
    return {"kanban": {
        "wishlist": [j for j in jobs if j["status"] == "wishlist"],
        "applied": [j for j in jobs if j["status"] == "applied"],
        "interview": [j for j in jobs if j["status"] == "interview"],
        "offer": [j for j in jobs if j["status"] == "offer"],
        "rejected": [j for j in jobs if j["status"] == "rejected"]
    }, "total": len(jobs)}

@app.put("/api/career/tracker/{job_id}/status")
async def career_tracker_update(job_id: str, request: Request):
    body = await request.json()
    if job_id not in _job_tracker_store:
        return JSONResponse({"error": "Job not found"}, status_code=404)
    _job_tracker_store[job_id]["status"] = body.get("status", "wishlist")
    return {"status": "success", "job": _job_tracker_store[job_id]}




# ── Builder Publishing Pipeline Endpoints ──────────────────────────────────────

@app.get("/api/usage/credits")
async def get_usage_credits(request: Request):
    """Get current user's credit balance and usage."""
    user = getattr(request.state, "user", None)
    tier = "free"
    credits_remaining = 0
    credits_used = 0
    total_credits = 0
    minutes_used = 0
    
    if user and supabase_admin:
        try:
            p = supabase_admin.table("profiles").select("tier, credits, credits_used, compute_minutes").eq("id", user["id"]).single().execute()
            if p.data:
                tier = p.data.get("tier", "free")
                credits_remaining = p.data.get("credits", 0)
                credits_used = p.data.get("credits_used", 0)
                total_credits = credits_remaining + credits_used
                minutes_used = p.data.get("compute_minutes", 0)
        except:
            pass
    
    tier_limits = {
        "free": {"minutes": 10, "price": 0},
        "starter": {"minutes": 100, "price": 27},
        "pro": {"minutes": 500, "price": 97},
        "teams": {"minutes": 2000, "price": 297}
    }
    limits = tier_limits.get(tier, tier_limits["free"])
    
    return {
        "tier": tier,
        "credits_remaining": credits_remaining,
        "credits_used": credits_used,
        "total_credits": total_credits,
        "minutes_used": round(minutes_used, 2),
        "minutes_limit": limits["minutes"],
        "tier_price": limits["price"]
    }


@app.post("/api/billing/checkout")
async def billing_checkout(request: Request):
    """Create a Stripe checkout session for adding payment method or upgrading."""
    import stripe as _stripe
    STRIPE_KEY = os.environ.get("STRIPE_SECRET_KEY", os.environ.get("STRIPE_KEY", ""))
    if not STRIPE_KEY:
        return JSONResponse({"error": "Stripe not configured"}, status_code=500)
    _stripe.api_key = STRIPE_KEY
    
    try:
        body = await request.json()
        price_id = body.get("price_id", "")
        mode = body.get("mode", "subscription")
        success_url = body.get("success_url", "https://saintsallabs.com/#account")
        cancel_url = body.get("cancel_url", "https://saintsallabs.com/#pricing")
        
        session_params = {
            "mode": mode,
            "success_url": success_url + "?session_id={CHECKOUT_SESSION_ID}",
            "cancel_url": cancel_url,
        }
        
        if price_id:
            session_params["line_items"] = [{"price": price_id, "quantity": 1}]
        else:
            session_params["mode"] = "setup"
            session_params["payment_method_types"] = ["card"]
        
        user = getattr(request.state, "user", None)
        if user:
            session_params["client_reference_id"] = user.get("id", "")
            email = user.get("email", "")
            if email:
                session_params["customer_email"] = email
        
        session = _stripe.checkout.Session.create(**session_params)
        return {"url": session.url, "session_id": session.id}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/billing/portal")
async def billing_portal(request: Request):
    """Create a Stripe billing portal session."""
    import stripe as _stripe
    STRIPE_KEY = os.environ.get("STRIPE_SECRET_KEY", os.environ.get("STRIPE_KEY", ""))
    if not STRIPE_KEY:
        return JSONResponse({"error": "Stripe not configured"}, status_code=500)
    _stripe.api_key = STRIPE_KEY
    
    try:
        body = await request.json()
        customer_id = body.get("customer_id", "")
        return_url = body.get("return_url", "https://saintsallabs.com/#account")
        
        if not customer_id:
            user = getattr(request.state, "user", None)
            if user and supabase_admin:
                try:
                    p = supabase_admin.table("profiles").select("stripe_customer_id").eq("id", user["id"]).single().execute()
                    customer_id = (p.data or {}).get("stripe_customer_id", "")
                except:
                    pass
        
        if not customer_id:
            return JSONResponse({"error": "No Stripe customer found. Please add a payment method first."}, status_code=400)
        
        session = _stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=return_url,
        )
        return {"url": session.url}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# v8.9.0 — Builder GitHub Connection Endpoints
@app.get("/api/builder/github/status")
async def builder_github_status():
    """Check if GitHub PAT is configured on the server."""
    pat = os.environ.get("GITHUB_PAT", "") or os.environ.get("GITHUB_PRIVATE_ACCESS_TOKEN", "")
    vercel = os.environ.get("VERCEL_API_ACCESS_TOKEN", "")
    return {
        "configured": bool(pat),
        "vercel_configured": bool(vercel),
        "org": "SaintVisions-SaintSal" if pat else None,
    }


@app.post("/api/builder/github/connect")
async def builder_github_connect(request: Request):
    """Connect to a GitHub repo — creates it if it doesn't exist."""
    GITHUB_PAT = os.environ.get("GITHUB_PAT", "") or os.environ.get("GITHUB_PRIVATE_ACCESS_TOKEN", "")
    if not GITHUB_PAT:
        return JSONResponse({"success": False, "error": "GitHub not configured on server"}, status_code=500)
    body = await request.json()
    repo_name = (body.get("repo", "") or "my-project").strip().lower().replace(" ", "-")
    GITHUB_ORG = "SaintVisions-SaintSal"
    headers = {
        "Authorization": f"Bearer {GITHUB_PAT}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Check if repo already exists
            if "/" in repo_name:
                # User typed owner/repo format
                full_name = repo_name
                repo_url = f"https://api.github.com/repos/{full_name}"
            else:
                full_name = f"{GITHUB_ORG}/{repo_name}"
                repo_url = f"https://api.github.com/repos/{full_name}"
            resp = await client.get(repo_url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                return {"success": True, "full_name": data.get("full_name", full_name), "repo_url": data.get("html_url", ""), "exists": True}
            # Create repo
            create_resp = await client.post(
                "https://api.github.com/user/repos",
                headers=headers,
                json={"name": repo_name.split("/")[-1], "description": "SaintSal Labs Builder project", "private": False, "auto_init": True},
            )
            if create_resp.status_code in (200, 201):
                data = create_resp.json()
                return {"success": True, "full_name": data.get("full_name", full_name), "repo_url": data.get("html_url", ""), "created": True}
            return {"success": False, "error": f"GitHub API error: {create_resp.status_code}"}
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


@app.post("/api/builder/domain/add")
async def builder_add_domain(request: Request):
    """Add a custom domain to a Vercel project and return DNS records."""
    VERCEL_TOKEN = os.environ.get("VERCEL_API_ACCESS_TOKEN", "")
    if not VERCEL_TOKEN:
        return JSONResponse({"error": "Vercel API token not configured"}, status_code=500)
    
    try:
        body = await request.json()
        domain = body.get("domain", "").strip().lower()
        project_name = body.get("project_name", "").strip()
        deployment_id = body.get("deployment_id", "")
        
        if not domain:
            return JSONResponse({"error": "Domain is required"}, status_code=400)
        
        headers = {
            "Authorization": f"Bearer {VERCEL_TOKEN}",
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient(timeout=30) as client:
            # Add domain to Vercel project
            resp = await client.post(
                f"https://api.vercel.com/v10/projects/{project_name}/domains",
                headers=headers,
                json={"name": domain}
            )
            
            if resp.status_code in (200, 201):
                data = resp.json()
                # Generate DNS records based on domain type
                is_subdomain = domain.count(".") > 1 or domain.startswith("www.")
                dns_records = []
                if is_subdomain:
                    dns_records.append({"type": "CNAME", "name": domain.split(".")[0], "value": "cname.vercel-dns.com", "ttl": 3600})
                else:
                    dns_records.append({"type": "A", "name": "@", "value": "76.76.21.21", "ttl": 3600})
                    dns_records.append({"type": "CNAME", "name": "www", "value": "cname.vercel-dns.com", "ttl": 3600})
                
                # Check if verification is needed
                verification = data.get("verification", [])
                for v in verification:
                    dns_records.append({"type": v.get("type", "TXT"), "name": v.get("domain", "@"), "value": v.get("value", ""), "ttl": 3600})
                
                return {
                    "success": True,
                    "domain": domain,
                    "dns_records": dns_records,
                    "verified": data.get("verified", False),
                    "message": f"Domain {domain} added to Vercel project. Configure the DNS records below."
                }
            elif resp.status_code == 409:
                return {"success": True, "domain": domain, "dns_records": [], "verified": True, "message": "Domain already configured."}
            else:
                error_data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                return JSONResponse({"error": error_data.get("error", {}).get("message", f"Vercel API error: {resp.status_code}")}, status_code=502)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/builder/subdomain")
async def builder_claim_subdomain(request: Request):
    """Claim a subdomain on saintsallabs.com for free publishing."""
    VERCEL_TOKEN = os.environ.get("VERCEL_API_ACCESS_TOKEN", "")
    
    try:
        body = await request.json()
        slug = body.get("slug", "").strip().lower()
        slug = "".join(c for c in slug if c.isalnum() or c == "-")
        
        if not slug or len(slug) < 3:
            return JSONResponse({"error": "Subdomain must be at least 3 characters"}, status_code=400)
        
        subdomain = f"{slug}.saintsallabs.com"
        
        # If Vercel token available, try to add to project
        if VERCEL_TOKEN:
            headers = {"Authorization": f"Bearer {VERCEL_TOKEN}", "Content-Type": "application/json"}
            async with httpx.AsyncClient(timeout=15) as client:
                # Check if subdomain is available
                check = await client.get(f"https://api.vercel.com/v6/domains/saintsallabs.com/records", headers=headers)
                existing = []
                if check.status_code == 200:
                    existing = [r.get("name", "") for r in check.json().get("records", [])]
                
                if slug in existing:
                    return JSONResponse({"error": f"{subdomain} is already taken. Try another name."}, status_code=409)
        
        return {
            "success": True,
            "subdomain": subdomain,
            "url": f"https://{subdomain}",
            "message": f"Subdomain {subdomain} reserved. Deploy your project to publish it there."
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# ═══════════════════════════════════════════════════════════════════════════════
# SAL PERSONALITY / SETTINGS — Custom Instructions, Response Prefs, Memory
# ═══════════════════════════════════════════════════════════════════════════════

# In-memory fallback for personality settings (per-user via Supabase when available)
_personality_cache: dict = {}

@app.get("/api/settings/personality")
async def get_personality_settings(authorization: Optional[str] = Header(None)):
    """Load user's SAL personality settings."""
    user = await get_current_user(authorization)
    user_id = user["id"] if user else "anonymous"
    
    # Try Supabase first
    if user and supabase_admin:
        try:
            result = supabase_admin.table("personality_settings").select("*").eq("user_id", user["id"]).single().execute()
            if result.data:
                return result.data
        except Exception:
            pass  # Table may not exist yet — fall through to cache
    
    # Fall back to in-memory cache
    cached = _personality_cache.get(user_id, {})
    return {
        "occupation": cached.get("occupation", ""),
        "custom_instructions": cached.get("custom_instructions", ""),
        "response_length": cached.get("response_length", "default"),
        "headers_lists": cached.get("headers_lists", "default"),
        "reference_history": cached.get("reference_history", True),
        "reference_memories": cached.get("reference_memories", True),
        "tone": cached.get("tone", "professional"),
    }


@app.post("/api/settings/personality")
async def save_personality_settings(request: Request, authorization: Optional[str] = Header(None)):
    """Save user's SAL personality settings."""
    body = await request.json()
    user = await get_current_user(authorization)
    user_id = user["id"] if user else "anonymous"
    
    settings = {
        "occupation": str(body.get("occupation", ""))[:200],
        "custom_instructions": str(body.get("custom_instructions", ""))[:1500],
        "response_length": body.get("response_length", "default"),
        "headers_lists": body.get("headers_lists", "default"),
        "reference_history": bool(body.get("reference_history", True)),
        "reference_memories": bool(body.get("reference_memories", True)),
        "tone": body.get("tone", "professional"),
    }
    
    # Save to in-memory cache always
    _personality_cache[user_id] = settings
    
    # Try Supabase if available
    if user and supabase_admin:
        try:
            supabase_admin.table("personality_settings").upsert({
                "user_id": user["id"],
                **settings,
                "updated_at": datetime.now().isoformat(),
            }).execute()
            return {"success": True, "saved_to": "supabase"}
        except Exception as e:
            print(f"[Personality] Supabase save error (using cache): {e}")
    
    return {"success": True, "saved_to": "cache"}


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN FULFILLMENT DASHBOARD — Launch Pad Orders
# ══════════════════════════════════════════════════════════════════════════════

ADMIN_EMAILS = ["ryan@cookin.io", "ryan@hacpglobal.ai", "cap@hacpglobal.ai", "laliecapatosto86@gmail.com", "laliecapatosto96@gmail.com"]

# SUPER_ADMIN: Only this email can manage users (add, edit tiers, delete)
SUPER_ADMIN_EMAIL = "ryan@cookin.io"

async def require_admin(authorization: Optional[str] = Header(None)):
    """Verify the current user is an admin (any admin email — for orders, stats)."""
    user = await get_current_user(authorization)
    if not user or user.get("email", "").lower() not in [e.lower() for e in ADMIN_EMAILS]:
        return None
    return user

async def require_super_admin(authorization: Optional[str] = Header(None)):
    """Verify the current user is the SUPER ADMIN (ryan@cookin.io only — for user management)."""
    user = await get_current_user(authorization)
    if not user or user.get("email", "").lower() != SUPER_ADMIN_EMAIL.lower():
        return None
    return user

@app.get("/api/admin/check")
async def admin_check(authorization: Optional[str] = Header(None)):
    """Check if current user has admin access and super admin (user management) access."""
    user = await require_admin(authorization)
    is_super = user is not None and user.get("email", "").lower() == SUPER_ADMIN_EMAIL.lower()
    return {
        "is_admin": user is not None,
        "is_super_admin": is_super,
        "email": user.get("email") if user else None
    }


@app.get("/api/admin/orders")
async def admin_get_orders(status: Optional[str] = None, authorization: Optional[str] = Header(None)):
    """Get all Launch Pad orders for admin fulfillment dashboard."""
    user = await require_admin(authorization)
    if not user:
        return JSONResponse({"error": "Admin access required"}, status_code=403)
    
    # Try Supabase first
    if supabase_admin:
        try:
            query = supabase_admin.table("launch_pad_orders").select("*").order("created_at", desc=True)
            if status and status != "all":
                query = query.eq("status", status)
            result = query.execute()
            orders = result.data or []
            return {"orders": orders, "count": len(orders)}
        except Exception as e:
            print(f"[Admin] Supabase query error: {e}")
    
    # Fallback: return in-memory orders from corpnet + demo data
    in_memory = getattr(app, "_orders", [])
    demo_orders = [
        {
            "id": "demo-001",
            "status": "paid",
            "service_name": "LLC Formation — Basic Package",
            "entity_type": "LLC",
            "package_tier": "basic",
            "processing_speed": "standard",
            "filing_state": "CA",
            "business_name": "Acme Ventures LLC",
            "customer_name": "Demo Customer",
            "customer_email": "demo@example.com",
            "amount_charged": 19900,
            "corpnet_cost": 14900,
            "margin": 5000,
            "stripe_status": "paid",
            "stripe_session_id": "cs_demo_001",
            "corpnet_order_id": None,
            "notes": None,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        },
        {
            "id": "demo-002",
            "status": "in_fulfillment",
            "service_name": "S-Corp Formation — Deluxe Package",
            "entity_type": "SCorp",
            "package_tier": "deluxe",
            "processing_speed": "expedited",
            "filing_state": "DE",
            "business_name": "TechStar Inc",
            "customer_name": "Jane Smith",
            "customer_email": "jane@techstar.com",
            "amount_charged": 44900,
            "corpnet_cost": 29900,
            "margin": 15000,
            "stripe_status": "paid",
            "stripe_session_id": "cs_demo_002",
            "corpnet_order_id": "CN-78451293",
            "notes": "Expedited filing requested",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        },
        {
            "id": "demo-003",
            "status": "complete",
            "service_name": "Nonprofit Formation — Complete Package",
            "entity_type": "Nonprofit",
            "package_tier": "complete",
            "processing_speed": "standard",
            "filing_state": "NY",
            "business_name": "Hope Foundation Inc",
            "customer_name": "Michael Johnson",
            "customer_email": "michael@hope.org",
            "amount_charged": 69900,
            "corpnet_cost": 44900,
            "margin": 25000,
            "stripe_status": "paid",
            "stripe_session_id": "cs_demo_003",
            "corpnet_order_id": "CN-92831746",
            "notes": "All documents delivered via email",
            "documents_delivered_at": datetime.now().isoformat(),
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        },
    ]
    all_orders = demo_orders + in_memory
    if status and status != "all":
        all_orders = [o for o in all_orders if o.get("status") == status]
    return {"orders": all_orders, "count": len(all_orders)}


@app.put("/api/admin/orders/{order_id}")
async def admin_update_order(order_id: str, request: Request, authorization: Optional[str] = Header(None)):
    """Update an order's status, CorpNet ID, notes, etc."""
    user = await require_admin(authorization)
    if not user:
        return JSONResponse({"error": "Admin access required"}, status_code=403)
    
    body = await request.json()
    updates = {
        "updated_at": datetime.now().isoformat(),
    }
    for field in ["status", "corpnet_order_id", "notes", "corpnet_filed_at", "documents_delivered_at"]:
        if field in body:
            updates[field] = body[field]
    
    if supabase_admin:
        try:
            result = supabase_admin.table("launch_pad_orders").update(updates).eq("id", order_id).execute()
            return {"success": True, "order_id": order_id, "updates": updates, "source": "supabase"}
        except Exception as e:
            print(f"[Admin] Order update error: {e}")
            return JSONResponse({"error": f"Update failed: {e}"}, status_code=500)
    
    # Fallback: update in-memory
    orders = getattr(app, "_orders", [])
    for o in orders:
        if o.get("id") == order_id:
            o.update(updates)
            return {"success": True, "order_id": order_id, "updates": updates, "source": "memory"}
    
    return {"success": True, "order_id": order_id, "updates": updates, "source": "demo"}


@app.get("/api/admin/stats")
async def admin_stats(authorization: Optional[str] = Header(None)):
    """Get aggregate stats for admin dashboard."""
    user = await require_admin(authorization)
    if not user:
        return JSONResponse({"error": "Admin access required"}, status_code=403)
    
    if supabase_admin:
        try:
            result = supabase_admin.table("launch_pad_orders").select("status, amount_charged, margin, stripe_status").execute()
            orders = result.data or []
            paid_orders = [o for o in orders if o.get("stripe_status") == "paid"]
            return {
                "total_orders": len(orders),
                "awaiting_fulfillment": len([o for o in orders if o.get("status") == "paid"]),
                "in_fulfillment": len([o for o in orders if o.get("status") == "in_fulfillment"]),
                "completed": len([o for o in orders if o.get("status") == "complete"]),
                "total_revenue": sum(o.get("amount_charged", 0) for o in paid_orders),
                "total_margin": sum(o.get("margin", 0) for o in paid_orders),
            }
        except Exception as e:
            print(f"[Admin] Stats error: {e}")
    
    return {
        "total_orders": 3,
        "awaiting_fulfillment": 1,
        "in_fulfillment": 1,
        "completed": 1,
        "total_revenue": 134700,
        "total_margin": 45000,
    }


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN USER MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/admin/users")
async def admin_list_users(authorization: Optional[str] = Header(None)):
    """List all registered users for admin management. SUPER ADMIN ONLY (ryan@cookin.io)."""
    user = await require_super_admin(authorization)
    if not user:
        return JSONResponse({"error": "Super admin access required (ryan@cookin.io only)"}, status_code=403)
    
    users = []
    
    # Fetch from Supabase Auth Admin API
    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
        try:
            async with httpx.AsyncClient() as c:
                resp = await c.get(
                    f"{SUPABASE_URL}/auth/v1/admin/users",
                    headers={
                        "apikey": SUPABASE_SERVICE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"
                    },
                    params={"page": 1, "per_page": 500}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    for u in data.get("users", []):
                        meta = u.get("user_metadata", {})
                        users.append({
                            "id": u["id"],
                            "email": u.get("email", ""),
                            "full_name": meta.get("full_name", ""),
                            "role": meta.get("role", "user"),
                            "plan_tier": meta.get("plan_tier", "free"),
                            "meter_tier": meta.get("meter_tier", "mini"),
                            "email_confirmed": u.get("email_confirmed_at") is not None,
                            "last_sign_in": u.get("last_sign_in_at"),
                            "created_at": u.get("created_at"),
                            "is_admin": u.get("email", "").lower() in [e.lower() for e in ADMIN_EMAILS],
                        })
        except Exception as e:
            print(f"[Admin] User list error: {e}")
    
    return {"users": users, "count": len(users)}


class AdminCreateUser(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = ""
    role: Optional[str] = "user"
    plan_tier: Optional[str] = "free"

@app.post("/api/admin/users")
async def admin_create_user(data: AdminCreateUser, authorization: Optional[str] = Header(None)):
    """Create a new user. SUPER ADMIN ONLY (ryan@cookin.io)."""
    user = await require_super_admin(authorization)
    if not user:
        return JSONResponse({"error": "Super admin access required (ryan@cookin.io only)"}, status_code=403)
    
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return JSONResponse({"error": "Auth service not configured"}, status_code=503)
    
    try:
        async with httpx.AsyncClient() as c:
            resp = await c.post(
                f"{SUPABASE_URL}/auth/v1/admin/users",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "email": data.email,
                    "password": data.password,
                    "email_confirm": True,
                    "user_metadata": {
                        "full_name": data.full_name,
                        "role": data.role,
                        "plan_tier": data.plan_tier,
                    }
                }
            )
            if resp.status_code in (200, 201):
                new_user = resp.json()
                return {
                    "success": True,
                    "user": {
                        "id": new_user["id"],
                        "email": new_user.get("email"),
                        "role": data.role,
                        "plan_tier": data.plan_tier,
                    }
                }
            else:
                err = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {"msg": resp.text}
                return JSONResponse({"error": err.get("msg", err.get("message", str(err)))}, status_code=resp.status_code)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


class AdminUpdateUser(BaseModel):
    role: Optional[str] = None
    plan_tier: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    email_confirm: Optional[bool] = None

@app.put("/api/admin/users/{user_id}")
async def admin_update_user(user_id: str, data: AdminUpdateUser, authorization: Optional[str] = Header(None)):
    """Update a user's role, tier, name, or password. SUPER ADMIN ONLY (ryan@cookin.io)."""
    user = await require_super_admin(authorization)
    if not user:
        return JSONResponse({"error": "Super admin access required (ryan@cookin.io only)"}, status_code=403)
    
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return JSONResponse({"error": "Auth service not configured"}, status_code=503)
    
    try:
        update_body = {}
        meta_updates = {}
        if data.role is not None:
            meta_updates["role"] = data.role
        if data.plan_tier is not None:
            meta_updates["plan_tier"] = data.plan_tier
        if data.full_name is not None:
            meta_updates["full_name"] = data.full_name
        if meta_updates:
            update_body["user_metadata"] = meta_updates
        if data.password:
            update_body["password"] = data.password
        if data.email_confirm is not None:
            update_body["email_confirm"] = data.email_confirm
        
        async with httpx.AsyncClient() as c:
            resp = await c.put(
                f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json"
                },
                json=update_body
            )
            if resp.status_code == 200:
                # Also sync tier/role changes to profiles table
                if supabase_admin and (data.plan_tier or data.role or data.full_name):
                    try:
                        profile_updates = {}
                        if data.plan_tier:
                            profile_updates["tier"] = data.plan_tier
                            profile_updates["plan_tier"] = data.plan_tier
                            # Update credit limits based on tier
                            tier_limits = {"free": 100, "starter": 500, "pro": 2000, "teams": 5000, "enterprise": 999999}
                            profile_updates["request_limit"] = tier_limits.get(data.plan_tier, 100)
                        if data.full_name:
                            profile_updates["full_name"] = data.full_name
                        if profile_updates:
                            supabase_admin.table("profiles").update(profile_updates).eq("id", user_id).execute()
                            print(f"[Admin] Synced profile updates for {user_id[:8]}...: {list(profile_updates.keys())}")
                    except Exception as sync_err:
                        print(f"[Admin] Profile sync error (non-fatal): {sync_err}")
                return {"success": True, "user_id": user_id, "updates": update_body}
            else:
                return JSONResponse({"error": resp.text[:300]}, status_code=resp.status_code)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.delete("/api/admin/users/{user_id}")
async def admin_delete_user(user_id: str, authorization: Optional[str] = Header(None)):
    """Delete a user entirely. SUPER ADMIN ONLY (ryan@cookin.io). Cannot delete yourself."""
    admin = await require_super_admin(authorization)
    if not admin:
        return JSONResponse({"error": "Super admin access required (ryan@cookin.io only)"}, status_code=403)
    
    if user_id == admin.get("id"):
        return JSONResponse({"error": "Cannot delete your own account"}, status_code=400)
    
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return JSONResponse({"error": "Auth service not configured"}, status_code=503)
    
    try:
        async with httpx.AsyncClient() as c:
            resp = await c.delete(
                f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"
                }
            )
            if resp.status_code in (200, 204):
                # Also clean up profiles and compute_usage tables
                if supabase_admin:
                    try:
                        supabase_admin.table("compute_usage").delete().eq("user_id", user_id).execute()
                        supabase_admin.table("profiles").delete().eq("id", user_id).execute()
                        print(f"[Admin] Cleaned up profile + usage for deleted user {user_id[:8]}...")
                    except Exception as cleanup_err:
                        print(f"[Admin] Cleanup error (non-fatal): {cleanup_err}")
                return {"success": True, "user_id": user_id}
            else:
                return JSONResponse({"error": resp.text[:300]}, status_code=resp.status_code)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# ═══════════════════════════════════════════════
# SOCIAL STUDIO — Brand DNA, Campaigns, Media Library
# v8.0.0
# ═══════════════════════════════════════════════

# ── Brand DNA CRUD ──

@app.get("/api/social-studio/brand-dna")
async def get_brand_dna(request: Request, authorization: str = Header(None)):
    """Get user's brand DNA profile. v8.9.0 — returns brand_dna key for frontend compatibility."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")
    try:
        if supabase_admin:
            result = supabase_admin.table("brand_profiles").select("*").eq("user_id", user["id"]).eq("is_active", True).execute()
            if result.data:
                row = result.data[0]
                # v8.9.0 — Map DB fields to frontend-expected shape
                brand_dna = {
                    "id": row.get("id"),
                    "brand_name": row.get("brand_name", ""),
                    "tagline": row.get("tagline", ""),
                    "mission": row.get("unique_value_prop", ""),
                    "industry": row.get("industry", ""),
                    "voice": row.get("voice_tone", ""),
                    "tone_keywords": row.get("keywords", []),
                    "key_phrases": row.get("avoid_words", []),  # repurpose field for key phrases
                    "target_audience": row.get("target_audience", ""),
                    "content_pillars": row.get("content_pillars", []),
                    "hashtag_strategy": row.get("audience_pain_points", []),  # repurpose
                    "color_palette": {
                        "primary": row.get("primary_color", "#d4a843"),
                        "secondary": row.get("secondary_color", "#2ecc71")
                    },
                    "font_preferences": row.get("font_primary", ""),
                }
                return {"brand_dna": brand_dna}
        return {"brand_dna": None}
    except Exception as e:
        return {"brand_dna": None, "error": str(e)}


@app.post("/api/social-studio/brand-dna")
async def save_brand_dna(request: Request, authorization: str = Header(None)):
    """Create or update brand DNA profile. v8.9.0 — accepts frontend field names, maps to DB schema."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")
    body = await request.json()
    # v8.9.0 — Accept both frontend field names and DB field names
    color_palette = body.get("color_palette", {})
    brand_data = {
        "user_id": user["id"],
        "brand_name": body.get("brand_name", "My Brand"),
        "tagline": body.get("tagline"),
        "logo_url": body.get("logo_url"),
        "primary_color": color_palette.get("primary") or body.get("primary_color", "#d4a843"),
        "secondary_color": color_palette.get("secondary") or body.get("secondary_color", "#2ecc71"),
        "accent_color": body.get("accent_color", "#e94560"),
        "font_primary": body.get("font_preferences") or body.get("font_primary", "Inter"),
        "font_secondary": body.get("font_secondary", "Orbitron"),
        "voice_tone": body.get("voice") or body.get("voice_tone", "professional"),
        "voice_personality": body.get("voice_personality", []),
        "writing_style": body.get("writing_style"),
        "keywords": body.get("tone_keywords") or body.get("keywords", []),
        "avoid_words": body.get("key_phrases") or body.get("avoid_words", []),
        "target_audience": body.get("target_audience"),
        "audience_demographics": body.get("audience_demographics", {}),
        "audience_pain_points": body.get("hashtag_strategy") or body.get("audience_pain_points", []),
        "content_pillars": body.get("content_pillars", []),
        "competitor_urls": body.get("competitor_urls", []),
        "industry": body.get("industry"),
        "unique_value_prop": body.get("mission") or body.get("unique_value_prop"),
        "platform_configs": body.get("platform_configs", {}),
        "is_active": True,
        "updated_at": datetime.now().isoformat(),
    }
    try:
        brand_id = body.get("id")
        if brand_id:
            result = supabase_admin.table("brand_profiles").update(brand_data).eq("id", brand_id).eq("user_id", user["id"]).execute()
        else:
            # Check if user already has a brand profile
            existing = supabase_admin.table("brand_profiles").select("id").eq("user_id", user["id"]).eq("is_active", True).execute()
            if existing.data:
                brand_id = existing.data[0]["id"]
                result = supabase_admin.table("brand_profiles").update(brand_data).eq("id", brand_id).execute()
            else:
                result = supabase_admin.table("brand_profiles").insert(brand_data).execute()
        # Return in frontend-expected format
        saved = result.data[0] if result.data else brand_data
        brand_dna = {
            "id": saved.get("id", brand_id),
            "brand_name": saved.get("brand_name", ""),
            "tagline": saved.get("tagline", ""),
            "mission": saved.get("unique_value_prop", ""),
            "industry": saved.get("industry", ""),
            "voice": saved.get("voice_tone", ""),
            "tone_keywords": saved.get("keywords", []),
            "key_phrases": saved.get("avoid_words", []),
            "target_audience": saved.get("target_audience", ""),
            "content_pillars": saved.get("content_pillars", []),
            "hashtag_strategy": saved.get("audience_pain_points", []),
            "color_palette": { "primary": saved.get("primary_color", "#d4a843"), "secondary": saved.get("secondary_color", "#2ecc71") },
            "font_preferences": saved.get("font_primary", ""),
        }
        return {"success": True, "brand_dna": brand_dna}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/social-studio/brand-dna/analyze")
async def analyze_brand_competitors(request: Request, authorization: str = Header(None)):
    """AI-powered competitor analysis for Brand DNA."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")
    body = await request.json()
    competitor_urls = body.get("competitor_urls", [])
    industry = body.get("industry", "")
    brand_name = body.get("brand_name", "")

    prompt = f"""Analyze these competitors for the brand "{brand_name}" in the {industry} industry.
Competitor URLs/brands: {json.dumps(competitor_urls)}

Provide analysis as JSON:
{{
  "competitor_analysis": {{
    "strengths": ["what competitors do well"],
    "weaknesses": ["gaps we can exploit"],
    "content_themes": ["themes they use"],
    "posting_frequency": "estimated posting frequency",
    "audience_overlap": "estimated audience overlap"
  }},
  "recommendations": [
    "specific actionable recommendation 1",
    "specific actionable recommendation 2",
    "specific actionable recommendation 3"
  ],
  "content_pillars_suggested": ["pillar1", "pillar2", "pillar3", "pillar4"],
  "differentiation_angles": ["angle1", "angle2"]
}}"""

    # Use AI chain: xAI → Gemini fallback
    analysis = None
    xai_key = os.environ.get("XAI_API_KEY", "")
    if xai_key:
        try:
            async with httpx.AsyncClient(timeout=45.0) as http:
                resp = await http.post(
                    "https://api.x.ai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {xai_key}", "Content-Type": "application/json"},
                    json={"model": "grok-3-mini", "messages": [{"role": "user", "content": prompt}], "temperature": 0.3}
                )
                if resp.status_code == 200:
                    text = resp.json()["choices"][0]["message"]["content"]
                    json_match = re.search(r'\{[\s\S]*\}', text)
                    if json_match:
                        analysis = json.loads(json_match.group())
        except Exception:
            pass

    if not analysis:
        analysis = {
            "competitor_analysis": {"strengths": [], "weaknesses": [], "content_themes": [], "posting_frequency": "unknown", "audience_overlap": "unknown"},
            "recommendations": ["Connect competitor URLs for detailed analysis"],
            "content_pillars_suggested": ["thought leadership", "product updates", "community", "education"],
            "differentiation_angles": ["Unique value proposition needed"]
        }

    # Save analysis to brand profile
    try:
        brand_id = body.get("brand_id")
        if brand_id and supabase_admin:
            supabase_admin.table("brand_profiles").update({
                "competitor_analysis": analysis.get("competitor_analysis", {}),
                "ai_recommendations": analysis.get("recommendations", []),
                "last_analysis_at": datetime.now().isoformat()
            }).eq("id", brand_id).eq("user_id", user["id"]).execute()
    except Exception:
        pass

    return {"analysis": analysis}


# ── Campaigns CRUD ──

@app.get("/api/social-studio/campaigns")
async def list_campaigns(request: Request, authorization: str = Header(None)):
    """List user's campaigns."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")
    try:
        result = supabase_admin.table("campaigns").select("*").eq("user_id", user["id"]).order("updated_at", desc=True).execute()
        return {"campaigns": result.data or []}
    except Exception as e:
        return {"campaigns": [], "error": str(e)}


@app.post("/api/social-studio/campaigns")
async def create_campaign(request: Request, authorization: str = Header(None)):
    """Create a new campaign."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")
    body = await request.json()
    campaign_data = {
        "user_id": user["id"],
        "brand_id": body.get("brand_id"),
        "name": body.get("name", "Untitled Campaign"),
        "description": body.get("description"),
        "status": "draft",
        "goal": body.get("goal"),
        "platforms": body.get("platforms", []),
        "start_date": body.get("start_date"),
        "end_date": body.get("end_date"),
        "tags": body.get("tags", []),
    }
    try:
        result = supabase_admin.table("campaigns").insert(campaign_data).execute()
        return {"success": True, "campaign": result.data[0] if result.data else campaign_data}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.patch("/api/social-studio/campaigns/{campaign_id}")
async def update_campaign(campaign_id: str, request: Request, authorization: str = Header(None)):
    """Update a campaign."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")
    body = await request.json()
    body["updated_at"] = datetime.now().isoformat()
    try:
        result = supabase_admin.table("campaigns").update(body).eq("id", campaign_id).eq("user_id", user["id"]).execute()
        return {"success": True, "campaign": result.data[0] if result.data else body}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.delete("/api/social-studio/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, request: Request, authorization: str = Header(None)):
    """Delete a campaign and its items."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")
    try:
        supabase_admin.table("campaign_items").delete().eq("campaign_id", campaign_id).eq("user_id", user["id"]).execute()
        supabase_admin.table("campaigns").delete().eq("id", campaign_id).eq("user_id", user["id"]).execute()
        return {"success": True}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# ── Campaign Items CRUD ──

@app.get("/api/social-studio/campaigns/{campaign_id}/items")
async def list_campaign_items(campaign_id: str, request: Request, authorization: str = Header(None)):
    """List items in a campaign."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")
    try:
        result = supabase_admin.table("campaign_items").select("*").eq("campaign_id", campaign_id).eq("user_id", user["id"]).order("created_at", desc=True).execute()
        return {"items": result.data or []}
    except Exception as e:
        return {"items": [], "error": str(e)}


@app.post("/api/social-studio/campaigns/{campaign_id}/items")
async def add_campaign_item(campaign_id: str, request: Request, authorization: str = Header(None)):
    """Add an item to a campaign."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")
    body = await request.json()
    item_data = {
        "campaign_id": campaign_id,
        "user_id": user["id"],
        "content_type": body.get("content_type", "image"),
        "platform": body.get("platform", "instagram"),
        "caption": body.get("caption"),
        "hashtags": body.get("hashtags", []),
        "media_urls": body.get("media_urls", []),
        "thumbnail_url": body.get("thumbnail_url"),
        "status": body.get("status", "draft"),
        "scheduled_at": body.get("scheduled_at"),
        "ai_prompt": body.get("ai_prompt"),
        "ai_model": body.get("ai_model"),
        "brand_dna_applied": body.get("brand_dna_applied", False),
    }
    try:
        result = supabase_admin.table("campaign_items").insert(item_data).execute()
        # Update campaign post count
        supabase_admin.rpc("increment_campaign_posts", {"cid": campaign_id}).execute()
        return {"success": True, "item": result.data[0] if result.data else item_data}
    except Exception:
        try:
            result = supabase_admin.table("campaign_items").insert(item_data).execute()
            return {"success": True, "item": result.data[0] if result.data else item_data}
        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=500)


@app.delete("/api/social-studio/campaign-items/{item_id}")
async def delete_campaign_item(item_id: str, request: Request, authorization: str = Header(None)):
    """Delete a campaign item."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")
    try:
        supabase_admin.table("campaign_items").delete().eq("id", item_id).eq("user_id", user["id"]).execute()
        return {"success": True}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# ── Platform-Aware Content Generation ──

@limiter.limit("10/minute")
@app.post("/api/social-studio/generate")
async def social_studio_generate(request: Request, authorization: str = Header(None)):
    """Generate platform-optimized content with Brand DNA applied."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")
    body = await request.json()
    prompt = body.get("prompt", "")
    platform = body.get("platform", "instagram")
    content_type = body.get("content_type", "image")  # image, video, carousel, story, reel
    brand_id = body.get("brand_id")
    campaign_id = body.get("campaign_id")

    if not prompt:
        return JSONResponse({"error": "Prompt required"}, status_code=400)

    # Load Brand DNA if available
    brand_context = ""
    if brand_id:
        try:
            br = supabase_admin.table("brand_profiles").select("*").eq("id", brand_id).execute()
            if br.data:
                b = br.data[0]
                brand_context = f"""
Brand: {b.get('brand_name', '')}
Voice: {b.get('voice_tone', 'professional')}
Personality: {', '.join(b.get('voice_personality', []))}
Keywords: {', '.join(b.get('keywords', []))}
Audience: {b.get('target_audience', '')}
Industry: {b.get('industry', '')}
Colors: {b.get('primary_color', '#00ff88')}, {b.get('secondary_color', '#1a1a2e')}, {b.get('accent_color', '#e94560')}
"""
        except Exception:
            pass

    # Platform specs
    PLATFORM_SPECS = {
        "instagram": {"size": "1080x1080", "aspect": "1:1", "max_chars": 2200, "hashtag_limit": 30, "style": "visually stunning, clean aesthetic"},
        "instagram_story": {"size": "1080x1920", "aspect": "9:16", "max_chars": 200, "style": "bold, eye-catching, vertical"},
        "instagram_reel": {"size": "1080x1920", "aspect": "9:16", "max_chars": 2200, "style": "dynamic, trendy, vertical video"},
        "tiktok": {"size": "1080x1920", "aspect": "9:16", "max_chars": 4000, "style": "trendy, authentic, fast-paced"},
        "youtube": {"size": "1280x720", "aspect": "16:9", "max_chars": 5000, "style": "professional thumbnail, clickable"},
        "youtube_short": {"size": "1080x1920", "aspect": "9:16", "max_chars": 100, "style": "attention-grabbing vertical"},
        "linkedin": {"size": "1200x627", "aspect": "16:9", "max_chars": 3000, "style": "professional, thought leadership"},
        "facebook": {"size": "1200x630", "aspect": "16:9", "max_chars": 63206, "style": "engaging, community-focused"},
        "x": {"size": "1200x675", "aspect": "16:9", "max_chars": 280, "style": "punchy, concise, shareable"},
    }
    spec = PLATFORM_SPECS.get(platform, PLATFORM_SPECS["instagram"])

    results = {"platform": platform, "content_type": content_type}

    # Step 1: Generate caption + image prompt via AI
    caption_prompt = f"""You are an expert social media content creator.
Create content for {platform} about: {prompt}
{brand_context}
Platform: {platform} (max {spec['max_chars']} chars, style: {spec['style']})

Return JSON only:
{{
  "caption": "optimized post caption for {platform}",
  "hashtags": ["relevant", "hashtags"],
  "image_prompt": "detailed image generation prompt matching the brand and platform aesthetic, {spec['size']} dimensions, {spec['style']}",
  "hook": "attention-grabbing opening"
}}"""

    xai_key = os.environ.get("XAI_API_KEY", "")
    caption_data = None

    if xai_key:
        try:
            async with httpx.AsyncClient(timeout=30.0) as http:
                resp = await http.post(
                    "https://api.x.ai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {xai_key}"},
                    json={"model": "grok-3-mini", "messages": [{"role": "user", "content": caption_prompt}], "temperature": 0.7}
                )
                if resp.status_code == 200:
                    text = resp.json()["choices"][0]["message"]["content"]
                    jm = re.search(r'\{[\s\S]*\}', text)
                    if jm:
                        caption_data = json.loads(jm.group())
        except Exception:
            pass

    if not caption_data:
        caption_data = {"caption": prompt, "hashtags": [], "image_prompt": prompt, "hook": ""}

    results["caption"] = caption_data.get("caption", "")
    results["hashtags"] = caption_data.get("hashtags", [])
    results["hook"] = caption_data.get("hook", "")

    # Step 2: Generate image if image content type
    if content_type in ("image", "carousel", "story", "reel"):
        image_prompt = caption_data.get("image_prompt", prompt)
        # Use existing studio image generation logic
        try:
            # Try OpenAI first, then xAI
            image_url = None
            openai_key = os.environ.get("OPENAI_API_KEY", "")
            if openai_key:
                try:
                    async with httpx.AsyncClient(timeout=60.0) as http:
                        resp = await http.post(
                            "https://api.openai.com/v1/images/generations",
                            headers={"Authorization": f"Bearer {openai_key}"},
                            json={"model": "dall-e-3", "prompt": image_prompt, "n": 1, "size": "1024x1024", "quality": "hd"}
                        )
                        if resp.status_code == 200:
                            image_url = resp.json()["data"][0].get("url")
                except Exception:
                    pass

            if not image_url and xai_key:
                try:
                    async with httpx.AsyncClient(timeout=60.0) as http:
                        resp = await http.post(
                            "https://api.x.ai/v1/images/generations",
                            headers={"Authorization": f"Bearer {xai_key}"},
                            json={"model": "grok-2-image", "prompt": image_prompt, "n": 1}
                        )
                        if resp.status_code == 200:
                            image_url = resp.json()["data"][0].get("url")
                except Exception:
                    pass

            if image_url:
                results["image_url"] = image_url
                results["image_prompt"] = image_prompt
        except Exception as e:
            results["image_error"] = str(e)

    # Step 3: Save to media library if image was generated
    if results.get("image_url"):
        try:
            media_data = {
                "user_id": user["id"],
                "brand_id": brand_id,
                "campaign_id": campaign_id,
                "filename": f"social_{platform}_{int(datetime.now().timestamp())}.png",
                "file_url": results["image_url"],
                "media_type": "image",
                "title": prompt[:100],
                "ai_generated": True,
                "ai_prompt": prompt,
                "platform_optimized": platform,
                "tags": caption_data.get("hashtags", [])[:5],
            }
            supabase_admin.table("media_library").insert(media_data).execute()
        except Exception:
            pass

    # Step 4: Auto-add to campaign if campaign_id provided
    if campaign_id and (results.get("image_url") or results.get("caption")):
        try:
            item = {
                "campaign_id": campaign_id,
                "user_id": user["id"],
                "content_type": content_type,
                "platform": platform,
                "caption": results.get("caption", ""),
                "hashtags": results.get("hashtags", []),
                "media_urls": [results["image_url"]] if results.get("image_url") else [],
                "status": "draft",
                "ai_prompt": prompt,
                "brand_dna_applied": bool(brand_id),
            }
            supabase_admin.table("campaign_items").insert(item).execute()
        except Exception:
            pass

    return results


# ── Media Library ──

@app.get("/api/social-studio/media")
async def list_media(request: Request, authorization: str = Header(None), media_type: str = None, folder: str = None):
    """List user's media library."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")
    try:
        query = supabase_admin.table("media_library").select("*").eq("user_id", user["id"])
        if media_type:
            query = query.eq("media_type", media_type)
        if folder:
            query = query.eq("folder", folder)
        result = query.order("created_at", desc=True).limit(100).execute()
        return {"media": result.data or []}
    except Exception as e:
        return {"media": [], "error": str(e)}


@app.post("/api/social-studio/media")
async def save_media(request: Request, authorization: str = Header(None)):
    """Save media to library."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")
    body = await request.json()
    media_data = {
        "user_id": user["id"],
        "brand_id": body.get("brand_id"),
        "campaign_id": body.get("campaign_id"),
        "filename": body.get("filename", "untitled"),
        "file_url": body.get("file_url"),
        "thumbnail_url": body.get("thumbnail_url"),
        "media_type": body.get("media_type", "image"),
        "title": body.get("title"),
        "description": body.get("description"),
        "tags": body.get("tags", []),
        "ai_generated": body.get("ai_generated", False),
        "ai_prompt": body.get("ai_prompt"),
        "platform_optimized": body.get("platform_optimized"),
        "folder": body.get("folder", "general"),
    }
    try:
        result = supabase_admin.table("media_library").insert(media_data).execute()
        return {"success": True, "media": result.data[0] if result.data else media_data}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.delete("/api/social-studio/media/{media_id}")
async def delete_media(media_id: str, request: Request, authorization: str = Header(None)):
    """Delete media from library."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")
    try:
        supabase_admin.table("media_library").delete().eq("id", media_id).eq("user_id", user["id"]).execute()
        return {"success": True}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.patch("/api/social-studio/media/{media_id}")
async def update_media(media_id: str, request: Request, authorization: str = Header(None)):
    """Update media metadata (favorite, folder, tags)."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")
    body = await request.json()
    try:
        result = supabase_admin.table("media_library").update(body).eq("id", media_id).eq("user_id", user["id"]).execute()
        return {"success": True, "media": result.data[0] if result.data else body}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/social-studio/media/upload")
async def upload_media_file(file: UploadFile = File(...), title: str = Form(""), tags: str = Form(""), authorization: str = Header(None)):
    """Upload a file (image/video/audio/document) to the media library from user's device."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")
    
    import uuid as _uuid
    # Determine media type from content type
    ct = file.content_type or ""
    if ct.startswith("image"):
        media_type = "image"
        subdir = "images"
    elif ct.startswith("video"):
        media_type = "video"
        subdir = "videos"
    elif ct.startswith("audio"):
        media_type = "audio"
        subdir = "audio"
    else:
        media_type = "document"
        subdir = "uploads"
    
    # Save file to disk
    file_id = str(_uuid.uuid4())[:8]
    ext = (file.filename or "file").split(".")[-1] if "." in (file.filename or "") else "bin"
    saved_name = f"{file_id}.{ext}"
    save_path = MEDIA_DIR / subdir / saved_name
    
    contents = await file.read()
    if len(contents) > 50 * 1024 * 1024:  # 50MB limit
        return JSONResponse({"error": "File too large. Maximum size is 50MB."}, status_code=413)
    
    with open(save_path, "wb") as f:
        f.write(contents)
    
    file_url = f"/media_uploads/{subdir}/{saved_name}"
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
    
    try:
        record = {
            "user_id": user["id"],
            "media_type": media_type,
            "title": title or file.filename or "Uploaded file",
            "url": file_url,
            "description": f"Uploaded: {file.filename} ({ct})",
            "file_size": len(contents),
            "mime_type": ct,
            "tags": tag_list,
        }
        result = supabase_admin.table("media_library").insert(record).execute()
        return {"success": True, "media": result.data[0] if result.data else record, "url": file_url}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# ══════════════════════════════════════════════════════════════════════════════
# DASHBOARD STATS (wired to Supabase)
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/dashboard/stats")
async def dashboard_stats(authorization: Optional[str] = Header(None)):
    """Get real dashboard stats for the logged-in user."""
    user = await get_user_from_token(authorization)
    stats = {
        "total_searches": 0,
        "saved_items": 0,
        "active_alerts": 0,
        "compute_minutes": 0,
        "recent_activity": []
    }
    
    if user and supabase_admin:
        uid = user.get("id", "")
        try:
            # Count conversations as searches
            convs = supabase_admin.table("conversations").select("id,title,updated_at").eq("user_id", uid).order("updated_at", desc=True).limit(100).execute()
            stats["total_searches"] = len(convs.data) if convs.data else 0
            
            # Build recent activity from conversations
            import datetime
            now = datetime.datetime.utcnow()
            for c in (convs.data or [])[:10]:
                updated = c.get("updated_at", "")
                time_ago = "recently"
                if updated:
                    try:
                        dt = datetime.datetime.fromisoformat(updated.replace("Z", "+00:00").replace("+00:00", ""))
                        diff = (now - dt).total_seconds()
                        if diff < 3600:
                            time_ago = f"{int(diff/60)} min ago"
                        elif diff < 86400:
                            time_ago = f"{int(diff/3600)} hours ago"
                        else:
                            time_ago = f"{int(diff/86400)} days ago"
                    except: pass
                stats["recent_activity"].append({
                    "type": "search",
                    "title": c.get("title", "Untitled conversation"),
                    "time_ago": time_ago
                })
        except Exception as e:
            print(f"[Dashboard] Stats error: {e}")
        
        try:
            # Count saved items (if table exists)
            saved = supabase_admin.table("saved_searches").select("id").eq("user_id", uid).execute()
            stats["saved_items"] = len(saved.data) if saved.data else 0
        except: pass
        
        try:
            # Usage/compute minutes
            usage = supabase_admin.table("usage_log").select("credits_used").eq("user_id", uid).execute()
            total_credits = sum(u.get("credits_used", 0) for u in (usage.data or []))
            stats["compute_minutes"] = round(total_credits * 0.1, 1)  # approx conversion
        except: pass
    
    return stats


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN: User metering/credits management
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/admin/users/credits")
async def admin_set_user_credits(request: Request, authorization: Optional[str] = Header(None)):
    """Set credits for a specific user. SUPER ADMIN ONLY."""
    user = await require_super_admin(authorization)
    if not user:
        return JSONResponse({"error": "Super admin access required"}, status_code=403)
    
    data = await request.json()
    user_id = data.get("user_id", "")
    credits = data.get("credits", 0)
    
    if not user_id:
        return JSONResponse({"error": "user_id required"}, status_code=400)
    
    if supabase_admin:
        try:
            supabase_admin.table("profiles").update({"credits_remaining": credits}).eq("id", user_id).execute()
            return {"success": True, "message": f"Credits set to {credits}"}
        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=500)
    
    return JSONResponse({"error": "Database not configured"}, status_code=503)


@app.post("/api/admin/users/meter-tier")
async def admin_set_meter_tier(request: Request, authorization: Optional[str] = Header(None)):
    """Set metering tier for a user. SUPER ADMIN ONLY."""
    user = await require_super_admin(authorization)
    if not user:
        return JSONResponse({"error": "Super admin access required"}, status_code=403)
    
    data = await request.json()
    user_id = data.get("user_id", "")
    meter_tier = data.get("meter_tier", "mini")
    
    if meter_tier not in ["mini", "pro", "max", "maxpro"]:
        return JSONResponse({"error": f"Invalid meter tier: {meter_tier}"}, status_code=400)
    
    if supabase_admin:
        try:
            # Update user metadata with meter tier
            async with httpx.AsyncClient() as c:
                resp = await c.put(
                    f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                    headers={
                        "apikey": SUPABASE_SERVICE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                        "Content-Type": "application/json"
                    },
                    json={"user_metadata": {"meter_tier": meter_tier}}
                )
                if resp.status_code == 200:
                    return {"success": True, "message": f"Meter tier set to {meter_tier}"}
                else:
                    return JSONResponse({"error": resp.text}, status_code=resp.status_code)
        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=500)
    
    return JSONResponse({"error": "Database not configured"}, status_code=503)


# ══════════════════════════════════════════════════════════════════════════════
# PROPERTYAPI — Parcel/Property Data for Real Estate Intelligence
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/realestate/property-lookup")
async def property_lookup(
    fips: Optional[str] = None,
    apn: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    address: Optional[str] = None,
):
    """Look up detailed property data via PropertyAPI.
    Either fips+apn OR fips+latitude+longitude OR address required."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as http:
            params = {}
            if fips and apn:
                params = {"fips": fips, "apn": apn}
            elif fips and latitude and longitude:
                params = {"fips": fips, "latitude": latitude, "longitude": longitude}
            elif address:
                # Use RentCast to get coordinates first, then PropertyAPI
                rc_resp = await http.get(
                    f"{RENTCAST_BASE}/properties",
                    params={"address": address},
                    headers=RENTCAST_HEADERS
                )
                if rc_resp.status_code == 200:
                    rc_data = rc_resp.json()
                    if rc_data and len(rc_data) > 0:
                        prop = rc_data[0]
                        lat = prop.get("latitude")
                        lng = prop.get("longitude")
                        f_code = prop.get("county", {}).get("fipsCode", "") if isinstance(prop.get("county"), dict) else ""
                        if lat and lng and f_code:
                            params = {"fips": f_code, "latitude": lat, "longitude": lng}
                        elif lat and lng:
                            # Try without FIPS
                            params = {"latitude": lat, "longitude": lng}
                else:
                    return JSONResponse({"error": "Could not geocode address via RentCast"}, status_code=404)
            else:
                return JSONResponse({"error": "Provide fips+apn, fips+lat+lng, or address"}, status_code=400)
            
            if not params:
                return JSONResponse({"error": "Could not determine property location"}, status_code=400)
            
            resp = await http.get(
                f"{PROPERTY_API_BASE}/parcels/get",
                params=params,
                headers=PROPERTY_API_HEADERS
            )
            
            if resp.status_code == 200:
                data = resp.json()
                # Parse the PropertyAPI response into clean sections
                parsed = {}
                for section in ["parcel", "location", "building", "overview", "valuation", "sale_history", "owner"]:
                    items = data.get("data", {}).get(section, [])
                    parsed[section] = {}
                    for item in items:
                        field = item.get("field", "")
                        value = item.get("value", "")
                        if field and value is not None:
                            parsed[section][field] = value
                
                return {
                    "status": "ok",
                    "raw": data,
                    "parsed": parsed,
                    "source": "propertyapi"
                }
            else:
                return JSONResponse({"error": f"PropertyAPI returned {resp.status_code}: {resp.text[:200]}"}, status_code=resp.status_code)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/realestate/distressed-search")
async def distressed_search(
    category: str = "foreclosure",
    state: Optional[str] = None,
    city: Optional[str] = None,
    zip_code: Optional[str] = None,
    limit: int = 20,
):
    """Search for distressed properties by category using RentCast + PropertyAPI.
    Categories: foreclosure, pre-foreclosure, nod, tax-lien, bankruptcy, off-market, cash-buyer, notes-due"""
    results = []
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as http:
            # Use RentCast listings/sale as base data source
            params = {"limit": min(limit, 50)}
            if state: params["state"] = state
            if city: params["city"] = city
            if zip_code: params["zipCode"] = zip_code
            
            # For foreclosures, use RentCast status filter
            if category in ["foreclosure", "pre-foreclosure"]:
                params["status"] = "Foreclosure" if category == "foreclosure" else "Pre-Foreclosure"
                resp = await http.get(f"{RENTCAST_BASE}/listings/sale", params=params, headers=RENTCAST_HEADERS)
                if resp.status_code == 200:
                    listings = resp.json()
                    if isinstance(listings, list):
                        results = listings
            
            elif category == "nod":
                # NODs — query RentCast for distressed then filter
                params["status"] = "Foreclosure"
                resp = await http.get(f"{RENTCAST_BASE}/listings/sale", params=params, headers=RENTCAST_HEADERS)
                if resp.status_code == 200:
                    listings = resp.json()
                    if isinstance(listings, list):
                        results = [l for l in listings if "notice" in str(l.get("description", "")).lower() or "nod" in str(l.get("description", "")).lower()] or listings[:limit]
            
            elif category == "tax-lien":
                # Tax liens — use property search with tax-related filtering
                resp = await http.get(f"{RENTCAST_BASE}/properties", params=params, headers=RENTCAST_HEADERS)
                if resp.status_code == 200:
                    properties = resp.json()
                    if isinstance(properties, list):
                        # Enrich with PropertyAPI for tax data where possible
                        for prop in properties[:limit]:
                            prop["distressed_type"] = "Tax Lien (potential)"
                            prop["data_source"] = "rentcast+propertyapi"
                        results = properties
            
            elif category == "bankruptcy":
                # BK properties — similar approach
                resp = await http.get(f"{RENTCAST_BASE}/listings/sale", params=params, headers=RENTCAST_HEADERS)
                if resp.status_code == 200:
                    listings = resp.json()
                    if isinstance(listings, list):
                        results = [l for l in listings if any(kw in str(l.get("description", "")).lower() for kw in ["bankrupt", "reo", "bank owned"])] or listings[:limit]
            
            elif category == "off-market":
                # Off-market — properties not currently listed
                resp = await http.get(f"{RENTCAST_BASE}/properties", params=params, headers=RENTCAST_HEADERS)
                if resp.status_code == 200:
                    properties = resp.json()
                    if isinstance(properties, list):
                        for prop in properties:
                            prop["distressed_type"] = "Off-Market"
                        results = properties
            
            elif category == "cash-buyer":
                # Cash buyer leads — recent sales without mortgage
                resp = await http.get(f"{RENTCAST_BASE}/listings/sale", params=params, headers=RENTCAST_HEADERS)
                if resp.status_code == 200:
                    listings = resp.json()
                    if isinstance(listings, list):
                        for l in listings:
                            l["distressed_type"] = "Cash Buyer Opportunity"
                        results = listings
            
            elif category == "notes-due":
                # Notes coming due — use property data
                resp = await http.get(f"{RENTCAST_BASE}/properties", params=params, headers=RENTCAST_HEADERS)
                if resp.status_code == 200:
                    properties = resp.json()
                    if isinstance(properties, list):
                        for prop in properties:
                            prop["distressed_type"] = "Note Coming Due"
                        results = properties
            
            else:
                # Fallback — general property search
                resp = await http.get(f"{RENTCAST_BASE}/properties", params=params, headers=RENTCAST_HEADERS)
                if resp.status_code == 200:
                    properties = resp.json()
                    if isinstance(properties, list):
                        results = properties
    
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    
    return {
        "category": category,
        "count": len(results),
        "results": results[:limit],
        "sources": ["rentcast", "propertyapi"]
    }


# Serve uploaded media files
app.mount("/media_uploads", StaticFiles(directory=str(MEDIA_DIR), html=False), name="media_uploads")


# ── Static file serving (must be AFTER all API routes) ──────────────────────
_static_dir = Path(__file__).parent

@app.get("/")
async def serve_index():
    """Serve the main SPA."""
    index = _static_dir / "index.html"
    if index.exists():
        return FileResponse(str(index), media_type="text/html")
    return JSONResponse({"error": "index.html not found"}, status_code=404)


# ═══════════════════════════════════════════════════════════════════════════════
# REAL BUILDER v2 — Project/File Model + Auto-Deploy Loop
# ═══════════════════════════════════════════════════════════════════════════════

import uuid as _uuid_lib
import base64 as _b64_v2
import re as _re_v2


async def _v2_get_user_id(request: Request):
    """Extract authenticated user_id from Authorization header."""
    token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    if not token or not supabase:
        return None
    try:
        resp = supabase.auth.get_user(token)
        if resp and resp.user:
            return resp.user.id
    except Exception:
        pass
    return None


async def _v2_generate_files(prompt: str, framework: str = "html") -> list:
    """Call LLM to generate complete project files from a prompt."""
    fw_guide = {
        "html": "Generate a complete single-page app. Required files: index.html (full page with inline CSS+JS). Optional: style.css. Use modern responsive CSS, dark theme preferred, no external frameworks needed.",
        "react": "Generate a complete React 18 app using CDN (no build step). Files: index.html (with React/ReactDOM CDN scripts), App.js (React component with hooks), style.css.",
        "nextjs": "Generate a Next.js 14 TypeScript app. Files: app/page.tsx, app/layout.tsx, app/globals.css, package.json (next@14, typescript, tailwindcss).",
    }

    system = f"""You are an expert web developer building production-quality apps.
{fw_guide.get(framework, fw_guide["html"])}

Return ONLY valid JSON — no markdown, no explanation — in this exact format:
{{"files":[{{"path":"index.html","content":"...full content...","language":"html"}},{{"path":"style.css","content":"...","language":"css"}}]}}

Requirements: fully functional, visually polished, mobile responsive, modern design, no placeholder text."""

    user_msg = f"Build this app: {prompt}"

    # Try Anthropic
    ak = os.environ.get("ANTHROPIC_API_KEY", "")
    if ak:
        try:
            async with httpx.AsyncClient(timeout=120) as c:
                r = await c.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": ak, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    json={"model": "claude-opus-4-5", "max_tokens": 8000, "system": system, "messages": [{"role": "user", "content": user_msg}]},
                )
                raw = r.json().get("content", [{}])[0].get("text", "")
                m = _re_v2.search(r'\{.*\}', raw, _re_v2.DOTALL)
                if m:
                    files = json.loads(m.group()).get("files", [])
                    if files:
                        return files
        except Exception as e:
            print(f"[v2 codegen] Anthropic error: {e}")

    # Try xAI/Grok
    xk = os.environ.get("XAI_API_KEY", "")
    if xk:
        try:
            async with httpx.AsyncClient(timeout=120) as c:
                r = await c.post(
                    "https://api.x.ai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {xk}", "content-type": "application/json"},
                    json={"model": "grok-3", "messages": [{"role": "system", "content": system}, {"role": "user", "content": user_msg}], "max_tokens": 8000},
                )
                raw = r.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                m = _re_v2.search(r'\{.*\}', raw, _re_v2.DOTALL)
                if m:
                    files = json.loads(m.group()).get("files", [])
                    if files:
                        return files
        except Exception as e:
            print(f"[v2 codegen] xAI error: {e}")

    # Fallback
    return [{"path": "index.html", "content": f"<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>{prompt[:40]}</title><style>*{{box-sizing:border-box}}body{{font-family:system-ui,sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}}.card{{background:#1a1a1a;border-radius:16px;padding:40px;max-width:600px;text-align:center}}h1{{font-size:2rem;margin-bottom:12px}}p{{color:#888}}</style></head><body><div class='card'><h1>{prompt[:60]}</h1><p>App generated by SaintSal Labs Builder</p></div></body></html>", "language": "html"}]


async def _v2_patch_files(message: str, current_files: list) -> list:
    """Use LLM to patch specific files from a follow-up edit message."""
    files_ctx = json.dumps([{"path": f["path"], "content": f["content"][:2500]} for f in current_files])

    system = """You are editing an existing web app. Return ONLY files that need to change (not unchanged files).
Exact JSON format: {"files":[{"path":"index.html","content":"...full updated content...","language":"html"}]}
No markdown, no explanation outside the JSON."""

    user_msg = f"Current files:\n{files_ctx}\n\nEdit: {message}"

    ak = os.environ.get("ANTHROPIC_API_KEY", "")
    if ak:
        try:
            async with httpx.AsyncClient(timeout=120) as c:
                r = await c.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": ak, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    json={"model": "claude-opus-4-5", "max_tokens": 8000, "system": system, "messages": [{"role": "user", "content": user_msg}]},
                )
                raw = r.json().get("content", [{}])[0].get("text", "")
                m = _re_v2.search(r'\{.*\}', raw, _re_v2.DOTALL)
                if m:
                    return json.loads(m.group()).get("files", [])
        except Exception as e:
            print(f"[v2 patch] Anthropic error: {e}")

    xk = os.environ.get("XAI_API_KEY", "")
    if xk:
        try:
            async with httpx.AsyncClient(timeout=120) as c:
                r = await c.post(
                    "https://api.x.ai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {xk}", "content-type": "application/json"},
                    json={"model": "grok-3", "messages": [{"role": "system", "content": system}, {"role": "user", "content": user_msg}], "max_tokens": 8000},
                )
                raw = r.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                m = _re_v2.search(r'\{.*\}', raw, _re_v2.DOTALL)
                if m:
                    return json.loads(m.group()).get("files", [])
        except Exception as e:
            print(f"[v2 patch] xAI error: {e}")

    return []


async def _v2_deploy_render(project_id: str, project_name: str, files: list) -> dict:
    """Deploy project files to Render via GitHub. Returns real deploy URL."""
    GITHUB_PAT = os.environ.get("GITHUB_PAT", "") or os.environ.get("GITHUB_TOKEN", "")
    RENDER_KEY = os.environ.get("RENDER_API_KEY", "")
    GITHUB_ORG = "SaintVisions-SaintSal"

    if not GITHUB_PAT:
        return {"success": False, "error": "GITHUB_PAT not configured"}

    safe_name = _re_v2.sub(r"[^a-z0-9-]", "-", project_name.lower().strip())[:40]
    repo_name = f"sal-app-{safe_name}-{project_id[:8]}"

    gh_headers = {
        "Authorization": f"Bearer {GITHUB_PAT}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    try:
        async with httpx.AsyncClient(timeout=60) as c:
            # Create or get GitHub repo
            repo_resp = await c.get(f"https://api.github.com/repos/{GITHUB_ORG}/{repo_name}", headers=gh_headers)
            if repo_resp.status_code == 404:
                cr = await c.post(
                    "https://api.github.com/user/repos",
                    headers=gh_headers,
                    json={"name": repo_name, "private": False, "auto_init": True, "description": f"SaintSal Labs: {project_name}"},
                )
                if cr.status_code not in (200, 201):
                    return {"success": False, "error": f"GitHub repo create failed: {cr.text[:200]}"}
                repo_data = cr.json()
                import asyncio
                await asyncio.sleep(2)  # wait for GitHub to init
            else:
                repo_data = repo_resp.json()

            clone_url = repo_data.get("clone_url", f"https://github.com/{GITHUB_ORG}/{repo_name}.git")
            github_url = repo_data.get("html_url", f"https://github.com/{GITHUB_ORG}/{repo_name}")

            # Push all files
            for f in files:
                fpath = f.get("path", "index.html").lstrip("/")
                content = f.get("content", "")
                encoded = _b64_v2.b64encode(content.encode("utf-8")).decode("utf-8")
                file_url = f"https://api.github.com/repos/{GITHUB_ORG}/{repo_name}/contents/{fpath}"
                existing = await c.get(file_url, headers=gh_headers)
                payload = {"message": f"build: {fpath}", "content": encoded, "branch": "main"}
                if existing.status_code == 200:
                    payload["sha"] = existing.json().get("sha", "")
                await c.put(file_url, headers=gh_headers, json=payload)

            if not RENDER_KEY:
                return {"success": True, "url": github_url, "github_url": github_url, "error": "RENDER_API_KEY not set — files pushed to GitHub only"}

            render_headers = {
                "Authorization": f"Bearer {RENDER_KEY}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            }

            # Check if Render service exists for this repo
            svc_resp = await c.get("https://api.render.com/v1/services?limit=50", headers=render_headers)
            service_id = None
            deploy_url = None

            if svc_resp.status_code == 200:
                for svc in svc_resp.json():
                    svc_obj = svc.get("service", svc)
                    svc_repo = (svc_obj.get("repo") or "").rstrip(".git")
                    if repo_name in svc_repo or svc_obj.get("name", "") == repo_name:
                        service_id = svc_obj.get("id")
                        deploy_url = (svc_obj.get("serviceDetails") or {}).get("url")
                        break

            if service_id:
                # Trigger redeploy
                await c.post(
                    f"https://api.render.com/v1/services/{service_id}/deploys",
                    headers=render_headers,
                    json={"clearCache": "do_not_clear"},
                )
            else:
                # Create new Render static site
                create_resp = await c.post(
                    "https://api.render.com/v1/services",
                    headers=render_headers,
                    json={
                        "type": "static_site",
                        "name": repo_name,
                        "repo": clone_url,
                        "branch": "main",
                        "autoDeploy": "yes",
                        "staticSiteDetails": {"publishPath": "/"},
                    },
                )
                if create_resp.status_code in (200, 201):
                    svc_obj = create_resp.json().get("service", create_resp.json())
                    service_id = svc_obj.get("id")
                    deploy_url = (svc_obj.get("serviceDetails") or {}).get("url")

            # Render URLs follow pattern: https://<name>.onrender.com
            if not deploy_url and service_id:
                deploy_url = f"https://{repo_name}.onrender.com"
            elif not deploy_url:
                deploy_url = f"https://{repo_name}.onrender.com"

            return {
                "success": True,
                "url": f"https://{deploy_url}" if deploy_url and not deploy_url.startswith("http") else deploy_url,
                "github_url": github_url,
                "service_id": service_id,
            }

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


@app.post("/api/projects")
async def v2_create_project(request: Request):
    """Real Builder v2: prompt → LLM codegen → GitHub + Render deploy → real demoUrl."""
    try:
        user_id = await _v2_get_user_id(request)
        body = await request.json()
        prompt = body.get("prompt", "").strip()
        framework = body.get("framework", "html")
        name = (body.get("name") or prompt[:40] or "Untitled Project").strip()

        if not prompt:
            return JSONResponse({"error": "prompt required"}, status_code=400)

        project_id = str(_uuid_lib.uuid4())

        # Create project record
        if supabase and user_id:
            try:
                supabase.table("builder_projects").insert({
                    "id": project_id, "user_id": user_id,
                    "name": name, "framework": framework, "status": "building"
                }).execute()
            except Exception as e:
                print(f"[v2] Project create DB error: {e}")

        # Generate files via LLM
        files = await _v2_generate_files(prompt, framework)

        # Save files to Supabase
        if supabase and user_id:
            for f in files:
                try:
                    supabase.table("builder_files").upsert({
                        "project_id": project_id, "path": f["path"],
                        "content": f["content"], "language": f.get("language", ""),
                        "ai_generated": True
                    }).execute()
                except Exception as e:
                    print(f"[v2] File save error: {e}")

        # Auto-deploy to GitHub + Render
        deploy_result = await _v2_deploy_render(project_id, name, files)
        demo_url = deploy_result.get("url") if deploy_result.get("success") else None
        github_url = deploy_result.get("github_url")

        # Update project
        if supabase and user_id:
            try:
                supabase.table("builder_projects").update({
                    "status": "deployed" if demo_url else "draft",
                    "demo_url": demo_url, "github_url": github_url,
                    "render_service_id": deploy_result.get("service_id")
                }).eq("id", project_id).execute()
            except Exception as e:
                print(f"[v2] Project update error: {e}")

        # Save run
        if supabase and user_id:
            try:
                supabase.table("builder_runs").insert({
                    "project_id": project_id, "prompt": prompt,
                    "files_snapshot": files, "demo_url": demo_url
                }).execute()
            except Exception as e:
                print(f"[v2] Run save error: {e}")

        return JSONResponse({
            "projectId": project_id, "name": name, "framework": framework,
            "files": files, "demoUrl": demo_url, "githubUrl": github_url,
            "status": "deployed" if demo_url else "draft",
            "deployError": deploy_result.get("error") if not deploy_result.get("success") else None
        })

    except Exception as e:
        import traceback; traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/projects/{project_id}/edits")
async def v2_edit_project(project_id: str, request: Request):
    """Real Builder v2: follow-up edit → patch files → redeploy."""
    try:
        body = await request.json()
        message = body.get("message", "").strip()
        if not message:
            return JSONResponse({"error": "message required"}, status_code=400)

        # Load current files
        current_files = []
        if supabase:
            try:
                r = supabase.table("builder_files").select("*").eq("project_id", project_id).execute()
                current_files = [{"path": x["path"], "content": x["content"], "language": x.get("language", ""), "ai_generated": x.get("ai_generated", True)} for x in (r.data or [])]
            except Exception as e:
                print(f"[v2 edit] Load files error: {e}")

        # Apply user manual edits
        for cf in (body.get("changedFiles") or []):
            for i, f in enumerate(current_files):
                if f["path"] == cf["path"]:
                    current_files[i]["content"] = cf["content"]
                    current_files[i]["ai_generated"] = False

        # LLM patch
        patched = await _v2_patch_files(message, current_files)
        for pf in patched:
            found = False
            for i, f in enumerate(current_files):
                if f["path"] == pf["path"]:
                    current_files[i] = pf; found = True; break
            if not found:
                current_files.append(pf)

        # Save updated files
        if supabase:
            for f in current_files:
                try:
                    supabase.table("builder_files").upsert({"project_id": project_id, "path": f["path"], "content": f["content"], "language": f.get("language", ""), "ai_generated": f.get("ai_generated", True)}).execute()
                except Exception as e:
                    print(f"[v2 edit] File update error: {e}")

        # Get project name for redeploy
        proj_name = project_id
        if supabase:
            try:
                pr = supabase.table("builder_projects").select("name").eq("id", project_id).single().execute()
                if pr.data:
                    proj_name = pr.data.get("name", project_id)
            except Exception:
                pass

        deploy_result = await _v2_deploy_render(project_id, proj_name, current_files)
        demo_url = deploy_result.get("url") if deploy_result.get("success") else None

        if supabase and demo_url:
            try:
                supabase.table("builder_projects").update({"demo_url": demo_url}).eq("id", project_id).execute()
            except Exception:
                pass

        return JSONResponse({
            "projectId": project_id, "files": current_files,
            "demoUrl": demo_url, "patchedPaths": [f["path"] for f in patched]
        })

    except Exception as e:
        import traceback; traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/projects/{project_id}/files")
async def v2_get_files(project_id: str):
    """Real Builder v2: get all files for a project."""
    try:
        if not supabase:
            return JSONResponse({"error": "Database not configured"}, status_code=503)
        r = supabase.table("builder_files").select("*").eq("project_id", project_id).execute()
        return JSONResponse({"files": r.data or []})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.put("/api/projects/{project_id}/files")
async def v2_save_files(project_id: str, request: Request):
    """Real Builder v2: save/update files for a project."""
    try:
        body = await request.json()
        files = body.get("files", [])
        if not supabase:
            return JSONResponse({"error": "Database not configured"}, status_code=503)
        for f in files:
            supabase.table("builder_files").upsert({"project_id": project_id, "path": f["path"], "content": f["content"], "language": f.get("language", ""), "ai_generated": f.get("ai_generated", False)}).execute()
        return JSONResponse({"success": True, "saved": len(files)})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/projects")
async def v2_list_projects(request: Request):
    """Real Builder v2: list all projects for the authenticated user."""
    try:
        user_id = await _v2_get_user_id(request)
        if not user_id or not supabase:
            return JSONResponse({"projects": []})
        r = supabase.table("builder_projects").select("*").eq("user_id", user_id).order("updated_at", desc=True).execute()
        return JSONResponse({"projects": r.data or []})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# END REAL BUILDER v2
# ═══════════════════════════════════════════════════════════════════════════════


# ─── CookinCards™ — Pokemon TCG Routes ─────────────────────────────────────────

POKEMON_TCG_API_KEY = os.environ.get("POKEMON_TCG_API_KEY", "")
POKEMON_TCG_BASE = "https://api.pokemontcg.io/v2"

@app.get("/api/cards/search")
async def cards_search(query: str = "", page: int = 1, page_size: int = 20):
    """Search Pokemon TCG cards with price data."""
    if not query:
        return JSONResponse({"error": "query required"}, status_code=400)
    try:
        headers = {}
        if POKEMON_TCG_API_KEY:
            headers["X-Api-Key"] = POKEMON_TCG_API_KEY
        async with httpx.AsyncClient() as hc:
            r = await hc.get(
                f"{POKEMON_TCG_BASE}/cards",
                params={"q": f"name:{query}*", "page": page, "pageSize": page_size,
                        "select": "id,name,set,images,tcgplayer,cardmarket,rarity,subtypes,hp"},
                headers=headers, timeout=15
            )
            data = r.json()
            cards = []
            for card in (data.get("data") or []):
                price_info = {}
                tcgp = card.get("tcgplayer", {}).get("prices", {})
                for grade in ["holofoil", "reverseHolofoil", "normal", "1stEditionHolofoil"]:
                    if grade in tcgp:
                        price_info = {"grade": grade, "market": tcgp[grade].get("market"), "low": tcgp[grade].get("low"), "high": tcgp[grade].get("high")}
                        break
                cards.append({
                    "id": card.get("id"), "name": card.get("name"),
                    "set": card.get("set", {}).get("name"), "series": card.get("set", {}).get("series"),
                    "rarity": card.get("rarity"), "hp": card.get("hp"),
                    "image": card.get("images", {}).get("small"),
                    "image_large": card.get("images", {}).get("large"),
                    "price": price_info
                })
            return JSONResponse({"cards": cards, "count": data.get("totalCount", len(cards)), "page": page})
    except Exception as e:
        return JSONResponse({"error": str(e), "cards": []}, status_code=500)

@app.get("/api/cards/deals")
async def cards_deals():
    """Cards currently below market value — hot deals."""
    try:
        headers = {}
        if POKEMON_TCG_API_KEY:
            headers["X-Api-Key"] = POKEMON_TCG_API_KEY
        async with httpx.AsyncClient() as hc:
            r = await hc.get(
                f"{POKEMON_TCG_BASE}/cards",
                params={"q": "rarity:\"Rare Holo\" OR rarity:\"Rare Ultra\"", "pageSize": 20,
                        "select": "id,name,set,images,tcgplayer,rarity"},
                headers=headers, timeout=15
            )
            data = r.json()
            deals = []
            for card in (data.get("data") or []):
                tcgp = card.get("tcgplayer", {}).get("prices", {})
                for grade in ["holofoil", "1stEditionHolofoil", "normal"]:
                    if grade in tcgp and tcgp[grade].get("market"):
                        market = tcgp[grade]["market"]
                        low = tcgp[grade].get("low", market)
                        if low and market and low < market * 0.85:
                            deals.append({
                                "id": card.get("id"), "name": card.get("name"),
                                "set": card.get("set", {}).get("name"),
                                "image": card.get("images", {}).get("small"),
                                "market_price": market, "deal_price": low,
                                "savings_pct": round((1 - low/market) * 100, 1),
                                "rarity": card.get("rarity")
                            })
                        break
            return JSONResponse({"deals": deals[:12]})
    except Exception as e:
        return JSONResponse({"deals": [], "error": str(e)})

@app.get("/api/cards/rare-candy")
async def cards_rare_candy():
    """Pokemon 30th Anniversary spotlight cards."""
    spotlight = [
        {"id": "base1-4", "name": "Charizard", "set": "Base Set", "note": "The Holy Grail. PSA 10 BGS ~$500k"},
        {"id": "base1-2", "name": "Blastoise", "set": "Base Set", "note": "Water Starter. PSA 10 ~$45k"},
        {"id": "base1-15", "name": "Venusaur", "set": "Base Set", "note": "Grass Starter. PSA 10 ~$20k"},
        {"id": "base1-58", "name": "Pikachu", "set": "Base Set", "note": "The Icon. Yellow Cheeks PSA 10 ~$8k"},
        {"id": "pixy-85", "name": "Pikachu Illustrator", "set": "CoroCoro Promo", "note": "Rarest ever. ~$6M PSA 10"},
        {"id": "base1-10", "name": "Mewtwo", "set": "Base Set", "note": "Psychic Legend. PSA 10 ~$10k"},
    ]
    try:
        if POKEMON_TCG_API_KEY:
            headers = {"X-Api-Key": POKEMON_TCG_API_KEY}
            enriched = []
            async with httpx.AsyncClient() as hc:
                for card in spotlight[:4]:
                    try:
                        r = await hc.get(f"{POKEMON_TCG_BASE}/cards/{card['id']}", headers=headers, timeout=8)
                        if r.status_code == 200:
                            d = r.json().get("data", {})
                            card["image"] = d.get("images", {}).get("large", "")
                            tcgp = d.get("tcgplayer", {}).get("prices", {})
                            for g in ["holofoil", "1stEditionHolofoil"]:
                                if g in tcgp:
                                    card["market_price"] = tcgp[g].get("market")
                                    break
                    except Exception:
                        pass
                    enriched.append(card)
            return JSONResponse({"cards": enriched + spotlight[4:]})
    except Exception:
        pass
    return JSONResponse({"cards": spotlight})

@app.get("/api/cards/portfolio")
async def cards_portfolio(request: Request):
    """Get user's card portfolio from Supabase."""
    user = await get_current_user(request)
    if not user or not supabase_admin:
        return JSONResponse({"portfolio": [], "total_value": 0})
    try:
        result = supabase_admin.table("card_portfolio").select("*").eq("user_id", user["id"]).execute()
        items = result.data or []
        total = sum(float(item.get("purchase_price") or 0) for item in items)
        return JSONResponse({"portfolio": items, "total_value": round(total, 2), "count": len(items)})
    except Exception as e:
        return JSONResponse({"portfolio": [], "total_value": 0, "error": str(e)})

@app.post("/api/cards/portfolio")
async def cards_portfolio_add(request: Request):
    """Add a card to user's portfolio."""
    user = await get_current_user(request)
    if not user or not supabase_admin:
        return JSONResponse({"error": "Auth required"}, status_code=401)
    body = await request.json()
    try:
        data = {
            "user_id": user["id"],
            "card_id": body.get("card_id"),
            "card_name": body.get("card_name"),
            "set_name": body.get("set_name"),
            "image_url": body.get("image_url"),
            "purchase_price": body.get("purchase_price", 0),
            "condition": body.get("condition", "NM"),
            "notes": body.get("notes", "")
        }
        result = supabase_admin.table("card_portfolio").insert(data).execute()
        return JSONResponse({"success": True, "item": result.data[0] if result.data else data})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


# ─── eBay Card Search (Build #90) ───────────────────────────────────────
EBAY_APP_ID = os.environ.get("EBAY_APP_ID", "")
EBAY_OAUTH_TOKEN = os.environ.get("EBAY_OAUTH_TOKEN", "")

@app.get("/api/cards/ebay")
async def cards_ebay_search(query: str = "", limit: int = 8):
    """Search eBay for card listings."""
    if not query:
        return JSONResponse({"error": "query required"}, status_code=400)
    search_url = f"https://www.ebay.com/sch/i.html?_nkw={query.replace(' ', '+')}&_sacat=183454"
    if not EBAY_OAUTH_TOKEN:
        return JSONResponse({"listings": [], "search_url": search_url, "note": "eBay API not configured — use search URL"})
    try:
        async with httpx.AsyncClient() as hc:
            r = await hc.get(
                "https://api.ebay.com/buy/browse/v1/item_summary/search",
                params={"q": query, "category_ids": "183454", "limit": limit, "sort": "price"},
                headers={"Authorization": f"Bearer {EBAY_OAUTH_TOKEN}", "Content-Type": "application/json"},
                timeout=15
            )
            if r.status_code != 200:
                return JSONResponse({"listings": [], "search_url": search_url, "error": f"eBay API {r.status_code}"})
            listings = []
            for item in (r.json().get("itemSummaries") or [])[:limit]:
                listings.append({
                    "title": item.get("title", ""), "price": item.get("price", {}).get("value", ""),
                    "image": item.get("image", {}).get("imageUrl", ""), "url": item.get("itemWebUrl", ""),
                    "condition": item.get("condition", ""), "seller": item.get("seller", {}).get("username", ""),
                })
            return JSONResponse({"listings": listings, "search_url": search_url, "count": len(listings)})
    except Exception as e:
        return JSONResponse({"listings": [], "search_url": search_url, "error": str(e)})


# ─── Card Scan via Google Vision (Build #90) ─────────────────────
@app.post("/api/cards/scan")
async def cards_scan(request: Request):
    """Accept base64 card image → Google Vision → identify → search Pokemon TCG."""
    body = await request.json()
    image_b64 = body.get("image", "")
    if not image_b64:
        return JSONResponse({"error": "image (base64) required"}, status_code=400)
    if "base64," in image_b64:
        image_b64 = image_b64.split("base64,")[1]
    try:
        vision_key = os.environ.get("GOOGLE_MAPS_API", "")
        if not vision_key:
            return JSONResponse({"error": "Google Vision not configured", "matches": []})
        async with httpx.AsyncClient() as hc:
            r = await hc.post(
                f"https://vision.googleapis.com/v1/images:annotate?key={vision_key}",
                json={"requests": [{"image": {"content": image_b64}, "features": [
                    {"type": "TEXT_DETECTION", "maxResults": 10},
                    {"type": "WEB_DETECTION", "maxResults": 5}
                ]}]}, timeout=20
            )
            if r.status_code != 200:
                return JSONResponse({"error": f"Vision API error {r.status_code}", "matches": []})
            result = r.json().get("responses", [{}])[0]
            text = result.get("textAnnotations", [{}])[0].get("description", "") if result.get("textAnnotations") else ""
            web_entities = [e.get("description", "") for e in result.get("webDetection", {}).get("webEntities", [])]
            card_hints = " ".join(web_entities[:3]) if web_entities else text.split("\n")[0] if text else ""
            matches = []
            if card_hints and POKEMON_TCG_API_KEY:
                headers = {"X-Api-Key": POKEMON_TCG_API_KEY}
                sr = await hc.get(f"{POKEMON_TCG_BASE}/cards", params={"q": f"name:{card_hints.split()[0]}*", "pageSize": 5, "select": "id,name,set,images,tcgplayer,rarity"}, headers=headers, timeout=10)
                if sr.status_code == 200:
                    for card in (sr.json().get("data") or []):
                        price_info = {}
                        tcgp = card.get("tcgplayer", {}).get("prices", {})
                        for grade in ["holofoil", "reverseHolofoil", "normal", "1stEditionHolofoil"]:
                            if grade in tcgp:
                                price_info = {"grade": grade, "market": tcgp[grade].get("market"), "low": tcgp[grade].get("low")}
                                break
                        matches.append({"id": card.get("id"), "name": card.get("name"), "set": card.get("set", {}).get("name"), "rarity": card.get("rarity"), "image": card.get("images", {}).get("small"), "price": price_info})
            return JSONResponse({"detected_text": text[:200], "web_entities": web_entities[:5], "search_query": card_hints, "matches": matches, "count": len(matches)})
    except Exception as e:
        return JSONResponse({"error": str(e), "matches": []}, status_code=500)


# ════════════════════════════════════════════════════════════════════════════════
# MARKETING AUTOMATION ENGINE — Build #79
# Daily content, auto-post scheduler, lead capture, GHL nurture
# ════════════════════════════════════════════════════════════════════════════════

GHL_PRIVATE_TOKEN = os.environ.get("GHL_PRIVATE_TOKEN", "")
GHL_LOCATION_ID   = os.environ.get("GHL_LOCATION_ID", "")

CONTENT_ROTATION = {
    0: {"day": "Monday",    "theme": "AI + Real Estate",          "target": "agents and real estate brokers"},
    1: {"day": "Tuesday",   "theme": "AI + Finance",              "target": "financial advisors and traders"},
    2: {"day": "Wednesday", "theme": "SaintSal Labs features",    "target": "entrepreneurs and operators"},
    3: {"day": "Thursday",  "theme": "Patent #10,290,222 + HACP", "target": "enterprise buyers and tech leaders"},
    4: {"day": "Friday",    "theme": "CookinCards + Pokemon 30th","target": "collectors and investors seeking viral reach"},
    5: {"day": "Saturday",  "theme": "Success stories and wins",  "target": "aspiring entrepreneurs and community"},
    6: {"day": "Sunday",    "theme": "Week ahead + motivation",   "target": "operators and community builders"},
}

SAL_MARKETING_CONTEXT = """You are SAL, the AI for SaintSal Labs.
Founder Ryan Capatosto — Patent #10,290,222 holder.
Background: JP Morgan + Oppenheimer.
Building AI Life Infrastructure Software.
88 APIs. GHL CRM. Voice AI. Builder.
Free to Enterprise $497/mo plans.
Write content that positions SAL as the most powerful AI platform for
entrepreneurs, investors, and operators. Be bold, direct, and urgent.
No fluff. SAL is the Gotta Guy™ — the one call that solves everything."""


@app.post("/api/marketing/daily-content")
async def generate_daily_content(request: Request):
    """Generate today's multi-platform content batch. Saves to Supabase."""
    import datetime
    body = await request.json()
    topic = body.get("topic", "auto")

    today = datetime.date.today()
    weekday = today.weekday()  # 0=Monday

    if topic == "auto":
        rotation = CONTENT_ROTATION[weekday]
    else:
        rotation = {"day": "Custom", "theme": topic, "target": "entrepreneurs and operators"}

    theme = rotation["theme"]
    target = rotation["target"]
    date_str = today.isoformat()

    system_prompt = SAL_MARKETING_CONTEXT
    user_prompt = f"""Today is {rotation['day']}. Theme: {theme}. Target audience: {target}.

Generate a complete daily content package. Return ONLY valid JSON, no markdown, no explanation:

{{
  "theme": "{theme}",
  "date": "{date_str}",
  "twitter_thread": [
    "Tweet 1 (hook, max 280 chars)",
    "Tweet 2 (expand, max 280 chars)",
    "Tweet 3 (insight, max 280 chars)",
    "Tweet 4 (proof/feature, max 280 chars)",
    "Tweet 5 (CTA: saintsallabs.com, max 280 chars)"
  ],
  "linkedin": "Full LinkedIn thought leadership post (1000-1300 chars). Professional, story-driven, end with CTA.",
  "instagram": "Instagram caption (150 chars) + 30 relevant hashtags on new lines",
  "facebook": "Facebook post (300 chars). Conversational, community hook, question ending.",
  "tiktok": "TikTok script (90 seconds spoken word). Hook in first 3 seconds. Conversational. Strong CTA."
}}"""

    try:
        mcp_res = await _call_mcp_chat(system_prompt, user_prompt, model="pro")
        raw = mcp_res.get("response", "{}").strip()
        raw = raw.replace("```json", "").replace("```", "").strip()
        content_data = json.loads(raw)
    except Exception as e:
        return JSONResponse({"error": f"Content generation failed: {str(e)}"}, status_code=500)

    # Save to Supabase marketing_content table
    saved = []
    if supabase_admin:
        platforms = {
            "twitter":   json.dumps(content_data.get("twitter_thread", [])),
            "linkedin":  content_data.get("linkedin", ""),
            "instagram": content_data.get("instagram", ""),
            "facebook":  content_data.get("facebook", ""),
            "tiktok":    content_data.get("tiktok", ""),
        }
        try:
            for platform, content in platforms.items():
                row = {
                    "date": date_str,
                    "platform": platform,
                    "content": content,
                    "theme": theme,
                    "status": "draft",
                    "posted_at": None,
                }
                result = supabase_admin.table("marketing_content").insert(row).execute()
                saved.append(platform)
        except Exception as e:
            pass  # Non-fatal — return content even if save fails

    return JSONResponse({
        "ok": True,
        "date": date_str,
        "theme": theme,
        "day": rotation["day"],
        "content": content_data,
        "saved_platforms": saved,
    })


async def _call_mcp_chat(system: str, message: str, model: str = "pro") -> dict:
    """Internal helper: calls the MCP chat logic directly."""
    import anthropic as anthropic_sdk
    ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
    if ANTHROPIC_API_KEY:
        client = anthropic_sdk.Anthropic(api_key=ANTHROPIC_API_KEY)
        resp = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=2000,
            system=system,
            messages=[{"role": "user", "content": message}],
        )
        return {"ok": True, "response": resp.content[0].text}
    elif xai_client:
        resp = xai_client.chat.completions.create(
            model="grok-3",
            messages=[{"role": "system", "content": system}, {"role": "user", "content": message}],
            max_tokens=2000,
        )
        return {"ok": True, "response": resp.choices[0].message.content}
    else:
        return {"ok": False, "response": "{}"}


@app.post("/api/marketing/schedule")
async def marketing_schedule(request: Request):
    """
    Trigger the daily marketing run:
    1. Generate content via /api/marketing/daily-content
    2. Auto-post Twitter thread (tweet 1) and LinkedIn post
    3. Log results
    Call this from a cron job at 8AM PST.
    """
    import datetime
    # Step 1: Generate content
    fake_req_body = {"topic": "auto"}

    today = datetime.date.today()
    weekday = today.weekday()
    rotation = CONTENT_ROTATION[weekday]
    theme = rotation["theme"]
    date_str = today.isoformat()

    system_prompt = SAL_MARKETING_CONTEXT
    user_prompt = f"""Today is {rotation['day']}. Theme: {theme}.
Generate content for Twitter thread (5 tweets) and LinkedIn post.
Return ONLY valid JSON:
{{
  "twitter_thread": ["tweet1","tweet2","tweet3","tweet4","tweet5"],
  "linkedin": "LinkedIn post content here"
}}"""

    results = {"date": date_str, "theme": theme, "posted": [], "queued": [], "errors": []}

    try:
        mcp_res = await _call_mcp_chat(system_prompt, user_prompt, model="pro")
        raw = mcp_res.get("response", "{}").strip().replace("```json", "").replace("```", "").strip()
        content_data = json.loads(raw)
    except Exception as e:
        results["errors"].append(f"Content generation: {str(e)}")
        return JSONResponse({"ok": False, "results": results})

    # Step 2: Post tweet 1 of thread to Twitter
    tw_key    = os.environ.get("TWITTER_API_KEY", "")
    tw_secret = os.environ.get("TWITTER_API_SECRET", "")
    tw_token  = os.environ.get("TWITTER_ACCESS_TOKEN", "")
    tw_tsecret= os.environ.get("TWITTER_ACCESS_SECRET", "")

    tweet_text = content_data.get("twitter_thread", [""])[0]
    if tweet_text and tw_key and tw_secret and tw_token and tw_tsecret:
        try:
            import requests_oauthlib
            from requests_oauthlib import OAuth1Session
            oauth = OAuth1Session(tw_key, tw_secret, tw_token, tw_tsecret)
            resp = oauth.post("https://api.twitter.com/2/tweets", json={"text": tweet_text})
            if resp.status_code in (200, 201):
                results["posted"].append("twitter")
                if supabase_admin:
                    supabase_admin.table("marketing_content").insert({
                        "date": date_str, "platform": "twitter",
                        "content": tweet_text, "theme": theme,
                        "status": "posted", "posted_at": datetime.datetime.utcnow().isoformat()
                    }).execute()
            else:
                results["queued"].append(f"twitter (status {resp.status_code})")
        except Exception as e:
            results["queued"].append(f"twitter (error: {str(e)[:60]})")
    else:
        results["queued"].append("twitter (keys not configured)")

    # Step 3: Post to LinkedIn
    li_token = os.environ.get("LINKEDIN_ACCESS_TOKEN", "")
    li_post  = content_data.get("linkedin", "")
    if li_post and li_token:
        try:
            async with httpx.AsyncClient() as hc:
                # Get LinkedIn user ID first
                me_resp = await hc.get("https://api.linkedin.com/v2/me",
                    headers={"Authorization": f"Bearer {li_token}"}, timeout=10)
                if me_resp.status_code == 200:
                    li_uid = me_resp.json().get("id", "")
                    post_resp = await hc.post("https://api.linkedin.com/v2/ugcPosts",
                        headers={"Authorization": f"Bearer {li_token}", "Content-Type": "application/json"},
                        json={
                            "author": f"urn:li:person:{li_uid}",
                            "lifecycleState": "PUBLISHED",
                            "specificContent": {"com.linkedin.ugc.ShareContent": {
                                "shareCommentary": {"text": li_post},
                                "shareMediaCategory": "NONE"
                            }},
                            "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"}
                        }, timeout=15)
                    if post_resp.status_code in (200, 201):
                        results["posted"].append("linkedin")
                    else:
                        results["queued"].append(f"linkedin (status {post_resp.status_code})")
                else:
                    results["queued"].append("linkedin (auth failed)")
        except Exception as e:
            results["queued"].append(f"linkedin (error: {str(e)[:60]})")
    else:
        results["queued"].append("linkedin (token not configured)")

    # Remaining platforms go to manual approval queue
    for platform in ["instagram", "facebook", "tiktok"]:
        results["queued"].append(f"{platform} (manual approval)")

    return JSONResponse({"ok": True, "results": results})


@app.post("/api/marketing/capture-lead")
async def capture_lead(request: Request):
    """
    Fire when a user signs up for Free tier:
    1. Create GHL contact
    2. Start 7-day nurture sequence (GHL workflow trigger)
    3. Log to Supabase
    4. Day 3 — ElevenLabs voice call
    """
    body = await request.json()
    email     = body.get("email", "")
    firstName = body.get("firstName", body.get("first_name", ""))
    lastName  = body.get("lastName", body.get("last_name", ""))
    phone     = body.get("phone", "")
    user_id   = body.get("user_id", "")
    tier      = body.get("tier", "free")

    if not email:
        return JSONResponse({"error": "email required"}, status_code=400)

    results = {"ghl": None, "nurture": None, "errors": []}

    # ── Step 1: Create GHL Contact ──
    try:
        async with httpx.AsyncClient() as hc:
            contact_data = {
                "locationId": GHL_LOCATION_ID,
                "email": email,
                "firstName": firstName or email.split("@")[0],
                "lastName": lastName or "",
                "phone": phone or "",
                "tags": [f"tier:{tier}", "sal_signup", "nurture_active"],
                "source": "SAL Signup",
                "customField": [
                    {"id": "sal_tier",    "value": tier},
                    {"id": "sal_user_id", "value": str(user_id)},
                    {"id": "signup_date", "value": __import__("datetime").date.today().isoformat()},
                ]
            }
            resp = await hc.post(
                "https://rest.gohighlevel.com/v1/contacts/",
                headers={"Authorization": f"Bearer {GHL_PRIVATE_TOKEN}", "Content-Type": "application/json"},
                json=contact_data,
                timeout=15,
            )
            if resp.status_code in (200, 201):
                ghl_contact = resp.json().get("contact", {})
                results["ghl"] = {"contact_id": ghl_contact.get("id"), "status": "created"}
            else:
                results["errors"].append(f"GHL contact creation failed: {resp.status_code}")
    except Exception as e:
        results["errors"].append(f"GHL error: {str(e)[:80]}")

    # ── Step 2: Log nurture sequence start to Supabase ──
    if supabase_admin:
        try:
            import datetime
            supabase_admin.table("marketing_leads").insert({
                "email": email,
                "first_name": firstName,
                "last_name": lastName,
                "phone": phone,
                "user_id": str(user_id) if user_id else None,
                "tier": tier,
                "ghl_contact_id": results["ghl"]["contact_id"] if results["ghl"] else None,
                "nurture_day": 1,
                "signed_up_at": datetime.datetime.utcnow().isoformat(),
            }).execute()
            results["nurture"] = "day_1_started"
        except Exception as e:
            results["errors"].append(f"Supabase log: {str(e)[:80]}")

    # ── Step 3: Send Day 1 Welcome Email via Resend ──
    if RESEND_API_KEY and email:
        try:
            async with httpx.AsyncClient() as hc:
                await hc.post("https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "from": "SAL <sal@saintsallabs.com>",
                        "to": [email],
                        "subject": f"Welcome to SaintSal Labs, {firstName or 'friend'} — Your AI is Ready",
                        "html": f"""
<div style="background:#050505;color:#E8E6E1;font-family:'Helvetica Neue',sans-serif;max-width:600px;margin:0 auto;padding:40px 20px">
  <div style="color:#ffd709;font-size:28px;font-weight:900;letter-spacing:-0.5px;margin-bottom:8px">SAINTSALLABS™</div>
  <div style="color:#9CA3AF;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:32px">PATENT #10,290,222 · HACP PROTOCOL</div>
  <h1 style="font-size:24px;font-weight:800;margin:0 0 12px">Welcome, {firstName or 'friend'}. SAL is live.</h1>
  <p style="color:#9CA3AF;font-size:15px;line-height:1.7">You just joined the most powerful AI infrastructure platform built by an entrepreneur, for entrepreneurs.</p>
  <p style="color:#9CA3AF;font-size:15px;line-height:1.7">88 APIs. Voice AI. GHL CRM. Builder. Real Estate. Finance. All in one.</p>
  <div style="background:#111;border:1px solid #ffd70944;border-radius:8px;padding:24px;margin:28px 0">
    <div style="color:#ffd709;font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:12px">WHAT SAL CAN DO FOR YOU — DAY 1</div>
    <div style="color:#E8E6E1;font-size:14px;margin-bottom:8px">✅ Research any market, stock, or property in seconds</div>
    <div style="color:#E8E6E1;font-size:14px;margin-bottom:8px">✅ Generate full business plans, pitch decks, and legal docs</div>
    <div style="color:#E8E6E1;font-size:14px;margin-bottom:8px">✅ Build and deploy web apps with one prompt</div>
    <div style="color:#E8E6E1;font-size:14px">✅ Get voice-powered AI calls for your clients (Pro)</div>
  </div>
  <a href="https://saintsallabs.com" style="background:#ffd709;color:#000;padding:14px 28px;border-radius:6px;font-weight:800;text-decoration:none;display:inline-block;font-size:14px">LAUNCH SAL NOW →</a>
  <p style="color:#555;font-size:12px;margin-top:32px">More coming over the next 7 days. Watch for SAL's calls — this is just Day 1.</p>
</div>""",
                    }, timeout=10)
        except Exception as e:
            results["errors"].append(f"Welcome email: {str(e)[:60]}")

    return JSONResponse({"ok": True, "email": email, "results": results})


@app.post("/api/marketing/nurture-trigger")
async def nurture_trigger(request: Request):
    """
    Called by a cron job daily. Advances leads through their 7-day nurture sequence.
    Day sequences:
    1: Welcome + What SAL can do
    2: Feature spotlight (Builder)
    3: CookinCards + Pokemon 30th (viral hook) + ElevenLabs voice call
    4: ROI calculator — What is your time worth?
    5: Case study / social proof
    6: Upgrade offer — 50% off first month
    7: Final call — SAL Pro trial expires
    """
    import datetime

    if not supabase_admin:
        return JSONResponse({"error": "Supabase not configured"}, status_code=503)

    today = datetime.date.today()
    results = {"processed": 0, "errors": []}

    NURTURE_EMAILS = {
        2: {
            "subject": "SAL Builder just dropped — build any app in 60 seconds",
            "headline": "Day 2: The Builder Changes Everything",
            "body": "Yesterday you got access to SAL. Today I want to show you what the Builder does.<br><br>One prompt. Full web app. Deployed.<br><br>Try it: type <strong>\"Build me a landing page for [your business]\"</strong> and watch SAL generate the entire codebase.",
            "cta_text": "TRY THE BUILDER →",
        },
        3: {
            "subject": "🎴 Pokemon 30th Anniversary + SAL = Your next 10x investment thesis",
            "headline": "Day 3: CookinCards is Live",
            "body": "Pokemon's 30th Anniversary is here. Base Set Charizard PSA 10 just crossed $500k.<br><br>SAL's CookinCards tracks deals, rare finds, and portfolio value in real-time.<br><br>This is the viral hook nobody saw coming — AI meets the most valuable trading card market in history.",
            "cta_text": "SEE COOKINSCARDS →",
        },
        4: {
            "subject": "What is 1 hour of your time worth? (SAL calculates it)",
            "headline": "Day 4: The ROI Math",
            "body": "If you bill $100/hr, SAL's research tools save you 5 hours/week = <strong>$2,000/mo</strong> in value.<br><br>Pro is $97/mo.<br><br>The math is obvious. The question is: what are you waiting for?",
            "cta_text": "UPGRADE TO PRO →",
        },
        5: {
            "subject": "How a real estate operator closed 3 deals using SAL this quarter",
            "headline": "Day 5: Social Proof",
            "body": "Built by a JP Morgan + Oppenheimer veteran.<br><br>Patent filed 2015 — predates every major AI company pre-GPT-1.<br><br>88 live API integrations. Real estate. Finance. Legal. Voice. Builder.<br><br>This isn't a chatbot. This is infrastructure.",
            "cta_text": "SEE ALL FEATURES →",
        },
        6: {
            "subject": "⚡ 50% off your first month — 24 hours only",
            "headline": "Day 6: Founding Member Offer",
            "body": "You've been exploring SAL for 5 days. Time to go Pro.<br><br>Today only: <strong>50% off your first Pro month.</strong><br><br>Pro includes: Unlimited AI, Voice AI, Full Builder, Career Suite, Real Estate Suite, all 88 APIs.",
            "cta_text": "CLAIM 50% OFF →",
        },
        7: {
            "subject": "This is your last SAL message (unless you upgrade)",
            "headline": "Day 7: Final Call",
            "body": "Your 7-day SAL journey ends today.<br><br>You've seen the Builder. You've seen CookinCards. You've seen what 88 APIs looks like in one platform.<br><br>Pro is $97/mo. Enterprise is $497/mo. Both lock in founding member pricing forever.<br><br>This is your last nudge. What you do next is on you.",
            "cta_text": "JOIN PRO NOW →",
        },
    }

    try:
        # Get all active leads and advance their day counter
        leads_result = supabase_admin.table("marketing_leads").select("*").lte("nurture_day", 7).execute()
        leads = leads_result.data or []

        for lead in leads:
            day = lead.get("nurture_day", 1)
            email = lead.get("email", "")
            first_name = lead.get("first_name", "")
            lead_id = lead.get("id")

            next_day = day + 1
            if next_day > 7:
                # Nurture complete
                supabase_admin.table("marketing_leads").update({"nurture_day": 8, "nurture_complete": True}).eq("id", lead_id).execute()
                continue

            # Send nurture email if we have content for this day
            if next_day in NURTURE_EMAILS and RESEND_API_KEY and email:
                em = NURTURE_EMAILS[next_day]
                try:
                    async with httpx.AsyncClient() as hc:
                        await hc.post("https://api.resend.com/emails",
                            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                            json={
                                "from": "Ryan @ SAL <ryan@saintsallabs.com>",
                                "to": [email],
                                "subject": em["subject"],
                                "html": f"""
<div style="background:#050505;color:#E8E6E1;font-family:'Helvetica Neue',sans-serif;max-width:600px;margin:0 auto;padding:40px 20px">
  <div style="color:#ffd709;font-size:12px;font-weight:700;letter-spacing:2px;margin-bottom:24px">SAINTSALLABS™ · DAY {next_day} OF 7</div>
  <h1 style="font-size:22px;font-weight:800;margin:0 0 16px">{em['headline']}</h1>
  <p style="color:#9CA3AF;font-size:15px;line-height:1.8">{em['body']}</p>
  <a href="https://saintsallabs.com" style="background:#ffd709;color:#000;padding:14px 28px;border-radius:6px;font-weight:800;text-decoration:none;display:inline-block;font-size:14px;margin-top:20px">{em['cta_text']}</a>
  <p style="color:#333;font-size:11px;margin-top:40px">SaintSal Labs · Patent #10,290,222 · <a href="https://saintsallabs.com" style="color:#555">saintsallabs.com</a></p>
</div>""",
                            }, timeout=10)
                except Exception as e:
                    results["errors"].append(f"Email day {next_day} to {email}: {str(e)[:60]}")

            # Day 3: ElevenLabs voice call
            if next_day == 3 and lead.get("phone") and ELEVENLABS_API_KEY:
                try:
                    async with httpx.AsyncClient() as hc:
                        await hc.post(
                            f"https://api.elevenlabs.io/v1/convai/conversations/outbound",
                            headers={"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"},
                            json={
                                "agent_id": "agent_5401k855rq5afqprn6vd3mh6sn7z",
                                "to_phone_number": lead["phone"],
                                "conversation_initiation_client_data": {
                                    "dynamic_variables": {
                                        "first_name": first_name or "friend",
                                        "custom_greeting": f"Hey {first_name or 'there'}, this is SAL calling from SaintSal Labs. You signed up a couple days ago and I wanted to personally reach out about CookinCards — our Pokemon 30th Anniversary trading card platform. It's insane right now. Charizard just crossed half a million dollars. We built an AI that tracks every deal in real time. I wanted to make sure you knew about it. Check it out at saintsallabs dot com. Talk soon."
                                    }
                                }
                            }, timeout=15)
                except Exception as e:
                    results["errors"].append(f"Voice call day 3 for {email}: {str(e)[:60]}")

            # Advance day counter
            supabase_admin.table("marketing_leads").update({"nurture_day": next_day}).eq("id", lead_id).execute()
            results["processed"] += 1

    except Exception as e:
        results["errors"].append(f"Nurture loop: {str(e)[:120]}")

    return JSONResponse({"ok": True, "date": today.isoformat(), **results})


@app.get("/api/marketing/content-history")
async def marketing_content_history(date: str = "", platform: str = ""):
    """Get marketing content history from Supabase."""
    if not supabase_admin:
        return JSONResponse({"content": []})
    try:
        q = supabase_admin.table("marketing_content").select("*").order("date", desc=True).limit(50)
        if date:
            q = q.eq("date", date)
        if platform:
            q = q.eq("platform", platform)
        result = q.execute()
        return JSONResponse({"content": result.data or []})
    except Exception as e:
        return JSONResponse({"content": [], "error": str(e)})


# ════════════════════════════════════════════════════════════════════════════════
# ISSUE #3 FIX — Dashboard endpoints missing from backend (audit fix)
# ════════════════════════════════════════════════════════════════════════════════

@app.get("/api/ghl/stats")
async def ghl_stats(request: Request):
    """GHL pipeline + contact stats for dashboard."""
    try:
        async with httpx.AsyncClient() as hc:
            token  = os.environ.get("GHL_PRIVATE_TOKEN", "")
            loc_id = os.environ.get("GHL_LOCATION_ID", "")
            if not token:
                return JSONResponse({"contacts": 0, "opportunities": 0, "pipelines": 0, "error": "GHL not configured"})
            hdrs = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            contacts_r = await hc.get(
                f"https://rest.gohighlevel.com/v1/contacts/?locationId={loc_id}&limit=1",
                headers=hdrs, timeout=10)
            contacts_total = contacts_r.json().get("meta", {}).get("total", 0) if contacts_r.status_code == 200 else 0
            opps_r = await hc.get(
                f"https://rest.gohighlevel.com/v1/opportunities/search/?location_id={loc_id}&limit=1",
                headers=hdrs, timeout=10)
            opps_total = opps_r.json().get("meta", {}).get("total", 0) if opps_r.status_code == 200 else 0
        return JSONResponse({"contacts": contacts_total, "opportunities": opps_total, "pipelines": 1, "ok": True})
    except Exception as e:
        return JSONResponse({"contacts": 0, "opportunities": 0, "pipelines": 0, "error": str(e)})


@app.get("/api/alpaca/portfolio")
async def alpaca_portfolio(request: Request):
    """Alpaca brokerage portfolio stats for dashboard."""
    alpaca_key    = os.environ.get("ALPACA_API_KEY", "")
    alpaca_secret = os.environ.get("ALPACA_API_SECRET", "")
    if not alpaca_key or not alpaca_secret:
        return JSONResponse({"equity": 0, "cash": 0, "positions": [], "ok": False, "error": "Alpaca not configured"})
    try:
        async with httpx.AsyncClient() as hc:
            hdrs = {"APCA-API-KEY-ID": alpaca_key, "APCA-API-SECRET-KEY": alpaca_secret}
            acct_r = await hc.get("https://paper-api.alpaca.markets/v2/account", headers=hdrs, timeout=10)
            pos_r  = await hc.get("https://paper-api.alpaca.markets/v2/positions", headers=hdrs, timeout=10)
            if acct_r.status_code == 200:
                acct = acct_r.json()
                positions = pos_r.json() if pos_r.status_code == 200 else []
                return JSONResponse({
                    "equity": float(acct.get("equity", 0)),
                    "cash": float(acct.get("cash", 0)),
                    "positions": positions[:10],
                    "ok": True,
                })
    except Exception as e:
        return JSONResponse({"equity": 0, "cash": 0, "positions": [], "ok": False, "error": str(e)})
    return JSONResponse({"equity": 0, "cash": 0, "positions": [], "ok": False})


@app.get("/api/realestate/portfolio")
async def realestate_portfolio(request: Request):
    """Real estate portfolio summary for dashboard (from Supabase card_portfolio + user properties)."""
    user = await get_current_user(request)
    if not user or not supabase_admin:
        return JSONResponse({"properties": [], "total_value": 0, "ok": False})
    try:
        result = supabase_admin.table("card_portfolio").select("*").eq("user_id", user["id"]).execute()
        items = result.data or []
        # Also try a real-estate specific table if it exists
        re_result = None
        try:
            re_result = supabase_admin.table("re_portfolio").select("*").eq("user_id", user["id"]).execute()
        except Exception:
            pass
        properties = re_result.data if re_result and re_result.data else []
        total = sum(float(p.get("estimated_value") or p.get("purchase_price") or 0) for p in properties)
        return JSONResponse({"properties": properties, "total_value": round(total, 2), "count": len(properties), "ok": True})
    except Exception as e:
        return JSONResponse({"properties": [], "total_value": 0, "ok": False, "error": str(e)})

# ─── Static file serving — MUST BE LAST (catch-all mount) ────────────────────
# WARNING: Do NOT move this above any @app routes — it will block them (returns 404)
app.mount("/", StaticFiles(directory=str(_static_dir), html=False), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
