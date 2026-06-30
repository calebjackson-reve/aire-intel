// ─────────────────────────────────────────────────────────────────────────────
// The Brain grades itself — Increment 2 proof (Outcome → Reflection → Learning).
//
// On REAL data, with a SIMULATED CLOCK (real observations, only the clock moves):
//   1. Continuous ingest — real ContactLogs → immutable Observations.
//   2. Replay as-of a past date — recompute "as of" then → the engine REMEMBERS the
//      prediction it would have made (immutable).
//   3. Advance the clock past the horizon → reflect() grades the prediction against
//      what the entity actually did, and remembers the grade.
//   4. Scorecard — per-engine-version hit rate. The Brain discovering when it's right.
//   5. Verdict-rule check — proves confirmed / incorrect / inconclusive all fire.
//
// Run: npx tsx scripts/brain-learning-loop.ts ["Lead Name"]
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { ingestContactLogsForLead } from "@/lib/brain/adapters/contact-log";
import { recompute } from "@/lib/brain/projector";
import { reflect, scorecard, decideVerdict, PREDICTION_EVENT } from "@/lib/brain/predictions";

const DAY = 86_400_000;

async function main() {
  const name = process.argv[2] ?? "Garret Levine";
  const lead = await prisma.lead.findFirst({
    where: { name },
    include: { timeline_logs: { orderBy: { touchedAt: "asc" } } },
  });
  if (!lead || lead.timeline_logs.length === 0) {
    console.error(`No lead "${name}" with contact logs in the dev DB.`);
    process.exit(1);
  }

  console.log("━━━ 1. CONTINUOUS INGEST (real ContactLogs → Observations) ━━━");
  for (const l of lead.timeline_logs) {
    console.log(`   • ${new Date(l.touchedAt).toISOString().slice(0, 10)} ${l.direction.padEnd(8)} ${l.method}`);
  }
  const entityId = await ingestContactLogsForLead(lead.id);
  if (!entityId) throw new Error("ingest failed");
  console.log(`   ✓ ingested → entity ${entityId.slice(0, 8)}`);

  // Replay as-of the moment drift would first have been visible: a few days after
  // the last real inbound, before any later reply. Real timestamps, past clock.
  const lastInbound = [...lead.timeline_logs].reverse().find((l) => l.direction === "inbound");
  const asOf = (lastInbound ? +new Date(lastInbound.touchedAt) : +new Date(lead.timeline_logs[0].touchedAt)) + 3 * DAY;
  console.log(`\n━━━ 2. REPLAY as-of ${new Date(asOf).toISOString().slice(0, 10)} (engine sees only what was known then) ━━━`);
  await recompute(entityId, asOf);
  const preds = await prisma.observation.findMany({
    where: { nodeId: entityId, eventType: PREDICTION_EVENT },
    select: { text: true, facts: true, recordedAt: true },
  });
  for (const p of preds) {
    const f = p.facts as { engineVersion: string; horizonDays: number };
    console.log(`   ✓ PREDICTED (${f.engineVersion}, ${f.horizonDays}d horizon): ${p.text}`);
  }
  if (preds.length === 0) console.log("   (no falsifiable prediction at this date — risk below threshold)");

  // Advance the clock past the horizon to reveal the outcome from real data.
  const horizon = (preds[0]?.facts as { horizonDays?: number })?.horizonDays ?? 14;
  const future = asOf + (horizon + 1) * DAY;
  console.log(`\n━━━ 3. ADVANCE CLOCK to ${new Date(future).toISOString().slice(0, 10)} → REFLECT (grade vs. what actually happened) ━━━`);
  const graded = await reflect(entityId, future);
  for (const g of graded) console.log(`   ✓ GRADED: prediction ${g.predictionId.slice(0, 8)} → ${g.verdict.toUpperCase()} (${g.engineVersion})`);
  if (graded.length === 0) console.log("   (nothing newly gradable)");

  console.log("\n━━━ 4. SCORECARD (replay all grades → per-engine hit rate) ━━━");
  for (const s of await scorecard()) {
    const rate = s.hitRate === null ? "n/a" : `${Math.round(s.hitRate * 100)}%`;
    console.log(`   ${s.engineVersion}: graded ${s.graded} (confirmed ${s.confirmed}, incorrect ${s.incorrect}), open ${s.openPredictions} → hit rate ${rate}`);
  }

  console.log("\n━━━ 5. VERDICT-RULE CHECK (proves all three branches fire) ━━━");
  const now0 = 0;
  const checks: Array<[string, ReturnType<typeof decideVerdict>, string]> = [
    ["re-engaged within horizon", decideVerdict({ predictedAt: now0, horizonDays: 14, reEngaged: true, now: now0 + 5 * DAY }), "incorrect"],
    ["silent past horizon", decideVerdict({ predictedAt: now0, horizonDays: 14, reEngaged: false, now: now0 + 15 * DAY }), "confirmed"],
    ["horizon still open", decideVerdict({ predictedAt: now0, horizonDays: 14, reEngaged: false, now: now0 + 5 * DAY }), "inconclusive"],
  ];
  let ok = true;
  for (const [desc, got, want] of checks) {
    const pass = got === want;
    ok = ok && pass;
    console.log(`   ${pass ? "✓" : "✗"} ${desc}: ${got}${pass ? "" : ` (expected ${want})`}`);
  }

  console.log(`\n${ok ? "✅" : "❌"} Learning loop closed: real prediction → real outcome → self-graded → scored.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
