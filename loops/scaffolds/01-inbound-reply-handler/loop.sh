#!/usr/bin/env bash
set -euo pipefail
LOOP_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$LOOP_DIR/build.log"
cd /Users/caleb/aire-platform
echo "=== START $(basename "$LOOP_DIR") $(date) ===" | tee -a "$LOG"
claude -p "$(cat "$LOOP_DIR/PROMPT.md")" --max-turns 10 2>&1 | tee -a "$LOG"
EXIT=$?
echo "=== EXIT:$EXIT $(basename "$LOOP_DIR") $(date) ===" | tee -a "$LOG"
exit $EXIT
