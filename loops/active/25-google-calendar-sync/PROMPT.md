# Implementation Prompt — Loop 25

Implement Google Calendar sync at src/app/api/agents/calendar-sync/route.ts.

1. Export dynamic = "force-dynamic"
2. Support GET and POST (cron auth)
3. Check GOOGLE_CLIENT_SECRET — if missing, create Notification and return early
4. Import fetchUpcomingEvents from src/lib/google-calendar.ts (7 days)
5. For each event: find existing Task where title starts with "[GCal:{eventId}]"
6. If not found: create Task with title "[GCal:{eventId}] {event.title}", source metadata in description
7. Match lead by checking if any lead.email appears in event.description
8. If cancelled (skip — our CalendarEvent interface filters these already)
9. Create Notification with count of new tasks synced
10. Return {ok:true, synced, updated, leads_matched}
