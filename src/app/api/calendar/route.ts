import { fetchUpcomingEvents } from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const tokenRow = await prisma.setting.findUnique({ where: { key: "GOOGLE_REFRESH_TOKEN" } }).catch(() => null);
  const connected = !!tokenRow?.value;

  if (!connected) return Response.json({ connected: false, events: [] });

  const events = await fetchUpcomingEvents(7).catch(() => []);
  return Response.json({ connected: true, events });
}
