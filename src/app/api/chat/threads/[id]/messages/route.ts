export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const messages = await prisma.chatMessage.findMany({
    where: { threadId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, toolCallsJson: true, createdAt: true },
  });
  return Response.json(messages);
}
