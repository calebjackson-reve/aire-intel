# Implementation Prompt — Loop 28

Implement Zillow content brief at src/app/api/agents/zillow-content/route.ts.

1. Export dynamic = "force-dynamic"
2. Support GET and POST (cron auth)
3. Check ZILLOW_RAPIDAPI_KEY — if missing, create Notification and return early
4. Call fetchViralListings(5) from src/lib/zillow.ts
5. Upsert each into ZillowHotListing (same pattern as market-intel route)
6. Query ZillowHotListing where usedInPostId IS NULL, order by (viewCount + saveCount*3) desc, take 2
7. Check idempotency: skip if ActionQueue already has post_content from agentType="zillow_content" today
8. Create ActionQueue post_content for each of the 2 listings
9. Upsert DailyBrief.contentQueued with content_flywheel entries
10. Create Notification with count
11. Return {ok:true, listingsFetched, newPostsQueued}
