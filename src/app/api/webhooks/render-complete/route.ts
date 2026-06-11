export const dynamic = "force-dynamic";
// AIRE: loop:render-job-completion
// Webhook from external render service (Remotion Cloud or custom). Push-based alternative to the poll cron.
// Validates shared secret, updates RenderJob + ContentProject, queues post_content for approval.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-memory";

interface RenderCompleteBody {
  renderId: string;
  outputUrl?: string;
  status: "completed" | "failed";
  error?: string;
}

export async function POST(req: NextRequest) {
  // AIRE: loop:render-job-completion — validate shared secret
  const secret = req.headers.get("x-render-secret");
  if (!secret || secret !== process.env.RENDER_WEBHOOK_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RenderCompleteBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { renderId, outputUrl, status, error: renderError } = body;

  if (!renderId || !status) {
    return Response.json({ error: "Missing renderId or status" }, { status: 400 });
  }

  const renderJob = await prisma.renderJob.findFirst({
    where: { renderId },
    include: { contentProject: true },
  });

  if (!renderJob) {
    return Response.json({ error: "RenderJob not found" }, { status: 404 });
  }

  // AIRE: loop:render-job-completion — idempotency: skip if already terminal
  if (renderJob.status === "done" || renderJob.status === "failed") {
    return Response.json({ ok: true, skipped: true });
  }

  try {
    if (status === "completed" && outputUrl) {
      await prisma.$transaction(async (tx) => {
        await tx.renderJob.update({
          where: { id: renderJob.id },
          data: { status: "done", outputUrl },
        });

        await tx.contentProject.update({
          where: { id: renderJob.contentProjectId },
          data: { status: "ready" },
        });

        // AIRE: loop:render-job-completion — idempotency: skip if ActionQueue item exists
        const existing = await tx.actionQueue.findFirst({
          where: {
            type: "post_content",
            status: "pending",
            payload: { path: ["contentProjectId"], equals: renderJob.contentProjectId },
          },
        });

        if (!existing) {
          await tx.actionQueue.create({
            data: {
              type: "post_content",
              agentType: "render_job_completion",
              payload: { contentProjectId: renderJob.contentProjectId, outputUrl },
              requiresApproval: true,
              priority: 4,
            },
          });
        }

        await tx.notification.create({
          data: {
            type: "social_post",
            title: `${renderJob.contentProject.type} render complete — ready to post`,
            body: `${renderJob.assetType} is ready. Tap to review and schedule.`,
            href: `/create-post`,
          },
        });
      });
    } else if (status === "failed") {
      await prisma.renderJob.update({
        where: { id: renderJob.id },
        data: { status: "failed", error: renderError ?? "Unknown render error" },
      });

      await logError(
        "api_failure",
        "render-complete-webhook",
        new Error(renderError ?? "Render failed"),
        { renderId, contentProjectId: renderJob.contentProjectId }
      );

      await prisma.notification.create({
        data: {
          type: "social_post",
          title: `Render failed`,
          body: renderError ?? "Render job failed — check render service logs.",
          href: `/create-post`,
        },
      });
    } else {
      return Response.json({ error: "Invalid status or missing outputUrl" }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    await logError("api_failure", "render-complete-webhook", err as Error, { renderId });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
