# Loop: error-memory-autofix — Handoff Notes

## Spec Summary
Nightly 2AM CT cron. Queries ErrorLog for patterns with ≥3 unresolved instances. Skips if health score > 85. For top 3 patterns: reads source file, applies a targeted fix, runs typecheck+build, marks errors resolved on success or reverts on failure.

## Definition of Done (from SPEC.md)
- `src/app/api/agents/error-autofix/route.ts` exists with POST handler
- Uses detectPatterns() and getHealthScore() from src/lib/error-memory.ts
- Reads source file → applies fix → oracle → marks resolved or reverts
- Max 3 patterns per run
- Setting["autofix.skippedPatterns"] guard for repeatedly-failed patterns
- vercel.json has `0 7 * * *` cron for `/api/agents/error-autofix`
- `npx tsc --noEmit` and `npm run build` both pass

## Types from src/lib/error-memory.ts (Unit A)

- `detectPatterns()` → `Pattern[]` sorted by count desc; groups at ≥2 (route filters to ≥3)
  - fields: `type`, `source`, `count`, `firstSeen`, `lastSeen`, `message`, `errorIds[]`, `severity`
- `getHealthScore()` → `{ score: number, trend: "improving"|"stable"|"degrading", summary: string }`
- `Setting` model: `key` / `value` — use `getSetting` + `prisma.setting.upsert` + `invalidateSettingsCache`
- `AgentType` union in agent-run.ts does NOT include `error_autofix` — route uses prisma directly

## Iteration Log

### Iteration 0 — scaffolded, nothing started

### Iteration 1 — Units A + B + C complete
**Commit:** `72baa54`
- Read `error-memory.ts`: typed `detectPatterns()` and `getHealthScore()` return shapes
- Created `src/app/api/agents/error-autofix/route.ts`:
  - POST (cron-secret guarded) + GET (dev trigger)
  - Health-score gate: score > 85 → skip early
  - Loads `autofix.skippedPatterns` and `autofix.disabled` from Setting
  - Filters patterns to count ≥ 3, skips auth/infra errors (401, ECONNREFUSED, P2002)
  - Resolves source file via heuristic (src/ prefix, /api/ paths, src/lib/ fallback)
  - Applies null-guard fix (first unguarded `.prop` → `?.prop`) from error message
  - Oracle: `execSync("npx tsc --noEmit")` — pass → mark resolved + notify; fail → revert + add to skippedPatterns + notify
  - Writes `AgentRun` record directly via prisma (agentType: "error_autofix")
  - Updates `autofix.lastRun` Setting on every run
- Added cron to `vercel.json`: `0 7 * * *` (2AM CT)
- Oracle: `npx tsc --noEmit` ✅ + `npm run build` ✅

**Status:** COMPLETE — all spec units done, oracle passes.
