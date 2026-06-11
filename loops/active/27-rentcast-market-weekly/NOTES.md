# Loop 27 — Handoff Notes

## Definition of Done
- [ ] Route at /api/agents/market-weekly responds 200
- [ ] Market stats fetched for all 4 ZIP codes
- [ ] DailyBrief updated with marketMovement entry
- [ ] ActionQueue post_content item created
- [ ] Notification created

## Notes
- Target ZIPs: 70808 (Garden District), 70809 (Jefferson Hwy), 70810 (Jones Creek), 70816 (Sherwood)
- getMarketStats takes a single ZIP — run 4 times with Promise.allSettled
- getMortgageRate returns {current, priorWeek, delta, asOf}
- DailyBrief.marketMovement is a Json field — it's an array, append new entry
- post_content payload should include formatted market summary string for social
- agentType for ActionQueue = "market_weekly"
