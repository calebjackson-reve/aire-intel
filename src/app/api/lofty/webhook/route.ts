export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { mapLoftyLeadToAire } from "@/lib/lofty";
import { generateDraft } from "@/lib/draft-agent";
import { enrollLead } from "@/lib/smart-plan-executor";
import { getTodayCT } from "@/lib/brief-date";
import { handleInboundReply } from "@/lib/inbound-reply"; // AIRE: loop:inbound-reply-handler

// Lofty posts events here when leads are created/updated
// Register this URL in Lofty: Settings > Integrations > Webhooks
// URL: https://your-domain.com/api/lofty/webhook

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { event, lead: ll } = body;

  // AIRE: loop:inbound-reply-handler — handle inbound SMS/email reply activity events
  if (
    (body.activity_type === "sms_received" || body.activity_type === "email_received") &&
    body.leadId
  ) {
    const lid = String(body.leadId);
    const CUID_RE = /^c[a-z0-9]{24,}$/i;
    let aireLeadId: string | null = null;

    if (CUID_RE.test(lid)) {
      aireLeadId = lid;
    } else {
      const byLofty = await prisma.lead.findUnique({ where: { loftyId: lid } });
      aireLeadId = byLofty?.id ?? null;
    }

    if (!aireLeadId) {
      return Response.json({ ok: false, error: `No AIRE lead for loftyId "${lid}"` }, { status: 404 });
    }

    const channel: "text" | "email" = body.activity_type === "sms_received" ? "text" : "email";
    const content: string = String(body.text ?? body.subject ?? "").trim();

    await handleInboundReply({ leadId: aireLeadId, content, channel, method: channel }).catch(
      (err) => console.error("[lofty-webhook] inbound-reply error:", err),
    );

    return Response.json({ ok: true, event: body.activity_type, leadId: aireLeadId });
  }

  if (!ll?.id) {
    return Response.json({ ok: false, error: "No lead in payload" }, { status: 400 });
  }

  const data = mapLoftyLeadToAire(ll);

  try {
    const existing = await prisma.lead.findUnique({ where: { loftyId: data.loftyId } });
    let lead;

    if (existing) {
      lead = await prisma.lead.update({ where: { id: existing.id }, data });
    } else {
      lead = await prisma.lead.create({ data });
    }

    // New lead intake agent steps (non-blocking — errors are caught and logged)
    const isNew = !existing;
    if (isNew) {
      await runNewLeadIntake(lead.id).catch((err) =>
        console.error("[lofty-webhook] intake error:", err)
      );
    }

    return Response.json({ ok: true, event, loftyId: data.loftyId, leadId: lead.id, isNew });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

async function runNewLeadIntake(leadId: string) {
  const today = getTodayCT();

  // 1. Auto-enroll in "new_lead" SmartPlan if one exists
  const newLeadPlan = await prisma.smartPlan.findFirst({
    where: { triggerType: "new_lead", active: true },
    select: { id: true },
  });
  if (newLeadPlan) {
    await enrollLead(newLeadPlan.id, leadId).catch(() => null);
  }

  // 2. Generate a first-outreach draft and queue it
  let draftBody = "";
  let draftChannel: "text" | "email" = "text";
  let messageDraftId: string | undefined;

  try {
    const draft = await generateDraft({ leadId, source: "followup" });
    draftBody = draft.body;
    draftChannel = draft.channel;

    const savedDraft = await prisma.messageDraft.create({
      data: {
        leadId,
        channel: draftChannel,
        subject: draft.subject ?? null,
        body: draftBody,
        status: "pending",
        source: "followup",
      },
    });
    messageDraftId = savedDraft.id;
  } catch {
    // Draft generation failed — queue a placeholder so the lead still surfaces
    draftBody = "(Draft generation failed — write manually)";
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { name: true, phone: true, email: true },
  });

  await prisma.actionQueue.create({
    data: {
      type: "draft_message",
      agentType: "new_lead_intake",
      leadId,
      priority: 1,
      briefDate: today,
      requiresApproval: true,
      payload: {
        messageDraftId: messageDraftId ?? null,
        leadId,
        leadName: lead?.name ?? "New Lead",
        channel: draftChannel,
        body: draftBody,
        toPhone: lead?.phone ?? null,
        toEmail: lead?.email ?? null,
      },
    },
  });

  // 3. Dashboard notification
  await prisma.notification.create({
    data: {
      type: "lead_assigned",
      title: `New lead: ${lead?.name ?? "Unknown"}`,
      body: "First-outreach draft queued for your approval.",
      href: `/contacts/${leadId}`,
    },
  });
}

// Lofty may send a GET to verify the webhook URL
export async function GET() {
  return Response.json({ ok: true, service: "AIRE Lofty webhook receiver" });
}
