# Loop: Goal Pacing Alert

**Status:** [x] Approved  _(2026-06-09)_
**Type:** outer  
**Feeds (if outer):** lead-revival (adjusts revival cadence if behind pace), content-scheduler (increases content frequency if awareness is low)  
**Rank:** 06  
**Score:** 26 / 30

---

## Trigger

Weekly cron every Monday at 7:00 AM CT. Also fires on the 1st of each month for a monthly pace review.

## Input

- `Lead` table — count by `stage`, `createdAt` (this month), `closingDate` (this month/quarter)
- `ContactLog` — outbound contact count this week/month
- `ActionQueue` — executed items this month by type
- `DotloopLoop` — active transactions, `closingDate` within 30/60/90 days
- `Setting` — `"goal.annualGCI"`, `"goal.closingsPerMonth"`, `"goal.leadsPerWeek"` — Caleb's targets (must be set manually once)
- Current date → derive where we are in the month/quarter/year

## Actions

1. Pull current pipeline stats:
   - New leads this month (count `Lead` where `createdAt >= month_start`)
   - Active pipeline value (count `Lead` by stage × average GCI per stage)
   - Closings this month (`Lead` where `closingDate` within current month AND `stage = "closing"`)
   - Outbound contacts this week (`ContactLog` where `direction = "outbound"` AND `createdAt >= week_start`)
2. Compare against targets from `Setting`:
   - Leads per week pace: (leads this month / weeks elapsed) vs. `goal.leadsPerWeek`
   - Closings pace: closings YTD / months elapsed vs. `goal.closingsPerMonth`
   - Contact activity: outbound contacts this week vs. target (default: 20/week)
3. Calculate pacing percentage for each dimension (actual / target × 100)
4. Generate pacing summary via Claude Haiku: 2-sentence plain-English status ("You're 15% behind on lead volume this month. The revival agent drafted 8 follow-ups — approving them would close the gap.")
5. Assemble `DailyBrief` note or a standalone `Notification`:
   - If all dimensions ≥ 90%: `type = "info"`, brief mention in brief header
   - If any dimension 70–90%: `type = "warning"` Notification + brief section
   - If any dimension < 70%: `type = "critical"` + SMS alert
6. If behind on leads AND lead revival agent hasn't been running (check `AgentRun` for recent revival runs): create `ActionQueue` item `type = "create_lofty_task"`: "Review revival queue — lead volume is behind pace"

## Oracle

**What external source of truth grades the output?**  
`Lead.createdAt` count, `DotloopLoop` closings with a `closingDate` this month, `ContactLog` outbound count — all stored in the platform DB, not AI-generated.

**Acceptance threshold:**  
All three pacing dimensions stay ≥ 80% of targets through the month.

**Rejection signal:**  
If pacing is < 60% on closings with < 10 days left in the month, escalate with direct SMS (not just brief note).

## Memory

- `Setting["goal.*"]` — target values (must be set by Caleb in Settings page)
- `Setting["pacing.lastChecked"]` — prevents duplicate weekly runs
- `Setting["pacing.weeklyLeadCount"]`, `"pacing.monthlyClosings"` — rolling counters updated each run

## Surface

- `DailyBrief` — pacing section added to brief on Mondays
- Dashboard `Notification` for warning/critical states
- `/pipeline` page header — show a small pacing badge (future: link to detailed breakdown)
- SMS for critical only (< 70% on closings pace)

---

## Safety Rails

- **Human chokepoint:** All suggestions are notifications — no automatic changes to lead stages, revival cadence, or content frequency. The loop "feeds" other agents conceptually (by alerting), not by directly modifying their config without approval.
- **Blast radius:** Read-only analysis + Notification writes. One optional `ActionQueue` task creation if behind on leads.
- **Rate limit / cap:** Once per week (Monday). Monthly summary on the 1st. No SMS more than once per week.
- **Idempotency:** `Setting["pacing.lastChecked"]` date guard — if already ran this week (within 6 days), skip.
- **Exit condition:** `Setting["goal.annualGCI"]` not set → skip and log a one-time info notification: "Set your annual goals in Settings to enable pacing alerts."

---

## Implementation Notes

- Create `src/app/api/agents/goal-pacing/route.ts`
- Add cron to `vercel.json`: `{ "path": "/api/agents/goal-pacing", "schedule": "0 13 * * 1" }` (7AM CT Monday = 13:00 UTC)
- Settings page needs 3 new fields: annual GCI target, closings/month target, leads/week target — store as `Setting` key-value records
- Claude Haiku for the plain-English summary (50-token budget — just 2 sentences)
- The pacing calculation is pure arithmetic on DB counts — no ML needed
