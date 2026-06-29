export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
  const platform = url.searchParams.get("platform") || undefined;
  const postType = url.searchParams.get("postType") || undefined;

  try {
    const posts = await prisma.importedPost.findMany({
      where: {
        ...(platform ? { platform } : {}),
        ...(postType ? { postType } : {}),
      },
      orderBy: [
        { engagementRate: { sort: "desc", nulls: "last" } },
        { publishedAt: "desc" },
      ],
      take: limit,
      select: {
        id: true,
        caption: true,
        publishedAt: true,
        postType: true,
        isReel: true,
        reach: true,
        impressions: true,
        likes: true,
        comments: true,
        shares: true,
        saves: true,
        engagementRate: true,
        hookStyle: true,
        hashtagCount: true,
        platform: true,
      },
    });
    return NextResponse.json(posts);
  } catch (err) {
    console.error("[social/posts]", err);
    return NextResponse.json([], { status: 500 });
  }
}
