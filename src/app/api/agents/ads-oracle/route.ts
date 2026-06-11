export const dynamic = "force-dynamic";
// AIRE: loop:paid-ads-oracle
// Vercel cron: 0 14 * * 1 (8AM CT Monday)
// Pulls Meta Ads campaign performance for last 7 days; classifies and queues kill/scale tasks.

import { verifyCronSecret, cronUnauthorized } from "@/lib/cron-auth";
import { withRetry, logError } from "@/lib/error-memory";
import { getSetting, invalidateSettingsCache } from "@/lib/settings";
import { prisma } from "@/lib/prisma";

const GRAPH_BASE = "https://graph.facebook.com/v19.0";

interface CampaignAction {
  action_type: string;
  value: string;
}

interface CampaignInsight {
  spend: string;
  impressions: string;
  clicks: string;
  actions?: CampaignAction[];
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  insights?: { data: CampaignInsight[] };
}

interface CampaignMetric {
  campaignId: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  ctr: number;
  cpl: number;
  classification: "kill" | "scale" | "variant" | "hold";
}

async function fetchCampaigns(adAccountId: string, accessToken: string): Promise<Campaign[]> {
  return withRetry(async () => {
    const url = new URL(`${GRAPH_BASE}/act_${adAccountId}/campaigns`);
    url.searchParams.set(
      "fields",
      "id,name,status,insights.date_preset(last_7d){spend,impressions,clicks,actions}"
    );
    url.searchParams.set("limit", "50");
    url.searchParams.set("access_token", accessToken);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(`Meta Ads API ${res.status}: ${err.error?.message ?? res.statusText}`);
    }
    const data = (await res.json()) as { data: Campaign[] };
    return data.data ?? [];
  }, { source: "ads-oracle/fetchCampaigns", type: "meta" });
}

async function upsertSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  invalidateSettingsCache([key]);
}

function getWeekOf(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  return monday.toISOString().slice(0, 10);
}

