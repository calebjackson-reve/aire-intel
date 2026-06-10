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

### Iteration 1 — COMPLETE
- Read `src/lib/meta-insights.ts`: `buildContentAudit()` returns `ContentAudit` with `byType[]` (sorted desc by `avgEngagementRate`), `topPosts[]`, `trends[]`. No `publishedAt` at type level, but `getPageInsights()` posts have it — called separately for day/hour analysis (cache hit).
- Created `src/app/api/agents/content-learning/route.ts`: POST (CRON_SECRET gated) + GET handler; calls `withRetry(() => buildContentAudit())`; day/time bucketing from `getPageInsights()`; upserts 5 Settings; creates Notification with 2-sentence insight; creates AgentRun record; 6-day idempotency guard; disable flag support.
- Added `{ "path": "/api/agents/content-learning", "schedule": "0 5 * * 0" }` to `vercel.json`.
- `npx tsc --noEmit` and `npm run build` both pass.

**Status: DONE — all DoD items met.**
