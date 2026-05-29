import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  fetchLoftyNotes,
  fetchLoftyTasks,
  getLoftyAccessToken,
  getLoftyCredentials,
  mapLoftyNoteToContactLog,
  mapLoftyTaskToAire,
} from "@/lib/lofty";

/**
 * Pull fresh notes + tasks from Lofty for ONE lead.
 *
 * Routes the request through Lofty using AIRE's `loftyId` foreign key.
 * Idempotent — dedupes by injecting a stable marker into each imported row
 * (`[Lofty#<id>]` prefix in note, exact-match title for tasks).
 *
 * Returns counts so the UI can show "+3 notes / +1 task" toast.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
  const { id: aireLeadId } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id: aireLeadId },
    select: { id: true, loftyId: true, name: true },
  });
  if (!lead) return Response.json({ error: "Lead not found" }, { status: 404 });
  if (!lead.loftyId) {
    return Response.json({ error: "Lead has no loftyId — can't deep-sync" }, { status: 400 });
  }

  const creds = getLoftyCredentials();
  if (!creds) {
    return Response.json({ error: "Lofty credentials missing in .env" }, { status: 400 });
  }

  let token: string;
  try {
    token = await getLoftyAccessToken(creds);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 });
  }

  // ── Notes ────────────────────────────────────────────────────────────────
  const notes = await fetchLoftyNotes(token, lead.loftyId).catch(() => []);
  let notesAdded = 0;
  for (const n of notes) {
    const marker = `[Lofty#${n.noteId}]`;
    const text = `${marker} ${n.content}`;

    // Dedupe by marker — if any ContactLog for this lead already contains the marker, skip.
    const existing = await prisma.contactLog.findFirst({
      where: { leadId: lead.id, note: { contains: marker } },
      select: { id: true },
    });
    if (existing) continue;

    const row = mapLoftyNoteToContactLog(n, lead.id);
    await prisma.contactLog.create({
      data: { ...row, note: text },
    });
    notesAdded++;
  }

  // ── Tasks ────────────────────────────────────────────────────────────────
  const tasks = await fetchLoftyTasks(token, lead.loftyId).catch(() => []);
  let tasksAdded = 0, tasksUpdated = 0;
  for (const t of tasks) {
    const marker = `[Lofty#${t.id}]`;
    const titleWithMarker = `${marker} ${t.content || t.type}`;

    const existing = await prisma.task.findFirst({
      where: { leadId: lead.id, title: { contains: marker } },
      select: { id: true, done: true },
    });

    const mapped = mapLoftyTaskToAire(t, lead.id);

    if (existing) {
      // Only update done-state — title/description stays as user may have edited.
      if (existing.done !== mapped.done) {
        await prisma.task.update({
          where: { id: existing.id },
          data: { done: mapped.done, doneAt: mapped.doneAt },
        });
        tasksUpdated++;
      }
    } else {
      await prisma.task.create({
        data: { ...mapped, title: titleWithMarker },
      });
      tasksAdded++;
    }
  }

  // Touch lastContactDate if any new notes arrived — keeps cold-lead detection accurate.
  if (notesAdded > 0) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { lastContactDate: new Date() },
    });
  }

  return Response.json({
    ok: true,
    leadId: lead.id,
    loftyId: lead.loftyId,
    notesAdded,
    tasksAdded,
    tasksUpdated,
    totalNotesInLofty: notes.length,
    totalTasksInLofty: tasks.length,
  });
  } catch (err) {
    console.error("[sync-lead] failed:", err);
    return Response.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 5).join("\n") : undefined,
    }, { status: 500 });
  }
}
