# Loop Iteration Prompt — listing-content-production

You are running one iteration of the `listing-content-production` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read:
1. `loops/active/20-listing-content-production/SPEC.md`
2. `loops/active/20-listing-content-production/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/20-listing-content-production/`

## What this loop builds

Extend the content-scheduler agent: after the existing rotating content logic, add a pass that checks for new Paragon listings without a ContentProject. For each new listing (max 3/day), generates a carousel + caption + reel hook and creates an ActionQueue post_content item.

## Implementation units

**Unit A — schema inspection**
- Read `prisma/schema.prisma` — find ContentProject model
- Check if it has `mlsId String?` field
- If missing: add `mlsId String?` to ContentProject model and note that `npx prisma migrate dev` is needed (do NOT run it — the loop.sh oracle will catch typecheck issues)

**Unit B — listing content pass in content-scheduler**
- Read `src/app/api/agents/content-scheduler/route.ts`
- After the existing rotating content logic (find the section that creates ContentProject for the day's type), add:
  - Get today's cap: `const maxListingPosts = parseInt(getSetting("content.maxListingPostsPerDay", "3"))`
  - Query ContentProject count for today where `mlsId IS NOT NULL` — skip if already at cap
  - Call `paragon.fetchListings({ status: "active", limit: 10 })` to get recent listings
  - For each listing: check if ContentProject exists with same `mlsId` already
  - For new listings (no ContentProject), up to remaining daily cap:
    - Generate content draft (call `/api/posts` with listing context, or inline the generation)
    - Create ContentProject: `{ mlsId: listing.mlsId, contentType: "listing_spotlight", status: "draft" }`
    - Create ActionQueue: `type: "post_content"`, `payload: { contentProjectId, mlsId, address }`, `requiresApproval: true`, priority 3
  - Mark all new code `// AIRE: loop:listing-content-production`

**Unit C — verify idempotency**
- The dedup check (ContentProject.mlsId) must prevent duplicate posts for same listing
- Verify the WHERE clause in Unit B correctly handles this

## AIRE conventions (mandatory)

- `// AIRE: loop:listing-content-production`; `withRetry()` for Paragon calls, `logError()`

## Oracle

```bash
npx tsc --noEmit && npm run build
```

## After your unit

Oracle → commit → update NOTES.md → status block.
