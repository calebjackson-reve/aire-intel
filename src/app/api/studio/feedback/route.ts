export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-memory";
import { recordReelOutcome, PT, type ReelFingerprint, type ReelDecision } from "@/lib/reel/learning";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { renderJobId, decision, note } = await req.json() as {
      renderJobId: string;
      decision: ReelDecision;
      note?: string;
    };

    if (!renderJobId || !decision) {
      return NextResponse.json({ error: "renderJobId and decision required" }, { status: 400 });
    }

    // Load RenderJob → ContentProject.motionSpec → fingerprint
    const job = await prisma.renderJob.findUnique({
      where: { id: renderJobId },
      include: { contentProject: true },
    });

    if (!job) return NextResponse.json({ error: "RenderJob not found" }, { status: 404 });

    let flywheelUpdated = false;
    const motionSpec = job.contentProject?.motionSpec;
    if (motionSpec) {
      try {
        const meta = JSON.parse(motionSpec) as { fingerprint?: ReelFingerprint };
        if (meta.fingerprint) {
          await recordReelOutcome(meta.fingerprint, decision);
          flywheelUpdated = true;
        }
      } catch { /* non-fatal */ }
    }

    // If an edit note was provided, classify it and bump the relevant preference
    if (note && decision === "edited") {
      const msg = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: `Classify a reel feedback note into a ContentPreference patternType + value pair.
Output ONLY valid JSON: { "patternType": string, "value": string }
patternType must be one of: reel_pacing, reel_grade, reel_transition, reel_hook, reel_music
Examples: "too fast" → { "patternType": "reel_pacing", "value": "fast" } with rejection
"loved the moody grade" → { "patternType": "reel_grade", "value": "contrast" } with approval`,
        messages: [{ role: "user", content: `Feedback: "${note}"` }],
      }).catch(() => null);

      if (msg) {
        const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";
        const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim()) as { patternType?: string; value?: string };
        if (parsed.patternType && parsed.value && (Object.values(PT) as string[]).includes(parsed.patternType)) {
          const approved = note.match(/love|great|perfect|keep|more|yes/i) ? 1 : 0;
          const rejected = approved ? 0 : 1;
          const existing = await prisma.contentPreference.findUnique({
            where: { patternType_value: { patternType: parsed.patternType, value: parsed.value } },
          });
          const newApprovals = (existing?.approvals ?? 0) + approved;
          const newRejections = (existing?.rejections ?? 0) + rejected;
          const total = newApprovals + newRejections;
          await prisma.contentPreference.upsert({
            where: { patternType_value: { patternType: parsed.patternType, value: parsed.value } },
            create: { patternType: parsed.patternType, value: parsed.value, approvals: newApprovals, rejections: newRejections, approvalRate: total ? newApprovals / total : 0 },
            update: { approvals: newApprovals, rejections: newRejections, approvalRate: total ? newApprovals / total : 0, lastSeen: new Date() },
          });
        }
      }
    }

    // Update ContentProject status
    if (job.contentProjectId) {
      await prisma.contentProject.update({
        where: { id: job.contentProjectId },
        data: { status: decision === "approved" ? "ready" : "drafting" },
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, flywheelUpdated });

  } catch (err) {
    await logError("api_failure", "studio/feedback", err as Error);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
