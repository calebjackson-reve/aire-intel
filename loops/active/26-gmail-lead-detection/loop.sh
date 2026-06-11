#!/usr/bin/env bash
# Loop 26 — Gmail Lead Detection
# Cron: */30 * * * *
# Trigger manually: bash loops/active/26-gmail-lead-detection/loop.sh

set -euo pipefail

BASE_URL="${AIRE_BASE_URL:-http://localhost:3000}"
SECRET="${CRON_SECRET:-}"

echo "[loop:26] Triggering gmail-lead-detect at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

curl -sf -X GET \
  -H "Authorization: Bearer ${SECRET}" \
  "${BASE_URL}/api/agents/gmail-lead-detect" \
  | jq .
