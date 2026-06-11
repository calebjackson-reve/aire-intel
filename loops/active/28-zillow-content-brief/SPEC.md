# Loop 28 — Zillow Content Brief

## Trigger
Cron: `0 9 * * 2,5` (Tuesday and Friday 9 AM UTC)
Route: `GET /api/agents/zillow-content`

## Input
- fetchViralListings from src/lib/zillow.ts (top 5 listings)
- ZillowHotListing table (dedup)
- DailyBrief for today

## Actions
1. Fetch top viral listings via fetchViralListings(5)
2. Upsert all into ZillowHotListing table
3. Identify listings NOT previously used in a post (usedInPostId IS NULL)
4. Create ActionQueue post_content items for top 2 new listings
5. Append BriefItem type="content_flywheel" to DailyBrief.contentQueued
6. Create Notification: "Zillow content brief: N new listings queued"

## Oracle
- Top 2 unused viral listings become post_content ActionQueue items
- DailyBrief.contentQueued updated
- ZillowHotListing table kept current

## Safety Rails
- Dedup: only listings with usedInPostId IS NULL qualify
- Max 2 post_content items per run
- Idempotency: if post_content items for today already exist from "zillow_content" agentType, skip
- ZILLOW_RAPIDAPI_KEY required — if missing, create Notification warning
