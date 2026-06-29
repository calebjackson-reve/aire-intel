export const dynamic = "force-dynamic";
// AIRE Loop 33 — caption-ab-validator
// Cron: 0 2 * * 1 (Monday 9PM CT = 2AM UTC Tuesday)
// Oracle: ContentPreference.approvalRate correlated against Meta reach
// Validates whether what Caleb approves actually performs on Meta.
// Discrepancy ≥30% → notification so Caleb knows his taste and the algorithm differ.

import { verifyCronSecret, verifyCronOrInternal, cronUnauthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { getPageInsights, PostInsight } from "@/lib/meta-insights";
import { getSetting, invalidateSettingsCache } from "@/lib/settings";
import { logError } from "@/lib/error-memory";

async function upsertSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  invalidateSettingsCache([key]);
}

export async function POST(req: Request) {
  if (!verifyCronSecret((req as Request & { headers: Headers }).headers.get("x-cron-secret"))) return cronUnauthorized();
  return runCaptionValidator();
}

export async function GET(request: Request) {
  if (!verifyCronOrInternal(request)) return cronUnauthorized();
  return runCaptionValidator();
}

async function runCaptionValidator() {
  try {
    // Idempotency: 6-day guard
    const lastRun = await getSetting("content.abValidation.lastRun");
    if (lastRun) {
      const daysSince = (Date.now() - new Date(lastRun).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 6) {
        return Response.json({ skipped: true, reason: "Ran within last 6 days", lastRun });
      }
    }

    // Need ContentPreference records with meaningful signal
    const preferences = await prisma.contentPreference.findMany({
      where: { approvals: { gte: 1 } },
    });
    const qualified = preferences.filter(p => p.approvals + p.rejections >= 3);

    if (qualified.length < 3) {
      return Response.json({ skipped: true, reason: `Only ${qualified.length} ContentPreference records with ≥3 ratings` });
    }

    const insights = await getPageInsights(false);
    if (!insights.connected || insights.posts.length < 5) {
      return Response.json({ skipped: true, reason: "Need ≥5 published posts with Meta data" });
    }

    // Match posts to ContentPreference patterns by searching captions for pattern values
    const igPosts = insights.posts.filter(p => p.platform === "instagram" && p.caption);
    if (igPosts.length < 5) {
      return Response.json({ skipped: true, reason: "Need ≥5 IG posts with captions for matching" });
    }

    const avgReach = igPosts.reduce((s, p) => s + p.reach, 0) / igPosts.length;
    const validatedPatterns: Record<string, string> = {};
    const discrepancies: { patternType: string; approvalRate: number; metaReachLift: number }[] = [];

    for (const pref of qualified) {
      const approvalRate = pref.approvals / (pref.approvals + pref.rejections);
      const matchedPosts = igPosts.filter(p =>
        p.caption!.toLowerCase().includes(pref.value.toLowerCase())
      );

      if (matchedPosts.length < 2) continue;

      const patternAvgReach = matchedPosts.reduce((s, p) => s + p.reach, 0) / matchedPosts.length;
      const reachLift = avgReach > 0 ? (patternAvgReach - avgReach) / avgReach : 0;

      // If both approval rate ≥60% AND reach lift ≥0 → validated
      if (approvalRate >= 0.6 && reachLift >= 0) {
        validatedPatterns[pref.patternType] = pref.value;
        await upsertSetting(`content.validated.${pref.patternType}`, pref.value);
      }

      // Discrepancy: Caleb approves it (≥60%) but Meta data says it underperforms (≤-30%)
      if (approvalRate >= 0.6 && reachLift <= -0.30) {
        discrepancies.push({ patternType: pref.patternType, approvalRate, metaReachLift: reachLift });
      }
    }

    await upsertSetting("content.abValidation.lastRun", new Date().toISOString());

    // Notify about discrepancies
    if (discrepancies.length > 0) {
      const disc = discrepancies[0];
      await prisma.notification.create({
        data: {
          type: "warning",
          title: "Content taste vs. algorithm mismatch",
          body: `You approve "${disc.patternType}" patterns ${Math.round(disc.approvalRate * 100)}% of the time, but they reduce reach by ${Math.abs(Math.round(disc.metaReachLift * 100))}%. Consider testing alternatives.`,
          href: "/social",
        },
      }).catch(() => null);
    }

    if (Object.keys(validatedPatterns).length > 0) {
      await prisma.notification.create({
        data: {
          type: "success",
          title: "Content patterns validated",
          body: `${Object.keys(validatedPatterns).length} patterns confirmed: your taste matches Meta performance. Patterns locked in for content generation.`,
          href: "/create-post",
        },
      }).catch(() => null);
    }

    return Response.json({
      ok: true,
      qualifiedPreferences: qualified.length,
      postsAnalyzed: igPosts.length,
      validatedPatterns,
      discrepancies: discrepancies.length,
    });
  } catch (err) {
    await logError("api_failure", "caption-ab-validator", err as Error);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
