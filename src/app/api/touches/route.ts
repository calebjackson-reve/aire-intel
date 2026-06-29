export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─── Unified Touch Tracker ────────────────────────────────────────────────
// Funnels every logged conversation (auto-ingested or quick-logged) into one
// per-contact × per-platform matrix, and computes who is overdue for a touch.

export const PLATFORMS = [
  "imessage",
  "facebook",
  "instagram",
  "snapchat",
  "linkedin",
] as const;
export type Platform = (typeof PLATFORMS)[number];

const DAY = 1000 * 60 * 60 * 24;
const DEFAULT_CADENCE_DAYS = 30;

// Deep links — open the actual conversation in the right app/site.
function deepLink(platform: string, lead: {
  phone: string | null;
  instagramHandle: string | null;
  facebookUrl: string | null;
  linkedinUrl: string | null;
}): string | null {
  switch (platform) {
    case "imessage":
      return lead.phone ? `imessage://${lead.phone.replace(/[^\d+]/g, "")}` : null;
    case "instagram":
      return lead.instagramHandle
        ? `https://ig.me/m/${lead.instagramHandle.replace(/^@/, "")}`
        : null;
    case "facebook":
      return lead.facebookUrl
        ? (lead.facebookUrl.startsWith("http") ? lead.facebookUrl : `https://${lead.facebookUrl}`)
        : null;
    case "linkedin":
      return lead.linkedinUrl
        ? (lead.linkedinUrl.startsWith("http") ? lead.linkedinUrl : `https://${lead.linkedinUrl}`)
        : null;
    case "snapchat":
      return "https://web.snapchat.com/"; // no per-user deep link exists
    default:
      return null;
  }
}

export async function GET() {
  const leads = await prisma.lead.findMany({
    where: { doNotContact: false },
    select: {
      id: true,
      name: true,
      firstName: true,
      stage: true,
      type: true,
      phone: true,
      instagramHandle: true,
      facebookUrl: true,
      linkedinUrl: true,
      preferredPlatform: true,
      touchCadenceDays: true,
      lastContactDate: true,
      timeline_logs: {
        where: { platform: { in: [...PLATFORMS] } },
        orderBy: { touchedAt: "desc" },
        take: 60,
        select: { platform: true, direction: true, touchedAt: true, note: true },
      },
    },
    take: 500,
  });

  const now = Date.now();

  const rows = leads.map((lead) => {
    // last touch per platform
    const byPlatform: Record<string, { touchedAt: string; direction: string; daysAgo: number } | null> = {};
    for (const p of PLATFORMS) byPlatform[p] = null;
    for (const log of lead.timeline_logs) {
      const p = log.platform!;
      if (byPlatform[p]) continue; // logs are desc-sorted, first hit = most recent
      byPlatform[p] = {
        touchedAt: log.touchedAt.toISOString(),
        direction: log.direction,
        daysAgo: Math.floor((now - log.touchedAt.getTime()) / DAY),
      };
    }

    // most-recent touch across ANY platform
    const lastAny = lead.timeline_logs[0]?.touchedAt ?? lead.lastContactDate ?? null;
    const daysSinceAny = lastAny
      ? Math.floor((now - new Date(lastAny).getTime()) / DAY)
      : null;

    const cadence = lead.touchCadenceDays ?? DEFAULT_CADENCE_DAYS;
    const overdue = daysSinceAny === null || daysSinceAny > cadence;
    const overdueBy = daysSinceAny === null ? null : daysSinceAny - cadence;

    // which channel to reach them on: their preferred, else the one they last replied on, else null
    const lastInbound = lead.timeline_logs.find((l) => l.direction === "inbound");
    const suggestedPlatform =
      lead.preferredPlatform || lastInbound?.platform || null;

    const links: Record<string, string | null> = {};
    for (const p of PLATFORMS) links[p] = deepLink(p, lead);

    return {
      id: lead.id,
      name: lead.name,
      firstName: lead.firstName,
      stage: lead.stage,
      type: lead.type,
      preferredPlatform: lead.preferredPlatform,
      cadence,
      daysSinceAny,
      overdue,
      overdueBy,
      suggestedPlatform,
      byPlatform,
      links,
    };
  });

  // overdue first, then by staleness
  rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return (b.daysSinceAny ?? 1e9) - (a.daysSinceAny ?? 1e9);
  });

  return NextResponse.json({
    platforms: PLATFORMS,
    counts: {
      total: rows.length,
      overdue: rows.filter((r) => r.overdue).length,
    },
    rows,
  });
}

// Quick-log a touch (manual one-tap for channels with no API, or a note).
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { leadId, platform, direction = "outbound", method = "dm", note } = body;
  if (!leadId || !platform) {
    return NextResponse.json({ error: "leadId and platform required" }, { status: 400 });
  }

  const log = await prisma.contactLog.create({
    data: { leadId, platform, direction, method, note: note ?? null, touchedAt: new Date() },
  });
  await prisma.lead.update({
    where: { id: leadId },
    data: { lastContactDate: new Date() },
  });

  return NextResponse.json({ ok: true, log });
}
