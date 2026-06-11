# Loop 25 — Handoff Notes

## Definition of Done
- [ ] Route at /api/agents/calendar-sync responds 200
- [ ] When Google not connected: Notification + {ok:true, skipped:"no_google"}
- [ ] Events upserted as Tasks with externalId and source fields
- [ ] Lead matching by email works
- [ ] Cancelled events mark task done

## Notes
- Task model does NOT have externalId/source fields in schema — store in description as JSON prefix
  OR use title prefix "[GCal]" and description for metadata
- Since schema lacks externalId: use a Setting key "gcal.task.{eventId}" = taskId for lookup
- Alternatively query tasks by title prefix "[GCal:{eventId}]"
- Use fetchUpcomingEvents from src/lib/google-calendar.ts
- Attendees are not in CalendarEvent interface — use description field for email matching
