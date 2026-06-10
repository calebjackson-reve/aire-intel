#!/usr/bin/env bash
# loops/build-all.sh — execute all 22 loop scaffolds in priority order
# Logs per-loop outcome to loops/build-all.log, continues past failures
# Usage: ./loops/build-all.sh
# Compatible with bash 3.x (macOS default)

set -uo pipefail
cd "$(dirname "$0")/.."

LOGFILE="loops/build-all.log"
SUMMARY="loops/build-all-summary.md"
START_TIME=$(date +%s)
STATUS_FILE="/tmp/aire-build-status-$$.txt"

log() { echo "$*" | tee -a "$LOGFILE"; }
separator() { log "──────────────────────────────────────────────────"; }

: > "$LOGFILE"
: > "$STATUS_FILE"
log "=== AIRE Loop Build-All: $(date) ==="
separator

# Execution order (user-specified priority)
LOOPS=(
  "01-inbound-reply-handler"
  "03-calendly-post-meeting-followup"
  "02-listing-alert-buyer-match"
  "16-error-memory-autofix"
  "18-test-coverage-ratchet"
  "10-sphere-reactivation"
  "14-propstream-intent-revival"
  "04-meta-token-refresh-alert"
  "05-agent-health-monitor"
  "08-dotloop-sync-freshness"
  "13-lofty-sync-health"
  "17-audit-debt-burndown"
  "19-paid-ads-oracle"
  "20-listing-content-production"
  "21-competitor-monitor"
  "06-goal-pacing-alert"
  "09-content-performance-learning"
  "15-revival-performance"
  "22-monthly-meta-discovery"
  "07-render-job-completion"
  "12-phase-b-graduation"
  "11-smart-plan-enrollment-decay"
)

for SLUG in "${LOOPS[@]}"; do
  SCAFFOLD="loops/active/$SLUG"

  if [[ ! -d "$SCAFFOLD" ]]; then
    log "SKIP  $SLUG (active dir missing)"
    echo "$SLUG SKIP —" >> "$STATUS_FILE"
    continue
  fi
  if [[ ! -f "$SCAFFOLD/PROMPT.md" ]]; then
    log "SKIP  $SLUG (PROMPT.md missing)"
    echo "$SLUG SKIP —" >> "$STATUS_FILE"
    continue
  fi

  separator
  log "START $SLUG"
  LOOP_START=$(date +%s)

  set +e
  bash "$SCAFFOLD/loop.sh" >> "$LOGFILE" 2>&1
  EXIT_CODE=$?
  set -e

  LOOP_END=$(date +%s)
  DURATION=$((LOOP_END - LOOP_START))

  if [[ $EXIT_CODE -eq 0 ]]; then
    log "DONE  $SLUG (${DURATION}s) OK"
    echo "$SLUG OK ${DURATION}s" >> "$STATUS_FILE"
  else
    log "FAIL  $SLUG (${DURATION}s) exit=$EXIT_CODE"
    echo "$SLUG FAIL ${DURATION}s" >> "$STATUS_FILE"
  fi
done

separator
TOTAL_TIME=$(( $(date +%s) - START_TIME ))
log "=== Build-All Complete: ${TOTAL_TIME}s ==="
separator

# Write summary table
{
  echo "# Loop Build-All Summary"
  echo ""
  echo "_Run: $(date)  |  Total: ${TOTAL_TIME}s_"
  echo ""
  echo "| # | Loop | Status | Duration |"
  echo "|---|------|--------|----------|"
  RANK=1
  while IFS=' ' read -r SLUG STATUS DURATION; do
    case "$STATUS" in
      OK)   ICON="✓" ;;
      FAIL) ICON="✗" ;;
      *)    ICON="—" ;;
    esac
    echo "| $RANK | $SLUG | $STATUS $ICON | $DURATION |"
    RANK=$((RANK + 1))
  done < "$STATUS_FILE"
  echo ""
  echo "## Cron Entries Added"
  echo "Check \`vercel.json\` for all cron paths added by loops."
  echo ""
  echo "## Oracle Status"
  echo "Check \`loops/active/<slug>/loop.log\` for per-loop typecheck/build output."
} > "$SUMMARY"

cat "$SUMMARY" | tee -a "$LOGFILE"
log ""
log "Full log:  $LOGFILE"
log "Summary:   $SUMMARY"
rm -f "$STATUS_FILE"
