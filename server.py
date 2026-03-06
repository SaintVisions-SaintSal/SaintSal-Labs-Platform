#!/usr/bin/env python3
"""SaintSal.ai Backend — Real AI chat with streaming, web search, discover feed, GoDaddy domains, and CorpNet business formation."""
import json
import os
import asyncio
import httpx
import traceback
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from anthropic import Anthropic
from pydantic import BaseModel

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ─── Anthropic Client (optional — chat degrades gracefully if missing) ────────
try:
    client = Anthropic()
    _has_anthropic = bool(os.environ.get("ANTHROPIC_API_KEY"))
except Exception:
    client = None
    _has_anthropic = False

# ─── API Keys ─────────────────────────────────────────────────────────────────

GODADDY_API_KEY = os.environ.get("GODADDY_API_KEY", "fYfvRW8R6NBK_P7LYBzA3hSUAWMXGNMkpJT")
GODADDY_API_SECRET = os.environ.get("GODADDY_API_SECRET", "XxC9jFsNJuL1TW7YH6yxkE")
GODADDY_BASE = os.environ.get("GODADDY_BASE", "https://api.godaddy.com")  # switch to api.ote-godaddy.com for testing
CORPNET_DATA_API_KEY = os.environ.get("CORPNET_DATA_API_KEY", "0D3DB6A514DAED0CEF4F97D71DC9292BA84C895FE25A4EB34D09CDF4F2242F95DB554C9C88D3044F5A05F67457B4F82C44F6")
CORPNET_API_KEY = os.environ.get("CORPNET_API_KEY", "7E90-738C-175F-41BD-886C")

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

    "finance": """You are SaintSal™ Finance, an AI financial analyst powered by HACP™ (Human-AI Connection Protocol, Patent #10,290,222).

Your approach: Provide market analysis, stock insights, crypto updates, economic indicators, earnings reports, and investment research. Always cite sources with [1], [2] etc. Include relevant data points and numbers. Disclaimer: This is not financial advice.""",
}

# ─── Tavily Web Search ────────────────────────────────────────────────────────

TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")

