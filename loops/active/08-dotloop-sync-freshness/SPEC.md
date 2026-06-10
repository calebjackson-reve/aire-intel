# Loop: Dotloop Sync Freshness Monitor

**Status:** [x] Approved  _(2026-06-09)_
**Type:** inner  
**Feeds (if outer):** n/a  
**Rank:** 08  
**Score:** 25 / 30

---

## Trigger

Daily cron at 6:00 AM CT (can run as part of Transaction Watchdog or as its own step). Checks that Dotloop data is fresh and alerts if any active transaction loop has stale data.

## Input

- `DotloopLoop` — all records with `status != "closed"`: `id`, `loopId`, `name`, `status`, `updatedAt` (last sync timestamp), `closingDate`, `leadId`
- Dotloop API: `GET /api/me/loops/{loopId}` — returns current loop status, last activity, document list
- `Setting["dotloop.lastFullSync"]` — timestamp of last successful full sync
- `ErrorLog` — recent Dotloop-related errors (type = "dotloop")

## Actions

1. Pull all `DotloopLoop` records with `status != "closed"`
2. For each active loop:
   - Check `updatedAt` — if > 24h old, call Dotloop API to get fresh loop data
   - Compare returned `status` + `lastActivity` to stored values
   - If changes detected: update `DotloopLoop` fields, create `ContactLog` entry for the linked lead
3. Calculate staleness score: (loops with `updatedAt` > 24h) / total active loops
4. **If staleness > 25%:** Create `Notification` warning + write to `DailyBrief.nonNegotiables`
5. **If any loop's `closingDate` is within 48h AND `updatedAt` > 12h:** SMS Caleb immediately ("Closing tomorrow — Dotloop hasn't synced in [N] hours for [loop name]")
6. **If Dotloop API returns auth error (401):** Log to `ErrorLog`, SMS Caleb: "Dotloop authentication expired — reconnect in Settings"
7. Update `Setting["dotloop.lastFullSync"]` on successful run

## Oracle

**What external source of truth grades the output?**  
Dotloop API: `GET /api/me/loops/{loopId}` returns `lastActivity` timestamp that is more recent than `DotloopLoop.updatedAt`. HTTP 200 = connection healthy.

**Acceptance threshold:**  
All active transaction loops have `updatedAt` within the last 24h. Zero auth errors from Dotloop API.

**Rejection signal:**  
Dotloop API returns 401 (auth expired) or 429 (rate limited with persistent failures). Any active loop with `closingDate` within 48h has `updatedAt` > 12h.

## Memory

- `DotloopLoop.updatedAt` — updated on each successful sync
- `Setting["dotloop.lastFullSync"]` — timestamp of last run
- `Setting["dotloop.authStatus"]` — `healthy | expired | unknown`
- `ErrorLog` — Dotloop API errors with type = "dotloop"

## Surface

- `DailyBrief.nonNegotiables` — stale loops appear here
- Dashboard `Notification` (warning level)
- SMS for closing-day urgency only
- `/pipeline` page — Dotloop-linked cards could show a staleness badge if `updatedAt` > 24h

---

## Safety Rails

- **Human chokepoint:** This loop only alerts and syncs data — it never modifies Dotloop records directly. All Dotloop writes go through the existing `src/lib/dotloop.ts` client, which requires Caleb's Dotloop credentials.
- **Blast radius:** Read-mostly. Writes only to `DotloopLoop.updatedAt` + `ContactLog` on status changes. No lead stage changes.
- **Rate limit / cap:** Max 1 full API poll per active loop per 12h. Batches API calls to respect Dotloop rate limits (max 5 req/sec).
- **Idempotency:** `DotloopLoop.updatedAt` check — only call API if record is > 12h stale (during closing window) or > 24h stale (normal).
- **Exit condition:** `DotloopLoop.status = "closed"` — remove from monitoring set. `Setting["loop.dotloop_freshness.disabled"] = "true"` — pause entirely.

---

## Implementation Notes

- Currently no cron for Dotloop sync in `vercel.json` — need to add
- Add as a step inside `src/app/api/agents/transaction-watchdog/route.ts` OR create `src/app/api/agents/dotloop-sync/route.ts`
- `src/lib/dotloop.ts` already has API client — extend with `getLoopDetails(loopId)` if not present
- `DotloopLoop` model — verify `updatedAt` field exists; add if not (it should be auto-managed by Prisma `@updatedAt`)
- Dotloop webhook at `/api/dotloop/webhook` already exists — if it's receiving events, the `updatedAt` should stay fresh automatically; this loop is a fallback for when webhooks miss
