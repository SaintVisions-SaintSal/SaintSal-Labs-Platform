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

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

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

# In-memory gallery (production: use DB)
media_gallery = []

# In-memory social connections (production: use DB + encrypted storage)
social_connections = {}

# ─── API Keys ─────────────────────────────────────────────────────────────────

GODADDY_API_KEY = os.environ.get("GODADDY_API_KEY", "fYfvRW8R6NBK_P7LYBzA3hSUAWMXGNMkpJT")
GODADDY_API_SECRET = os.environ.get("GODADDY_API_SECRET", "XxC9jFsNJuL1TW7YH6yxkE")
GODADDY_BASE = os.environ.get("GODADDY_BASE", "https://api.godaddy.com")  # switch to api.ote-godaddy.com for testing
CORPNET_DATA_API_KEY = os.environ.get("CORPNET_DATA_API_KEY", "0D3DB6A514DAED0CEF4F97D71DC9292BA84C895FE25A4EB34D09CDF4F2242F95DB554C9C88D3044F5A05F67457B4F82C44F6")
CORPNET_API_KEY = os.environ.get("CORPNET_API_KEY", "7E90-738C-175F-41BD-886C")

# ─── Real Estate API Keys ────────────────────────────────────────────────────
RENTCAST_API_KEY = os.environ.get("RENTCAST_API_KEY", "e14286fed9e243c6afcba08fcce4bd8f")
RENTCAST_BASE = "https://api.rentcast.io/v1"
GOOGLE_MAPS_KEY = os.environ.get("GOOGLE_MAPS_KEY", "AIzaSyA2RxjYuME6mEa1-Sb-8ZfZjR0ujJ-lITQ")


# ─── System Prompts by Vertical ───────────────────────────────────────────────

SYSTEM_PROMPTS = {
    "search": """You are SaintSal™, an AI search and research assistant powered by HACP™ (Human-AI Connection Protocol, Patent #10,290,222). You are built by Saint Vision Technologies.

Your approach: Search the web, synthesize information, and provide accurate, cited answers. Always cite your sources with [1], [2] etc. Be concise but thorough. Format responses with clear headers and bullet points when helpful.

You represent Responsible Intelligence — accurate, ethical, human-centered AI.""",

    "sports": """You are SaintSal™ Sports, an AI sports analyst powered by HACP™ (Human-AI Connection Protocol, Patent #10,290,222).

Your approach: Provide live scores, game analysis, player stats, injury updates, trade rumors, and expert predictions. Cover NFL, NBA, MLB, NHL, MLS, UFC, boxing, college sports, and international events. Always cite sources with [1], [2] etc. Be energetic but factual.""",

    "news": """You are SaintSal™ News, an AI news analyst powered by HACP™ (Human-AI Connection Protocol, Patent #10,290,222).

Your approach: Provide breaking news, analysis, and context on current events. Cover politics, world affairs, business, technology, science, and culture. Always cite sources with [1], [2] etc. Be balanced, factual, and provide multiple perspectives.""",

    "tech": """You are SaintSal™ Tech, an AI technology analyst powered by HACP™ (Human-AI Connection Protocol, Patent #10,290,222).

Your approach: Cover AI/ML developments, product launches, developer tools, startups, funding rounds, open source, and technical deep-dives. Always cite sources with [1], [2] etc. Be precise and technically accurate.""",


    "realestate": """You are SaintSal™ Real Estate, an AI real estate investment analyst powered by HACP™ (Human-AI Connection Protocol, Patent #10,290,222).

Your approach: Provide property analysis, investment deal evaluation, market insights, comparables, rental estimates, and distressed property intelligence. Cover residential, multifamily, commercial properties, foreclosures, pre-foreclosures, tax liens, and NODs. Always cite sources with [1], [2] etc. Include cap rates, cash-on-cash returns, and relevant financial metrics. Disclaimer: This is not investment advice.""",
    "finance": """You are SaintSal™ Finance, an AI financial analyst powered by HACP™ (Human-AI Connection Protocol, Patent #10,290,222).

Your approach: Provide market analysis, stock insights, crypto updates, economic indicators, earnings reports, and investment research. Always cite sources with [1], [2] etc. Include relevant data points and numbers. Disclaimer: This is not financial advice.""",
}

# ─── Tavily Web Search ────────────────────────────────────────────────────────

TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")

async def search_web(query: str, search_depth: str = "basic", max_results: int = 5, topic: str = "general", include_answer: bool = False):
    """Search the web using Tavily API."""
    if not TAVILY_API_KEY:
        return {"results": [], "query": query, "answer": ""}
    
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
        }
        query = live_queries.get(category, live_queries["top"])
        try:
            results = await search_web(query, search_depth="basic", max_results=6, topic="news")
            live_topics = []
            for r in results.get("results", []):
                live_topics.append({
                    "title": r.get("title", ""),
                    "category": category.capitalize(),
                    "sources": 1,
                    "time": "Live",
                    "summary": r.get("content", "")[:200],
                    "url": r.get("url", ""),
                    "domain": r.get("domain", ""),
                })
            if live_topics:
                return {"category": category, "topics": live_topics, "updated_at": datetime.now().isoformat(), "live": True}
        except Exception as e:
            print(f"Live discover failed for {category}: {e}")

    # Fallback to hardcoded
    topics = DISCOVER_TOPICS.get(category, DISCOVER_TOPICS["top"])
    return {"category": category, "topics": topics, "updated_at": datetime.now().isoformat(), "live": False}


