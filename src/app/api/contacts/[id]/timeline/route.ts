import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { triggerZap } from "@/lib/zapier";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { method, note, direction } = await request.json();

  const [log] = await prisma.$transaction([
    prisma.contactLog.create({
      data: { leadId: id, method, note, direction: direction ?? "outbound" },
    }),
    prisma.lead.update({
      where: { id },
      data: { lastContactDate: new Date() },
    }),
  ]);

  triggerZap("activity.logged", {
    leadId: id,
    logId: log.id,
    method,
    direction: direction ?? "outbound",
    note,
  });

  return Response.json(log, { status: 201 });
}
