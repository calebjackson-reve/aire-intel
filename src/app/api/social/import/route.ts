export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  parseInstagramPostLibrary,
  parseInstagramReels,
  parseAudienceInsights,
  parseContentInteractions,
  parseProfilesReached,
  buildImportedPosts,
  buildSeedAudienceSnapshot,
} from "@/lib/social-import";
import AdmZip from "adm-zip";

// GET /api/social/import — list import history
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const exportId = url.searchParams.get("exportId");

  if (exportId) {
    const exp = await prisma.socialExport.findUnique({
      where: { id: exportId },
      include: { snapshots: true, _count: { select: { posts: true } } },
    });
    if (!exp) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(exp);
  }

  const exports = await prisma.socialExport.findMany({
    orderBy: { importedAt: "desc" },
    take: 20,
    include: { _count: { select: { posts: true } } },
  });
  return NextResponse.json(exports);
}

// POST /api/social/import — accept zip file upload and parse it
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    // JSON body path: pre-parsed data (e.g. from CLI import)
    if (contentType.includes("application/json")) {
      const body = await request.json();
      return handleJsonImport(body);
    }

    // Multipart path: zip file upload
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Expected multipart/form-data with a zip file" }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const platform = (formData.get("platform") as string) || detectPlatform(file.name);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return await processZip(buffer, platform, file.name);
  } catch (err) {
    console.error("[social/import] Error:", err);
    return NextResponse.json({ error: "Import failed", detail: String(err) }, { status: 500 });
  }
}

function detectPlatform(filename: string): string {
  if (filename.toLowerCase().includes("instagram")) return "instagram";
  if (filename.toLowerCase().includes("facebook")) return "facebook";
  return "instagram";
}

