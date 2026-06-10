# Loop: Agent Health Monitor

**Status:** [x] Approved  _(2026-06-09)_
**Type:** outer  
**Feeds (if outer):** All 6 inner agents — morning-brief, lead-revival, transaction-watchdog, market-intel, content-scheduler, new-lead-intake  
**Rank:** 05  
**Score:** 28 / 30

---

## Trigger

Daily cron at 6:30 AM CT (30 minutes after the last scheduled inner agent — Transaction Watchdog runs at 6AM CT). Checks that all overnight agents completed successfully before Caleb opens the brief.

## Input

- `AgentRun` — all records from last 24h, grouped by `agentType`. Fields: `agentType`, `status`, `startedAt`, `completedAt`, `itemsProcessed`, `actionsQueued`, `errorLog`, `durationMs`
- `ErrorLog` — last 24h entries, grouped by `source` (agent routes)
- `Setting` — `"agent.{type}.lastSuccessAt"` for each agent type
- `DailyBrief` — today's record; check if `assembledAt` is set (brief was assembled)

## Actions

1. For each of the 6 agent types, find the most recent `AgentRun` from the last 24h
2. Classify each agent's health:
   - `ok` — `status = "completed"`, completedAt within expected window
   - `partial` — `status = "partial"` — completed but with some errors in `errorLog`
   - `failed` — `status = "failed"` or no `AgentRun` record found for today
   - `missing` — no record at all (cron may not have fired)
3. Compute overall health score: (ok_count × 2 + partial_count) / 12 × 100
4. If any agent is `failed` or `missing`:
   - Create `Notification` type `"critical"`: "[Agent Name] failed last night — [itemsProcessed] items processed, [actionsQueued] queued before failure"
   - Write to `DailyBrief.nonNegotiables` if brief exists
   - SMS Caleb if health score < 50
5. If `DailyBrief` for today has no `assembledAt` (Morning Brief Assembler failed):
   - SMS Caleb: "Morning brief not assembled — agents may need attention. Check /agents for details."
6. Update `Setting["agents.healthScore"]` + `Setting["agents.lastChecked"]`

## Oracle

**What external source of truth grades the output?**  
`AgentRun.status` field written by each inner agent. `DailyBrief.assembledAt` timestamp. `ErrorLog` count grouped by agent source. These are all platform-internal records — not self-grading AI output.

**Acceptance threshold:**  
All 6 agents show `status = "completed"` or `"partial"` within their scheduled windows. Health score ≥ 80.

**Rejection signal:**  
Health score < 50 for 2 consecutive days → SMS Caleb with summary and link to `/agents` observability page.

## Memory

- `Setting["agents.healthScore"]` — today's score, shown on `/system` health page
- `Setting["agents.lastChecked"]` — prevents duplicate runs
- `AgentRun` — authoritative execution history (written by inner agents, read by this monitor)

## Surface

- `/agents` page — shows `AgentRun` history table with status badges
- `/system` health page — overall health score incorporates agent health
- Dashboard `Notification` for failures
- `DailyBrief.nonNegotiables` when agents failed
- SMS for critical failures (score < 50)

---

## Safety Rails

- **Human chokepoint:** Monitor only alerts and writes to DB — it does not retry or re-trigger failed agents. Re-triggering is a manual action via `/api/agents/run-all` (dev/admin endpoint with CRON_SECRET auth).
- **Blast radius:** Read-only except for `Notification` creates and `Setting` updates. Cannot affect lead data or ActionQueue.
- **Rate limit / cap:** Runs once per day. Max 2 SMS per 24h regardless of how many agents failed.
- **Idempotency:** `Setting["agents.lastChecked"]` date guard.
- **Exit condition:** Never permanently exits — always-on health monitor. Can be paused via `Setting["loop.agent_health_monitor.disabled"]`.

---

## Implementation Notes

- Create `src/app/api/agents/health-check/route.ts` — new route
- Add cron entry to `vercel.json`: `{ "path": "/api/agents/health-check", "schedule": "30 11 * * *" }` (6:30 AM CT = 11:30 UTC)
- Reuse `getHealthScore()` pattern from `src/lib/error-memory.ts` as a reference implementation
- `/agents` page already exists — verify it reads from `AgentRun` table and shows status badges correctly
- Extend `/agents` page to show the per-agent health classification from today's monitor run
