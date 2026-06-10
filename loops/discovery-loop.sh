#!/usr/bin/env bash
# loops/discovery-loop.sh — re-run the /find-loops discovery pass
# Usage: ./loops/discovery-loop.sh
# Outputs: loops/SIGNAL_INVENTORY.md, loops/proposed/NN-*.md, loops/REGISTRY.md

set -euo pipefail
cd "$(dirname "$0")/.."

PROMPT=$(cat <<'EOF'
You are running the /find-loops discovery pass on the AIRE platform at /Users/caleb/aire-platform.

## What to do

1. **Signal Inventory** — scan the codebase for all signal sources:
   - Prisma models (all fields, relations)
   - API routes (paths, methods, trigger conditions)
   - Cron jobs (vercel.json schedules)
   - Webhooks (inbound routes)
   - Integration clients (src/lib/*.ts)
   - Error surfaces (ErrorLog, AgentRun patterns)
   - Quality gates (build, typecheck, tests)

2. **Loop Discovery** — for every pair of (trigger signal, graded output), generate a loop candidate.
   Score each candidate using: Oracle×2 + Value×2 + Safety + Effort (max 30).
   Park anything < 16. Do NOT re-propose loops already in loops/REGISTRY.md with status != "archived".

3. **Write Outputs**:
   - Overwrite `loops/SIGNAL_INVENTORY.md` with the fresh inventory
   - Write NEW candidates only to `loops/proposed/NN-<slug>.md` (incrementing NN from the highest existing rank + 1)
   - Update `loops/REGISTRY.md`: add new rows, preserve existing rows

4. **Loop ROI Report** — for every loop in REGISTRY.md with status = "deployed" or "building":
   - Query the oracle metric for that loop (reply rate, error count, coverage %, etc.)
   - Report actual vs. target
   - Flag any loop where oracle is below threshold (consider pausing)

## Output Format
```
SIGNAL_INVENTORY: written | unchanged
NEW_LOOPS: <n>
PARKED: <n>
ROI_REPORT: <deployed loops and their current oracle metrics>
```

Follow loops/LOOP_TEMPLATE.md format exactly. All new specs have [ ] Approved (unchecked).
EOF
)

LOG="loops/discovery-run-$(date +%Y%m%d-%H%M).log"
echo "=== /find-loops discovery pass: $(date) ===" | tee "$LOG"
claude -p "$PROMPT" --max-turns 20 2>&1 | tee -a "$LOG"
echo "=== Done: $(date) ===" | tee -a "$LOG"
