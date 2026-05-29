import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const lead = await prisma.lead.update({ where: { id }, data: body });
  return Response.json(lead);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.lead.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
