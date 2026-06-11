#!/usr/bin/env bash
# Loop 23 — Rate Drop SMS Blast
# Cron: 0 12 * * *
# Trigger manually: bash loops/active/23-rate-drop-sms-blast/loop.sh

set -euo pipefail

BASE_URL="${AIRE_BASE_URL:-http://localhost:3000}"
SECRET="${CRON_SECRET:-}"

echo "[loop:23] Triggering rate-drop-blast at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

curl -sf -X GET \
  -H "Authorization: Bearer ${SECRET}" \
  "${BASE_URL}/api/agents/rate-drop-blast" \
  | jq .
