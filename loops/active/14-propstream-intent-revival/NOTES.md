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
**Next:** Create src/app/api/agents/intent-revival/route.ts. Start with cold lead query + Paragon fetchListings() call.
