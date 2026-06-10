# Loop: goal-pacing-alert — Handoff Notes

## Spec Summary
Weekly Monday 7AM cron. Compares lead count, closings, and outbound contacts against target Settings. Sends pacing notification with green/yellow/red status.

## Definition of Done (from SPEC.md)
- `src/app/api/agents/goal-pacing/route.ts` exists with POST handler
- Reads Setting["goal.leadsPerWeek"] and Setting["goal.closingsPerMonth"] (skips gracefully if not set)
- Calculates pacing % for leads + contacts dimensions
- Creates Notification with pacing status
- vercel.json has `0 13 * * 1` cron for `/api/agents/goal-pacing`
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Create src/app/api/agents/goal-pacing/route.ts. First verify ContactLog has direction field via schema read.
