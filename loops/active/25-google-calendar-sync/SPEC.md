# Loop 25 — Google Calendar Sync

## Trigger
Cron: `0 */2 * * *` (every 2 hours)
Route: `GET /api/agents/calendar-sync`

## Input
- Google Calendar events (7-day window)
- Existing Task records with source="google_calendar"

## Actions
1. Graceful googleapis check (GOOGLE_CLIENT_SECRET required)
2. Fetch upcoming events (7 days) via google-calendar.ts
3. Upsert Task records keyed on externalId = google event id, source = "google_calendar"
4. Match attendee emails to Lead.email — link leadId if found
5. Mark tasks as done if corresponding calendar event is cancelled/deleted
6. Create Notification if new events were synced

## Oracle
- Each Google calendar event has a corresponding Task record
- Task.externalId = google event id
- Task.source = "google_calendar"
- Cancelled events → task.done = true

## Safety Rails
- Graceful: no Google connection → Notification + early return
- Upsert not insert (idempotent)
- Max 50 events per sync window
- Never delete leads or tasks — only update/mark done
