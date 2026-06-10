// AIRE: loop:content-performance-learning
// Vercel cron: 0 5 * * 0 (Sunday 11PM CT = Monday 5AM UTC)
// Pulls 30-day Meta engagement data, groups by content type, writes learning metrics to Settings.

import { verifyCronSecret, cronUnauthorized } from "@/lib/cron-auth";
import { withRetry, logError } from "@/lib/error-memory";
import { invalidateSettingsCache } from "@/lib/settings";
import { buildContentAudit, getPageInsights } from "@/lib/meta-insights";
import { prisma } from "@/lib/prisma";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function upsertSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  invalidateSettingsCache([key]);
}

async function runContentLearning() {
  const startedAt = Date.now();

  // Idempotency: skip if already ran within 6 days
  const lastRunRow = await prisma.setting
    .findUnique({ where: { key: "content.lastLearningRun" } })
    .catch(() => null);
  if (lastRunRow?.value) {
    const daysSince = (Date.now() - new Date(lastRunRow.value).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 6) {
      return Response.json({ skipped: true, reason: "already ran within 6 days", lastRun: lastRunRow.value });
    }
  }

  // Check disable flag
  const disabledRow = await prisma.setting
    .findUnique({ where: { key: "loop.content_performance_learning.disabled" } })
    .catch(() => null);
  if (disabledRow?.value === "true") {
    return Response.json({ skipped: true, reason: "loop disabled" });
  }

  let audit: Awaited<ReturnType<typeof buildContentAudit>>;
  try {
    audit = await withRetry(() => buildContentAudit(), {
      source: "content-learning/buildContentAudit",
      type: "meta",
    });
  } catch (err) {
    await logError("api_failure", "content-learning", err instanceof Error ? err : new Error(String(err)));
    await prisma.notification
      .create({
        data: {
          type: "info",
          title: "Content Learning: Meta data unavailable",
          body: "Could not fetch engagement data from Meta. Will retry next week.",
          href: "/settings",
        },
      })
      .catch(() => null);
    return Response.json({ error: "Meta data fetch failed" }, { status: 502 });
  }

  // Insufficient data guard (SPEC: < 5 posts → skip)
  if (audit.totalPosts < 5) {
    await prisma.notification
      .create({
        data: {
          type: "info",
          title: "Content Learning: Not enough post history",
          body: "Publish more content via AIRE to enable performance learning.",
          href: "/social",
        },
      })
      .catch(() => null);
    return Response.json({
      ok: true,
      skipped: true,
      reason: "insufficient post history",
      totalPosts: audit.totalPosts,
    });
  }

  const topPerformer = audit.byType[0];
  const bottomPerformer = audit.byType[audit.byType.length - 1];

  // Best day-of-week and hour — derived from raw per-post publishedAt in cached insights
  let bestDay = 1;
  let bestHour = 9;
  try {
    const insights = await getPageInsights();
    const dayBuckets = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }));
    const hourBuckets = Array.from({ length: 24 }, () => ({ total: 0, count: 0 }));

    for (const post of insights.posts) {
      const d = new Date(post.publishedAt);
      const day = d.getUTCDay();
      const hour = d.getUTCHours();
      dayBuckets[day].total += post.engagementRate;
      dayBuckets[day].count += 1;
      hourBuckets[hour].total += post.engagementRate;
      hourBuckets[hour].count += 1;
    }

    let bestDayRate = -1;
    for (let i = 0; i < 7; i++) {
      if (dayBuckets[i].count > 0) {
        const avg = dayBuckets[i].total / dayBuckets[i].count;
        if (avg > bestDayRate) { bestDayRate = avg; bestDay = i; }
      }
    }

    let bestHourRate = -1;
    for (let i = 0; i < 24; i++) {
      if (hourBuckets[i].count > 0) {
        const avg = hourBuckets[i].total / hourBuckets[i].count;
        if (avg > bestHourRate) { bestHourRate = avg; bestHour = i; }
      }
    }
  } catch (err) {
    await logError("api_failure", "content-learning/day-time", err instanceof Error ? err : new Error(String(err)));
    // Non-fatal: proceed with defaults (Monday 9am)
  }

  // Build 2-sentence insight
  const topPct = (topPerformer.avgEngagementRate * 100).toFixed(1);
  const bottomPct = (bottomPerformer.avgEngagementRate * 100).toFixed(1);
  const ratio = bottomPerformer.avgEngagementRate > 0
    ? (topPerformer.avgEngagementRate / bottomPerformer.avgEngagementRate).toFixed(1)
    : "∞";
  const hourLabel = bestHour === 0 ? "12am" : bestHour < 12 ? `${bestHour}am` : bestHour === 12 ? "12pm" : `${bestHour - 12}pm`;
  const insightBody =
    `${topPerformer.type.replace(/_/g, " ")} posts averaged ${topPct}% engagement — ${ratio}x higher than ${bottomPerformer.type.replace(/_/g, " ")} at ${bottomPct}%. ` +
    `Best posting time: ${DAYS[bestDay]} at ${hourLabel}.`;

  // Write learning outputs to Settings
  const now = new Date().toISOString();
  await Promise.all([
    upsertSetting("content.topType", topPerformer.type),
    upsertSetting("content.bottomType", bottomPerformer.type),
    upsertSetting("content.bestDayOfWeek", String(bestDay)),
    upsertSetting("content.bestTimeOfDay", String(bestHour)),
    upsertSetting("content.lastLearningRun", now),
  ]);

  await prisma.notification
    .create({
      data: {
        type: "info",
        title: `Content Learning: ${topPerformer.type.replace(/_/g, " ")} leads engagement`,
        body: insightBody,
        href: "/social",
      },
    })
    .catch(() => null);

  await prisma.agentRun
    .create({
      data: {
        agentType: "content_learning",
        status: "completed",
        completedAt: new Date(),
        itemsProcessed: audit.totalPosts,
        actionsQueued: 0,
        durationMs: Date.now() - startedAt,
      },
    })
    .catch(() => null);

  return Response.json({
    ok: true,
    totalPosts: audit.totalPosts,
    topType: topPerformer.type,
    bottomType: bottomPerformer.type,
    bestDayOfWeek: bestDay,
    bestTimeOfDay: bestHour,
    insight: insightBody,
  });
}

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  try {
    return await runContentLearning();
  } catch (err) {
    await logError("api_failure", "content-learning", err instanceof Error ? err : new Error(String(err)));
    return Response.json({ error: "Content learning failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    return await runContentLearning();
  } catch (err) {
    await logError("api_failure", "content-learning", err instanceof Error ? err : new Error(String(err)));
    return Response.json({ error: "Content learning failed" }, { status: 500 });
  }
}
