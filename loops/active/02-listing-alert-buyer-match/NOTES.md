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

### Iteration 1 — Units A+B+C complete (2026-06-09)
**Done:**
- Unit A: `src/lib/buyer-matcher.ts` — `matchListingToBuyers(listing)` queries active BuyerSearch records (schema uses `active: Boolean`, `priceMin/priceMax`, `bedsMin/bathsMin`), filters all criteria with ±10% price tolerance, sorts by score (criteria count + price centrality).
- Unit B: market-intel agent (`src/app/api/agents/market-intel/route.ts`) — step 5 added after Zillow pass; fetches Paragon listings, runs match pass, caps at maxAlerts (default 5), creates `ActionQueue` items with `type: "draft_message"`, `requiresApproval: true`, payload includes `leadId/mlsId/listingAddress/matchReason/draftBody`.
- Unit C: dedup via ActionQueue (leadId+mlsId+7-day window, JS-side JSON check for SQLite compat) + ContactLog (outbound+24h); idempotency via `buyermatch.lastRunDate` Setting upserted after each run.
- Oracle: `npx tsc --noEmit` + `npm run build` both exit 0.
**Commit:** d1ea147

### Iteration 2 — verification pass (2026-06-10)
**Done:**
- Confirmed `src/lib/buyer-matcher.ts` exists and exports `matchListingToBuyers()` with scoring, ±10% price tolerance, area/beds/baths/propertyType filtering, and closed lead skip.
- Confirmed market-intel agent step 5 has full buyer match pass, dedup via ContactLog (24h) + ActionQueue (7-day JSON check), `buyermatch.lastRunDate` idempotency guard, and `getSetting("buyer_match.maxAlertsPerRun")` cap.
- Oracle: `npx tsc --noEmit` ✓ and `npm run build` ✓ both exit 0.
- All Definition of Done conditions satisfied — loop marked complete.
