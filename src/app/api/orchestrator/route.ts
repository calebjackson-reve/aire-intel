export const dynamic = "force-dynamic";
// Workflow Orchestrator — manual trigger / inspection
//
// POST /api/orchestrator   → run one orchestration tick now, return what fired.
// GET  /api/orchestrator   → same (read-only convenience for dashboards/cron).
//
// The orchestrator also runs automatically on the dashboard advance tick
// (/api/smart-plans/execute?action=advance). It's idempotent, so manual runs are safe.

import { runOrchestrator } from "@/lib/orchestrator";

export async function POST() {
  const result = await runOrchestrator();
  return Response.json(result);
}

export async function GET() {
  const result = await runOrchestrator();
  return Response.json(result);
}
