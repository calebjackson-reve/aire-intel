import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));
  const stage = searchParams.get("stage") || "";
  const excludeStage = searchParams.get("excludeStage") || "";

  const where: Record<string, unknown> = {};
  if (stage) where.stage = stage;
  if (excludeStage) where.stage = { not: excludeStage };

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.lead.count({ where }),
  ]);

  return Response.json({ leads, total, page, limit });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const lead = await prisma.lead.create({ data: body });
  return Response.json(lead, { status: 201 });
}