# ─── Chat with Streaming ─────────────────────────────────────────────────────

@app.post("/api/chat")
async def chat(request: Request):
    """Stream an AI chat response with optional web search."""
    body = await request.json()
    query = body.get("message", "")
    vertical = body.get("vertical", "search")
    history = body.get("history", [])
    use_search = body.get("search", True)
    
    system_prompt = SYSTEM_PROMPTS.get(vertical, SYSTEM_PROMPTS["search"])
    sources = []
    
    # Step 1: Enhanced vertical-specific web search
    tavily_answer = ""
    if use_search and query:
        sources, tavily_answer = await multi_search(query, vertical, max_results=8)
        
        if sources:
            context = "\n\n".join([
                f"[{i+1}] {s['title']} ({s['domain']})\n{s['content']}"
                for i, s in enumerate(sources)
            ])
            system_prompt += f"\n\nHere are relevant web search results for the user's query. Use these to inform your response and cite them using [1], [2], etc.:\n\n{context}"
    
    # Step 2: Build messages
    messages = []
    for msg in history[-10:]:  # Keep last 10 messages for context
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": query})
    
    # Step 3: Stream response with pipeline phases
    def generate():
        # Phase: sources found
        if sources:
            yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"
        
        # Phase: thinking
        yield f"data: {json.dumps({'type': 'phase', 'phase': 'generating'})}\n\n"

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
                        yield f"data: {json.dumps({'type': 'text', 'content': text})}\n\n"
                ai_responded = True
            except Exception as e:
                print(f"[Chat] Anthropic error: {e}")

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
                        yield f"data: {json.dumps({'type': 'text', 'content': chunk.choices[0].delta.content})}\n\n"
                ai_responded = True
            except Exception as e:
                print(f"[Chat] xAI/Grok error: {e}")

        # Final fallback: use Tavily AI answer or show raw search results
        if not ai_responded:
            if tavily_answer:
                # Tavily provides an AI-synthesized answer
                fallback = tavily_answer
                if sources:
                    fallback += "\n\n---\n\n**Sources:**\n"
                    for i, s in enumerate(sources):
                        fallback += f"[{i+1}] [{s['title']}]({s['url']})\n"
            elif sources:
                fallback = "Here's what I found from the web:\n\n"
                for i, s in enumerate(sources):
                    fallback += f"**[{i+1}] {s['title']}** ({s['domain']})\n{s['content']}\n\n"
            else:
                fallback = "*I couldn't find results for that query. Please try rephrasing or try a different search.*"
            yield f"data: {json.dumps({'type': 'text', 'content': fallback})}\n\n"
        
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")





