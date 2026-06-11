export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { triggerZap } from "@/lib/zapier";
import { generateContractMilestones } from "@/lib/contract-milestones";
import { autoEnrollReviewOnClose } from "@/lib/smart-plan-executor";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id },
    include: {
      timeline_logs: { orderBy: { createdAt: "desc" } },
      tasks: { orderBy: [{ done: "asc" }, { dueDate: "asc" }] },
      posts: { orderBy: { createdAt: "desc" }, take: 5 },
      smartPlans: { include: { plan: true } },
      loops: { orderBy: { updatedAt: "desc" } },
    },
  });
  return Response.json(lead);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  // Detect stage change so we can fire a Zap (drip rotation, Slack ping, etc.)
  let oldStage: string | null = null;
  if (typeof body.stage === "string") {
    const prev = await prisma.lead.findUnique({ where: { id }, select: { stage: true, name: true } });
    oldStage = prev?.stage ?? null;
  }

  const lead = await prisma.lead.update({ where: { id }, data: body });

  if (oldStage && oldStage !== lead.stage) {
    triggerZap("contact.stage_changed", {
      leadId: lead.id,
      leadName: lead.name,
      oldStage,
      newStage: lead.stage,
    });

    // When a contact enters under_contract, auto-create the 4 standard milestones.
    // Uses lead.contractDate (preferred), falls back to nextActionDate (legacy),
    // then to today's date. closingDate now lives on the Lead model directly so
    // walkthrough + closing-day tasks generate when populated.
    if (lead.stage === "under_contract") {
      const contractDate = lead.contractDate ?? lead.nextActionDate ?? new Date();
      const closing = lead.closingDate ?? null;
      generateContractMilestones(lead.id, new Date(contractDate), closing).catch(() => {});
    }

    // When a contact closes, auto-enroll them in the post-close review-ask
    // sequence. Gated behind GOOGLE_REVIEW_LINK (see autoEnrollReviewOnClose),
    // so it stays dormant until the real Google review link is configured.
    if (lead.stage === "closed") {
      autoEnrollReviewOnClose(lead.id).catch(() => {});
    }
  }

  return Response.json(lead);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.lead.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
