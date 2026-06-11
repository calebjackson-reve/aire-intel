export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";

// Returns a snapshot of the 4 Do-It-Now action card states for the dashboard.
// Each card surfaces a count + a few preview items so the user can act in one click.
export async function GET() {
  const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);

  // 1) Cold leads — pipeline leads not contacted in 5+ days
  const coldLeadsRaw = await prisma.lead.findMany({
    where: {
      stage: { in: ["active", "showing", "new_lead"] },
      OR: [
        { lastContactDate: null },
        { lastContactDate: { lt: fiveDaysAgo } },
      ],
    },
    select: { id: true, name: true, lastContactDate: true, stage: true, pricePoint: true },
    take: 6,
    orderBy: [{ lastContactDate: "asc" }, { createdAt: "asc" }],
  });
  const coldLeadsCount = await prisma.lead.count({
    where: {
      stage: { in: ["active", "showing", "new_lead"] },
      OR: [
        { lastContactDate: null },
        { lastContactDate: { lt: fiveDaysAgo } },
      ],
    },
  });

  // 2) Sphere check-ins — closed/sphere leads not touched in 90+ days
  // Treat any closed-stage lead or lead with source containing "sphere"/"referral" as sphere
  const sphereRaw = await prisma.lead.findMany({
    where: {
      OR: [
        { stage: "closed" },
        { source: { contains: "sphere" } },
        { source: { contains: "referral" } },
      ],
      AND: [
        {
          OR: [
            { lastContactDate: null },
            { lastContactDate: { lt: ninetyDaysAgo } },
          ],
        },
      ],
    },
    select: { id: true, name: true, lastContactDate: true },
    take: 5,
    orderBy: { lastContactDate: "asc" },
  });
  const sphereCount = await prisma.lead.count({
    where: {
      OR: [
        { stage: "closed" },
        { source: { contains: "sphere" } },
        { source: { contains: "referral" } },
      ],
      AND: [
        {
          OR: [
            { lastContactDate: null },
            { lastContactDate: { lt: ninetyDaysAgo } },
          ],
        },
      ],
    },
  });

  // 3) Contract milestones — anyone in under_contract stage gets check-ins
  const contractLeads = await prisma.lead.findMany({
    where: { stage: "under_contract" },
    select: { id: true, name: true, address: true, pricePoint: true, nextActionDate: true, nextActionNote: true },
    orderBy: { nextActionDate: "asc" },
  });

  // 4) Weekly market post — has one been generated this week?
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const recentMarketPost = await prisma.generatedPost.findFirst({
    where: { postType: "market_update", createdAt: { gte: startOfWeek } },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, caption: true },
  });

  return Response.json({
    coldFollowups: {
      count: coldLeadsCount,
      preview: coldLeadsRaw,
    },
    weeklyPost: {
      generated: !!recentMarketPost,
      lastGeneratedAt: recentMarketPost?.createdAt ?? null,
      preview: recentMarketPost?.caption?.slice(0, 140) ?? null,
    },
    sphereCheckins: {
      count: sphereCount,
      preview: sphereRaw,
    },
    contractMilestones: {
      count: contractLeads.length,
      preview: contractLeads.slice(0, 5),
    },
  });
}