# ─── WebSocket Chat with Real-Time Streaming ──────────────────────────────────

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

            # Final fallback: Tavily AI answer or raw sources
            if not ai_responded:
                if tavily_answer:
                    fallback = tavily_answer
                    if sources:
                        fallback += "\n\n---\n\n**Sources:**\n"
                        for i, s in enumerate(sources):
                            fallback += f"[{i+1}] [{s['title']}]({s['url']})\n"
                elif sources:
                    fallback = "Here's what I found from the web:\n\n"
                    for i, s in enumerate(sources):
                        fallback += f"**[{i+1}] {s['title']}** ({s['domain']})\n{s['content']}\n\n"
                else:
                    fallback = "*I couldn't find results for that query. Please try rephrasing.*"
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
        "checkout_url": f"https://www.godaddy.com/domainsearch/find?domainToCheck={domain}",
        "note": "Full in-app purchase coming when GoDaddy Reseller API is configured.",
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
        "price": 197,  # Client price ($79 cost → 150% markup)
        "processing": "5-7 business days",
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
        "price": 397,  # Client price ($199 cost → 100% markup)
        "popular": True,
        "processing": "24-hour rush",
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
        "price": 449,  # Client price ($249 cost → 80% markup)
        "processing": "24-hour rush",
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
    {"id": "dba", "product_id": "SV-CORP-007", "name": "DBA Filing", "price": 149, "type": "one-time"},
    {"id": "ra_annual", "product_id": "SV-CORP-008", "name": "Registered Agent — Annual", "price": 224, "type": "annual"},
    {"id": "s_corp_election", "product_id": "SV-CORP-009", "name": "S-Corp Election (Form 2553)", "price": 149, "type": "one-time"},
    {"id": "annual_report", "product_id": "SV-CORP-010", "name": "Annual Report Filing", "price": 179, "type": "annual"},
    {"id": "foreign_llc", "product_id": "SV-CORP-011", "name": "Foreign LLC Qualification", "price": 297, "type": "one-time"},
    {"id": "biz_license", "product_id": "SV-CORP-012", "name": "Business License Research", "price": 169, "type": "one-time"},
    {"id": "nonprofit", "product_id": "SV-CORP-013", "name": "Nonprofit Formation (501c3)", "price": 197, "type": "one-time"},
    {"id": "amendment", "product_id": "SV-CORP-014", "name": "Amendment Filing", "price": 169, "type": "one-time"},
    {"id": "dissolution", "product_id": "SV-CORP-015", "name": "Dissolution / Withdrawal", "price": 224, "type": "one-time"},
    {"id": "ai_consult", "product_id": "SV-CORP-016", "name": "SaintSal AI Business Consult", "price": 79, "type": "one-time"},
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
            {"id": "SV-SAL-FREE", "name": "Free", "price": 0, "billing": "free", "stripe_price_id": "price_1T5bkAL47U80vDLAslOm3HoX", "features": ["50 msgs/mo", "Basic AI chat", "Finance & RE modules"]},
            {"id": "SV-SAL-START", "name": "Starter", "price": 27, "billing": "monthly", "stripe_price_id": "price_1T5bkAL47U80vDLAaChP4Hqg", "features": ["500 msgs/mo", "All 6 domain modules", "SaintSal core", "Email support"]},
            {"id": "SV-SAL-PRO", "name": "Pro", "price": 97, "billing": "monthly", "stripe_price_id": "price_1T5bkBL47U80vDLALiVDkOgb", "features": ["Unlimited msgs", "All AI models", "SaintSal Labs access", "Cookin.io builder", "Priority support"], "required_for": "Premium Snapshots"},
            {"id": "SV-SAL-TEAM", "name": "Teams", "price": 297, "billing": "monthly", "stripe_price_id": "price_1T5bkCL47U80vDLANsCa647K", "features": ["Everything in Pro", "Up to 5 seats", "Shared agents", "Team analytics", "GHL CRM integration"]},
            {"id": "SV-SAL-ENT", "name": "Enterprise", "price": 497, "billing": "monthly", "stripe_price_id": "price_1T5bkDL47U80vDLANXWF33A7", "features": ["Everything in Teams", "Unlimited seats", "White-label", "Custom integrations", "Dedicated support"]},
        ],
        "snapshots": {
            "premium": [
                {"id": "SV-SNAP-RE", "name": "Real Estate Pro", "price": 997, "requires": "Pro ($97/mo)", "features": "300+ custom values, 4 pipelines, 26 workflows"},
                {"id": "SV-SNAP-RL", "name": "Residential Lending Pro", "price": 997, "requires": "Pro ($97/mo)", "features": "Mortgage pre-qual funnel, rate automation, LO pipeline"},
                {"id": "SV-SNAP-CL", "name": "Commercial Lending Pro", "price": 1497, "requires": "Pro ($97/mo)", "features": "Deal intake ($5K-$100M), SBA/CMBS/Bridge pipelines"},
                {"id": "SV-SNAP-IT", "name": "Investment / Tax / Legal Pro", "price": 1497, "requires": "Pro ($97/mo)", "features": "AUM pipeline, tax prep workflows, compliance"},
                {"id": "SV-SNAP-CC", "name": "Card Store / Collectibles Pro", "price": 797, "requires": "Pro ($97/mo)", "features": "Storefront funnel, inventory pipeline, grading"},
            ],
            "standard": [
                {"id": "SV-STD-001", "name": "Dental Practice", "price": 197, "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-002", "name": "Insurance Agency", "price": 197, "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-003", "name": "Fitness / Gym", "price": 197, "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-004", "name": "Restaurant / Food Service", "price": 197, "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-005", "name": "Auto Detailing", "price": 197, "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-006", "name": "Home Services (HVAC/Plumb/Elec)", "price": 197, "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-007", "name": "Med Spa / Aesthetics", "price": 197, "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-008", "name": "Salon / Barbershop", "price": 197, "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-009", "name": "Coaching / Consulting", "price": 197, "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-010", "name": "Roofing / Construction", "price": 197, "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-011", "name": "Chiropractor / Wellness", "price": 197, "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-012", "name": "Ecommerce / DTC Brand", "price": 197, "requires": "Starter ($27/mo)"},
                {"id": "SV-STD-013", "name": "Nonprofit / Charity", "price": 197, "requires": "Starter ($27/mo)"},
            ],
        },
        "bundles": [
            {"id": "SV-BUN-START", "name": "Starter Launch Bundle", "setup": 347, "monthly": 27, "includes": "CorpNet Deluxe LLC + 1 Standard Snapshot + Starter sub"},
            {"id": "SV-BUN-PRO", "name": "Pro Business Bundle", "setup": 997, "monthly": 97, "includes": "CorpNet Complete LLC + 1 Premium Snapshot + Pro sub + onboarding"},
            {"id": "SV-BUN-EMPIRE", "name": "Empire Bundle", "setup": 4497, "monthly": 297, "includes": "All 5 Premium Snapshots + CorpNet Complete + Teams + 90-day onboarding"},
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
        CORPNET_BASE = "https://api.staging24.corpnet.com"
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
    CORPNET_BASE = "https://api.staging24.corpnet.com"
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
            {"id": "builder", "icon": "zap", "title": "Build Something", "subtitle": "Open SAL Studio and let AI generate full-stack apps from your description.", "cta_text": "Open Studio", "color": "#d4a017"},
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
    return {
        "foreclosures": len(DISTRESSED_PROPERTIES["foreclosure"]),
        "pre_foreclosures": len(DISTRESSED_PROPERTIES["pre_foreclosure"]),
        "tax_liens": len(DISTRESSED_PROPERTIES["tax_lien"]),
        "nods": len(DISTRESSED_PROPERTIES["nod"]),
        "total": sum(len(v) for v in DISTRESSED_PROPERTIES.values()),
    }


@app.get("/api/realestate/distressed/{category}")
async def get_distressed(category: str, state: str = "", city: str = ""):
    """Get distressed properties by category: foreclosure, pre_foreclosure, tax_lien, nod."""
    properties = DISTRESSED_PROPERTIES.get(category, [])
    if state:
        properties = [p for p in properties if p.get("state", "").upper() == state.upper()]
    if city:
        properties = [p for p in properties if city.lower() in p.get("city", "").lower()]
    return {"category": category, "properties": properties, "total": len(properties)}


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
        {"id": "nano_banana_2",  "name": "NanoBanana v2",  "description": "Fast, high-quality image generation",     "provider": "SaintSal",  "speed": "~10s", "tier": "pro",     "cost_per_min": 0.25, "credits": 5},
        {"id": "nano_banana_pro","name": "NanoBanana Pro", "description": "Premium quality, photorealistic output",   "provider": "SaintSal",  "speed": "~15s", "tier": "max",     "cost_per_min": 0.75, "credits": 10},
        {"id": "replicate_flux", "name": "Replicate FLUX", "description": "Ultra high-resolution image synthesis",    "provider": "Replicate", "speed": "~12s", "tier": "max",     "cost_per_min": 0.75, "credits": 15},
        {"id": "grok_aurora",    "name": "Grok Aurora",    "description": "xAI native premium image generation",     "provider": "xAI",      "speed": "~10s", "tier": "max_pro", "cost_per_min": 1.00, "credits": 15},
    ],
    "video": [
        {"id": "sora_2",         "name": "Sora 2",         "description": "Cinematic video generation, 4-12s clips",  "provider": "OpenAI",    "speed": "~60s", "tier": "max",     "cost_per_min": 0.75, "credits": 20},
        {"id": "sora_2_pro",     "name": "Sora 2 Pro",     "description": "Highest quality, best for commercial use", "provider": "OpenAI",    "speed": "~90s", "tier": "max_pro", "cost_per_min": 1.00, "credits": 40},
        {"id": "veo_3_1",        "name": "Veo 3.1",        "description": "Google's latest with native audio",        "provider": "Google",    "speed": "~45s", "tier": "max",     "cost_per_min": 0.75, "credits": 18},
        {"id": "runway_gen4",    "name": "Runway Gen-4",   "description": "Runway flagship, cinematic motion",        "provider": "Runway",    "speed": "~30s", "tier": "max_pro", "cost_per_min": 1.00, "credits": 30},
    ],
    "audio": [
        {"id": "elevenlabs_basic", "name": "ElevenLabs Basic","description": "Fast text-to-speech",                   "provider": "ElevenLabs","speed": "~3s",  "tier": "mini",    "cost_per_min": 0.05, "credits": 2},
        {"id": "elevenlabs_pro",   "name": "ElevenLabs Pro", "description": "HD voice synthesis",                     "provider": "ElevenLabs","speed": "~5s",  "tier": "pro",     "cost_per_min": 0.25, "credits": 5},
        {"id": "elevenlabs_ultra",  "name": "ElevenLabs Ultra","description": "Ultra-realistic voice cloning",         "provider": "ElevenLabs","speed": "~8s",  "tier": "max_pro", "cost_per_min": 1.00, "credits": 10},
    ],
    "design": [
        {"id": "stitch_flash",       "name": "Stitch Flash",           "description": "Fast UI design generation (Gemini Flash)", "provider": "Google Stitch", "speed": "~15s", "tier": "pro",     "cost_per_min": 0.25, "credits": 5},
        {"id": "stitch_pro",         "name": "Stitch Pro",             "description": "Premium UI design (Gemini 3 Pro)",         "provider": "Google Stitch", "speed": "~30s", "tier": "max",     "cost_per_min": 0.75, "credits": 10},
    ],
    "chat": [
        {"id": "claude_haiku",       "name": "Claude 3.5 Haiku",       "description": "Fast everyday tasks",             "provider": "Anthropic",  "speed": "~1s",  "tier": "mini",    "cost_per_min": 0.05, "credits": 1},
        {"id": "gemini_flash",       "name": "Gemini 2.5 Flash",       "description": "Lightning fast",                  "provider": "Google",     "speed": "~1s",  "tier": "mini",    "cost_per_min": 0.05, "credits": 1},
        {"id": "claude_sonnet",      "name": "Claude 3.7 Sonnet",      "description": "Best speed + quality balance",    "provider": "Anthropic",  "speed": "~2s",  "tier": "pro",     "cost_per_min": 0.25, "credits": 3},
        {"id": "gpt4o",              "name": "GPT-4o",                 "description": "OpenAI flagship multimodal",      "provider": "OpenAI",     "speed": "~2s",  "tier": "pro",     "cost_per_min": 0.25, "credits": 3},
        {"id": "claude_opus",        "name": "Claude 3 Opus",          "description": "Maximum reasoning power",         "provider": "Anthropic",  "speed": "~5s",  "tier": "max",     "cost_per_min": 0.75, "credits": 10},
        {"id": "o3_mini",            "name": "o3-mini",                "description": "Advanced reasoning engine",       "provider": "OpenAI",     "speed": "~8s",  "tier": "max_pro", "cost_per_min": 1.00, "credits": 15},
    ],
}

