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
