#!/usr/bin/env python3
"""Add Real Estate vertical backend to server.py"""
import re

with open("/home/user/workspace/saintsal-app/server.py", "r") as f:
    content = f.read()

# ═══════════════════════════════════════════════════════════════════
# 1. Add RentCast API key after CORPNET keys
# ═══════════════════════════════════════════════════════════════════
rentcast_key_block = '''CORPNET_API_KEY = os.environ.get("CORPNET_API_KEY", "7E90-738C-175F-41BD-886C")

# ─── Real Estate API Keys ────────────────────────────────────────────────────
RENTCAST_API_KEY = os.environ.get("RENTCAST_API_KEY", "e14286fed9e243c6afcba08fcce4bd8f")
RENTCAST_BASE = "https://api.rentcast.io/v1"
GOOGLE_MAPS_KEY = os.environ.get("GOOGLE_MAPS_KEY", "AIzaSyA2RxjYuME6mEa1-Sb-8ZfZjR0ujJ-lITQ")
'''

content = content.replace(
    'CORPNET_API_KEY = os.environ.get("CORPNET_API_KEY", "7E90-738C-175F-41BD-886C")',
    rentcast_key_block
)

# ═══════════════════════════════════════════════════════════════════
# 2. Add Real Estate system prompt
# ═══════════════════════════════════════════════════════════════════
re_system_prompt = '''
    "realestate": """You are SaintSal™ Real Estate, an AI real estate investment analyst powered by HACP™ (Human-AI Connection Protocol, Patent #10,290,222).

Your approach: Provide property analysis, investment deal evaluation, market insights, comparables, rental estimates, and distressed property intelligence. Cover residential, multifamily, commercial properties, foreclosures, pre-foreclosures, tax liens, and NODs. Always cite sources with [1], [2] etc. Include cap rates, cash-on-cash returns, and relevant financial metrics. Disclaimer: This is not investment advice.""",
'''

content = content.replace(
    '''    "finance": """You are SaintSal™ Finance''',
    re_system_prompt + '    "finance": """You are SaintSal™ Finance'
)

# Also add "realestate" to the topic_map in chat
content = content.replace(
    'topic_map = {"sports": "news", "news": "news", "finance": "news", "tech": "general", "search": "general"}',
    'topic_map = {"sports": "news", "news": "news", "finance": "news", "realestate": "general", "tech": "general", "search": "general"}'
)

# ═══════════════════════════════════════════════════════════════════
# 3. Add Real Estate discover topics
# ═══════════════════════════════════════════════════════════════════
re_discover = '''    "realestate": [
        {"title": "Housing Market Cooldown: Prices Drop in 30 Major Metro Areas", "category": "Market", "sources": 47, "time": "1h ago", "summary": "Home prices declined in 30 of the top 50 metro areas last month, signaling a potential market correction after years of unprecedented growth."},
        {"title": "Pre-Foreclosure Filings Surge 26% as ARM Resets Hit Homeowners", "category": "Distressed", "sources": 33, "time": "2h ago", "summary": "Adjustable-rate mortgage resets are driving a sharp increase in pre-foreclosure filings, creating opportunities for investors in key markets."},
        {"title": "Multifamily Cap Rates Compress Below 5% in Sun Belt Markets", "category": "Investment", "sources": 28, "time": "3h ago", "summary": "Strong rental demand and migration trends push multifamily cap rates to historic lows in Austin, Phoenix, and Miami-Dade."},
        {"title": "Commercial Real Estate Distress: $150B in Loans Coming Due", "category": "Commercial", "sources": 52, "time": "4h ago", "summary": "A wave of commercial real estate loans maturing in 2026 faces refinancing challenges amid higher interest rates and lower occupancy."},
        {"title": "Tax Lien Auctions See Record Investor Participation", "category": "Tax Liens", "sources": 19, "time": "5h ago", "summary": "Online tax lien auction platforms report 3x increase in registered bidders as investors seek higher yields in the current rate environment."},
    ],
'''

content = content.replace(
    '    "finance": [\n        {"title": "S&P 500',
    re_discover + '    "finance": [\n        {"title": "S&P 500'
)

# ═══════════════════════════════════════════════════════════════════
# 4. Add Real Estate ticker data
# ═══════════════════════════════════════════════════════════════════
re_ticker_data = '''
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

'''

content = content.replace(
    '\n@app.get("/api/ticker/{vertical}")',
    re_ticker_data + '\n@app.get("/api/ticker/{vertical}")'
)

# Add realestate to the ticker endpoint
content = content.replace(
    '''    elif vertical in ("top", "search"):
        return {"headlines": TOP_HEADLINES}
    return {"headlines": []}''',
    '''    elif vertical == "realestate":
        return {"market": RE_MARKET_DATA, "headlines": RE_HEADLINES}
    elif vertical in ("top", "search"):
        return {"headlines": TOP_HEADLINES}
    return {"headlines": []}'''
)

# ═══════════════════════════════════════════════════════════════════
# 5. Add Real Estate engagement content
# ═══════════════════════════════════════════════════════════════════
re_engagement = '''    "realestate": {
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
'''

content = content.replace(
    '    "top": {\n        "news": [\n            {"title": "SpaceX',
    re_engagement + '    "top": {\n        "news": [\n            {"title": "SpaceX'
)

# Add home and alert icons to getCtaIcon
# (we'll handle this in the frontend)

# ═══════════════════════════════════════════════════════════════════
# 6. Add RentCast API endpoints
# ═══════════════════════════════════════════════════════════════════
rentcast_endpoints = '''

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


@app.get("/api/realestate/distressed/{category}")
async def get_distressed(category: str, state: str = "", city: str = ""):
    """Get distressed properties by category: foreclosure, pre_foreclosure, tax_lien, nod."""
    properties = DISTRESSED_PROPERTIES.get(category, [])
    if state:
        properties = [p for p in properties if p.get("state", "").upper() == state.upper()]
    if city:
        properties = [p for p in properties if city.lower() in p.get("city", "").lower()]
    return {"category": category, "properties": properties, "total": len(properties)}


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

'''

# Insert before health check
content = content.replace(
    '\n# ─── Health Check',
    rentcast_endpoints + '\n# ─── Health Check'
)

# ═══════════════════════════════════════════════════════════════════
# 7. Update health check to include real estate
# ═══════════════════════════════════════════════════════════════════
content = content.replace(
    '            "tavily": {"configured": bool(TAVILY_API_KEY)},',
    '            "tavily": {"configured": bool(TAVILY_API_KEY)},\n            "rentcast": {"configured": bool(RENTCAST_API_KEY), "base": RENTCAST_BASE},\n            "google_maps": {"configured": bool(GOOGLE_MAPS_KEY)},'
)

# ═══════════════════════════════════════════════════════════════════
# 8. Update version
# ═══════════════════════════════════════════════════════════════════
content = content.replace('"version": "3.0"', '"version": "4.0-realestate"')

with open("/home/user/workspace/saintsal-app/server.py", "w") as f:
    f.write(content)

print("✅ server.py updated with Real Estate vertical!")
print("  - Real Estate system prompt added")
print("  - Discover topics added")
print("  - Ticker data added")
print("  - Engagement content added")
print("  - RentCast API endpoints (search, value, rent, listings, market)")
print("  - Distressed property endpoints (foreclosure, pre-foreclosure, tax lien, NOD)")
print("  - Deal analysis calculator endpoint")