STUDIO_VOICES = {
    "gemini": ["kore", "charon", "fenrir", "aoede", "puck", "leda", "orus", "zephyr", "achernar", "gacrux", "umbriel", "schedar", "despina", "iapetus"],
    "elevenlabs": ["rachel", "adam", "alice", "brian", "charlie", "charlotte", "chris", "daniel", "emily", "george", "james", "lily", "sam", "sarah"],
}

# ═══════════════════════════════════════════════════════════════════════════════
# GOOGLE STITCH — AI UI Design via MCP (Model Context Protocol)
# ═══════════════════════════════════════════════════════════════════════════════

STITCH_API_KEY = os.environ.get("STITCH_API_KEY", "AQ.Ab8RN6KWP2VrGlNboo262W7tcL5gVDZgBegwOr3Y2Oxyju3tZA")
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


# ============================================================================
# METERING & BILLING — Mini/Pro/Max/MaxPro Per-Minute Compute Tiers
# ============================================================================
# Stripe Metered Price IDs:
#   Mini ($0.05/min):     price_1T5bkVL47U80vDLAHHAjXmJh
#   Pro ($0.25/min):      price_1T5bkWL47U80vDLA4EI3dylp
#   Max ($0.75/min):      price_1T5bkXL47U80vDLAdF4S8y4T
#   Max Pro ($1.00/min):  price_1T5bkYL47U80vDLA5v8o0c2o
# ============================================================================

