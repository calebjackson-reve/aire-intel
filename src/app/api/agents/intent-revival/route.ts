// AIRE: loop:propstream-intent-revival
// Weekly Wednesday 7AM CT cron. Scores cold leads by Paragon listing activity in their
// target areas (new listings × 2 + price-drop signals × 3) and queues draft_message
// ActionQueue items for the top 10 scored leads.

import { verifyCronSecret, cronUnauthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { getSetting, invalidateSettingsCache, getParagonConfig } from "@/lib/settings";
import { fetchActiveListings, ParagonListing } from "@/lib/paragon";
import { generateDraft } from "@/lib/draft-agent";
import { logError, withRetry } from "@/lib/error-memory";

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function startOfISOWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7)); // roll back to Monday
  return d;
}

async function upsertSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  invalidateSettingsCache([key]);
}

async function runIntentRevival() {
  const runStart = Date.now();
  const now = new Date();
  const currentWeek = getISOWeek(now);

  const lastRunWeek = await getSetting("propstream.lastRunWeek");
  if (lastRunWeek === currentWeek) {
    return Response.json({ ok: true, skipped: true, reason: "already_ran_this_week", week: currentWeek });
  }

  const paragonConfig = await getParagonConfig();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const weekStart = startOfISOWeek(now);

  const coldLeads = await withRetry(
    () =>
      prisma.lead.findMany({
        where: {
          stage: { in: ["cold", "dead"] },
          areas: { not: null },
        },
        select: {
          id: true,
          name: true,
          firstName: true,
          areas: true,
          priceMin: true,
          priceMax: true,
          tags: true,
          lastContactDate: true,
        },
      }),
    { source: "/api/agents/intent-revival", type: "api_failure" },
  );

  const eligible = coldLeads.filter((l) => {
    const tags = (l.tags ?? "").split(",").map((t) => t.trim().toLowerCase());
    return !tags.includes("do_not_contact");
  });

  type ScoredLead = {
    lead: (typeof eligible)[number];
    score: number;
    topListing: ParagonListing | null;
  };

  const scored: ScoredLead[] = [];

  for (const lead of eligible) {
    const areas = (lead.areas ?? "")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    if (areas.length === 0) continue;

    let newListings = 0;
    let priceDrops = 0;
    let topListing: ParagonListing | null = null;

    for (const area of areas) {
      try {
        const listings = await withRetry(
          () =>
            fetchActiveListings(paragonConfig, {
              city: area,
              minPrice: lead.priceMin ?? undefined,
              maxPrice: lead.priceMax ?? undefined,
              limit: 10,
            }),
          { source: "/api/agents/intent-revival", type: "paragon" },
        );

        for (const listing of listings) {
          const listDate = listing.listDate ? new Date(listing.listDate) : null;
          const modifiedAt = listing.modifiedAt ? new Date(listing.modifiedAt) : null;

          if (listDate && listDate >= sevenDaysAgo) {
            newListings++;
            if (!topListing) topListing = listing;
          } else if (modifiedAt && modifiedAt >= sevenDaysAgo && listing.daysOnMarket > 7) {
            // Modified after being on market suggests a price reduction
            priceDrops++;
            if (!topListing) topListing = listing;
          }
        }
      } catch (err) {
        await logError("paragon", "/api/agents/intent-revival", err, { leadId: lead.id, area });
      }
    }

    const score = newListings * 2 + priceDrops * 3;
    if (score > 0) {
      scored.push({ lead, score, topListing });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top10 = scored.slice(0, 10);

  const run = await prisma.agentRun.create({
    data: { agentType: "intent_revival", status: "running" },
  });

  let queued = 0;
  let skipped = 0;

  for (const { lead, score, topListing } of top10) {
    const recentOutbound = await prisma.contactLog.findFirst({
      where: {
        leadId: lead.id,
        direction: "outbound",
        createdAt: { gte: thirtyDaysAgo },
      },
    });
    if (recentOutbound) {
      skipped++;
      continue;
    }

    const existingDraft = await prisma.actionQueue.findFirst({
      where: {
        leadId: lead.id,
        type: "draft_message",
        status: "pending",
        createdAt: { gte: weekStart },
      },
    });
    if (existingDraft) {
      skipped++;
      continue;
    }

    const instruction = topListing
      ? `There's been recent activity in their target area — ${topListing.address} at $${topListing.price.toLocaleString()} matches what they were looking for. Reference this specific listing.`
      : `There's been recent listing activity in their search area (${lead.areas}). Intent score: ${score}.`;

    try {
      const draft = await withRetry(
        () => generateDraft({ leadId: lead.id, source: "intent_revival", instruction }),
        { source: "/api/agents/intent-revival", type: "ai" },
      );

      await prisma.actionQueue.create({
        data: {
          type: "draft_message",
          agentType: "intent_revival",
          leadId: lead.id,
          requiresApproval: true,
          priority: 4,
          briefDate: now.toISOString().slice(0, 10),
          payload: {
            channel: draft.channel,
            subject: draft.subject,
            body: draft.body,
            reason: "intent_revival",
            intentScore: score,
            topListingAddress: topListing?.address ?? null,
            topListingPrice: topListing?.price ?? null,
          },
        },
      });

      queued++;
    } catch (err) {
      await logError("ai", "/api/agents/intent-revival", err, { leadId: lead.id });
      skipped++;
    }
  }

  await upsertSetting("propstream.lastRunWeek", currentWeek);

  if (queued > 0) {
    await prisma.notification.create({
      data: {
        type: "sync_complete",
        title: `Intent-triggered revival — ${queued} draft${queued !== 1 ? "s" : ""} ready`,
        body: `${scored.length} cold leads had activity in their search areas. ${queued} draft${queued !== 1 ? "s" : ""} queued for review.`,
        href: "/contacts",
      },
    });
  }

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
    week: currentWeek,
    eligibleCount: eligible.length,
    scoredCount: scored.length,
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
    return await runIntentRevival();
  } catch (err) {
    await logError("ai", "/api/agents/intent-revival", err, {
      route: "/api/agents/intent-revival",
      method: "POST",
    });
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
