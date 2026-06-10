# Implement Loop: Listing Content Production

**Spec:** `loops/proposed/20-listing-content-production.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:listing-content-production`
- getSetting / withRetry / logError from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on route

## What to Build

### 1. Check ContentProject model — `prisma/schema.prisma`
Read the schema. Verify `ContentProject` has `mlsId String?` field. If missing, add it:
```prisma
// AIRE: loop:listing-content-production
mlsId String?
```
Note migration needed if added.

### 2. Extend content-scheduler — `src/app/api/agents/content-scheduler/route.ts` (MODIFY)
Add a listing content pass after the existing rotating content type logic:
```typescript
// AIRE: loop:listing-content-production
// Listing content production — check for new listings without content
const maxListingPosts = parseInt(await getSetting('listing_content.max_per_day', '3'));
const recentListings = await fetchListingsFromParagon(); // use src/lib/paragon.ts fetchListings()

let listingPostCount = 0;
for (const listing of recentListings.slice(0, maxListingPosts)) {
  // Check for existing ContentProject with this mlsId
  const existing = await prisma.contentProject.findFirst({ where: { mlsId: listing.mlsId } });
  if (existing) continue;
  
  // Check ActionQueue for existing post for this listing
  const existingAction = await prisma.actionQueue.findFirst({
    where: { type: 'post_content', status: 'pending', payload: { path: ['mlsId'], equals: listing.mlsId } }
  });
  if (existingAction) continue;
  
  // Generate carousel + caption via existing posts API or generateDraft
  // Create ContentProject record
  // Create ActionQueue item: type='post_content', priority=3, requiresApproval=true
  // Create Notification
  listingPostCount++;
}
```

## Oracle Gates
```
npx tsc --noEmit
npm run build
```

Paragon JSON path filtering (`payload: { path: ['mlsId'], equals: ... }`) works with SQLite JSON fields — verify the `payload` field type on ActionQueue is Json before using this syntax; if not, use `String(payload).includes(listing.mlsId)` as fallback.

## Done When
- `ContentProject` has `mlsId` field (or note migration needed)
- content-scheduler has listing content pass
- TypeScript and build pass
