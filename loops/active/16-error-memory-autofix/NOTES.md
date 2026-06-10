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

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Read src/lib/error-memory.ts — understand detectPatterns() and getHealthScore() return types. Then create the route.