STRIPE_SECRET = os.environ.get("STRIPE_SECRET_KEY", "")

# Compute tier definitions
COMPUTE_TIERS = {
    "mini":     {"price_per_min": 0.05, "label": "Mini",     "stripe_price_id": "price_1T5bkVL47U80vDLAHHAjXmJh", "color": "#6B7280"},
    "pro":      {"price_per_min": 0.25, "label": "Pro",      "stripe_price_id": "price_1T5bkWL47U80vDLA4EI3dylp", "color": "#10B981"},
    "max":      {"price_per_min": 0.75, "label": "Max",      "stripe_price_id": "price_1T5bkXL47U80vDLAdF4S8y4T", "color": "#8B5CF6"},
    "max_pro":  {"price_per_min": 1.00, "label": "Max Pro",  "stripe_price_id": "price_1T5bkYL47U80vDLA5v8o0c2o", "color": "#F59E0B"},
}

# Model → compute tier mapping with full cost data
MODEL_COSTS = {
    # ═══ MINI TIER ($0.05/min) ═══
    "claude_haiku":      {"name": "Claude 3.5 Haiku",     "provider": "Anthropic",  "category": "chat",  "tier": "mini",    "our_cost": 0.008,  "charge": 0.05, "credits": 1,  "min_plan": "free",    "speed": "~1s",  "quality": "Fast"},
    "gpt4o_mini":        {"name": "GPT-4o Mini",          "provider": "OpenAI",     "category": "chat",  "tier": "mini",    "our_cost": 0.010,  "charge": 0.05, "credits": 1,  "min_plan": "free",    "speed": "~1s",  "quality": "Fast"},
    "gemini_flash":      {"name": "Gemini 2.5 Flash",     "provider": "Google",     "category": "chat",  "tier": "mini",    "our_cost": 0.005,  "charge": 0.05, "credits": 1,  "min_plan": "free",    "speed": "~1s",  "quality": "Fast"},
    "llama_scout":       {"name": "Llama 4 Scout",        "provider": "Meta",       "category": "chat",  "tier": "mini",    "our_cost": 0.007,  "charge": 0.05, "credits": 1,  "min_plan": "free",    "speed": "~1s",  "quality": "Fast"},
    "mistral_small":     {"name": "Mistral Small",        "provider": "Mistral",    "category": "chat",  "tier": "mini",    "our_cost": 0.006,  "charge": 0.05, "credits": 1,  "min_plan": "free",    "speed": "~1s",  "quality": "Fast"},
    "elevenlabs_basic":  {"name": "ElevenLabs Basic TTS", "provider": "ElevenLabs", "category": "audio", "tier": "mini",    "our_cost": 0.010,  "charge": 0.05, "credits": 2,  "min_plan": "free",    "speed": "~3s",  "quality": "Fast"},
    # ═══ PRO TIER ($0.25/min) ═══
    "claude_sonnet":     {"name": "Claude 3.7 Sonnet",    "provider": "Anthropic",  "category": "chat",  "tier": "pro",     "our_cost": 0.045,  "charge": 0.25, "credits": 3,  "min_plan": "starter", "speed": "~2s",  "quality": "Pro"},
    "gpt4o":             {"name": "GPT-4o",               "provider": "OpenAI",     "category": "chat",  "tier": "pro",     "our_cost": 0.0375, "charge": 0.25, "credits": 3,  "min_plan": "starter", "speed": "~2s",  "quality": "Pro"},
    "gemini_pro":        {"name": "Gemini 2.5 Pro",       "provider": "Google",     "category": "chat",  "tier": "pro",     "our_cost": 0.030,  "charge": 0.25, "credits": 3,  "min_plan": "starter", "speed": "~2s",  "quality": "Pro"},
    "llama_maverick":    {"name": "Llama 4 Maverick",     "provider": "Meta",       "category": "chat",  "tier": "pro",     "our_cost": 0.040,  "charge": 0.25, "credits": 3,  "min_plan": "starter", "speed": "~2s",  "quality": "Pro"},
    "deepseek_v3":       {"name": "DeepSeek V3",          "provider": "DeepSeek",   "category": "chat",  "tier": "pro",     "our_cost": 0.020,  "charge": 0.25, "credits": 2,  "min_plan": "starter", "speed": "~2s",  "quality": "Pro"},
    "grok_2":            {"name": "Grok 2",               "provider": "xAI",        "category": "chat",  "tier": "pro",     "our_cost": 0.035,  "charge": 0.25, "credits": 3,  "min_plan": "starter", "speed": "~2s",  "quality": "Pro"},
    "sonar_pro":         {"name": "Perplexity Sonar Pro",  "provider": "Perplexity", "category": "search","tier": "pro",     "our_cost": 0.030,  "charge": 0.25, "credits": 5,  "min_plan": "starter", "speed": "~3s",  "quality": "Pro"},
    "nano_banana_2":     {"name": "NanoBanana v2",        "provider": "SaintSal",   "category": "image", "tier": "pro",     "our_cost": 0.020,  "charge": 0.25, "credits": 5,  "min_plan": "starter", "speed": "~10s", "quality": "Pro"},
    "elevenlabs_pro":    {"name": "ElevenLabs Pro TTS",   "provider": "ElevenLabs", "category": "audio", "tier": "pro",     "our_cost": 0.030,  "charge": 0.25, "credits": 5,  "min_plan": "starter", "speed": "~5s",  "quality": "Pro"},
    "stitch_flash":      {"name": "Stitch Flash",         "provider": "Google Stitch", "category": "design", "tier": "pro",  "our_cost": 0.025,  "charge": 0.25, "credits": 5,  "min_plan": "starter", "speed": "~15s", "quality": "Pro"},
    # ═══ MAX TIER ($0.75/min) ═══
    "claude_opus":       {"name": "Claude 3 Opus",        "provider": "Anthropic",  "category": "chat",  "tier": "max",     "our_cost": 0.225,  "charge": 0.75, "credits": 10, "min_plan": "pro",     "speed": "~5s",  "quality": "Ultra"},
    "gpt45":             {"name": "GPT-4.5",              "provider": "OpenAI",     "category": "chat",  "tier": "max",     "our_cost": 0.300,  "charge": 0.75, "credits": 10, "min_plan": "pro",     "speed": "~5s",  "quality": "Ultra"},
    "gemini_ultra":      {"name": "Gemini Ultra",         "provider": "Google",     "category": "chat",  "tier": "max",     "our_cost": 0.150,  "charge": 0.75, "credits": 8,  "min_plan": "pro",     "speed": "~4s",  "quality": "Ultra"},
    "grok3":             {"name": "Grok 3",               "provider": "xAI",        "category": "chat",  "tier": "max",     "our_cost": 0.180,  "charge": 0.75, "credits": 8,  "min_plan": "pro",     "speed": "~4s",  "quality": "Ultra"},
    "nano_banana_pro":   {"name": "NanoBanana Pro",       "provider": "SaintSal",   "category": "image", "tier": "max",     "our_cost": 0.080,  "charge": 0.75, "credits": 10, "min_plan": "pro",     "speed": "~15s", "quality": "Ultra"},
    "replicate_flux":    {"name": "Replicate FLUX",       "provider": "Replicate",  "category": "image", "tier": "max",     "our_cost": 0.100,  "charge": 0.75, "credits": 15, "min_plan": "pro",     "speed": "~12s", "quality": "Ultra"},
    "sora_2":            {"name": "Sora 2",               "provider": "OpenAI",     "category": "video", "tier": "max",     "our_cost": 0.200,  "charge": 0.75, "credits": 20, "min_plan": "pro",     "speed": "~60s", "quality": "Ultra"},
    "veo_3_1":           {"name": "Veo 3.1",              "provider": "Google",     "category": "video", "tier": "max",     "our_cost": 0.150,  "charge": 0.75, "credits": 18, "min_plan": "pro",     "speed": "~45s", "quality": "Ultra"},
    "assemblyai":        {"name": "AssemblyAI",           "provider": "AssemblyAI", "category": "transcription", "tier": "max", "our_cost": 0.010, "charge": 0.75, "credits": 3, "min_plan": "pro", "speed": "~RT", "quality": "Ultra"},
    "stitch_pro":        {"name": "Stitch Pro",           "provider": "Google Stitch", "category": "design", "tier": "max",  "our_cost": 0.080,  "charge": 0.75, "credits": 10, "min_plan": "pro",     "speed": "~30s", "quality": "Ultra"},
    # ═══ MAX PRO TIER ($1.00/min) ═══
    "o3_mini":               {"name": "o3-mini",                  "provider": "OpenAI",     "category": "chat",  "tier": "max_pro", "our_cost": 0.165,  "charge": 1.00, "credits": 15, "min_plan": "teams",   "speed": "~8s",  "quality": "Flagship"},
    "claude_sonnet_think":   {"name": "Claude Sonnet (Thinking)", "provider": "Anthropic",  "category": "chat",  "tier": "max_pro", "our_cost": 0.0675, "charge": 1.00, "credits": 12, "min_plan": "teams",   "speed": "~10s", "quality": "Flagship"},
    "gemini_think":          {"name": "Gemini Flash Thinking",    "provider": "Google",     "category": "chat",  "tier": "max_pro", "our_cost": 0.045,  "charge": 1.00, "credits": 10, "min_plan": "teams",   "speed": "~8s",  "quality": "Flagship"},
    "deepseek_r1":           {"name": "DeepSeek R1",              "provider": "DeepSeek",   "category": "chat",  "tier": "max_pro", "our_cost": 0.055,  "charge": 1.00, "credits": 12, "min_plan": "teams",   "speed": "~10s", "quality": "Flagship"},
    "qwen_qwq":              {"name": "Qwen QWQ-32B",             "provider": "Alibaba",    "category": "chat",  "tier": "max_pro", "our_cost": 0.030,  "charge": 1.00, "credits": 8,  "min_plan": "teams",   "speed": "~6s",  "quality": "Flagship"},
    "sora_2_pro":            {"name": "Sora 2 Pro",               "provider": "OpenAI",     "category": "video", "tier": "max_pro", "our_cost": 0.400,  "charge": 1.00, "credits": 40, "min_plan": "teams",   "speed": "~90s", "quality": "Flagship"},
    "runway_gen4":           {"name": "Runway Gen-4",             "provider": "Runway",     "category": "video", "tier": "max_pro", "our_cost": 0.300,  "charge": 1.00, "credits": 30, "min_plan": "teams",   "speed": "~30s", "quality": "Flagship"},
    "grok_aurora":           {"name": "Grok Aurora",              "provider": "xAI",        "category": "image", "tier": "max_pro", "our_cost": 0.060,  "charge": 1.00, "credits": 15, "min_plan": "teams",   "speed": "~10s", "quality": "Flagship"},
    "elevenlabs_ultra":      {"name": "ElevenLabs Ultra",         "provider": "ElevenLabs", "category": "audio", "tier": "max_pro", "our_cost": 0.050,  "charge": 1.00, "credits": 10, "min_plan": "teams",   "speed": "~8s",  "quality": "Flagship"},
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
        # Call Supabase meter_compute RPC
        result = supabase_admin.rpc("meter_compute", {
            "p_user_id": user_id,
            "p_model_id": model_id,
            "p_action_type": action_type,
            "p_duration_minutes": duration_minutes,
            "p_input_tokens": input_tokens,
            "p_output_tokens": output_tokens,
            "p_metadata": json.dumps({"provider": model["provider"], "category": model["category"]})
        }).execute()
        
        if result.data and isinstance(result.data, dict) and result.data.get("success"):
            # Report to Stripe metered billing (async, non-blocking)
            if STRIPE_SECRET and result.data.get("stripe_price_id"):
                try:
                    async with httpx.AsyncClient() as hc:
                        # Stripe expects quantity in whole units — report minutes * 100 for cent precision
                        quantity = max(1, int(duration_minutes * 100))
                        await hc.post(
                            "https://api.stripe.com/v1/subscription_items/usage_records",
                            headers={"Authorization": f"Bearer {STRIPE_SECRET}"},
                            data={"quantity": quantity, "action": "increment"},
                        )
                except Exception as stripe_err:
                    print(f"[Metering] Stripe reporting error (non-fatal): {stripe_err}")
            
            return result.data
        else:
            return result.data if result.data else {"success": False, "error": "rpc_failed"}
    except Exception as e:
        print(f"[Metering] Supabase error: {e}")
        # Fallback: still allow the request but log the error
        return {"success": True, "metering_error": str(e), "credits_remaining": 999, "tier": "fallback"}


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
    }



