# Loop Iteration Prompt — listing-alert-buyer-match

You are running one iteration of the `listing-alert-buyer-match` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read these three files before doing anything else:
1. `loops/active/02-listing-alert-buyer-match/SPEC.md`
2. `loops/active/02-listing-alert-buyer-match/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/02-listing-alert-buyer-match/`

## What this loop builds

A buyer match pass inside the market-intel agent. For each new Paragon listing, cross-references active BuyerSearch records and enqueues a showing-request draft for each match (max 5 alerts/run).

## Implementation units

**Unit A — buyer-matcher.ts**
- Read `prisma/schema.prisma` — find the BuyerSearch model and its fields (areas, minPrice, maxPrice, minBeds, minBaths)
- Create `src/lib/buyer-matcher.ts` exporting `matchListingToBuyers(listing: ParagonListing): Promise<BuyerSearch[]>`
- Query BuyerSearch records where: status = "active", listing.price within [minPrice, maxPrice], listing.beds >= minBeds (if set), listing.area intersects areas
- Return matched buyers, sorted by score (closer to center of criteria = higher score)
- Mark all code `// AIRE: loop:listing-alert-buyer-match`

**Unit B — market-intel agent integration**
- Read `src/app/api/agents/market-intel/route.ts`
- After the Paragon fetch loop, add buyer match pass
- For each new/price-changed listing, call `matchListingToBuyers(listing)`
- For each match (cap at 5 total alerts per run):
  - Check dedup: skip if ActionQueue has item for same leadId+mlsId in last 7 days
  - Check dedup: skip if ContactLog has outbound contact for same lead in last 24h
  - Create ActionQueue: `type: "draft_message"`, payload: `{leadId, mlsId, listingAddress, matchReason}`, `requiresApproval: true`, priority 3
- Use `getSetting("buyer_match.maxAlertsPerRun", "5")` for cap

**Unit C — dedup and idempotency**
- Verify both ContactLog and ActionQueue dedup checks are in place
- Add a check for Setting["buyermatch.lastRunDate"] — skip if already ran today

## AIRE conventions (mandatory)

- Additive only — no removal of existing logic
- `// AIRE: loop:listing-alert-buyer-match` on all new code
- `getSetting()` for thresholds, `withRetry()` for Paragon API calls, `logError()` on catches
- Import prisma from `src/lib/prisma.ts`

## Oracle

```bash
npx tsc --noEmit && npm run build
```

Both must exit 0. Never commit red.

## After your unit

1. Oracle passes → git add specific files → commit `loops(listing-alert-buyer-match): <what>`
2. Update NOTES.md with iteration entry
3. End with status block:

```
STATUS: COMPLETE
EXIT_SIGNAL: true
```
if all Done When conditions met, otherwise `IN_PROGRESS / false` or `BLOCKED / false`.
