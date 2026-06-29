export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor");
  const limit = 20;

  const rows = await prisma.videoRecipe.findMany({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json({
    items: items.map((r) => ({
      id: r.id,
      url: r.url,
      sourceType: r.sourceType,
      thumbnailUrl: r.thumbnailUrl,
      notes: r.notes,
      hookPatterns: r.hookPatterns,
      approvalRate: r.approvalRate,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? items[items.length - 1]?.id : null,
  });
}
