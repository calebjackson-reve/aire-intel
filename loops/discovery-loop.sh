#!/usr/bin/env bash
# discovery-loop.sh — runs /find-loops as a calculated loop until discovery
# is complete. Eating our own cooking: the loop-finder runs in a loop.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

MAX_ITERATIONS=5
FAIL_LIMIT=2
MAX_TURNS=50
FOCUS="${1:-}"   # optional: ./loops/discovery-loop.sh marketing
fails=0
mkdir -p loops/proposed

for i in $(seq 1 "$MAX_ITERATIONS"); do
  echo "=== discovery iteration $i/$MAX_ITERATIONS $(date -Is) ===" | tee -a loops/discovery.log
  BEFORE_COUNT=$(ls loops/proposed 2>/dev/null | wc -l)

  OUTPUT=$(claude -p "/find-loops $FOCUS" \
    --output-format json \
    --max-turns "$MAX_TURNS" \
    --allowedTools "Read,Write,Edit,Glob,Grep,Bash(git *),Bash(ls *)" \
    2>>loops/discovery.log)

  echo "$OUTPUT" >> loops/discovery.log

  if echo "$OUTPUT" | grep -q 'EXIT_SIGNAL: true' && \
     echo "$OUTPUT" | grep -q 'STATUS: COMPLETE'; then
    echo "Discovery complete after $i iteration(s)."
    echo "Review loops/REGISTRY.md, check the Approved box on the specs you"
    echo "want, then run: claude -p '/build-loop <slug>' (or /build-loop interactively)."
    exit 0
  fi

  # Progress heartbeat: new or updated spec files
  AFTER_COUNT=$(ls loops/proposed 2>/dev/null | wc -l)
  if [ "$AFTER_COUNT" -le "$BEFORE_COUNT" ] && ! git status --porcelain loops/ | grep -q .; then
    fails=$((fails+1))
    [ "$fails" -ge "$FAIL_LIMIT" ] && { echo "No discovery progress — halting."; exit 1; }
  else
    fails=0
  fi
done
echo "Iteration cap reached — check loops/DISCOVERY_NOTES.md for handoff state."
exit 2
