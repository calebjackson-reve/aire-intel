export const dynamic = "force-dynamic";
// AIRE Loop 32 — hashtag-optimizer
// Cron: 0 3 1,15 * * (1st and 15th of month, 10PM CT = 3AM UTC)
// Oracle: Meta reach per post (external signal, not AI-graded)
// Extracts hashtags from IG post captions, correlates with reach,
// tiers them, writes to Settings so content-gate penalizes low-reach tags.

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
  return runHashtagOptimizer();
}

export async function GET(request: Request) {
  if (!verifyCronOrInternal(request)) return cronUnauthorized();
  return runHashtagOptimizer();
}

async function runHashtagOptimizer() {
  try {
    // Idempotency: skip if ran in last 13 days (runs 1st + 15th)
    const lastRun = await getSetting("content.hashtags.lastRun");
    if (lastRun) {
      const daysSince = (Date.now() - new Date(lastRun).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 13) {
        return Response.json({ skipped: true, reason: "Ran within last 13 days", lastRun });
      }
    }

    const insights = await getPageInsights(true);
    if (!insights.connected) {
      return Response.json({ skipped: true, reason: "Meta not connected" });
    }

    const igPosts = insights.posts.filter(p => p.platform === "instagram" && p.caption);

    if (igPosts.length < 10) {
      return Response.json({ skipped: true, reason: `Only ${igPosts.length} IG posts with captions — need ≥10` });
    }

    // Count total reach with and without each hashtag
    const tagStats = new Map<string, { withReach: number; withCount: number }>();
    const avgReachAll = igPosts.reduce((s, p) => s + p.reach, 0) / igPosts.length;

    for (const post of igPosts) {
      const tags = (post.caption!.match(/#\w+/g) ?? []).map(t => t.toLowerCase());
      for (const tag of tags) {
        const cur = tagStats.get(tag) ?? { withReach: 0, withCount: 0 };
        cur.withReach += post.reach;
        cur.withCount += 1;
        tagStats.set(tag, cur);
      }
    }

    // Only include hashtags with ≥3 uses for statistical signal
    const qualified = Array.from(tagStats.entries())
      .filter(([, v]) => v.withCount >= 3)
      .map(([tag, v]) => {
        const avgReachWith = v.withReach / v.withCount;
        const liftPct = avgReachAll > 0 ? (avgReachWith - avgReachAll) / avgReachAll : 0;
        return { tag, avgReachWith: Math.round(avgReachWith), liftPct, count: v.withCount };
      })
      .sort((a, b) => b.liftPct - a.liftPct);

    if (!qualified.length) {
      return Response.json({ skipped: true, reason: "No hashtags used ≥3 times" });
    }

    const tier1 = qualified.filter(h => h.liftPct >= 0.20).map(h => h.tag);
    const tier2 = qualified.filter(h => h.liftPct >= -0.05 && h.liftPct < 0.20).map(h => h.tag);
    const tier3 = qualified.filter(h => h.liftPct < -0.05).map(h => h.tag);

    const topHashtag = qualified[0];
    const bottomHashtag = qualified[qualified.length - 1];

    await Promise.all([
      upsertSetting("content.hashtags.tier1", JSON.stringify(tier1)),
      upsertSetting("content.hashtags.tier2", JSON.stringify(tier2)),
      upsertSetting("content.hashtags.remove", JSON.stringify(tier3.map(h => h))),
      upsertSetting("content.hashtags.lastRun", new Date().toISOString()),
      prisma.notification.create({
        data: {
          type: "success",
          title: "Hashtag Oracle updated",
          body: `${topHashtag.tag} lifts reach ${Math.round(topHashtag.liftPct * 100)}%.${tier3.length > 0 ? ` Remove: ${tier3.slice(0, 3).join(", ")} (${Math.round(bottomHashtag.liftPct * 100)}% reach).` : ""}`,
          href: "/social",
        },
      }).catch(() => null),
    ]);

    return Response.json({
      ok: true,
      postsAnalyzed: igPosts.length,
      hashtagsScored: qualified.length,
      tier1Count: tier1.length,
      tier2Count: tier2.length,
      tier3Count: tier3.length,
      topHashtag: topHashtag.tag,
      topLift: `${Math.round(topHashtag.liftPct * 100)}%`,
      removed: tier3.slice(0, 5),
    });
  } catch (err) {
    await logError("api_failure", "hashtag-optimizer", err as Error);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