@app.get("/api/studio/models")
async def get_studio_models():
    """Get available AI generation models."""
    return {"models": STUDIO_MODELS, "voices": STUDIO_VOICES}


@app.post("/api/studio/generate/image")
async def studio_generate_image(request: Request):
    """Generate an image using AI."""
    body = await request.json()
    prompt = body.get("prompt", "")
    model = body.get("model", "nano_banana_2")
    aspect_ratio = body.get("aspect_ratio", "1:1")
    style = body.get("style", "")

    if not prompt:
        return JSONResponse({"error": "Prompt required"}, status_code=400)

    full_prompt = f"{style + ': ' if style else ''}{prompt}"

    try:
        from generate_image import generate_image
        image_bytes = await generate_image(full_prompt, model=model, aspect_ratio=aspect_ratio)

        # Save to gallery
        file_id = str(uuid.uuid4())[:8]
        filename = f"img_{file_id}.png"
        filepath = MEDIA_DIR / "images" / filename
        filepath.write_bytes(image_bytes)

        entry = {
            "id": file_id,
            "type": "image",
            "filename": filename,
            "prompt": prompt,
            "model": model,
            "aspect_ratio": aspect_ratio,
            "style": style,
            "created_at": datetime.now().isoformat(),
            "size_bytes": len(image_bytes),
            "url": f"/api/studio/media/images/{filename}",
        }
        media_gallery.insert(0, entry)

        # Return base64 for immediate display
        b64 = base64.b64encode(image_bytes).decode()
        return {**entry, "data": f"data:image/png;base64,{b64}"}

    except Exception as e:
        print(f"[Studio] Image generation error: {e}")
        return JSONResponse({"error": f"Generation failed: {str(e)[:200]}"}, status_code=422)


