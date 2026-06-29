export const dynamic = "force-dynamic";
// AIRE: loop:fb-insights
// Vercel cron: 0 14 * * * (daily 2PM UTC = 9AM CT)
// Pulls Facebook post engagement data for all published posts → stores reach/impressions/engagement
// Then triggers content-optimizer if new data available

import { prisma } from "@/lib/prisma";
import { verifyCronSecret, verifyCronOrInternal, cronUnauthorized } from "@/lib/cron-auth";
import { logError } from "@/lib/error-memory";

export async function POST(req: Request) {
  if (!verifyCronSecret((req as Request & { headers: Headers }).headers.get("authorization"))) {
    return cronUnauthorized();
  }
  return runInsightsSync();
}

export async function GET(req: Request) {
  const auth = (req as Request & { headers: Headers }).headers.get("authorization");
  if (!verifyCronSecret(auth)) return cronUnauthorized();
  return runInsightsSync();
}

async function runInsightsSync() {
  const tokenRow = await prisma.setting.findUnique({ where: { key: "META_PAGE_ACCESS_TOKEN" } });
  const token = tokenRow?.value ?? process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) return Response.json({ ok: false, error: "No Facebook token" });

  // Get all published posts that have a FB post ID and were published in the last 90 days
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const published = await prisma.scheduledPost.findMany({
    where: {
      postId: { not: null },
      status: { in: ["scheduled", "approved", "published"] },
      createdAt: { gte: cutoff },
    },
    select: { id: true, postId: true, publishedAt: true },
  });

  if (!published.length) return Response.json({ ok: true, synced: 0, message: "No published posts to sync" });

  let synced = 0;
  let failed = 0;

  for (const post of published) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${post.postId}/insights?metric=post_impressions,post_impressions_unique,post_engaged_users,post_clicks&period=lifetime&access_token=${token}`
      );
      const data = await res.json() as {
        data?: Array<{ name: string; period: string; values?: Array<{ value: number }> }>;
        error?: { message: string; code: number };
      };

      if (data.error) {
        // Post may have been deleted or token insufficient — skip silently
        if (data.error.code === 100 || data.error.code === 10) continue;
        failed++;
        continue;
      }

      if (!data.data?.length) continue;

      const get = (name: string) => {
        const metric = data.data?.find(d => d.name === name);
        // lifetime metrics return a single value
        return metric?.values?.[0]?.value ?? null;
      };

      const impressions = get("post_impressions");
      const reach = get("post_impressions_unique");
      const engagement = get("post_engaged_users");
      const clicks = get("post_clicks");
      const engagementRate = reach && engagement ? Math.round((engagement / reach) * 1000) / 10 : null;

      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: {
          impressions: impressions ?? undefined,
          reach: reach ?? undefined,
          engagement: (engagement ?? 0) + (clicks ?? 0),
          engagementRate: engagementRate ?? undefined,
          publishedAt: post.publishedAt ?? new Date(),
          status: "published",
        },
      });
      synced++;
    } catch (err) {
      logError("meta", "agents/fb-insights", err as Error, { postId: post.postId ?? "" });
      failed++;
    }
  }

  // If we synced new data, queue the content optimizer to run
  if (synced > 0) {
    try {
      const origin = process.env.NEXT_PUBLIC_APP_URL || "https://aire-intel.vercel.app";
      await fetch(`${origin}/api/agents/content-optimizer`, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
    } catch { /* non-fatal */ }
  }

  return Response.json({ ok: true, synced, failed, total: published.length });
}
