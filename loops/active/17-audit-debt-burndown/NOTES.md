# Loop: audit-debt-burndown — Handoff Notes

## Spec Summary
Weekly Sunday 2AM CT cron. Scans for TODO/FIXME/225-XXX/placeholder strings and TypeScript errors. Fixes top 3 by priority (P1: placeholder values; P2: TS errors; P4: other TODOs). Reverts on oracle failure.

## Definition of Done (from SPEC.md)
- `src/app/api/agents/audit-debt/route.ts` exists
- `225-XXX-XXXX` in src/lib/smart-plan-templates.ts replaced with process.env.CALEB_PHONE
- TypeScript errors (from npx tsc --noEmit) are primary P2 targets
- Setting["auditdebt.completedItems"] and Setting["auditdebt.blockedItems"] guard
- vercel.json has `0 7 * * 0` cron for `/api/agents/audit-debt`
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Check if 225-XXX-XXXX exists in src/lib/smart-plan-templates.ts (P1 debt). Fix it first if so.
