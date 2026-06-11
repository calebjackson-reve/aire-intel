export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDotloopConfig, fetchProfiles } from "@/lib/dotloop";

/**
 * GET /api/dotloop
 *
 * Returns the cached Loops table (fast, no Dotloop API hit).
 * Query params:
 *   - sync=1 to also kick a background sync after returning current state
 *   - status=under_contract,sold filter
 *
 * If the Dotloop config isn't set, returns { connected: false, loops: [] }.
 * If the config is set but the API call fails, returns the cached loops with
 * an `error` field so the UI still has something to show.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status")?.split(",").filter(Boolean);

  const config = await getDotloopConfig();
  const connected = !!config;

  const loops = await prisma.dotloopLoop.findMany({
    where: statusFilter ? { status: { in: statusFilter } } : undefined,
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { lead: { select: { id: true, name: true, stage: true } } },
  });

  // Probe connection health (cheap) when connected — surface a clear "broken"
  // signal if the token went sour without making us hit the Loops endpoint.
  let probe: { ok: boolean; error?: string } | undefined;
  if (connected) {
    try {
      await fetchProfiles(config!.accessToken);
      probe = { ok: true };
    } catch (err) {
      probe = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return Response.json({
    connected,
    probe,
    count: loops.length,
    loops,
  });
}

/**
 * POST /api/dotloop  (action="sync")
 *
 * Full sync: pulls all loops from Dotloop, upserts into local DotloopLoop
 * table, auto-matches each to an AIRE Lead. Returns summary counts.
 */
export async function POST(req: NextRequest) {
  const { action } = await req.json().catch(() => ({}));
  if (action !== "sync") {
    return Response.json({ error: "Only action=sync supported here. Use /api/dotloop/sync for streaming sync." }, { status: 400 });
  }

  // Reuse the /sync route's POST handler by importing it. Simpler: just
  // redirect callers to /api/dotloop/sync.
  return Response.json({ error: "Use POST /api/dotloop/sync for full sync (streaming)." }, { status: 308 });
}
