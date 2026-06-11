# Loop 24 — Pre-Appointment CMA

## Trigger
Cron: `0 11 * * *` (daily at 11 AM UTC)
Route: `GET /api/agents/pre-appt-cma`

## Input
- Google Calendar events for next 8 hours
- Lead names matched from event summary/description
- Lead address field for CMA input

## Actions
1. Check if GOOGLE_CLIENT_SECRET is set — if not, log and return Notification
2. Fetch calendar events for next 8h via Google Calendar REST API
3. Match event titles/descriptions against lead names in DB
4. For matched leads with address: call buildCMASummary from src/lib/rentcast.ts
5. Create BriefItem (marketMovement append) with CMA data
6. Create Task per appointment: "Pre-appt CMA for [Lead Name] at [address]"
7. Create Notification: "CMA ready for N appointment(s) today"

## Oracle
- Each matched appointment with an address gets a CMA task
- Unmatched events are skipped silently
- No Google connection → Notification with setup link

## Safety Rails
- Graceful: if googleapis unavailable return early with Notification
- Skip leads with no address (no CMA possible)
- Max 10 events processed per run
- CMA errors are caught per-lead; one failure doesn't abort others
