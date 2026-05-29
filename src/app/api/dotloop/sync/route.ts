import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  fetchAllLoops,
  fetchLoopFolders,
  fetchLoopParticipants,
  getDotloopConfig,
  matchLoopToLead,
  summarizeDocs,
} from "@/lib/dotloop";
import { logError } from "@/lib/error-memory";

/**
 * POST /api/dotloop/sync
 *
 * Full sync of Dotloop loops into the local DotloopLoop table.
 *
 * Streaming response (newline-delimited JSON) so the UI can show progress.
 * For each loop:
 *   1. Upsert the local DotloopLoop row by dotloopId
 *   2. Fetch participants → attempt match to an AIRE Lead → link
 *   3. Fetch document folders → count signed/pending → cache on the row
 *
 * Idempotent. Re-running just updates statuses.
 */
export async function POST(_req: NextRequest) {
  const config = await getDotloopConfig();
  if (!config) {
    return Response.json(
      { error: "Dotloop not configured. Add DOTLOOP_ACCESS_TOKEN and DOTLOOP_PROFILE_ID in /settings." },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));

      try {
        send({ status: "fetching", message: "Connecting to Dotloop…" });
        const loops = await fetchAllLoops(config);
        send({ status: "fetching", message: `Found ${loops.length} loops. Syncing…`, total: loops.length });

        let created = 0, updated = 0, matched = 0, failed = 0;

        for (const loop of loops) {
          try {
            // ── 1. Upsert the local row with core loop data ─────────────
            const baseData = {
              dotloopId: String(loop.id),
              name: loop.name,
              status: loop.status,
              loopType: loop.loopType ?? null,
              streetAddress: loop.streetAddress ?? (`${loop.streetNumber ?? ""} ${loop.streetName ?? ""}`.trim() || null),
              city: loop.city ?? null,
              state: loop.state ?? null,
              zipCode: loop.zipCode ?? null,
              acceptanceDate: loop.acceptanceDate ? new Date(loop.acceptanceDate) : null,
              closingDate: loop.closingDate ? new Date(loop.closingDate) : null,
              expectedClosingDate: loop.expectedClosingDate ? new Date(loop.expectedClosingDate) : null,
              contractDate: loop.contractDate ? new Date(loop.contractDate) : null,
              salePrice: loop.salePrice ?? null,
              commission: loop.commission ?? null,
              lastSyncedAt: new Date(),
            };

            const existing = await prisma.dotloopLoop.findUnique({ where: { dotloopId: String(loop.id) } });
            if (existing) {
              await prisma.dotloopLoop.update({ where: { dotloopId: String(loop.id) }, data: baseData });
              updated++;
            } else {
              await prisma.dotloopLoop.create({ data: baseData });
              created++;
            }

            // ── 2. Participants + auto-match to AIRE Lead ───────────────
            const participants = await fetchLoopParticipants(config, loop.id).catch(() => []);
            const leadId = await matchLoopToLead(participants);
            if (leadId) {
              await prisma.dotloopLoop.update({
                where: { dotloopId: String(loop.id) },
                data: { leadId },
              });
              matched++;
            }
            await prisma.dotloopLoop.update({
              where: { dotloopId: String(loop.id) },
              data: {
                participantsJson: JSON.stringify(
                  participants.map((p) => ({
                    name: p.fullName ?? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim(),
                    role: p.role,
                    email: p.email,
                    phone: p.phone,
                  })),
                ),
              },
            });

            // ── 3. Document folders → signed/pending counts ──────────────
            try {
              const folders = await fetchLoopFolders(config, loop.id);
              const docs = summarizeDocs(folders);
              await prisma.dotloopLoop.update({
                where: { dotloopId: String(loop.id) },
                data: { signedDocsCount: docs.signed, pendingDocsCount: docs.pending },
              });
            } catch {
              // Folder access requires extra scopes on some accounts; non-fatal
            }

            if ((created + updated) % 5 === 0) {
              send({ status: "fetching", message: `${created + updated}/${loops.length} synced…`, created, updated, matched });
            }
          } catch (err) {
            failed++;
            await logError("dotloop", "/api/dotloop/sync[per-loop]", err, { loopId: loop.id });
          }
        }

        send({ status: "done", created, updated, matched, failed, total: loops.length });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logError("dotloop", "/api/dotloop/sync", err);
        send({ status: "error", message: msg });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
