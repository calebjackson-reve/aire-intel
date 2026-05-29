import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const stage = searchParams.get("stage") || "";
  const type = searchParams.get("type") || "";
  const coldDaysParam = searchParams.get("cold");
  const coldDays = coldDaysParam ? Math.max(1, parseInt(coldDaysParam)) : null;
  const page = Math.max(0, parseInt(searchParams.get("page") || "0"));
  const limit = 50;

  // Build the cold-filter clause once. A "cold" lead has either never been
  // contacted or their lastContactDate is older than N days. We also exclude
  // closed leads, since the agent doesn't need to re-engage them.
  const coldClause = coldDays !== null
    ? {
        AND: [
          { stage: { notIn: ["closed"] } },
          {
            OR: [
              { lastContactDate: null },
              { lastContactDate: { lt: new Date(Date.now() - coldDays * 86_400_000) } },
            ],
          },
        ],
      }
    : {};

  const where = {
    AND: [
      q ? { name: { contains: q } } : {},
      stage ? { stage } : {},
      type ? { type } : {},
      coldClause,
    ],
  };

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      // When filtering by cold, surface the staleest leads first so the agent
      // hits the most-overdue conversations at the top of the list.
      orderBy: coldDays !== null
        ? [{ lastContactDate: { sort: "asc", nulls: "first" } }, { updatedAt: "desc" }]
        : { updatedAt: "desc" },
      take: limit,
      skip: page * limit,
      include: {
        tasks: { where: { done: false }, orderBy: { dueDate: "asc" }, take: 1 },
        _count: { select: { timeline_logs: true } },
      },
    }),
    prisma.lead.count({ where }),
  ]);

  return Response.json({ leads, total, page, limit, pages: Math.ceil(total / limit), filter: { coldDays } });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const lead = await prisma.lead.create({ data: body });
  return Response.json(lead, { status: 201 });
}
