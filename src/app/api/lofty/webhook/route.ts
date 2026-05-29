import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { mapLoftyLeadToAire } from "@/lib/lofty";

// Lofty posts events here when leads are created/updated
// Register this URL in Lofty: Settings > Integrations > Webhooks
// URL: https://your-domain.com/api/lofty/webhook

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { event, lead: ll } = body;

  if (!ll?.id) {
    return Response.json({ ok: false, error: "No lead in payload" }, { status: 400 });
  }

  const data = mapLoftyLeadToAire(ll);

  try {
    const existing = await prisma.lead.findUnique({ where: { loftyId: data.loftyId } });

    if (existing) {
      await prisma.lead.update({ where: { id: existing.id }, data });
    } else {
      await prisma.lead.create({ data });
    }

    return Response.json({ ok: true, event, loftyId: data.loftyId });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// Lofty may send a GET to verify the webhook URL
export async function GET() {
  return Response.json({ ok: true, service: "AIRE Lofty webhook receiver" });
}
