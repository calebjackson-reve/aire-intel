// AIRE: loop:sphere-reactivation
// Monthly cron (1st of month, 8AM CT). Finds sphere contacts inactive 60+ days,
// prioritizes by upcoming birthdays/anniversaries, queues 10 personalized check-in drafts.

import { verifyCronSecret, cronUnauthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { getSetting, invalidateSettingsCache } from "@/lib/settings";
import { generateDraft } from "@/lib/draft-agent";
import { logError, withRetry } from "@/lib/error-memory";

async function upsertSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  invalidateSettingsCache([key]);
}

function daysUntilOccurrence(date: Date | null, now: Date): number | null {
  if (!date) return null;
  const upcoming = new Date(date);
  upcoming.setFullYear(now.getFullYear());
  if (upcoming < now) upcoming.setFullYear(now.getFullYear() + 1);
  return Math.floor((upcoming.getTime() - now.getTime()) / 86_400_000);
}

async function runSphereReactivation() {
  const runStart = Date.now();
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);

  const lastRunMonth = await getSetting("sphere.lastRunMonth");
  if (lastRunMonth === currentMonth) {
    return Response.json({ ok: true, skipped: true, reason: "already_ran_this_month", month: currentMonth });
  }

  const thresholdRaw = await getSetting("sphere.reactivationThreshold");
  const threshold = parseInt(thresholdRaw ?? "60", 10);
  const cutoff = new Date(now.getTime() - threshold * 86_400_000);

  const candidates = await withRetry(
    () =>
      prisma.lead.findMany({
        where: {
          AND: [
            {
              OR: [{ source: "sphere" }, { tags: { contains: "sphere" } }],
            },
            { stage: { notIn: ["closed_won", "closed_lost"] } },
            {
              OR: [{ lastContactDate: { lt: cutoff } }, { lastContactDate: null }],
            },
          ],
        },
        select: {
          id: true,
          name: true,
          tags: true,
          birthday: true,
          anniversary: true,
          lastContactDate: true,
        },
      }),
    { source: "/api/agents/sphere-reactivation", type: "api_failure" },
  );

  const eligible = candidates.filter((l) => {
    const tags = (l.tags ?? "").split(",").map((t) => t.trim().toLowerCase());
    return !tags.includes("do_not_contact");
  });

  const prioritized = [...eligible].sort((a, b) => {
    const aBdays = daysUntilOccurrence(a.birthday, now);
    const bBdays = daysUntilOccurrence(b.birthday, now);
    const aBdayHit = aBdays !== null && aBdays <= 14;
    const bBdayHit = bBdays !== null && bBdays <= 14;
    if (aBdayHit !== bBdayHit) return aBdayHit ? -1 : 1;

    const aAnniv = daysUntilOccurrence(a.anniversary, now);
    const bAnniv = daysUntilOccurrence(b.anniversary, now);
    const aAnnivHit = aAnniv !== null && aAnniv <= 14;
    const bAnnivHit = bAnniv !== null && bAnniv <= 14;
    if (aAnnivHit !== bAnnivHit) return aAnnivHit ? -1 : 1;

    if (!a.lastContactDate && b.lastContactDate) return -1;
    if (a.lastContactDate && !b.lastContactDate) return 1;
    if (a.lastContactDate && b.lastContactDate) {
      return a.lastContactDate.getTime() - b.lastContactDate.getTime();
    }
    return 0;
  });

  const top10 = prioritized.slice(0, 10);

  const run = await prisma.agentRun.create({
    data: { agentType: "sphere_reactivation", status: "running" },
  });

  let queued = 0;
  let skipped = 0;

  for (const lead of top10) {
    const recentOutbound = await prisma.contactLog.findFirst({
      where: {
        leadId: lead.id,
        direction: "outbound",
        createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) },
      },
    });
    if (recentOutbound) { skipped++; continue; }

    const pendingDraft = await prisma.actionQueue.findFirst({
      where: { leadId: lead.id, type: "draft_message", status: "pending" },
    });
    if (pendingDraft) { skipped++; continue; }

    const staleDays = lead.lastContactDate
      ? Math.floor((now.getTime() - lead.lastContactDate.getTime()) / 86_400_000)
      : null;

    const bdayDays = daysUntilOccurrence(lead.birthday, now);
    const anniversaryDays = daysUntilOccurrence(lead.anniversary, now);
    const occasion =
      bdayDays !== null && bdayDays <= 14
        ? "birthday"
        : anniversaryDays !== null && anniversaryDays <= 14
          ? "anniversary"
          : null;

    const instruction = [
      occasion
        ? `Their ${occasion} is coming up in ${occasion === "birthday" ? bdayDays : anniversaryDays} day(s) — use this as a warm, genuine touchpoint.`
        : null,
      staleDays !== null ? `Last contact was ${staleDays} days ago.` : "Never contacted before.",
    ]
      .filter(Boolean)
      .join(" ");

    try {
      const draft = await withRetry(
        () => generateDraft({ leadId: lead.id, source: "sphere_reactivation", instruction }),
        { source: "/api/agents/sphere-reactivation", type: "ai" },
      );

      await prisma.actionQueue.create({
        data: {
          type: "draft_message",
          agentType: "sphere_reactivation",
          leadId: lead.id,
          requiresApproval: true,
          priority: 6,
          briefDate: now.toISOString().slice(0, 10),
          payload: {
            channel: draft.channel,
            subject: draft.subject,
            body: draft.body,
            reason: "sphere_reactivation",
            occasion: occasion ?? "general",
            staleDays,
          },
        },
      });

      queued++;
    } catch (err) {
      await logError("ai", "/api/agents/sphere-reactivation", err, { leadId: lead.id });
      skipped++;
    }
  }

  await upsertSetting("sphere.lastRunMonth", currentMonth);

  await prisma.notification.create({
    data: {
      type: "sync_complete",
      title: `Sphere Reactivation — ${queued} check-in${queued !== 1 ? "s" : ""} ready for review`,
      body: `${eligible.length} inactive sphere contacts found. ${queued} draft${queued !== 1 ? "s" : ""} queued, ${skipped} skipped.`,
      href: "/contacts",
    },
  });

  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      status: "completed",
      completedAt: new Date(),
      itemsProcessed: eligible.length,
      actionsQueued: queued,
      durationMs: Date.now() - runStart,
    },
  });

  return Response.json({
    ok: true,
    runId: run.id,
    month: currentMonth,
    eligibleCount: eligible.length,
    selectedCount: top10.length,
    queued,
    skipped,
  });
}

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  try {
    return await runSphereReactivation();
  } catch (err) {
    await logError("ai", "/api/agents/sphere-reactivation", err, {
      route: "/api/agents/sphere-reactivation",
      method: "POST",
    });
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
