// Lead score model — calibration control
// POST /api/leads/score/recalibrate → retrain the close-probability model from
//                                      full lead/deal/loop history and persist it
// GET  /api/leads/score/recalibrate → inspect the currently persisted model

import { recalibrate, loadScoreModel } from "@/lib/score-model";

export async function POST() {
  const { model, summary } = await recalibrate();
  return Response.json({
    active: model.active,
    trainedAt: model.trainedAt,
    baseRate: model.baseRate,
    summary,
    note: model.active
      ? "Learned model is active — scores now reflect Caleb's own close history."
      : `Not enough resolved history yet (need ≥40 resolved, ≥12 won). Falling back to static scoring. Have ${summary.resolved} resolved / ${summary.won} won.`,
  });
}

export async function GET() {
  const model = await loadScoreModel(true);
  if (!model) {
    return Response.json({ active: false, note: "No model trained yet. POST to recalibrate." });
  }
  return Response.json(model);
}
