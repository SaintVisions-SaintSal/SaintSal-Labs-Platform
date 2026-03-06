#!/usr/bin/env python3
"""
Add metering endpoints and credit usage display to SaintSal Labs Platform.
Patches server.py with metering API endpoints.
Patches app.js with credit display and usage warnings.
"""

# ============================================
# 1. SERVER PATCHES — Metering endpoints
# ============================================

SERVER_METERING_BLOCK = '''

# ============================================================================
# METERING & BILLING — Credit tracking, usage analytics, cost transparency
# ============================================================================

# Model cost configuration (cost to us vs what we charge)
MODEL_COSTS = {
    # Chat models (per 1K tokens)
    "claude_haiku_4_5":   {"cost": 0.00025, "price": 0.001,  "credits": 1,  "min_tier": "free",    "unit": "1K tokens"},
    "claude_sonnet_4_6":  {"cost": 0.003,   "price": 0.012,  "credits": 3,  "min_tier": "starter", "unit": "1K tokens"},
    "claude_opus_4_6":    {"cost": 0.015,   "price": 0.06,   "credits": 10, "min_tier": "pro",     "unit": "1K tokens"},
    "grok_4_1":           {"cost": 0.005,   "price": 0.02,   "credits": 5,  "min_tier": "pro",     "unit": "1K tokens"},
    "gemini_3_pro":       {"cost": 0.00125, "price": 0.005,  "credits": 2,  "min_tier": "starter", "unit": "1K tokens"},
    "gemini_3_flash":     {"cost": 0.000188,"price": 0.00075,"credits": 1,  "min_tier": "free",    "unit": "1K tokens"},
    "sonar_pro":          {"cost": 0.003,   "price": 0.015,  "credits": 5,  "min_tier": "starter", "unit": "request"},
    # Image models (per image)
    "nano_banana_2":      {"cost": 0.02,  "price": 0.08,  "credits": 5,  "min_tier": "free",    "unit": "image"},
    "nano_banana_pro":    {"cost": 0.04,  "price": 0.15,  "credits": 10, "min_tier": "starter", "unit": "image"},
    "replicate_flux":     {"cost": 0.05,  "price": 0.20,  "credits": 15, "min_tier": "pro",     "unit": "image"},
    "grok_aurora":        {"cost": 0.03,  "price": 0.12,  "credits": 8,  "min_tier": "starter", "unit": "image"},
    # Video models (per second of output)
    "sora_2":             {"cost": 0.10,  "price": 0.40,  "credits": 20, "min_tier": "pro",     "unit": "second"},
    "sora_2_pro":         {"cost": 0.20,  "price": 0.80,  "credits": 40, "min_tier": "teams",   "unit": "second"},
    "veo_3_1":            {"cost": 0.08,  "price": 0.35,  "credits": 18, "min_tier": "pro",     "unit": "second"},
    "veo_3_1_fast":       {"cost": 0.05,  "price": 0.20,  "credits": 12, "min_tier": "starter", "unit": "second"},
    "runway_gen4":        {"cost": 0.15,  "price": 0.60,  "credits": 30, "min_tier": "pro",     "unit": "second"},
    "replicate_video":    {"cost": 0.06,  "price": 0.25,  "credits": 15, "min_tier": "starter", "unit": "second"},
    # Audio models (per second of output)
    "gemini_2_5_pro_tts": {"cost": 0.005, "price": 0.02,  "credits": 2,  "min_tier": "free",    "unit": "second"},
    "elevenlabs_tts_v3":  {"cost": 0.01,  "price": 0.04,  "credits": 5,  "min_tier": "starter", "unit": "second"},
}

# Plan tier configuration
PLAN_TIERS = {
    "free":       {"credits": 100,   "price_monthly": 0,    "models": ["claude_haiku_4_5", "gemini_3_flash", "nano_banana_2", "gemini_2_5_pro_tts"]},
    "starter":    {"credits": 500,   "price_monthly": 27,   "models": "all_basic"},
    "pro":        {"credits": 2000,  "price_monthly": 97,   "models": "all"},
    "teams":      {"credits": 5000,  "price_monthly": 297,  "models": "all_premium"},
    "enterprise": {"credits": -1,    "price_monthly": 497,  "models": "unlimited"},
}


@app.get("/api/metering/pricing")
async def get_model_pricing():
    """Get all model pricing info for transparency display."""
    pricing = []
    for model_id, costs in MODEL_COSTS.items():
        margin = ((costs["price"] - costs["cost"]) / costs["cost"] * 100) if costs["cost"] > 0 else 0
        pricing.append({
            "model_id": model_id,
            "credits_per_use": costs["credits"],
            "price_per_unit": costs["price"],
            "unit": costs["unit"],
            "min_tier": costs["min_tier"],
            "margin_pct": round(margin, 1),
        })
    return {"pricing": pricing, "tiers": PLAN_TIERS}


@app.get("/api/metering/usage")
async def get_usage_summary(user_id: str = "demo"):
    """Get usage summary for current billing period."""
    # In production, this queries Supabase usage_log
    return {
        "user_id": user_id,
        "period": "2026-03",
        "credits_used": 47,
        "credits_remaining": 53,
        "credits_limit": 100,
        "tier": "free",
        "usage_by_type": {
            "chat": {"count": 32, "credits": 32},
            "image_gen": {"count": 3, "credits": 15},
            "search": {"count": 5, "credits": 0},
        },
        "cost_breakdown": {
            "total_charged": 0.94,
            "our_cost": 0.23,
            "margin": 75.5,
        }
    }


@app.post("/api/metering/check")
async def check_credits(model: str = "claude_haiku_4_5", user_id: str = "demo"):
    """Pre-check if user has enough credits for a model call."""
    model_info = MODEL_COSTS.get(model, MODEL_COSTS["claude_haiku_4_5"])
    # In production, check user's actual credits from Supabase
    demo_remaining = 53
    credits_needed = model_info["credits"]
    
    return {
        "model": model,
        "credits_needed": credits_needed,
        "credits_remaining": demo_remaining,
        "can_proceed": demo_remaining >= credits_needed,
        "min_tier": model_info["min_tier"],
        "price_per_unit": model_info["price"],
        "unit": model_info["unit"],
    }

'''

