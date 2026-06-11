#!/usr/bin/env bash
# Loop 27 — Rentcast Market Weekly
# Cron: 0 10 * * 1
# Trigger manually: bash loops/active/27-rentcast-market-weekly/loop.sh

set -euo pipefail

BASE_URL="${AIRE_BASE_URL:-http://localhost:3000}"
SECRET="${CRON_SECRET:-}"

echo "[loop:27] Triggering market-weekly at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

curl -sf -X GET \
  -H "Authorization: Bearer ${SECRET}" \
  "${BASE_URL}/api/agents/market-weekly" \
  | jq .
