import { verifyCronSecret, cronUnauthorized } from "@/lib/cron-auth";
import { startRun, finishRun, failRun } from "@/lib/agent-run";
import { assembleBrief } from "@/lib/brief-assembler";
import { deliverBrief } from "@/lib/brief-delivery";
import { prisma } from "@/lib/prisma";
import { getSetting, invalidateSettingsCache } from "@/lib/settings";
import { checkLoftyHealth } from "@/lib/lofty";
import { getTwilioConfig, sendSMS, normalizePhone } from "@/lib/twilio";

// Morning Brief Assembler — runs at 5:00 AM CT (11:00 UTC) via Vercel cron
// Reads all overnight agent outputs, assembles DailyBrief, delivers via all 4 channels

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  return runMorningBrief();
}

export async function GET() {
  return runMorningBrief();
}

async function runMorningBrief() {
  const runId = await startRun("morning_brief");

  // AIRE: loop:lofty-sync-health — once-per-day Lofty health gate
  try {
    const lastCheck = await getSetting("lofty.lastHealthCheck");
    const stale = !lastCheck || Date.now() - new Date(lastCheck).getTime() > 23 * 60 * 60 * 1000;
    if (stale) {
      const health = await checkLoftyHealth();
      const now = new Date().toISOString();
      await Promise.all([
        prisma.setting.upsert({ where: { key: "lofty.tokenStatus" }, update: { value: health.status }, create: { key: "lofty.tokenStatus", value: health.status } }),
        prisma.setting.upsert({ where: { key: "lofty.lastHealthCheck" }, update: { value: now }, create: { key: "lofty.lastHealthCheck", value: now } }),
        prisma.setting.upsert({ where: { key: "lofty.apiResponseMs" }, update: { value: String(health.responseMs) }, create: { key: "lofty.apiResponseMs", value: String(health.responseMs) } }),
      ]);
      invalidateSettingsCache(["lofty.tokenStatus", "lofty.lastHealthCheck", "lofty.apiResponseMs"]);

      if (health.status === "auth_expired") {
        await prisma.notification.create({
          data: {
            type: "critical",
            title: "Lofty auth expired",
            body: "Lofty authentication expired — AIRE cannot sync leads until you re-authenticate at lofty.com",
            href: "/settings",
          },
        });
        const calebPhone = process.env.CALEB_PHONE ?? process.env.TWILIO_TO_PHONE ?? "";
        if (calebPhone) {
          const twilio = await getTwilioConfig();
          if (twilio) await sendSMS(normalizePhone(calebPhone), "Lofty auth expired — open Settings to reconnect", twilio);
        }
      } else if (health.status === "unreachable") {
        await prisma.notification.create({
          data: {
            type: "warning",
            title: "Lofty API unreachable",
            body: "Lofty API unreachable this morning — leads may not sync",
            href: "/settings",
          },
        });
      }
    }
  } catch {
    // Health check must never crash the brief
  }

  try {
    const brief = await assembleBrief(runId);

    const totalItems =
      brief.nonNegotiables.length +
      brief.goingCold.length +
      brief.owePeople.length +
      brief.contentQueued.length +
      brief.marketMovement.length;

    const delivery = await deliverBrief(brief);

    await finishRun(runId, {
      itemsProcessed: totalItems,
      actionsQueued: 0,
    });

    return Response.json({
      ok: true,
      runId,
      date: brief.date,
      sections: {
        nonNegotiables: brief.nonNegotiables.length,
        goingCold: brief.goingCold.length,
        owePeople: brief.owePeople.length,
        contentQueued: brief.contentQueued.length,
        marketMovement: brief.marketMovement.length,
      },
      totalItems,
      delivery,
      smsSummary: brief.smsSummary,
    });
  } catch (err) {
    await failRun(runId, err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