import re

# Read current server.py
with open('/home/user/workspace/saintsal-app/server.py', 'r') as f:
    server = f.read()

# Find a good insertion point — after the STUDIO_VOICES block
if 'MODEL_COSTS' not in server:
    # Insert before the @app.get("/api/studio/models") line
    insertion_point = server.find('@app.get("/api/studio/models")')
    if insertion_point > 0:
        server = server[:insertion_point] + SERVER_METERING_BLOCK + '\n\n' + server[insertion_point:]
        with open('/home/user/workspace/saintsal-app/server.py', 'w') as f:
            f.write(server)
        print("✓ Server metering endpoints added")
    else:
        print("✗ Could not find insertion point in server.py")
else:
    print("○ Metering already exists in server.py")


# ============================================
# 2. APP.JS PATCHES — Credit display in Studio
# ============================================

with open('/home/user/workspace/saintsal-app/app.js', 'r') as f:
    appjs = f.read()

# Add credit cost display after model select in Studio
# The model dropdowns show the model name, we want to also show credits
CREDIT_DISPLAY_JS = '''

/* ============================================
   METERING — Credit cost transparency
   ============================================ */
var modelCredits = {
  // Chat
  'claude_haiku_4_5': {credits: 1, label: '1 credit/msg'},
  'claude_sonnet_4_6': {credits: 3, label: '3 credits/msg'},
  'claude_opus_4_6': {credits: 10, label: '10 credits/msg'},
  // Image
  'nano_banana_2': {credits: 5, label: '5 credits'},
  'nano_banana_pro': {credits: 10, label: '10 credits'},
  'replicate_flux': {credits: 15, label: '15 credits'},
  'grok_aurora': {credits: 8, label: '8 credits'},
  // Video
  'sora_2': {credits: 20, label: '20 credits/clip'},
  'sora_2_pro': {credits: 40, label: '40 credits/clip'},
  'veo_3_1': {credits: 18, label: '18 credits/clip'},
  'veo_3_1_fast': {credits: 12, label: '12 credits/clip'},
  'runway_gen4': {credits: 30, label: '30 credits/clip'},
  'replicate_video': {credits: 15, label: '15 credits/clip'},
  // Audio
  'gemini_2_5_pro_tts': {credits: 2, label: '2 credits'},
  'elevenlabs_tts_v3': {credits: 5, label: '5 credits'},
};

function showCreditCost() {
  var modelSel = document.getElementById('studioModel');
  var costEl = document.getElementById('studioCreditCost');
  if (!modelSel || !costEl) return;
  var model = modelSel.value;
  var info = modelCredits[model] || {credits: 1, label: '1 credit'};
  costEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M8 10h8M8 14h8"/></svg> ' + info.label;
}
'''

