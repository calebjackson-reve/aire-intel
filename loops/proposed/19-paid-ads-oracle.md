# Loop: Paid Ads Oracle

**Status:** [x] Approved  _(2026-06-09)_
**Type:** inner  
**Feeds (if outer):** n/a  
**Rank:** 19  
**Score:** 24 / 30

---

## Trigger

Weekly cron every Monday at 8:00 AM CT (after Morning Brief, so ad performance appears in the brief for the week). Pulls last 7 days of ad performance across Meta and Google.

## Input

- Meta Ads API via `src/lib/meta.ts` or `mcp__adspirer__meta_ads` MCP tool: campaigns from last 7 days — `campaign_id`, `campaign_name`, `spend`, `impressions`, `clicks`, `leads`, `cpm`, `ctr`, `cpl` (cost per lead)
- Google Ads API via `mcp__adspirer__google_ads` (if active): same fields
- `Setting["ads.lastWeekMetrics"]` — previous week's metrics for delta calculation
- `Setting["ads.killThreshold.cpl"]` — max acceptable CPL before killing ad (default: `$25`)
- `Setting["ads.scaleThreshold.ctr"]` — CTR above which to scale budget (default: `3.5%`)

## Actions

1. Pull last 7 days of campaign data from Meta Ads (and Google Ads if connected)
2. For each campaign, calculate week-over-week delta: spend, CTR, CPL, leads
3. Classify each campaign:
   - **Kill** — CPL > kill threshold AND CTR < 1.5% AND leads < 2 this week
   - **Scale** — CTR > scale threshold AND CPL < kill threshold AND leads ≥ 3 this week
   - **Variant** — CPL is borderline (within 20% of threshold) → suggest A/B test variant
   - **Hold** — everything else (monitor, no action needed)
4. For "Kill" campaigns: enqueue `ActionQueue` item `type = "create_lofty_task"` with task title "Pause [campaign name] — CPL $N, [N] leads this week"
5. For "Scale" campaigns: enqueue `ActionQueue` item `type = "create_lofty_task"` with task title "Scale [campaign name] — CTR N%, CPL $N"
6. For "Variant" campaigns: generate a variant suggestion via Claude Haiku (new headline or audience adjustment) and include in the task
7. Assemble performance report and write to `DailyBrief.marketMovement` (overloaded — or add a new section if DailyBrief supports it)
8. Create `Notification`: "Weekly ads report ready — [N] kill, [N] scale, [N] variant recommendations"
9. Update `Setting["ads.lastWeekMetrics"]` with this week's data

## Oracle

**What external source of truth grades the output?**  
Meta/Google Ads API: spend, CTR, CPL, leads — all platform-measured numbers. The kill/scale thresholds are Caleb's configured targets in `Setting`.

**Acceptance threshold:**  
API returns data for ≥ 1 active campaign. CPL trending downward week-over-week for any active campaign = loop is working.

**Rejection signal:**  
Meta Ads API returns auth error → log to ErrorLog, SMS Caleb "Meta Ads API error — check token in Settings." Google Ads not configured → skip Google section gracefully (not an error).

## Memory

- `Setting["ads.lastWeekMetrics"]` — previous week's data for delta calculation
- `Setting["ads.killThreshold.cpl"]` + `"ads.scaleThreshold.ctr"]` — configurable thresholds
- `ActionQueue` — kill/scale task items (dedup: check for existing pending task with same campaign ID)

## Surface

- `DailyBrief` — weekly ads section on Monday morning
- `ActionQueue` items → visible in `/brief` and `/pipeline` as tasks
- Dashboard `Notification` (Monday morning)
- Future: `/social` page analytics panel could show ad performance alongside organic post performance

---

## Safety Rails

- **Human chokepoint:** Kill/scale recommendations are `ActionQueue` tasks requiring approval — this loop never directly changes ad budgets or pauses campaigns. Caleb makes all ad account changes manually.
- **Blast radius:** Read-only on ad accounts. Writes only Setting updates, ActionQueue tasks, Notification.
- **Rate limit / cap:** Once per week. Max 5 campaign recommendations per run (focus on the most actionable).
- **Idempotency:** `Setting["ads.lastWeekMetrics"].weekOf` guard — if already ran this week, skip.
- **Exit condition:** No active ad campaigns → log info notification: "No active campaigns found." `Setting["loop.paid_ads_oracle.disabled"] = "true"` to pause.

---

## Implementation Notes

- Create `src/app/api/agents/ads-oracle/route.ts`
- Add cron to `vercel.json`: `{ "path": "/api/agents/ads-oracle", "schedule": "0 14 * * 1" }` (8AM CT Monday = 14:00 UTC)
- The MCP Adspirer tools (`mcp__adspirer__meta_ads`, `mcp__adspirer__google_ads`) are available for ad performance pulls — use these rather than building a custom API client
- `src/lib/meta.ts` may have Meta Ads integration already — check before using MCP tools
- Kill/scale thresholds should be configurable via `Setting` — add these to the Settings page
- CPL formula: `spend / max(1, leads)` — handle zero-leads case to avoid division by zero
