# Morning Workflow — Caleb's 10-Minute Open-Up Routine

**Acceptance contract.** This is the workflow AIRE must support flawlessly every single morning.

---

## The contract

> When Caleb opens `localhost:3000` at 8am, within **60 seconds** he can see his pipeline state, and within **10 minutes** he has handled his cold follow-ups and queued his morning's market content — with **zero broken interactions, no 404s, no silent AI failures, and no decisions left ambiguous**.

---

## The 6-step workflow

### 1. Open `localhost:3000` (0:00 → 0:05)

Page renders. He sees:

- **Hero greeting**: "Good morning, Caleb" + today's date
- **Integration status pills**: green dots for Lofty + Darwin + Google (connected), grey for Meta (not yet)
- **Notification bell** in top-right with badge count if anything urgent
- **Hot Listings drawer tab** on left edge

### 2. KPI Hero Tracker (0:05 → 0:15)

Big chart shows YTD GCI with goal progress.

- Headline: **$73k** (or current YTD GCI)
- YoY delta vs last year
- Goal progress: "19% of $380k goal"
- Tabs: GCI · Sales Volume · Units · Pipeline · Leads Added
- Time toggles: Week · Month · Quarter · YTD

Right side of header: `↻ SYNC FROM DARWIN` · `+ LOG A DEAL` buttons (always one-click away).

### 3. "DO IT NOW" Action Stack (0:15 → 0:30)

4 cards visible immediately. Each shows count + ONE clear action.

| Card | What it shows | Click action |
|---|---|---|
| 🔴 **Cold Follow-Ups** | "1,681 contacts cold 5+ days" | `REVIEW & SEND` → opens batch workspace |
| 🔵 **Weekly Post** | "Generate this week's market update with BR data pre-loaded" | `GENERATE NOW` → opens Create Post with type + context pre-filled |
| 🟡 **Sphere Check-Ins** | "X sphere contacts haven't heard from you in 90+ days" OR "Sphere is well-maintained" | `START SEQUENCE` or `ALL DONE` |
| 🟢 **Contract Check-Ins** | "X under contract" OR "No active contracts" | `REVIEW` or `NONE ACTIVE` |

### 4. Click "Cold Follow-Ups → REVIEW & SEND" (0:30 → 8:00)

Lands on `/follow-up`:

- **Header**: "Cold lead batch · 1,681 waiting"
- **Day filter** (5d+ / 7d+ / 14d+ / 30d+) and **batch size** (5/10/20)
- Hit **`✦ DRAFT BATCH`** → Claude drafts 5 personalized texts in parallel (~3 sec)

For each card:

- Lead name (links to profile), stage, price point, days cold
- **Editable** AI-drafted text in the active card
- Buttons:
  - `✓ COPY + SEND TEXT` (if phone present) — copies to clipboard, marks contact updated, advances to next
  - `✓ COPY + EMAIL` (if email present)
  - `SNOOZE 3D` — pushes next-action 3 days out
  - `SKIP` — moves on without logging contact

Auto-advances to next pending lead.

Batch complete state celebrates the win, offers `✦ DRAFT NEXT 5 →`.

### 5. Click "Weekly Post → GENERATE NOW" (8:00 → 9:30)

Lands on `/create-post?type=market_update`:

- Post type pre-selected: **Market Update**
- Notes field pre-filled with current BR market data: median, DOM, 30-yr rate, YoY
- Address/price fields empty (not needed for market post)
- Click **GENERATE POST →** → Claude streams Caption + Slide Copy + Motion Spec
- Copy buttons next to each section
- Send to Social → schedules in `/social`

### 6. Back to dashboard (9:30 → 10:00)

- Cold Follow-Up card now shows reduced count (1,676 instead of 1,681)
- Weekly Post card switches from `GENERATE NOW` to `VIEW POST` (green check)
- Morning Brief if generated shows pipeline state + suggested calls
- Calendar widget shows today's events

**Done. Caleb closes the tab and starts his day.**

---

## What "flawless" requires

1. **No 404s.** Every link goes somewhere real.
2. **No silent failures.** Anthropic API down → clear banner, fallback templates available.
3. **No empty states without CTAs.** Every empty list has a "do this next" button.
4. **No "what does this do?" ambiguity.** Every button's outcome is predictable.
5. **No double-clicks.** Loading states prevent re-submission.
6. **No data refresh confusion.** After an action, the count updates without manual reload.
7. **Mobile-readable.** Caleb might glance from his phone first.
8. **Fast.** First paint under 1.5s, KPI data under 3s.

---

## What's currently broken (will be fixed in this sprint)

- ⚠️ Anthropic credits empty → all AI drafts fail. Workflow needs template fallback.
- ⚠️ Pipeline card click doesn't open a quick-action drawer (only "AI FOLLOW-UP" works).
- ⚠️ Sphere & Contract check-in cards link to pages that aren't built yet.
- ⚠️ Empty state on Buyers / Smart Plans has no one-click "start here" CTA.
- ⚠️ Morning Brief on dashboard requires manual click to generate.

Fix order: AI fallback first (unblocks everything else without waiting on Caleb's billing) → Pipeline drawer → Empty states → Morning brief auto-load.
