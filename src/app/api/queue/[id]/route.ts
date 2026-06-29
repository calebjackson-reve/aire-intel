export const dynamic = "force-dynamic";

// PATCH /api/queue/[id] — approve or skip a queued action from the cockpit.
//   body: { action: "approve" | "skip" }
// Approving a reel post_content also feeds the Karpathy reel flywheel.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordReelOutcome, type ReelFingerprint } from "@/lib/reel/learning";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action } = (await request.json().catch(() => ({}))) as { action?: string };

  if (action !== "approve" && action !== "skip") {
    return Response.json({ error: "action must be 'approve' or 'skip'" }, { status: 400 });
  }

  const item = await prisma.actionQueue.findUnique({ where: { id } });
  if (!item) return Response.json({ error: "Not found" }, { status: 404 });
  if (item.status !== "pending") {
    return Response.json({ error: `Already ${item.status}` }, { status: 409 });
  }

  const updated = await prisma.actionQueue.update({
    where: { id },
    data:
      action === "approve"
        ? { status: "approved", approvedAt: new Date() }
        : { status: "skipped", skippedAt: new Date() },
  });

  // Feed the reel learning loop when a rendered reel is approved/skipped.
  const payload = (item.payload ?? {}) as { reelFingerprint?: ReelFingerprint };
  if (item.type === "post_content" && payload.reelFingerprint) {
    await recordReelOutcome(payload.reelFingerprint, action === "approve" ? "approved" : "rejected").catch(() => {});
  }

  return Response.json({ ok: true, item: updated });
}
