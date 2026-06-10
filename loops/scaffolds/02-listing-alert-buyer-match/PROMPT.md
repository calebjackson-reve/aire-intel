# Implement Loop: Listing Alert → Buyer Match

**Spec:** `loops/proposed/02-listing-alert-buyer-match.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:listing-alert-buyer-match`
- getSetting / withRetry / logError from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on cron routes

## What to Build

### 1. Buyer match helper — `src/lib/buyer-matcher.ts` (NEW)
```typescript
export interface ListingCandidate { mlsId: string; address: string; price: number; beds: number; baths: number; zipCode: string; propertyType: string; }
export interface MatchedBuyer { buyerSearchId: string; leadId: string; matchScore: number; }
export async function matchListingToBuyers(listing: ListingCandidate): Promise<MatchedBuyer[]>
```
Implementation: query all active BuyerSearch records, check each against listing criteria (price ±10%, area string match, beds/baths ≥ minimum, propertyType match). Return matches sorted by score descending.

### 2. Extend market-intel agent — `src/app/api/agents/market-intel/route.ts` (MODIFY)
After the existing market intelligence logic, add a buyer match pass:
1. Get today's listings from Paragon (already fetched in that route)
2. For each listing, call `matchListingToBuyers(listing)`
3. For each match:
   - Check ContactLog: skip if this listing was surfaced to this lead in last 7 days
   - Check ActionQueue: skip if pending item with same leadId + same mlsId in payload
   - Call `generateDraft()` from `src/lib/draft-agent.ts` with template showing-request context
   - Create ActionQueue item: type = "send_client_email", priority = 3, requiresApproval = true, payload includes mlsId for dedup
4. Cap at 5 total buyer alerts per run (getSetting "buyer_match.max_per_run", default "5")
5. Write matched count to DailyBrief.marketMovement section

## Oracle Gates
```
npx tsc --noEmit
npm run build
```
Both must pass. Check that BuyerSearch model has the fields used (areas, minPrice, maxPrice, minBeds, minBaths). If fields are missing from the schema, add them and note a migration is needed (add `// AIRE: TODO migration needed` comment).

## Done When
- `src/lib/buyer-matcher.ts` exists with `matchListingToBuyers()` export
- market-intel agent has buyer match pass after Paragon fetch
- Cap of 5 alerts per run enforced via getSetting
- TypeScript and build pass
