#!/usr/bin/env bash
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

SLUG="22-monthly-meta-discovery"
DIR="loops/active/$SLUG"
MAX_ITERATIONS=10
FAIL_LIMIT=3
MAX_TURNS=20
fails=0

for i in $(seq 1 "$MAX_ITERATIONS"); do
  echo "=== $SLUG iteration $i/$MAX_ITERATIONS $(date -Is) ===" | tee -a "$DIR/loop.log"
  BEFORE=$(git rev-parse HEAD)

  OUTPUT=$(claude -p "$(cat "$DIR/PROMPT.md")" \
    --output-format json \
    --max-turns "$MAX_TURNS" \
    --allowedTools "Read,Edit,Write,Glob,Grep,Bash(npm *),Bash(npx *),Bash(git *),Bash(ls *),Bash(cat *),Bash(grep *),Bash(find *)" \
    2>>"$DIR/loop.log")

  echo "$OUTPUT" >> "$DIR/loop.log"

  if echo "$OUTPUT" | grep -q 'EXIT_SIGNAL: true'; then
    if echo "$OUTPUT" | grep -q 'STATUS: COMPLETE'; then
      echo "Loop $SLUG complete after $i iterations."; exit 0
    fi
  fi

  AFTER=$(git rev-parse HEAD)
  if [ "$AFTER" = "$BEFORE" ]; then
    fails=$((fails+1))
    echo "No commit in iteration $i (fails=$fails/$FAIL_LIMIT)" | tee -a "$DIR/loop.log"
    if [ "$fails" -ge "$FAIL_LIMIT" ]; then
      echo "No progress in $FAIL_LIMIT consecutive iterations — halting $SLUG."; exit 1
    fi
  else
    fails=0
  fi
done
echo "Iteration cap reached without EXIT_SIGNAL — review $DIR/NOTES.md."; exit 2
