#!/bin/bash
# Super TV — Cloudflare Pages deploy script
# Usage: bash cloudflare-deploy.sh
set -e
echo "Building Super TV..."
pnpm install --frozen-lockfile
pnpm --filter @workspace/super-tv... run build
echo "Deploying to Cloudflare Pages..."
python3 << 'PYEOF'
import os, hashlib, json, urllib.request, base64
from pathlib import Path

ACCOUNT_ID = "af492abf267a37057a76131586ec4ddf"
PROJECT = "super-tv"
API_KEY = os.environ.get("CLOUDFLARE_GLOBAL_KEY") or os.environ.get("CLOUDFLARE_API_TOKEN")
EMAIL = os.environ.get("CLOUDFLARE_EMAIL", "")
DIST = Path("artifacts/super-tv/dist/public")

files = {}
for p in DIST.rglob("*"):
    if p.is_file() and not p.name.endswith(".map"):
        rel = str(p.relative_to(DIST))
        content = p.read_bytes()
        sha = hashlib.sha256(content).hexdigest()
        files[rel] = (sha, content)

print(f"Uploading {len(files)} files...")
boundary = "----CFPagesBoundary"
body_parts = []
manifest = {f"/{k}": v[0] for k, v in files.items()}
body_parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"manifest\"\r\n\r\n".encode() + json.dumps(manifest).encode())
for rel, (sha, content) in files.items():
    body_parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"/{rel}\"; filename=\"/{rel}\"\r\n\r\n".encode() + content)
body = b"\r\n".join(body_parts) + f"\r\n--{boundary}--\r\n".encode()

url = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/pages/projects/{PROJECT}/deployments"
req = urllib.request.Request(url, data=body, method="POST")
if EMAIL:
    req.add_header("X-Auth-Key", API_KEY)
    req.add_header("X-Auth-Email", EMAIL)
else:
    req.add_header("Authorization", f"Bearer {API_KEY}")
req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")

with urllib.request.urlopen(req, timeout=120) as resp:
    result = json.loads(resp.read())
    if result.get("success"):
        print(f"Deployed: {result['result']['url']}")
    else:
        print(f"Error: {result.get('errors')}")
PYEOF
