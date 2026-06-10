# Loop: listing-alert-buyer-match — Handoff Notes

## Spec Summary
Add a buyer match pass inside the market-intel agent: for each Paragon listing, cross-reference active BuyerSearch records and enqueue a showing-request draft for each match.

## Definition of Done (from SPEC.md)
- `src/lib/buyer-matcher.ts` exists and exports `matchListingToBuyers(listing)`
- market-intel agent has buyer match pass after Paragon fetch (max 5 alerts/run)
- Dedup via ContactLog (7-day) and ActionQueue (same leadId+mlsId+date)
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Read BuyerSearch model in prisma/schema.prisma. Verify fields (areas, minPrice, maxPrice, minBeds, minBaths). Create src/lib/buyer-matcher.ts.
