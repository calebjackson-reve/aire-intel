# Loop: dotloop-sync-freshness — Handoff Notes

## Spec Summary
Add getLoopDetails() to dotloop.ts. Add a sync freshness check step inside the transaction-watchdog route that polls stale loops and alerts on staleness.

## Definition of Done (from SPEC.md)
- [x] `getLoopDetails(loopId)` exported from `src/lib/dotloop.ts`
- [x] transaction-watchdog route has sync freshness check after milestone logic
- [x] Setting["dotloop.authStatus"] updated on auth errors
- [x] Notification + SMS on closingDate within 48h and updatedAt > 12h
- [x] `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Read src/lib/dotloop.ts. Add getLoopDetails() function.

### Iteration 1 — all units complete
**Commit:** `9b27a16` loops(dotloop-sync-freshness): Units A+B+C — complete

**Unit A:** Added `DotloopLoopDetail` interface (extends `DotloopLoop` with `milestones` + `lastActivityDate`) and `getLoopDetails(loopId)` to `src/lib/dotloop.ts`. Wraps existing `fetchLoopDetails(config, loopId)` in `withRetry`. On 401 upserts `Setting["dotloop.authStatus"] = "expired"` before re-throwing. Returns null if no config.

**Unit B:** Added section 3 (sync freshness pass) to `src/app/api/agents/transaction-watchdog/route.ts`. Queries `DotloopLoop` where status not CLOSED/SOLD/LEASED, `lastSyncedAt < 12h ago`, and closing within 48h. For each: calls `getLoopDetails`, creates `warning` Notification. If closing within 24h: sends SMS to `CALEB_PHONE` via Twilio.

**Unit C:** Auth status guard checks `Setting["dotloop.authStatus"]` before the pass. If `"expired"`, creates a single warning Notification pointing to /settings and skips all API calls. Entire pass wrapped in try/catch so it never crashes the watchdog.

**Oracle:** `npx tsc --noEmit` → clean. `npm run build` → clean (117 lines added across 2 files).

## Status: COMPLETE
All three units shipped. No schema changes needed — `DotloopLoop.lastSyncedAt` already exists.
