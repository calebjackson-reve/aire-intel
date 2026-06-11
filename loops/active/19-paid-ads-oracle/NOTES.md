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

### Iteration 1 — Unit B + Unit C complete ✅
**Done:**
- Created `src/app/api/agents/ads-oracle/route.ts` — full implementation
- POST/GET handlers with `verifyCronSecret` auth
- Fetches `act_{AD_ACCOUNT_ID}/campaigns?fields=id,name,status,insights.date_preset(last_7d){spend,impressions,clicks,actions}` via `withRetry()`
- Classifies per SPEC thresholds: kill (CPL>$25 AND CTR<1.5% AND leads<2), scale (CTR>3.5% AND CPL<$25 AND leads≥3), variant (CPL within 20% of threshold), hold
- Creates `ActionQueue` tasks for kill/scale with dedup against existing pending tasks
- Caps at 5 recommendations per run
- Idempotency via `ads.lastWeekMetrics.weekOf` guard
- Updates `Setting["ads.lastWeekMetrics"]` with full campaign snapshot
- Creates `Notification` summary
- Creates `AgentRun` record
- Added cron entry `0 14 * * 1` to vercel.json
- Added `META_AD_ACCOUNT_ID` + `META_AD_ACCESS_TOKEN` vars to .env.example
- `tsc --noEmit` + `npm run build` both pass

**Status:** COMPLETE — all Definition of Done criteria met
**Env vars needed:** `META_AD_ACCOUNT_ID` (act_XXXXXXXX), `META_AD_ACCESS_TOKEN` (System User token with ads_read scope from Meta Business Manager)

### Iteration 2 — verification pass ✅
**Done:**
- Confirmed route.ts exists and is complete (classified kill/scale/variant/hold, dedup, idempotency, ActionQueue, Notification, AgentRun)
- Confirmed vercel.json has `0 14 * * 1` cron at `/api/agents/ads-oracle`
- `tsc --noEmit` — no errors
- `npm run build` — passes cleanly
- No changes needed; loop remains COMPLETE
