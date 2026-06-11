export const dynamic = "force-dynamic";
// Smart Plan executor API
// POST /api/smart-plans/execute/enroll  → enroll a lead in a plan
// POST /api/smart-plans/execute/advance → advance all due enrollments (dashboard trigger)
// GET  /api/smart-plans/execute?planId=&leadId= → check enrollment status

import { NextRequest } from "next/server";
import { enrollLead, advanceEnrollments, getEnrollmentStatus } from "@/lib/smart-plan-executor";
import { runOrchestrator } from "@/lib/orchestrator";

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "advance";

  if (action === "enroll") {
    const body = await req.json();
    const { planId, leadId } = body ?? {};
    if (!planId || !leadId) {
      return Response.json({ error: "planId and leadId required" }, { status: 400 });
    }
    const result = await enrollLead(planId, leadId);
    return Response.json(result);
  }

  if (action === "advance") {
    // Same tick advances drips AND runs the orchestrator (cheap, idempotent glue).
    const [result, orchestration] = await Promise.all([
      advanceEnrollments(),
      runOrchestrator().catch((err) => {
        console.error("[orchestrator] tick failed:", err);
        return null;
      }),
    ]);
    return Response.json({ ...result, orchestration });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const planId = searchParams.get("planId");
  const leadId = searchParams.get("leadId");

  if (!planId || !leadId) {
    return Response.json({ error: "planId and leadId required" }, { status: 400 });
  }

  const status = await getEnrollmentStatus(planId, leadId);
  return Response.json(status ?? { enrolled: false });
}
