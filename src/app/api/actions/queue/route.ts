export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";

// GET /api/actions/queue
// Returns pending ActionQueue items sorted by priority for the Today view.
// Also returns total count and done count for the day.
export async function GET() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [items, doneToday] = await Promise.all([
    prisma.actionQueue.findMany({
      where: { status: "pending" },
      include: {
        lead: {
          select: {
            id: true, name: true, phone: true, email: true,
            stage: true, lastContactDate: true,
          },
        },
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      take: 20,
    }),
    prisma.actionQueue.count({
      where: {
        status: { in: ["executed", "skipped"] },
        updatedAt: { gte: todayStart },
      },
    }),
  ]);

  return Response.json({
    items: items.map(i => ({
      id: i.id,
      type: i.type,
      priority: i.priority,
      payload: i.payload,
      lead: i.lead,
      createdAt: i.createdAt,
    })),
    total: items.length + doneToday,
    done: doneToday,
  });
}
