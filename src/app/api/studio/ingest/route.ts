export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-memory";
import { storeAsset } from "@/lib/render/storage";
import { downloadVideoUrl, extractThumbnail, analyzeVideoFile, extractHookPatterns, appendToGrammar } from "@/lib/studio/ingest";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      url?: string;
      caption?: string;
      comments?: string;
      notes?: string;
    };

    const { url, caption, comments, notes } = body;
    if (!url && !caption) {
      return NextResponse.json({ error: "url or caption required" }, { status: 400 });
    }

    let localPath: string | null = null;
    let cleanup: (() => Promise<void>) | null = null;
    let recipe: Record<string, unknown> | null = null;
    let thumbnailUrl: string | null = null;

    // Download + analyze video if URL provided
    if (url) {
      const dl = await downloadVideoUrl(url);
      localPath = dl.localPath;
      cleanup = dl.cleanup;

      // Run Python teardown analyzer
      recipe = await analyzeVideoFile(localPath).catch(() => null);

      // Extract thumbnail
      const thumbBuf = await extractThumbnail(localPath);
      if (thumbBuf) {
        const stored = await storeAsset("thumb.jpg", thumbBuf, "image/jpeg").catch(() => null);
        if (stored) thumbnailUrl = stored.url;
      }

      await cleanup?.();
    }

    // Extract hook patterns if caption provided
    const hookPatterns = (caption || notes)
      ? await extractHookPatterns(caption ?? notes ?? "", comments ?? "").catch(() => [])
      : [];

    // Append to local grammar file
    if (hookPatterns.length) {
      await appendToGrammar(hookPatterns).catch(() => {});
    }

    const sourceType = url
      ? (url.includes("instagram.com") ? "instagram" : url.includes("tiktok.com") ? "tiktok" : "upload")
      : "study";

    const row = await prisma.videoRecipe.create({
      data: {
        url: url ?? null,
        sourceType,
        recipe: JSON.parse(JSON.stringify(recipe ?? { editKnobs: {}, synthetic: true })),
        thumbnailUrl,
        hookPatterns: hookPatterns.length ? JSON.parse(JSON.stringify(hookPatterns)) : undefined,
        notes: notes ?? null,
      },
    });

    return NextResponse.json({ recipeId: row.id, thumbnailUrl, hookPatterns, recipe });

  } catch (err) {
    await logError("api_failure", "studio/ingest", err as Error);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
