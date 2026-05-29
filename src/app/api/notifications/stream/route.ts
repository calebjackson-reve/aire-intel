import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// Opt out of any caching — this route must execute per-request and stream.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Server-side poll cadence — how often we hit the DB for new rows.
const POLL_INTERVAL_MS = 2000;
// Keepalive comment cadence — proxies/load balancers tend to time out idle
// connections around 30–60s. 25s is the conventional safe value.
const KEEPALIVE_INTERVAL_MS = 25_000;

const encoder = new TextEncoder();

function sseEvent(event: string | null, data: unknown): Uint8Array {
  const json = typeof data === "string" ? data : JSON.stringify(data);
  const prefix = event ? `event: ${event}\n` : "";
  return encoder.encode(`${prefix}data: ${json}\n\n`);
}

function sseComment(text: string): Uint8Array {
  return encoder.encode(`:${text}\n\n`);
}

export async function GET(request: NextRequest) {
  // Capture an initial high-water mark so the first poll only emits rows
  // created AFTER the client connected. The client already has anything
  // older via its initial REST fetch.
  const initial = await prisma.notification.findFirst({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, id: true },
  });
  let lastSeenAt: Date = initial?.createdAt ?? new Date(0);
  let lastSeenId: string | null = initial?.id ?? null;

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          // controller already closed (client went away mid-write)
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (pollTimer) clearInterval(pollTimer);
        if (keepaliveTimer) clearInterval(keepaliveTimer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // Detect client disconnect via request signal.
      request.signal.addEventListener("abort", cleanup);

      // 1) Initial probe so the client knows the stream is alive.
      safeEnqueue(sseEvent("connected", { ok: true, ts: Date.now() }));

      // Also push the current unread count up front so the badge stays in
      // sync even if the client missed something between its REST fetch and
      // stream open.
      try {
        const unreadCount = await prisma.notification.count({
          where: { read: false },
        });
        safeEnqueue(sseEvent("unread", { unreadCount }));
      } catch {
        /* non-fatal */
      }

      // 2) DB poll loop — emit any rows newer than lastSeenAt.
      const tick = async () => {
        if (closed) return;
        try {
          const fresh = await prisma.notification.findMany({
            where: { createdAt: { gt: lastSeenAt } },
            orderBy: { createdAt: "asc" },
            take: 25,
          });
          if (fresh.length > 0) {
            for (const n of fresh) {
              // Defensive: skip if it's literally the same row we already
              // emitted (clock skew / identical timestamps).
              if (n.id === lastSeenId) continue;
              safeEnqueue(sseEvent(null, { notification: n }));
              lastSeenAt = n.createdAt;
              lastSeenId = n.id;
            }
            const unreadCount = await prisma.notification.count({
              where: { read: false },
            });
            safeEnqueue(sseEvent("unread", { unreadCount }));
          }
        } catch (err) {
          // Surface DB errors as a stream event so the client can fall back.
          safeEnqueue(
            sseEvent("error", {
              message: err instanceof Error ? err.message : "poll_failed",
            })
          );
        }
      };

      pollTimer = setInterval(tick, POLL_INTERVAL_MS);

      // 3) Keepalive comments — invisible to EventSource consumers but keep
      // intermediaries from closing the connection.
      keepaliveTimer = setInterval(() => {
        safeEnqueue(sseComment("keepalive"));
      }, KEEPALIVE_INTERVAL_MS);
    },

    cancel() {
      // Triggered when the client closes the EventSource or navigates away.
      closed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (keepaliveTimer) clearInterval(keepaliveTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (nginx, etc.) so events flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
