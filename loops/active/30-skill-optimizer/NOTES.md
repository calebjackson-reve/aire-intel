# Loop 30 — Handoff Notes

## Definition of Done
- [ ] Route at /api/agents/skill-optimizer responds 200
- [ ] Round-robin Setting key increments mod 29 each run
- [ ] PROMPT.md read from correct loop directory
- [ ] ActionQueue approval rate computed for last 30 days
- [ ] 3 variants written to PROMPT.variants.md in the target loop directory
- [ ] ActionQueue skill_review item created, requiresApproval=true
- [ ] Notification created per run
- [ ] Cron entry in vercel.json: 0 7 * * 0

## Notes
- Loop rank maps to directory prefix: rank 1 → "01-...", rank 2 → "02-...", etc.
- Zero-pad single digits: `String(rank).padStart(2, "0")`
- Approval rate denominator: all ActionQueue rows for agentType in last 30 days (avoid /0)
- agentType in ActionQueue uses underscore convention (e.g. "market_intel") — slug derived from dir name
- Slug: strip leading digits and dash from dir name, replace remaining dashes with underscores
  e.g. "01-inbound-reply-handler" → "inbound_reply_handler"
- claude-fable-5 call: fetch to https://api.anthropic.com/v1/messages (same pattern as market-intel)
- PROMPT.variants.md lives inside the target loop's directory (not loop 30's)
- Never import or call any function that auto-applies a variant
