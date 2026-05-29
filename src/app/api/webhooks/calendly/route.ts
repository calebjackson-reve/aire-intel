// Calendly webhook receiver
// Handles invitee.created events → creates Task + Notification + Lead (if new)
//
// Setup: In Calendly → Integrations → Webhooks, point to:
//   https://your-domain.com/api/webhooks/calendly
// Events: invitee.created, invitee.canceled

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

interface CalendlyInvitee {
  name: string;
  email: string;
  questions_and_answers?: { question: string; answer: string }[];
}

interface CalendlyEvent {
  name: string;                  // "30 Minute Meeting"
  start_time: string;            // ISO date
  end_time: string;
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

  // Create new lead if no match
  if (!lead) {
    lead = await prisma.lead.create({
      data: {
        name: inviteeName,
        email: inviteeEmail || null,
        phone: phone || null,
        stage: "new_lead",
        source: "Calendly",
        nextActionNote: `Scheduled: ${eventName} on ${eventTime.toLocaleDateString()}`,
      },
    });
  }

  // Create task for the booking
  const taskTitle = location
    ? `📅 ${eventName} — ${inviteeName} @ ${location}`
    : `📅 ${eventName} — ${inviteeName}`;

  await prisma.task.create({
    data: {
      leadId: lead.id,
      title: taskTitle,
      dueDate: eventTime,
      priority: "high",
      done: false,
    },
  });

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

  return Response.json({ ok: true, leadId: lead.id });
}
