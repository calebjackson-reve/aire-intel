# Loop: Test Coverage Ratchet

**Status:** [x] Approved  _(2026-06-09)_
**Type:** outer  
**Feeds (if outer):** All agents — ensures code quality doesn't regress as loops are added  
**Rank:** 18  
**Score:** 22 / 30

---

## Trigger

Weekly cron every Saturday at 1:00 AM CT. Also triggers after any `AgentRun` with `agentType` containing "autofix" or "debt" completes (those agents write code — verify coverage didn't drop).

## Input

- `npm test -- --coverage --passWithNoTests 2>&1` — current coverage report (lines/branches/functions/statements %)
- `Setting["coverage.baseline"]` — last recorded coverage percentage (JSON: `{ lines, branches, functions, statements }`)
- `Setting["coverage.lastRun"]` — date of last run
- List of files modified by recent agent runs (from `AgentRun.errorLog` field or git diff)

## Actions

1. Run `npm test -- --coverage --passWithNoTests --coverageReporters=json-summary` and parse `coverage-summary.json`
2. Compare each metric (lines, branches, functions, statements) against `Setting["coverage.baseline"]`
3. **If any metric decreased:** This is a ratchet violation.
   - Identify the file(s) with the lowest coverage that were recently modified (cross-reference with AgentRun history)
   - Write a test for the uncovered code path (the simplest integration test that exercises the route or function)
   - Re-run coverage to verify the metric recovered
   - Oracle: both build AND coverage metric ≥ baseline
4. **If all metrics equal or improved:** Update `Setting["coverage.baseline"]` with new values. Create `Notification` (info): "Coverage ratchet: [lines]% lines, [branches]% branches — baseline updated"
5. **If no tests exist yet** (`npm test` exits 0 but no test files): Write one smoke test for the most critical agent route (e.g., `src/app/api/agents/morning-brief/route.ts`) and set initial baseline.

## Oracle

**What external source of truth grades the output?**  
`npm test -- --coverage` exit code (0 = all tests pass) AND coverage percentages ≥ baseline for all four metrics (lines, branches, functions, statements).

**Acceptance threshold:**  
All tests pass. No coverage metric decreases below the established baseline.

**Rejection signal:**  
Coverage metric < baseline after adding tests → flag for human: "Coverage ratchet could not recover [metric] in [file] — manual test needed."

## Memory

- `Setting["coverage.baseline"]` — JSON object with four coverage metric values; updated only when coverage improves or holds
- `Setting["coverage.lastRun"]` — dedup guard
- `Setting["coverage.history"]` — JSON array of last 8 weekly snapshots (for trend display on /system page)

## Surface

- `/system` page — coverage trend chart (8 weeks of history)
- Dashboard `Notification` (info) when baseline updates successfully
- Dashboard `Notification` (warning) when ratchet violation detected and not fully recovered

---

## Safety Rails

- **Human chokepoint:** Tests written by this agent are minimal smoke tests (HTTP 200 responses, basic model creation). They do not test business logic in ways that could mask real failures. All written tests must pass the oracle before baseline updates.
- **Blast radius:** Writes test files only. Never modifies application code or schema. If `npm test` was previously not configured, does not overwrite package.json test scripts.
- **Rate limit / cap:** Once per week. Never writes more than 3 new test files per run.
- **Idempotency:** `Setting["coverage.lastRun"]` within-6-days guard.
- **Exit condition:** `Setting["coverage.disabled"] = "true"` to pause. If test runner is not configured (no jest/vitest in package.json), log info and skip.

---

## Implementation Notes

- Create `src/app/api/agents/coverage-ratchet/route.ts`
- Add cron to `vercel.json`: `{ "path": "/api/agents/coverage-ratchet", "schedule": "0 7 * * 6" }` (1AM CT Saturday = 7AM UTC)
- Check `package.json` for test script before running — `npm test` may not be configured yet
- If jest or vitest: look for existing test setup in `src/__tests__/` or `src/**/*.test.ts`
- Coverage report output: `coverage/coverage-summary.json` after `--coverageReporters=json-summary`
- Tests should target the new agent routes created by loops 01–22, using `fetch()` against `http://localhost:3000` or direct function import
- This loop must handle the case where there are 0 test files gracefully (`--passWithNoTests` flag)
