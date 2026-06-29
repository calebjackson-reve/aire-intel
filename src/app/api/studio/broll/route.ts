export const dynamic = "force-dynamic";
export const maxDuration = 150;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError, withRetry } from "@/lib/error-memory";
import { storeAsset } from "@/lib/render/storage";
import { higgsfield } from "@/lib/render/providers/higgsfield";

const REVE_BROLL_SYSTEM = `You are generating an AI b-roll prompt for Caleb Jackson, REALTOR® at Rêve Realtors® Baton Rouge.
Brand aesthetic: morningside.studio tier — slow, cinematic, warm luxury. Southern Baton Rouge lifestyle.
Keep it hyper-specific, visual, and grounded. No generic stock footage energy.`;

export async function POST(req: NextRequest) {
  try {
    if (!higgsfield.configured()) {
      return NextResponse.json({ error: "Higgsfield not configured — set HIGGSFIELD_API_KEY" }, { status: 503 });
    }

    const { prompt, contentProjectId, style } = await req.json() as {
      prompt: string;
      contentProjectId?: string;
      style?: string;
    };

    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

    // Enrich prompt with brand context
    const enriched = `${REVE_BROLL_SYSTEM}\n\nGenerate b-roll for: ${prompt}. Style: ${style ?? "cinematic luxury, slow pan, golden hour"}. 9:16 vertical for Instagram Reel.`;

    const result = await withRetry(async () => {
      const { generationId } = await higgsfield.generate(enriched, { style: style ?? "cinematic", aspectRatio: "9:16" });

      // Poll up to 120s
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5000));
        const poll = await higgsfield.poll(generationId);
        if (poll.state === "done" && poll.url) return poll.url;
        if (poll.state === "failed") throw new Error("Higgsfield generation failed");
      }
      throw new Error("Higgsfield generation timed out");
    }, { source: "higgsfield-broll" });

    // Download + store
    const videoRes = await fetch(result as string);
    if (!videoRes.ok) throw new Error(`Failed to download AI b-roll: ${videoRes.status}`);
    const buf = Buffer.from(await videoRes.arrayBuffer());
    const stored = await storeAsset("ai-broll.mp4", buf, "video/mp4");

    // Persist as MediaAsset
    const asset = await prisma.mediaAsset.create({
      data: {
        contentProjectId: contentProjectId ?? null,
        kind: "ai_broll",
        url: stored.url,
        blobPathname: stored.pathname,
        mimeType: "video/mp4",
        bytes: stored.bytes,
      },
    });

    return NextResponse.json({ assetId: asset.id, url: asset.url, kind: "ai_broll" });

  } catch (err) {
    await logError("api_failure", "studio/broll", err as Error);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
