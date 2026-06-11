export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  fetchAllLoftyLeads,
  fetchLoftyNotes,
  fetchLoftyPage,
  fetchLoftyTasks,
  getLoftyAccessToken,
  getLoftyCredentials,
  LoftyCredentials,
  mapLoftyLeadToAire,
  mapLoftyNoteToContactLog,
  mapLoftyTaskToAire,
} from "@/lib/lofty";
import { logError, withRetry } from "@/lib/error-memory";

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Accept either full creds object or fall back to env
  const creds: LoftyCredentials | null = (body.clientId && body.clientSecret && body.customerKey)
    ? { clientId: body.clientId, clientSecret: body.clientSecret, customerKey: body.customerKey }
    : getLoftyCredentials();

  // Deep-sync: also pull notes + tasks for active leads (non-closed) after lead sync.
  // Default true since Caleb wants Lofty "fully integrated"; can disable with body.deepSync=false.
  const deepSync = body.deepSync !== false;

  if (!creds) {
    return Response.json({
      error: "Missing Lofty credentials. Set LOFTY_CLIENT_ID, LOFTY_CLIENT_SECRET, and LOFTY_CUSTOMER_KEY in your .env, or enter them in Settings."
    }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      function send(data: object) {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        } catch {
          isClosed = true;
        }
      }

      let syncErrorId: string | null = null;

      try {
        send({ status: "fetching", message: "Connecting to Lofty..." });

        // Retry with error memory — up to 3 attempts with exponential backoff
        const loftyLeads = await withRetry(
          () => fetchAllLoftyLeads(creds),
          {
            source: "/api/lofty/sync",
            type: "lofty",
            maxAttempts: 3,
            context: { action: "fetchAllLeads" },
            onRetry: (attempt, err) => {
              send({ status: "fetching", message: `Retrying Lofty connection (attempt ${attempt}/3)...` });
              console.warn(`[Lofty] Retry ${attempt}:`, err);
            },
          }
        );

        send({ status: "fetching", message: `Connected. Found ${loftyLeads.length} contacts. Syncing...` });

        let created = 0, updated = 0, skipped = 0;

        for (const ll of loftyLeads) {
          try {
            const data = mapLoftyLeadToAire(ll);
            if (!data.name || data.name === "Unknown") { skipped++; continue; }

            const existing = await prisma.lead.findUnique({ where: { loftyId: data.loftyId } });

            if (existing) {
              await prisma.lead.update({ where: { id: existing.id }, data });
              updated++;
            } else {
              await prisma.lead.create({ data });
              created++;
            }

            if ((created + updated) % 50 === 0 && created + updated > 0) {
              send({ status: "fetching", message: `${created + updated} synced so far...` });
            }
          } catch (err) {
            skipped++;
            // Log per-lead errors but don't stop the sync
            await logError("lofty", "/api/lofty/sync[per-lead]", err, {
              leadId: String(ll.leadId),
              firstName: ll.firstName,
            });
          }
        }

        // ── Deep sync: pull notes + tasks for active (non-closed) leads ───
        let deepNotes = 0, deepTasks = 0, deepLeads = 0;
        if (deepSync) {
          send({ status: "fetching", message: "Pulling notes + tasks for active leads…" });
          const token = await getLoftyAccessToken(creds);
          const active = await prisma.lead.findMany({
            where: {
              loftyId: { not: null },
              stage: { in: ["new_lead", "active", "showing", "under_contract"] },
            },
            select: { id: true, loftyId: true },
            take: 200, // safety cap so a runaway sync doesn't blow the API budget
          });

          for (const lead of active) {
            if (!lead.loftyId) continue;
            try {
              const [notes, tasks] = await Promise.all([
                fetchLoftyNotes(token, lead.loftyId).catch(() => []),
                fetchLoftyTasks(token, lead.loftyId).catch(() => []),
              ]);

              for (const n of notes) {
                const marker = `[Lofty#${n.noteId}]`;
                const existing = await prisma.contactLog.findFirst({
                  where: { leadId: lead.id, note: { contains: marker } },
                  select: { id: true },
                });
                if (existing) continue;
                const row = mapLoftyNoteToContactLog(n, lead.id);
                await prisma.contactLog.create({
                  data: { ...row, note: `${marker} ${n.content}` },
                });
                deepNotes++;
              }

              for (const t of tasks) {
                const marker = `[Lofty#${t.id}]`;
                const existing = await prisma.task.findFirst({
                  where: { leadId: lead.id, title: { contains: marker } },
                  select: { id: true, done: true },
                });
                const mapped = mapLoftyTaskToAire(t, lead.id);
                if (existing) {
                  if (existing.done !== mapped.done) {
                    await prisma.task.update({
                      where: { id: existing.id },
                      data: { done: mapped.done, doneAt: mapped.doneAt },
                    });
                  }
                } else {
                  await prisma.task.create({
                    data: { ...mapped, title: `${marker} ${t.content || t.type}` },
                  });
                  deepTasks++;
                }
              }
              deepLeads++;
              if (deepLeads % 10 === 0) {
                send({ status: "fetching", message: `Deep-synced ${deepLeads}/${active.length}: +${deepNotes} notes, +${deepTasks} tasks` });
              }
            } catch (err) {
              // Per-lead deep-sync errors are non-fatal
              await logError("lofty", "/api/lofty/sync[deep-sync per-lead]", err, {
                leadId: lead.id,
                loftyId: lead.loftyId,
              });
            }
          }
        }

        // Create success notification
        await prisma.notification.create({
          data: {
            type: "sync_complete",
            title: "Lofty sync complete",
            body: `${created} imported, ${updated} updated, ${skipped} skipped${deepSync ? ` · +${deepNotes} notes, +${deepTasks} tasks` : ""}`,
            href: "/contacts",
          },
        });

        send({
          status: "done",
          created, updated, skipped, total: loftyLeads.length,
          deepLeads, deepNotes, deepTasks,
          message: "Sync complete.",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        // Log the top-level sync failure
        syncErrorId = await logError("lofty", "/api/lofty/sync", err, {
          action: "fullSync",
          hadCreds: !!creds,
        });

        // Create error notification
        try {
          await prisma.notification.create({
            data: {
              type: "sync_complete",
              title: "Lofty sync failed",
              body: msg.slice(0, 120),
              href: "/system",
            },
          });
        } catch {}

        send({ status: "error", message: msg, errorId: syncErrorId });
      }

      isClosed = true;
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

export async function GET(request: NextRequest) {
  // Accept creds via headers for test-connection flow
  const clientId = request.headers.get("x-lofty-client-id") || process.env.LOFTY_CLIENT_ID || "";
  const clientSecret = request.headers.get("x-lofty-client-secret") || process.env.LOFTY_CLIENT_SECRET || "";
  const customerKey = request.headers.get("x-lofty-customer-key") || process.env.LOFTY_CUSTOMER_KEY || process.env.LOFTY_API_KEY || "";

  if (!clientId || !clientSecret || !customerKey) {
    return Response.json({
      ok: false,
      error: "Missing credentials. Provide LOFTY_CLIENT_ID, LOFTY_CLIENT_SECRET, and LOFTY_CUSTOMER_KEY.",
    }, { status: 400 });
  }

  let errorId: string | null = null;
  try {
    const creds = { clientId, clientSecret, customerKey };
    const page = await fetchLoftyPage(creds, 0, 1);
    return Response.json({
      ok: true,
      base: "api.lofty.com",
      total: page._metadata?.total ?? page.leads.length,
      sample: page.leads[0] ?? null,
    });
  } catch (err) {
    errorId = await logError("lofty", "/api/lofty/sync[test]", err, { action: "testConnection" });
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: msg, errorId }, { status: 401 });
  }
}
