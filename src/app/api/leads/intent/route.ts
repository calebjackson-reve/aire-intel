// Sell-Intent API
//
// GET /api/leads/intent?id=<leadId>   → sell-intent score (0–100) + factors for one
//                                        lead, blending PropertyIntel attributes with
//                                        first-party engagement.
//
// Intent is a marketing-prioritization signal ONLY (see docs/intent-data-legal.md).
// Distinct from lead temperature — high intent = "likely thinking about selling".

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { scoreSellIntent } from "@/lib/score-model";

const DAY_MS = 86_400_000;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      timeline: true,
      propertyIntel: true,
    },
  });
  if (!lead) return Response.json({ error: "Lead not found" }, { status: 404 });

  // First-party engagement: all-time inbound count + recency of last inbound.
  const [inboundCount, lastInbound] = await Promise.all([
    prisma.contactLog.count({ where: { leadId: id, direction: "inbound" } }),
    prisma.contactLog.findFirst({
      where: { leadId: id, direction: "inbound" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const daysSinceInbound = lastInbound
    ? Math.floor((Date.now() - lastInbound.createdAt.getTime()) / DAY_MS)
    : null;

  const pi = lead.propertyIntel;
  const result = scoreSellIntent({
    equityPct: pi?.equityPct ?? null,
    ownershipYears: pi?.ownershipYears ?? null,
    absentee: pi?.absentee ?? null,
    preForeclosure: pi?.preForeclosure ?? null,
    ownerOccupied: pi?.ownerOccupied ?? null,
    type: lead.type,
    timeline: lead.timeline,
    inboundCount,
    daysSinceInbound,
  });

  return Response.json({ id: lead.id, ...result });
}
