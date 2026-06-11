export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/actions/[id]/skip — skip a pending or approved ActionQueue item
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const item = await prisma.actionQueue.findUnique({ where: { id } });
  if (!item) return Response.json({ error: "Not found" }, { status: 404 });
  if (!["pending", "approved"].includes(item.status)) {
    return Response.json({ error: `Cannot skip — current status: ${item.status}` }, { status: 409 });
  }

  const updated = await prisma.actionQueue.update({
    where: { id },
    data: { status: "skipped", skippedAt: new Date() },
  });

  return Response.json({ item: updated });
}
