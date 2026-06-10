# Loop: sphere-reactivation — Handoff Notes

## Spec Summary
Monthly 1st 8AM cron. Finds sphere contacts with lastContactedAt > 60 days, prioritizes birthdays/anniversaries, generates 10 personalized check-in drafts.

## Definition of Done (from SPEC.md)
- `src/app/api/agents/sphere-reactivation/route.ts` exists
- Queries Lead by source="sphere" or tags contains "sphere", within staleness threshold
- Takes top 10, checks ContactLog + ActionQueue dedup
- Creates ActionQueue items (draft_message, priority 6, requiresApproval true)
- Setting["sphere.lastRunMonth"] guard prevents double-run
- vercel.json has `0 14 1 * *` cron for `/api/agents/sphere-reactivation`
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Read prisma/schema.prisma for Lead model — verify source, tags fields exist.
