export function verifyCronSecret(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
}

/**
 * Guard for agent/cron route GET handlers.
 *
 * Vercel Cron invokes scheduled functions with `GET` and an
 * `Authorization: Bearer $CRON_SECRET` header. Internal server-to-server
 * calls (e.g. brief-delivery → /api/push/send, or the authenticated
 * /api/agents/trigger proxy) use the same secret. This accepts both, so we
 * can lock down the previously wide-open GET handlers without breaking cron.
 *
 * Pass the Request (not the header) so call sites stay uniform.
 */
export function verifyCronOrInternal(req: Request): boolean {
  return verifyCronSecret(req.headers.get("authorization"));
}

export function cronUnauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
