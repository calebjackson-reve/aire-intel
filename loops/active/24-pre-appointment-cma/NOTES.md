# Loop 24 — Handoff Notes

## Definition of Done
- [ ] Route at /api/agents/pre-appt-cma responds 200
- [ ] When Google not connected: Notification created, returns {ok:true, skipped:"no_google"}
- [ ] Events matched to leads by name substring search
- [ ] CMA task created for matched leads with address
- [ ] DailyBrief marketMovement updated with CMA summaries

## Notes
- Use fetchUpcomingEvents(hours=0.333) — actually fetch next 8h worth
  or filter events where start is within Date.now() + 8*3600*1000
- Match by checking if lead.name appears in event.title or event.description
- Use google-calendar.ts lib (already handles token refresh)
- Don't use googleapis npm package — use the REST API via google-calendar.ts
- buildCMASummary is async — run per-lead with Promise.allSettled
- BriefItem equivalent: append to DailyBrief.marketMovement JSON array
