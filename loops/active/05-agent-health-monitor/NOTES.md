# Loop: agent-health-monitor — Handoff Notes

## Spec Summary
New POST route /api/agents/health-check that runs at 6:30 AM CT. Checks AgentRun records for each of the 6 agent types, scores overall health, alerts on failures.

## Definition of Done (from SPEC.md)
- `src/app/api/agents/health-check/route.ts` exists with POST handler + CRON_SECRET auth
- Checks all 6 agent types in last 24h window
- Computes health score; SMS if < 50
- Checks DailyBrief.assembledAt for today; SMS if missing
- Updates Setting["agents.healthScore"] and Setting["agents.lastChecked"]
- vercel.json has `30 11 * * *` cron for `/api/agents/health-check`
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Create src/app/api/agents/health-check/route.ts with POST handler.
