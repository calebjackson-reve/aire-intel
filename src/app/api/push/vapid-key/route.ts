export const dynamic = "force-dynamic";
// GET /api/push/vapid-key — returns the VAPID public key for client-side subscription
export function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? null;
  return Response.json({ publicKey });
}
