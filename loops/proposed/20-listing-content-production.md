# Loop: Listing Content Production

**Status:** [x] Approved  _(2026-06-09)_
**Type:** inner  
**Feeds (if outer):** n/a  
**Rank:** 20  
**Score:** 24 / 30

---

## Trigger

Fires on two conditions (either triggers the loop):
1. **New Paragon listing ingested** — when `fetchListings()` returns a listing not yet in the platform's listing cache, or when a listing agent in Lofty is assigned to Caleb
2. **Daily 4:00 AM CT cron** fallback (inside content-scheduler) — checks for listings added in last 24h that don't yet have associated `ContentProject` records

## Input

- Paragon listing data: `mlsId`, `address`, `city`, `price`, `beds`, `baths`, `sqft`, `description`, `photoUrls[]`, `listingDate`, `propertyType`, `features[]`
- `ScheduledPost` — check if a post for this MLS ID already exists (prevent duplicates)
- `Setting["content.listingTemplate"]` — preferred carousel format (default: 5-slide: hero + 3 feature slides + CTA)
- `ContentProject` — check for existing project linked to this MLS ID

## Actions

1. Check for new listings from Paragon (or receive via webhook trigger if implemented)
2. For each new listing without an existing `ContentProject`:
   a. Generate a carousel content package via `/api/posts` route (internal call):
      - **Slide 1 (Hero):** Address + price + beds/baths — bold statement card
      - **Slides 2–4 (Features):** Top 3 property features as visual callouts (pull from `features[]` or parse `description`)
      - **Slide 5 (CTA):** "Book a showing" with contact info
   b. Generate Instagram caption via `generateDraft()`: neighborhood hook + price + 2-3 features + CTA + hashtags (Baton Rouge RE hashtags from TrendSignal or hardcoded set)
   c. Generate a Reel/Story hook line (1 sentence, < 125 chars, punchy)
   d. Create `ContentProject` record: `type = "listing_spotlight"`, `mlsId`, `status = "draft"`, link carousel spec + caption + reelHook
   e. Create `ActionQueue` item: `type = "post_content"`, `priority = 3`, `requiresApproval = true`
   f. Create `Notification`: "New listing content ready: [address] — review and approve"
3. Link the content to the listing agent or Caleb's MLS pipeline for quick access

## Oracle

**What external source of truth grades the output?**  
Human posts it or does not: `ScheduledPost.status = "published"` (human approved + posted) vs. `ActionQueue.status = "skipped"` (human rejected). Engagement rate on published listing content (from ContentPerformance) vs. baseline.

**Acceptance threshold:**  
≥ 60% of listing content drafts are approved and posted within 7 days of generation. Listing posts should achieve ≥ 3% engagement rate (vs. ~1.8% for market updates, based on ContentPerformance data).

**Rejection signal:**  
< 30% approval rate on listing content over 30 days → reduce auto-generation and flag for Caleb: "Listing content approval rate is low — review draft quality in /create-post."

## Memory

- `ContentProject.mlsId` — dedup guard: prevents generating duplicate content for the same listing
- `ActionQueue` — pending content items; check before creating a new one for the same MLS ID
- `Setting["content.listingTemplate"]` — configurable slide format
- `ContentPerformance` — tracks post-publish engagement for oracle measurement

## Surface

- `ActionQueue` item → visible in `/brief` content section
- Dashboard `Notification` (immediate) when new listing content is ready
- `/create-post` page — drafted carousel should be pre-populated in a new ContentProject

---

## Safety Rails

- **Human chokepoint:** All listing content requires approval. Never auto-posts listing content without explicit approval — listing price/details must be verified by Caleb before publication.
- **Blast radius:** Max 3 listing content packages per day. If Paragon returns 50 new listings, process only the 3 most recent for Caleb's assigned listings.
- **Rate limit / cap:** 1 ContentProject per MLS listing ID. Max 3/day.
- **Idempotency:** `ContentProject.mlsId` unique constraint check before creating. `ActionQueue` check for pending `post_content` with `payload.mlsId = <id>`.
- **Exit condition:** Listing `status = "sold"` or `"expired"` → skip. `Setting["loop.listing_content.disabled"] = "true"` to pause.

---

## Implementation Notes

- Add a new step in `src/app/api/agents/content-scheduler/route.ts` after the existing rotating content type logic — check for new listings and generate listing content if found
- `src/lib/paragon.ts → fetchListings()` — add a `assignedTo = "caleb"` or `agentId` filter if Paragon supports it; otherwise, filter listings that match Caleb's active corridors (stored in Setting or hardcoded as Baton Rouge ZIP codes)
- `ContentProject` model — needs `mlsId String?` field if not already present
- The carousel spec should follow the same format that `/api/posts` generates — consistent with existing post workflow
- Reel hook generation: use Claude Haiku with prompt: "Write one punchy Instagram Reel hook (< 125 chars) for this listing: [address, price, top feature]. Start with a number or a question."
