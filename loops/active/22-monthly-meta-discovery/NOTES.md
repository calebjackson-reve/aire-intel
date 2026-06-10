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

### Iteration 1 — Units A + B + C complete
**Done:**
- Created `src/app/api/agents/meta-discovery/route.ts` with full implementation
- Auth: `verifyCronSecret` on POST; GET open for local dev
- Idempotency guard: `loops.lastMetaDiscovery` — skips if within 20 days
- Reads `loops/REGISTRY.md` from filesystem; returns graceful `{ skipped: true }` if path not found (production)
- Parses all loops with status `scaffolded`, `active`, or `deployed`
- For each loop: queries `AgentRun` (successRate, avgDurationMs) + `ActionQueue` (actionsQueued, approvalRate) in last 30 days
- Classifies green/yellow/red per spec thresholds
- Writes `loops.deployedRoiMetrics` + `loops.lastMetaDiscovery` Settings
- Creates dashboard Notification with green/yellow/red counts and top performer
- Records `AgentRun` for self-monitoring
- Added vercel cron: `0 5 28 * *` → `/api/agents/meta-discovery`
- Oracle: `npx tsc --noEmit` + `npm run build` both pass

**Status:** ✅ complete — definition of done met
