export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { rebuildMemoryIndex } from "@/lib/memory-indexer";
import { verifyCronSecret } from "@/lib/cron-auth";

/**
 * POST /api/search/index/rebuild
 * Requires Bearer CRON_SECRET.
 * Full rebuild — upserts all leads, contact logs, and assistant chat messages
 * into the MemoryIndex table. Safe to run repeatedly (idempotent).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const counts = await rebuildMemoryIndex();
    return NextResponse.json({ ok: true, counts });
  } catch (err) {
    console.error("[search/index/rebuild]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
