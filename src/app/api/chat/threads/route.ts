export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const threads = await prisma.chatThread.findMany({
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { id: true, title: true, messageCount: true, updatedAt: true },
  });
  return Response.json(threads);
}
