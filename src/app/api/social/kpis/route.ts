export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Get latest audience snapshot
    const snapshot = await prisma.audienceSnapshot.findFirst({
      orderBy: { snapshotDate: "desc" },
      where: { platform: "instagram" },
    });

    // Get top imported post by engagement rate
    const topPost = await prisma.importedPost.findFirst({
      where: { engagementRate: { gt: 0 } },
      orderBy: { engagementRate: "desc" },
      select: { caption: true, engagementRate: true },
    });

    if (!snapshot) {
      return NextResponse.json({ hasData: false });
    }

    return NextResponse.json({
      hasData: true,
      followers: snapshot.totalFollowers ?? 0,
      accountsReached: snapshot.accountsReached ?? 0,
      reachDelta: snapshot.reachDelta ?? 0,
      nonFollowerPct: snapshot.nonFollowerPct ?? 0,
      totalInteractions: snapshot.totalInteractions ?? 0,
      interactionDelta: snapshot.interactionDelta ?? 0,
      peakDay: snapshot.peakDay ?? "Sunday",
      topPostCaption: topPost?.caption ?? null,
      topPostEngagementRate: topPost?.engagementRate ?? null,
      importedAt: snapshot.createdAt,
    });
  } catch (err) {
    console.error("[social/kpis]", err);
    return NextResponse.json({ hasData: false });
  }
}
