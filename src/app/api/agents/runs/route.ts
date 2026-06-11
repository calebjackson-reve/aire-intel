export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/agents/runs — list AgentRun records for the observability dashboard
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agentType = searchParams.get("agentType");
  const take = Math.min(parseInt(searchParams.get("take") ?? "50"), 200);

  const runs = await prisma.agentRun.findMany({
    where: agentType ? { agentType } : undefined,
    orderBy: { startedAt: "desc" },
    take,
  });

  // Summary stats
  const stats = await prisma.agentRun.groupBy({
    by: ["agentType", "status"],
    _count: { id: true },
    orderBy: { agentType: "asc" },
  });

  return Response.json({ runs, stats });
}
