#!/usr/bin/env python3
"""
Add Supabase environment variables to Render service.
Run this script after Cap provides the Supabase keys.

Usage:
  SUPABASE_ANON_KEY=<key> SUPABASE_SERVICE_KEY=<key> python3 add_supabase_envvars.py
"""
import os
import requests
import json

RENDER_KEY = "rnd_DH743ieG8FrNfKwzBhm7Kay0hodM"
SERVICE_ID = "srv-d6l46gvkijhs73atk14g"
API = f"https://api.render.com/v1/services/{SERVICE_ID}/env-vars"
HEADERS = {
    "Authorization": f"Bearer {RENDER_KEY}",
    "Content-Type": "application/json"
}

# These are the env vars to set
ENV_VARS = [
    {"key": "SUPABASE_URL", "value": "https://euxrlpuegeiggedqbkiv.supabase.co"},
    {"key": "SUPABASE_ANON_KEY", "value": os.environ.get("SUPABASE_ANON_KEY", "")},
    {"key": "SUPABASE_SERVICE_KEY", "value": os.environ.get("SUPABASE_SERVICE_KEY", "")},
]

print("Adding Supabase env vars to Render...")
for var in ENV_VARS:
    if not var["value"]:
        print(f"  SKIP: {var['key']} (empty)")
        continue
    # Use PUT to create/update
    resp = requests.put(
        API,
        headers=HEADERS,
        json=[var]
    )
    if resp.status_code in (200, 201):
        print(f"  ✅ {var['key']} = {var['value'][:20]}...")
    else:
        print(f"  ❌ {var['key']}: {resp.status_code} {resp.text[:100]}")

print("\nDone! Trigger a deploy to apply changes.")
