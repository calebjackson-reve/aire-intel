export const dynamic = "force-dynamic";
// AIRE: loop:render-job-completion
// Cron: every 5 minutes. Finds RenderJob records stuck in "rendering" for > 30 min.
// If renderId is set, polls RENDER_API_URL for status. Otherwise logs a stale-job warning.

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-memory";
import { getRenderProvider, type RenderStatus } from "@/lib/render/providers";

/** Reel metadata stashed on ContentProject.motionSpec by the /reel command. */
function parseReelMeta(motionSpec: string | null): {
  production?: boolean;
  escalations?: unknown[];
  fingerprint?: unknown;
  confidence?: unknown;
} {
  if (!motionSpec) return {};
  try {
    return JSON.parse(motionSpec);
  } catch {
    return {};
  }
}

async function fetchRenderStatus(renderId: string, production: boolean): Promise<RenderStatus> {
  // Poll through the render-provider seam (Shotstack today). The provider normalizes
  // each backend's status vocabulary to { state, url, error }.
  return getRenderProvider().poll(renderId, { production });
}

async function handleCompleted(
  renderJobId: string,
  contentProjectId: string,
  outputUrl: string,
  reelMeta: ReturnType<typeof parseReelMeta>
) {
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
      // Fold reel escalations/fingerprint into the Approve Queue payload so the approve
      // handler can show LOW-confidence flags and score the outcome. reelMeta came from
      // JSON.parse, so its values are already JSON-safe.
      const payload = {
        contentProjectId,
        outputUrl,
        ...(reelMeta.escalations ? { escalations: reelMeta.escalations } : {}),
        ...(reelMeta.fingerprint ? { reelFingerprint: reelMeta.fingerprint } : {}),
        ...(reelMeta.confidence ? { confidence: reelMeta.confidence } : {}),
      } as Prisma.InputJsonObject;

      await tx.actionQueue.create({
        data: {
          type: "post_content",
          agentType: "render_job_completion",
          payload,
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

  // Poll every in-flight job that has a provider renderId, regardless of age — reels
  // finish in seconds, so waiting 30 min to check would strand them. The 30-min window
  // is only used to WARN on jobs that linger.
  const activeJobs = await prisma.renderJob.findMany({
    where: { status: "rendering", renderId: { not: null } },
    take: 25,
    orderBy: { updatedAt: "asc" },
    include: { contentProject: true },
  });

  const results: { id: string; action: string; error?: string }[] = [];

  for (const job of activeJobs) {
    const reelMeta = parseReelMeta(job.contentProject?.motionSpec ?? null);
    try {
      const remote = await fetchRenderStatus(job.renderId!, Boolean(reelMeta.production));

      if (remote.state === "done" && remote.url) {
        await handleCompleted(job.id, job.contentProjectId, remote.url, reelMeta);
        results.push({ id: job.id, action: "completed" });
      } else if (remote.state === "failed") {
        await prisma.renderJob.update({
          where: { id: job.id },
          data: { status: "failed", error: remote.error ?? "Render failed" },
        });
        await logError("api_failure", "render-poll-cron", new Error(remote.error ?? "Render failed"), {
          renderId: job.renderId,
          contentProjectId: job.contentProjectId,
        });
        await prisma.notification.create({
          data: {
            type: "social_post",
            title: "Render failed",
            body: remote.error ?? "Render job failed — check logs.",
            href: `/create-post`,
          },
        });
        results.push({ id: job.id, action: "failed" });
      } else if (job.updatedAt < thirtyMinAgo) {
        // Still in-flight after 30 min — warn but keep polling.
        await prisma.notification.create({
          data: {
            type: "social_post",
            title: "Render taking longer than expected",
            body: `Job ${job.id} (${job.assetType}) has been rendering for over 30 minutes.`,
            href: `/create-post`,
          },
        });
        results.push({ id: job.id, action: "warn_timeout" });
      } else {
        results.push({ id: job.id, action: "pending" });
      }
    } catch (err) {
      await logError("api_failure", "render-poll-cron", err as Error, { jobId: job.id });
      results.push({ id: job.id, action: "error", error: (err as Error).message });
    }
  }

  // Local renders (no provider renderId) stuck > 30 min — warn separately.
  const stuckLocal = await prisma.renderJob.findMany({
    where: { status: "rendering", renderId: null, updatedAt: { lt: thirtyMinAgo } },
    take: 10,
  });
  for (const job of stuckLocal) {
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

  return Response.json({ ok: true, processed: results.length, results });
}
