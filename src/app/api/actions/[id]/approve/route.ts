import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/actions/[id]/approve — mark an ActionQueue item as approved
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const item = await prisma.actionQueue.findUnique({ where: { id } });
  if (!item) return Response.json({ error: "Not found" }, { status: 404 });
  if (item.status !== "pending") {
    return Response.json({ error: `Cannot approve — current status: ${item.status}` }, { status: 409 });
  }

  const updated = await prisma.actionQueue.update({
    where: { id },
    data: { status: "approved", approvedAt: new Date() },
  });

  return Response.json({ item: updated });
}
