# Loop: competitor-monitor — Handoff Notes

## Spec Summary
Weekly Friday 7AM CT cron. Fetches Paragon listings + status changes in tracked ZIPs for last 7 days. Identifies high-volume agents, fast-moving listings, price reductions. Writes a weekly digest to DailyBrief.

## Definition of Done (from SPEC.md)
- `src/app/api/agents/competitor-monitor/route.ts` exists
- Reads Setting["competitor.trackedZips"] (defaults to BR corridors)
- Generates digest string and writes to DailyBrief.marketMovement
- Setting["competitor.lastDigest"] within-6-days guard
- vercel.json has `0 13 * * 5` cron for `/api/agents/competitor-monitor`
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Read src/lib/paragon.ts — understand fetchListings() signature and return type.

### Iteration 1 — Units A + B + C complete
**Done:**
- Unit A: paragon.ts extended — `ListingFilter` gains `zip` (PostalCode OData filter) and `changedSince` (ModificationTimestamp ge DateTimeOffset); `ParagonListing` gains `listingAgent` (RESO `ListAgentFullName`) and `originalListPrice` (RESO `OriginalListPrice`)
- Unit B: `src/app/api/agents/competitor-monitor/route.ts` created — fetches per-ZIP listings modified in last 7 days (status: "" for all statuses), dedupes, identifies fast movers (DOM ≤ 3 + Pending/Closed), price reductions > 5%, top 3 agents by count; composes digest string; upserts DailyBrief.marketMovement; creates Notification; 6-day idempotency guard; logs errors to ErrorLog
- Unit C: vercel.json cron `0 13 * * 5` added for `/api/agents/competitor-monitor`
- `npx tsc --noEmit` + `npm run build` both pass
- Commit: b41f871

**Status:** DONE — all Definition of Done criteria met.
