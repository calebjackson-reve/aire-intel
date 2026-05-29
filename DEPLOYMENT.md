# AIRE — Deployment & Go-Live Guide

This is the checklist to take AIRE from "runs on my laptop" to "live on the web."
Work top to bottom. Nothing here requires me — you can do every step yourself.

---

## TL;DR — what blocks launch today

| Blocker | Why it matters | Fix |
|---|---|---|
| 🔴 **Database is SQLite** | A single file. Vercel/Netlify wipe files on every deploy → data lost or app crashes. | Provision Postgres, flip the schema, run the migration script. (Steps 1–3 below.) |
| 🔴 **Anthropic key returns 401** | All AI features (captions, drafts, smart plans, brief) error out. | Get a valid key, put it in the host's env vars. (Step 4.) |
| 🟡 **Secrets only in local `.env`** | The host can't see your laptop's `.env` file. | Re-enter every key in the host dashboard. (Step 4.) |
| 🟡 **Meta can't post from localhost** | Instagram needs a public image URL. | Resolves automatically once deployed to a real URL. |

**Confirmed working today:** ✅ Lofty CRM credentials authenticate. ✅ The app builds and all pages render.

---

## Step 1 — Provision a Postgres database

Pick one host and create a database (you must create the account yourself):

- **Neon** (neon.tech) — recommended, generous free tier, instant.
- **Supabase** (supabase.com) — also great.
- **Vercel Postgres** — easiest if you deploy on Vercel.

When done you'll have a connection string that looks like:
```
postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
```
Keep it handy. **Never paste it into chat or commit it to git.**

---

## Step 2 — Point the schema at Postgres

In `prisma/schema.prisma`, change the datasource block:

```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```

> The app code (`src/lib/prisma.ts`) is already **dual-mode**: it uses SQLite when
> `DATABASE_URL` starts with `file:` and Postgres when it starts with `postgresql://`.
> No code change needed — just the schema provider line above.

Then create the Postgres tables. The existing migrations were written for SQLite, so
generate a fresh baseline for Postgres:

```bash
# with DATABASE_URL set to your Postgres string:
rm -rf prisma/migrations            # old SQLite migrations — keep a copy if you want
DATABASE_URL="postgresql://..." npx prisma migrate dev --name init
DATABASE_URL="postgresql://..." npx prisma generate
```

(For a quick first deploy you can use `npx prisma db push` instead of `migrate dev`.)

---

## Step 3 — Move your existing 1,736 contacts over

A migration script is included. Run it once, with both connection strings:

```bash
SQLITE_URL="file:./prisma/dev.db" \
POSTGRES_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require" \
node scripts/migrate-sqlite-to-postgres.mjs
```

It copies every table, skips rows that already exist (safe to re-run), and prints a
per-table count when finished.

> Note: your contacts came in as a **CSV import**, so this is a one-time snapshot.
> To keep them fresh going forward, run the Lofty sync (Settings → Sync) on a schedule.

---

## Step 4 — Set environment variables on the host

In your host's dashboard (Vercel: Project → Settings → Environment Variables), add the
keys below. **These are not read from your local `.env`** — you must enter them here.

### Required to launch

| Variable | What it powers | Where to get it | Status |
|---|---|---|---|
| `DATABASE_URL` | The whole app's data | Your Postgres string from Step 1 | ⚠️ new |
| `ANTHROPIC_API_KEY` | All AI: captions, drafts, smart plans, brief | console.anthropic.com → API Keys | 🔴 **current key fails (401) — get a fresh one** |
| `LOFTY_CLIENT_ID` | CRM contact sync | developer.lofty.com app | ✅ working |
| `LOFTY_CLIENT_SECRET` | CRM contact sync | developer.lofty.com app | ✅ working |
| `LOFTY_CUSTOMER_KEY` | CRM contact sync | Lofty → Settings → Integrations → API | ✅ working |

### Social posting (light up once deployed)

| Variable | What it powers | Where to get it |
|---|---|---|
| `META_PAGE_ACCESS_TOKEN` | Posting to Facebook/Instagram | Meta Business → App → Page token |
| `META_PAGE_ID` | Which FB page to post to | Meta page settings |
| `META_IG_BUSINESS_ID` | Which IG account to post to | Meta Business → Instagram account |
| `META_APP_ID` / `META_APP_SECRET` | App auth | developers.facebook.com app |

