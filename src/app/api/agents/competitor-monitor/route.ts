// AIRE: loop:competitor-monitor
// Vercel cron: 0 13 * * 5 (7AM CT Friday)
// Weekly digest: Paragon MLS activity in tracked BRR ZIPs — high-volume agents, fast movers, price cuts.

import { verifyCronSecret, cronUnauthorized } from "@/lib/cron-auth";
import { logError } from "@/lib/error-memory";
import { getSetting, getParagonConfig, invalidateSettingsCache } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { fetchActiveListings } from "@/lib/paragon";

const DEFAULT_ZIPS = "70808,70810,70816,70820,70737,70769";

async function upsertSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  invalidateSettingsCache([key]);
}

async function runCompetitorMonitor() {
  const startedAt = Date.now();

  const cfg = await getParagonConfig();
  if (!cfg) {
    return Response.json({ skipped: true, reason: "Paragon not configured — competitor monitor inactive." });
  }

  // Within-6-days idempotency guard
  const lastDigest = await getSetting("competitor.lastDigest");
  if (lastDigest) {
    const diffDays = (Date.now() - new Date(lastDigest).getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 6) {
      return Response.json({ skipped: true, reason: "Already ran within 6 days", lastDigest });
    }
  }

  const trackedZipsRaw = (await getSetting("competitor.trackedZips")) ?? DEFAULT_ZIPS;
  const zips = trackedZipsRaw.split(",").map((z) => z.trim()).filter(Boolean);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch listings modified in last 7 days across all tracked ZIPs (any status)
  const perZip = await Promise.all(
    zips.map((zip) =>
      fetchActiveListings(cfg, { zip, limit: 50, changedSince: sevenDaysAgo, status: "" }).catch(
        async (err) => {
          await logError("api_failure", "competitor-monitor", err instanceof Error ? err : new Error(String(err)), { zip });
          return [];
        }
      )
    )
  );

  // Dedup by listing id (same listing can appear in overlapping ZIP queries)
  const seen = new Set<string>();
  const listings = perZip.flat().filter((l) => {
    if (seen.has(l.id)) return false;
    seen.add(l.id);
    return true;
  });

  if (listings.length === 0) {
    await logError(
      "api_failure",
      "competitor-monitor",
      new Error("Paragon returned 0 listings across all tracked ZIPs"),
      { zips }
    );
    await prisma.notification
      .create({
        data: {
          type: "warning",
          title: "Competitor Monitor: No listings found — check Paragon API key",
          body: "0 listings returned for tracked ZIPs. Data may be stale.",
          href: "/settings",
        },
      })
      .catch(() => null);
    return Response.json({ ok: false, reason: "0 listings from Paragon" });
  }

  // Fast movers: Pending/Closed with low DOM (under contract in < 3 days)
  const fastMovers = listings.filter(
    (l) =>
      (l.status === "Pending" || l.status === "Closed" || l.mlsStatus.toLowerCase().includes("pending")) &&
      l.daysOnMarket >= 0 &&
      l.daysOnMarket <= 3
  );

  const soldCount = listings.filter(
    (l) => l.status === "Closed" || l.mlsStatus.toLowerCase().includes("sold")
  ).length;

  const pendingCount = listings.filter(
    (l) => l.status === "Pending" || l.mlsStatus.toLowerCase().includes("pending")
  ).length;

  // Price reductions > 5%
  const priceReductions = listings.filter(
    (l) =>
      l.originalListPrice > 0 &&
      l.price < l.originalListPrice &&
      (l.originalListPrice - l.price) / l.originalListPrice > 0.05
  );

  // Top 3 agents by listing count
  const agentCounts = new Map<string, number>();
  for (const l of listings) {
    if (!l.listingAgent) continue;
    agentCounts.set(l.listingAgent, (agentCounts.get(l.listingAgent) ?? 0) + 1);
  }
  const topAgents = [...agentCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Compose digest
  const digestParts: string[] = [
    `This week: ${soldCount} closing${soldCount !== 1 ? "s" : ""}, ${pendingCount} went pending.`,
  ];
  const fastMoverAddresses = fastMovers
    .slice(0, 2)
    .map((l) => l.address)
    .join(", ");
  if (fastMoverAddresses) {
    digestParts.push(`Fast movers: ${fastMoverAddresses}.`);
  }
  if (priceReductions.length > 0) {
    digestParts.push(`${priceReductions.length} price reduction${priceReductions.length !== 1 ? "s" : ""} > 5%.`);
  }
  if (topAgents[0]) {
    const [name, count] = topAgents[0];
    digestParts.push(`Top agent: ${name} with ${count} listing${count !== 1 ? "s" : ""}.`);
  }
  const digest = digestParts.join(" ");

  // Persist to today's DailyBrief.marketMovement
  const today = new Date().toISOString().slice(0, 10);
  const marketMovement = {
    digest,
    soldCount,
    pendingCount,
    fastMovers: fastMovers.slice(0, 5).map((l) => ({
      id: l.id,
      address: l.address,
      price: l.price,
      dom: l.daysOnMarket,
    })),
    priceReductions: priceReductions.slice(0, 5).map((l) => ({
      id: l.id,
      address: l.address,
      price: l.price,
      originalPrice: l.originalListPrice,
    })),
    topAgents: topAgents.map(([name, count]) => ({ name, count })),
    generatedAt: new Date().toISOString(),
  };

  await prisma.dailyBrief
    .upsert({
      where: { date: today },
      update: { marketMovement },
      create: { date: today, marketMovement },
    })
    .catch(() => null);

  const signalCount = fastMovers.length + priceReductions.length;
  await prisma.notification
    .create({
      data: {
        type: "info",
        title: `Weekly market digest ready — ${signalCount} notable signal${signalCount !== 1 ? "s" : ""} in your corridors`,
        body: digest,
        href: "/",
      },
    })
    .catch(() => null);

  await upsertSetting("competitor.lastDigest", new Date().toISOString()).catch(() => null);

  await prisma.agentRun
    .create({
      data: {
        agentType: "competitor_monitor",
        status: "completed",
        completedAt: new Date(),
        itemsProcessed: listings.length,
        actionsQueued: 0,
        durationMs: Date.now() - startedAt,
      },
    })
    .catch(() => null);

  return Response.json({
    ok: true,
    listingsScanned: listings.length,
    soldCount,
    pendingCount,
    fastMovers: fastMovers.length,
    priceReductions: priceReductions.length,
    topAgents: topAgents.map(([name, count]) => ({ name, count })),
    digest,
  });
}

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  try {
    return await runCompetitorMonitor();
  } catch (err) {
    await logError(
      "api_failure",
      "competitor-monitor",
      err instanceof Error ? err : new Error(String(err))
    );
    return Response.json({ error: "Competitor monitor failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    return await runCompetitorMonitor();
  } catch (err) {
    await logError(
      "api_failure",
      "competitor-monitor",
      err instanceof Error ? err : new Error(String(err))
    );
    return Response.json({ error: "Competitor monitor failed" }, { status: 500 });
  }
}
