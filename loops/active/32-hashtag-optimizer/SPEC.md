# Loop 32 — Hashtag Optimizer

**Status:** [x] Approved  
**Type:** outer  
**Feeds:** content-gate (reads `content.hashtags.remove` to penalize low-reach tags during scoring)  
**Rank:** 32  
**Score:** 22 / 30

---

## Trigger

Cron: `0 3 1,15 * *` — 1st and 15th of month, 10PM CT (3AM UTC)

## Input

- `getPageInsights()` from `src/lib/meta-insights.ts`
- Filters: platform = "instagram", `caption` populated
- Requires ≥10 IG posts total; ≥3 uses per hashtag for statistical signal

## Actions

1. Pull all IG posts with caption data
2. Extract `#hashtags` from each caption via regex `/#\w+/g`
3. For each unique hashtag: calculate avg reach of posts containing it vs. overall avg
4. Compute reach lift % per hashtag
5. Tier by lift: tier_1 ≥20%, tier_2 neutral (-5% to +20%), tier_3 <-5%
6. Write tiers to Settings (JSON arrays)
7. Create Notification with top and bottom performers

## Oracle

**External source:** Meta `reach` per post — real number from Graph API  
_(Not AI-graded — organic reach signal)_

**Acceptance threshold:** ≥3 uses per hashtag + ≥10 posts total  
**Rejection signal:** Insufficient data → `{ skipped: true }`

## Quality Gate

**Output type:** n/a — oracle is Meta reach data, not AI-generated text  
_However, `content-gate.ts` reads `content.hashtags.remove` and passes to `scorePost()` as `bannedHashtags` — each banned tag deducts 5 pts from post score._

## Memory

Settings written:
- `content.hashtags.tier1` — JSON array, high-reach hashtags (≥20% lift)
- `content.hashtags.tier2` — JSON array, neutral hashtags
- `content.hashtags.remove` — JSON array, negative-reach hashtags (used by scorePost)
- `content.hashtags.lastRun` — ISO timestamp for idempotency

## Surface

- Notification: "Hashtag Oracle: #batonrougerealestate lifts reach 34%. Remove: #realestate (−12%)"
- `scorePost()` in `content-quality.ts` deducts 5 pts per banned hashtag (via `bannedHashtags` param)

---

## Safety Rails

- **Human chokepoint:** Caleb reviews generated captions before publishing
- **Blast radius:** Only writes Settings; no posts deleted or modified
- **Rate limit:** Twice per month max (13-day idempotency guard)
- **Idempotency:** `content.hashtags.lastRun` within-13-day guard
- **Exit condition:** Auto-skips if < 10 posts or < 3 qualified hashtags

## Implementation Notes

- Route: `src/app/api/agents/hashtag-optimizer/route.ts`
- `scorePost()` updated to accept `bannedHashtags?: string[]` optional param
- `generateUntilPasses()` in `content-gate.ts` reads `content.hashtags.remove` and passes through
