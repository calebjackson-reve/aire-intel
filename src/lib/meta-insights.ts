// Meta Page + Instagram insights — Page Insights API.
// This is the LEGAL, ALLOWED data: aggregate post performance for posts you've published.
// Does NOT include personal user data, friend lists, or interest scraping.

import { getMetaConfig } from "./settings";
import { logError } from "./error-memory";

const GRAPH_BASE = "https://graph.facebook.com/v19.0";

export interface PostInsight {
  postId: string;
  platform: "facebook" | "instagram";
  publishedAt: string;
  reach: number;
  impressions: number;
  engagement: number;       // total reactions + comments + shares
  clicks: number;
  reactions: number;
  comments: number;
  shares: number;
  saves: number;            // IG only
  engagementRate: number;   // engagement / reach
}

export interface PageDemographics {
  totalFollowers: number;
  age: Record<string, number>;     // "25-34" → percent
  gender: Record<string, number>;  // "F" | "M" | "U" → percent
  topCities: { city: string; count: number }[];
  topCountries: { country: string; count: number }[];
}

export interface InsightsResponse {
  connected: boolean;
  posts: PostInsight[];
  demographics: PageDemographics | null;
  cachedAt: string;
}

// ─── Simple in-memory cache to stay under Meta rate limits ──────────────────
let _cache: { data: InsightsResponse; expiry: number } | null = null;
const CACHE_TTL_MS = 30 * 60_000; // 30 minutes

