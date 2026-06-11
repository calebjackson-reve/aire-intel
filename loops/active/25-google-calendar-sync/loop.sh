#!/usr/bin/env bash
# Loop 25 — Google Calendar Sync
# Cron: 0 */2 * * *
# Trigger manually: bash loops/active/25-google-calendar-sync/loop.sh

set -euo pipefail

BASE_URL="${AIRE_BASE_URL:-http://localhost:3000}"
SECRET="${CRON_SECRET:-}"

echo "[loop:25] Triggering calendar-sync at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

curl -sf -X GET \
  -H "Authorization: Bearer ${SECRET}" \
  "${BASE_URL}/api/agents/calendar-sync" \
  | jq .
