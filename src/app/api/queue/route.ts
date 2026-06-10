import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/queue — list ActionQueue items with optional filters
// ?status=pending|approved|executed|skipped|failed
// ?agentType=lead_revival|transaction_watchdog|...
// ?briefDate=2026-06-09
// ?leadId=xxx
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const agentType = searchParams.get("agentType");
  const briefDate = searchParams.get("briefDate");
  const leadId = searchParams.get("leadId");
  const take = Math.min(parseInt(searchParams.get("take") ?? "50"), 200);

  const items = await prisma.actionQueue.findMany({
    where: {
      ...(status && { status }),
      ...(agentType && { agentType }),
      ...(briefDate && { briefDate }),
      ...(leadId && { leadId }),
    },
    include: {
      lead: { select: { id: true, name: true, phone: true, email: true } },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    take,
  });

  const pendingCount = await prisma.actionQueue.count({ where: { status: "pending" } });

  return Response.json({ items, pendingCount, total: items.length });
}

// POST /api/queue — create an ActionQueue item directly (admin/dev use)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { type, payload, agentType, leadId, requiresApproval, priority, briefDate, scheduledFor } = body;

  if (!type || !payload || !agentType) {
    return Response.json({ error: "type, payload, and agentType are required" }, { status: 400 });
  }

  const item = await prisma.actionQueue.create({
    data: {
      type,
      payload,
      agentType,
      leadId: leadId ?? null,
      requiresApproval: requiresApproval ?? true,
      priority: priority ?? 5,
      briefDate: briefDate ?? null,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    },
  });

  return Response.json({ item }, { status: 201 });
}
