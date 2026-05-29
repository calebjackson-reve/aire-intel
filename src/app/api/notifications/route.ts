import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") === "1";

  const notifications = await prisma.notification.findMany({
    where: unreadOnly ? { read: false } : {},
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({ where: { read: false } });
  return Response.json({ notifications, unreadCount });
}

export async function PATCH(request: NextRequest) {
  const { id, all } = await request.json();

  if (all) {
    await prisma.notification.updateMany({ where: { read: false }, data: { read: true } });
    return Response.json({ ok: true });
  }

  if (id) {
    const n = await prisma.notification.update({ where: { id }, data: { read: true } });
    return Response.json(n);
  }

  return Response.json({ error: "id or all required" }, { status: 400 });
}
