# Loop: dotloop-sync-freshness — Handoff Notes

## Spec Summary
Add getLoopDetails() to dotloop.ts. Add a sync freshness check step inside the transaction-watchdog route that polls stale loops and alerts on staleness.

## Definition of Done (from SPEC.md)
- `getLoopDetails(loopId)` exported from `src/lib/dotloop.ts`
- transaction-watchdog route has sync freshness check after milestone logic
- Setting["dotloop.authStatus"] updated on auth errors
- Notification + SMS on closingDate within 48h and updatedAt > 12h
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Read src/lib/dotloop.ts. Add getLoopDetails() function.
