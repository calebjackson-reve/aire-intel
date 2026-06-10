# Loop: content-performance-learning — Handoff Notes

## Spec Summary
Weekly Sunday 11PM cron. Pull 30-day Meta engagement data, group by content type, identify top/bottom performers, write learning metrics to Settings. Content scheduler reads these next day.

## Definition of Done (from SPEC.md)
- `src/app/api/agents/content-learning/route.ts` exists
- Calls buildContentAudit() from src/lib/meta-insights.ts
- Updates Setting["content.topType"], Setting["content.bestDayOfWeek"], Setting["content.bestTimeOfDay"]
- Creates Notification with 2-sentence insight
- vercel.json has `0 5 * * 0` cron for `/api/agents/content-learning`
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Read src/lib/meta-insights.ts to understand buildContentAudit() return type.
