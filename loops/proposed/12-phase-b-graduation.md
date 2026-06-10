# Loop: Phase B Graduation Evaluator

**Status:** [x] Approved  _(2026-06-09)_
**Type:** outer  
**Feeds (if outer):** All inner agents — evaluates whether each action type is safe to flip from `requiresApproval = true` to `requiresApproval = false`  
**Rank:** 12  
**Score:** 22 / 30

---

## Trigger

Monthly cron on the 15th at 9:00 AM CT. Runs once per month to evaluate whether any action types have demonstrated sufficient reliability to graduate to Phase B (auto-execute without approval).

## Input

- `ActionQueue` — last 30 days of records grouped by `type`: `type`, `status`, `requiresApproval`, `approvedAt`, `skippedAt`, `executedAt`, `failedAt`, `failReason`
- `Setting` — `"agent.{type}.autoExecute"` flags (current Phase B state per action type)
- `AgentRun` — last 30 days of runs, to correlate failures with specific agents
- `ErrorLog` — last 30 days of execution errors by source

## Actions

1. For each action type (`draft_message`, `follow_up_text`, `send_client_email`, `post_content`, `create_lofty_task`):
   - Count total items in last 30 days
   - Calculate approval rate: approved / (approved + skipped)
   - Calculate execution success rate: executed / (executed + failed)
   - Calculate "edit before send" rate (not directly measurable, use skip rate as proxy for low confidence)
2. Apply graduation criteria per type (based on Phase A → Phase B plan):
   - `create_lofty_task`: Graduate if ≥ 20 items, approval rate ≥ 90%, success rate = 100% (low risk — safe to flip early)
   - `follow_up_text` (2nd+ attempt only): Graduate if ≥ 15 items, approval rate ≥ 85%, no failures in 14 days
   - `draft_message`: Graduate if ≥ 30 items, approval rate ≥ 80%, no "please stop texting" replies in ContactLog
   - `post_content`: Graduate if ≥ 8 items approved + posted + received ≥ 1% engagement
   - `send_client_email`: Templates only — never graduate AI-generated emails
3. For types meeting criteria: generate a graduation recommendation (do NOT auto-flip — this requires human sign-off)
4. Create `Notification` with graduation candidates: "create_lofty_task and follow_up_text are eligible for Phase B — review criteria and enable in Settings"
5. For types that were graduated but have high failure/skip rates in last 30 days: flag for Phase B reversal ("post_content is getting 60% skip rate — consider returning to manual approval")

## Oracle

**What external source of truth grades the output?**  
`ActionQueue` historical records: approval rate, execution success rate, failure logs. `ContactLog` inbound replies after draft_message executions (did leads respond negatively?). These are DB records, not AI-generated assessments.

**Acceptance threshold:**  
Graduation criteria thresholds (defined per type above). A graduated action type has zero `failedAt` records in the most recent 14-day window.

**Rejection signal:**  
Any `draft_message` results in an "unsubscribe" or complaint reply (check `ContactLog`) → immediately flag draft_message for Phase B reversal regardless of approval rate.

## Memory

- `Setting["agent.{type}.autoExecute"]` — the Phase B toggle per action type (this loop recommends changes, doesn't flip automatically)
- `Setting["phaseb.lastEvaluation"]` — timestamp of last run
- `Setting["phaseb.graduationCandidates"]` — JSON list of types that met criteria this month

## Surface

- Dashboard `Notification` with graduation candidates (monthly)
- Settings page — Phase B section should show graduation status per action type with current metrics
- `/agents` page — add a "Phase B eligibility" row to the agent run stats table

---

## Safety Rails

- **Human chokepoint:** This loop NEVER flips `requiresApproval`. It only presents recommendations. Caleb must manually toggle `Setting["agent.{type}.autoExecute"] = "true"` in the Settings UI.
- **Blast radius:** Read-only analysis + Notification create + Setting write (only the `graduationCandidates` summary, not the autoExecute flags).
- **Rate limit / cap:** Once per month. No spamming — one clear monthly summary, not per-type notifications.
- **Idempotency:** `Setting["phaseb.lastEvaluation"]` within-20-days guard.
- **Exit condition:** Always runs monthly. Can be paused via `Setting["loop.phase_b_graduation.disabled"]`.

---

## Implementation Notes

- Create `src/app/api/agents/phase-b-eval/route.ts`
- Add cron to `vercel.json`: `{ "path": "/api/agents/phase-b-eval", "schedule": "0 15 15 * *" }` (9AM CT 15th = 15:00 UTC)
- Settings page needs a Phase B panel: per action type, show approval rate + success rate + graduation status + toggle
- `ActionQueue` query: group by `type`, count by `status` — pure SQL aggregation, no AI needed
- The "send_client_email never graduates" rule for AI-generated emails should be hardcoded, not configurable
