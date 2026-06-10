# Loop: Revival Performance Tracker

**Status:** [x] Approved  _(2026-06-09)_
**Type:** outer  
**Feeds (if outer):** lead-revival agent (adjusts targeting criteria), sphere-reactivation (shares reply-rate benchmarks)  
**Rank:** 15  
**Score:** 21 / 30

---

## Trigger

Bi-weekly cron every other Monday at 7:30 AM CT (2 weeks of revival data = enough to see reply patterns). Also triggers after `RevivalCohort` records accumulate ≥ 30 new entries since last evaluation.

## Input

- `RevivalCohort` — all records: `leadId`, `cohortDate`, `messageType`, `subject`, `sentAt`, `repliedAt`, `replyContent`, `converted`, `stage`
- `ContactLog` — for each lead in a `RevivalCohort`, inbound entries after `cohortDate`
- `Lead` — current `stage`, `temperature` for cohort members (did stage advance after revival?)
- `ActionQueue` — draft_message items that were executed (to get the actual sent message)
- `Setting["revival.targetDaysSinceContact"]` — current targeting threshold (default: 7 days)

## Actions

1. Pull all `RevivalCohort` records from last 30 days
2. For each cohort member, check `ContactLog` for inbound replies since `cohortDate`
3. Calculate performance metrics:
   - Reply rate: (leads with inbound reply) / (leads contacted) × 100
   - Stage advancement rate: (leads whose stage advanced) / (leads contacted) × 100
   - Time-to-reply distribution: median + P90 hours to first reply
   - Top-performing message patterns: which draft types (tone, length, subject line) drove highest reply rates
4. Compare against previous cohort (trend: improving, flat, declining)
5. Generate performance insight via Claude Haiku (3 sentences max): which message patterns worked, which didn't, and one suggested adjustment
6. Write insights to `Setting`:
   - `"revival.lastReplyRate"` — percentage
   - `"revival.bestMessagePattern"` — short description of what's working
   - `"revival.recommendedTargeting"` — suggested days-since-contact threshold based on when replies happen
7. Create `Notification` with 3-sentence insight + recommendation
8. If reply rate < 8% over 30 days: flag as critical → SMS + recommend pausing revival agent until message review

## Oracle

**What external source of truth grades the output?**  
`ContactLog` inbound entries from revival targets (not AI-generated — actual lead replies). `Lead.stage` advancement (pipeline progress). These are platform DB records tied to real interactions.

**Acceptance threshold:**  
Overall revival reply rate ≥ 12% over 30 days. Stage advancement rate ≥ 5% (not everyone replies, but some should move forward).

**Rejection signal:**  
Reply rate < 8% for 30 consecutive days → pause revival agent, alert Caleb, suggest message audit.

## Memory

- `RevivalCohort` — cohort records written by the revival agent on each send
- `Setting["revival.lastReplyRate"]` — consumed by revival agent to assess health
- `Setting["revival.bestMessagePattern"]` — consumed by draft-agent context for future revival drafts
- `Setting["revival.recommendedTargeting"]` — consumed by revival agent for lead selection
- `Setting["revival.lastEvaluation"]` — prevents double-run within 12 days

## Surface

- Dashboard `Notification` bi-weekly with 3-sentence performance summary
- `/contacts` page — could show a revival reply rate badge on the contacts overview
- `/brief` — if reply rate is declining, include in DailyBrief as a signal worth Caleb's attention

---

## Safety Rails

- **Human chokepoint:** Performance tracking is read-only analysis. The "pause revival" recommendation requires Caleb to manually set `Setting["agent.revival.paused"] = "true"`.
- **Blast radius:** Writes only Setting values and Notifications. Read-only on RevivalCohort, ContactLog, Lead.
- **Rate limit / cap:** Bi-weekly only. Max 1 SMS per evaluation (for critical < 8% alert).
- **Idempotency:** `Setting["revival.lastEvaluation"]` within-12-days guard.
- **Exit condition:** `RevivalCohort` table has < 10 records (system too new to evaluate). Skip with info notification: "Not enough revival history yet — check back after 2 weeks of agent runs."

---

## Implementation Notes

- Create `src/app/api/agents/revival-tracker/route.ts`
- Add cron to `vercel.json`: `{ "path": "/api/agents/revival-tracker", "schedule": "30 13 * * 1/2" }` — every other Monday 7:30AM CT is complex in standard cron; consider monthly trigger instead or use `Setting["revival.lastEvaluation"]` + 14-day gap check inside a weekly cron
- `RevivalCohort` model already exists in schema — verify it has `repliedAt`, `replyContent`, `converted` fields
- Revival agent (nightly) needs to write a `RevivalCohort` record on each draft send — verify this is happening in `src/app/api/agents/revival/route.ts`
- The `Setting["revival.bestMessagePattern"]` value is consumed by `src/lib/draft-agent.ts` — add it to the draft generation context as a style hint
