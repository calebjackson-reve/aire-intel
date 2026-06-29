export const dynamic = "force-dynamic";

// Loop 25 — Google Calendar Sync
// Cron: 0 */2 * * * — Syncs Google Calendar events to Task records (every 2 hours).
// Uses title prefix "[GCal:{eventId}]" as the dedup key since Task has no externalId field.

import { verifyCronSecret, verifyCronOrInternal, cronUnauthorized } from "@/lib/cron-auth";
import { startRun, finishRun, failRun } from "@/lib/agent-run";
import { prisma } from "@/lib/prisma";
import { fetchUpcomingEvents } from "@/lib/google-calendar";

const GCAL_PREFIX = "[GCal:";
const SYNC_DAYS = 7;

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  return runCalendarSync();
}

export async function GET(request: Request) {
  if (!verifyCronOrInternal(request)) return cronUnauthorized();
  return runCalendarSync();
}

async function runCalendarSync() {
  const runId = await startRun("morning_brief");

  try {
    // Graceful Google check
    const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!googleSecret) {
      await prisma.notification.create({
        data: {
          type: "sync_complete",
          title: "Google Calendar not connected",
          body: "Calendar sync requires Google OAuth. Set up at /settings.",
          href: "/settings",
        },
      });
      await finishRun(runId, { itemsProcessed: 0, actionsQueued: 0 });
      return Response.json({ ok: true, skipped: "no_google" });
    }

    // Fetch events
    const events = await fetchUpcomingEvents(SYNC_DAYS);

    if (events.length === 0) {
      await finishRun(runId, { itemsProcessed: 0, actionsQueued: 0 });
      return Response.json({ ok: true, synced: 0, updated: 0, leadsMatched: 0 });
    }

    // Load all leads for email matching
    const leads = await prisma.lead.findMany({
      where: { email: { not: null } },
      select: { id: true, email: true },
    });
    const leadByEmail = new Map(leads.map((l) => [l.email?.toLowerCase() ?? "", l.id]));

    let synced = 0;
    let updated = 0;
    let leadsMatched = 0;

    for (const event of events) {
      const titlePrefix = `${GCAL_PREFIX}${event.id}]`;

      // Find existing task
      const existingTask = await prisma.task.findFirst({
        where: { title: { startsWith: titlePrefix } },
      });

      // Try to match a lead from event description (email lookup)
      let leadId: string | undefined;
      if (event.description) {
        const emailMatches = event.description.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
        for (const email of emailMatches) {
          const matched = leadByEmail.get(email.toLowerCase());
          if (matched) {
            leadId = matched;
            leadsMatched++;
            break;
          }
        }
      }

      const taskTitle = `${titlePrefix} ${event.title}`;
      const taskDescription = [
        `Source: google_calendar`,
        `Event ID: ${event.id}`,
        event.location ? `Location: ${event.location}` : null,
        event.description ? `Notes: ${event.description.slice(0, 500)}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const dueDate = event.start ? new Date(event.start) : undefined;

      if (existingTask) {
        // Update existing task
        await prisma.task.update({
          where: { id: existingTask.id },
          data: {
            title: taskTitle,
            description: taskDescription,
            dueDate,
            leadId: leadId ?? existingTask.leadId ?? undefined,
          },
        });
        updated++;
      } else {
        // Create new task
        await prisma.task.create({
          data: {
            title: taskTitle,
            description: taskDescription,
            dueDate,
            priority: "normal",
            leadId: leadId ?? undefined,
          },
        });
        synced++;
      }
    }

    // Notification if new events were synced
    if (synced > 0) {
      await prisma.notification.create({
        data: {
          type: "sync_complete",
          title: `Calendar synced — ${synced} new event${synced !== 1 ? "s" : ""}`,
          body: `${synced} new + ${updated} updated from Google Calendar. ${leadsMatched} lead${leadsMatched !== 1 ? "s" : ""} matched.`,
          href: "/pipeline",
        },
      });
    }

    await finishRun(runId, { itemsProcessed: events.length, actionsQueued: synced });

    return Response.json({ ok: true, synced, updated, leadsMatched });
  } catch (err) {
    await failRun(runId, err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
