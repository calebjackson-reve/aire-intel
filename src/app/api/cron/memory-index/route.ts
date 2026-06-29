export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { incrementalMemoryIndex } from "@/lib/memory-indexer";
import { verifyCronSecret } from "@/lib/cron-auth";

/**
 * POST /api/cron/memory-index
 * Triggered by Vercel cron every 15 minutes.
 * Incrementally indexes new/updated leads, contact logs, and chat messages
 * since the last indexedAt timestamp.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await incrementalMemoryIndex();
    return NextResponse.json({ ok: true, ts: new Date().toISOString() });
  } catch (err) {
    console.error("[cron/memory-index]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
