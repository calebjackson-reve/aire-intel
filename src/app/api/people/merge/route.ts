export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/people/merge
 * Confirms a social person ↔ lead match, or merges two leads.
 *
 * body: { socialPersonId: string, leadId: string, platform: "facebook"|"instagram"|"contacts" }
 *   OR: { keepLeadId: string, mergeLeadId: string }  (lead–lead merge, copies handles then deletes mergeLeadId)
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  // ── Social person → Lead link ─────────────────────────────────────────
  if (body.socialPersonId && body.leadId) {
    const { socialPersonId, leadId, platform } = body as { socialPersonId: string; leadId: string; platform: string };

    const sp = await prisma.socialPerson.findUniqueOrThrow({ where: { id: socialPersonId } });

    const update: Record<string, string> = {};
    if (sp.facebookUrl && !update.facebookUrl) update.facebookUrl = sp.facebookUrl;
    if (sp.facebookName) update.facebookName = sp.facebookName;
    if (sp.instagramHandle) update.instagramHandle = sp.instagramHandle;
    if (sp.email) update.email = sp.email;
    if (sp.phone) update.phone = sp.phone;
    if (platform) update.preferredPlatform = platform;

    await prisma.$transaction([
      prisma.lead.update({ where: { id: leadId }, data: update }),
      prisma.socialPerson.update({ where: { id: socialPersonId }, data: { matchedLeadId: leadId } }),
    ]);

    return NextResponse.json({ ok: true, action: "linked", leadId });
  }

  // ── Lead ↔ Lead merge (keep one, absorb handles from the other) ───────
  if (body.keepLeadId && body.mergeLeadId) {
    const { keepLeadId, mergeLeadId } = body as { keepLeadId: string; mergeLeadId: string };
    const from = await prisma.lead.findUniqueOrThrow({ where: { id: mergeLeadId } });
    const keep = await prisma.lead.findUniqueOrThrow({ where: { id: keepLeadId } });

    const patch: Record<string, string | null> = {};
    if (!keep.phone && from.phone) patch.phone = from.phone;
    if (!keep.email && from.email) patch.email = from.email;
    if (!keep.facebookUrl && from.facebookUrl) patch.facebookUrl = from.facebookUrl;
    if (!keep.instagramHandle && from.instagramHandle) patch.instagramHandle = from.instagramHandle;
    if (!keep.linkedinUrl && from.linkedinUrl) patch.linkedinUrl = from.linkedinUrl;

    // Re-point any contact logs from the discarded lead
    await prisma.contactLog.updateMany({ where: { leadId: mergeLeadId }, data: { leadId: keepLeadId } });
    await prisma.lead.update({ where: { id: keepLeadId }, data: patch });
    await prisma.lead.delete({ where: { id: mergeLeadId } });

    return NextResponse.json({ ok: true, action: "merged", keepLeadId });
  }

  return NextResponse.json({ error: "Provide either socialPersonId+leadId or keepLeadId+mergeLeadId" }, { status: 400 });
}
