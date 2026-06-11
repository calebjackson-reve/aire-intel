#!/usr/bin/env bash
# Loop 29 — Messenger Inbox Monitor
# Cron: 0 */2 * * *
# Trigger manually: bash loops/active/29-messenger-inbox-monitor/loop.sh

set -euo pipefail

BASE_URL="${AIRE_BASE_URL:-http://localhost:3000}"
SECRET="${CRON_SECRET:-}"

echo "[loop:29] Triggering messenger-monitor at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

curl -sf -X GET \
  -H "Authorization: Bearer ${SECRET}" \
  "${BASE_URL}/api/agents/messenger-monitor" \
  | jq .
