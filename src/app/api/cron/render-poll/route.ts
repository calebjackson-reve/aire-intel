export const dynamic = "force-dynamic";
// AIRE: loop:render-job-completion
// Cron: every 5 minutes. Finds RenderJob records stuck in "rendering" for > 30 min.
// If renderId is set, polls RENDER_API_URL for status. Otherwise logs a stale-job warning.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError, withRetry } from "@/lib/error-memory";

interface RenderStatusResponse {
  status: "processing" | "completed" | "failed";
  outputUrl?: string;
  error?: string;
}

async function fetchRenderStatus(renderId: string): Promise<RenderStatusResponse> {
  const baseUrl = process.env.RENDER_API_URL;
  if (!baseUrl) throw new Error("RENDER_API_URL not configured");

  const res = await withRetry(
    () => fetch(`${baseUrl}/api/render/status/${renderId}`, {
      headers: { Authorization: `Bearer ${process.env.RENDER_API_KEY ?? ""}` },
    }),
    { source: `render-status:${renderId}` }
  );

  if (!res.ok) throw new Error(`Render API responded ${res.status}`);
  return res.json() as Promise<RenderStatusResponse>;
}

async function handleCompleted(renderJobId: string, contentProjectId: string, outputUrl: string) {
  await prisma.$transaction(async (tx) => {
    await tx.renderJob.update({
      where: { id: renderJobId },
      data: { status: "done", outputUrl },
    });

    await tx.contentProject.update({
      where: { id: contentProjectId },
      data: { status: "ready" },
    });

    const existing = await tx.actionQueue.findFirst({
      where: {
        type: "post_content",
        status: "pending",
        payload: { path: ["contentProjectId"], equals: contentProjectId },
      },
    });

    if (!existing) {
      await tx.actionQueue.create({
        data: {
          type: "post_content",
          agentType: "render_job_completion",
          payload: { contentProjectId, outputUrl },
          requiresApproval: true,
          priority: 4,
        },
      });
    }

    await tx.notification.create({
      data: {
        type: "social_post",
        title: "Render complete — ready to post",
        body: "Your content is ready. Tap to review and schedule.",
        href: `/create-post`,
      },
    });
  });
}

export async function POST(req: NextRequest) {
  // AIRE: loop:render-job-completion — auth
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

  // AIRE: loop:render-job-completion — find stale rendering jobs
  const staleJobs = await prisma.renderJob.findMany({
    where: {
      status: "rendering",
      updatedAt: { lt: thirtyMinAgo },
    },
    take: 10,
    orderBy: { updatedAt: "asc" },
    include: { contentProject: true },
  });

  const results: { id: string; action: string; error?: string }[] = [];

  for (const job of staleJobs) {
    if (job.renderId && process.env.RENDER_API_URL) {
      try {
        const remote = await fetchRenderStatus(job.renderId);

        if (remote.status === "completed" && remote.outputUrl) {
          await handleCompleted(job.id, job.contentProjectId, remote.outputUrl);
          results.push({ id: job.id, action: "completed" });
        } else if (remote.status === "failed") {
          await prisma.renderJob.update({
            where: { id: job.id },
            data: { status: "failed", error: remote.error ?? "Render failed" },
          });
          await logError(
            "api_failure",
            "render-poll-cron",
            new Error(remote.error ?? "Render failed"),
            { renderId: job.renderId, contentProjectId: job.contentProjectId }
          );
          await prisma.notification.create({
            data: {
              type: "social_post",
              title: "Render failed",
              body: remote.error ?? "Render job failed — check logs.",
              href: `/create-post`,
            },
          });
          results.push({ id: job.id, action: "failed" });
        } else {
          // Still processing but past 30 min — warn
          await prisma.notification.create({
            data: {
              type: "social_post",
              title: "Render taking longer than expected",
              body: `Job ${job.id} has been rendering for over 30 minutes.`,
              href: `/create-post`,
            },
          });
          results.push({ id: job.id, action: "warn_timeout" });
        }
      } catch (err) {
        await logError("api_failure", "render-poll-cron", err as Error, { jobId: job.id });
        results.push({ id: job.id, action: "error", error: (err as Error).message });
      }
    } else {
      // No remote renderId — local render stuck; log warning notification
      await prisma.notification.create({
        data: {
          type: "social_post",
          title: "Render taking longer than expected",
          body: `Job ${job.id} (${job.assetType}) has been stuck in rendering for over 30 minutes.`,
          href: `/create-post`,
        },
      });
      results.push({ id: job.id, action: "warn_no_remote" });
    }
  }

  return Response.json({ ok: true, processed: results.length, results });
}
