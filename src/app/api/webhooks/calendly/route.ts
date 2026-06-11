export const dynamic = "force-dynamic";
// Calendly webhook receiver
// Handles invitee.created events → creates Task + Notification + Lead (if new)
// AIRE: loop:calendly-post-meeting-followup
//
// Setup: In Calendly → Integrations → Webhooks, point to:
//   https://your-domain.com/api/webhooks/calendly
// Events: invitee.created, invitee.canceled

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-memory";

interface CalendlyInvitee {
  name: string;
  email: string;
  uri?: string;                  // https://api.calendly.com/scheduled_events/{eventUuid}/invitees/{inviteeUuid}
  questions_and_answers?: { question: string; answer: string }[];
}

interface CalendlyEvent {
  name: string;                  // "30 Minute Meeting"
  start_time: string;            // ISO date
  end_time: string;
  uri?: string;                  // https://api.calendly.com/scheduled_events/{eventUuid}
  location?: { location?: string };
}

interface CalendlyPayload {
  event: string;                 // "invitee.created" | "invitee.canceled"
  payload: {
    invitee: CalendlyInvitee;
    event: CalendlyEvent;
    cancel_url?: string;
  };
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

export async function POST(req: NextRequest) {
  let body: CalendlyPayload;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event, payload } = body;

  // Only handle invitee.created
  if (event !== "invitee.created") {
    return Response.json({ ignored: true });
  }

  const { invitee, event: calEvent } = payload;
  const inviteeName = invitee.name?.trim() || "Unknown";
  const inviteeEmail = invitee.email?.toLowerCase().trim();
  const eventTime = new Date(calEvent.start_time);
  const eventName = calEvent.name ?? "Meeting";
  const location = calEvent.location?.location ?? "";

  // Extract phone from Q&A if present
  let phone: string | null = null;
  for (const qa of invitee.questions_and_answers ?? []) {
    if (/phone|number|cell/i.test(qa.question) && qa.answer) {
      const normalized = normalizePhone(qa.answer);
      if (normalized.length === 10) { phone = normalized; break; }
    }
  }

  // AIRE: loop:calendly-post-meeting-followup — extract event UUID for idempotency
  let calendlyEventId = "";
  // Prefer event URI; fall back to invitee URI (extract the scheduled_event segment)
  if (calEvent.uri) {
    calendlyEventId = calEvent.uri.split("/").pop() || "";
  } else if (invitee.uri) {
    const parts = invitee.uri.split("/");
    const idx = parts.indexOf("invitees");
    if (idx > 0) calendlyEventId = parts[idx - 1];
  }
  if (!calendlyEventId) {
    // deterministic fallback — same email+time always yields same key
    calendlyEventId = `${inviteeEmail}-${calEvent.start_time}`;
  }

  try {
    // Try to match to existing Lead by email or phone
    let lead = null;
    if (inviteeEmail) {
      lead = await prisma.lead.findFirst({ where: { email: inviteeEmail } });
    }
    if (!lead && phone) {
      lead = await prisma.lead.findFirst({ where: { phone } });
    }
    // Fuzzy name match fallback
    if (!lead) {
      lead = await prisma.lead.findFirst({
        where: { name: { contains: inviteeName.split(" ")[0] } },
      });
    }

    // AIRE: loop:calendly-post-meeting-followup — upsert lead, update lastContactDate
    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          name: inviteeName,
          email: inviteeEmail || null,
          phone: phone || null,
          stage: "new_lead",
          source: "Calendly",
          nextActionNote: `Scheduled: ${eventName} on ${eventTime.toLocaleDateString()}`,
          lastContactDate: new Date(),
        },
      });
    } else {
      const stageUpdates: { lastContactDate: Date; stage?: string } = {
        lastContactDate: new Date(),
      };
      if (lead.stage === "new_lead" || lead.stage === "cold") {
        stageUpdates.stage = "active";
      }
      lead = await prisma.lead.update({
        where: { id: lead.id },
        data: stageUpdates,
      });
    }

    // AIRE: loop:calendly-post-meeting-followup — idempotency: skip task/queue if already created
    const existing = await prisma.actionQueue.findFirst({
      where: {
        leadId: lead.id,
        type: "draft_message",
        payload: { path: ["calendlyEventId"], equals: calendlyEventId },
      },
    });

    if (!existing) {
      // Prep task: due 2h before meeting
      const prepDueDate = new Date(eventTime.getTime() - 2 * 60 * 60 * 1000);
      await prisma.task.create({
        data: {
          leadId: lead.id,
          title: `Prep for meeting with ${inviteeName}`,
          dueDate: prepDueDate,
          priority: "high",
          done: false,
        },
      });

      // Confirmation draft queued for 15min after meeting start
      // AIRE: loop:calendly-post-meeting-followup
      const scheduledFor = new Date(eventTime.getTime() + 15 * 60 * 1000);
      await prisma.actionQueue.create({
        data: {
          leadId: lead.id,
          type: "draft_message",
          agentType: "calendly_webhook",
          payload: {
            leadId: lead.id,
            meetingTime: eventTime.toISOString(),
            meetingType: eventName,
            calendlyEventId,
            location: location || null,
          },
          requiresApproval: true,
          scheduledFor,
          priority: 2,
        },
      });

      // Post-meeting follow-up — processed by cron at endTime + 30min
      // AIRE: loop:calendly-post-meeting-followup
      const endTime = new Date(calEvent.end_time);
      const followUpScheduledFor = new Date(endTime.getTime() + 30 * 60 * 1000);
      await prisma.actionQueue.create({
        data: {
          leadId: lead.id,
          type: "calendly_followup_pending",
          agentType: "calendly_webhook",
          payload: {
            leadId: lead.id,
            meetingTime: eventTime.toISOString(),
            meetingEndTime: endTime.toISOString(),
            meetingType: eventName,
            calendlyEventId,
            inviteeName,
            location: location || null,
          },
          requiresApproval: true,
          scheduledFor: followUpScheduledFor,
          priority: 2,
        },
      });
    }

    // Create notification
    await prisma.notification.create({
      data: {
        type: "calendly_booking",
        title: `New booking from ${inviteeName}`,
        body: `${eventName} scheduled for ${eventTime.toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}`,
        href: `/contacts/${lead.id}`,
        read: false,
      },
    });

    return Response.json({ ok: true, leadId: lead.id, calendlyEventId, deduped: !!existing });
  } catch (err) {
    await logError("api_failure", "webhooks/calendly", err, { inviteeEmail, eventName });
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
