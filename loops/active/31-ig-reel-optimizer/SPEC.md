# Loop 31 — IG Reel Optimizer

**Status:** [x] Approved  
**Type:** outer  
**Feeds:** content-scheduler (reads `content.reel.topHookStyle` on Monday)  
**Rank:** 31  
**Score:** 24 / 30

---

## Trigger

Cron: `0 4 * * 0` — Sunday 11PM CT (4AM UTC Monday)  
Runs before content-learning (Sunday 5AM) so Monday's scheduler picks up the result.

## Input

- `getPageInsights()` from `src/lib/meta-insights.ts`
- Filters: platform = "instagram", `avgWatchTime` populated, last 30 days
- Requires ≥5 qualifying Reels

## Actions

1. Filter IG posts to Reels with watch time data in last 30 days
2. Extract first sentence of `caption` as hook text
3. Classify each hook: `fragment | question | number | statement`
4. Group by style; compute avg watch time per style (≥2 samples required)
5. Rank styles by avg watch time
6. Write results to Settings
7. Create Notification with oracle summary

## Oracle

**External source:** `ig_reels_avg_watch_time` — Meta's algorithm signal (seconds)  
_(Not AI-graded — real watch time from Meta Graph API)_

**Acceptance threshold:** ≥5 Reels with watch time data in last 30 days  
**Rejection signal:** < 5 Reels → `{ skipped: true, reason: "insufficient_data" }`

## Quality Gate

**Output type:** n/a — oracle is external watch time data, not AI-generated text

## Memory

Settings written:
- `content.reel.topHookStyle` — winning hook style string
- `content.reel.avgWatchTimeTop` — avg watch time of top style (seconds)
- `content.reel.styleData` — full JSON array of all style scores
- `content.reel.lastRun` — ISO timestamp for 6-day idempotency guard

## Surface

- Notification: "Reel Oracle: fragment hooks average Xs watch time vs Ys for questions"
- `content-scheduler` reads `content.reel.topHookStyle` on Monday to prioritize that hook style

---

## Safety Rails

- **Human chokepoint:** Caleb reviews content scheduler output before publishing
- **Blast radius:** Only writes Settings; no leads, no posts modified
- **Rate limit:** Once per week max (6-day idempotency guard)
- **Idempotency:** `content.reel.lastRun` within-6-day guard
- **Exit condition:** Auto-skips if < 5 Reels with watch data

## Implementation Notes

- Route: `src/app/api/agents/ig-reel-optimizer/route.ts`
- Requires `avgWatchTime` + `caption` fields on `PostInsight` (added in `src/lib/meta-insights.ts`)