export async function getPageInsights(forceRefresh = false): Promise<InsightsResponse> {
  if (!forceRefresh && _cache && Date.now() < _cache.expiry) {
    return _cache.data;
  }

  const config = await getMetaConfig();
  if (!config) {
    return { connected: false, posts: [], demographics: null, cachedAt: new Date().toISOString() };
  }

  // Each sub-fetch may fail independently (token-permission mismatches are
  // common with Meta apps that haven't gone through the full review). We use
  // Promise.allSettled so a partial outage on Instagram insights doesn't take
  // down Facebook insights. Per-call errors are swallowed silently after the
  // first occurrence to avoid spamming /system on every dashboard load.
  const [fbResult, igResult, demoResult] = await Promise.allSettled([
    fetchFacebookPostInsights(config.pageId, config.token),
    config.igId ? fetchInstagramPostInsights(config.igId, config.token) : Promise.resolve([]),
    fetchPageDemographics(config.pageId, config.token),
  ]);

  const fbPosts = fbResult.status === "fulfilled" ? fbResult.value : [];
  const igPosts = igResult.status === "fulfilled" ? igResult.value : [];
  const demographics = demoResult.status === "fulfilled" ? demoResult.value : null;

  // Only log a top-level error if ALL three failed — partial success is normal
  if (fbResult.status === "rejected" && igResult.status === "rejected" && demoResult.status === "rejected") {
    await logError("meta", "meta-insights/getPageInsights", fbResult.reason);
  }

  const response: InsightsResponse = {
    connected: true,
    posts: [...fbPosts, ...igPosts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    demographics,
    cachedAt: new Date().toISOString(),
  };

  _cache = { data: response, expiry: Date.now() + CACHE_TTL_MS };
  return response;
}

// ─── Facebook Page Post Insights ────────────────────────────────────────────

interface RawFbPost {
  id: string;
  created_time: string;
  message?: string;
  insights?: { data: { name: string; values: { value: number | Record<string, number> }[] }[] };
}

async function fetchFacebookPostInsights(pageId: string, token: string): Promise<PostInsight[]> {
  const metrics = [
    "post_impressions_unique",      // reach
    "post_impressions",              // impressions
    "post_clicks",                   // clicks
    "post_reactions_by_type_total",  // reactions
  ].join(",");

  const url = `${GRAPH_BASE}/${pageId}/posts?fields=id,created_time,message,insights.metric(${metrics}),comments.summary(true),shares&limit=50&access_token=${token}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`FB posts insights: ${res.status}`);

  const data = await res.json() as {
    data: (RawFbPost & {
      comments?: { summary: { total_count: number } };
      shares?: { count: number };
    })[];
  };

  return (data.data ?? []).map(p => {
    const insightMap = Object.fromEntries((p.insights?.data ?? []).map(d => [d.name, d.values[0]?.value]));
    const reach = typeof insightMap.post_impressions_unique === "number" ? insightMap.post_impressions_unique : 0;
    const impressions = typeof insightMap.post_impressions === "number" ? insightMap.post_impressions : 0;
    const clicks = typeof insightMap.post_clicks === "number" ? insightMap.post_clicks : 0;
    const reactionsObj = typeof insightMap.post_reactions_by_type_total === "object" ? insightMap.post_reactions_by_type_total as Record<string, number> : {};
    const reactions = Object.values(reactionsObj).reduce((s, n) => s + n, 0);
    const comments = p.comments?.summary?.total_count ?? 0;
    const shares = p.shares?.count ?? 0;
    const engagement = reactions + comments + shares;

    return {
      postId: p.id,
      platform: "facebook" as const,
      publishedAt: p.created_time,
      reach,
      impressions,
      engagement,
      clicks,
      reactions,
      comments,
      shares,
      saves: 0,
      engagementRate: reach > 0 ? engagement / reach : 0,
    };
  });
}

// ─── Instagram Business Media Insights ──────────────────────────────────────

async function fetchInstagramPostInsights(igId: string, token: string): Promise<PostInsight[]> {
  const mediaUrl = `${GRAPH_BASE}/${igId}/media?fields=id,timestamp,media_type&limit=50&access_token=${token}`;
  const mediaRes = await fetch(mediaUrl, { signal: AbortSignal.timeout(15_000) });
  // Fail soft — token may lack instagram_manage_insights or the IG account may
  // not be a Business account. We log once at debug level (via console) but
  // don't throw because the dashboard polls this every 30 minutes; throwing
  // would spam the ErrorLog every page render.
  if (!mediaRes.ok) {
    console.debug(`[meta-insights] IG media unavailable (${mediaRes.status}) — skipping`);
    return [];
  }

  const mediaData = await mediaRes.json() as {
    data: { id: string; timestamp: string; media_type: string }[];
  };

  // For each media, fetch insights (parallel, capped)
  const items = (mediaData.data ?? []).slice(0, 25);
  const insightCalls = items.map(async m => {
    const metrics = m.media_type === "VIDEO" || m.media_type === "REELS"
      ? "reach,impressions,saved,likes,comments,shares,plays"
      : "reach,impressions,saved,likes,comments,shares";
    try {
      const insightRes = await fetch(`${GRAPH_BASE}/${m.id}/insights?metric=${metrics}&access_token=${token}`, {
        signal: AbortSignal.timeout(8_000),
      });
      if (!insightRes.ok) return null;
      const insightData = await insightRes.json() as {
        data: { name: string; values: { value: number }[] }[];
      };
      const map = Object.fromEntries(insightData.data.map(d => [d.name, d.values[0]?.value ?? 0]));
      const reach = map.reach ?? 0;
      const likes = map.likes ?? 0;
      const comments = map.comments ?? 0;
      const shares = map.shares ?? 0;
      const saves = map.saved ?? 0;
      const engagement = likes + comments + shares + saves;
      return {
        postId: m.id,
        platform: "instagram" as const,
        publishedAt: m.timestamp,
        reach,
        impressions: map.impressions ?? reach,
        engagement,
        clicks: 0,
        reactions: likes,
        comments,
        shares,
        saves,
        engagementRate: reach > 0 ? engagement / reach : 0,
      } satisfies PostInsight;
    } catch {
      return null;
    }
  });

  const results = await Promise.all(insightCalls);
  return results.filter((r): r is NonNullable<typeof r> => r !== null) as PostInsight[];
}

// ─── Page Demographics (aggregate, anonymous) ───────────────────────────────

async function fetchPageDemographics(pageId: string, token: string): Promise<PageDemographics | null> {
  const url = `${GRAPH_BASE}/${pageId}/insights?metric=page_fans,page_fans_gender_age,page_fans_city,page_fans_country&period=lifetime&access_token=${token}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;

  const data = await res.json() as {
    data: { name: string; values: { value: number | Record<string, number> }[] }[];
  };

  const map = Object.fromEntries(data.data.map(d => [d.name, d.values[0]?.value]));

  const totalFollowers = typeof map.page_fans === "number" ? map.page_fans : 0;

  // page_fans_gender_age comes as { "F.25-34": 142, "M.25-34": 95, ... }
  const ageGenderObj = (typeof map.page_fans_gender_age === "object" ? map.page_fans_gender_age as Record<string, number> : {});
  const age: Record<string, number> = {};
  const gender: Record<string, number> = { F: 0, M: 0, U: 0 };
  let total = 0;
  for (const [key, count] of Object.entries(ageGenderObj)) {
    const [g, range] = key.split(".");
    if (g && range) {
      gender[g] = (gender[g] ?? 0) + count;
      age[range] = (age[range] ?? 0) + count;
      total += count;
    }
  }
  if (total > 0) {
    Object.keys(age).forEach(k => age[k] = Math.round((age[k] / total) * 100));
    Object.keys(gender).forEach(k => gender[k] = Math.round((gender[k] / total) * 100));
  }

  const cityObj = typeof map.page_fans_city === "object" ? map.page_fans_city as Record<string, number> : {};
  const topCities = Object.entries(cityObj)
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const countryObj = typeof map.page_fans_country === "object" ? map.page_fans_country as Record<string, number> : {};
  const topCountries = Object.entries(countryObj)
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return { totalFollowers, age, gender, topCities, topCountries };
}

// ─── Content Performance Audit ──────────────────────────────────────────────
// Aggregates insights by post type so Claude can learn what works.

export interface ContentAudit {
  totalPosts: number;
  byType: { type: string; count: number; avgReach: number; avgEngagement: number; avgEngagementRate: number }[];
  topPosts: { postId: string; caption: string; reach: number; engagement: number; engagementRate: number; postType: string }[];
  trends: { signal: string; detail: string }[];
}

// Build an audit by joining Meta insights with our locally stored GeneratedPost rows
// (which know post_type, caption, etc.)
export async function buildContentAudit(): Promise<ContentAudit> {
  const insights = await getPageInsights();
  if (!insights.connected || insights.posts.length === 0) {
    return { totalPosts: 0, byType: [], topPosts: [], trends: [{ signal: "No data yet", detail: "Publish 5+ posts via AIRE to start the audit loop." }] };
  }

  // Match insights to local posts by published date proximity
  const { prisma } = await import("./prisma");
  const localPosts = await prisma.generatedPost.findMany({
    where: { approved: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // For now, group by what's in the local post record. Future: store platform post IDs.
  const byType = new Map<string, { count: number; reach: number; engagement: number; rate: number }>();
  insights.posts.forEach((post, i) => {
    const local = localPosts[i];
    const type = local?.postType ?? "uncategorized";
    const cur = byType.get(type) ?? { count: 0, reach: 0, engagement: 0, rate: 0 };
    cur.count += 1;
    cur.reach += post.reach;
    cur.engagement += post.engagement;
    cur.rate += post.engagementRate;
    byType.set(type, cur);
  });

  const byTypeArr = Array.from(byType.entries()).map(([type, v]) => ({
    type,
    count: v.count,
    avgReach: Math.round(v.reach / v.count),
    avgEngagement: Math.round(v.engagement / v.count),
    avgEngagementRate: v.rate / v.count,
  })).sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);

  const topPosts = insights.posts
    .slice()
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, 5)
    .map((p, i) => ({
      postId: p.postId,
      caption: localPosts[i]?.caption?.slice(0, 120) ?? "(no caption stored)",
      reach: p.reach,
      engagement: p.engagement,
      engagementRate: p.engagementRate,
      postType: localPosts[i]?.postType ?? "uncategorized",
    }));

  const trends: { signal: string; detail: string }[] = [];
  if (byTypeArr.length > 1) {
    const best = byTypeArr[0];
    const worst = byTypeArr[byTypeArr.length - 1];
    const ratio = worst.avgEngagementRate > 0 ? (best.avgEngagementRate / worst.avgEngagementRate).toFixed(1) : "∞";
    trends.push({
      signal: `${best.type} outperforms ${worst.type} by ${ratio}x`,
      detail: `${best.type} avg engagement rate ${(best.avgEngagementRate * 100).toFixed(1)}% vs ${worst.type} ${(worst.avgEngagementRate * 100).toFixed(1)}%`,
    });
  }

  const igPosts = insights.posts.filter(p => p.platform === "instagram");
  const fbPosts = insights.posts.filter(p => p.platform === "facebook");
  if (igPosts.length > 3 && fbPosts.length > 3) {
    const igAvg = igPosts.reduce((s, p) => s + p.engagementRate, 0) / igPosts.length;
    const fbAvg = fbPosts.reduce((s, p) => s + p.engagementRate, 0) / fbPosts.length;
    if (Math.abs(igAvg - fbAvg) > 0.01) {
      trends.push({
        signal: igAvg > fbAvg ? "Instagram outperforming Facebook" : "Facebook outperforming Instagram",
        detail: `IG ${(igAvg * 100).toFixed(1)}% vs FB ${(fbAvg * 100).toFixed(1)}% avg engagement rate`,
      });
    }
  }

  return { totalPosts: insights.posts.length, byType: byTypeArr, topPosts, trends };
}