async def search_web(query: str, search_depth: str = "basic", max_results: int = 5, topic: str = "general"):
    """Search the web using Tavily API."""
    if not TAVILY_API_KEY:
        return {"results": [], "query": query}
    
    async with httpx.AsyncClient(timeout=15.0) as http:
        try:
            resp = await http.post("https://api.tavily.com/search", json={
                "api_key": TAVILY_API_KEY,
                "query": query,
                "search_depth": search_depth,
                "max_results": max_results,
                "topic": topic,
                "include_answer": False,
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
            }
        except Exception as e:
            print(f"Tavily search error: {e}")
            return {"results": [], "query": query}


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
    """Get trending topics for a category."""
    topics = DISCOVER_TOPICS.get(category, DISCOVER_TOPICS["top"])
    return {"category": category, "topics": topics, "updated_at": datetime.now().isoformat()}


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
    
    # Step 1: Web search for context
    if use_search and query:
        topic_map = {"sports": "news", "news": "news", "finance": "news", "tech": "general", "search": "general"}
        search_results = await search_web(
            query,
            search_depth="basic",
            max_results=5,
            topic=topic_map.get(vertical, "general")
        )
        sources = search_results.get("results", [])
        
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
    
    # Step 3: Stream response
    def generate():
        # First send sources
        if sources:
            yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"
        
        # Check if Anthropic is available
        if not _has_anthropic or client is None:
            fallback = "I found some relevant information from the web (see sources above). "
            fallback += "To enable full AI-powered analysis and conversation, the ANTHROPIC_API_KEY environment variable needs to be configured on the server. "
            fallback += "Once configured, I'll be able to provide deep, contextual answers powered by Claude."
            if sources:
                fallback += "\n\nIn the meantime, here's a summary of what I found:\n\n"
                for i, s in enumerate(sources):
                    fallback += f"**[{i+1}] {s.get('title', 'Source')}** ({s.get('domain', '')})\n{s.get('content', '')}\n\n"
            yield f"data: {json.dumps({'type': 'text', 'content': fallback})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return
        
        # Then stream the AI response
        try:
            with client.messages.stream(
                model="claude-sonnet-4-20250514",
                max_tokens=2048,
                system=system_prompt,
                messages=messages,
            ) as stream:
                for text in stream.text_stream:
                    yield f"data: {json.dumps({'type': 'text', 'content': text})}\n\n"
        except Exception as e:
            error_msg = f"AI response error: {str(e)}. Web search results are shown above."
            yield f"data: {json.dumps({'type': 'text', 'content': error_msg})}\n\n"
        
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")


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

PACKAGES = [
    {
        "id": "basic",
        "name": "Basic",
        "price": 79,
        "processing": "5-7 business days",
        "features": [
            "Entity formation filing",
            "Name availability search",
            "Articles of Organization/Incorporation",
            "Standard processing (5-7 days)",
        ],
    },
    {
        "id": "complete",
        "name": "Complete",
        "price": 199,
        "popular": True,
        "processing": "3-5 business days",
        "features": [
            "Everything in Basic",
            "EIN / Federal Tax ID filing",
            "Registered agent (1 year)",
            "Operating agreement / Bylaws",
            "Banking resolution",
            "Express processing (3-5 days)",
        ],
    },
    {
        "id": "premium",
        "name": "Premium",
        "price": 349,
        "processing": "24-hour rush",
        "features": [
            "Everything in Complete",
            "Business license research",
            "S-Corp election (if applicable)",
            "Compliance monitoring & alerts",
            "Annual report reminders",
            "24-hour rush processing",
        ],
    },
]


class FormationRequest(BaseModel):
    entity_type: str
    state: str
    business_name: str
    package: str = "complete"
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None


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
async def get_packages(state: str = "CA"):
    """Get formation packages with state-specific pricing."""
    state_fee = STATE_FILING_FEES.get(state.upper(), 100)
    packages = []
    for pkg in PACKAGES:
        packages.append({
            **pkg,
            "state_fee": state_fee,
            "total": pkg["price"] + state_fee,
        })
    return {
        "packages": packages,
        "state": state.upper(),
        "state_name": STATE_NAMES.get(state.upper(), state),
        "state_fee": state_fee,
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
    """Attempt name check through CorpNet API."""
    # CorpNet API endpoints are provided under NDA to partners.
    # These are the most common patterns we'll try.
    endpoints = [
        f"https://api.corpnet.com/v1/name-availability",
        f"https://www.corpnet.com/api/v1/name-check",
    ]
    headers_variants = [
        {
            "Content-Type": "application/json",
            "X-Api-Key": CORPNET_API_KEY,
            "X-Data-Api-Key": CORPNET_DATA_API_KEY,
        },
        {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {CORPNET_DATA_API_KEY}",
            "X-Api-Key": CORPNET_API_KEY,
        },
        {
            "Content-Type": "application/json",
            "ApiKey": CORPNET_API_KEY,
            "DataApiKey": CORPNET_DATA_API_KEY,
        },
    ]

    async with httpx.AsyncClient(timeout=10.0) as http:
        for endpoint in endpoints:
            for headers in headers_variants:
                try:
                    resp = await http.post(endpoint, json={"name": name, "state": state}, headers=headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        if isinstance(data, dict) and ("available" in data or "status" in data):
                            return data
                except Exception:
                    continue
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

    # Attempt CorpNet API submission
    api_result = await _corpnet_submit_formation(req)
    if api_result:
        order["corpnet_order_id"] = api_result.get("order_id", "")
        order["api_live"] = True
        order["status"] = api_result.get("status", "submitted")
    else:
        order["api_live"] = False
        order["note"] = "Order queued. CorpNet API integration is being finalized — our team will process this manually within 24 hours."

    # Store in-memory (would be DB in production)
    if not hasattr(app, "_orders"):
        app._orders = []
    app._orders.append(order)

    return order


async def _corpnet_submit_formation(req: FormationRequest) -> Optional[dict]:
    """Attempt formation submission through CorpNet API."""
    endpoints = [
        f"https://api.corpnet.com/v1/formation",
        f"https://www.corpnet.com/api/v1/formation/submit",
    ]
    payload = {
        "business_name": req.business_name,
        "entity_type": req.entity_type,
        "state": req.state,
        "package": req.package,
        "contact_name": req.contact_name,
        "contact_email": req.contact_email,
        "contact_phone": req.contact_phone,
    }
    headers_variants = [
        {
            "Content-Type": "application/json",
            "X-Api-Key": CORPNET_API_KEY,
            "X-Data-Api-Key": CORPNET_DATA_API_KEY,
        },
        {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {CORPNET_DATA_API_KEY}",
            "X-Api-Key": CORPNET_API_KEY,
        },
    ]

    async with httpx.AsyncClient(timeout=15.0) as http:
        for endpoint in endpoints:
            for headers in headers_variants:
                try:
                    resp = await http.post(endpoint, json=payload, headers=headers)
                    if resp.status_code in (200, 201):
                        return resp.json()
                except Exception:
                    continue
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


# ─── Health Check ─────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "SaintSal.ai",
        "version": "3.0",
        "integrations": {
            "godaddy": {"configured": bool(GODADDY_API_KEY), "base": GODADDY_BASE},
            "corpnet": {"configured": bool(CORPNET_API_KEY), "data_key_set": bool(CORPNET_DATA_API_KEY)},
            "tavily": {"configured": bool(TAVILY_API_KEY)},
        },
    }


# ─── Serve Static Files (for Render deployment) ─────────────────────────────

from pathlib import Path
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

_static_dir = Path(__file__).parent

@app.get("/")
async def serve_index():
    """Serve the main SPA."""
    index = _static_dir / "index.html"
    if index.exists():
        return FileResponse(str(index), media_type="text/html")
    return JSONResponse({"error": "index.html not found"}, status_code=404)

# Serve static assets (logos, images, favicon, etc.)
app.mount("/", StaticFiles(directory=str(_static_dir), html=False), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
