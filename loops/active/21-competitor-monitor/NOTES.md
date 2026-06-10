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
