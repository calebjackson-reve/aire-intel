export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";

// Close probability by pipeline stage — used to weight open pipeline into a forecast.
const STAGE_PROB: Record<string, number> = {
  new_lead: 0.10,
  active: 0.25,
  showing: 0.45,
  under_contract: 0.90,
};

const STAGE_ORDER = ["new_lead", "active", "showing", "under_contract"];
const STAGE_LABEL: Record<string, string> = {
  new_lead: "New",
  active: "Active",
  showing: "Showing",
  under_contract: "Under contract",
};

// Standard commission rate applied to open-pipeline volume to estimate GCI.
const COMMISSION_RATE = 0.03;

function leadVolume(lead: { pricePoint: number | null; priceMin: number | null; priceMax: number | null }): number {
  if (lead.pricePoint) return lead.pricePoint;
  if (lead.priceMin && lead.priceMax) return (lead.priceMin + lead.priceMax) / 2;
  return lead.priceMin ?? lead.priceMax ?? 0;
}

export async function GET() {
  const now = new Date();
  const year = now.getFullYear();
  const yearStart = new Date(year, 0, 1);

  const [closed, openLeads, goals] = await Promise.all([
    prisma.deal.findMany({
      where: { status: "closed", closingDate: { gte: yearStart } },
      select: { closingDate: true, salePrice: true, commission: true },
      orderBy: { closingDate: "asc" },
    }),
    prisma.lead.findMany({
      where: { stage: { in: STAGE_ORDER } },
      select: { stage: true, pricePoint: true, priceMin: true, priceMax: true },
    }),
    prisma.goal.findMany(),
  ]);

  // ── Closed actuals ────────────────────────────────────────────────────────
  const closedGci = closed.reduce((s, d) => s + d.commission, 0);
  const closedVolume = closed.reduce((s, d) => s + d.salePrice, 0);
  const closedUnits = closed.length;
  const avgGci = closedUnits > 0 ? closedGci / closedUnits : 0;

  // Monthly closed GCI (Jan-Dec, $)
  const monthly = Array.from({ length: 12 }, (_, i) => ({
    month: new Date(year, i, 1).toLocaleString("en-US", { month: "short" }),
    closed: 0,
    projected: 0,
    future: i > now.getMonth(),
  }));
  closed.forEach(d => {
    monthly[new Date(d.closingDate).getMonth()].closed += d.commission;
  });

  // ── Weighted pipeline by stage ──────────────────────────────────────────────
  const stageAgg: Record<string, { deals: number; volume: number }> = {};
  for (const s of STAGE_ORDER) stageAgg[s] = { deals: 0, volume: 0 };
  for (const lead of openLeads) {
    if (!stageAgg[lead.stage]) continue;
    stageAgg[lead.stage].deals += 1;
    stageAgg[lead.stage].volume += leadVolume(lead);
  }

  const stages = STAGE_ORDER.map(s => {
    const { deals, volume } = stageAgg[s];
    const prob = STAGE_PROB[s];
    const weighted = volume * COMMISSION_RATE * prob;
    return { stage: s, label: STAGE_LABEL[s], deals, volume, prob, weighted };
  });

  const weightedPipeline = stages.reduce((sum, s) => sum + s.weighted, 0);
  const pipelineVolume = stages.reduce((sum, s) => sum + s.volume, 0);
  const pipelineDeals = stages.reduce((sum, s) => sum + s.deals, 0);
  const pipelineGciUnweighted = pipelineVolume * COMMISSION_RATE;

  const projectedEoy = closedGci + weightedPipeline;

  const goalsMap = Object.fromEntries(goals.map(g => [g.metric, g.targetValue]));
  const goalGci = goalsMap["gci_annual"] ?? 650_000;
  const gap = Math.max(0, goalGci - projectedEoy);
  const dealsToGoal = avgGci > 0 ? Math.ceil(gap / avgGci) : 0;

  // Spread the weighted pipeline across remaining months for the projected bars.
  const remaining = monthly.filter(m => m.future).length;
  if (remaining > 0) {
    const perMonth = weightedPipeline / remaining;
    monthly.forEach(m => { if (m.future) m.projected = perMonth; });
  }

  return Response.json({
    year,
    goalGci,
    closed: { gci: closedGci, volume: closedVolume, units: closedUnits, avgGci },
    projectedEoy,
    gap,
    dealsToGoal,
    weightedPipeline,
    pipeline: { gciUnweighted: pipelineGciUnweighted, volume: pipelineVolume, deals: pipelineDeals },
    stages,
    monthly,
  });
}
