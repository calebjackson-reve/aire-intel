export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTeamConfig } from "@/lib/settings";

/**
 * Showing Assistant handoff.
 *
 * When a buyer wants to see a property, Caleb texts the showing assistant
 * with: property address, time, buyer name + price range, lockbox / access
 * notes. This endpoint builds that message in one click.
 *
 * POST → { leadId, address, time, accessNotes? }
 *        Returns SMS-ready body + tel link
 */

export async function POST(request: NextRequest) {
  const { leadId, address, time, accessNotes } = await request.json();
  const team = await getTeamConfig();

  const lead = leadId
    ? await prisma.lead.findUnique({ where: { id: leadId } })
    : null;

  const lines: string[] = [];
  const saName = team.showingAssistant.name?.split(" ")[0];
  lines.push(`${saName ?? "Hey"} — can you show this?`);
  lines.push("");
  lines.push(`Property: ${address}`);
  if (time) lines.push(`When: ${time}`);
  if (lead) {
    lines.push(`Buyer: ${lead.name}${lead.phone ? ` (${lead.phone})` : ""}`);
    if (lead.priceMin || lead.priceMax) {
      const range = `${lead.priceMin ? `$${lead.priceMin.toLocaleString()}` : "?"}–${lead.priceMax ? `$${lead.priceMax.toLocaleString()}` : "?"}`;
      lines.push(`Range: ${range}`);
    }
    if (lead.motivation) lines.push(`Motivation: ${lead.motivation.slice(0, 100)}`);
  }
  if (accessNotes) {
    lines.push("");
    lines.push(`Access: ${accessNotes}`);
  }
  lines.push("");
  lines.push("Thx — text me after.");

  const body = lines.join("\n");

  // Log to timeline if a lead is involved
  if (leadId) {
    await prisma.contactLog.create({
      data: {
        leadId,
        method: "showing_request",
        note: `Showing requested for ${address}${time ? ` at ${time}` : ""}`,
        direction: "outbound",
      },
    }).catch(() => {});
  }

  return Response.json({
    to: team.showingAssistant.phone,
    toEmail: team.showingAssistant.email,
    name: team.showingAssistant.name,
    body,
    configured: team.showingAssistant.configured,
  });
}
