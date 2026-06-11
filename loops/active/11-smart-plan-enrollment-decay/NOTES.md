# Loop: smart-plan-enrollment-decay — Handoff Notes

## Spec Summary
Add enrollment stall detection inside transaction-watchdog. Flag enrollments where nextStepAt is overdue > 48h, create review tasks, alert if > 30% stalled.

## Definition of Done (from SPEC.md)
- Enrollment decay check added to transaction-watchdog route
- Uses actual SmartPlan enrollment model from schema (verify model name first)
- ActionQueue task created for stalled enrollments (with dedup)
- Setting["smartplan.stalledCount"] updated
- `npx tsc --noEmit` and `npm run build` both pass

## Schema Facts (Unit A)

`SmartPlanEnrollment` confirmed in `prisma/schema.prisma:178`:
- `id`, `leadId`, `lead`, `planId`, `plan`
- `currentStep Int @default(0)`
- `active Boolean @default(true)` — no `status` string field; use `active: true` to filter
- `startedAt DateTime`
- `nextStepAt DateTime?` — nullable; null means no step scheduled yet (skip these)

No `lastStepExecutedAt` or `enrolledAt` fields — SPEC assumed more fields than exist.

## Iteration Log

### Iteration 0 — scaffolded, nothing started

### Iteration 1 — Units A + B complete
- Confirmed `SmartPlanEnrollment` model (active Boolean, nextStepAt nullable)
- Added enrollment decay pass as step 4 in `src/app/api/agents/transaction-watchdog/route.ts`
  - Queries `active=true AND nextStepAt < now-48h`, takes 20
  - ActionQueue dedup by `leadId + type + agentType + status=pending`
  - Creates `create_lofty_task` items, priority 4, requiresApproval
  - Notifications if >30% stalled; upserts `smartplan.stalledCount` Setting
- Oracle: `npx tsc --noEmit` ✓, `npm run build` ✓
- Commit: `93776da`

**STATUS: DONE — oracle passing, committed**
