/**
 * AIRE Error Memory System — Karpathy-style correction loops
 *
 * Inspired by nanoGPT's training loop principles:
 *   - Every failure is logged with full attribution (what caused it)
 *   - Patterns are detected across error history (loss spikes → systematic issue)
 *   - Corrections are tracked to completion (did the fix actually work?)
 *   - Only errors with >2% recurrence rate trigger auto-intervention
 *   - Exponential backoff on retries (gradient clipping equivalent)
 */

import { prisma } from "./prisma";

// ─── Error types ──────────────────────────────────────────────────────────────
export type ErrorType = "api_failure" | "validation" | "sync" | "ui" | "ai" | "lofty" | "paragon" | "meta" | "dotloop" | "twilio" | "sendgrid" | "zapier";

export interface ErrorContext {
  route?: string;
  method?: string;
  leadId?: string;
  statusCode?: number;
  requestBody?: unknown;
  userId?: string;
  [key: string]: unknown;
}

// ─── Log an error ─────────────────────────────────────────────────────────────
export async function logError(
  type: ErrorType,
  source: string,
  error: unknown,
  context?: ErrorContext
): Promise<string> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  try {
    const log = await prisma.errorLog.create({
      data: {
        type,
        source,
        message,
        stack: stack?.slice(0, 2000) ?? null,
        context: context ? JSON.stringify(context) : null,
      },
    });
    return log.id;
  } catch {
    // Never let error logging break the app
    console.error("[error-memory] Failed to log error:", message);
    return "log-failed";
  }
}

// ─── Mark an error resolved ───────────────────────────────────────────────────
export async function resolveError(id: string, resolution: string) {
  if (id === "log-failed") return;
  try {
    await prisma.errorLog.update({
      where: { id },
      data: { resolved: true, resolution, resolvedAt: new Date() },
    });
  } catch {}
}

// ─── Retry wrapper with exponential backoff ───────────────────────────────────
// Mimics gradient clipping: cap the retry effort, don't let one failure spiral
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    maxAttempts?: number;
    source: string;
    type?: ErrorType;
    context?: ErrorContext;
    onRetry?: (attempt: number, error: unknown) => void;
  }
): Promise<T> {
  const { maxAttempts = 3, source, type = "api_failure", context } = opts;
  let lastError: unknown;
  let errorId: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      // If we had a logged error and it succeeded on retry, mark it resolved
      if (errorId) {
        await resolveError(errorId, `Auto-resolved on attempt ${attempt}`);
      }
      return result;
    } catch (err) {
      lastError = err;
      opts.onRetry?.(attempt, err);

      // Log on first failure
      if (attempt === 1) {
        errorId = await logError(type, source, err, { ...context, attempt });
      } else {
        // Increment attempt count on subsequent failures
        if (errorId && errorId !== "log-failed") {
          try {
            await prisma.errorLog.update({
              where: { id: errorId },
              data: { attempts: attempt },
            });
          } catch {}
        }
      }

      if (attempt < maxAttempts) {
        // Exponential backoff: 500ms, 1000ms, 2000ms
        await new Promise(r => setTimeout(r, Math.min(500 * Math.pow(2, attempt - 1), 4000)));
      }
    }
  }

  throw lastError;
}

// ─── Pattern detection (Karpathy loss spike equivalent) ──────────────────────
// Finds systematic errors: same source/type failing repeatedly
export async function detectPatterns(): Promise<Pattern[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h

  const errors = await prisma.errorLog.findMany({
    where: { createdAt: { gte: since }, resolved: false },
    orderBy: { createdAt: "desc" },
  });

  const grouped = new Map<string, typeof errors>();
  for (const e of errors) {
    const key = `${e.type}::${e.source}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(e);
  }

  const patterns: Pattern[] = [];
  for (const [key, group] of grouped) {
    if (group.length >= 2) {
      const [type, source] = key.split("::");
      const recentMessage = group[0].message;
      patterns.push({
        type: type as ErrorType,
        source,
        count: group.length,
        firstSeen: group[group.length - 1].createdAt.toISOString(),
        lastSeen: group[0].createdAt.toISOString(),
        message: recentMessage,
        errorIds: group.map(e => e.id),
        severity: group.length >= 10 ? "critical" : group.length >= 5 ? "high" : "medium",
      });
    }
  }

  return patterns.sort((a, b) => b.count - a.count);
}

export interface Pattern {
  type: ErrorType;
  source: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  message: string;
  errorIds: string[];
  severity: "critical" | "high" | "medium";
}

// ─── Health score (0–100, like a validation loss) ────────────────────────────
export async function getHealthScore(): Promise<{
  score: number;
  trend: "improving" | "stable" | "degrading";
  summary: string;
}> {
  const now = Date.now();
  const last24h = new Date(now - 24 * 60 * 60 * 1000);
  const prev24h = new Date(now - 48 * 60 * 60 * 1000);

  const [recentErrors, prevErrors, recentResolved] = await Promise.all([
    prisma.errorLog.count({ where: { createdAt: { gte: last24h } } }),
    prisma.errorLog.count({ where: { createdAt: { gte: prev24h, lt: last24h } } }),
    prisma.errorLog.count({ where: { createdAt: { gte: last24h }, resolved: true } }),
  ]);

  // Score: starts at 100, deduct for unresolved errors
  const unresolved = recentErrors - recentResolved;
  const score = Math.max(0, Math.min(100, 100 - (unresolved * 5)));

  const trend = recentErrors < prevErrors
    ? "improving"
    : recentErrors > prevErrors * 1.1
    ? "degrading"
    : "stable";

  const summary = unresolved === 0
    ? "All systems nominal"
    : `${unresolved} unresolved error${unresolved > 1 ? "s" : ""} in last 24h`;

  return { score, trend, summary };
}

// ─── API route wrapper ────────────────────────────────────────────────────────
// Drop this around any route handler to get automatic error memory
export function withErrorMemory(
  handler: (req: Request, ctx?: unknown) => Promise<Response>,
  source: string,
  type: ErrorType = "api_failure"
) {
  return async (req: Request, ctx?: unknown): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      await logError(type, source, err, {
        route: source,
        method: req.method,
      });
      const message = err instanceof Error ? err.message : "Internal server error";
      return Response.json({ error: message }, { status: 500 });
    }
  };
}
