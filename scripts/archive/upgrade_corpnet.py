#!/usr/bin/env python3
"""
Upgrade CorpNet integration in server.py to use the REAL Business Formation v2 API.
Based on actual CorpNet API documentation with correct endpoints, auth, and payloads.
"""

with open('/home/user/workspace/saintsal-app/server.py', 'r') as f:
    code = f.read()

# ============================================================
# REPLACE the entire CorpNet section (lines ~400-700+)
# From the separator comment to the next section
# ============================================================

old_section_start = """# ═══════════════════════════════════════════════════════════════════════════════
# CorpNet Business Formation API Integration
# ═══════════════════════════════════════════════════════════════════════════════"""

# Find where CorpNet section ends (next major section or orders endpoint end)
old_section_end = """@app.get("/api/corpnet/orders")
async def get_orders():
    \"\"\"Get all formation orders.\"\"\"
    orders = getattr(app, "_orders", [])
    # Also include demo filings
    demo_filings = [
        {
            "order_id": "SV-DEMO-001",
            "business_name": "HACP Global LLC",
            "entity_type": "llc",
            "state": "DE",
            "state_name": "Delaware",
            "package": "Premium","""

# Instead of trying to find exact section, let me replace the key functions
# Replace _corpnet_name_check function
old_name_check = '''async def _corpnet_name_check(name: str, state: str) -> Optional[dict]:
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
    return None'''

new_name_check = '''async def _corpnet_name_check(name: str, state: str) -> Optional[dict]:
    """Name check — CorpNet v2 API does not have a standalone name check endpoint.
    The name availability check is included as a bundled service in formation packages.
    We return suggestions and guide user to proceed with formation."""
    return None'''

code = code.replace(old_name_check, new_name_check)

# Replace _corpnet_submit_formation with the REAL v2 API
old_submit = '''async def _corpnet_submit_formation(req: FormationRequest) -> Optional[dict]:
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
    return None'''

new_submit = '''async def _corpnet_submit_formation(req) -> Optional[dict]:
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

    return None'''

code = code.replace(old_submit, new_submit)

# Update the FormationRequest model to include address fields
old_model = '''class FormationRequest(BaseModel):
    entity_type: str
    state: str
    business_name: str
    package: str = "complete"
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None'''

new_model = '''class FormationRequest(BaseModel):
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
    business_description: Optional[str] = None'''

code = code.replace(old_model, new_model)

# Also update the packages endpoint to try the real API first
old_packages = '''@app.get("/api/corpnet/packages")
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
    }'''

new_packages = '''@app.get("/api/corpnet/packages")
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
    }'''

code = code.replace(old_packages, new_packages)

# Add a new endpoint: Get Order Status from CorpNet
# Find the get_orders function and add a new endpoint after the corpnet section
order_status_endpoint = '''

@app.get("/api/corpnet/order-status/{order_guid}")
async def get_corpnet_order_status(order_guid: str):
    """Get real-time order status from CorpNet v2 API."""
    CORPNET_BASE = "https://api.staging24.corpnet.com"
    headers = {
        "Authorization": f"Bearer {CORPNET_DATA_API_KEY}",
        "token": CORPNET_API_KEY,
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            resp = await http.get(
                f"{CORPNET_BASE}/api/business-formation-v2/order-summary/{order_guid}",
                headers=headers,
            )
            if resp.status_code == 200:
                return resp.json()
            return {"error": f"CorpNet returned {resp.status_code}", "detail": resp.text[:300]}
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/corpnet/order-documents/{order_guid}")
async def get_corpnet_order_documents(order_guid: str):
    """Retrieve documents for a CorpNet formation order."""
    CORPNET_BASE = "https://api.staging24.corpnet.com"
    headers = {
        "Authorization": f"Bearer {CORPNET_DATA_API_KEY}",
        "token": CORPNET_API_KEY,
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            resp = await http.get(
                f"{CORPNET_BASE}/api/business-formation-v2/documents/{order_guid}",
                headers=headers,
            )
            if resp.status_code == 200:
                return resp.json()
            return {"error": f"CorpNet returned {resp.status_code}", "detail": resp.text[:300]}
    except Exception as e:
        return {"error": str(e)}

'''

# Add after the get_orders endpoint - find a good insertion point
# Insert before the Real Estate section
if "# Real Estate" in code:
    code = code.replace("# Real Estate", order_status_endpoint + "# Real Estate", 1)
elif "# ═══" in code and "REAL ESTATE" in code.upper():
    # find the real estate separator
    import re
    re_match = re.search(r'(# ═+\n# Real Estate)', code, re.IGNORECASE)
    if re_match:
        code = code[:re_match.start()] + order_status_endpoint + code[re_match.start():]

# Update the submit_formation to use the improved _corpnet_submit_formation
old_submit_handler = '''    # Attempt CorpNet API submission
    api_result = await _corpnet_submit_formation(req)
    if api_result:
        order["corpnet_order_id"] = api_result.get("order_id", "")
        order["api_live"] = True
        order["status"] = api_result.get("status", "submitted")
    else:
        order["api_live"] = False
        order["note"] = "Order queued. CorpNet API integration is being finalized — our team will process this manually within 24 hours."'''

new_submit_handler = '''    # Attempt CorpNet Business Formation v2 API submission (STAGING)
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
        order["note"] = "Order queued. CorpNet API integration is being finalized — our team will process this manually within 24 hours."'''

code = code.replace(old_submit_handler, new_submit_handler)

with open('/home/user/workspace/saintsal-app/server.py', 'w') as f:
    f.write(code)

print("✅ CorpNet v2 API integration complete!")
print("   - GET /api/corpnet/packages — now tries real CorpNet v2 API first")
print("   - POST /api/corpnet/formation — now uses real create-order endpoint")
print("   - GET /api/corpnet/order-status/{guid} — NEW real-time tracking")
print("   - GET /api/corpnet/order-documents/{guid} — NEW document retrieval")
print("   - FormationRequest model updated with address fields")
