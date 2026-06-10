# Loop: monthly-meta-discovery — Handoff Notes

## Spec Summary
Monthly 28th 11PM CT cron. Reads REGISTRY.md for deployed loops, pulls oracle metrics for each, classifies green/yellow/red vs threshold. Creates Notification with ROI summary.

## Definition of Done (from SPEC.md)
- `src/app/api/agents/meta-discovery/route.ts` exists
- Reads loops/REGISTRY.md to find deployed loops
- Pulls oracle metrics per deployed loop (ContactLog rates, AgentRun status, etc.)
- Classifies each loop green/yellow/red
- Updates Setting["loops.deployedRoiMetrics"] and Setting["loops.lastMetaDiscovery"]
- vercel.json has `0 5 28 * *` cron for `/api/agents/meta-discovery`
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Create src/app/api/agents/meta-discovery/route.ts. Start with auth check + REGISTRY.md read.
