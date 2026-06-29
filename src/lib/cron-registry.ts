import { prisma } from './prisma'

// Source of truth for all cron jobs — migrated from vercel.json (39 crons → 2 dispatcher crons).
// The dispatcher reads this table and fires jobs when now - lastRunAt >= intervalMs.
// intervalMs is intentionally 10% under the nominal interval to absorb dispatcher schedule drift.

const REGISTRY: Array<{
  slug: string
  path: string
  schedule: string   // original cron expression — documentation only
  group: string      // frequent | standard
  intervalMs: number
}> = [
  // ── FREQUENT group — dispatcher runs every 2 min ──────────────────────────
  { slug: 'render-poll',          path: '/api/cron/render-poll',               schedule: '*/5 * * * *',      group: 'frequent', intervalMs: 4.5  * 60_000 },
  { slug: 'meeting-followup',     path: '/api/cron/meeting-followup',          schedule: '*/15 * * * *',     group: 'frequent', intervalMs: 13.5 * 60_000 },
  { slug: 'memory-index',         path: '/api/cron/memory-index',              schedule: '*/15 * * * *',     group: 'frequent', intervalMs: 13.5 * 60_000 },
  { slug: 'gmail-lead-detect',    path: '/api/agents/gmail-lead-detect',       schedule: '*/30 * * * *',     group: 'frequent', intervalMs: 27   * 60_000 },

  // ── STANDARD group — dispatcher runs every 30 min ─────────────────────────
  // Hourly
  { slug: 'calendar-sync',             path: '/api/agents/calendar-sync',             schedule: '0 */2 * * *',    group: 'standard', intervalMs: 1.8  * 3_600_000 },
  { slug: 'messenger-monitor',         path: '/api/agents/messenger-monitor',         schedule: '0 */2 * * *',    group: 'standard', intervalMs: 1.8  * 3_600_000 },
  // Daily
  { slug: 'market-intel',              path: '/api/agents/market-intel',              schedule: '0 9 * * *',      group: 'standard', intervalMs: 22   * 3_600_000 },
  { slug: 'content-scheduler',         path: '/api/agents/content-scheduler',         schedule: '0 10 * * *',     group: 'standard', intervalMs: 22   * 3_600_000 },
  { slug: 'morning-brief',             path: '/api/agents/morning-brief',             schedule: '0 11 * * *',     group: 'standard', intervalMs: 22   * 3_600_000 },
  { slug: 'transaction-watchdog',      path: '/api/agents/transaction-watchdog',      schedule: '0 12 * * *',     group: 'standard', intervalMs: 22   * 3_600_000 },
  { slug: 'revival',                   path: '/api/agents/revival',                   schedule: '0 1 * * *',      group: 'standard', intervalMs: 22   * 3_600_000 },
  { slug: 'error-autofix',             path: '/api/agents/error-autofix',             schedule: '0 7 * * *',      group: 'standard', intervalMs: 22   * 3_600_000 },
  { slug: 'health-check',              path: '/api/agents/health-check',              schedule: '30 11 * * *',    group: 'standard', intervalMs: 22   * 3_600_000 },
  { slug: 'fb-insights',               path: '/api/agents/fb-insights',               schedule: '0 14 * * *',     group: 'standard', intervalMs: 22   * 3_600_000 },
  { slug: 'opportunity-detector',      path: '/api/agents/opportunity-detector',      schedule: '0 14 * * *',     group: 'standard', intervalMs: 22   * 3_600_000 },
  { slug: 'zillow-refresh',            path: '/api/agents/zillow-refresh',            schedule: '0 8 * * *',      group: 'standard', intervalMs: 22   * 3_600_000 },
  { slug: 'rate-drop-blast',           path: '/api/agents/rate-drop-blast',           schedule: '0 12 * * *',     group: 'standard', intervalMs: 22   * 3_600_000 },
  { slug: 'pre-appt-cma',              path: '/api/agents/pre-appt-cma',              schedule: '0 11 * * *',     group: 'standard', intervalMs: 22   * 3_600_000 },
  { slug: 'content-pipeline-watch',    path: '/api/agents/content-pipeline-watch',    schedule: '0 14 * * *',     group: 'standard', intervalMs: 22   * 3_600_000 },
  // Weekly / bi-weekly
  { slug: 'zillow-content',            path: '/api/agents/zillow-content',            schedule: '0 9 * * 2,5',    group: 'standard', intervalMs: 2.5  * 24 * 3_600_000 },
  { slug: 'coverage-ratchet',          path: '/api/agents/coverage-ratchet',          schedule: '0 7 * * 6',      group: 'standard', intervalMs: 6    * 24 * 3_600_000 },
  { slug: 'sphere-reactivation',       path: '/api/agents/sphere-reactivation',       schedule: '0 14 1 * *',     group: 'standard', intervalMs: 6    * 24 * 3_600_000 },
  { slug: 'intent-revival',            path: '/api/agents/intent-revival',            schedule: '0 13 * * 3',     group: 'standard', intervalMs: 6    * 24 * 3_600_000 },
  { slug: 'audit-debt',                path: '/api/agents/audit-debt',                schedule: '0 7 * * 0',      group: 'standard', intervalMs: 6    * 24 * 3_600_000 },
  { slug: 'competitor-monitor',        path: '/api/agents/competitor-monitor',        schedule: '0 13 * * 5',     group: 'standard', intervalMs: 6    * 24 * 3_600_000 },
  { slug: 'goal-pacing',               path: '/api/agents/goal-pacing',               schedule: '0 13 * * 1',     group: 'standard', intervalMs: 6    * 24 * 3_600_000 },
  { slug: 'content-learning',          path: '/api/agents/content-learning',          schedule: '0 5 * * 0',      group: 'standard', intervalMs: 6    * 24 * 3_600_000 },
  { slug: 'revival-tracker',           path: '/api/agents/revival-tracker',           schedule: '30 13 * * 1',    group: 'standard', intervalMs: 6    * 24 * 3_600_000 },
  { slug: 'meta-discovery',            path: '/api/agents/meta-discovery',            schedule: '0 5 28 * *',     group: 'standard', intervalMs: 6    * 24 * 3_600_000 },
  { slug: 'ig-reel-optimizer',         path: '/api/agents/ig-reel-optimizer',         schedule: '0 4 * * 0',      group: 'standard', intervalMs: 6    * 24 * 3_600_000 },
  { slug: 'hashtag-optimizer',         path: '/api/agents/hashtag-optimizer',         schedule: '0 3 1,15 * *',   group: 'standard', intervalMs: 6    * 24 * 3_600_000 },
  { slug: 'caption-ab-validator',      path: '/api/agents/caption-ab-validator',      schedule: '0 2 * * 1',      group: 'standard', intervalMs: 6    * 24 * 3_600_000 },
  { slug: 'reel-performance-learning', path: '/api/agents/reel-performance-learning', schedule: '0 4 * * 1',      group: 'standard', intervalMs: 6    * 24 * 3_600_000 },
  { slug: 'trend-watcher',             path: '/api/agents/trend-watcher',             schedule: '0 6 * * 1',      group: 'standard', intervalMs: 6    * 24 * 3_600_000 },
  { slug: 'skill-optimizer',           path: '/api/agents/skill-optimizer',           schedule: '0 7 * * 0',      group: 'standard', intervalMs: 6    * 24 * 3_600_000 },
  { slug: 'content-optimizer',         path: '/api/agents/content-optimizer',         schedule: '0 6 * * 1',      group: 'standard', intervalMs: 6    * 24 * 3_600_000 },
  { slug: 'market-weekly',             path: '/api/agents/market-weekly',             schedule: '0 10 * * 1',     group: 'standard', intervalMs: 6    * 24 * 3_600_000 },
  { slug: 'phase-b-eval',              path: '/api/agents/phase-b-eval',              schedule: '0 15 15 * *',    group: 'standard', intervalMs: 6    * 24 * 3_600_000 },
]

export { REGISTRY }

export async function seedCronRegistry() {
  await prisma.cronTrigger.createMany({
    data: REGISTRY,
    skipDuplicates: true,
  })
}
