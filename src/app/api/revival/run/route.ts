export const dynamic = "force-dynamic";
// Dead-Lead Revival Agent — generate the approve-queue drafts for a cohort
//
// POST /api/revival/run    body: { cohortId, limit? }
//
// For each TREATMENT-arm lead in the cohort (holdout is never touched — that's the
// A/B control), generate one voice-matched re-engagement draft and queue it as
// pending. NOTHING is sent here; Caleb approves each draft in the queue, which is
// what makes the revival both TCPA-safe and provable (treatment vs holdout).
//
// Idempotent: a treatment lead that already has a non-dismissed revival draft for
// this cohort is skipped, so re-running won't double-queue.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateDraft } from "@/lib/draft-agent";

function safeParseIds(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const cohortId = typeof body?.cohortId === "string" ? body.cohortId : null;
  if (!cohortId) return Response.json({ error: "cohortId is required" }, { status: 400 });

  const limit = typeof body?.limit === "number" ? Math.max(1, Math.min(body.limit, 100)) : 25;

  const cohort = await prisma.revivalCohort.findUnique({ where: { id: cohortId } });
  if (!cohort) return Response.json({ error: "Cohort not found" }, { status: 404 });

  const treatment = safeParseIds(cohort.leadIds);
  if (treatment.length === 0) {
    return Response.json({ error: "Cohort has no treatment-arm leads." }, { status: 400 });
  }

  // Skip leads that already have a live draft for this cohort (idempotent re-run).
  const existing = await prisma.messageDraft.findMany({
    where: { cohortId, status: { in: ["pending", "approved", "sent"] } },
    select: { leadId: true },
  });
  const alreadyQueued = new Set(existing.map((d) => d.leadId));
  const todo = treatment.filter((id) => !alreadyQueued.has(id)).slice(0, limit);

  let created = 0;
  const errors: { leadId: string; error: string }[] = [];

  // Sequential to respect API rate limits and keep ordering deterministic.
  for (const leadId of todo) {
    try {
      const gen = await generateDraft({ leadId, source: "revival" });
      await prisma.messageDraft.create({
        data: {
          leadId,
          channel: gen.channel,
          subject: gen.subject,
          body: gen.body,
          source: "revival",
          cohortId,
        },
      });
      created++;
    } catch (err) {
      errors.push({ leadId, error: err instanceof Error ? err.message : "failed" });
    }
  }

  return Response.json({
    cohortId,
    treatmentCount: treatment.length,
    alreadyQueued: alreadyQueued.size,
    created,
    skipped: treatment.length - todo.length,
    errors,
  });
}
