# Loop: test-coverage-ratchet — Handoff Notes

## Spec Summary
Weekly Saturday 1AM CT cron. Runs npm test --coverage. Compares against Setting baseline. If any metric decreased, writes a minimal smoke test to recover it. Updates baseline on improvement.

## Definition of Done (from SPEC.md)
- `src/app/api/agents/coverage-ratchet/route.ts` exists
- Reads package.json for test script (graceful no-op if not configured)
- Compares coverage to Setting["coverage.baseline"]
- Writes smoke tests for auth gates if coverage drops
- vercel.json has `0 7 * * 6` cron for `/api/agents/coverage-ratchet`
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Read package.json — check if test script and jest/vitest are configured.
