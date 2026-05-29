# Google Calendar

**Status:** Implemented — scope gap blocks calendar data (see Gotchas)

**Purpose:** Fetch upcoming calendar events (showings, deadlines, closings) to power the `CalendarWidget` on the dashboard.

---

## Credentials needed

| Env var | What it is | Where to get it |
|---|---|---|
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID | console.cloud.google.com → Credentials → OAuth 2.0 Client IDs |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Client Secret | Same |

Tokens written automatically by the OAuth callback — do not set manually:
- `GOOGLE_ACCESS_TOKEN` → stored in `Setting` table
- `GOOGLE_REFRESH_TOKEN` → stored in `Setting` table
- `GOOGLE_TOKEN_EXPIRY` → stored in `Setting` table (Unix ms timestamp)

---

## API base URL

```
https://www.googleapis.com/calendar/v3
```

## Auth scheme

OAuth 2.0 access token (Bearer). Token is auto-refreshed using the stored refresh token when within 60 seconds of expiry. Refresh logic is in `src/lib/google-calendar.ts → getValidToken()`.

## Rate limits

- 1,000,000 queries per day (free tier is effectively unlimited for single-user use)
- No per-minute limit concerns at AIRE's scale

---

## Key endpoints used

| Method | Path | Purpose |
|---|---|---|
| GET | `/calendars/primary/events` | Fetch upcoming events from primary calendar |

AIRE route: `src/app/api/calendar/route.ts`

---

## Webhooks

Not implemented. Could use push notifications via `POST /calendars/{id}/events/watch` for real-time updates — future enhancement.

---

## Gotchas / quirks

### ⚠️ LIVE SCOPE GAP — Calendar will not work until this is fixed

`src/lib/google.ts` line 5 hardcodes:
```ts
const SCOPES = "https://www.googleapis.com/auth/contacts.readonly";
```

`src/lib/google-calendar.ts` defines `CALENDAR_SCOPE` correctly but it is **not included** in the OAuth redirect URL built by `getGoogleAuthUrl()`.

**Fix required:**
1. In `src/lib/google.ts`, change `SCOPES` to include both scopes:
   ```ts
   const SCOPES = [
     "https://www.googleapis.com/auth/contacts.readonly",
     "https://www.googleapis.com/auth/calendar.readonly",
   ].join(" ");
   ```
2. Users who already completed OAuth will need to **re-authorize** (the consent screen will show the new Calendar scope). The Settings page has a "Connect Google" button that re-runs the OAuth flow.

### Token stored in DB, not env
Unlike Lofty which reads from `process.env`, the Google token is stored in the `Setting` table and read via `prisma.setting.findUnique`. Restarting the server does **not** require re-auth.

### In-memory cache in settings.ts won't pick up token refresh
`getSetting()` has a permanent in-memory cache. Google token refresh writes directly to `prisma.setting` (bypassing the cache), so `getValidToken()` in `google-calendar.ts` reads Prisma directly rather than going through `getSetting()` — this is correct behavior.

---

## Doc links

- [Google Calendar API — Events list](https://developers.google.com/calendar/api/v3/reference/events/list)
- [Google OAuth 2.0 scopes](https://developers.google.com/identity/protocols/oauth2/scopes#calendar)

---

## Implementation notes

- Lib file: `src/lib/google-calendar.ts` (fully implemented)
- API route: `src/app/api/calendar/route.ts`
- Auth helpers: `src/lib/google.ts` (getGoogleAuthUrl, exchangeGoogleCode, refreshGoogleToken)
- Auth routes: `src/app/api/auth/google/route.ts` and `src/app/api/auth/google/callback/route.ts`

---

## Test command

```bash
# Returns [] if scope gap is present (no auth error — just empty array)
curl -s http://localhost:3000/api/calendar | jq .

# After scope fix + re-auth, should return events array
curl -s http://localhost:3000/api/calendar | jq '.[0]'
```
