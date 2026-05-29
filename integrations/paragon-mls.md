# Paragon MLS

**Status:** Credentials Pending (falls back to demo listings without credentials)

**Purpose:** Fetch live MLS listings from your board's Paragon system for the Hot Listings drawer, Buyers auto-match, and `/mls` page.

---

## Credentials needed

| Env var | What it is | Where to get it |
|---|---|---|
| `PARAGON_API_URL` | Your MLS board's Paragon API base URL | Contact your MLS board's tech support — format is typically `https://api.paragonrels.com/v1` or similar. Each board has its own subdomain. |
| `PARAGON_API_KEY` | API key from your board | Same — board issues this, often via their developer/API portal |

**Storage:** DB via Settings page → `Setting` table. Config helper: `getParagonConfig()` in `src/lib/settings.ts`.

---

## API base URL

```
Varies by MLS board — your board's Paragon API URL (PARAGON_API_URL env var)
```

## Auth scheme

API key sent as `Authorization: Bearer <PARAGON_API_KEY>` header. Exact scheme varies by board — some use `X-Api-Key` header instead. Confirm with your board.

## Rate limits

- Typically 60–300 requests/minute depending on board agreement
- Paragon does not publish a universal rate limit — check your board's API docs

---

## Key endpoints used

| Method | Path | Purpose |
|---|---|---|
| GET | `/listings` or `/properties` | Fetch active listings |
| GET | `/listings/{id}` | Single listing detail |

AIRE route: `src/app/api/listings/route.ts`

---

## Webhooks

None currently planned. Listings are fetched on-demand.

---

## Gotchas / quirks

- **Every MLS board has a different Paragon API URL.** There is no universal base URL. You must get yours from your MLS board.
- RETS vs REST: Older boards use RETS protocol, not a REST API. Confirm your board is on Paragon's modern REST API before implementing.
- Demo fallback: Without credentials, `src/app/api/listings/route.ts` returns hardcoded demo listings so the UI doesn't break.
- The `/mls` page is an iframe embed — it does not use the Paragon API, it embeds the full Paragon web UI. The API is only used for programmatic listing data in Hot Listings and buyer matching.

---

## Doc links

- [Paragon MLS Developer Portal](https://developer.paragonrels.com) (requires board credentials to access)
- Contact Greater Baton Rouge Association of Realtors® tech support for your board's specific API URL

---

## Implementation notes

- Lib stub: `src/lib/paragon.ts` (TODO — see file)
- API route: `src/app/api/listings/route.ts`
- Config helper: `getParagonConfig()` in `src/lib/settings.ts`
- Settings UI: Settings page → MLS section

---

## Test command

```bash
# Should return demo listings when no credentials set, real listings with credentials
curl -s http://localhost:3000/api/listings | jq '.listings | length'
```
