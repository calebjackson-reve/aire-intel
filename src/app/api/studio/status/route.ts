export const dynamic = "force-dynamic";
export const maxDuration = 200;

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/** SSE render status polling. Emits { state, url? } events every 3s until done/failed/timeout. */
export async function GET(req: NextRequest) {
  const renderJobId = new URL(req.url).searchParams.get("renderJobId");
  if (!renderJobId) {
    return new Response(JSON.stringify({ error: "renderJobId required" }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const deadline = Date.now() + 180_000; // 3 min max
      let interval: ReturnType<typeof setInterval> | null = null;

      const poll = async () => {
        try {
          const job = await prisma.renderJob.findUnique({ where: { id: renderJobId } });
          if (!job) { send({ state: "not_found" }); controller.close(); if (interval) clearInterval(interval); return; }

          if (job.status === "done") {
            send({ state: "done", url: job.outputUrl ?? undefined });
            controller.close();
            if (interval) clearInterval(interval);
            return;
          }
          if (job.status === "failed") {
            send({ state: "failed", error: job.error ?? "render failed" });
            controller.close();
            if (interval) clearInterval(interval);
            return;
          }
          if (Date.now() > deadline) {
            send({ state: "timeout" });
            controller.close();
            if (interval) clearInterval(interval);
            return;
          }
          send({ state: job.status ?? "rendering" });
        } catch {
          send({ state: "error" });
          controller.close();
          if (interval) clearInterval(interval);
        }
      };

      await poll();
      interval = setInterval(poll, 3000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
