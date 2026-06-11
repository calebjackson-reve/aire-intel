export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMetaConfig } from "@/lib/settings";
import { publishToFacebook, publishToInstagram } from "@/lib/meta"; // AIRE: loop:audit-debt-burndown

// ─── Meta Graph API integration ───────────────────────────────────────────────
// Credentials are read per-request from the Settings DB (via getMetaConfig),
// which falls back to process.env if not set in DB.
// Enter META_PAGE_ACCESS_TOKEN, META_PAGE_ID, META_IG_BUSINESS_ID in /settings.

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  // Return connection status
  if (action === "status") {
    const config = await getMetaConfig();
    return Response.json({
      facebook: {
        connected: !!(config?.token && config?.pageId),
        pageId: config?.pageId ?? null,
      },
      instagram: {
        connected: !!(config?.token && config?.igId),
        igId: config?.igId ?? null,
      },
    });
  }

  // List scheduled/draft posts
  const posts = await prisma.scheduledPost.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return Response.json(posts);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  // Publish immediately
  if (action === "publish") {
    const { caption, imageUrl, platform } = body;

    const config = await getMetaConfig();
    if (!config?.token || !config?.pageId) {
      return Response.json({
        ok: false,
        error: "Meta not connected. Add credentials in Settings → Meta section.",
      }, { status: 400 });
    }

    const results: Record<string, unknown> = {};

    if (platform === "facebook" || platform === "both") {
      try {
        results.facebook = await publishToFacebook(caption, imageUrl);
      } catch (e) {
        results.facebook = { error: String(e) };
      }
    }

    if ((platform === "instagram" || platform === "both") && imageUrl && config.igId) {
      try {
        results.instagram = await publishToInstagram(caption, imageUrl);
      } catch (e) {
        results.instagram = { error: String(e) };
      }
    }

    // Save record
    await prisma.scheduledPost.create({
      data: {
        platform, caption, imageUrl: imageUrl || null,
        publishedAt: new Date(),
        status: "published",
        postId: JSON.stringify(results),
      },
    });

    return Response.json({ ok: true, results });
  }

  // Save draft / schedule
  const { caption, imageUrl, platform, scheduledFor } = body;
  const post = await prisma.scheduledPost.create({
    data: {
      platform: platform ?? "both",
      caption,
      imageUrl: imageUrl || null,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      status: scheduledFor ? "scheduled" : "draft",
    },
  });
  return Response.json(post, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  await prisma.scheduledPost.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
