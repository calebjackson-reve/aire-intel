@AGENTS.md

# AIRE Platform — Project Context

AIRE is Caleb Jackson's internal operations platform for Rêve Realtors® in Baton Rouge, LA. It is a Next.js app that consolidates Lofty CRM, Paragon MLS, Meta social, AI content generation, and pipeline management into one luxury UI.

**Dev server:** `npm run dev` → http://localhost:3000  
**DB:** SQLite via Prisma v7 with better-sqlite3 adapter. After any schema change: `npx prisma migrate dev && npx prisma generate`, then restart the server.

---

## What's built

| Route | What it does |
|---|---|
| `/` | Dashboard — KPIs, charts, Morning Brief, HotListings drawer, CalendarWidget |
| `/pipeline` | Kanban — 5 stages, drag-and-drop (@dnd-kit), AI follow-up per card |
| `/contacts` | Contact list with stage filter and cold-lead detection |
| `/contacts/[id]` | Full profile — activity log, tasks, AI follow-up stream, edit modal |
| `/buyers` | Buyer search profiles with auto-match from Paragon listings |
| `/smart-plans` | AI-generated drip campaign sequences |
| `/create-post` | Post generator — Claude streams caption + slide copy + motion spec |
| `/social` | Facebook/Instagram composer via Meta Graph API |
| `/mls` | Paragon MLS iframe embed |
| `/settings` | Lofty OAuth setup (3-credential form + test + sync) |
| `/system` | Karpathy error dashboard — health score, patterns, full error log |

Key components: `HotListings`, `CalendarWidget`, `NotificationCenter`, `ErrorBoundary`, `AIAssistant`, `Nav`

---

## Lofty CRM — OAuth 2.0 (IMPORTANT)

Lofty requires OAuth 2.0 Client Credentials, NOT a raw API key as Bearer token.

**Flow:** `POST https://api.lofty.com/oauth/token` with `grant_type=client_credentials` + `client_id` + `client_secret` + `customer_key` → returns access token → use as `Authorization: Bearer <token>`

**Env vars required:**
```
LOFTY_CLIENT_ID       # from developer.lofty.com — register an app
LOFTY_CLIENT_SECRET   # from developer.lofty.com app
LOFTY_CUSTOMER_KEY    # from CRM Settings → Integrations → Open API → Generate Key
```

The previous bug (`code 200058, "User in token does not exist"`) was caused by sending the raw `customer_key` as a Bearer token. This is fixed in `src/lib/lofty.ts`. Token is cached in memory with auto-refresh.

---

## Design System (LOCKED — never substitute brand tokens)

```
--reve-black:  #09090B   (background)
--reve-coral:  #EE8172   (primary accent)
--reve-blue:   #728AC5
--reve-cream:  #EFDD84
```

Classes: `.glass-card`, `.btn-primary`, `.btn-ghost`, `.aire-input`, `.live-dot`, `.skeleton`

Aesthetic target: morningside.studio tier — glass, depth, slow, editorial. No Canva energy.

Nav has `paddingLeft: 80px` to clear the HotListings left-edge tab.

---

## Error Memory System

`src/lib/error-memory.ts` — Karpathy-style self-improving error loop:
- `logError(type, source, err, context?)` — logs to ErrorLog table
- `withRetry(fn, opts)` — 3 attempts, 500→1000→2000ms backoff
- `detectPatterns()` — finds recurring errors in 24h window
- `getHealthScore()` — 0-100 score, improving/stable/degrading trend

Always wrap external API calls (Lofty, Paragon, Meta, Anthropic) in `withRetry`.

---

## Other integrations pending

- **Paragon:** needs `PARAGON_API_URL` + `PARAGON_API_KEY` in `.env` (falls back to demo listings)
- **Meta:** needs `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`, `META_IG_BUSINESS_ID`
- **Webhook real-time sync:** needs AIRE on a public URL (Netlify/Vercel) first

---

## Security rules

- API keys always in `.env`, never in chat or source code
- If a key appears in conversation, treat it as compromised and flag for rotation immediately
- Never run untrusted install scripts
