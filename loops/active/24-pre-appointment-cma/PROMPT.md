# Implementation Prompt — Loop 24

Implement the pre-appointment CMA agent at src/app/api/agents/pre-appt-cma/route.ts.

1. Export dynamic = "force-dynamic"
2. Support GET and POST (cron auth)
3. Check GOOGLE_CLIENT_SECRET env — if missing, create Notification and return early
4. Import fetchUpcomingEvents from src/lib/google-calendar.ts
5. Filter events to those starting within next 8 hours
6. Query all leads and match by name appearing in event.title or event.description
7. For matched leads with lead.address: call buildCMASummary from src/lib/rentcast.ts
8. Create Task per match: title "Pre-appt CMA: [name]", priority "high", dueDate = event.start
9. Upsert today's DailyBrief marketMovement to include CMA entries
10. Create summarizing Notification
