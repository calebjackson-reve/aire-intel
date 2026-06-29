export const dynamic = "force-dynamic";
// AIRE Loop 34 — content-pipeline-watch
// Cron: 0 14 * * * (Daily 9AM CT = 2PM UTC)
// Oracle: ActionQueue pending count — pure DB query, no AI, no external API
// Ensures the content pipeline never runs dry.
// If < 3 pending post_content items → triggers content-scheduler.
// If empty 2 consecutive days → escalates notification.

import { verifyCronSecret, verifyCronOrInternal, cronUnauthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { getTodayCT } from "@/lib/brief-date";
import { getSetting, invalidateSettingsCache } from "@/lib/settings";
import { logError } from "@/lib/error-memory";

async function upsertSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  invalidateSettingsCache([key]);
}

export async function POST(req: Request) {
  if (!verifyCronSecret((req as Request & { headers: Headers }).headers.get("x-cron-secret"))) return cronUnauthorized();
  return runPipelineWatch();
}

export async function GET(request: Request) {
  if (!verifyCronOrInternal(request)) return cronUnauthorized();
  return runPipelineWatch();
}

async function runPipelineWatch() {
  try {
    const today = getTodayCT();

    // Count pending post_content items
    const pendingCount = await prisma.actionQueue.count({
      where: { type: "post_content", status: "pending" },
    });

    // Count auto-generated today (cap at 5 to avoid runaway)
    const todayGenerated = await prisma.actionQueue.count({
      where: { agentType: "content_scheduler", briefDate: today, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });

    if (pendingCount >= 3) {
      await upsertSetting("content.pipeline.consecutiveEmptyDays", "0");
      return Response.json({ ok: true, pipelineFull: true, pendingCount });
    }

    // Track consecutive empty days for escalation
    const consecutiveStr = await getSetting("content.pipeline.consecutiveEmptyDays");
    let consecutiveEmpty = parseInt(consecutiveStr ?? "0", 10);

    if (pendingCount === 0) {
      consecutiveEmpty += 1;
      await upsertSetting("content.pipeline.consecutiveEmptyDays", String(consecutiveEmpty));
      await upsertSetting("content.pipeline.lastEmptyDate", today);
    } else {
      consecutiveEmpty = 0;
      await upsertSetting("content.pipeline.consecutiveEmptyDays", "0");
    }

    // Trigger scheduler if under the daily cap
    let triggered = false;
    if (todayGenerated < 5) {
      try {
        const schedulerUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/agents/content-scheduler`;
        await fetch(schedulerUrl, { method: "GET", signal: AbortSignal.timeout(30_000) });
        triggered = true;
      } catch (err) {
        await logError("api_failure", "content-pipeline-watch/trigger-scheduler", err as Error);
      }
    }

    // Notification
    if (pendingCount === 0) {
      await prisma.notification.create({
        data: {
          type: consecutiveEmpty >= 2 ? "warning" : "info",
          title: consecutiveEmpty >= 2
            ? `⚠ Content pipeline empty ${consecutiveEmpty} days in a row`
            : "Content pipeline low — auto-refilling",
          body: triggered
            ? "Content Scheduler triggered to generate today's post."
            : "Daily generation cap reached — check again tomorrow.",
          href: "/content-calendar",
        },
      }).catch(() => null);
    }

    return Response.json({
      ok: true,
      pipelineFull: false,
      pendingCount,
      todayGenerated,
      triggered,
      consecutiveEmpty,
    });
  } catch (err) {
    await logError("api_failure", "content-pipeline-watch", err as Error);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
