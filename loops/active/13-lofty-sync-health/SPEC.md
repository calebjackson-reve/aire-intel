# Loop: Lofty Sync Health Monitor

**Status:** [x] Approved  _(2026-06-09)_
**Type:** inner  
**Feeds (if outer):** n/a  
**Rank:** 13  
**Score:** 22 / 30

---

## Trigger

Daily cron at 5:30 AM CT (before Morning Brief assembly at 5:00 AM CT — slight schedule conflict, so either: run at 5:30 AM after brief assembles, or run at 2:00 AM CT before all other agents). Monitors Lofty OAuth token health and lead sync freshness.

## Input

- Lofty API: `GET /api/v1/leads?limit=1&sort=updatedAt:desc` — returns most recently updated lead; if response time > 3s or returns error, sync is unhealthy
- `Lead` table — `updatedAt` of the most recently synced lead (to compare against Lofty's version)
- `Setting["lofty.lastSyncAt"]` — timestamp of last successful sync
- `Setting["lofty.tokenStatus"]` — `healthy | expiring | expired`
- `ErrorLog` — recent Lofty errors (type = "lofty") in last 24h

## Actions

1. Test Lofty OAuth token via a lightweight API call (`GET /api/v1/leads?limit=1`)
2. **If 200 response:** Token healthy. Check sync freshness:
   - If `Setting["lofty.lastSyncAt"]` < 26h ago: Log warning "Lofty hasn't synced in 26+ hours"
   - Compare lead count from Lofty vs. local `Lead` table count — if diverges by > 5, flag for full resync
   - Update `Setting["lofty.tokenStatus"] = "healthy"`, `"lofty.lastSyncAt" = now`
3. **If 401 Unauthorized:** Token expired or invalid
   - Update `Setting["lofty.tokenStatus"] = "expired"`
   - Create critical `Notification`: "Lofty authentication expired — leads won't sync until reconnected"
   - SMS Caleb: "Lofty auth expired — open Settings to reconnect"
   - Log to `ErrorLog` (type = "lofty", source = "health-monitor")
4. **If 5xx or timeout:** API is down
   - Log to `ErrorLog` (type = "api_failure", source = "lofty")
   - Create warning `Notification`: "Lofty API appears down — check status.lofty.com"
   - If 3 consecutive failures in 24h: SMS alert
5. Update `Setting["lofty.apiResponseMs"]` with observed response time (for trend monitoring)

## Oracle

**What external source of truth grades the output?**  
Lofty API HTTP response code + response time. HTTP 200 with valid JSON = healthy. Lead count parity between Lofty and local DB.

**Acceptance threshold:**  
HTTP 200 within 3 seconds. `Lead` count matches Lofty within ±5. `Setting["lofty.lastSyncAt"]` within last 26 hours.

**Rejection signal:**  
HTTP 401 (auth expired) or 3 consecutive 5xx/timeouts in 24h. Lead count diverges by > 10.

## Memory

- `Setting["lofty.tokenStatus"]` — current auth state
- `Setting["lofty.lastSyncAt"]` — last successful sync timestamp
- `Setting["lofty.apiResponseMs"]` — rolling response time (last 7 values for trend)
- `ErrorLog` — error history with type = "lofty"

## Surface

- `/system` health page — Lofty sync status should be visible here (health score already incorporates ErrorLog patterns)
- Dashboard `Notification` for auth failures
- `/settings` page — Lofty OAuth section should reflect current token status from `Setting["lofty.tokenStatus"]`
- SMS for auth expiry and persistent API failures

---

## Safety Rails

- **Human chokepoint:** This loop only alerts — it never attempts to re-authenticate automatically (OAuth requires browser flow). Caleb must go to Settings → Lofty OAuth to reconnect.
- **Blast radius:** Read-only on Lead data. Writes only Setting updates, ErrorLog, Notification.
- **Rate limit / cap:** Once per day. Max 1 SMS per 24h per issue type (auth vs. API down).
- **Idempotency:** `Setting["lofty.lastHealthCheck"]` date guard. ErrorLog dedup: don't create a new error if an identical unresolved Lofty error exists within 6h.
- **Exit condition:** Never permanently exits. Can be paused via `Setting["loop.lofty_sync_health.disabled"]`.

---

## Implementation Notes

- Add a `checkLoftyHealth()` function to `src/lib/lofty.ts` — it should call the lightweight leads endpoint and return `{ status, responseMs, tokenValid }`
- Add as a step in `src/app/api/agents/morning-brief/route.ts` at the beginning (before assembly), or create its own route
- `/settings` page Lofty OAuth section — should display `Setting["lofty.tokenStatus"]` as a badge (healthy/expired)
- Note: The Lofty OAuth token is cached in memory (`src/lib/lofty.ts`) with auto-refresh — this loop validates the underlying credentials, not just the in-memory token cache
- The previous Lofty bug (sending raw `customer_key` as Bearer token) is fixed — this loop monitors the fix is still working
