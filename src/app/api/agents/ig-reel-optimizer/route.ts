export const dynamic = "force-dynamic";
// AIRE Loop 31 — ig-reel-optimizer
// Cron: 0 4 * * 0 (Sunday 11PM CT = 4AM UTC Monday)
// Oracle: ig_reels_avg_watch_time (Meta external signal)
// Reads last 30 days of Reels, finds which hook style drives longest watch time,
// writes topHookStyle to Settings so content-scheduler picks it up on Monday.

import { verifyCronSecret, verifyCronOrInternal, cronUnauthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { getPageInsights } from "@/lib/meta-insights";
import { getSetting, invalidateSettingsCache } from "@/lib/settings";
import { logError } from "@/lib/error-memory";

async function upsertSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  invalidateSettingsCache([key]);
}

export async function POST(req: Request) {
  if (!verifyCronSecret((req as Request & { headers: Headers }).headers.get("x-cron-secret"))) return cronUnauthorized();
  return runReelOptimizer();
}

export async function GET(request: Request) {
  if (!verifyCronOrInternal(request)) return cronUnauthorized();
  return runReelOptimizer();
}

type HookStyle = "fragment" | "question" | "number" | "statement";

function classifyHook(firstLine: string): HookStyle {
  if (/^\d/.test(firstLine)) return "number";
  if (/\?$/.test(firstLine) || /^(what|how|why|when|where|who|is|are|do|did|can|would)/i.test(firstLine)) return "question";
  if (/[.!…]$/.test(firstLine) && firstLine.split(" ").length < 6) return "fragment";
  return "statement";
}

async function runReelOptimizer() {
  try {
    // Idempotency: skip if ran in last 6 days
    const lastRun = await getSetting("content.reel.lastRun");
    if (lastRun) {
      const daysSince = (Date.now() - new Date(lastRun).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 6) {
        return Response.json({ skipped: true, reason: "Ran within last 6 days", lastRun });
      }
    }

    const insights = await getPageInsights(true);
    if (!insights.connected) {
      return Response.json({ skipped: true, reason: "Meta not connected" });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const reels = insights.posts.filter(
      p => p.platform === "instagram" && p.avgWatchTime !== undefined && p.publishedAt >= thirtyDaysAgo
    );

    if (reels.length < 5) {
      return Response.json({ skipped: true, reason: `Only ${reels.length} Reels with watch time data — need ≥5` });
    }

    // Extract hook style from caption first line
    const classified = reels
      .filter(r => r.caption && r.avgWatchTime !== undefined)
      .map(r => ({
        style: classifyHook(r.caption!.split("\n")[0].trim()),
        watchTime: r.avgWatchTime!,
        postId: r.postId,
      }));

    // Avg watch time by hook style
    const styleMap = new Map<HookStyle, { total: number; count: number }>();
    for (const item of classified) {
      const cur = styleMap.get(item.style) ?? { total: 0, count: 0 };
      cur.total += item.watchTime;
      cur.count += 1;
      styleMap.set(item.style, cur);
    }

    const styleRanked = Array.from(styleMap.entries())
      .filter(([, v]) => v.count >= 2)
      .map(([style, v]) => ({ style, avgWatchTime: v.total / v.count, count: v.count }))
      .sort((a, b) => b.avgWatchTime - a.avgWatchTime);

    if (!styleRanked.length) {
      return Response.json({ skipped: true, reason: "Not enough data per hook style (need ≥2 each)" });
    }

    const top = styleRanked[0];
    const bottom = styleRanked[styleRanked.length - 1];

    await Promise.all([
      upsertSetting("content.reel.topHookStyle", top.style),
      upsertSetting("content.reel.avgWatchTimeTop", String(Math.round(top.avgWatchTime))),
      upsertSetting("content.reel.lastRun", new Date().toISOString()),
      upsertSetting("content.reel.styleData", JSON.stringify(styleRanked)),
      prisma.notification.create({
        data: {
          type: "success",
          title: "Reel Oracle updated",
          body: `${top.style} hooks: ${Math.round(top.avgWatchTime)}s avg watch time vs ${Math.round(bottom.avgWatchTime)}s for ${bottom.style}. Use ${top.style} hooks this week.`,
          href: "/social",
        },
      }).catch(() => null),
    ]);

    return Response.json({
      ok: true,
      topHookStyle: top.style,
      avgWatchTimeTop: Math.round(top.avgWatchTime),
      reelsAnalyzed: reels.length,
      styleRanked,
    });
  } catch (err) {
    await logError("api_failure", "ig-reel-optimizer", err as Error);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
