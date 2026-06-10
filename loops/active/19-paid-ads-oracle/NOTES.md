# Loop: paid-ads-oracle — Handoff Notes

## Spec Summary
Weekly Monday 8AM CT cron. Pulls Meta Ads campaign performance for last 7 days. Classifies campaigns as kill/scale/variant/hold based on CPL and CTR thresholds. Creates ActionQueue tasks for kill/scale campaigns.

## Definition of Done (from SPEC.md)
- `src/app/api/agents/ads-oracle/route.ts` exists
- Calls Meta Ads API (Graph API campaigns endpoint) with withRetry()
- Calculates CTR and CPL per campaign
- Creates ActionQueue items for kill/scale recommendations
- Updates Setting["ads.lastWeekMetrics"] with current week data
- vercel.json has `0 14 * * 1` cron for `/api/agents/ads-oracle`
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Create src/app/api/agents/ads-oracle/route.ts. Start with auth check + Meta Graph API campaign fetch.
