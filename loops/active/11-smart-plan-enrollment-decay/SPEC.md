# Loop: SmartPlan Enrollment Decay Monitor

**Status:** [x] Approved  _(2026-06-09)_
**Type:** inner  
**Feeds (if outer):** n/a  
**Rank:** 11  
**Score:** 23 / 30

---

## Trigger

Daily cron at 6:00 AM CT — runs as part of the Transaction Watchdog pass, or as a standalone step within Morning Brief assembly. Checks all active SmartPlan enrollments for leads that have gone cold mid-drip.

## Input

- `SmartPlanEnrollment` (or equivalent model) — all records with `status = "active"`: `leadId`, `planId`, `currentStep`, `nextStepAt`, `enrolledAt`, `lastStepExecutedAt`
- `Lead` — linked records: `stage`, `lastContactedAt`, `temperature`
- `SmartPlan` — plan details: total steps, step content, cadence
- Current date — to identify enrollments where `nextStepAt` is overdue

## Actions

1. Pull all active SmartPlan enrollments
2. For each enrollment:
   - **Overdue step** (`nextStepAt < now - 24h`): Flag as stalled. Check `Lead.stage` — if lead has moved to `active` or `closing`, auto-advance the plan to the appropriate step. Otherwise, create a `Notification`: "[Name]'s SmartPlan is stalled on Step [N] — review or re-queue."
   - **Lead gone cold mid-drip** (`Lead.temperature = "cold"` AND enrollment `currentStep < totalSteps - 2`): Flag for review. Suggest pausing the plan and switching to revival approach.
   - **Lead became hot mid-drip** (`Lead.stage = "active"` or `"closing"`): Flag for graduation — suggest Caleb advance the lead to a more hands-on plan or off the drip entirely.
3. For stalled enrollments with overdue steps > 48h: create `ActionQueue` item (`type = "create_lofty_task"`, priority = 5): "Review SmartPlan for [Name] — Step [N] is overdue"
4. Write count to `DailyBrief` if any stalled enrollments: "N SmartPlan enrollments need attention"

## Oracle

**What external source of truth grades the output?**  
`SmartPlanEnrollment.lastStepExecutedAt` updating forward (steps actually advancing). Lead temperature staying `warm` or `hot` through the drip sequence. `ContactLog` entries showing outbound contact happening at each step.

**Acceptance threshold:**  
≤ 10% of active enrollments are stalled (overdue step by > 48h) at any given time.

**Rejection signal:**  
> 30% of enrollments stalled simultaneously → likely a system issue (executor failed, cron missed). Log to `ErrorLog` and alert.

## Memory

- `SmartPlanEnrollment.status` + `.nextStepAt` + `.lastStepExecutedAt` — state of each enrollment
- `Setting["smartplan.stalledCount"]` — rolling stall count for trend monitoring
- `ActionQueue` — task items created for overdue steps

## Surface

- `DailyBrief` — stall count in a brief section
- Dashboard `Notification` for individual stalled plans (warning level)
- `/smart-plans` page — enrollments view should show overdue indicator

---

## Safety Rails

- **Human chokepoint:** No automatic step advancement — only flags stalled enrollments and creates review tasks. Caleb decides whether to advance, pause, or remove from the plan.
- **Blast radius:** Read-only on SmartPlan data. Writes only `ActionQueue` task items and `Notification`s.
- **Rate limit / cap:** Max 5 stall notifications per day (prioritize by overdue duration). Don't create a new task if a `pending` one already exists for the same lead × plan.
- **Idempotency:** Check `ActionQueue` for existing task with same `leadId` + `payload.planType` before creating a new one.
- **Exit condition:** `SmartPlanEnrollment.status = "completed"` or `"paused"` — exclude from monitoring.

---

## Implementation Notes

- Verify the exact Prisma model name for SmartPlan enrollments — it may be `SmartPlanEnrollment`, or enrollment state may be embedded in `SmartPlan` directly. Check `prisma/schema.prisma` before writing.
- `src/lib/smart-plan-executor.ts` already has `enrollLead()` — verify it creates enrollment records with `nextStepAt` timestamps
- Add this check as a step within `src/app/api/agents/transaction-watchdog/route.ts` (natural fit — same 6AM CT window) or in morning-brief assembler
- Placeholder phone number `225-XXX-XXXX` in `src/lib/smart-plan-templates.ts` must be replaced before SmartPlan SMS steps can execute — flag this as a prerequisite
