export const dynamic = "force-dynamic";

// Loop 24 — Pre-Appointment CMA
// Cron: 0 11 * * * — Scans Google Calendar for appointments in the next 8 hours,
// matches them to leads, and generates a CMA brief for each matched lead with an address.

import { verifyCronSecret, verifyCronOrInternal, cronUnauthorized } from "@/lib/cron-auth";
import { startRun, finishRun, failRun } from "@/lib/agent-run";
import { prisma } from "@/lib/prisma";
import { fetchUpcomingEvents } from "@/lib/google-calendar";
import { buildCMASummary } from "@/lib/rentcast";
import { getTodayCT } from "@/lib/brief-date";

const LOOK_AHEAD_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_EVENTS = 10;

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  return runPreApptCMA();
}

export async function GET(request: Request) {
  if (!verifyCronOrInternal(request)) return cronUnauthorized();
  return runPreApptCMA();
}

async function runPreApptCMA() {
  const runId = await startRun("morning_brief");
  const today = getTodayCT();

  try {
    // Graceful Google check
    const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!googleSecret) {
      await prisma.notification.create({
        data: {
          type: "sync_complete",
          title: "Google Calendar not connected",
          body: "Pre-appointment CMA requires Google OAuth. Set up at /settings.",
          href: "/settings",
        },
      });
      await finishRun(runId, { itemsProcessed: 0, actionsQueued: 0 });
      return Response.json({ ok: true, skipped: "no_google" });
    }

    // Fetch upcoming events (next 8h)
    const allEvents = await fetchUpcomingEvents(1); // fetch 1 day, filter below
    const cutoffMs = Date.now() + LOOK_AHEAD_MS;
    const upcomingEvents = allEvents
      .filter((e) => {
        if (!e.start) return false;
        const startMs = new Date(e.start).getTime();
        return startMs > Date.now() && startMs <= cutoffMs;
      })
      .slice(0, MAX_EVENTS);

    if (upcomingEvents.length === 0) {
      await finishRun(runId, { itemsProcessed: 0, actionsQueued: 0 });
      return Response.json({ ok: true, message: "No appointments in next 8h", eventsFound: 0 });
    }

    // Load all leads for name matching
    const leads = await prisma.lead.findMany({
      where: { stage: { notIn: ["closed_won", "closed_lost"] } },
      select: { id: true, name: true, address: true, firstName: true, lastName: true },
    });

    let tasksCreated = 0;
    const cmaResults: Array<{ leadName: string; address: string; summary: string }> = [];
    const errors: unknown[] = [];

    for (const event of upcomingEvents) {
      const eventText = `${event.title ?? ""} ${event.description ?? ""}`.toLowerCase();

      // Match lead by name appearing in event text
      const matchedLead = leads.find((lead) => {
        const fullName = lead.name.toLowerCase();
        const firstName = (lead.firstName ?? "").toLowerCase();
        const lastName = (lead.lastName ?? "").toLowerCase();
        return (
          (fullName && eventText.includes(fullName)) ||
          (firstName && firstName.length > 2 && eventText.includes(firstName)) ||
          (lastName && lastName.length > 2 && eventText.includes(lastName))
        );
      });

      if (!matchedLead) continue;
      if (!matchedLead.address) continue;

      // Build CMA summary for the matched lead's address
      let cmaSummary = "";
      try {
        const cma = await buildCMASummary(matchedLead.address, "Baton Rouge", "LA");
        cmaSummary = cma.summary;
        cmaResults.push({ leadName: matchedLead.name, address: matchedLead.address, summary: cmaSummary });
      } catch (err) {
        errors.push({ step: "cma", leadId: matchedLead.id, error: String(err) });
        cmaSummary = "CMA unavailable — check Rentcast API key";
      }

      // Create Task for the appointment
      const eventStart = event.start ? new Date(event.start) : new Date();
      await prisma.task.create({
        data: {
          leadId: matchedLead.id,
          title: `Pre-appt CMA: ${matchedLead.name}`,
          description: `Appointment: ${event.title}\n${event.location ? `Location: ${event.location}\n` : ""}Address: ${matchedLead.address}\n\n${cmaSummary}`,
          dueDate: eventStart,
          priority: "high",
        },
      });
      tasksCreated++;
    }

    // Update DailyBrief marketMovement with CMA entries
    if (cmaResults.length > 0) {
      const existingBrief = await prisma.dailyBrief.findUnique({ where: { date: today } });
      const existingMovement = (existingBrief?.marketMovement as object[]) ?? [];
      const newEntries = cmaResults.map((r) => ({
        type: "pre_appt_cma",
        leadName: r.leadName,
        address: r.address,
        summary: r.summary,
        generatedAt: new Date().toISOString(),
      }));

      const updatedMovement = [...existingMovement, ...newEntries] as object[];

      await prisma.dailyBrief.upsert({
        where: { date: today },
        create: {
          date: today,
          marketMovement: updatedMovement,
        },
        update: {
          marketMovement: updatedMovement,
        },
      });
    }

    // Summary notification
    if (tasksCreated > 0) {
      await prisma.notification.create({
        data: {
          type: "task_due",
          title: `Pre-appt CMA ready for ${tasksCreated} appointment${tasksCreated !== 1 ? "s" : ""}`,
          body: cmaResults.map((r) => `${r.leadName}: ${r.address}`).join(" · "),
          href: "/pipeline",
        },
      });
    }

    await finishRun(runId, { itemsProcessed: upcomingEvents.length, actionsQueued: tasksCreated, errorLog: errors });

    return Response.json({
      ok: true,
      eventsFound: upcomingEvents.length,
      matched: tasksCreated,
      cmaResults: cmaResults.length,
    });
  } catch (err) {
    await failRun(runId, err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
