export const dynamic = "force-dynamic";

// Loop 27 — Rentcast Market Weekly
// Cron: 0 10 * * 1 — Monday morning market brief across 4 core Baton Rouge ZIP codes.
// Combines Rentcast stats + FRED mortgage rate into a DailyBrief entry + post_content ActionQueue item.

import { verifyCronSecret, verifyCronOrInternal, cronUnauthorized } from "@/lib/cron-auth";
import { startRun, finishRun, failRun } from "@/lib/agent-run";
import { prisma } from "@/lib/prisma";
import { getMarketStats, type MarketStats } from "@/lib/rentcast";
import { getMortgageRate } from "@/lib/housing-intel";
import { getTodayCT } from "@/lib/brief-date";

const TARGET_ZIPS = ["70808", "70809", "70810", "70816"] as const;

const ZIP_NAMES: Record<string, string> = {
  "70808": "Garden District",
  "70809": "Jefferson Hwy",
  "70810": "Jones Creek",
  "70816": "Sherwood Forest",
};

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  return runMarketWeekly();
}

export async function GET(request: Request) {
  if (!verifyCronOrInternal(request)) return cronUnauthorized();
  return runMarketWeekly();
}

async function runMarketWeekly() {
  const runId = await startRun("market_intel");
  const today = getTodayCT();

  try {
    // Rentcast key check
    if (!process.env.RENTCAST_API_KEY) {
      await prisma.notification.create({
        data: {
          type: "sync_complete",
          title: "Rentcast not configured",
          body: "RENTCAST_API_KEY is not set — weekly market brief skipped. Add key at /settings.",
          href: "/settings",
        },
      });
      await finishRun(runId, { itemsProcessed: 0, actionsQueued: 0 });
      return Response.json({ ok: true, skipped: "no_rentcast_key" });
    }

    // Idempotency: skip if already ran today
    const alreadyQueued = await prisma.actionQueue.findFirst({
      where: {
        agentType: "market_weekly",
        type: "post_content",
        briefDate: today,
      },
    });
    if (alreadyQueued) {
      await finishRun(runId, { itemsProcessed: 0, actionsQueued: 0 });
      return Response.json({ ok: true, skipped: "already_ran_today" });
    }

    // Fetch market stats for all ZIPs concurrently
    const statsResults = await Promise.allSettled(
      TARGET_ZIPS.map(async (zip) => {
        const stats = await getMarketStats(zip);
        return { zip, name: ZIP_NAMES[zip] ?? zip, stats };
      })
    );

    const zipData: Array<{ zip: string; name: string; stats: MarketStats }> = [];
    for (const result of statsResults) {
      if (result.status === "fulfilled") {
        zipData.push(result.value);
      }
    }

    // Fetch mortgage rate
    let mortgageRate = 0;
    let mortgageDelta = 0;
    let mortgageAsOf = "";
    try {
      const rateData = await getMortgageRate();
      mortgageRate = rateData.current;
      mortgageDelta = rateData.delta;
      mortgageAsOf = rateData.asOf;
    } catch {
      // Non-fatal
    }

    // Build market summary text
    const summaryLines = zipData.map(({ zip, name, stats }) => {
      const parts: string[] = [`${name} (${zip})`];
      if (stats.medianPrice) parts.push(`median $${Math.round(stats.medianPrice).toLocaleString()}`);
      if (stats.averageDaysOnMarket) parts.push(`${Math.round(stats.averageDaysOnMarket)} DOM`);
      if (stats.totalListings) parts.push(`${stats.totalListings} listings`);
      return parts.join(" · ");
    });

    if (mortgageRate > 0) {
      const rateDir = mortgageDelta < 0 ? "down" : mortgageDelta > 0 ? "up" : "flat";
      summaryLines.unshift(`30-yr rate: ${mortgageRate}% (${rateDir} ${Math.abs(mortgageDelta).toFixed(3)}% as of ${mortgageAsOf})`);
    }

    const marketSummary = summaryLines.join("\n");

    // Upsert DailyBrief — append to marketMovement
    const existingBrief = await prisma.dailyBrief.findUnique({ where: { date: today } });
    const existingMovement = (existingBrief?.marketMovement as object[]) ?? [];

    const newMarketEntry = {
      type: "weekly_market_brief",
      zips: zipData.map(({ zip, name, stats }) => ({ zip, name, ...stats })),
      mortgageRate,
      mortgageDelta,
      summary: marketSummary,
      generatedAt: new Date().toISOString(),
    };

    const updatedMovement = [...existingMovement, newMarketEntry] as object[];

    await prisma.dailyBrief.upsert({
      where: { date: today },
      create: {
        date: today,
        marketMovement: updatedMovement,
      },
      update: {
        marketMovement: updatedMovement,
      },
    });

    // Create post_content ActionQueue item
    await prisma.actionQueue.create({
      data: {
        type: "post_content",
        agentType: "market_weekly",
        priority: 3,
        briefDate: today,
        requiresApproval: true,
        payload: {
          contentType: "market_update",
          platform: "instagram",
          summary: marketSummary,
          zipData: zipData.map(({ zip, name, stats }) => ({ zip, name, ...stats })),
          mortgageRate,
          mortgageDelta,
          mortgageAsOf,
          caption: buildCaption(zipData, mortgageRate, mortgageDelta),
        },
      },
    });

    // Summary notification
    await prisma.notification.create({
      data: {
        type: "sync_complete",
        title: "Weekly Baton Rouge market brief ready",
        body: mortgageRate > 0
          ? `30-yr rate ${mortgageRate}% · ${zipData.length} ZIP codes analyzed`
          : `${zipData.length} ZIP codes analyzed`,
        href: "/pipeline",
      },
    });

    await finishRun(runId, { itemsProcessed: zipData.length, actionsQueued: 1 });

    return Response.json({
      ok: true,
      zipsProcessed: zipData.length,
      mortgageRate,
      actionsQueued: 1,
    });
  } catch (err) {
    await failRun(runId, err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

function buildCaption(
  zipData: Array<{ zip: string; name: string; stats: MarketStats }>,
  mortgageRate: number,
  mortgageDelta: number
): string {
  const topZip = zipData.find((z) => z.stats.medianPrice);
  const lines: string[] = ["This week in Baton Rouge real estate:"];

  if (mortgageRate > 0) {
    const dir = mortgageDelta < 0 ? "dropped" : mortgageDelta > 0 ? "rose" : "held";
    lines.push(`30-yr rates ${dir} to ${mortgageRate}%`);
  }

  if (topZip?.stats.medianPrice) {
    lines.push(`${topZip.name}: median $${Math.round(topZip.stats.medianPrice).toLocaleString()}`);
  }

  lines.push("DM me for a personalized market report. Caleb Jackson | Rêve Realtors® Baton Rouge");
  return lines.join("\n");
}
