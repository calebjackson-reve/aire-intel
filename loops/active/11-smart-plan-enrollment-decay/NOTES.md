# Loop: smart-plan-enrollment-decay — Handoff Notes

## Spec Summary
Add enrollment stall detection inside transaction-watchdog. Flag enrollments where nextStepAt is overdue > 48h, create review tasks, alert if > 30% stalled.

## Definition of Done (from SPEC.md)
- Enrollment decay check added to transaction-watchdog route
- Uses actual SmartPlan enrollment model from schema (verify model name first)
- ActionQueue task created for stalled enrollments (with dedup)
- Setting["smartplan.stalledCount"] updated
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Read prisma/schema.prisma — find SmartPlan enrollment model name and fields.
