export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const tasks = await prisma.task.findMany({
    where: { done: false },
    orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
    include: { lead: { select: { id: true, name: true, stage: true } } },
  });
  return Response.json(tasks);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const task = await prisma.task.create({ data: body });
  return Response.json(task, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { id, ...data } = await request.json();
  const task = await prisma.task.update({
    where: { id },
    data: { ...data, ...(data.done ? { doneAt: new Date() } : {}) },
  });
  return Response.json(task);
}
