# Loop: Monthly Meta-Discovery

**Status:** [x] Approved  _(2026-06-09)_
**Type:** outer  
**Feeds (if outer):** All loops — runs discovery pass to find new loops + reports ROI on deployed ones  
**Rank:** 22  
**Score:** 20 / 30

---

## Trigger

Monthly cron on the 28th at 11:00 PM CT (end of month, before the new month). Runs the full `/find-loops` discovery pass via `loops/discovery-loop.sh` and compiles a loop ROI report for all deployed loops.

## Input

- The entire AIRE platform codebase — discovery pass reads all routes, models, integrations
- `loops/REGISTRY.md` — current loop status (deployed / building / proposed / archived)
- For each deployed loop: its oracle metric source (from the spec) — reply rates from `ContactLog`, error counts from `ErrorLog`, coverage from test runner, engagement from `ContentPerformance`, etc.
- `Setting["loops.deployedRoiMetrics"]` — cached ROI metrics from last month for delta calculation

## Actions

1. **ROI Report** — for each loop in REGISTRY.md with `status = "deployed"`:
   - Pull the oracle metric for that loop (per the spec's Oracle section)
   - Compare to the loop's "Acceptance threshold" from the spec
   - Classify: `green` (at or above threshold) / `yellow` (within 20% below) / `red` (below threshold by > 20%)
   - For `red` loops: add a recommendation (pause, adjust threshold, or rebuild)
2. **New Discovery** — invoke `loops/discovery-loop.sh` logic:
   - Scan for new signal sources added since last discovery run
   - Generate new loop candidates (not already in REGISTRY.md)
   - Score them using the standard formula
   - Write new specs to `loops/proposed/NN-*.md` (unchecked, for human review)
3. **Delta Report** — compare this month's ROI metrics against last month's for each deployed loop
4. Write consolidated report to a `Notification` (monthly summary)
5. Update `Setting["loops.deployedRoiMetrics"]` with this month's numbers
6. Update `Setting["loops.lastMetaDiscovery"]` timestamp

## Oracle

**What external source of truth grades the output?**  
For the ROI report: the oracle metrics are pulled from platform DB records (ContactLog, ContentPerformance, ErrorLog, AgentRun) — same external signals defined in each loop's spec. For new discovery: no oracle (discovery is exploratory). The loop grades itself by whether its ROI report influences Caleb to keep or pause deployed loops.

**Acceptance threshold:**  
≥ 70% of deployed loops are `green` (oracle at or above threshold). Any `red` loops have a written recommendation.

**Rejection signal:**  
If `loops/discovery-loop.sh` fails (script error or no codebase access): log error, skip discovery pass, still run ROI report.

## Memory

- `Setting["loops.deployedRoiMetrics"]` — this month's oracle values per deployed loop slug
- `Setting["loops.lastMetaDiscovery"]` — within-25-days guard
- `loops/REGISTRY.md` — updated with any status changes recommended by the ROI report

## Surface

- Dashboard `Notification` (end of month): "Monthly loop report: [N] green / [N] yellow / [N] red deployed loops + [N] new candidates discovered"
- New `loops/proposed/` spec files for Caleb to review and approve
- Future: `/agents` page could have a "Loop Health" tab showing ROI metrics per loop

---

## Safety Rails

- **Human chokepoint:** New loop specs are written with `[ ] Approved` (unchecked) — Caleb must approve them before they're built. ROI recommendations are informational — pausing a loop requires manual `Setting` update.
- **Blast radius:** Writes to `loops/proposed/` (spec files), `loops/REGISTRY.md`, `Setting`. No changes to application code, lead data, or agent behavior.
- **Rate limit / cap:** Once per month. Discovery pass bounded by codebase scan scope.
- **Idempotency:** `Setting["loops.lastMetaDiscovery"]` within-25-days guard.
- **Exit condition:** `Setting["loop.monthly_meta_discovery.disabled"] = "true"` to pause.

---

## Implementation Notes

- Create `src/app/api/agents/meta-discovery/route.ts`
- Add cron to `vercel.json`: `{ "path": "/api/agents/meta-discovery", "schedule": "0 5 28 * *" }` (11PM CT 28th = 5AM UTC next day)
- The ROI metrics per loop are defined in each loop's spec — this route must read the relevant spec to know what DB query to run for each deployed loop's oracle
- For inner loops (webhook-triggered): oracle is typically `ContactLog` inbound reply rate
- For outer loops (monitors): oracle is typically alert accuracy (were the things it flagged actually issues?)
- `loops/discovery-loop.sh` runs `claude` CLI — this route can invoke it via `execSync` or use the same logic inline
- This is the highest-level feedback loop in the system — it should be simple and cautious; complexity belongs in the inner loops
