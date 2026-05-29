# Caleb's Morning Routine — 10 Minutes in AIRE

**Goal:** open AIRE, handle today's follow-ups, post today's content, close laptop. Done by 8:15am.

---

## ☕ Step 1 — Open AIRE (10 seconds)

```
localhost:3000
```

You'll see:
- Big number: **YTD GCI** in coral
- 4 action cards: **Cold Follow-Ups · Weekly Post · Sphere · Contracts**
- Top-right pills show what's connected (Lofty green, others grey)

---

## 📞 Step 2 — Handle cold follow-ups (5-7 min)

On the **Cold Follow-Ups** card (red dot), click **`REVIEW & SEND`** →

You're now in the batch workspace. For each lead:

1. Read the drafted text (Claude or template — either way, personalized to that lead)
2. Edit if needed (click the card to make it active, edit in textarea)
3. Click **`✓ COPY + SEND TEXT`** → opens your iMessage / phone with the message pre-filled and the lead's phone number ready. Hit send.
4. Card auto-advances to the next lead

Snooze 3 days if they're not ready. Skip if it's not worth a touch.

**5 leads in 5 minutes.** Hit **`✦ DRAFT NEXT 5 →`** to load another batch.

---

## 📣 Step 3 — Post your weekly market update (2 min)

On the **Weekly Post** card (blue dot), click **`GENERATE NOW`** →

You land on Create Post with:
- **Type:** Market Update (pre-selected)
- **Notes:** This week's BR market data already pasted in (median, DOM, 30-yr rate, YoY)

Click **`GENERATE POST →`** at the bottom of the form. Claude streams:
- ✅ Caption (Instagram-ready)
- ✅ Slide copy (for the carousel)
- ✅ Motion spec (for After Effects / CapCut)

Copy each section with the COPY button next to it. Drop in Instagram/Facebook.

---

## ✅ Step 4 — Close the loop (1 min)

Go back to dashboard (`localhost:3000`).

- Cold Follow-Ups count should be **lower** than when you started (1,681 → 1,676 if you sent 5)
- Weekly Post card switched from `GENERATE NOW` to `VIEW POST` (green check)
- Morning Brief at the bottom auto-summarizes pipeline state

Done. Close laptop. Go close deals.

---

## When AI is offline

If your Anthropic credits run out (you'll see a yellow banner at the top of the follow-up page), AIRE falls back to **personalized templates** automatically. Every message still uses the lead's first name, price range, and area. They're written in your voice. The workflow doesn't stop.

To restore full AI: [console.anthropic.com/settings/billing](https://console.anthropic.com/settings/billing) → add credits → set auto-reload to never hit zero again.

---

## Common shortcuts

| Where you are | Quickest action |
|---|---|
| Dashboard | Click any KPI tab (GCI, Volume, Units...) to switch the chart |
| Dashboard | Click **`+ LOG A DEAL`** to record a fresh closing → updates GCI immediately |
| Dashboard | Click **`↻ SYNC FROM DARWIN`** to re-pull from your brokerage CSV |
| Pipeline | Click any lead card → drawer slides in with Call · Text · Email · Log · Move Stage |
| Pipeline | Drag a card between columns to change stage |
| Smart Plans | Empty state shows 6 pre-built templates (no AI needed) — click `+ INSTALL` |
| Buyers | Empty state shows 6 buyer archetypes (First-Time, Move-Up, Luxury, etc.) — click `+ CREATE` |
| Contacts | Click any contact name → full profile with timeline, edit, AI follow-up |

---

## Daily / Weekly / Monthly rhythms

**Daily (10 min):**
- Cold follow-ups batch of 5
- Check today's calendar
- One social post if anything came up worth posting

**Weekly:**
- Generate the market update post (Monday morning)
- Re-sync Darwin CSV (Friday afternoon)
- Review pipeline → move stale leads, log next actions

**Monthly:**
- Sphere quarterly check-in batch (rotate 25% of sphere each month)
- Review smart plan performance
- Update annual goal if YTD is tracking ahead/behind

---

## When something breaks

- **Page error?** Click **`SYSTEM`** in the nav. See exactly what's failing.
- **Dashboard slow?** Refresh once. If still slow, restart dev server:
  ```bash
  cd /Users/caleb/aire-platform && npm run dev
  ```
- **AI features failing?** Check the yellow banner — usually credits or rate limit.
- **Lofty / Darwin / Meta not syncing?** Settings page → check integration status pills.

---

**That's the routine. 10 minutes. Every morning.**

*The whole point of AIRE: kill the decision-paralysis between "I should follow up" and actually doing it.*
