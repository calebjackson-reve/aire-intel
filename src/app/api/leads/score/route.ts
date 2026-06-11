export const dynamic = "force-dynamic";
// Lead scoring endpoint
// GET /api/leads/score?id=xxx  → score a single lead (with component breakdown)
// GET /api/leads/score         → score all non-closed leads (top 20 by score)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { scoreLeadSync, scoreLeadDetailed, scoreLevel } from "@/lib/lead-score";
import { loadScoreModel } from "@/lib/score-model";

// Fields the learned close-probability model reads, plus identity/scoring basics.
const SCORE_SELECT = {
  id: true,
  name: true,
  stage: true,
  lastContactDate: true,
  pricePoint: true,
  source: true,
  type: true,
  timeline: true,
  preApproved: true,
} as const;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  // Warm the learned model once per request; falls back to static if inactive.
  await loadScoreModel();

  if (id) {
    const lead = await prisma.lead.findUnique({
      where: { id },
      select: SCORE_SELECT,
    });
    if (!lead) return Response.json({ error: "Not found" }, { status: 404 });

    const logCount = await prisma.contactLog.count({
      where: {
        leadId: id,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    });

    const breakdown = scoreLeadDetailed(lead, logCount);
    return Response.json({
      id,
      score: breakdown.total,
      level: scoreLevel(breakdown.total),
      breakdown,
    });
  }

  // Batch — score all active leads
  const leads = await prisma.lead.findMany({
    where: { stage: { not: "closed" } },
    select: SCORE_SELECT,
    take: 200,
  });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const logCounts = await prisma.contactLog.groupBy({
    by: ["leadId"],
    where: { createdAt: { gte: thirtyDaysAgo } },
    _count: { id: true },
  });
  const logMap = Object.fromEntries(logCounts.map(r => [r.leadId, r._count.id]));

  const scored = leads
    .map(l => {
      const score = scoreLeadSync(l, logMap[l.id] ?? 0);
      return { id: l.id, name: l.name, stage: l.stage, score, level: scoreLevel(score) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return Response.json({ leads: scored });
}
