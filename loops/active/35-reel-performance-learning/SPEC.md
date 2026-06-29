# Loop 35 — Reel Performance Learning SPEC

Route: GET|POST /api/agents/reel-performance-learning
Cron: 0 4 * * 1 (Monday 4AM UTC)
Auth: Bearer CRON_SECRET header

What it does:
1. Guard: skip if last run within 6 days
2. Fetch: ContentPerformance for reels (last 30 days)
3. Fetch: ContentPreference rows with patternType starting reel_
4. Analyze: Claude Sonnet → topPacing, topGrade, topHookArchetype, insight
5. Write: update Settings (reel.topPacing, reel.topGrade, reel.topHookArchetype, reel.performance.lastRun)
6. Notify: create Notification row
7. Append to LEDGER.md (local only)
