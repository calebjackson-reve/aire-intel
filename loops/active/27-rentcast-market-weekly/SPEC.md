# Loop 27 — Rentcast Market Weekly

## Trigger
Cron: `0 10 * * 1` (Monday 10 AM UTC)
Route: `GET /api/agents/market-weekly`

## Input
- Rentcast market stats for ZIP codes: 70808, 70809, 70810, 70816
- Mortgage rate from FRED via housing-intel.ts

## Actions
1. Call getMarketStats from src/lib/rentcast.ts for each of the 4 ZIP codes
2. Call getMortgageRate from src/lib/housing-intel.ts
3. Aggregate stats into a market summary object
4. Create/upsert DailyBrief for today, append to marketMovement
5. Create ActionQueue post_content item with market data for social post
6. Create Notification: "Weekly market brief ready"

## Oracle
- DailyBrief.marketMovement contains this week's market data
- ActionQueue post_content item queued for Caleb's approval
- Notification created

## Safety Rails
- Idempotency: check if post_content item already created today for agentType="market_weekly"
- Rentcast errors per-ZIP are caught; partial data is OK
- RENTCAST_API_KEY required — if missing, create warning Notification
