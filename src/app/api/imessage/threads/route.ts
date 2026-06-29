export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/imessage/threads?phone=+1225...&limit=50
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get("phone");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

  // Single thread — return messages
  if (phone) {
    const thread = await prisma.iMessageThread.findUnique({
      where: { phone },
      include: {
        lead: { select: { id: true, name: true, stage: true, phone: true } },
        messages: {
          orderBy: { sentAt: "asc" },
          take: 200,
        },
      },
    });
    if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(thread);
  }

  // Thread list — inbox view
  const threads = await prisma.iMessageThread.findMany({
    orderBy: { lastAt: "desc" },
    take: limit,
    include: {
      lead: { select: { id: true, name: true, stage: true } },
      _count: { select: { messages: true } },
    },
  });

  const needsReplyCount = await prisma.iMessageThread.count({
    where: { needsReply: true },
  });

  return NextResponse.json({ threads, needsReplyCount, total: threads.length });
}
