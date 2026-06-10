# Loop: PropStream Intent-Based Revival

**Status:** [x] Approved  _(2026-06-09)_
**Type:** inner  
**Feeds (if outer):** n/a  
**Rank:** 14  
**Score:** 21 / 30

---

## Trigger

Weekly cron every Wednesday at 7:00 AM CT. Targets cold leads who show external intent signals (recent property search activity, PropStream inquiry, or owned-property events like tax delinquency or listing expiration nearby) that suggest they may be re-entering the market.

## Input

- `Lead` — cold leads: `stage = "cold"` OR `temperature = "cold"`, `lastContactedAt < 30 days ago`, `stage != "closed_won"` AND `!= "closed_lost"`, fields: `id`, `firstName`, `lastName`, `phone`, `email`, `areas`, `notes`, `propertyAddress` (if homeowner)
- PropStream API (if integrated) or manual property data: recently expired listings near lead's known areas, tax delinquency signals, pre-foreclosure
- Paragon MLS via `src/lib/paragon.ts` — price drops and new listings in the lead's `areas` (proxy for intent: market activity in their target area)
- `ContactLog` — last contact date verification

## Actions

1. Pull cold leads from DB (up to 20 per week — this is different from the nightly revival which pulls the coldest 15; this loop targets leads with EXTERNAL triggers)
2. For each cold lead:
   - Query Paragon for new listings / price drops in lead's `areas` from last 7 days
   - If no Paragon activity: check if lead's `propertyAddress` is in an area with > 3 listings this week (market heating signal)
   - If PropStream is integrated: check for pre-foreclosure / tax delinquency flags on any properties the lead owns
3. Score each lead on intent signals: 1pt per Paragon listing in their area, 2pt for price drop on a property they inquired about, 3pt for PropStream flag on owned property
4. Top 10 scored leads → generate intent-triggered revival drafts via `generateDraft()`:
   - Paragon trigger: "Noticed some activity in [area] this week — there's a new listing at [address] that matches what you were looking for earlier. Still open to taking a look?"
   - PropStream trigger (handled delicately): "Checking in — hope everything's going well. Have you given any thought to your options with the [address] property? Market timing has shifted."
5. Enqueue `ActionQueue` items: `type = "draft_message"`, `priority = 5`, `requiresApproval = true`
6. Do NOT overlap with nightly revival agent — check `ActionQueue` for existing revival drafts from the current week for the same lead

## Oracle

**What external source of truth grades the output?**  
`ContactLog` entries with `direction = "inbound"` from targeted leads within 14 days. Intent-triggered revival should outperform generic revival by ≥ 20% reply rate.

**Acceptance threshold:**  
≥ 25% reply rate on intent-triggered drafts (vs. ~12% baseline for generic revival).

**Rejection signal:**  
Lead replies "unsubscribe" or "stop" → immediately mark `stage = "closed_lost"`, add "do_not_contact" tag. This must be monitored via ContactLog inbound scan.

## Memory

- `ContactLog` — dedup guard: check if this lead was already contacted via PropStream/intent trigger in last 30 days
- `ActionQueue` — overlap check: don't create if existing revival draft for same lead + same week
- `Lead.lastContactedAt` — updated on draft send
- `Setting["propstream.lastRunWeek"]` — ISO week number of last run to prevent double-run

## Surface

- `ActionQueue` items → visible in `/brief` under "Going Cold" section (alongside nightly revival drafts)
- Dashboard `Notification` on Wednesday when drafts are queued: "Intent-triggered revival: 10 drafts ready"

---

## Safety Rails

- **Human chokepoint:** All drafts require approval. PropStream-triggered messages especially must be reviewed — they reference sensitive financial information and require Caleb's judgment on tone.
- **Blast radius:** Max 10 intent-triggered drafts per week. Cannot overlap with nightly revival queue for the same lead in the same week.
- **Rate limit / cap:** 10/week hard cap. 1 draft per lead per 30 days (regardless of which loop generates it).
- **Idempotency:** `Setting["propstream.lastRunWeek"]` ISO week guard. ActionQueue overlap check per `(leadId, week)`.
- **Exit condition:** PropStream API not integrated → fall back to Paragon-only intent signals (still useful). Lead has tag "do_not_contact" → exclude.

---

## Implementation Notes

- PropStream is NOT yet integrated — this loop currently only has Paragon MLS as the intent signal source. PropStream integration would require `PROPSTREAM_API_KEY` env var and a `src/lib/propstream.ts` client
- Create `src/app/api/agents/intent-revival/route.ts`
- Add cron to `vercel.json`: `{ "path": "/api/agents/intent-revival", "schedule": "0 13 * * 3" }` (7AM CT Wednesday = 13:00 UTC)
- Without PropStream: use Paragon new listings + price drops in lead's `areas` as the intent signal (lower signal strength, still better than cold outreach)
- `Lead.areas` field must contain the lead's target area(s) for the Paragon match to work — verify field type and format in schema
