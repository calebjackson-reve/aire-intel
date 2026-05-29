import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { detectPatterns, getHealthScore } from "@/lib/error-memory";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (action === "health") {
    const [health, patterns] = await Promise.all([
      getHealthScore(),
      detectPatterns(),
    ]);
    return Response.json({ health, patterns });
  }

  const errors = await prisma.errorLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return Response.json(errors);
}

// Log an error from the client (React error boundary, etc.)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { type, source, message, context, stack } = body;

  const log = await prisma.errorLog.create({
    data: {
      type: type ?? "ui",
      source: source ?? "client",
      message: String(message ?? "Unknown error").slice(0, 1000),
      stack: stack ? String(stack).slice(0, 2000) : null,
      context: context ? JSON.stringify(context) : null,
    },
  });

  return Response.json(log, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { id, resolved, resolution } = await request.json();

  const log = await prisma.errorLog.update({
    where: { id },
    data: {
      resolved: resolved ?? true,
      resolution: resolution ?? "Manually resolved",
      resolvedAt: new Date(),
    },
  });

  return Response.json(log);
}

export async function DELETE(request: NextRequest) {
  const { id, all } = await request.json();

  if (all) {
    await prisma.errorLog.deleteMany({ where: { resolved: true } });
    return new Response(null, { status: 204 });
  }

  await prisma.errorLog.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
