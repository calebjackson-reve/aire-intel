import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/push/subscribe — save a Web Push subscription for push notifications
// Called from the client after service worker registration
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { subscription } = body;

  if (!subscription?.endpoint) {
    return Response.json({ error: "Invalid subscription" }, { status: 400 });
  }

  // Store in Settings table (one record per endpoint)
  const key = `push_sub_${Buffer.from(subscription.endpoint).toString("base64").slice(0, 32)}`;
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(subscription) },
    update: { value: JSON.stringify(subscription) },
  });

  return Response.json({ ok: true });
}

// DELETE /api/push/subscribe — remove a subscription
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { endpoint } = body;
  if (!endpoint) return Response.json({ error: "Missing endpoint" }, { status: 400 });

  const key = `push_sub_${Buffer.from(endpoint).toString("base64").slice(0, 32)}`;
  await prisma.setting.delete({ where: { key } }).catch(() => null);

  return Response.json({ ok: true });
}