> Instagram requires the post image to be a **public HTTPS URL**, which is impossible on
> localhost. Once AIRE is deployed to a real domain this works automatically.

### Optional — add only when you want that feature

| Variable(s) | Feature it unlocks |
|---|---|
| `PARAGON_API_URL`, `PARAGON_API_KEY` | Live MLS listings + buyer auto-match (otherwise empty/demo) |
| `DOTLOOP_API_KEY` | Real deal documents & parties on the Deal page (otherwise falls back to contact) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Sending SMS |
| `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` | Sending email |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Calendar events |
| `CALENDLY_API_KEY` | Calendly appointments |
| `ZAPIER_WEBHOOK_URL` | Automation triggers (e.g. Slack ping on stage change) |
| `RPR_API_KEY` | RPR property data |

---

## Step 5 — Deploy

On Vercel (recommended for Next.js):

1. Push the repo to GitHub.
2. Import the repo at vercel.com → New Project.
3. Add all the env vars from Step 4.
4. Set the build command (default `next build` is correct) and deploy.
5. Add `npx prisma generate` to the build — already runs via `@prisma/client` postinstall,
   but if the build complains, set the Install Command to `npm install && npx prisma generate`.

---

## Step 6 — Pre-launch smoke test (after deploy)

Visit the live URL and confirm:

- [ ] `/` dashboard loads with your real KPIs
- [ ] `/contacts` shows your migrated contacts (should be ~1,736)
- [ ] `/pipeline` cards drag between stages and the change persists after refresh
- [ ] `/create-post` generates a caption (proves the **new** Anthropic key works)
- [ ] `/settings` → run a Lofty sync without error
- [ ] `/social` posts to Facebook/Instagram (proves Meta tokens + public URL)
- [ ] `/system` health dashboard shows no flood of errors

---

## Deploying to Vercel at www.aireintel.org

The repo is already configured for Vercel (`vercel.json` + `prisma generate` in the
build). Do these in order — the first three are the blockers; nothing serves correctly
until they're done.

**A. Prerequisites (do first):**
1. Create the Postgres DB (Step 1) and do the schema flip + migration (Steps 2–3).
2. Get a working `ANTHROPIC_API_KEY` (Step 4).
3. Put the repo on GitHub (the current remote is a placeholder):
   ```bash
   git remote set-url origin https://github.com/<your-username>/aire-platform.git
   git add -A && git commit -m "Deploy-ready: Postgres + Vercel config"
   git push -u origin main
   ```

**B. Connect Vercel:**
1. vercel.com → **Add New → Project** → import the `aire-platform` GitHub repo.
2. Framework auto-detects as **Next.js**. Leave build settings as-is (vercel.json handles them).
3. Add **all** env vars from Step 4 (especially `DATABASE_URL` = your Postgres string and
   the fresh `ANTHROPIC_API_KEY`). Set them for **Production**.
4. Click **Deploy**. You'll get a `*.vercel.app` URL — confirm it loads.

**C. Point www.aireintel.org at it:**
1. In the Vercel project → **Settings → Domains** → add `www.aireintel.org`
   (and `aireintel.org` — set one to redirect to the other; `www` as primary is common).
2. Vercel shows the DNS records to add. At your domain registrar (wherever aireintel.org
   is registered), add them:
   - `www`  → **CNAME** → `cname.vercel-dns.com`
   - `@` (root) → **A** → `76.76.21.21`  *(or the ALIAS/redirect Vercel specifies)*
3. Wait for DNS to propagate (minutes to ~1 hr) — Vercel auto-issues the SSL cert.
4. "Override the current domain": if aireintel.org is currently attached to a different
   Vercel project, remove it from that project's **Settings → Domains** first, then add it
   here — a domain can only be primary on one project at a time.

> I can't perform B or C for you — they require logging into your Vercel account and your
> domain registrar, which only you can do. Everything in the repo is ready for them.

---

## Security reminders

- Secrets live **only** in `.env` (local) and the host's env settings (production) — never in git or chat.
- The current `ANTHROPIC_API_KEY` failed auth; treat it as dead and replace it.
- `.env`, `.env.local`, and `dev.db` should all be in `.gitignore` (confirm before pushing).
