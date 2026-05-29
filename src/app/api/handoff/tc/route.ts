import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTeamConfig } from "@/lib/settings";

/**
 * Transaction Coordinator handoff.
 *
 * The TC is one of two people Caleb delegates to. When a deal goes under
 * contract, the TC needs a clean, structured packet — not a forwarded chain
 * of texts. This endpoint generates that packet on demand.
 *
 * GET  → list of under-contract leads with their handoff status
 * POST → for a given leadId, build the packet, return mailto-ready data,
 *        log the handoff to the lead timeline
 */

interface TCPacket {
  to: string | null;
  subject: string;
  body: string;
}

export async function GET() {
  const team = await getTeamConfig();
  const leads = await prisma.lead.findMany({
    where: { stage: "under_contract" },
    include: {
      timeline_logs: {
        where: { method: "tc_handoff" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { nextActionDate: "asc" },
  });

  return Response.json({
    team,
    deals: leads.map((l) => ({
      id: l.id,
      name: l.name,
      address: l.address,
      pricePoint: l.pricePoint,
      nextActionDate: l.nextActionDate,
      nextActionNote: l.nextActionNote,
      handoffSentAt: l.timeline_logs[0]?.createdAt ?? null,
    })),
  });
}

export async function POST(request: NextRequest) {
  const { leadId } = await request.json();
  const team = await getTeamConfig();

  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { timeline_logs: { orderBy: { createdAt: "desc" }, take: 10 } },
  });

  const packet = buildPacket(lead, team.tc);

  // Log to timeline so the deal shows "handed off" in the UI
  await prisma.contactLog.create({
    data: {
      leadId,
      method: "tc_handoff",
      note: `TC packet sent${team.tc.email ? ` to ${team.tc.email}` : ""}`,
      direction: "outbound",
    },
  });

  return Response.json({
    packet,
    lead: { id: lead.id, name: lead.name },
    handoffLogged: true,
  });
}

function buildPacket(
  lead: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    pricePoint: number | null;
    type: string;
    nextActionDate: Date | null;
    nextActionNote: string | null;
    notes: string | null;
    timeline_logs: Array<{ method: string; note: string | null; createdAt: Date }>;
  },
  tc: { name: string | null; email: string | null },
): TCPacket {
  const side = lead.type === "seller" ? "Listing side" : lead.type === "buyer" ? "Buyer side" : "Dual/TBD";
  const price = lead.pricePoint ? `$${lead.pricePoint.toLocaleString()}` : "TBD";
  const close = lead.nextActionDate
    ? new Date(lead.nextActionDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "TBD";

  // Pull recent notes that look like lender/title/inspection info
  const relevantLogs = lead.timeline_logs
    .filter((t) => /lender|title|inspect|appraisal|loan|closing/i.test(t.note ?? ""))
    .slice(0, 5);

  const lines: string[] = [];
  lines.push(`Hey${tc.name ? ` ${tc.name.split(" ")[0]}` : ""} — new one for you. Details below.`);
  lines.push("");
  lines.push("CLIENT");
  lines.push(`  ${lead.name}`);
  if (lead.phone) lines.push(`  ${lead.phone}`);
  if (lead.email) lines.push(`  ${lead.email}`);
  lines.push("");
  lines.push("PROPERTY");
  lines.push(`  ${lead.address ?? "Address TBD — will follow up"}`);
  lines.push("");
  lines.push("CONTRACT");
  lines.push(`  Side: ${side}`);
  lines.push(`  Sale price: ${price}`);
  lines.push(`  Target close: ${close}`);
  lines.push("");
  if (lead.nextActionNote) {
    lines.push("DEADLINES / NEXT");
    lines.push(`  ${lead.nextActionNote}`);
    lines.push("");
  }
  if (relevantLogs.length > 0) {
    lines.push("RECENT NOTES (lender/title/inspection)");
    relevantLogs.forEach((t) => {
      const date = new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      lines.push(`  ${date} — ${t.note}`);
    });
    lines.push("");
  }
  if (lead.notes) {
    lines.push("NOTES");
    lines.push(`  ${lead.notes.slice(0, 500)}`);
    lines.push("");
  }
  lines.push("Holler with what else you need. Forward me anything client-facing before it goes out.");
  lines.push("");
  lines.push("— Caleb");

  return {
    to: tc.email,
    subject: `Under contract — ${lead.address ?? lead.name}`,
    body: lines.join("\n"),
  };
}