@app.post("/api/studio/generate/video")
async def studio_generate_video(request: Request):
    """Generate a video using AI."""
    body = await request.json()
    prompt = body.get("prompt", "")
    model = body.get("model", "sora_2")
    aspect_ratio = body.get("aspect_ratio", "16:9")
    duration = body.get("duration", 8)

    if not prompt:
        return JSONResponse({"error": "Prompt required"}, status_code=400)

    try:
        from generate_video import generate_video
        video_bytes = await generate_video(
            prompt, model=model, aspect_ratio=aspect_ratio, duration=duration
        )

        file_id = str(uuid.uuid4())[:8]
        filename = f"vid_{file_id}.mp4"
        filepath = MEDIA_DIR / "videos" / filename
        filepath.write_bytes(video_bytes)

        entry = {
            "id": file_id,
            "type": "video",
            "filename": filename,
            "prompt": prompt,
            "model": model,
            "aspect_ratio": aspect_ratio,
            "duration": duration,
            "created_at": datetime.now().isoformat(),
            "size_bytes": len(video_bytes),
            "url": f"/api/studio/media/videos/{filename}",
        }
        media_gallery.insert(0, entry)

        b64 = base64.b64encode(video_bytes).decode()
        return {**entry, "data": f"data:video/mp4;base64,{b64}"}

    except Exception as e:
        print(f"[Studio] Video generation error: {e}")
        return JSONResponse({"error": f"Generation failed: {str(e)[:200]}"}, status_code=422)


