# Loop: Error Memory Auto-Fix

**Status:** [x] Approved  _(2026-06-09)_
**Type:** outer  
**Feeds (if outer):** All inner agents — detects recurring failures and files fixes  
**Rank:** 16  
**Score:** 24 / 30

---

## Trigger

Nightly cron at 2:00 AM CT (before all other agents) at `/api/agents/error-autofix`. Queries ErrorLog for patterns that have recurred ≥ 3 times in the last 24 hours and remain unresolved.

## Input

- `ErrorLog` — all records with `resolved = false`, grouped by `type::source`, where group count ≥ 3 in last 24h: `type`, `source`, `message`, `stack`, `context`, `attempts`, `createdAt`
- `detectPatterns()` from `src/lib/error-memory.ts` — already groups by type::source and flags severity
- Source file heuristic: parse `source` field to determine which route or lib file the error originates from
- `getHealthScore()` — current platform health score (skip autofix if score > 85, platform is healthy enough)

## Actions

1. Call `detectPatterns()` to get error groups with count ≥ 3 in last 24h
2. If `getHealthScore() > 85`: skip run, log "health score healthy, autofix skipped"
3. For each qualifying error pattern (max 3 per run — focus, don't scatter):
   a. Identify the source file from `error.source` field
   b. Read the source file and the last 5 instances of the error (message + stack + context)
   c. Classify the error type: API timeout | TypeScript type error | Null reference | Rate limit | Auth failure | Schema mismatch
   d. Generate a targeted fix (code change, retry configuration, null guard, etc.)
   e. Apply the fix to the source file (additive only — add guards, increase timeouts, add null checks)
   f. Run oracle gates: `npx tsc --noEmit && npm run build`
   g. If oracle passes: mark the 3 most recent `ErrorLog` entries for this pattern as `resolved = true`, `resolution = "autofix"`
   h. Write an `AgentRun` record: `agentType = "error_autofix"`, `itemsProcessed = errors fixed`
4. If any fix breaks the oracle: revert the file change (restore original), log the attempt as failed, skip to next pattern

## Oracle

**What external source of truth grades the output?**  
1. `npx tsc --noEmit` + `npm run build` — code must compile after fix  
2. Error recurrence: the same `type::source` pattern should produce zero new `ErrorLog` entries in the 24h following the fix

**Acceptance threshold:**  
TypeScript + build pass. Error recurrence drops to 0 in next 24h for fixed patterns.

**Rejection signal:**  
Fix breaks typecheck or build → revert immediately. If same error pattern recurs ≥ 3 times in 48h after a fix → escalate to human via Notification: "Autofix for [source] did not hold — manual review needed."

## Memory

- `ErrorLog.resolved` + `.resolution` — marks fixed errors; prevents duplicate fix attempts
- `AgentRun` — records each autofix run
- `Setting["autofix.lastRun"]` — dedup guard
- `Setting["autofix.skippedPatterns"]` — JSON array of `type::source` slugs that autofix has tried and failed ≥ 2 times (permanently skip these, flag for human)

## Surface

- `/system` page — shows autofix activity in error log
- Dashboard `Notification` on successful fix: "Autofix resolved [N] recurring errors in [source]"
- Dashboard `Notification` (warning) when fix reverted: "Autofix attempted [source] — could not fix, escalated"

---

## Safety Rails

- **Human chokepoint:** Autofix only modifies files that match the `source` field in ErrorLog (no speculative editing of unrelated files). Max 3 patterns per run. Oracle gate (typecheck + build) must pass before marking errors resolved.
- **Blast radius:** If fix breaks build, revert is immediate (read file → apply fix → run oracle → on fail, rewrite with original content). Health score threshold (> 85) prevents running when system is already healthy.
- **Rate limit / cap:** Max 3 patterns per nightly run. Max 1 fix attempt per `type::source` per 24h.
- **Idempotency:** Check `ErrorLog.resolved = false` AND group count ≥ 3 before acting. If `Setting["autofix.skippedPatterns"]` contains the pattern, skip entirely.
- **Exit condition:** Health score > 85 → skip. `Setting["autofix.disabled"] = "true"` → skip entirely.

---

## Implementation Notes

- Create `src/app/api/agents/error-autofix/route.ts`
- Add cron to `vercel.json`: `{ "path": "/api/agents/error-autofix", "schedule": "0 7 * * *" }` (2AM CT = 7AM UTC)
- `src/lib/error-memory.ts` — `detectPatterns()` and `getHealthScore()` already exist; use them directly
- File revert pattern: read original content → apply fix → run oracle via `execSync` → on non-zero exit, write original content back
- Classify errors by message patterns: "Cannot read properties of undefined" → null guard; "connect ECONNREFUSED" → retry config; "P2002" (Prisma unique) → idempotency fix
- This loop intentionally skips auth failures (401, expired tokens) — those require human credential rotation, not code fixes
