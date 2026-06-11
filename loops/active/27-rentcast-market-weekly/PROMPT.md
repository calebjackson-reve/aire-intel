# Implementation Prompt — Loop 27

Implement weekly market brief at src/app/api/agents/market-weekly/route.ts.

1. Export dynamic = "force-dynamic"
2. Support GET and POST (cron auth)
3. Check RENTCAST_API_KEY — if missing, create Notification warning and return early
4. Call getMarketStats for ["70808","70809","70810","70816"] with Promise.allSettled
5. Call getMortgageRate from src/lib/housing-intel.ts
6. Build market summary: median price, DOM, total listings, mortgage rate per ZIP
7. Upsert DailyBrief for today — push market entry to marketMovement array
8. Check idempotency: skip ActionQueue if agentType="market_weekly" + today + post_content exists
9. Create ActionQueue {type:"post_content", agentType:"market_weekly", requiresApproval:true, priority:3}
10. Create Notification: "Weekly Baton Rouge market brief ready"
11. Return {ok:true, zipsProcessed, mortgageRate, actionsQueued}
