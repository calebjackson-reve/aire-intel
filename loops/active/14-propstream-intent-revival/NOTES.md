# Loop: propstream-intent-revival — Handoff Notes

## Spec Summary
Weekly Wednesday 7AM cron. Scores cold leads by Paragon intent signals in their areas (new listings, price drops). Generates targeted revival drafts for top 10 scored leads.

## Definition of Done (from SPEC.md)
- `src/app/api/agents/intent-revival/route.ts` exists
- Queries cold leads, scores by Paragon listing activity in lead.areas
- Deduplicates vs. ActionQueue (same leadId+week) and ContactLog (last 30 days)
- Creates ActionQueue draft_message items for top 10
- Setting["propstream.lastRunWeek"] ISO week guard
- vercel.json has `0 13 * * 3` cron for `/api/agents/intent-revival`
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started

### Iteration 1 — Units A + B + C complete ✓
**Unit A — Schema findings:**
- `Lead.stage` (String): cold leads queried with `stage in ["cold", "dead"]`
- `Lead.areas` (String?): comma-separated neighborhoods/parishes — split and query each as Paragon `city`
- `Lead.priceMin`, `Lead.priceMax` (Float?): passed through to Paragon filter
- `Lead.lastContactDate` (DateTime?): used for ContactLog dedup guard (30-day window)
- No `temperature` field — `stage` is the only cold-signal field

**Unit B:** `src/app/api/agents/intent-revival/route.ts` created.
- ISO week guard via `Setting["propstream.lastRunWeek"]`
- Queries `stage in ["cold","dead"]` leads with `areas != null`, filters `do_not_contact` tag
- Paragon loop: one `fetchActiveListings` call per area, scores `newListings*2 + priceDrops*3`
- Price-drop signal: listings with `modifiedAt >= 7daysAgo && daysOnMarket > 7`
- ContactLog dedup (30 days outbound) + ActionQueue dedup (pending draft this week)
- `generateDraft({ source: "intent_revival", instruction: topListing details })`
- `ActionQueue.priority = 4`, `requiresApproval = true`
- `draft-agent.ts`: added `intent_revival` to `DraftSource` union + `INTENT_BY_SOURCE`

**Unit C:** `vercel.json` cron `0 13 * * 3` (Wednesday 7AM CT) added.

**Oracle:** `npx tsc --noEmit` ✓ · `npm run build` ✓
**Commit:** `6f0c68c`

**Status:** DONE — all definition-of-done criteria met.
