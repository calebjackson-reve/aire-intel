import { verifyCronSecret, cronUnauthorized } from "@/lib/cron-auth";
import { startRun, finishRun, failRun } from "@/lib/agent-run";
import { assembleBrief } from "@/lib/brief-assembler";
import { deliverBrief } from "@/lib/brief-delivery";

// Morning Brief Assembler — runs at 5:00 AM CT (11:00 UTC) via Vercel cron
// Reads all overnight agent outputs, assembles DailyBrief, delivers via all 4 channels

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  return runMorningBrief();
}

export async function GET() {
  return runMorningBrief();
}

async function runMorningBrief() {
  const runId = await startRun("morning_brief");

  try {
    const brief = await assembleBrief(runId);

    const totalItems =
      brief.nonNegotiables.length +
      brief.goingCold.length +
      brief.owePeople.length +
      brief.contentQueued.length +
      brief.marketMovement.length;

    const delivery = await deliverBrief(brief);

    await finishRun(runId, {
      itemsProcessed: totalItems,
      actionsQueued: 0,
    });

    return Response.json({
      ok: true,
      runId,
      date: brief.date,
      sections: {
        nonNegotiables: brief.nonNegotiables.length,
        goingCold: brief.goingCold.length,
        owePeople: brief.owePeople.length,
        contentQueued: brief.contentQueued.length,
        marketMovement: brief.marketMovement.length,
      },
      totalItems,
      delivery,
      smsSummary: brief.smsSummary,
    });
  } catch (err) {
    await failRun(runId, err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
