import { prisma } from "./prisma";

export type AgentType =
  | "new_lead_intake"
  | "lead_revival"
  | "transaction_watchdog"
  | "market_intel"
  | "content_scheduler"
  | "morning_brief";

/** Start a new AgentRun record and return its id. */
export async function startRun(agentType: AgentType): Promise<string> {
  const run = await prisma.agentRun.create({
    data: { agentType, status: "running" },
  });
  return run.id;
}

/** Finish a run record with stats. */
export async function finishRun(
  id: string,
  opts: { itemsProcessed: number; actionsQueued: number; errorLog?: unknown[] }
) {
  const start = await prisma.agentRun
    .findUnique({ where: { id }, select: { startedAt: true } })
    .then((r) => r?.startedAt ?? new Date());

  await prisma.agentRun.update({
    where: { id },
    data: {
      status: opts.errorLog && opts.errorLog.length > 0 ? "partial" : "completed",
      completedAt: new Date(),
      itemsProcessed: opts.itemsProcessed,
      actionsQueued: opts.actionsQueued,
      errorLog: opts.errorLog?.length ? (opts.errorLog as object[]) : undefined,
      durationMs: Date.now() - start.getTime(),
    },
  });
}

/** Mark a run as failed. */
export async function failRun(id: string, error: unknown) {
  const start = await prisma.agentRun
    .findUnique({ where: { id }, select: { startedAt: true } })
    .then((r) => r?.startedAt ?? new Date());

  await prisma.agentRun.update({
    where: { id },
    data: {
      status: "failed",
      completedAt: new Date(),
      errorLog: [{ error: String(error) }],
      durationMs: Date.now() - start.getTime(),
    },
  });
}
