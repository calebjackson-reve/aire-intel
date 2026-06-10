# Loop: Listing Alert → Buyer Match

**Status:** [x] Approved  _(2026-06-09)_
**Type:** inner  
**Feeds (if outer):** n/a  
**Rank:** 02  
**Score:** 29 / 30

---

## Trigger

Daily cron at 3:00 AM CT (runs inside Market Intelligence Agent at `/api/agents/market-intel`). Also fires on-demand when Paragon webhook delivers a `listing.updated` or `listing.new` event (if wired in future — currently polling only).

## Input

- `BuyerSearch` — all records with `status = "active"`, fields: `leadId`, `minPrice`, `maxPrice`, `areas` (JSON array of ZIP codes / neighborhoods), `minBeds`, `minBaths`, `propertyTypes`
- Paragon listings from `fetchListings()` — new + price-reduced listings from last 24h, filtered to Caleb's target ZIPs
- `ZillowHotListing` — fetched_today viral listings
- `Lead` — `id`, `firstName`, `lastName`, `email`, `phone`, `stage` — for matched leads

## Actions

1. Pull all active `BuyerSearch` records
2. For each buyer search, run criteria match against today's Paragon listings:
   - Price within range (±10% tolerance for "close enough" alert)
   - Area match (ZIP or neighborhood substring)
   - Beds/baths ≥ minimums
   - Property type match (if set)
3. For each match (listing × buyer):
   - Check `ContactLog` — skip if this listing was already surfaced to this lead in last 7 days
   - Generate showing-request draft via `generateDraft()`: "New listing at [address] — [beds/baths/price] — matches what you're looking for. Want to schedule a showing?"
   - Enqueue `ActionQueue` item: `type = "send_client_email"`, `priority = 3`
4. Write matched listings to `DailyBrief.marketMovement` section
5. Write `AgentRun` record with `itemsProcessed = matches found`, `actionsQueued = drafts created`

## Oracle

**What external source of truth grades the output?**  
A showing appointment appears in Google Calendar (via `src/lib/google-calendar.ts`) within 48h of the alert being sent. Secondary oracle: lead replies to the email/text (new `ContactLog` entry with `direction = "inbound"`).

**Acceptance threshold:**  
≥ 15% of alerted buyers schedule a showing or reply within 48h.

**Rejection signal:**  
If 3 consecutive alerts to a buyer produce zero replies/showings, downgrade that buyer search to `status = "inactive"` and notify Caleb to re-qualify.

## Memory

- `ContactLog` — dedup guard: check before generating each alert (`leadId` + `listingId` + within 7 days)
- `BuyerSearch.status` — updated to `inactive` on rejection signal
- `ZillowHotListing.usedInPostId` — mark when listing is used in a buyer alert (prevent duplicate use in content same day)
- `AgentRun` — execution history

## Surface

- `DailyBrief.marketMovement` section → visible in `/brief` page
- `ActionQueue` item per match → appears in brief under "Market Movement" and in `/pipeline` for that lead
- High-priority match (>3 criteria hit) → immediate Dashboard `Notification`

---

## Safety Rails

- **Human chokepoint:** All outbound emails/texts land in `ActionQueue` with `requiresApproval = true`. Caleb reviews the draft and listing before it goes out.
- **Blast radius:** Max 5 buyer alerts per day total (not per buyer). Prevents inbox flooding on active market days.
- **Rate limit / cap:** Max 1 alert per buyer search per listing per 7 days. Max 5 total alerts per run.
- **Idempotency:** Dedup check: `ActionQueue` for existing pending item with `(leadId, listingMlsId, briefDate)` composite key stored in `payload.mlsId`.
- **Exit condition:** `BuyerSearch.status = "inactive"` or lead `stage = "closed_won"` / `"closed_lost"` — skip that buyer.

---

## Implementation Notes

- Lives inside `src/app/api/agents/market-intel/route.ts` — add buyer match pass after Paragon fetch
- `src/lib/paragon.ts → fetchListings()` — already returns listing objects; add `changedSince` date filter
- `src/lib/draft-agent.ts → generateDraft()` — add template type `"listing_alert"` with listing object in context
- New helper: `matchListingToBuyers(listing, buyerSearches)` — returns `BuyerSearch[]` that match criteria
- `BuyerSearch` Prisma model already has `areas`, `minPrice`, `maxPrice`, `minBeds`, `minBaths` fields
