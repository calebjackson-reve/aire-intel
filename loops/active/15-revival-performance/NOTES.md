# Loop: revival-performance — Handoff Notes

## Spec Summary
Bi-weekly Monday 7:30AM cron. Analyzes RevivalCohort records + ContactLog inbound replies. Calculates reply rate, stage advancement, writes performance metrics to Settings. Alerts if reply rate < 8%.

## Definition of Done (from SPEC.md)
- `src/app/api/agents/revival-tracker/route.ts` exists
- Pulls RevivalCohort last 30 days, correlates with ContactLog inbound
- Calculates replyRate and stageAdvancement
- Updates Setting["revival.lastReplyRate"], Setting["revival.bestMessagePattern"]
- SMS alert if replyRate < 8%
- vercel.json has `30 13 * * 1` cron for `/api/agents/revival-tracker`
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Read prisma/schema.prisma for RevivalCohort model — verify repliedAt, converted, stage fields.
