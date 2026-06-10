import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import webpush from "web-push";

// POST /api/push/send — send a push notification to all stored subscriptions
// Called internally by brief-delivery.ts or manually

function setupVapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL ?? "mailto:caleb.jackson@reverealtors.com";

  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(email, publicKey, privateKey);
  return true;
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  // Allow calls from the brief delivery module (internal) or manual admin call
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!setupVapid()) {
    return Response.json({ ok: false, error: "VAPID keys not configured" }, { status: 503 });
  }

  const body = await request.json();
  const { title = "AIRÉ", body: msgBody = "", url = "/", tag } = body;

  // Load all stored push subscriptions
  const settings = await prisma.setting.findMany({
    where: { key: { startsWith: "push_sub_" } },
  });

  const results: Array<{ endpoint: string; ok: boolean; error?: string }> = [];

  for (const setting of settings) {
    let sub;
    try {
      sub = JSON.parse(setting.value);
    } catch {
      continue;
    }

    try {
      await webpush.sendNotification(
        sub,
        JSON.stringify({ title, body: msgBody, url, tag: tag ?? "aire-notification" })
      );
      results.push({ endpoint: sub.endpoint.slice(-20), ok: true });
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 410 || status === 404) {
        // Subscription expired — remove it
        await prisma.setting.delete({ where: { key: setting.key } }).catch(() => null);
      }
      results.push({ endpoint: sub.endpoint.slice(-20), ok: false, error: String(err) });
    }
  }

  const sent = results.filter((r) => r.ok).length;
  return Response.json({ ok: true, sent, total: settings.length, results });
}
