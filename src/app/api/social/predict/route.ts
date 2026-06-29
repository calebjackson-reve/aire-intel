export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { predictPostPerformance } from "@/lib/content-predictor";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { postType, isReel, caption, platform, scheduledFor, imageCount } = body;

    const prediction = await predictPostPerformance({
      postType,
      isReel: isReel ?? false,
      caption,
      platform: platform ?? "instagram",
      scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
      imageCount: imageCount ?? 1,
    });

    return NextResponse.json(prediction);
  } catch (err) {
    console.error("[social/predict]", err);
    return NextResponse.json({ error: "Prediction failed" }, { status: 500 });
  }
}
