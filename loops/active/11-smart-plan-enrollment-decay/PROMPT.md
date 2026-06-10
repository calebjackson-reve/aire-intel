# Loop Iteration Prompt — smart-plan-enrollment-decay

You are running one iteration of the `smart-plan-enrollment-decay` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read:
1. `loops/active/11-smart-plan-enrollment-decay/SPEC.md`
2. `loops/active/11-smart-plan-enrollment-decay/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/11-smart-plan-enrollment-decay/`

## What this loop builds

Enrollment stall detection inside the transaction-watchdog route. Flags enrollments where `nextStepAt` is overdue >48h, creates review tasks, and alerts if >30% of enrollments are stalled.

## Implementation units

**Unit A — schema inspection**
- Read `prisma/schema.prisma` — find the SmartPlan enrollment model
- Look for models named: `SmartPlanEnrollment`, `Enrollment`, `PlanEnrollment` 
- Note: what fields exist? (nextStepAt, status, leadId, planId, etc.)
- If there's no enrollment model: check if smart plan enrollment is tracked via a different mechanism (Task, ContactLog, Setting)
- Record findings in NOTES.md so next iteration has clear facts

**Unit B — decay check in transaction-watchdog**
- Only proceed if Unit A found the model
- Read `src/app/api/agents/transaction-watchdog/route.ts`
- After the existing milestone check, add enrollment decay pass:
  - Query enrollments where `status = "active"` AND `nextStepAt < now - 48h`
  - For each (max 20): 
    - Check ActionQueue dedup (no existing review task for same enrollmentId)
    - Create ActionQueue: `type: "create_lofty_task"`, payload: `{enrollmentId, leadId, staleHours}`, priority 4, `requiresApproval: true`
  - Count stalled enrollments; if > 30% of all active: create Notification warning
  - Update Setting: `smartplan.stalledCount = stalledCount.toString()`
- Mark `// AIRE: loop:smart-plan-enrollment-decay`

**Unit C — graceful no-op if schema missing**
- If Unit A found no enrollment model: document this in NOTES.md and mark STATUS: BLOCKED with a note that SmartPlan enrollment schema needs to be confirmed first

## AIRE conventions (mandatory)

- `// AIRE: loop:smart-plan-enrollment-decay`; `logError()`, prisma from `src/lib/prisma.ts`

## Oracle

```bash
npx tsc --noEmit && npm run build
```

## After your unit

Oracle → commit → update NOTES.md → status block.
