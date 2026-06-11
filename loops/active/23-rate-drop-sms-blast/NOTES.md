# Loop 23 — Handoff Notes

## Definition of Done
- [ ] Route at /api/agents/rate-drop-blast responds 200 with `{ok:true, rateData, leadsQueued}`
- [ ] When delta <= -0.125: ActionQueue rows created for qualified leads
- [ ] When delta > -0.125: route returns early with `{triggered:false}`
- [ ] Idempotency: second call same day does not re-blast
- [ ] Notification created summarizing blast count

## Notes
- FRED CSV endpoint: https://fred.stlouisfed.org/graph/fredgraph.csv?id=MORTGAGE30US
- CSV format: date,value header row then weekly observations, newest last
- Parse last 2 rows for current + prior week
- Housing-intel lib already has getMortgageRate() — prefer it over raw CSV
- Threshold: -0.125 (one eighth of a point drop)
- SMS body template: "Rates just dropped to X% — now might be the perfect time to lock in. Reply to chat with me. -Caleb @ Reve"