async function runAdsOracle() {
  const startedAt = Date.now();

  const [adAccountId, accessToken] = await Promise.all([
    getSetting("META_AD_ACCOUNT_ID"),
    getSetting("META_AD_ACCESS_TOKEN"),
  ]);

  if (!adAccountId || !accessToken) {
    await logError(
      "api_failure",
      "ads-oracle",
      new Error("META_AD_ACCOUNT_ID or META_AD_ACCESS_TOKEN not configured"),
      {}
    );
    return Response.json({ error: "Meta Ads not configured" }, { status: 503 });
  }

  // Idempotency: skip if already ran this week
  const isoWeekOf = getWeekOf();
  const lastRow = await prisma.setting
    .findUnique({ where: { key: "ads.lastWeekMetrics" } })
    .catch(() => null);
  if (lastRow?.value) {
    try {
      const last = JSON.parse(lastRow.value) as { weekOf?: string };
      if (last.weekOf === isoWeekOf) {
        return Response.json({ skipped: true, reason: "already ran this week", weekOf: isoWeekOf });
      }
    } catch {
      // corrupt value — proceed
    }
  }

  // Configurable thresholds (stored as human-readable numbers)
  const [killCplStr, scaleCtrStr] = await Promise.all([
    getSetting("ads.killThreshold.cpl"),
    getSetting("ads.scaleThreshold.ctr"),
  ]);
  const killCpl = parseFloat(killCplStr ?? "25");
  const scaleCtr = parseFloat(scaleCtrStr ?? "3.5") / 100;

  // Fetch campaigns
  let campaigns: Campaign[];
  try {
    campaigns = await fetchCampaigns(adAccountId, accessToken);
  } catch (err) {
    await logError(
      "api_failure",
      "ads-oracle",
      err instanceof Error ? err : new Error(String(err)),
      { adAccountId }
    );
    await prisma.notification
      .create({
        data: {
          type: "error",
          title: "Meta Ads API error — check token in Settings",
          body: "Paid Ads Oracle could not fetch campaign data.",
          href: "/settings",
        },
      })
      .catch(() => null);
    return Response.json({ error: "Meta Ads API fetch failed" }, { status: 502 });
  }

  if (!campaigns.length) {
    await upsertSetting("loop.paid_ads_oracle.disabled", "true").catch(() => null);
    await prisma.notification
      .create({
        data: {
          type: "info",
          title: "Paid Ads Oracle: No active campaigns found.",
          href: "/settings",
        },
      })
      .catch(() => null);
    return Response.json({ ok: true, message: "No active campaigns found" });
  }

  // Classify each campaign with spend > 0
  const metrics: CampaignMetric[] = [];

  for (const c of campaigns) {
    const insight = c.insights?.data?.[0];
    if (!insight) continue;

    const spend = parseFloat(insight.spend ?? "0");
    if (spend <= 0) continue;

    const impressions = parseInt(insight.impressions ?? "0", 10);
    const clicks = parseInt(insight.clicks ?? "0", 10);
    const leads = (insight.actions ?? [])
      .filter((a) => a.action_type.includes("lead"))
      .reduce((sum, a) => sum + parseInt(a.value, 10), 0);

    const ctr = clicks / Math.max(impressions, 1);
    const cpl = spend / Math.max(leads, 1);

    let classification: CampaignMetric["classification"];
    if (cpl > killCpl && ctr < 0.015 && leads < 2) {
      classification = "kill";
    } else if (ctr > scaleCtr && cpl < killCpl && leads >= 3) {
      classification = "scale";
    } else if (cpl > killCpl * 0.8 && cpl <= killCpl * 1.2) {
      classification = "variant";
    } else {
      classification = "hold";
    }

    metrics.push({ campaignId: c.id, name: c.name, spend, impressions, clicks, leads, ctr, cpl, classification });
  }

  // Top 5 actionable (kill first, then scale, then variant)
  const classRank = { kill: 0, scale: 1, variant: 2, hold: 3 } as const;
  const actionable = metrics
    .filter((m) => m.classification !== "hold")
    .sort((a, b) => classRank[a.classification] - classRank[b.classification])
    .slice(0, 5);

  // Dedup: skip campaigns already in pending queue
  const pendingTasks = await prisma.actionQueue
    .findMany({
      where: { status: "pending", agentType: "paid_ads_oracle" },
      select: { payload: true },
    })
    .catch(() => []);

  const existingIds = new Set(
    pendingTasks
      .map((t) => {
        try { return (t.payload as { campaignId?: string }).campaignId ?? null; } catch { return null; }
      })
      .filter(Boolean)
  );

  let tasksCreated = 0;
  for (const m of actionable) {
    if (m.classification !== "kill" && m.classification !== "scale") continue;
    if (existingIds.has(m.campaignId)) continue;

    const title =
      m.classification === "kill"
        ? `Pause ${m.name} — CPL $${m.cpl.toFixed(0)}, ${m.leads} lead${m.leads !== 1 ? "s" : ""} this week`
        : `Scale ${m.name} — CTR ${(m.ctr * 100).toFixed(1)}%, CPL $${m.cpl.toFixed(0)}`;

    await prisma.actionQueue
      .create({
        data: {
          type: "create_lofty_task",
          agentType: "paid_ads_oracle",
          payload: {
            campaignId: m.campaignId,
            name: m.name,
            recommendation: m.classification,
            spend: m.spend,
            ctr: m.ctr,
            cpl: m.cpl,
            leads: m.leads,
            title,
          },
          requiresApproval: true,
          priority: 3,
        },
      })
      .catch(() => null);
    tasksCreated++;
  }

  // Persist metrics for next week's delta comparison
  const summary = {
    weekOf: isoWeekOf,
    campaigns: metrics.map((m) => ({
      campaignId: m.campaignId,
      name: m.name,
      spend: m.spend,
      ctr: parseFloat((m.ctr * 100).toFixed(3)),
      cpl: parseFloat(m.cpl.toFixed(2)),
      leads: m.leads,
      classification: m.classification,
    })),
  };
  await upsertSetting("ads.lastWeekMetrics", JSON.stringify(summary)).catch(() => null);

  const killCount = actionable.filter((m) => m.classification === "kill").length;
  const scaleCount = actionable.filter((m) => m.classification === "scale").length;
  const variantCount = actionable.filter((m) => m.classification === "variant").length;

  await prisma.notification
    .create({
      data: {
        type: "info",
        title: `Weekly ads report — ${killCount} kill, ${scaleCount} scale, ${variantCount} variant`,
        body: `${metrics.length} campaign${metrics.length !== 1 ? "s" : ""} analysed for week of ${isoWeekOf}. ${tasksCreated} task${tasksCreated !== 1 ? "s" : ""} queued for approval.`,
        href: "/settings",
      },
    })
    .catch(() => null);

  await prisma.agentRun
    .create({
      data: {
        agentType: "paid_ads_oracle",
        status: "completed",
        completedAt: new Date(),
        itemsProcessed: metrics.length,
        actionsQueued: tasksCreated,
        durationMs: Date.now() - startedAt,
      },
    })
    .catch(() => null);

  return Response.json({
    ok: true,
    weekOf: isoWeekOf,
    campaignsAnalysed: metrics.length,
    tasksCreated,
    kill: killCount,
    scale: scaleCount,
    variant: variantCount,
  });
}

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  try {
    return await runAdsOracle();
  } catch (err) {
    await logError(
      "api_failure",
      "ads-oracle",
      err instanceof Error ? err : new Error(String(err))
    );
    return Response.json({ error: "Ads oracle failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    return await runAdsOracle();
  } catch (err) {
    await logError(
      "api_failure",
      "ads-oracle",
      err instanceof Error ? err : new Error(String(err))
    );
    return Response.json({ error: "Ads oracle failed" }, { status: 500 });
  }
}