@app.post("/api/studio/generate/audio")
async def studio_generate_audio(request: Request):
    """Generate audio/TTS using AI."""
    body = await request.json()
    text = body.get("text", "")
    voice = body.get("voice", "kore")
    model = body.get("model", "gemini_2_5_pro_tts")
    dialogue = body.get("dialogue", None)

    if not text and not dialogue:
        return JSONResponse({"error": "Text or dialogue required"}, status_code=400)

    try:
        from generate_audio import generate_audio as gen_audio, generate_dialogue

        if dialogue:
            audio_bytes = await generate_dialogue(dialogue, model=model)
        else:
            audio_bytes = await gen_audio(text, voice=voice, model=model)

        file_id = str(uuid.uuid4())[:8]
        filename = f"audio_{file_id}.mp3"
        filepath = MEDIA_DIR / "audio" / filename
        filepath.write_bytes(audio_bytes)

        entry = {
            "id": file_id,
            "type": "audio",
            "filename": filename,
            "text": text[:200] if text else "Dialogue",
            "voice": voice,
            "model": model,
            "created_at": datetime.now().isoformat(),
            "size_bytes": len(audio_bytes),
            "url": f"/api/studio/media/audio/{filename}",
        }
        media_gallery.insert(0, entry)

        b64 = base64.b64encode(audio_bytes).decode()
        return {**entry, "data": f"data:audio/mpeg;base64,{b64}"}

    except Exception as e:
        print(f"[Studio] Audio generation error: {e}")
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


@app.post("/api/auth/signup")
async def auth_signup(data: AuthSignup):
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
                "message": "Check your email to confirm your SaintSal™ Labs account" if not result.session else "Welcome to SaintSal™ Labs"
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


@app.post("/api/auth/magic-link")
async def auth_magic_link(data: AuthMagicLink):
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
        "agent_id": os.environ.get("ELEVENLABS_AGENT_ID", ""),
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

# In-memory connector storage (production: Supabase encrypted vault)
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


# ── Static file serving (must be AFTER all API routes) ──────────────────────
_static_dir = Path(__file__).parent

@app.get("/")
async def serve_index():
    """Serve the main SPA."""
    index = _static_dir / "index.html"
    if index.exists():
        return FileResponse(str(index), media_type="text/html")
    return JSONResponse({"error": "index.html not found"}, status_code=404)

# Serve static assets (CSS, JS, images, icons)
app.mount("/", StaticFiles(directory=str(_static_dir), html=False), name="static")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
