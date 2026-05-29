import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

type Period = "ytd" | "qtd" | "mtd" | "wtd";

function periodStart(period: Period): Date {
  const now = new Date();
  if (period === "ytd") return new Date(now.getFullYear(), 0, 1);
  if (period === "qtd") {
    const q = Math.floor(now.getMonth() / 3);
    return new Date(now.getFullYear(), q * 3, 1);
  }
  if (period === "mtd") return new Date(now.getFullYear(), now.getMonth(), 1);
  // wtd: start of week (Sunday)
  const d = new Date(now);
  d.setDate(now.getDate() - now.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const period = (searchParams.get("period") || "ytd") as Period;

  const start = periodStart(period);
  const lastYearStart = new Date(start);
  lastYearStart.setFullYear(lastYearStart.getFullYear() - 1);
  const lastYearEnd = new Date();
  lastYearEnd.setFullYear(lastYearEnd.getFullYear() - 1);

  const [current, lastYear, monthly, goals] = await Promise.all([
    prisma.deal.aggregate({
      where: { status: "closed", closingDate: { gte: start } },
      _sum: { salePrice: true, commission: true },
      _count: true,
    }),
    prisma.deal.aggregate({
      where: { status: "closed", closingDate: { gte: lastYearStart, lt: lastYearEnd } },
      _sum: { salePrice: true, commission: true },
      _count: true,
    }),
    prisma.deal.findMany({
      where: { status: "closed", closingDate: { gte: new Date(new Date().getFullYear(), 0, 1) } },
      select: { closingDate: true, salePrice: true, commission: true },
      orderBy: { closingDate: "asc" },
    }),
    prisma.goal.findMany(),
  ]);

  // Build month-by-month series (Jan-Dec)
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: new Date(new Date().getFullYear(), i, 1).toLocaleString("en-US", { month: "short" }),
    gci: 0,
    volume: 0,
    units: 0,
  }));

  monthly.forEach(d => {
    const m = new Date(d.closingDate).getMonth();
    months[m].gci += d.commission;
    months[m].volume += d.salePrice;
    months[m].units += 1;
  });

  // Cumulative series for the trend chart
  let cumGci = 0, cumVolume = 0, cumUnits = 0;
  const cumulative = months.map(m => {
    cumGci += m.gci;
    cumVolume += m.volume;
    cumUnits += m.units;
    return { month: m.month, gci: cumGci, volume: cumVolume, units: cumUnits };
  });

  // Leads added per month for "Leads Added" KPI
  const leadsByMonth = await prisma.lead.findMany({
    where: { createdAt: { gte: new Date(new Date().getFullYear(), 0, 1) } },
    select: { createdAt: true },
  });
  const leadsMonths = Array.from({ length: 12 }, () => 0);
  leadsByMonth.forEach(l => {
    leadsMonths[new Date(l.createdAt).getMonth()] += 1;
  });
  let cumLeads = 0;
  const leadsCumulative = leadsMonths.map((count, i) => {
    cumLeads += count;
    return { month: months[i].month, leads: cumLeads, monthly: count };
  });

  // Active pipeline value (snapshot)
  const pipelineAgg = await prisma.lead.aggregate({
    where: { stage: { not: "closed" } },
    _sum: { priceMin: true, pricePoint: true },
  });
  const pipelineValue = (pipelineAgg._sum.priceMin ?? 0) + (pipelineAgg._sum.pricePoint ?? 0);

  const goalsMap = Object.fromEntries(goals.map(g => [g.metric, g.targetValue]));

  return Response.json({
    period,
    current: {
      gci: current._sum.commission ?? 0,
      volume: current._sum.salePrice ?? 0,
      units: current._count,
      pipelineValue,
    },
    lastYear: {
      gci: lastYear._sum.commission ?? 0,
      volume: lastYear._sum.salePrice ?? 0,
      units: lastYear._count,
    },
    monthlySeries: months,
    cumulativeSeries: cumulative,
    leadsSeries: leadsCumulative,
    goals: {
      gci: goalsMap["gci_annual"] ?? null,
      volume: goalsMap["volume_annual"] ?? null,
      units: goalsMap["units_annual"] ?? null,
    },
  });
}
