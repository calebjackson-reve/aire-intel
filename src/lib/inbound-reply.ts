// AIRE: loop:inbound-reply-handler
// Shared handler for inbound SMS/email replies arriving via Lofty or Zapier webhooks.

import { prisma } from "./prisma";
import { logError, withRetry } from "./error-memory";
import { getTodayCT } from "./brief-date";
import { classifyReplyIntent } from "./contact-classifier";
import { generateDraft } from "./draft-agent";
import { getSetting } from "./settings";

async function getSettingWithDefault(key: string, fallback = ""): Promise<string> {
  return (await getSetting(key)) ?? fallback;
}

export interface InboundReplyOpts {
  leadId: string;
  content: string;
  channel: "text" | "email";
  method: string; // value stored in ContactLog.method
}

/**
 * Process an inbound reply from a lead:
 * classify intent → update lead → log contact → generate draft → queue action.
 * Non-throwing: all errors are logged and the caller gets a bare notification on failure.
 */
export async function handleInboundReply(opts: InboundReplyOpts): Promise<void> {
  const { leadId, content, channel, method } = opts;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, name: true, stage: true, phone: true, email: true },
  });
  if (!lead) return;

  // Exit: closed leads are ignored per spec safety rail
  if (lead.stage === "closed_won" || lead.stage === "closed_lost") return;

  const intent = classifyReplyIntent(content);
  const today = getTodayCT();

  // ── Unsubscribe ─────────────────────────────────────────────────────────────
  if (intent === "unsubscribe") {
    await prisma.lead.update({ where: { id: leadId }, data: { stage: "closed_lost" } });
    await prisma.contactLog.create({
      data: { leadId, method, note: `[Unsubscribe] ${content.slice(0, 500)}`, direction: "inbound" },
    });
    await prisma.notification.create({
      data: {
        type: "lead_assigned",
        title: `${lead.name} unsubscribed`,
        body: "Lead moved to closed_lost — no further outreach will be generated.",
        href: `/contacts/${leadId}`,
      },
    });
    return;
  }

  // ── Update lead ─────────────────────────────────────────────────────────────
  const stageData: { lastContactDate: Date; stage?: string } = { lastContactDate: new Date() };
  // Advance from new_lead → active when the lead shows clear interest
  if (intent === "interested" && lead.stage === "new_lead") {
    stageData.stage = "active";
  }
  await prisma.lead.update({ where: { id: leadId }, data: stageData });

  // ── ContactLog ───────────────────────────────────────────────────────────────
  await prisma.contactLog.create({
    data: { leadId, method, note: content.slice(0, 1000), direction: "inbound" },
  });

  // ── Rate-limit: max 1 draft per lead per configurable window ─────────────────
  const windowMinutes = parseInt(
    await getSettingWithDefault("INBOUND_REPLY_RATE_LIMIT_MINUTES", "15"),
    10,
  );
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
  const recentDraft = await prisma.messageDraft.findFirst({
    where: { leadId, source: "reply_to_inbound", createdAt: { gte: windowStart } },
  });
  if (recentDraft) return;

  // ── Idempotency: skip if a pending action already exists for today ────────────
  const existingAction = await prisma.actionQueue.findFirst({
    where: {
      leadId,
      briefDate: today,
      status: "pending",
      type: "draft_message",
      agentType: "inbound_reply_handler",
    },
  });
  if (existingAction) return;

  // ── Generate draft ───────────────────────────────────────────────────────────
  let draftBody = "";
  let draftSubject: string | null = null;
  let messageDraftId: string | undefined;

  try {
    const draft = await withRetry(
      () =>
        generateDraft({
          leadId,
          channel,
          source: "reply_to_inbound",
          instruction: `Intent classified as: ${intent}. Inbound message: "${content.slice(0, 300)}"`,
        }),
      { source: "inbound-reply-handler", type: "ai", context: { leadId } },
    );
    draftBody = draft.body;
    draftSubject = draft.subject;

    const saved = await prisma.messageDraft.create({
      data: { leadId, channel, subject: draftSubject, body: draftBody, status: "pending", source: "reply_to_inbound" },
    });
    messageDraftId = saved.id;
  } catch (err) {
    await logError("ai", "inbound-reply-handler", err, { leadId });
    draftBody = "(Draft generation failed — reply manually)";
  }

  // ── ActionQueue ──────────────────────────────────────────────────────────────
  await prisma.actionQueue.create({
    data: {
      type: "draft_message",
      agentType: "inbound_reply_handler",
      leadId,
      priority: 2,
      briefDate: today,
      requiresApproval: true,
      payload: {
        messageDraftId: messageDraftId ?? null,
        leadId,
        leadName: lead.name,
        intent,
        channel,
        body: draftBody,
        subject: draftSubject,
        toPhone: lead.phone ?? null,
        toEmail: lead.email ?? null,
        inboundContent: content.slice(0, 500),
      },
    },
  });

  // ── Dashboard notification ───────────────────────────────────────────────────
  await prisma.notification.create({
    data: {
      type: "lead_assigned",
      title: `Reply from ${lead.name} — draft ready`,
      body: messageDraftId
        ? `Intent: ${intent}. Response draft queued for approval.`
        : `Intent: ${intent}. Draft failed — review manually.`,
      href: `/contacts/${leadId}`,
    },
  });
}
