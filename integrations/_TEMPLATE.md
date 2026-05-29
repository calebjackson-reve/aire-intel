# Integration Name

**Status:** Not Started | Credentials Pending | Implemented | Live

**Purpose:** One-line description of what this integration does for AIRE.

---

## Credentials needed

| Env var | What it is | Where to get it |
|---|---|---|
| `VAR_NAME` | Description | URL or UI path |

**Storage:** DB (via Settings page → saved to `Setting` table) — keys read by `getSetting()` in `src/lib/settings.ts`. Falls back to `.env` if DB row missing.

---

## API base URL

```
https://api.example.com/v1
```

## Auth scheme

Describe how credentials are sent (Bearer token, Basic auth, API key header, OAuth 2.0, etc.)

## Rate limits

- X requests per minute / hour / day
- Throttle strategy if applicable

---

## Key endpoints used

| Method | Path | Purpose |
|---|---|---|
| GET | `/endpoint` | What it fetches |
| POST | `/endpoint` | What it does |

---

## Webhooks

None — OR — describe event types, payload format, and the AIRE route that receives them.

---

## Gotchas / quirks

- Known edge cases, silent failures, undocumented behavior, token expiry behavior

---

## Doc links

- [Official API docs](https://example.com/docs)

---

## Implementation notes

- Where the lib file lives: `src/lib/example.ts`
- Where the API route lives: `src/app/api/example/route.ts`
- Settings config helper: `getExampleConfig()` in `src/lib/settings.ts`

---

## Test command

```bash
curl -s http://localhost:3000/api/example | jq .
```
