export const dynamic = "force-dynamic";
// AIRE: loop:revival-performance
// Vercel cron: 30 13 * * 1 (7:30AM CT Monday, bi-weekly via lastEvaluation guard)
// Analyzes RevivalCohort records + ContactLog inbound replies over 30 days.
// Calculates reply rate and stage advancement; alerts if reply rate < 8%.

import { verifyCronSecret, verifyCronOrInternal, cronUnauthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { getSetting, invalidateSettingsCache } from "@/lib/settings";
import { logError, withRetry } from "@/lib/error-memory";
import { getTwilioConfig, sendSMS } from "@/lib/twilio";

async function upsertSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  invalidateSettingsCache([key]);
}

async function runRevivalTracker() {
  const now = new Date();

  // Idempotency: skip if run within last 12 days
  const lastEvalStr = await getSetting("revival.lastEvaluation");
  if (lastEvalStr) {
    const daysSince = (now.getTime() - new Date(lastEvalStr).getTime()) / 86_400_000;
    if (daysSince < 12) {
      return Response.json({ ok: true, skipped: true, reason: "ran_within_12_days", daysSince: Math.round(daysSince) });
    }
  }

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

  const cohorts = await withRetry(() =>
    prisma.revivalCohort.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: "asc" },
    }),
    { source: "revival-tracker" }
  );

  // Flatten treatment lead IDs, tracking which cohort each belongs to
  const allLeadIds: string[] = [];
  const cohortCreatedAt: Record<string, Date> = {};

  for (const cohort of cohorts) {
    let ids: string[] = [];
    try { ids = JSON.parse(cohort.leadIds); } catch { continue; }
    for (const id of ids) {
      if (!cohortCreatedAt[id]) {
        allLeadIds.push(id);
        cohortCreatedAt[id] = cohort.createdAt;
      }
    }
  }

  if (allLeadIds.length < 10) {
    await prisma.notification.create({
      data: {
        type: "revival_performance",
        title: "Revival Tracker: Not enough history yet",
        body: `Only ${allLeadIds.length} leads in revival cohorts over 30 days. Check back after 2 weeks of agent runs.`,
        href: "/contacts",
      },
    });
    return Response.json({ ok: true, skipped: true, reason: "insufficient_history", totalLeads: allLeadIds.length });
  }

  // Find inbound replies within 7 days of each lead's cohort creation date
  const inboundLogs = await withRetry(() =>
    prisma.contactLog.findMany({
      where: {
        leadId: { in: allLeadIds },
        direction: "inbound",
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { leadId: true, createdAt: true },
    }),
    { source: "revival-tracker" }
  );

  const sevenDaysMs = 7 * 86_400_000;
  const repliedLeadIds = new Set<string>();
  for (const log of inboundLogs) {
    const cohortDate = cohortCreatedAt[log.leadId];
    if (cohortDate && log.createdAt.getTime() - cohortDate.getTime() <= sevenDaysMs) {
      repliedLeadIds.add(log.leadId);
    }
  }

  const totalLeads = allLeadIds.length;
  const repliedCount = repliedLeadIds.size;
  const replyRate = repliedCount / Math.max(totalLeads, 1);

  // Stage advancement: replied leads now in a warmer stage than cold/dead
  const advancedLeads = repliedCount > 0
    ? await withRetry(() =>
        prisma.lead.findMany({
          where: {
            id: { in: [...repliedLeadIds] },
            stage: { in: ["active", "warm", "hot", "under_contract", "closed"] },
          },
          select: { id: true },
        }),
        { source: "revival-tracker" }
      )
    : [];
  const advancedCount = advancedLeads.length;
  const stageAdvancement = advancedCount / Math.max(repliedCount, 1);

  // Best message pattern: revival MessageDrafts for leads who replied
  const topPattern = await (async () => {
    if (repliedCount === 0) return "text";
    const drafts = await withRetry(() =>
      prisma.messageDraft.findMany({
        where: { leadId: { in: [...repliedLeadIds] }, source: "revival" },
        select: { channel: true, subject: true },
      }),
      { source: "revival-tracker" }
    );
    if (drafts.length === 0) return "text";
    const counts: Record<string, number> = {};
    for (const d of drafts) {
      const key = d.subject ? "email" : d.channel;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  })();

  // Write settings
  await Promise.all([
    upsertSetting("revival.lastReplyRate", replyRate.toString()),
    upsertSetting("revival.bestMessagePattern", topPattern),
    upsertSetting("revival.lastEvaluation", now.toISOString()),
  ]);

  const alertThreshold = parseFloat((await getSetting("revival.alertThreshold")) ?? "0.08");
  const isCritical = replyRate < alertThreshold;
  const replyRatePct = Math.round(replyRate * 100);
  const advancementPct = Math.round(stageAdvancement * 100);

  const statusLabel = replyRatePct >= 12 ? "on track" : isCritical ? "critical — consider pausing" : "below target";
  await prisma.notification.create({
    data: {
      type: "revival_performance",
      title: `Revival Tracker: ${replyRatePct}% reply rate`,
      body: `Reply rate: ${replyRatePct}% (${repliedCount}/${totalLeads}). Stage advancement: ${advancementPct}%. Best pattern: ${topPattern}. Status: ${statusLabel}.`,
      href: "/contacts",
    },
  });

  if (isCritical) {
    try {
      const [twilioConfig, calebPhone] = await Promise.all([
        getTwilioConfig(),
        getSetting("CALEB_PHONE"),
      ]);
      if (twilioConfig && calebPhone) {
        await withRetry(() =>
          sendSMS(
            calebPhone,
            `AIRE Revival Alert: reply rate is ${replyRatePct}% (threshold: ${Math.round(alertThreshold * 100)}%). Review revival message templates at /contacts.`,
            twilioConfig
          ),
          { source: "revival-tracker", type: "twilio" }
        );
      }
    } catch (err) {
      logError("twilio", "revival-tracker", err, { replyRate });
    }
  }

  return Response.json({
    ok: true,
    totalLeads,
    repliedCount,
    replyRate,
    stageAdvancement,
    topPattern,
    isCritical,
  });
}

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  return runRevivalTracker();
}

export async function GET(request: Request) {
  if (!verifyCronOrInternal(request)) return cronUnauthorized();
  return runRevivalTracker();
}
