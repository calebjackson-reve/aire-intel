export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [total, stages, types, coldCount, underContract, pipelineAgg] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.groupBy({ by: ["stage"], _count: true }),
    prisma.lead.groupBy({ by: ["type"], _count: true }),
    prisma.lead.count({
      where: {
        stage: { not: "closed" },
        OR: [
          { lastContactDate: null },
          { lastContactDate: { lt: new Date(Date.now() - 5 * 86_400_000) } },
        ],
      },
    }),
    prisma.lead.count({ where: { stage: "under_contract" } }),
    prisma.lead.aggregate({
      where: { stage: { not: "closed" } },
      _sum: { priceMin: true, pricePoint: true },
      _count: true,
    }),
  ]);

  const stageMap = Object.fromEntries(stages.map(s => [s.stage, s._count]));
  const typeMap = Object.fromEntries(types.map(t => [t.type, t._count]));
  const active = total - (stageMap["closed"] || 0);

  const priceSum = (pipelineAgg._sum.priceMin ?? 0) + (pipelineAgg._sum.pricePoint ?? 0);
  const priceCount = pipelineAgg._count || 1;

  return Response.json({
    total,
    active,
    cold: coldCount,
    underContract,
    closed: stageMap["closed"] || 0,
    pipelineValue: priceSum,
    avgPrice: Math.round(priceSum / priceCount),
    stages: stageMap,
    types: typeMap,
  });
}
