import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getDotloopConfig,
  fetchLoopDetails,
  fetchLoopParticipants,
  fetchLoopActivity,
  fetchLoopFolders,
  matchLoopToLead,
  summarizeDocs,
} from "@/lib/dotloop";

/**
 * GET /api/dotloop/[loopId]
 *
 * Returns the local cached loop row + live participants, activity, and folders
 * (live fetches happen in parallel to keep latency reasonable).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ loopId: string }> },
) {
  const { loopId } = await params;

  const cached = await prisma.dotloopLoop.findUnique({
    where: { dotloopId: loopId },
    include: { lead: { select: { id: true, name: true, stage: true } } },
  });
  if (!cached) {
    return Response.json({ error: "Loop not synced. Run /api/dotloop/sync first." }, { status: 404 });
  }

  const config = await getDotloopConfig();
  if (!config) {
    // No live data available — return cached only
    return Response.json({ loop: cached, live: null });
  }

  // Parallel fetch live data; tolerate per-call failures
  const [details, participants, activity, folders] = await Promise.all([
    fetchLoopDetails(config, loopId).catch(() => null),
    fetchLoopParticipants(config, loopId).catch(() => []),
    fetchLoopActivity(config, loopId).catch(() => []),
    fetchLoopFolders(config, loopId).catch(() => []),
  ]);

  return Response.json({
    loop: cached,
    live: {
      details,
      participants,
      activity: activity.slice(0, 20),
      folders,
      docs: summarizeDocs(folders),
    },
  });
}

/**
 * PATCH /api/dotloop/[loopId]
 *
 * Link or unlink a loop to an AIRE Lead.
 * Body: { leadId: string | null } — null unlinks.
 *
 * Also re-runs auto-match if body is { autoMatch: true } so the UI can
 * "retry match" after editing the lead's contact info.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ loopId: string }> },
) {
  const { loopId } = await params;
  const body = await req.json() as { leadId?: string | null; autoMatch?: boolean };

  if (body.autoMatch) {
    const config = await getDotloopConfig();
    if (!config) return Response.json({ error: "Dotloop not configured" }, { status: 400 });

    const participants = await fetchLoopParticipants(config, loopId).catch(() => []);
    const matchedId = await matchLoopToLead(participants);
    const updated = await prisma.dotloopLoop.update({
      where: { dotloopId: loopId },
      data: { leadId: matchedId },
    });
    return Response.json({ loop: updated, matched: !!matchedId });
  }

  const updated = await prisma.dotloopLoop.update({
    where: { dotloopId: loopId },
    data: { leadId: body.leadId ?? null },
  });
  return Response.json({ loop: updated });
}
