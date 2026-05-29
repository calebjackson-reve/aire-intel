#!/usr/bin/env bash
# Integration smoke test for AIRE
# Probes each configured integration with a real (but harmless) API call.
# Reports which connections work end-to-end vs. which are just key-saved-but-not-functional.
#
# Usage:  ./scripts/test-integrations.sh
# Optional flags:
#   --send-sms <phone>   actually send a real test SMS to a number
#   --send-email <email> actually send a real test email
#
# Without flags, the script only probes "status" endpoints — no money spent on Twilio.

set -u
BASE="http://localhost:3000"
SEND_SMS_TO=""
SEND_EMAIL_TO=""

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --send-sms) SEND_SMS_TO="$2"; shift 2;;
    --send-email) SEND_EMAIL_TO="$2"; shift 2;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

PASS=0
FAIL=0
SKIP=0

green()  { printf "\033[32m%s\033[0m\n" "$1"; }
red()    { printf "\033[31m%s\033[0m\n" "$1"; }
yellow() { printf "\033[33m%s\033[0m\n" "$1"; }

check() {
  local name=$1
  local url=$2
  local jsonpath=$3   # python expression to extract a value from JSON
  local expected=$4   # value to compare

  RESP=$(curl -s "$url" 2>/dev/null)
  RESULT=$(echo "$RESP" | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  print($jsonpath)
except Exception as e:
  print('ERR:'+str(e))
" 2>/dev/null)

  if [[ "$RESULT" == "$expected" ]]; then
    green "  ✓ $name"
    PASS=$((PASS+1))
  else
    red "  ✗ $name — got: $RESULT"
    FAIL=$((FAIL+1))
  fi
}

echo "════════════════════════════════════════════════════════"
echo "  AIRE integration smoke test"
echo "  Base: $BASE"
echo "════════════════════════════════════════════════════════"

# 1. Anthropic AI
echo ""
echo "🤖 Anthropic AI"
check "Mission generation (creates 3 moves)" "$BASE/api/mission" 'len(d.get("moves",[]))' "3"

# 2. Lofty CRM
echo ""
echo "🏠 Lofty CRM"
check "OAuth + sample lead fetch" "$BASE/api/lofty/sync" 'd.get("ok")' "True"
TOTAL=$(curl -s "$BASE/api/lofty/sync" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total','?'))")
echo "  → Lofty has $TOTAL leads accessible"

# 3. Meta (Facebook + Instagram)
echo ""
echo "📱 Meta (FB + IG)"
check "Facebook page connected" "$BASE/api/social?action=status" 'd.get("facebook",{}).get("connected")' "True"
check "Instagram business connected" "$BASE/api/social?action=status" 'd.get("instagram",{}).get("connected")' "True"

# 4. Twilio
echo ""
echo "💬 Twilio SMS"
check "Twilio configured" "$BASE/api/sms" 'd.get("connected")' "True"
if [[ -n "$SEND_SMS_TO" ]]; then
  echo "  ⚡ Sending real test SMS to $SEND_SMS_TO …"
  RESP=$(curl -s -X POST "$BASE/api/sms" \
    -H "Content-Type: application/json" \
    -d "{\"to\":\"$SEND_SMS_TO\",\"message\":\"AIRE smoke test — if you got this, Twilio is live.\"}")
  OK=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok',False))")
  if [[ "$OK" == "True" ]]; then green "  ✓ Real SMS sent"; PASS=$((PASS+1)); else red "  ✗ Real SMS failed: $RESP"; FAIL=$((FAIL+1)); fi
fi

# 5. SendGrid
echo ""
echo "📧 SendGrid Email"
check "SendGrid configured" "$BASE/api/email" 'd.get("connected")' "True"
if [[ -n "$SEND_EMAIL_TO" ]]; then
  echo "  ⚡ Sending real test email to $SEND_EMAIL_TO …"
  RESP=$(curl -s -X POST "$BASE/api/email" \
    -H "Content-Type: application/json" \
    -d "{\"to\":\"$SEND_EMAIL_TO\",\"subject\":\"AIRE smoke test\",\"message\":\"If you got this, SendGrid is live.\"}")
  OK=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok',False))")
  if [[ "$OK" == "True" ]]; then green "  ✓ Real email sent"; PASS=$((PASS+1)); else red "  ✗ Real email failed: $RESP"; FAIL=$((FAIL+1)); fi
fi

# 6. Calendly
echo ""
echo "📅 Calendly"
RESP=$(curl -s "$BASE/api/calendly")
CONN=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('connected',False))")
if [[ "$CONN" == "True" ]]; then
  LINK=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('link','?'))")
  green "  ✓ Calendly link: $LINK"
  PASS=$((PASS+1))
else
  red "  ✗ Calendly not connected"
  FAIL=$((FAIL+1))
fi

# 7. Zapier
echo ""
echo "⚡ Zapier"
ZAPIER_SET=$(curl -s "$BASE/api/settings" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ZAPIER_WEBHOOK_URL',{}).get('set',False))")
if [[ "$ZAPIER_SET" == "True" ]]; then
  green "  ✓ Zapier webhook URL set"
  PASS=$((PASS+1))
else
  yellow "  · Zapier webhook URL not set (optional)"
  SKIP=$((SKIP+1))
fi

# 8. Paragon MLS
echo ""
echo "🏘️  Paragon MLS"
RESP=$(curl -s "$BASE/api/listings?limit=1")
SRC=$(echo "$RESP" | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  src = d.get('source', '?')
  count = len(d.get('listings', d if isinstance(d,list) else []))
  print(f'{src}/{count}')
except: print('parse error')")
if [[ "$SRC" == "demo/"* ]] || [[ "$SRC" == "?/"* ]]; then
  yellow "  · Paragon falling back to demo data ($SRC) — API key not yet configured"
  SKIP=$((SKIP+1))
else
  green "  ✓ Paragon returning live data: $SRC"
  PASS=$((PASS+1))
fi

# 9. Platform pages
echo ""
echo "⚙️  Platform"
for page in "/" "/contacts" "/follow-up" "/settings" "/pipeline"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$page")
  if [[ "$STATUS" == "200" ]]; then
    green "  ✓ $page 200"
    PASS=$((PASS+1))
  else
    red "  ✗ $page $STATUS"
    FAIL=$((FAIL+1))
  fi
done

# Summary
echo ""
echo "════════════════════════════════════════════════════════"
echo "  $PASS passed · $FAIL failed · $SKIP skipped"
echo "════════════════════════════════════════════════════════"

if [[ $FAIL -gt 0 ]]; then
  echo ""
  yellow "  Tip: open /settings to fill missing integrations, or"
  yellow "       run again with --send-sms <phone> / --send-email <email>"
  yellow "       to validate live sending after configuring."
  exit 1
fi
exit 0
