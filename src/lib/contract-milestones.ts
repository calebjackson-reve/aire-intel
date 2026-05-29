// Contract milestone task generator
//
// When a lead moves to stage="under_contract", a handful of standard
// real-estate deadlines kick in. This module spawns the corresponding
// tasks idempotently so the agent (Caleb) never has to remember them.
//
// Called from the contact PATCH route on stage transition. Safe to re-run
// on the same lead — dedupes on the `[Milestone:<type>]` marker baked
// into each title.
//
// Standard milestones (Louisiana residential):
//   1. Inspection deadline   → contractDate + 7 days
//   2. Appraisal             → contractDate + 14 days
//   3. Final walk-through    → closingDate - 2 days (skipped if no closing date)
//   4. Closing day           → closingDate          (skipped if no closing date)
//
// Tasks whose due date is already >1 day in the past are skipped — a
// lead may be marked under_contract retroactively, and stale tasks are
// noise.

import { prisma } from "./prisma";

type MilestoneType = "inspection" | "appraisal" | "walkthrough" | "closing";

interface MilestoneSpec {
  type: MilestoneType;
  baseTitle: string;
  dueDate: Date;
}

interface GeneratedTask {
  title: string;
  dueDate: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function markerFor(type: MilestoneType): string {
  return `[Milestone:${type}]`;
}

function buildSpecs(contractDate: Date, closingDate: Date | null): MilestoneSpec[] {
  const specs: MilestoneSpec[] = [
    {
      type: "inspection",
      baseTitle: "Inspection deadline",
      dueDate: addDays(contractDate, 7),
    },
    {
      type: "appraisal",
      baseTitle: "Appraisal ordered / received",
      dueDate: addDays(contractDate, 14),
    },
  ];

  if (closingDate) {
    specs.push({
      type: "walkthrough",
      baseTitle: "Final walk-through",
      dueDate: addDays(closingDate, -2),
    });
    specs.push({
      type: "closing",
      baseTitle: "Closing day",
      dueDate: closingDate,
    });
  }

  return specs;
}

export async function generateContractMilestones(
  leadId: string,
  contractDate: Date,
  closingDate: Date | null,
): Promise<{ created: number; tasks: GeneratedTask[] }> {
  const specs = buildSpecs(contractDate, closingDate);
  const staleCutoff = Date.now() - DAY_MS;
  const created: GeneratedTask[] = [];

  for (const spec of specs) {
    // Skip tasks whose due date is already more than 1 day in the past —
    // retroactive under_contract marks shouldn't spawn noise.
    if (spec.dueDate.getTime() < staleCutoff) {
      continue;
    }

    const marker = markerFor(spec.type);

    // Idempotency check — no unique constraint on Task, so look for the
    // marker substring within the title for this lead.
    const existing = await prisma.task.findFirst({
      where: {
        leadId,
        title: { contains: marker },
      },
      select: { id: true },
    });

    if (existing) {
      continue;
    }

    const title = `${marker} ${spec.baseTitle}`;

    await prisma.task.create({
      data: {
        leadId,
        title,
        dueDate: spec.dueDate,
        priority: "high",
        done: false,
      },
    });

    created.push({ title, dueDate: spec.dueDate });
  }

  return { created: created.length, tasks: created };
}
