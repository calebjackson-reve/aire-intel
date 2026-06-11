#!/usr/bin/env bash
# Loop 28 — Zillow Content Brief
# Cron: 0 9 * * 2,5
# Trigger manually: bash loops/active/28-zillow-content-brief/loop.sh

set -euo pipefail

BASE_URL="${AIRE_BASE_URL:-http://localhost:3000}"
SECRET="${CRON_SECRET:-}"

echo "[loop:28] Triggering zillow-content at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

curl -sf -X GET \
  -H "Authorization: Bearer ${SECRET}" \
  "${BASE_URL}/api/agents/zillow-content" \
  | jq .
