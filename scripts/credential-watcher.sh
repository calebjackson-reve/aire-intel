#!/usr/bin/env bash
# Credential watcher — polls macOS clipboard and routes detected secrets to AIRE
# Settings by format. No chat round-trips needed. Just copy a credential and it
# lands in /api/settings within ~1.5s.
#
# Detected formats:
#   - Twilio Auth Token:   32 hex chars (no prefix)        → TWILIO_AUTH_TOKEN
#   - Twilio US Phone:     +1XXXXXXXXXX                     → TWILIO_PHONE_NUMBER
#   - SendGrid API Key:    SG.<22chars>.<43chars>           → SENDGRID_API_KEY
#   - Sender email:        any RFC-ish email                → SENDGRID_FROM_EMAIL (asks once)
#   - Calendly PAT:        eyJ...JWT (3 segments)           → CALENDLY_API_KEY
#   - Zapier Webhook URL:  https://hooks.zapier.com/...     → ZAPIER_WEBHOOK_URL
#   - Paragon API URL:     https://api.paragonapi.com/...   → PARAGON_API_URL
#   - Paragon API Key:     long opaque bearer (>= 40 chars, no spaces)  → PARAGON_API_KEY (ambiguous; uses heuristic)
#   - Account SID:         AC[hex]{32}                       → TWILIO_ACCOUNT_SID (skip — already saved)
#
# Stops automatically when all primary integrations are connected, or after a
# user-supplied number of minutes (default 10).

set -u
ENDPOINT="http://localhost:3000/api/settings"
MAX_MINUTES=${1:-10}
SEEN_HASH=""
START=$(date +%s)

post() {
  local key=$1
  local val=$2
  local masked
  if [[ ${#val} -gt 8 ]]; then masked="${val:0:4}…${val: -4}"; else masked="(short)"; fi
  echo "[$(date +%H:%M:%S)] Detected $key ($masked) — saving…"
  RESP=$(curl -s -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "{\"$key\": \"$val\"}")
  if echo "$RESP" | grep -q '"ok":true'; then
    echo "  ✓ saved"
  else
    echo "  ✗ failed: $RESP"
  fi
}

status_snapshot() {
  curl -s "$ENDPOINT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
keys = ['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_PHONE_NUMBER',
        'SENDGRID_API_KEY','SENDGRID_FROM_EMAIL','CALENDLY_API_KEY',
        'ZAPIER_WEBHOOK_URL','PARAGON_API_URL','PARAGON_API_KEY']
done = sum(1 for k in keys if d.get(k,{}).get('set'))
print(f'  Status: {done}/{len(keys)} keys saved')
for k in keys:
    mark = '✓' if d.get(k,{}).get('set') else '·'
    print(f'    {mark} {k}')
"
}

echo "════════════════════════════════════════════════════════"
echo "  AIRE credential watcher — polling clipboard"
echo "  Just copy credentials in any order; format detects them"
echo "  Will auto-stop after $MAX_MINUTES minutes or when all complete"
echo "════════════════════════════════════════════════════════"
status_snapshot
echo ""

while true; do
  ELAPSED=$(( $(date +%s) - START ))
  if [[ $ELAPSED -gt $(( MAX_MINUTES * 60 )) ]]; then
    echo ""
    echo "[$(date +%H:%M:%S)] Time's up after $MAX_MINUTES minutes."
    status_snapshot
    exit 0
  fi

  CLIP=$(pbpaste 2>/dev/null)
  CLIP_LEN=${#CLIP}

  # Skip if empty, identical to last, or obviously not a credential
  if [[ -z "$CLIP" || "$CLIP_LEN" -lt 10 ]]; then
    sleep 1.5
    continue
  fi
  HASH=$(echo -n "$CLIP" | shasum -a 256 | awk '{print $1}')
  if [[ "$HASH" == "$SEEN_HASH" ]]; then
    sleep 1.5
    continue
  fi
  SEEN_HASH=$HASH

  # Trim whitespace
  CLIP=$(echo -n "$CLIP" | tr -d '[:space:]')

  # Classify by format
  if [[ "$CLIP" =~ ^AC[a-f0-9]{32}$ ]]; then
    : # Already saved Account SID; skip silently
  elif [[ "$CLIP" =~ ^[a-f0-9]{32}$ ]]; then
    post "TWILIO_AUTH_TOKEN" "$CLIP"
  elif [[ "$CLIP" =~ ^\+1[0-9]{10}$ ]]; then
    post "TWILIO_PHONE_NUMBER" "$CLIP"
  elif [[ "$CLIP" =~ ^SG\.[A-Za-z0-9_-]{20,30}\.[A-Za-z0-9_-]{40,60}$ ]]; then
    post "SENDGRID_API_KEY" "$CLIP"
  elif [[ "$CLIP" =~ ^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]]; then
    post "CALENDLY_API_KEY" "$CLIP"
  elif [[ "$CLIP" =~ ^https://hooks\.zapier\.com/hooks/catch/ ]]; then
    post "ZAPIER_WEBHOOK_URL" "$CLIP"
  elif [[ "$CLIP" =~ ^https://api\.paragonapi\.com/ ]] || [[ "$CLIP" =~ ^https://[^/]+\.paragonapi\.com/ ]]; then
    post "PARAGON_API_URL" "$CLIP"
  elif [[ "$CLIP" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
    # Email — assume it's the SendGrid sender email if SendGrid key already set
    SG_SET=$(curl -s "$ENDPOINT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('SENDGRID_API_KEY',{}).get('set', False))")
    if [[ "$SG_SET" == "True" ]]; then
      post "SENDGRID_FROM_EMAIL" "$CLIP"
    fi
  fi

  # Check if everything done
  ALL_DONE=$(curl -s "$ENDPOINT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
keys = ['TWILIO_AUTH_TOKEN','TWILIO_PHONE_NUMBER','SENDGRID_API_KEY','SENDGRID_FROM_EMAIL','CALENDLY_API_KEY','ZAPIER_WEBHOOK_URL']
print('true' if all(d.get(k,{}).get('set') for k in keys) else 'false')
")
  if [[ "$ALL_DONE" == "true" ]]; then
    echo ""
    echo "[$(date +%H:%M:%S)] All integration credentials captured ✓"
    status_snapshot
    exit 0
  fi

  sleep 1.5
done
