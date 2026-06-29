export const dynamic = "force-dynamic";

// Loop 29 — Messenger Inbox Monitor
// Cron: 0 */2 * * * — Escalates unanswered messenger draft_message items via Twilio SMS to Caleb.
// Checks ContactLog for manual replies before escalating. Idempotent per lead per 4h window.

import { verifyCronSecret, verifyCronOrInternal, cronUnauthorized } from "@/lib/cron-auth";
import { startRun, finishRun, failRun } from "@/lib/agent-run";
import { prisma } from "@/lib/prisma";
import { getTwilioConfig, sendSMS, normalizePhone } from "@/lib/twilio";
import { getSetting } from "@/lib/settings";

const PENDING_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours
const ESCALATION_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4h between escalations per lead
const MAX_ESCALATIONS_PER_RUN = 5;

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  return runMessengerMonitor();
}

export async function GET(request: Request) {
  if (!verifyCronOrInternal(request)) return cronUnauthorized();
  return runMessengerMonitor();
}

async function runMessengerMonitor() {
  const runId = await startRun("market_intel");

  try {
    const cutoffTime = new Date(Date.now() - PENDING_THRESHOLD_MS);

    // Query pending messenger draft_message items older than 4h
    const pendingItems = await prisma.actionQueue.findMany({
      where: {
        type: "draft_message",
        status: "pending",
        createdAt: { lt: cutoffTime },
      },
      include: {
        lead: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: MAX_ESCALATIONS_PER_RUN * 3, // fetch extras to filter
    });

    // Filter to messenger items only (payload.channel === "messenger")
    const messengerItems = pendingItems.filter((item) => {
      const payload = item.payload as Record<string, unknown>;
      return payload.channel === "messenger";
    });

    if (messengerItems.length === 0) {
      await finishRun(runId, { itemsProcessed: 0, actionsQueued: 0 });
      return Response.json({ ok: true, checked: 0, escalated: 0 });
    }

    // Get Twilio config and Caleb's phone
    const [twilioConfig, calebPhone] = await Promise.all([
      getTwilioConfig(),
      getSetting("CALEB_PHONE").then((v) => v ?? process.env.CALEB_PHONE ?? null),
    ]);

    let checked = 0;
    let escalated = 0;
    const errors: unknown[] = [];

    for (const item of messengerItems) {
      if (escalated >= MAX_ESCALATIONS_PER_RUN) break;
      checked++;

      const payload = item.payload as Record<string, unknown>;
      const leadId = item.leadId ?? (payload.leadId as string | undefined);
      const leadName = item.lead?.name ?? (payload.leadName as string | undefined) ?? "Unknown";

      if (!leadId) continue;

      try {
        // Check if Caleb already manually replied in ContactLog since item was created
        const manualReply = await prisma.contactLog.findFirst({
          where: {
            leadId,
            direction: "outbound",
            createdAt: { gte: item.createdAt },
          },
        });
        if (manualReply) continue; // Caleb already replied

        // Idempotency: check cooldown per lead
        const cooldownKey = `messenger_escalation.${leadId}.last_sent`;
        const lastSent = await getSetting(cooldownKey);
        if (lastSent) {
          const lastSentMs = new Date(lastSent).getTime();
          if (!isNaN(lastSentMs) && Date.now() - lastSentMs < ESCALATION_COOLDOWN_MS) {
            continue; // Within cooldown window
          }
        }

        // Send SMS escalation if Twilio is configured
        const smsBody = `AIRE: ${leadName} hasn't been replied to on messenger in 4h. Check inbox. /contacts/${leadId}`;

        if (twilioConfig && calebPhone) {
          await sendSMS(normalizePhone(calebPhone), smsBody, twilioConfig);
        }

        // Write idempotency key regardless (so Notification is also idempotent)
        const now = new Date().toISOString();
        await prisma.setting.upsert({
          where: { key: cooldownKey },
          create: { key: cooldownKey, value: now },
          update: { value: now },
        });

        // Notification (always, even if SMS fails)
        await prisma.notification.create({
          data: {
            type: "lead_assigned",
            title: `Messenger escalation: ${leadName}`,
            body: twilioConfig && calebPhone
              ? "SMS sent — messenger item pending 4h+"
              : "Messenger item pending 4h+ (Twilio not configured — no SMS sent)",
            href: `/contacts/${leadId}`,
          },
        });

        escalated++;
      } catch (err) {
        errors.push({ leadId, error: String(err) });
      }
    }

    await finishRun(runId, { itemsProcessed: checked, actionsQueued: escalated, errorLog: errors });

    return Response.json({ ok: true, checked, escalated });
  } catch (err) {
    await failRun(runId, err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
