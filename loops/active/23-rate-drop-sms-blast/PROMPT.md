# Implementation Prompt — Loop 23

Implement the rate-drop SMS blast agent at src/app/api/agents/rate-drop-blast/route.ts.

1. Export `dynamic = "force-dynamic"`
2. Support GET (manual trigger) and POST (cron via verifyCronSecret)
3. Use getMortgageRate() from src/lib/housing-intel.ts to get current + prior week rate
4. If delta > -0.125: return {ok:true, triggered:false, delta, rate}
5. Check idempotency: getSetting("rate_alert.last_blast_date") — if today, skip
6. Query leads: stage IN [active,new_lead], phone IS NOT NULL, lastContactDate < 14 days ago, limit 50
7. For each lead: create ActionQueue {type:"follow_up_text", requiresApproval:true, priority:1}
8. Write Setting rate_alert.last_blast_date = today
9. Create Notification with count of leads queued
10. Return {ok:true, triggered:true, delta, rate, leadsQueued: N}
