# Loop: phase-b-graduation — Handoff Notes

## Spec Summary
Monthly 15th 9AM cron. Analyzes last 30 days of ActionQueue by type — approval rate + success rate — and reports which action types are eligible for Phase B (auto-execute). Never flips requiresApproval automatically.

## Definition of Done (from SPEC.md)
- `src/app/api/agents/phase-b-eval/route.ts` exists
- Analyzes all 5 action types against graduation criteria
- Updates Setting["phaseb.graduationCandidates"] with JSON list
- Creates Notification with candidates
- vercel.json has `0 15 15 * *` cron for `/api/agents/phase-b-eval`
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Create src/app/api/agents/phase-b-eval/route.ts. Start with ActionQueue aggregate queries by type.

### Iteration 1 — COMPLETE (2026-06-10)
- Created `src/app/api/agents/phase-b-eval/route.ts`
  - POST + GET handlers with CRON_SECRET validation
  - Queries ActionQueue for last 30 days grouped by all 5 action types
  - Computes totalItems, approvedCount, executedCount, failedCount, approvalRate, successRate
  - Graduation criteria: approvalRate >= 0.90 AND successRate >= 0.95 AND totalItems >= 20
  - `send_client_email` hardcoded as never-eligible
  - Idempotency guard: skips if last run was within 20 days
  - Updates `phaseb.graduationCandidates` + `phaseb.lastEvaluation` Settings
  - Creates Notification with eligible types (or "No types eligible yet")
- Added `{ "path": "/api/agents/phase-b-eval", "schedule": "0 15 15 * *" }` to vercel.json
- Oracle: `npx tsc --noEmit` ✓, `npm run build` ✓
- Commit: a8cd637

**Status: DONE — all Definition of Done items satisfied.**
