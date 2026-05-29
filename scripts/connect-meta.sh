#!/bin/bash
# connect-meta.sh — Auto-wire Meta credentials into AIRE.
#
# Usage: ./scripts/connect-meta.sh <PAGE_ACCESS_TOKEN> [APP_ID] [APP_SECRET]
#
# Takes a Meta Page Access Token (the long EAAB... one from Graph API Explorer),
# auto-discovers your Page ID + IG Business ID via Meta Graph API,
# saves all credentials to AIRE Settings, and tests the connection.

set -e

TOKEN="$1"
APP_ID="${2:-2832753237062383}"   # defaults to Caleb's known App ID
APP_SECRET="$3"
AIRE_URL="http://localhost:3000"
GRAPH_BASE="https://graph.facebook.com/v19.0"

# ─── Validate input ─────────────────────────────────────────────────────────
if [ -z "$TOKEN" ]; then
  echo "❌ Missing Page Access Token argument."
  echo ""
  echo "Usage:"
  echo "  bash connect-meta.sh 'EAABxxx...your_token_here'"
  echo ""
  echo "  Or with App Secret too:"
  echo "  bash connect-meta.sh 'EAABxxx...' '2832753237062383' 'your_app_secret'"
  exit 1
fi

if [[ "$TOKEN" != EAA* ]]; then
  echo "⚠️  Warning: token doesn't start with 'EAA' — Meta tokens normally do."
  echo "   If this fails, regenerate the token in Graph API Explorer and try again."
  echo ""
fi

echo "🔌 Connecting to Meta…"

# ─── Step 1: Verify token works + discover Page ID ──────────────────────────
echo ""
echo "[1/5] Verifying token + finding your Pages…"

PAGES_JSON=$(curl -sS "${GRAPH_BASE}/me/accounts?access_token=${TOKEN}")

if echo "$PAGES_JSON" | grep -q '"error"'; then
  ERR_MSG=$(echo "$PAGES_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['error']['message'])")
  echo "❌ Meta rejected the token: $ERR_MSG"
  echo ""
  echo "Fix: Go to https://developers.facebook.com/tools/explorer"
  echo "     → Get Page Access Token → select your Page → copy the EAAB... value"
  echo "     → Then re-run this script."
  exit 1
fi

PAGE_COUNT=$(echo "$PAGES_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))")
if [ "$PAGE_COUNT" -eq 0 ]; then
  echo "❌ This token has no Pages attached. Did you switch the dropdown to 'Page Token' in Graph API Explorer?"
  echo ""
  echo "Currently you have a User Token. You need a Page Token."
  exit 1
fi

PAGE_ID=$(echo "$PAGES_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin)['data'][0]; print(d['id'])")
PAGE_NAME=$(echo "$PAGES_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin)['data'][0]; print(d['name'])")

echo "   ✓ Token works · Found Page: $PAGE_NAME ($PAGE_ID)"

# If multiple pages, list them
if [ "$PAGE_COUNT" -gt 1 ]; then
  echo "   ⚠️  Multiple pages on this token. Using the first one. Other pages:"
  echo "$PAGES_JSON" | python3 -c "
import sys,json
for p in json.load(sys.stdin)['data'][1:]:
    print(f'      - {p[\"name\"]} ({p[\"id\"]})')
"
fi

# ─── Step 2: Get the Page-scoped Access Token (preferred over User Token) ───
echo ""
echo "[2/5] Extracting Page-scoped token…"
PAGE_TOKEN=$(echo "$PAGES_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin)['data'][0]; print(d.get('access_token','NONE'))")

if [ "$PAGE_TOKEN" = "NONE" ] || [ -z "$PAGE_TOKEN" ]; then
  echo "   ⚠️  No page-scoped token in response. Falling back to the input token (may still work)."
  PAGE_TOKEN="$TOKEN"
else
  echo "   ✓ Got Page-scoped token (more permissions than User Token)"
fi

# ─── Step 3: Discover IG Business Account ID ────────────────────────────────
echo ""
echo "[3/5] Finding your Instagram Business Account…"

IG_JSON=$(curl -sS "${GRAPH_BASE}/${PAGE_ID}?fields=instagram_business_account&access_token=${PAGE_TOKEN}")
IG_ID=$(echo "$IG_JSON" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ig = d.get('instagram_business_account')
print(ig['id'] if ig else 'NONE')
")

if [ "$IG_ID" = "NONE" ]; then
  echo "   ⚠️  No Instagram Business Account linked to this Page."
  echo "      → IG insights won't work. FB Page features still will."
  echo "      → To fix: link your IG Business account to your FB Page in Meta Business Suite."
  IG_ID=""
else
  echo "   ✓ Found IG Business Account: $IG_ID"
fi

# ─── Step 4: Save everything to AIRE ────────────────────────────────────────
echo ""
echo "[4/5] Saving credentials to AIRE…"

save_setting() {
  local key="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo "   ⊘ Skipping $key (no value)"
    return
  fi
  curl -sS -X POST "${AIRE_URL}/api/settings" \
    -H "Content-Type: application/json" \
    -d "{\"key\":\"$key\",\"value\":\"$value\"}" > /dev/null
  echo "   ✓ Saved $key"
}

save_setting "META_APP_ID" "$APP_ID"
save_setting "META_APP_SECRET" "$APP_SECRET"
save_setting "META_PAGE_ACCESS_TOKEN" "$PAGE_TOKEN"
save_setting "META_PAGE_ID" "$PAGE_ID"
save_setting "META_IG_BUSINESS_ID" "$IG_ID"

# ─── Step 5: Test the live connection ───────────────────────────────────────
echo ""
echo "[5/5] Testing AIRE → Meta connection…"
sleep 1

RESULT=$(curl -sS "${AIRE_URL}/api/social/insights?refresh=1")
CONNECTED=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('connected', False))")

if [ "$CONNECTED" = "True" ]; then
  POST_COUNT=$(echo "$RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('posts', [])))")
  HAS_DEMO=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('demographics') is not None)")
  echo ""
  echo "✅ CONNECTED."
  echo "   - $POST_COUNT posts pulled from Meta"
  echo "   - Demographics: $HAS_DEMO"
  echo ""
  echo "Refresh http://localhost:3000 → the Content Performance panel will populate."
else
  echo ""
  echo "⚠️  AIRE says connected:false despite credentials saving."
  echo "    Check /api/errors for the Meta error details, or rerun this script."
  echo ""
  echo "    Saved credentials snapshot:"
  curl -sS "${AIRE_URL}/api/settings" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for k in ['META_APP_ID','META_APP_SECRET','META_PAGE_ACCESS_TOKEN','META_PAGE_ID','META_IG_BUSINESS_ID']:
    v = d.get(k, {})
    status = '✓' if v.get('set') else '✗'
    print(f'      {status} {k}: {v.get(\"preview\",\"—\")}')
"
fi