async function processZip(buffer: Buffer, platform: string, filename: string) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  // Index all files by their path (lowercase for case-insensitive matching)
  const fileMap = new Map<string, () => string>();
  for (const entry of entries) {
    if (!entry.isDirectory) {
      const key = entry.entryName.toLowerCase();
      fileMap.set(key, () => entry.getData().toString("utf-8"));
    }
  }

  const getFile = (pathFragment: string): string | null => {
    for (const [key, reader] of fileMap) {
      if (key.includes(pathFragment.toLowerCase())) {
        return reader();
      }
    }
    return null;
  };

  // Parse Instagram export files
  let postsHtml: string | null = null;
  let reelsHtml: string | null = null;
  let audienceHtml: string | null = null;
  let interactionsHtml: string | null = null;
  let reachedHtml: string | null = null;

  if (platform === "instagram") {
    postsHtml = getFile("posts_1.html");
    reelsHtml = getFile("reels.html");
    audienceHtml = getFile("audience_insights.html");
    interactionsHtml = getFile("content_interactions.html");
    reachedHtml = getFile("profiles_reached.html");
  } else {
    // Facebook: use your_posts HTML if available
    postsHtml = getFile("your_posts_1.html") || getFile("your_posts.html");
  }

  // Build post entries from library files
  const libraryPosts = postsHtml ? parseInstagramPostLibrary(postsHtml) : [];
  const libraryReels = reelsHtml ? parseInstagramReels(reelsHtml) : [];

  const importedPostInputs = buildImportedPosts(libraryPosts, libraryReels, platform);

  // Build audience snapshot, then merge in the interaction + reach insight files.
  const audienceSnapshot = audienceHtml
    ? parseAudienceInsights(audienceHtml)
    : buildSeedAudienceSnapshot();

  const interactions = interactionsHtml ? parseContentInteractions(interactionsHtml) : {};
  const reached = reachedHtml ? parseProfilesReached(reachedHtml) : {};

  // Merge: content interactions → snapshot
  if (interactions.totalInteractions !== undefined) audienceSnapshot.totalInteractions = interactions.totalInteractions;
  if (interactions.interactionDelta !== undefined) audienceSnapshot.interactionDelta = interactions.interactionDelta;
  if (interactions.postInteractions !== undefined) audienceSnapshot.postInteractions = interactions.postInteractions;
  if (interactions.reelsInteractions !== undefined) audienceSnapshot.reelsInteractions = interactions.reelsInteractions;
  if (interactions.storyInteractions !== undefined) audienceSnapshot.storyInteractions = interactions.storyInteractions;

  // Merge: profiles reached → snapshot
  if (reached.accountsReached !== undefined) audienceSnapshot.accountsReached = reached.accountsReached;
  if (reached.reachDelta !== undefined) audienceSnapshot.reachDelta = reached.reachDelta;
  if (reached.nonFollowerPct !== undefined) audienceSnapshot.nonFollowerPct = reached.nonFollowerPct;

  const insightFileCount = [audienceHtml, interactionsHtml, reachedHtml].filter(Boolean).length;

  // Create DB records
  const exportedAt = extractExportDate(filename) ?? new Date();

  const socialExport = await prisma.socialExport.create({
    data: {
      platform,
      exportedAt,
      status: "processing",
      postCount: importedPostInputs.filter(p => !p.isReel).length,
      reelCount: importedPostInputs.filter(p => p.isReel).length,
      insightCount: insightFileCount,
    },
  });

  // Upsert posts (skip duplicates)
  let savedCount = 0;
  for (const post of importedPostInputs) {
    try {
      await prisma.importedPost.upsert({
        where: {
          platform_publishedAt_caption: {
            platform: post.platform,
            publishedAt: post.publishedAt,
            caption: post.caption || "",
          },
        },
        create: {
          exportId: socialExport.id,
          platform: post.platform,
          caption: post.caption,
          publishedAt: post.publishedAt,
          postType: post.postType,
          isReel: post.isReel ?? false,
          imageCount: post.imageCount ?? 1,
          hashtags: post.hashtags as never,
          hashtagCount: post.hashtagCount ?? 0,
          hasLocation: post.hasLocation ?? false,
          hookStyle: post.hookStyle,
          captionLength: post.captionLength,
          ctaType: post.ctaType,
        },
        update: {
          postType: post.postType,
          hookStyle: post.hookStyle,
          captionLength: post.captionLength,
        },
      });
      savedCount++;
    } catch {
      // Unique constraint violation — already imported, skip
    }
  }

  // Create audience snapshot
  const snap = audienceSnapshot;
  await prisma.audienceSnapshot.create({
    data: {
      exportId: socialExport.id,
      snapshotDate: snap.snapshotDate,
      platform: snap.platform,
      totalFollowers: snap.totalFollowers,
      followerDelta: snap.followerDelta,
      accountsReached: snap.accountsReached,
      reachDelta: snap.reachDelta,
      nonFollowerPct: snap.nonFollowerPct,
      totalInteractions: snap.totalInteractions,
      interactionDelta: snap.interactionDelta,
      reelsInteractions: snap.reelsInteractions,
      postInteractions: snap.postInteractions,
      peakDay: snap.peakDay,
      topCities: (snap.topCities as never) ?? undefined,
      ageBreakdown: (snap.ageBreakdown as never) ?? undefined,
      genderBreakdown: (snap.genderBreakdown as never) ?? undefined,
    },
  });

  // Mark complete
  await prisma.socialExport.update({
    where: { id: socialExport.id },
    data: {
      status: "complete",
      postCount: importedPostInputs.filter(p => !p.isReel).length,
      reelCount: importedPostInputs.filter(p => p.isReel).length,
    },
  });

  return NextResponse.json({
    exportId: socialExport.id,
    platform,
    postCount: importedPostInputs.filter(p => !p.isReel).length,
    reelCount: importedPostInputs.filter(p => p.isReel).length,
    savedCount,
    audienceSnapshot: {
      followers: audienceSnapshot.totalFollowers,
      reached: audienceSnapshot.accountsReached,
      peakDay: audienceSnapshot.peakDay,
    },
    interactions,
  });
}

async function handleJsonImport(body: {
  platform: string;
  posts?: { caption?: string; publishedAt: string; isReel?: boolean }[];
  audienceSnapshot?: Record<string, unknown>;
}) {
  const { platform = "instagram", posts = [], audienceSnapshot } = body;

  const socialExport = await prisma.socialExport.create({
    data: {
      platform,
      exportedAt: new Date(),
      status: "complete",
      postCount: posts.filter(p => !p.isReel).length,
      reelCount: posts.filter(p => p.isReel).length,
    },
  });

  for (const post of posts) {
    const publishedAt = new Date(post.publishedAt);
    if (isNaN(publishedAt.getTime())) continue;

    await prisma.importedPost.upsert({
      where: {
        platform_publishedAt_caption: {
          platform,
          publishedAt,
          caption: post.caption || "",
        },
      },
      create: { exportId: socialExport.id, platform, caption: post.caption, publishedAt, isReel: post.isReel ?? false },
      update: {},
    });
  }

  if (audienceSnapshot) {
    await prisma.audienceSnapshot.create({
      data: {
        exportId: socialExport.id,
        snapshotDate: new Date(),
        platform,
        ...(audienceSnapshot as Record<string, unknown>),
      } as never,
    });
  }

  return NextResponse.json({ exportId: socialExport.id, postCount: posts.length });
}

function extractExportDate(filename: string): Date | null {
  const m = filename.match(/(\d{4}-\d{2}-\d{2})/);
  if (m) {
    const d = new Date(m[1]);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
