# Loop 28 — Handoff Notes

## Definition of Done
- [ ] Route at /api/agents/zillow-content responds 200
- [ ] Listings fetched and upserted to ZillowHotListing
- [ ] Top 2 unused listings create post_content ActionQueue items
- [ ] DailyBrief.contentQueued updated
- [ ] Notification created

## Notes
- fetchViralListings already dedupes by zpid internally
- After fetching, filter stored listings by usedInPostId IS NULL
- Sort by viral score (viewCount + saveCount*3) descending
- Take top 2 from unused listings
- ActionQueue payload should include: zpid, address, city, price, beds, baths, listingUrl, photoUrl, viralScore
- DailyBrief.contentQueued is a Json array — append new entries
- agentType = "zillow_content"
