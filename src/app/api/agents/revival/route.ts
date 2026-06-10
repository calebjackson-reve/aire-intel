import { prisma } from "@/lib/prisma";
import { getDeadLeads } from "@/lib/revival";
import { generateDraft } from "@/lib/draft-agent";
import { verifyCronSecret, cronUnauthorized } from "@/lib/cron-auth";
import { startRun, finishRun, failRun } from "@/lib/agent-run";
import { getTodayCT } from "@/lib/brief-date";

// Lead Revival Agent — runs at 7:00 PM CT (01:00 UTC) via Vercel cron
// Finds dead leads (90+ days old, never replied, never progressed)
// Generates voice-matched drafts, queues in ActionQueue — never auto-sends

const MAX_DRAFTS_PER_NIGHT = 15;

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  return runRevival();
}

export async function GET() {
  return runRevival();
}

async function runRevival() {
  const runId = await startRun("lead_revival");
  const today = getTodayCT();
  const errors: unknown[] = [];
  let actionsQueued = 0;

  try {
    const deadLeads = await getDeadLeads();

    // Sort by priority: most likely to respond first (has phone + email = better)
    // then by how recently they were created (newer = more likely to engage)
    const sorted = deadLeads
      .filter((l) => l.phone || l.email)
      .sort((a, b) => {
        const aScore = (a.phone ? 1 : 0) + (a.email ? 1 : 0) - Math.floor(a.ageDays / 90);
        const bScore = (b.phone ? 1 : 0) + (b.email ? 1 : 0) - Math.floor(b.ageDays / 90);
        return bScore - aScore;
      })
      .slice(0, MAX_DRAFTS_PER_NIGHT);

    for (const lead of sorted) {
      try {
        // Idempotency: skip if already queued today
        const alreadyQueued = await prisma.actionQueue.findFirst({
          where: {
            leadId: lead.id,
            agentType: "lead_revival",
            briefDate: today,
          },
          select: { id: true },
        });
        if (alreadyQueued) continue;

        const draft = await generateDraft({ leadId: lead.id, source: "revival" });

        const savedDraft = await prisma.messageDraft.create({
          data: {
            leadId: lead.id,
            channel: draft.channel,
            subject: draft.subject ?? null,
            body: draft.body,
            status: "pending",
            source: "revival",
          },
        });

        const priority = lead.ageDays < 180 ? 3 : lead.ageDays < 365 ? 4 : 5;

        await prisma.actionQueue.create({
          data: {
            type: "draft_message",
            agentType: "lead_revival",
            leadId: lead.id,
            priority,
            briefDate: today,
            requiresApproval: true,
            payload: {
              messageDraftId: savedDraft.id,
              leadId: lead.id,
              leadName: lead.name,
              channel: draft.channel,
              body: draft.body,
              subject: draft.subject ?? null,
              ageDays: lead.ageDays,
              toPhone: lead.phone,
              toEmail: lead.email,
            },
          },
        });

        actionsQueued++;
      } catch (err) {
        errors.push({ leadId: lead.id, leadName: lead.name, error: String(err) });
      }
    }

    await finishRun(runId, {
      itemsProcessed: sorted.length,
      actionsQueued,
      errorLog: errors,
    });

    return Response.json({
      ok: true,
      runId,
      deadLeadsFound: deadLeads.length,
      drafted: actionsQueued,
      capped: deadLeads.length > MAX_DRAFTS_PER_NIGHT,
    });
  } catch (err) {
    await failRun(runId, err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
