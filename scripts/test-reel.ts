/**
 * End-to-end smoke test for the /reel pipeline — no dev server needed.
 *   A) recipe → timeline → Shotstack submit → poll → real MP4   (bridge + provider seam)
 *   B) resolveStyle + recordReelOutcome + snapshot               (Karpathy flywheel, hits DB)
 *
 * Usage: npx tsx scripts/test-reel.ts
 */
import * as dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { REVE_BRAND, type EditRecipe, type ReelInput } from "../src/lib/reel/recipe";
import { recipeToTimeline, timelineDuration, type ResolvedStyle } from "../src/lib/reel/timeline";
import { getRenderProvider } from "../src/lib/render/providers";

// A torn-down reference reel: fast agency-lane pace, beat-synced, warm punchy grade.
const referenceRecipe: EditRecipe = {
  version: "test-1",
  createdAt: "2026-06-23T00:00:00Z",
  source: { path: "ref.mp4", duration: 8, fps: 30, width: 1080, height: 1920, aspect: "9:16" },
  segments: [
    { index: 0, start: 0.0, end: 1.2, durationFrames: 36 },
    { index: 1, start: 1.2, end: 2.8, durationFrames: 48 },
    { index: 2, start: 2.8, end: 4.2, durationFrames: 42 },
    { index: 3, start: 4.2, end: 6.2, durationFrames: 60 },
    { index: 4, start: 6.2, end: 8.0, durationFrames: 54 },
  ],
  cuts: [
    { atFrame: 36, atTime: 1.2, type: "whip", confidence: 0.9 },
    { atFrame: 84, atTime: 2.8, type: "hard", confidence: 0.95 },
    { atFrame: 126, atTime: 4.2, type: "zoom", confidence: 0.8 },
    { atFrame: 186, atTime: 6.2, type: "hard", confidence: 0.95 },
  ],
  rhythm: { tempoBPM: 120, beatGrid: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8], cutsOnBeat: true, cutsOnBeatRatio: 0.85, avgShotLen: 1.6 },
  text: [
    { start: 0, end: 1.2, bbox: [0.06, 0.8, 0.6, 0.1], sampleText: "JUST LISTED", style: { position: "bottomLeft" } },
    { start: 4.2, end: 5.8, bbox: [0.3, 0.45, 0.4, 0.1], sampleText: "3 BED · POOL", style: { position: "center" } },
  ],
  grade: { contrast: 0.2, saturation: 0.25, temperature: 0.1, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1.05, 1.0, 0.95] },
  motion: [
    { segmentIndex: 0, pan: 0, zoom: 0.03, shake: 0, speedRamp: false },
    { segmentIndex: 3, pan: 0, zoom: 0.05, shake: 0, speedRamp: true },
  ],
  isEdited: { verdict: "edited", confidence: 0.92, signals: [] },
};

// Caleb has no raw footage yet → stand in with Shotstack's public sample clips.
// 3 clips against 5 shots exercises the cycling logic.
const footageUrls = [
  "https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/footage/skater.hd.mp4",
  "https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/footage/beach-overhead.mp4",
  "https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/footage/night-sky.mp4",
];

const input: ReelInput = {
  footage: footageUrls.map((url) => ({ url })),
  recipe: referenceRecipe,
  hookText: "JUST LISTED — BATON ROUGE",
  musicUrl: "https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/unminus/lit.mp3",
  production: false,
};

// Hardcoded style mirror of DEFAULT_STYLE so Part A doesn't depend on the DB.
const style: ResolvedStyle = {
  avgShotLen: 1.6,
  snapToBeat: true,
  transitionMap: { hard: "none", dissolve: "fade", whip: "slideLeft", zoom: "zoom", fade: "fade" },
  gradeFilter: "boost",
  maxAccentTransitions: 1,
  brand: REVE_BRAND,
};

async function partA() {
  console.log("━━━ PART A — recipe → timeline → render ━━━\n");
  const edit = recipeToTimeline({ recipe: referenceRecipe, footage: input.footage, style, hookText: input.hookText, musicUrl: input.musicUrl });

  const videoTrack = edit.timeline.tracks[edit.timeline.tracks.length - 1];
  console.log(`🎬  Timeline built: ${videoTrack.clips.length} shots, ${timelineDuration(edit).toFixed(1)}s, ${edit.output.aspectRatio} ${edit.output.resolution}`);
  console.log("    Shot plan:");
  videoTrack.clips.forEach((c, i) => {
    const t = c.transition?.in ? ` [${c.transition.in}]` : "";
    const src = (c.asset as { src: string }).src.split("/").pop();
    console.log(`      ${i + 1}. ${c.length}s ${src}${t}${c.effect ? ` (${c.effect})` : ""} filter=${c.filter}`);
  });

  const provider = getRenderProvider();
  console.log(`\n⏳  Submitting to ${provider.id} (sandbox)...`);
  const { renderId } = await provider.submit(edit, { production: false });
  console.log(`    renderId: ${renderId}`);

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const status = await provider.poll(renderId, { production: false });
    process.stdout.write(`    poll ${i + 1}: ${status.state}\n`);
    if (status.state === "done") {
      console.log(`\n✅  RENDER COMPLETE → ${status.url}`);
      return;
    }
    if (status.state === "failed") {
      console.log(`\n❌  RENDER FAILED: ${status.error}`);
      return;
    }
  }
  console.log("\n⚠️  Timed out waiting for render.");
}

async function partB() {
  console.log("\n━━━ PART B — Karpathy flywheel (DB) ━━━\n");
  try {
    const { resolveStyle, fingerprint, recordReelOutcome, reelPreferenceSnapshot } = await import("../src/lib/reel/learning");
    const resolution = await resolveStyle(referenceRecipe, input);
    console.log("🧠  resolveStyle:");
    console.log("    gradeFilter:", resolution.style.gradeFilter, "| avgShotLen:", resolution.style.avgShotLen);
    console.log("    confidence:", JSON.stringify(resolution.confidence));
    console.log("    escalations:", resolution.escalations.length ? resolution.escalations.map((e) => e.title) : "none");

    const fp = fingerprint(resolution.style, input);
    await recordReelOutcome(fp, "approved");
    console.log(`\n📈  Recorded an APPROVE for fingerprint:`, JSON.stringify(fp));
    const snap = await reelPreferenceSnapshot();
    console.log("    flywheel now:", JSON.stringify(snap));
  } catch (err) {
    console.log("⚠️  Part B (DB) skipped/failed:", (err as Error).message);
  }
}

(async () => {
  await partA();
  await partB();
  process.exit(0);
})();
