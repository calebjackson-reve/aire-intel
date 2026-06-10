# Loop: Content Performance Learning

**Status:** [x] Approved  _(2026-06-09)_
**Type:** outer  
**Feeds (if outer):** content-scheduler (updates template selection weights based on what performs best)  
**Rank:** 09  
**Score:** 24 / 30

---

## Trigger

Weekly cron every Sunday at 11:00 PM CT (before Monday's content scheduler plans the week). Gives the scheduler updated performance data to inform Monday's content type selection.

## Input

- `ContentPerformance` table — all records for posts published in last 30 days: `postId`, `platform`, `impressions`, `reach`, `likes`, `comments`, `saves`, `shares`, `engagementRate`, `fetchedAt`
- `ScheduledPost` — linked by `postId`; fields: `platform`, `caption`, `imageUrl`, `type` (listing_spotlight / market_update / educational / reel / client_story), `publishedAt`
- Meta Graph API: `src/lib/meta-insights.ts → buildContentAudit()` — pulls fresh engagement data for posts from last 30 days
- `TrendSignal` — recent trend signals (source, topic, score) to correlate with post performance

## Actions

1. Pull fresh engagement data from Meta for all posts published in last 30 days via `buildContentAudit()`
2. Upsert `ContentPerformance` records with latest engagement numbers
3. Group posts by type and calculate per-type averages:
   - Average engagement rate by content type
   - Average saves/reach by content type (saves = high-intent signal)
   - Average reach by day-of-week and time-of-day
4. Identify top 3 performing content types and top 2 worst-performing
5. Generate insight summary via Claude Haiku (3 sentences max): "Your listing spotlight posts from the past 30 days averaged 4.2% engagement vs 1.8% for market updates. Educational posts on Wednesdays get 2× the saves of other days. Consider shifting Tuesday slots from market_update to listing_spotlight."
6. Write learning output to `Setting` table:
   - `"content.topType"` — slug of best-performing content type
   - `"content.bestDayOfWeek"` — day number (0-6) with best avg engagement
   - `"content.bestTimeOfDay"` — hour (0-23) with best avg engagement
   - `"content.lastLearningRun"` — timestamp
7. Create `Notification` with the 3-sentence insight summary

## Oracle

**What external source of truth grades the output?**  
Meta Graph API engagement data: `impressions`, `reach`, `engagementRate` per post. These are Meta's own metrics — not derived from AI output.

**Acceptance threshold:**  
`ContentPerformance` records exist for ≥ 10 published posts in the last 30 days (enough data to draw conclusions). Engagement rate for recommended content type must be ≥ 10% higher than the average across all types.

**Rejection signal:**  
Fewer than 5 posts published in 30 days — insufficient data. Skip learning run and notify: "Not enough post history for learning — publish more content first."

## Memory

- `ContentPerformance` — updated with fresh engagement data each run
- `Setting["content.topType"]` — consumed by content-scheduler to weight content type selection
- `Setting["content.bestDayOfWeek"]` — consumed by content-scheduler to optimize scheduling
- `Setting["content.lastLearningRun"]` — prevents duplicate runs within 6 days

## Surface

- Dashboard `Notification` with the 3-sentence insight summary (Sunday evening)
- Content Scheduler (inner loop) reads `Setting["content.topType"]` on Monday to bias content type selection
- Future: `/social` page analytics panel to show performance trends

---

## Safety Rails

- **Human chokepoint:** Learning loop only updates `Setting` values and sends a notification — it does not directly modify the content schedule or cancel planned posts. Content Scheduler reads the settings but still generates drafts for human approval.
- **Blast radius:** Setting updates + ContentPerformance upserts. Read-only on ScheduledPost / Lead data. No destructive actions.
- **Rate limit / cap:** Once per week. Meta API calls capped at 50 posts' worth of insights per run (30-day window is sufficient).
- **Idempotency:** `Setting["content.lastLearningRun"]` within-6-days guard.
- **Exit condition:** No published posts in 30 days → skip and notify. `Setting["loop.content_performance_learning.disabled"] = "true"` → pause.

---

## Implementation Notes

- Create `src/app/api/agents/content-learning/route.ts`
- Add cron to `vercel.json`: `{ "path": "/api/agents/content-learning", "schedule": "0 5 * * 0" }` (Sunday 11PM CT = Monday 5AM UTC)
- `src/lib/meta-insights.ts → buildContentAudit()` already fetches engagement data — verify it returns per-post breakdown, not just aggregate
- `ScheduledPost` model needs a `type` field if not already present (listing_spotlight | market_update | educational | reel | client_story)
- Content Scheduler should read `Setting["content.topType"]` at step 1 to bias its rotating schedule — add this as a preference weight, not a hard override
