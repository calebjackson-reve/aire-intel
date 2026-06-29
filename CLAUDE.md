@AGENTS.md

# AIRE Platform — Project Context

AIRE is Caleb Jackson's internal operations platform for Rêve Realtors® in Baton Rouge, LA. It is a Next.js app that consolidates Lofty CRM, MLS/listing data, Meta social, AI content generation, and pipeline management into one luxury UI.

**Dev server:** `npm run dev` → http://localhost:3000
**Prod:** deployed on Vercel → `aire-intel.vercel.app` (`vercel --prod --yes` to ship)
**DB:** Prisma v7, **dual-mode** (driver chosen at runtime from `DATABASE_URL`): SQLite/better-sqlite3 locally (`file:./prisma/dev.db`), **Postgres/pg adapter in production** (Vercel). Setup in `src/lib/prisma.ts`. After any schema change: `npx prisma migrate dev && npx prisma generate`, then restart.

> **Gotcha:** editing `src/app/globals.css` or app-dir layout sometimes requires a dev-server restart to pick up — HMR doesn't always catch token/layout changes.

---

## What's built

Sales/CRM: `/today` `/pipeline` `/contacts` `/contacts/[id]` `/people` `/buyers` `/follow-up` `/touches` `/smart-plans` `/crm` `/revival` `/sphere`
Content: `/studio` (Video Brain) `/create-post` `/social` `/social-drafts` `/drafts` `/messenger-outreach` `/content-calendar` `/chat`
Intel/Ops: `/` (dashboard) `/brief` `/market` `/projection` `/mls` `/deal` `/agents` `/import` `/linkedin` `/apps` `/settings` `/system`

| Key route | What it does |
|---|---|
| `/` | Dashboard — **CommandCenter** action-count widgets, KPITracker, calendar, overnight report, market pulse |
| `/today` | Daily action queue (default landing) |
| `/pipeline` | Kanban — 5 stages, drag-and-drop (@dnd-kit), AI follow-up per card |
| `/contacts` | **LeadsTable** (sortable, inline stage, bulk select, score+trend) w/ Table/List toggle |
| `/contacts/[id]` | Full profile — activity log, tasks, AI follow-up stream, LeadTemperature, edit modal |
| `/studio` | Video Brain — footage → recipe → Shotstack render |
| `/smart-plans` | AI-generated drip campaign sequences |
| `/settings` | Integration setup (Lofty OAuth + Zapier secret + Meta etc.) |
| `/system` | Karpathy error dashboard — health score, patterns, full error log |

**API:** ~60 routes under `src/app/api/` (leads, contacts, tasks, deals, actions/queue, webhooks, lofty, zillow, market, studio, reel, render, smart-plans, push, …).

Key components: `TopNav`, `LeadsTable`, `CommandCenter`, `KPITracker`, `HotListings`, `CalendarWidget`, `NotificationCenter`, `CommandPalette`, `ChatPanel`, `ErrorBoundary`.

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

### Real-time lead sync — Zapier webhook (live)

Lofty → Zapier → AIRE is the live inbound path (OAuth is for pull/sync only).
- **Zap:** Lofty "Lead Pipeline Changed" (Attempting Contact stage) → POST `https://aire-intel.vercel.app/api/webhooks/zapier`
- **Auth:** `X-AIRE-Secret` header validated against `ZAPIER_INBOUND_SECRET` env var (must be set in Vercel + redeployed to take effect).
- **Payload:** `event=lead.created`, `leadId`, `name` (required), `firstName`, `lastName`, `email`, `phone`. Fires loop 01 (inbound-reply-handler).

---

## Design System (flattened 2026-06-28 — flat/airy + orange, owner-authorized)

The full token system lives in `src/app/globals.css :root`. **To re-skin the whole app, edit those tokens — not components** (components reference tokens, not raw values).

```
--aire-orange:  #FB7A01   (THE single accent — never substitute)
--aire-card:    #FFFFFF   (flat white surfaces, hairline border + soft drop shadow)
--aire-bg:      #EFF0F3   (light gray canvas)
--aire-text:    #3A4257   (slate ink)
--aire-border:  rgba(58,66,87,0.08)
```

- **Look:** flat, airy, high-whitespace — Lofty-aligned. The old neumorphic dual-shadow system was flattened to soft single-drop shadows (`--shadow-card`, `--shadow-float`). `--shadow-glow-orange` kept for primary CTAs.
- **Fonts:** Fraunces (serif) for **display headings only**; Josefin Sans for UI/body.
- **Nav:** Lofty-style fixed top bar (`TopNav.tsx`), height `--topnav-h` (58px). Content clears it via `.aire-content { padding-top: var(--topnav-h) }`. Sticky cmd-bars use `top: var(--topnav-h)`. Old `Sidebar.tsx` retained but unmounted for rollback.

Core classes: `.glass-card`, `.stat-tile`, `.cc-widget` (command center), `.lt-*` (leads table), `.tn-*` (top nav), `.btn-primary`, `.btn-ghost`, `.aire-input`, `.skeleton`.

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

- **MLS/listings:** Paragon is **dead — do not pursue** (key flagged illegal). Replacement path is Zillow/equivalent → `src/app/api/zillow/`; falls back to demo listings until keyed.
- **Meta:** needs `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`, `META_IG_BUSINESS_ID`
- **Zapier:** inbound webhook live (see above); outbound Zaps (Dotloop/Gmail/Drive/Calendar) connected, Lofty/Calendly standing Zaps still need Caleb

---

## Auth — Clerk (single-tenant gate)

The app is gated by **Clerk** (`@clerk/nextjs` v7). Live on **https://aireintel.org** (apex 308 → `www.aireintel.org`, which serves; both domains live on the `aire-intel` Vercel project).

- `src/middleware.ts` — `clerkMiddleware`: requires sign-in **and** locks access to a single email (`ALLOWED_EMAIL` env, default `caleb.jackson@reverealtors.com`); wrong accounts → `/not-authorized`.
- **⚠️ Public routes that must NEVER be Clerk-gated** (they self-authenticate and would break lead sync/automations): `/api/webhooks/*` (X-AIRE-Secret), `/api/cron/*` + `/api/agents/*` (Bearer `CRON_SECRET`), plus `/sign-in`, `/sign-up`, `/not-authorized`. Enforced via `createRouteMatcher` in middleware.
- `ClerkProvider` wraps the app in `layout.tsx`. Sign-in page: `src/app/sign-in/[[...sign-in]]/page.tsx`. Keys are **`pk_live`** (domain-locked to aireintel.org).
- Env (in Vercel prod + local `.env`): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `ALLOWED_EMAIL`.

## Security rules

- API keys always in `.env`, never in chat or source code
- If a key appears in conversation, treat it as compromised and flag for rotation immediately
- Never run untrusted install scripts
