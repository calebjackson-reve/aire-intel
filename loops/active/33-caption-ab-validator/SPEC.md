# Loop 33 — Caption A/B Validator

**Status:** [x] Approved  
**Type:** outer  
**Feeds:** content-optimizer (reads `content.validated.*` patterns)  
**Rank:** 33  
**Score:** 21 / 30

---

## Trigger

Cron: `0 2 * * 1` — Monday 9PM CT (2AM UTC Tuesday)

## Input

- `prisma.contentPreference.findMany()` — pattern records with ≥3 approvals+rejections
- `getPageInsights()` — Meta reach per post with caption
- Requires ≥3 qualifying ContentPreference records + ≥5 published posts

## Actions

1. Pull ContentPreference records with meaningful signal (≥3 ratings)
2. Pull IG posts with caption data from Meta
3. For each pattern: find posts whose caption contains the pattern value
4. Compute avg reach of matching posts vs. overall avg
5. Cross-reference: `approvalRate` (Caleb's taste) vs. `reachLift` (Meta algorithm)
6. If both ≥60% approval AND reach lift ≥0: write to `content.validated.{patternType}`
7. If discrepancy ≥30% (Caleb approves, Meta penalizes): create warning notification

## Oracle

**External source:** Meta `reach` correlated against `ContentPreference.approvalRate`  
_(Cross-signal: Caleb's curation + algorithm performance — neither alone is enough)_

**Acceptance threshold:** approvalRate ≥60% AND reachLift ≥0 for a pattern to be "validated"  
**Rejection signal:** discrepancy ≥30% → warning notification

## Quality Gate

**Output type:** n/a — oracle is correlation between human preference and Meta reach

## Memory

Settings written per validated pattern:
- `content.validated.{patternType}` — e.g. `content.validated.hookStyle = "fragment"`
- `content.abValidation.lastRun` — ISO timestamp for 6-day idempotency guard

## Surface

- Warning notification if taste/algorithm mismatch ≥30%: "You approve X patterns but they reduce reach by Y%"
- Success notification when patterns confirmed: "X patterns validated — your taste matches Meta"

---

## Safety Rails

- **Human chokepoint:** Notifications are informational — Caleb decides whether to adjust
- **Blast radius:** Only writes Settings and Notifications; no content modified
- **Rate limit:** Once per week max (6-day idempotency guard)
- **Idempotency:** `content.abValidation.lastRun` within-6-day guard
- **Exit condition:** Auto-skips if insufficient data (< 3 preferences or < 5 posts)

## Implementation Notes

- Route: `src/app/api/agents/caption-ab-validator/route.ts`
- `ContentPreference` model has: `patternType`, `value`, `approvalRate`, `approvals`, `rejections`
- Caption matching is substring search — rough but sufficient for pattern-level correlation
