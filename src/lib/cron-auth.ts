export function verifyCronSecret(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
}

export function cronUnauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
