import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const goals = await prisma.goal.findMany();
  return Response.json(goals);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const year = body.year ?? new Date().getFullYear();
  const goal = await prisma.goal.upsert({
    where: { metric: body.metric },
    update: { targetValue: parseFloat(body.targetValue), year, period: body.period ?? "year", notes: body.notes ?? null },
    create: {
      metric: body.metric,
      targetValue: parseFloat(body.targetValue),
      period: body.period ?? "year",
      year,
      notes: body.notes ?? null,
    },
  });
  return Response.json(goal, { status: 201 });
}
