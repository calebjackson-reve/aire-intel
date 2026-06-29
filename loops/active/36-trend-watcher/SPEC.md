# Loop 36 — Trend Watcher SPEC

Route: GET|POST /api/agents/trend-watcher
Cron: 0 6 * * 1 (Monday 6AM UTC, 2h after reel-performance-learning)
Auth: Bearer CRON_SECRET header

What it does:
1. Guard: skip if last run within 6 days
2. Web research: Claude Sonnet identifies trending RE content formats
3. Cross-reference: compare against current reel.installedFormats Setting
4. Drain URL queue: process VideoRecipe rows with sourceType="queued"
5. Synthesize: update Setting["trend.topFormats"] + append to grammar file
6. Notify + LEDGER
