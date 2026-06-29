export const dynamic = "force-dynamic";

// GET /api/overnight — the "while you slept" receipt for the cockpit.
// Returns the agent runs from the last ~18h + the current approval-queue counts.

import { prisma } from "@/lib/prisma";

const LABELS: Record<string, string> = {
  morning_brief: "Morning brief assembled",
  market_intel: "Market scanned & leads re-scored",
  lead_revival: "Cold-lead revival drafted",
  transaction_watchdog: "Transactions & closings checked",
  content_scheduler: "Content drafted & scheduled",
  new_lead_intake: "New leads triaged",
  opportunity_detector: "Opportunities detected",
  render_job_completion: "Reels rendered",
};

export async function GET() {
  const since = new Date(Date.now() - 18 * 60 * 60 * 1000);

  const [runs, pendingCount, reelReady] = await Promise.all([
    prisma.agentRun.findMany({
      where: { startedAt: { gte: since } },
      orderBy: { startedAt: "desc" },
      take: 30,
    }),
    prisma.actionQueue.count({ where: { status: "pending" } }),
    prisma.actionQueue.count({ where: { status: "pending", type: "post_content" } }),
  ]);

  // Collapse to one row per agent type (latest run wins) for a clean receipt.
  const seen = new Set<string>();
  const report = runs
    .filter((r) => {
      if (seen.has(r.agentType)) return false;
      seen.add(r.agentType);
      return true;
    })
    .map((r) => ({
      agentType: r.agentType,
      label: LABELS[r.agentType] ?? r.agentType.replace(/_/g, " "),
      status: r.status,
      itemsProcessed: r.itemsProcessed,
      actionsQueued: r.actionsQueued,
      at: r.startedAt,
      durationMs: r.durationMs,
    }));

  const totalActionsQueued = report.reduce((n, r) => n + (r.actionsQueued ?? 0), 0);

  return Response.json({
    ranCount: report.length,
    report,
    pendingCount,
    reelReady,
    totalActionsQueued,
    since,
  });
}
