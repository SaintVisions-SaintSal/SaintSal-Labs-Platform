#!/usr/bin/env python3
"""
Push files to GitHub using the Git Data API.
This requires authentication via a token.
We'll try using the gh CLI token if available, or fail gracefully.
"""
import subprocess
import json
import base64
import os
import sys

REPO = "SaintVisions-SaintSal/SaintSal-Labs-Platform"
BRANCH = "main"
API_BASE = f"https://api.github.com/repos/{REPO}"

# Try to get a token from gh CLI
def get_gh_token():
    try:
        result = subprocess.run(['gh', 'auth', 'token'], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            return result.stdout.strip()
    except:
        pass
    
    # Check env
    for var in ['GH_TOKEN', 'GITHUB_TOKEN']:
        token = os.environ.get(var)
        if token:
            return token
    
    return None

def gh_api(endpoint, method="GET", data=None, token=None):
    """Call GitHub API."""
    import urllib.request
    url = f"{API_BASE}{endpoint}" if endpoint.startswith('/') else endpoint
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"API Error {e.code}: {error_body[:200]}")
        raise

def push_files(token, files_to_push):
    """Push multiple files in a single commit using the Git Data API."""
    
    # 1. Get latest commit SHA
    ref = gh_api("/git/refs/heads/main", token=token)
    latest_sha = ref["object"]["sha"]
    commit = gh_api(f"/git/commits/{latest_sha}", token=token)
    base_tree = commit["tree"]["sha"]
    print(f"Base commit: {latest_sha[:8]}")
    
    # 2. Create blobs for each file
    tree_items = []
    for filepath, local_path in files_to_push.items():
        with open(local_path, 'rb') as f:
            content = f.read()
        
        # Check if binary
        try:
            content_str = content.decode('utf-8')
            is_binary = False
        except:
            is_binary = True
        
        if is_binary:
            b64 = base64.b64encode(content).decode()
            blob = gh_api("/git/blobs", method="POST", data={
                "content": b64,
                "encoding": "base64"
            }, token=token)
        else:
            blob = gh_api("/git/blobs", method="POST", data={
                "content": content_str,
                "encoding": "utf-8"
            }, token=token)
        
        tree_items.append({
            "path": filepath,
            "mode": "100644",
            "type": "blob",
            "sha": blob["sha"]
        })
        print(f"  Blob: {filepath} ({len(content)} bytes)")
    
    # 3. Create tree
    tree = gh_api("/git/trees", method="POST", data={
        "base_tree": base_tree,
        "tree": tree_items
    }, token=token)
    print(f"Tree: {tree['sha'][:8]}")
    
    # 4. Create commit
    new_commit = gh_api("/git/commits", method="POST", data={
        "message": "feat: Studio AI (Runway/Replicate/Grok) + Social Connectors + Transparent Logos + WebSocket Streaming",
        "tree": tree["sha"],
        "parents": [latest_sha],
        "author": {
            "name": "Cap",
            "email": "ryan@hacpglobal.ai"
        }
    }, token=token)
    print(f"Commit: {new_commit['sha'][:8]}")
    
    # 5. Update ref
    gh_api("/git/refs/heads/main", method="PATCH", data={
        "sha": new_commit["sha"]
    }, token=token)
    print(f"Pushed to main!")
    
    return new_commit["sha"]

if __name__ == "__main__":
    token = get_gh_token()
    if not token:
        print("ERROR: No GitHub token available.")
        print("Please connect GitHub or provide a PAT.")
        sys.exit(1)
    
    print(f"Token found (ending ...{token[-4:]})")
    
    # Files to push
    app_dir = "/home/user/workspace/saintsal-app"
    files = {
        "server.py": f"{app_dir}/server.py",
        "app.js": f"{app_dir}/app.js",
        "index.html": f"{app_dir}/index.html",
        "style.css": f"{app_dir}/style.css",
        "requirements.txt": f"{app_dir}/requirements.txt",
        "generate_image.py": f"{app_dir}/generate_image.py",
        "generate_video.py": f"{app_dir}/generate_video.py",
        "generate_audio.py": f"{app_dir}/generate_audio.py",
        "saintsal-icon.png": f"{app_dir}/saintsal-icon.png",
        "saintsal-labs-logo.png": f"{app_dir}/saintsal-labs-logo.png",
        "CORPNET_API_REFERENCE.md": f"{app_dir}/CORPNET_API_REFERENCE.md",
    }
    
    sha = push_files(token, files)
    print(f"\nDone! Commit: {sha}")
    print("Render auto-deploy should trigger now.")
