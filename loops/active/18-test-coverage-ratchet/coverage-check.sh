#!/usr/bin/env bash
# AIRE: loop:test-coverage-ratchet
# Run coverage locally, compare to baseline, update DB Setting for the HTTP route.
# Usage: bash loops/active/18-test-coverage-ratchet/coverage-check.sh
set -euo pipefail

BASELINE_FILE=".coverage-baseline.json"
COVERAGE_FILE="coverage/coverage-summary.json"

# Write a key/value pair to Setting table in the local SQLite dev DB.
# No-ops silently if the DB is unavailable (CI environments).
write_to_db() {
  local key="$1"
  local val="$2"
  DB_KEY="$key" DB_VALUE="$val" node -e "
const Database = require('better-sqlite3');
try {
  const db = new Database('./prisma/dev.db');
  db.prepare(
    'INSERT INTO \"Setting\" (id, key, value, updatedAt) VALUES (lower(hex(randomblob(16))), ?, ?, datetime(\"now\")) ' +
    'ON CONFLICT(key) DO UPDATE SET value=excluded.value, updatedAt=datetime(\"now\")'
  ).run(process.env.DB_KEY, process.env.DB_VALUE);
  db.close();
} catch (_) {}
" 2>/dev/null || true
}

echo "==> Running coverage..."
npm run test:coverage 2>/dev/null || true

if [[ ! -f "$COVERAGE_FILE" ]]; then
  echo "ERROR: $COVERAGE_FILE not found — no test files or reporter failed."
  exit 1
fi

# Extract four metrics as JSON using env-var-safe python3
CURRENT=$(COVERAGE_FILE="$COVERAGE_FILE" python3 -c "
import json, os
d = json.load(open(os.environ['COVERAGE_FILE']))['total']
print(json.dumps({k: d[k]['pct'] for k in ['lines','branches','functions','statements']}))
")
echo "==> Current:  $CURRENT"

# Bootstrap baseline on first run
if [[ ! -f "$BASELINE_FILE" ]]; then
  echo "==> No baseline found — initialising baseline to current."
  echo "$CURRENT" > "$BASELINE_FILE"
  write_to_db "coverage.latest"   "$CURRENT"
  write_to_db "coverage.baseline" "$CURRENT"
  echo "==> Baseline saved. Re-run after adding more tests to ratchet upward."
  exit 0
fi

echo "==> Baseline: $(cat "$BASELINE_FILE")"

# Detect which metrics dropped
VIOLATIONS=$(CURRENT="$CURRENT" BASELINE_FILE="$BASELINE_FILE" python3 -c "
import json, os
cur  = json.loads(os.environ['CURRENT'])
base = json.loads(open(os.environ['BASELINE_FILE']).read())
v    = [k for k in base if cur[k] < base[k]]
print(','.join(v))
")

# Always sync latest coverage to DB for the HTTP route
write_to_db "coverage.latest" "$CURRENT"

if [[ -n "$VIOLATIONS" ]]; then
  echo ""
  echo "!! RATCHET VIOLATION: coverage dropped in: $VIOLATIONS"
  echo "   Add tests for the affected files, then re-run this script."
  echo "   Baseline NOT updated."
  exit 1
fi

# All metrics held or improved — update both file and DB baseline
IMPROVED=$(CURRENT="$CURRENT" BASELINE_FILE="$BASELINE_FILE" python3 -c "
import json, os
cur  = json.loads(os.environ['CURRENT'])
base = json.loads(open(os.environ['BASELINE_FILE']).read())
imp  = [k for k in base if cur[k] > base[k]]
print(','.join(imp) if imp else 'none')
")

echo "==> Coverage held / improved (improved: $IMPROVED) — updating baseline."
echo "$CURRENT" > "$BASELINE_FILE"
write_to_db "coverage.baseline" "$CURRENT"
echo "==> Done."
