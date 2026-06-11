import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTwilioConfig, sendSMS, normalizePhone } from "@/lib/twilio";
import { getSendGridConfig, sendEmail } from "@/lib/sendgrid";
import { sendMessengerMessage } from "@/lib/messenger";

type ActionPayload = Record<string, unknown>;

// POST /api/actions/[id]/execute — run an approved ActionQueue item
// Must be approved first. Dispatches based on action type.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const item = await prisma.actionQueue.findUnique({
    where: { id },
    include: { lead: true },
  });
  if (!item) return Response.json({ error: "Not found" }, { status: 404 });
  if (item.status !== "approved") {
    return Response.json({ error: `Must be approved before executing — status: ${item.status}` }, { status: 409 });
  }

  await prisma.actionQueue.update({ where: { id }, data: { status: "executing" } });

  try {
    const payload = item.payload as ActionPayload;
    let result: Record<string, unknown> = {};

    switch (item.type) {
      case "draft_message": {
        result = await executeDraftMessage(item.id, payload, item.leadId);
        break;
      }
      case "follow_up_text": {
        result = await executeFollowUpText(payload, item.leadId);
        break;
      }
      case "send_client_email": {
        result = await executeClientEmail(payload, item.leadId);
        break;
      }
      case "post_content": {
        result = await executePostContent(payload);
        break;
      }
      case "create_lofty_task": {
        result = await createTask(payload, item.leadId);
        break;
      }
      default:
        throw new Error(`Unknown action type: ${item.type}`);
    }

    await prisma.actionQueue.update({
      where: { id },
      data: { status: "executed", executedAt: new Date() },
    });

    return Response.json({ ok: true, result });
  } catch (err) {
    await prisma.actionQueue.update({
      where: { id },
      data: { status: "failed", failedAt: new Date(), failReason: String(err) },
    });
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

async function executeDraftMessage(
  actionId: string,
  payload: ActionPayload,
  leadId: string | null
): Promise<Record<string, unknown>> {
  const messageDraftId = payload.messageDraftId as string | undefined;
  const channel = payload.channel as string;
  const body = payload.body as string;
  const subject = payload.subject as string | undefined;

  if (!body) throw new Error("draft_message payload missing body");

  // Send the message
  let sendResult: Record<string, unknown> = {};

  if (channel === "messenger") {
    const psid = payload.messengerPsid as string | undefined;
    if (!psid) throw new Error("draft_message messenger payload missing messengerPsid");
    const result = await sendMessengerMessage(psid, body);

    if (messageDraftId) {
      await prisma.messageDraft.update({
        where: { id: messageDraftId },
        data: { status: "sent", sentAt: new Date() },
      }).catch(() => null);
    }
    if (leadId) {
      await prisma.contactLog.create({
        data: { leadId, method: "facebook_messenger", direction: "outbound", note: `Agent-executed via ActionQueue (${actionId.slice(0, 8)})` },
      });
    }
    return result;
  } else if (channel === "email") {
    const toEmail = payload.toEmail as string | undefined;
    const lead = leadId
      ? await prisma.lead.findUnique({ where: { id: leadId }, select: { email: true } })
      : null;
    const to = toEmail ?? lead?.email;
    if (!to) throw new Error("No email address for draft_message execution");

    const config = await getSendGridConfig();
    if (!config) throw new Error("SendGrid not configured");

    sendResult = await sendEmail({
      to,
      subject: subject ?? "Follow-up from Caleb",
      body,
      config,
    });
  } else {
    const toPhone = payload.toPhone as string | undefined;
    const lead = leadId
      ? await prisma.lead.findUnique({ where: { id: leadId }, select: { phone: true } })
      : null;
    const to = toPhone ?? lead?.phone;
    if (!to) throw new Error("No phone number for draft_message execution");

    const config = await getTwilioConfig();
    if (!config) throw new Error("Twilio not configured");

    sendResult = await sendSMS(normalizePhone(to), body, config);
  }

  // Mark MessageDraft as sent if id is present
  if (messageDraftId) {
    await prisma.messageDraft.update({
      where: { id: messageDraftId },
      data: { status: "sent", sentAt: new Date() },
    }).catch(() => null);
  }

  // Log the contact
  if (leadId) {
    await prisma.contactLog.create({
      data: {
        leadId,
        method: channel === "email" ? "email" : "text",
        direction: "outbound",
        note: `Agent-executed via ActionQueue (${actionId.slice(0, 8)})`,
      },
    });
  }

  return sendResult;
}

async function executeFollowUpText(
  payload: ActionPayload,
  leadId: string | null
): Promise<Record<string, unknown>> {
  const to = payload.to as string;
  const body = payload.body as string;
  if (!to || !body) throw new Error("follow_up_text payload missing to or body");

  const config = await getTwilioConfig();
  if (!config) throw new Error("Twilio not configured");

  const result = await sendSMS(normalizePhone(to), body, config);

  if (leadId) {
    await prisma.contactLog.create({
      data: { leadId, method: "text", direction: "outbound", note: "Agent follow-up text" },
    });
  }

  return result;
}

async function executeClientEmail(
  payload: ActionPayload,
  leadId: string | null
): Promise<Record<string, unknown>> {
  const to = payload.to as string;
  const subject = payload.subject as string;
  const body = payload.body as string;
  if (!to || !subject || !body) throw new Error("send_client_email payload missing required fields");

  const config = await getSendGridConfig();
  if (!config) throw new Error("SendGrid not configured");

  const result = await sendEmail({ to, subject, body, config });

  if (leadId) {
    await prisma.contactLog.create({
      data: {
        leadId,
        method: "email",
        direction: "outbound",
        note: `Agent email: ${subject}`,
      },
    });
  }

  return result;
}

async function executePostContent(payload: ActionPayload): Promise<Record<string, unknown>> {
  const contentProjectId = payload.contentProjectId as string | undefined;
  const caption = payload.caption as string;
  const platform = (payload.platform as string) || "instagram";
  const imageUrl = payload.imageUrl as string | undefined;

  // Check Phase B autoExecute
  const autoExSetting = await prisma.setting
    .findUnique({ where: { key: "agent.post_content.autoExecute" } })
    .catch(() => null);
  const autoPublish = autoExSetting?.value === "true";

  if (contentProjectId) {
    const updated = await prisma.contentProject.update({
      where: { id: contentProjectId },
      data: { status: autoPublish ? "scheduled" : "ready" },
    });
    return { contentProjectId, status: updated.status, autoPublish };
  }

  // Create a ScheduledPost record
  const post = await prisma.scheduledPost.create({
    data: {
      platform,
      caption: caption ?? "",
      imageUrl: imageUrl ?? null,
      status: autoPublish ? "scheduled" : "draft",
    },
  });

  return { scheduledPostId: post.id, status: post.status, autoPublish };
}

async function createTask(
  payload: ActionPayload,
  leadId: string | null
): Promise<Record<string, unknown>> {
  const title = payload.title as string;
  const description = payload.description as string | undefined;
  const dueDateStr = payload.dueDate as string | undefined;
  const priority = (payload.priority as string) || "normal";

  if (!title) throw new Error("create_lofty_task payload missing title");

  const task = await prisma.task.create({
    data: {
      leadId,
      title,
      description: description ?? null,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
      priority,
    },
  });

  return { taskId: task.id, title, priority };
}