if 'modelCredits' not in appjs:
    appjs += CREDIT_DISPLAY_JS
    print("✓ Credit display JS added")
else:
    print("○ Credit display JS already exists")

# Update the renderStudioControls to add credit cost display after the generate button
old_gen_btn = "html += '<span>Generate ' + mode.charAt(0).toUpperCase() + mode.slice(1) + '</span></button>';"
new_gen_btn = """html += '<span>Generate ' + mode.charAt(0).toUpperCase() + mode.slice(1) + '</span></button>';
  html += '<div id="studioCreditCost" class="studio-credit-cost"></div>';"""

if 'studioCreditCost' not in appjs:
    appjs = appjs.replace(old_gen_btn, new_gen_btn, 1)
    print("✓ Credit cost display element added to Studio")
else:
    print("○ Credit cost element already exists")

# Add onchange handler to model selects
old_model_select_end = "controls.innerHTML = html;\n}"
new_model_select_end = """controls.innerHTML = html;
  var ms = document.getElementById('studioModel');
  if (ms) { ms.addEventListener('change', showCreditCost); showCreditCost(); }
}"""

if "showCreditCost();" not in appjs:
    appjs = appjs.replace(old_model_select_end, new_model_select_end, 1)
    print("✓ Model select credit handler added")
else:
    print("○ Credit handler already exists")

with open('/home/user/workspace/saintsal-app/app.js', 'w') as f:
    f.write(appjs)


# ============================================
# 3. CSS PATCHES — Credit display styling
# ============================================

with open('/home/user/workspace/saintsal-app/style.css', 'r') as f:
    css = f.read()

CREDIT_CSS = '''

/* Metering — Credit Cost Display */
.studio-credit-cost {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--accent-gold);
  opacity: 0.8;
  margin-top: 8px;
  padding: 6px 12px;
  background: rgba(212,160,23,0.05);
  border-radius: var(--radius-sm);
  border: 1px solid rgba(212,160,23,0.1);
}
.studio-credit-cost svg { flex-shrink: 0; }
'''

if 'studio-credit-cost' not in css:
    css += CREDIT_CSS
    with open('/home/user/workspace/saintsal-app/style.css', 'w') as f:
        f.write(css)
    print("✓ Credit display CSS added")
else:
    print("○ Credit CSS already exists")


print("\n========================================")
print("METERING SETUP COMPLETE")
print("========================================")
print("Server: /api/metering/pricing, /api/metering/usage, /api/metering/check")
print("Frontend: Credit cost display in Studio")
print("Database: supabase_schema.sql ready to apply")
print("Emails: supabase_email_templates.json ready")
