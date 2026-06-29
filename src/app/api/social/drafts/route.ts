export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMetaConfig } from "@/lib/settings";

export async function GET() {
  const drafts = await prisma.scheduledPost.findMany({
    where: { status: "draft" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return Response.json(drafts);
}

export async function PATCH(req: NextRequest) {
  const { id, action, caption, feedbackNote, qualityScore, imageUrl, status } = await req.json() as {
    id: string;
    action: "approve" | "reject" | "edit" | "metadata";
    caption?: string;
    feedbackNote?: string;
    qualityScore?: number;
    imageUrl?: string;
    status?: string;
  };

  if (!id || !action) return Response.json({ error: "id and action required" }, { status: 400 });

  if (action === "metadata") {
    await prisma.scheduledPost.update({
      where: { id },
      data: {
        ...(feedbackNote !== undefined && { feedbackNote }),
        ...(qualityScore !== undefined && { qualityScore }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(status !== undefined && { status }),
      },
    });
    return Response.json({ ok: true });
  }

  if (action === "reject") {
    await prisma.scheduledPost.update({ where: { id }, data: { status: "rejected", userFeedback: "rejected" } });
    return Response.json({ ok: true });
  }

  if (action === "edit") {
    if (!caption) return Response.json({ error: "caption required for edit" }, { status: 400 });
    await prisma.scheduledPost.update({ where: { id }, data: { caption } });
    return Response.json({ ok: true });
  }

  // approve → publish/schedule via Meta
  const post = await prisma.scheduledPost.findUnique({ where: { id } });
  if (!post) return Response.json({ error: "Post not found" }, { status: 404 });

  // Read token directly from DB to bypass in-memory settings cache
  const tokenRow = await prisma.setting.findUnique({ where: { key: "META_PAGE_ACCESS_TOKEN" } });
  const pageIdRow = await prisma.setting.findUnique({ where: { key: "META_PAGE_ID" } });
  const token = tokenRow?.value ?? process.env.META_PAGE_ACCESS_TOKEN;
  const pageId = pageIdRow?.value ?? process.env.META_PAGE_ID;

  if (!token || !pageId) {
    await prisma.scheduledPost.update({ where: { id }, data: { status: "scheduled", userFeedback: "approved" } });
    return Response.json({ ok: true, note: "Saved as scheduled — connect Meta to auto-publish" });
  }

  try {
    let photoId: string | null = null;

    // Step 1: Upload photo to Facebook if there's an image
    if (post.imageUrl) {
      const absoluteUrl = post.imageUrl.startsWith("/")
        ? `https://aire-intel.vercel.app${post.imageUrl}`
        : post.imageUrl;
      const photoRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: absoluteUrl,
          published: false,
          access_token: token,
        }),
      });
      const photoData = await photoRes.json() as { id?: string; error?: { message?: string; code?: number } };
      if (photoData.error) return Response.json({ error: `Photo upload failed: ${photoData.error.message}`, fbError: photoData.error }, { status: 400 });
      if (photoData.id) photoId = photoData.id;
    }

    // Step 2: Create the post — scheduled if time is set, draft if not
    const ts = post.scheduledFor ? Math.floor(new Date(post.scheduledFor).getTime() / 1000) : null;
    const nowTs = Math.floor(Date.now() / 1000);
    const futureTs = ts && ts > nowTs + 600 ? ts : null;

    const payload: Record<string, unknown> = {
      message: post.caption,
      published: false,
      access_token: token,
    };
    if (futureTs) payload.scheduled_publish_time = futureTs;
    if (photoId) payload.attached_media = [{ media_fbid: photoId }];

    const feedRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const feedData = await feedRes.json() as { id?: string; error?: { message?: string; code?: number } };

    if (feedData.error) return Response.json({ error: `Feed post failed: ${feedData.error.message}`, fbError: feedData.error }, { status: 400 });

    await prisma.scheduledPost.update({
      where: { id },
      data: {
        status: futureTs ? "scheduled" : "approved",
        userFeedback: "approved",
        postId: feedData.id ?? null,
      },
    });

    return Response.json({ ok: true, fbPostId: feedData.id, isFbDraft: !futureTs });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
