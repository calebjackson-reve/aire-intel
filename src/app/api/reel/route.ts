export const dynamic = "force-dynamic";
export const maxDuration = 120;

// /reel command — raw footage + a torn-down reference reel → Caleb's branded reel.
//
// Flow (Karpathy 7-phase, abridged for a user-invoked command):
//   0 LOAD MEMORY  → resolveStyle reads the flywheel (ContentPreference)
//   1 INTAKE       → validate footage
//   2 GATE         → need a recipe OR a vibe
//   3 CONFIDENCE   → resolveStyle applies the leash; LOW/missing → escalations
//   4 ACT          → recipeToTimeline → render provider.submit
//   5 persist      → ContentProject(reel) + RenderJob(rendering) + source MediaAssets
//   6/7 later      → render-poll completes it → Approve Queue; approve → recordReelOutcome
//
// NOTE: open endpoint for now; Clerk middleware (Task 14) will gate it before deploy.

import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-memory";
import { getRenderProvider } from "@/lib/render/providers";
import { recipeToTimeline, timelineDuration, type ResolvedStyle } from "@/lib/reel/timeline";
import { resolveStyle, fingerprint } from "@/lib/reel/learning";
import { REVE_BRAND, type EditRecipe, type ReelInput } from "@/lib/reel/recipe";

/** Build a minimal even-paced recipe when Caleb gives a vibe but no torn-down reference. */
function synthesizeRecipe(footageCount: number, style: ResolvedStyle): EditRecipe {
  const n = Math.max(2, footageCount);
  const len = style.avgShotLen;
  const segments = Array.from({ length: n }, (_, i) => ({
    index: i,
    start: i * len,
    end: (i + 1) * len,
    durationFrames: 0,
  }));
  return {
    version: "synthetic-1",
    createdAt: new Date().toISOString(),
    source: { path: "", duration: n * len, fps: 30, width: 1080, height: 1920, aspect: "9:16" },
    segments,
    cuts: segments.map((s) => ({ atFrame: 0, atTime: s.start, type: "hard" as const, confidence: 1 })),
    rhythm: { tempoBPM: 0, beatGrid: [], cutsOnBeat: false, cutsOnBeatRatio: 0, avgShotLen: len },
    text: [],
    grade: { contrast: 0.1, saturation: 0, temperature: 0.05, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1] },
    motion: [],
    isEdited: { verdict: "raw", confidence: 1, signals: [] },
  };
}

export async function POST(request: Request) {
  let input: ReelInput;
  try {
    input = (await request.json()) as ReelInput;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Phase 1 — INTAKE
  if (!Array.isArray(input.footage) || input.footage.length === 0) {
    return Response.json({ error: "footage[] is required (at least one clip URL)" }, { status: 400 });
  }

  // Phase 0/3 — LOAD MEMORY + CONFIDENCE leash
  const recipe = input.recipe ?? null;
  const resolution = await resolveStyle(recipe, input);

  // Phase 2 — GATE: a hard blocker (no rhythm source at all) stops the render.
  const hardBlock = resolution.escalations.find((e) => e.title.includes("no vibe"));
  if (hardBlock) {
    return Response.json(
      { error: "No reference recipe and no vibe — nothing to copy.", escalations: resolution.escalations },
      { status: 422 }
    );
  }

  const style = resolution.style;
  const effectiveRecipe = recipe ?? synthesizeRecipe(input.footage.length, style);

  // Phase 4 — ACT: build the timeline + submit to the render provider.
  let edit;
  try {
    edit = recipeToTimeline({
      recipe: effectiveRecipe,
      footage: input.footage,
      style,
      hookText: input.hookText,
      musicUrl: input.musicUrl,
    });
  } catch (err) {
    await logError("validation", "reel-command", err as Error, { footage: input.footage.length });
    return Response.json({ error: `Timeline build failed: ${(err as Error).message}` }, { status: 400 });
  }

  const provider = getRenderProvider();
  if (!provider.configured()) {
    return Response.json({ error: `Render provider ${provider.id} is not configured (missing key)` }, { status: 503 });
  }

  let renderId: string;
  try {
    const submission = await provider.submit(edit, { production: input.production });
    renderId = submission.renderId;
  } catch (err) {
    await logError("api_failure", "reel-command", err as Error, { provider: provider.id });
    return Response.json({ error: `Render submit failed: ${(err as Error).message}` }, { status: 502 });
  }

  // Phase 5 — persist. reel metadata (fingerprint + escalations) rides on motionSpec
  // so render-poll can fold it into the Approve Queue item when the render completes.
  const fp = fingerprint(style, input);
  const reelMeta = {
    fingerprint: fp,
    escalations: resolution.escalations,
    confidence: resolution.confidence,
    production: Boolean(input.production), // so render-poll polls the right host
  };

  const project = await prisma.contentProject.create({
    data: {
      type: "reel",
      status: "drafting",
      brief: input.vibe ?? (recipe ? "Reference recipe teardown" : null),
      captionDraft: input.hookText ?? null,
      motionSpec: JSON.stringify(reelMeta),
      platform: "instagram,facebook",
      media: {
        create: input.footage.map((c, i) => ({
          kind: "reel_source",
          url: c.url,
          slideIndex: i,
          mimeType: "video/mp4",
        })),
      },
      renderJobs: {
        create: { assetType: "reel", status: "rendering", renderId },
      },
    },
    include: { renderJobs: true },
  });

  return Response.json({
    ok: true,
    contentProjectId: project.id,
    renderJobId: project.renderJobs[0]?.id,
    renderId,
    provider: provider.id,
    estDurationSec: Number(timelineDuration(edit).toFixed(1)),
    escalations: resolution.escalations,
    confidence: resolution.confidence,
    notes: resolution.notes,
  });
}
