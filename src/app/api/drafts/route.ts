export const dynamic = "force-dynamic";
// Message Draft Queue — list / create / approve / dismiss
//
// GET  /api/drafts?status=pending     → list drafts (default: pending) + lead context
// POST /api/drafts                     → generate & queue a draft
//                                        body: { leadId, channel?, source?, instruction? }
// PATCH /api/drafts                    → act on a draft
//                                        body: { id, action: "approve"|"dismiss"|"edit", body?, subject? }
//
// Approving a draft is the ONLY place a comms-agent message gets sent. It fires the
// existing Twilio/SendGrid path, writes a ContactLog (so scoring + revival proof see
// it), bumps lastContactDate, and stamps the draft sent. Nothing auto-sends.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTwilioConfig, sendSMS, normalizePhone } from "@/lib/twilio";
import { getSendGridConfig, sendEmail } from "@/lib/sendgrid";
import { generateDraft, type DraftChannel, type DraftSource } from "@/lib/draft-agent";

const LEAD_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  stage: true,
  type: true,
  pricePoint: true,
} as const;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pending";

  const where = status === "all" ? {} : { status };
  const drafts = await prisma.messageDraft.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { lead: { select: LEAD_SELECT } },
  });

  return Response.json({ count: drafts.length, drafts });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const leadId = typeof body?.leadId === "string" ? body.leadId : null;
  if (!leadId) return Response.json({ error: "leadId is required" }, { status: 400 });

  const channel: DraftChannel | undefined =
    body?.channel === "text" || body?.channel === "email" ? body.channel : undefined;
  const source: DraftSource =
    body?.source === "revival" || body?.source === "followup" ? body.source : "manual";

  try {
    const gen = await generateDraft({
      leadId,
      channel,
      source,
      instruction: typeof body?.instruction === "string" ? body.instruction : undefined,
    });

    const draft = await prisma.messageDraft.create({
      data: {
        leadId,
        channel: gen.channel,
        subject: gen.subject,
        body: gen.body,
        source,
        cohortId: typeof body?.cohortId === "string" ? body.cohortId : null,
      },
      include: { lead: { select: LEAD_SELECT } },
    });

    return Response.json({ draft });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Draft generation failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : null;
  const action = body?.action;
  if (!id || !action) return Response.json({ error: "id and action are required" }, { status: 400 });

  const draft = await prisma.messageDraft.findUnique({
    where: { id },
    include: { lead: true },
  });
  if (!draft) return Response.json({ error: "Draft not found" }, { status: 404 });

  if (action === "edit") {
    const updated = await prisma.messageDraft.update({
      where: { id },
      data: {
        body: typeof body?.body === "string" ? body.body : draft.body,
        subject: typeof body?.subject === "string" ? body.subject : draft.subject,
      },
      include: { lead: { select: LEAD_SELECT } },
    });
    return Response.json({ draft: updated });
  }

  if (action === "dismiss") {
    const updated = await prisma.messageDraft.update({
      where: { id },
      data: { status: "dismissed" },
    });
    return Response.json({ draft: updated });
  }

  if (action === "approve") {
    if (draft.status === "sent") {
      return Response.json({ error: "Draft already sent" }, { status: 409 });
    }
    // Allow an inline edit at approve time.
    const finalBody = typeof body?.body === "string" ? body.body : draft.body;
    const finalSubject = typeof body?.subject === "string" ? body.subject : draft.subject;

    try {
      if (draft.channel === "email") {
        const to = draft.lead.email;
        if (!to) return Response.json({ error: "Lead has no email address" }, { status: 400 });
        const config = await getSendGridConfig();
        if (!config) return Response.json({ error: "SendGrid not configured." }, { status: 503 });
        await sendEmail({ to, subject: finalSubject ?? "", body: finalBody, config });
        await prisma.contactLog.create({
          data: {
            leadId: draft.leadId,
            method: "email",
            note: `Subject: ${finalSubject ?? ""}\n\n${finalBody}`,
            direction: "outbound",
          },
        });
      } else {
        const to = draft.lead.phone;
        if (!to) return Response.json({ error: "Lead has no phone number" }, { status: 400 });
        const config = await getTwilioConfig();
        if (!config) return Response.json({ error: "Twilio not configured." }, { status: 503 });
        await sendSMS(normalizePhone(to), finalBody, config);
        await prisma.contactLog.create({
          data: { leadId: draft.leadId, method: "text", note: finalBody, direction: "outbound" },
        });
      }

      const updated = await prisma.messageDraft.update({
        where: { id },
        data: { status: "sent", sentAt: new Date(), body: finalBody, subject: finalSubject },
      });
      await prisma.lead.update({
        where: { id: draft.leadId },
        data: { lastContactDate: new Date() },
      }).catch(() => {});

      return Response.json({ draft: updated, sent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Send failed";
      return Response.json({ error: msg }, { status: 500 });
    }
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}
