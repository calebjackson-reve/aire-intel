# AIRE Platform — User Guide
**Rêve Realtors® Baton Rouge | Internal Operations Platform**

---

## Table of Contents

1. [What AIRE Is](#what-aire-is)
2. [Getting Started](#getting-started)
3. [Dashboard](#dashboard)
4. [Pipeline](#pipeline)
5. [Contacts](#contacts)
6. [Buyers](#buyers)
7. [Smart Plans](#smart-plans)
8. [Create Post](#create-post)
9. [Social](#social)
10. [MLS](#mls)
11. [Import](#import)
12. [Settings](#settings)
13. [System Health](#system-health)
14. [Team Workflows](#team-workflows)
15. [What Requires Credentials](#what-requires-credentials)

---

## What AIRE Is

AIRE is Caleb's internal command center — a single place to manage every lead, listing, follow-up, campaign, and social post without bouncing between Lofty, Paragon, Meta, and your phone.

It is not a replacement for Lofty CRM. It is a layer on top of it — pulling your leads in, giving you smarter views, and adding capabilities Lofty doesn't have (AI follow-up, smart drip plans, content generation, MLS matching, system health monitoring).

**Access:** `http://localhost:3000` (dev) or your deployed URL once on Vercel.

---

## Getting Started

### First login

1. Open the app — you land on the Dashboard.
2. Go to **Settings** (bottom of left nav) and connect your services:
   - Lofty CRM credentials (required for lead sync)
   - Google Account (required for contact sync and calendar)
   - Any other integrations you want live
3. Come back to Dashboard — your Morning Brief, KPIs, and calendar will populate within a few minutes.

### Navigation

The left sidebar has all pages. The **Hot Listings drawer** lives on the left edge of every page — click the tab to slide it open without leaving your current view.

---

## Dashboard

**Route:** `/`

Your daily command center. Opens every morning to show you everything that matters before you make a single call.

### Morning Brief

A card at the top of the dashboard generated fresh each day by Claude AI. It summarizes:

- **Baton Rouge market signals** — median price, days on market, inventory, 30-year rate, year-over-year change
- **Your pipeline at a glance** — how many leads are in each stage, who needs attention today
- **A note from "Caleb"** — a one-line take on what the market signal means for your business

The Brief auto-generates when you load the page. If it looks stale, click **Refresh** to regenerate.

### KPI Cards

Six cards across the top row:

| Card | What it shows |
|---|---|
| Total Leads | All leads in the database |
| Active Pipeline | Leads in active + showing stages |
| Hot Leads | Leads contacted in the last 7 days |
| Cold Leads | Leads with no contact in 30+ days |
| Avg Price Point | Mean price range across your pipeline |
| Overdue Tasks | Tasks past their due date |

Click **Cold Leads** or **Overdue Tasks** to jump directly to the relevant filter.

### Pipeline Stage Chart

A bar chart showing how many leads are in each of the 5 stages (New → Active → Showing → Under Contract → Closed). Coral bars = your distribution at a glance.

### Lead Source Pie Chart

Breaks down where your leads came from (Lofty sync, Google Contacts, CSV import, manual entry, etc.). Helps you see which source is actually filling your pipeline.

### Activity Timeline

Area chart showing leads added per day over the last 30 days. Spike = a batch import. Flat = you need to work your sources.

### Upcoming Tasks

The 5 most urgent tasks due soonest. Each shows the lead name, task title, priority (High/Medium/Low), and due date. Click the lead name to jump to their profile.

### CalendarWidget

Pulls events from your connected Google Calendar and shows the next 7 days of showings, deadlines, and appointments. Events are color-coded by type. Requires Google OAuth with Calendar scope — see [Settings](#settings).

### NotificationCenter

Bell icon in the top-right. Shows system alerts:
- Lead sync completions
- Smart Plan enrollments
- Follow-up reminders
- Error alerts from the system

Unread count shows as a badge. Click any notification to mark it read.

### Hot Listings Drawer

The tab on the left edge of every page. Slides open to show your active MLS listings from Paragon. Each card shows address, price, beds/baths, and days on market. Requires Paragon credentials — shows demo listings until connected.

---

## Pipeline

**Route:** `/pipeline`

Your lead pipeline as a Kanban board. Five columns, one for each stage.

### Stages

| Stage | What it means |
|---|---|
| New Lead | Just came in, not yet worked |
| Active | In conversation, doing research |
| Showing | Scheduled or completed showings |
| Under Contract | Contract executed |
| Closed | Transaction complete |

### Moving Cards

Drag and drop a card from one column to another. The stage updates in the database instantly — no save button. If you drop it wrong, drag it back.

### Each Card Shows

- Lead name + price point
- Days since last contact (goes red if over 14 days)
- Next action note (if set)
- A **Follow Up** button

### AI Follow-Up

Click **Follow Up** on any card. A panel slides out on the right showing a Claude-generated follow-up message tailored to:
- The lead's stage and price point
- Their last contact date
- Their preferred contact method (email vs. phone vs. text)

The AI writes the message. You review, edit if needed, then send. It logs the contact in the lead's timeline automatically.

### Filters

Top of the page: filter by stage, price range, or search by name. Filters stack — you can narrow to "Active leads, $400k–$600k, name contains 'Smith'."

---

## Contacts

**Route:** `/contacts`

Your full contact database — everyone synced from Lofty, Google Contacts, and CSV imports combined into one de-duplicated list.

### The List

Paginated at 50 per page. Each row shows:
- Name, email, phone
- Stage (color-coded badge)
- Source (where they came from)
- Last contact date
- Days since contact (red if cold)

### Filtering

- **Stage filter** — dropdown to show only one pipeline stage
- **Search** — name, email, or phone search
- **Cold lead detection** — the list highlights anyone not contacted in 30+ days with a subtle indicator

### Contact Profile

Click any name to open `/contacts/[id]` — the full profile page.

#### Profile sections:

**Header** — Name, stage badge, source, price point, email, phone, notes. Click the edit icon to modify any field inline.

**Activity Timeline** — Every interaction logged in reverse chronological order: calls, texts, emails, follow-ups, stage changes, notes. This is your full relationship history.

**Tasks** — Tasks assigned to this lead. Create a new task (title, due date, priority) directly from the profile. Check them off when done.

**AI Follow-Up** — Same as Pipeline's follow-up button, but from the profile. Claude generates a message based on the full profile context — price point, stage, all past interactions. The message streams in word by word.

**Edit Modal** — Edit name, email, phone, stage, price range, source, and notes. Changes save to the database immediately.

---

## Buyers

**Route:** `/buyers`

Buyer search profiles — what each buyer is looking for — matched against your Paragon MLS listings.

### Creating a Buyer Profile

Click **+ New Buyer Search**. Fill in:
- Buyer name (links to a contact)
- Price min/max
- Bedrooms min
- Bathrooms min
- Preferred areas (free text — neighborhoods, zip codes, school districts)
- Notes

Save it. The system runs a match against current MLS listings and shows results.

### Auto-Match

Each saved profile shows a **Matches** count — listings from Paragon that fit the buyer's criteria. Click **View Matches** to see the matched listings with photos, price, beds/baths, address, and days on market.

Requires Paragon credentials for live listings. Shows demo matches without credentials.

### Managing Profiles

Edit or delete any buyer profile. The match count updates when listings change (on page load or manual refresh). Use this page in buyer consultations — show them only what fits their criteria without digging through full MLS.

---

## Smart Plans

**Route:** `/smart-plans`

AI-generated drip campaigns. A Smart Plan is a sequence of timed follow-up messages (email, SMS, or both) that automatically send to enrolled leads at defined intervals.

### Creating a Plan

Click **+ New Smart Plan**. Give it a name and a goal. Claude generates:
- A sequence name and description
- 5–10 steps, each with:
  - Day offset (Day 1, Day 3, Day 7, Day 14, etc.)
  - Message type (email or SMS)
  - Subject line (for email)
  - Full message body — personalized, non-generic, Rêve-caliber tone

Review every step. Edit any message by clicking it.

### Enrolling a Lead

Open a plan → click **Enroll Lead** → search for the lead by name. The lead is enrolled and the plan starts on Day 1 immediately.

### Tracking Enrollment

Each plan card shows:
- How many leads are enrolled
- The enrollment list with status per step (pending, sent, skipped)

### Best Plans to Build

| Plan | Use case |
|---|---|
| New Lead Nurture (30-day) | Any lead that just entered the pipeline |
| Cold Lead Reactivation (14-day) | Leads cold for 60+ days |
| Open House Follow-Up (7-day) | Met at an open house, not yet qualified |
| Under Contract Milestone | Check-ins from contract to close |
| Post-Close Anniversary | 3/6/12 month touchpoints for referrals |

---

## Create Post

**Route:** `/create-post`

AI-powered social content generator. Claude writes captions, slide copy, and motion specs for your Instagram and Facebook posts — in Rêve brand voice, not generic real estate template energy.

### How to Use

1. Choose a **post type**: Market Update, Listing Spotlight, Buyer Tip, Just Closed, or Custom
2. Enter context:
   - For a listing: address, price, key features, lifestyle angle
   - For a market update: the data point you want to lead with
   - For a custom post: describe what you want in plain language
3. Click **Generate**
4. Claude streams the response — you see it appear word by word:
   - **Caption** — the full IG/FB caption with hooks, body, and call to action
   - **Slide Copy** — 3–5 slides of text for a carousel or story
   - **Motion Spec** — a production note describing the animation, pacing, and feel for whoever builds the visual

### After Generating

- **Copy** any section with one click
- **Regenerate** if you want a different angle (keeps your inputs, rewrites the output)
- **Send to Social** — pre-fills the `/social` composer with the caption ready to post

### Tips

- Be specific in your context. "4BR in Bocage, $875k, pool, updated kitchen, walking distance to schools" produces better output than "luxury listing."
- The motion spec is for Rêve creative production — it describes what the video/animation should feel like, not how to build it. Share it with whoever makes your content.
- Generate 5–10 posts in a session and save the captions somewhere — batch content creation beats one-at-a-time.

---

## Social

**Route:** `/social`

Facebook and Instagram publisher. Write or paste a caption, add an image URL, choose platforms, and post — without opening Meta Business Suite.

### Compose a Post

- **Caption** — write it here or paste from Create Post
- **Image URL** — must be a public HTTPS link (hosted image, not a file on your computer)
- **Platform** — Facebook, Instagram, or Both
- **Publish Now** vs **Schedule** — toggle to schedule for a specific date/time

### Post Queue

Below the composer: a list of all your drafted, scheduled, and published posts. Each shows:
- Platform badge
- Caption preview
- Status (Draft / Scheduled / Published / Failed)
- Time published or scheduled for

### Connection Status

Top of the page shows whether Facebook and Instagram are connected (green) or not (red). If red, go to Settings → Meta section and add your credentials.

### Instagram Note

Instagram requires a public image URL — you cannot upload a file directly. If you generated an image locally, host it first (Cloudinary, S3, or any public link) before posting to Instagram.

---

## MLS

**Route:** `/mls`

Full Paragon MLS web interface embedded directly in AIRE. No separate login — once Paragon credentials are set in Settings, you have the full MLS inside the platform.

Use this for:
- Running detailed property searches
- Pulling comps for a CMA
- Checking active/pending/sold status
- Viewing photos and showing instructions

Everything you can do in Paragon's web portal, you can do here. The Hot Listings drawer on the left edge shows your active listings specifically; this page shows the full MLS.

---

## Import

**Route:** `/import`

Bulk import contacts from a CSV file.

### Accepted Format

CSV with headers. AIRE maps these column names automatically:

| CSV Column | Maps to |
|---|---|
| `name` or `full_name` | Contact name |
| `email` | Email address |
| `phone` | Phone number |
| `stage` | Pipeline stage |
| `source` | Lead source |
| `notes` | Notes field |
| `price_min`, `price_max` | Price range |

Columns it doesn't recognize are ignored — safe to import an export from any CRM without cleaning it first.

### Import Process

1. Drag and drop your CSV or click to select it
2. AIRE shows a preview of the first 5 rows and detected column mapping
3. Confirm the mapping (edit if anything is off)
4. Click **Import** — contacts are added to the database
5. Duplicates (matched by email or phone) are updated, not doubled

### After Import

Go to `/contacts` to see your new contacts. The source column will show where they came from ("CSV Import" by default). You can bulk-update the source field if needed.

### Best Imports to Run

- Export from Lofty as a CSV backup before the OAuth sync — gives you a baseline
- Old client lists from a spreadsheet
- Open house sign-in sheets (clean the CSV first, 5 minutes of work)
- Sphere of influence list — friends, family, past clients

---

## Settings

**Route:** `/settings`

Where you connect every external service. All credentials save to the database — you enter them once and every page in the app picks them up automatically.

### Lofty CRM

The primary lead source. Requires three credentials from Lofty's developer portal:
- **Client ID** — from developer.lofty.com (register an app)
- **Client Secret** — from the same app
- **Customer Key** — from Lofty CRM → Settings → Integrations → Open API → Generate Key

After saving, click **Test Connection** to verify. Then click **Sync Leads** to pull all your Lofty leads into AIRE. Sync takes 30–60 seconds depending on lead count.

### Google Account

Required for two features:
- **Contact Sync** — imports your Google Contacts into AIRE
- **Calendar** — powers the CalendarWidget on the Dashboard

Click **Connect Google** → authorize in the popup → AIRE stores the tokens. You'll need to re-authorize if you reset your Google password.

**Note:** As of now, the OAuth asks for Contacts access only. Calendar requires a re-authorization with the Calendar scope added — this is a known issue that will be patched in the next update. Once patched, clicking Connect Google again will request both scopes.

### Paragon MLS

Your MLS board's API URL and API Key. Contact your MLS board's tech support for these — every board's URL is different.

Once connected:
- Hot Listings drawer shows real listings
- Buyers page auto-match uses live data
- MLS page embeds the full Paragon interface

### Meta (Facebook / Instagram)

Five credentials from Meta for Developers:
- App ID + App Secret — from your Meta developer app
- Page Access Token — generate a **long-lived** token from Graph API Explorer
- Page ID — from your Facebook Page's About section
- Instagram Business ID — from Meta for Developers → Instagram

Once connected, the Social page can publish directly to both platforms.

### Twilio SMS

Account SID, Auth Token, and your Twilio phone number. From console.twilio.com.

Once connected, AI Follow-Up messages can be sent as actual texts from the contact profile or pipeline card.

### SendGrid Email

API Key and your from-email address. From app.sendgrid.com → API Keys.

Once connected, Smart Plan email steps will send real emails.

### Calendly

Personal Access Token from calendly.com → Integrations → API & Webhooks.

Once connected, AI-generated follow-up messages can include your actual Calendly booking link automatically.

### Dotloop

API Key from dotloop.com → Settings → API.

Once connected, the contacts page can show active loops/transaction documents linked to a lead.

### Zapier

Paste your Zapier webhook URL (from a "Webhooks by Zapier" trigger in any Zap).

AIRE will POST event data to that URL when key things happen (new lead synced, stage change, follow-up sent). Use this to trigger anything in your Zapier stack — Slack notifications, Google Sheets logging, email alerts.

### RPR / Remine

API key from your MLS board. NAR's RPR doesn't offer public self-serve API access — you'll need to go through your board. Once connected, market data in the Morning Brief pulls from RPR instead of AI-generated estimates.

---

## System Health

**Route:** `/system`

Karpathy-style error monitoring. Shows you whether the platform is working correctly — before a problem becomes a missed lead.

### Health Score

A number from 0–100. What it means:

| Score | Status |
|---|---|
| 90–100 | All systems go |
| 70–89 | Minor issues, monitor |
| 50–69 | Something needs attention |
| Below 50 | Active problem — check error log |

The score is calculated from error frequency and resolution rate over the last 24 hours. It shows a trend (improving / stable / degrading).

### Error Patterns

Below the score: a table of recurring errors detected in the last 24 hours. If the same error appears 3+ times, the system flags it as a pattern. Each pattern shows:
- Error type (API failure, sync error, etc.)
- Source (which integration caused it)
- Count and last occurrence

### Full Error Log

Scrollable table of every error logged. Each row shows when it happened, what failed, and whether it was auto-resolved on retry. Click any row for the full error message and stack trace — useful when debugging a credential issue.

### When to Check This Page

- After connecting a new integration in Settings
- If the Dashboard Morning Brief fails to generate
- If a Lofty sync shows fewer leads than expected
- If a Smart Plan says "sent" but the contact says they never got it

---

## Team Workflows

How AIRE fits into a team of agents working together.

---

### Daily Routine (Individual Agent)

**8:00 AM — Dashboard**
- Read the Morning Brief — market signal + pipeline summary
- Check Overdue Tasks card — handle anything past due before new work
- Scan the CalendarWidget — what's on your schedule today
- Open Hot Listings drawer — anything new that matches an active buyer?

**9:00 AM — Pipeline**
- Scan for cards with red "days since contact" indicators
- Click Follow Up on anyone 14+ days cold — AI writes the message, you review and send
- Drag any leads that moved stages (someone went from Active to Showing yesterday)

**Ongoing — Contact Profile**
- After every call, go to the contact's profile and add a note to the timeline
- Set a "Next Action" task before you leave the profile
- If a lead goes cold, enroll them in a Smart Plan immediately

---

### Lead Intake (New Lead Arrives)

1. Lead syncs automatically from Lofty (if OAuth is connected) or comes in via CSV import
2. Go to `/contacts` — find the new lead (they'll be at the top, sorted by date added)
3. Open their profile — verify name, phone, email, price range
4. Set stage to "Active"
5. Generate an AI Follow-Up — send within the first hour (speed to lead is everything)
6. Enroll in the "New Lead Nurture" Smart Plan as a backup drip

---

### Buyer Consultation Workflow

1. Before the consultation, go to `/buyers` and create a buyer profile with their criteria
2. Review the auto-matched listings — note any that stand out
3. During the consultation, pull up the Buyers page on a second screen or tablet
4. After the consultation, update their price range and preferences
5. Enroll them in the "Active Buyer" Smart Plan for ongoing touchpoints

---

### Listing Launch Workflow

1. Go to `/create-post` — choose "Listing Spotlight"
2. Enter the address, price, key features, and lifestyle angle
3. Generate → review the caption, slide copy, and motion spec
4. Send caption to `/social` and schedule the post
5. Share the motion spec with your creative team for the video/carousel production
6. Go to `/contacts` — find anyone in the buyers list whose price range and criteria match
7. Send them a personal text or email (AI-generated from their profile)

---

### Content Batch Day (Once a Week)

1. Open `/create-post`
2. Generate 5–7 posts in one session:
   - 1–2 market updates
   - 1–2 listing spotlights (active listings)
   - 1 buyer tip
   - 1 just-closed celebration
   - 1 personal/brand post
3. Copy captions to your content calendar (Notion, Google Sheets, wherever)
4. Share motion specs with your designer or use Rêve Animation Engine for production
5. Come back to `/social` to schedule posts as visuals are ready

---

### Team Coordination (Multiple Agents)

AIRE is currently single-user (Caleb's credentials, one database). For multi-agent use:

**Option A — Shared access, one login**
- Everyone accesses the same URL with the same credentials
- All contacts, leads, and pipeline are shared
- Works for a small team where everyone works the same pipeline

**Option B — Deploy to Vercel, give each agent a bookmark**
- Deploy AIRE to Vercel (public URL)
- Share the URL with your team — no login required in the current build
- Add user roles to the Prisma schema when needed (future enhancement)

**Recommended hand-offs:**
- Caleb generates Smart Plans → agents enroll their leads
- Showing coordinator updates stage to "Showing" after scheduling → Caleb sees it in Pipeline
- TC (transaction coordinator) marks stage to "Under Contract" → AIRE logs the date, Smart Plan enrollment triggers the milestone drip
- ISA (inside sales) works the `/contacts` cold lead filter daily, enrolls in reactivation plans

---

### Open House Workflow

1. Collect sign-in sheets during open house
2. After: clean up the CSV (name, email, phone columns — 5 minutes)
3. Go to `/import` — upload the CSV
4. After import, go to `/contacts` → filter by source "CSV Import" → sort by date added
5. All new open house leads are there — bulk select and enroll in "Open House Follow-Up" Smart Plan
6. Within 24 hours: generate personal follow-ups from the pipeline for the hottest prospects

---

## What Requires Credentials

Quick reference — what works out of the box vs. what needs setup.

| Feature | Works without credentials | Needs credentials |
|---|---|---|
| Dashboard KPI cards | Yes (from local DB) | — |
| Morning Brief | Yes (Claude AI, key in .env) | — |
| Pipeline Kanban | Yes | — |
| AI Follow-Up (generate) | Yes | Claude API key in .env |
| AI Follow-Up (send as SMS) | No | Twilio |
| AI Follow-Up (send as email) | No | SendGrid |
| Contacts list | Yes | — |
| Google Contact Sync | No | Google OAuth |
| Lofty Lead Sync | No | Lofty OAuth (3 credentials) |
| CalendarWidget | No | Google OAuth + Calendar scope |
| Hot Listings drawer | Demo data only | Paragon MLS |
| Buyers auto-match | Demo data only | Paragon MLS |
| MLS page | No (iframe, needs your board login) | Paragon + your board login |
| Smart Plans (generate) | Yes | Claude API key in .env |
| Smart Plans (send emails) | No | SendGrid |
| Smart Plans (send SMS) | No | Twilio |
| Create Post (generate) | Yes | Claude API key in .env |
| Social publishing | No | Meta (FB/IG) |
| Zapier webhook | No | Zapier webhook URL |
| Dotloop transactions | No | Dotloop API key |
| Calendly booking links | No | Calendly API key |
| RPR market data | AI-estimated | RPR API key (via MLS board) |
| System Health page | Yes | — |
| CSV Import | Yes | — |

---

*AIRE — built for Rêve Realtors® Baton Rouge*
*Platform by Caleb Jackson | Powered by Claude AI*
