export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { enrichLead, skipTrace } from "@/lib/batchdata";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!process.env.BATCHDATA_API_KEY) {
    return Response.json({ error: "BATCHDATA_API_KEY not configured" }, { status: 503 });
  }

  // Pull latest lead data for the trace
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) return Response.json({ error: "Lead not found" }, { status: 404 });

  try {
    // Run raw trace so we can return full results to UI
    const result = await skipTrace({
      name: lead.name,
      email: lead.email ?? undefined,
      phone: lead.phone ?? undefined,
    });

    // Also enrich (writes to DB if fields are missing)
    const { updated, fieldsUpdated } = await enrichLead(id);

    return Response.json({
      ok: true,
      updated,
      fieldsUpdated,
      phones: result.phones,
      emails: result.emails,
      currentAddress: result.currentAddress,
      relatives: result.relatives,
      employer: result.employer,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Insufficient balance is a known graceful failure
    if (msg.includes("Insufficient balance")) {
      return Response.json({ error: "BatchData has no credits — add funds at app.batchdata.com", code: "NO_CREDITS" }, { status: 402 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}
