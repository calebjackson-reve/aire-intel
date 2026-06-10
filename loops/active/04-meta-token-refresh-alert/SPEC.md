# Loop: Meta Token Refresh Alert

**Status:** [x] Approved  _(2026-06-09)_
**Type:** inner  
**Feeds (if outer):** n/a  
**Rank:** 04  
**Score:** 28 / 30

---

## Trigger

Daily cron at 3:00 AM CT (can piggyback inside Market Intelligence Agent or run as its own lightweight cron). Fires every day; the loop itself checks expiry windows and only alerts when action is needed.

## Input

- `META_PAGE_ACCESS_TOKEN` from environment — the current token in use
- Meta Graph API: `GET /me?fields=id,name&access_token={token}` — returns 200 + user info if valid, 190 error if expired
- Meta Graph API: `GET /debug_token?input_token={token}&access_token={app_token}` — returns `data.expires_at` (Unix timestamp) if using a long-lived token
- `Setting` table — `key = "meta.token.lastChecked"`, `"meta.token.expiresAt"`, `"meta.token.status"`

## Actions

1. Call Meta debug_token endpoint to get `expires_at` for current `META_PAGE_ACCESS_TOKEN`
2. Calculate days until expiry
3. **If expires in > 14 days:** Update `Setting["meta.token.status"] = "healthy"`, update `lastChecked`. No alert.
4. **If expires in 8–14 days:** Create `Notification` type `"warning"`: "Meta token expires in N days — refresh before [date]." Write to `DailyBrief.nonNegotiables`.
5. **If expires in < 7 days:** SMS Caleb immediately + high-priority `Notification` + mark in `DailyBrief.nonNegotiables` as urgent.
6. **If already expired (API returns error 190):** SMS Caleb immediately, pause all Meta-dependent agent actions (set `Setting["agent.content_scheduler.paused"] = "true"`), create `ErrorLog` entry.
7. On any state change, update `Setting["meta.token.expiresAt"]` + `"meta.token.lastChecked"`.

## Oracle

**What external source of truth grades the output?**  
Meta Graph API response: `GET /me` returns 200 with valid user data = token healthy. Error code 190 = expired. `debug_token.data.expires_at` > now() = not expired.

**Acceptance threshold:**  
Token never reaches 0 days remaining without Caleb having received an alert at the 14-day and 7-day windows.

**Rejection signal:**  
Two consecutive days where `debug_token` API call itself fails with a non-190 error (network issue, API outage) → log to `ErrorLog`, do not spam alerts.

## Memory

- `Setting["meta.token.expiresAt"]` — cached expiry date, avoids calling Meta API every time
- `Setting["meta.token.lastChecked"]` — ensures we don't call more than once per day
- `Setting["meta.token.status"]` — `healthy | warning | critical | expired`
- `Setting["agent.content_scheduler.paused"]` — flip to `"true"` when token expired

## Surface

- Dashboard `Notification` (warning or critical level)
- `DailyBrief.nonNegotiables` section — appears in morning brief when within 14-day window
- SMS via Twilio when < 7 days or expired (urgent only)
- `/settings` page — token status badge should reflect current Setting value

---

## Safety Rails

- **Human chokepoint:** All token refresh actions are manual — the loop only alerts, never attempts to refresh automatically (OAuth refresh requires Caleb's browser session).
- **Blast radius:** If token expires and content scheduler is paused, all queued posts remain in `ActionQueue` as `pending` — nothing is lost. They execute after token is refreshed.
- **Rate limit / cap:** Max 1 API call to Meta debug_token per day (cached in Setting). Max 1 SMS per 24h regardless of repeated runs.
- **Idempotency:** `Setting["meta.token.lastChecked"]` date guards against duplicate checks. SMS dedup: check `Setting["meta.token.lastSmsSent"]` before sending.
- **Exit condition:** Never permanently exits — this is an always-on health monitor. Can be paused via `Setting["loop.meta_token_alert.disabled"] = "true"`.

---

## Implementation Notes

- Can run as a sub-step inside `src/app/api/agents/market-intel/route.ts` (already runs at 3AM CT) — add a `checkMetaTokenHealth()` call at the start
- Or create `src/app/api/agents/meta-token-check/route.ts` as its own lightweight route with a cron entry
- Meta debug_token endpoint requires an app access token (`{APP_ID}|{APP_SECRET}`) — derive from existing `META_APP_ID` + `META_APP_SECRET` env vars
- `src/lib/meta.ts` — add `checkTokenExpiry()` function that calls debug_token and returns `{ expiresAt, daysRemaining, isExpired }`
- Long-lived user/page tokens from Meta expire in 60 days from issuance; system tokens (from Business Manager) can be non-expiring — handle both cases
