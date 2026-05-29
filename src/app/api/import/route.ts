import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// Maps Lofty CSV column names → our Lead fields
const LOFTY_MAP: Record<string, string> = {
  "First Name": "firstName",
  "Last Name": "lastName",
  "Email": "email",
  "Phone": "phone",
  "Mobile": "phone",
  "Stage": "stage",
  "Source": "source",
  "Tags": "tags",
  "Notes": "notes",
  "Address": "address",
  "Assigned To": "assignedTo",
  "Lead ID": "loftyId",
  "Contact ID": "loftyId",
  "Budget Min": "priceMin",
  "Budget Max": "priceMax",
  "Price": "pricePoint",
  "Timeline": "timeline",
  "Type": "type",
  "Referred By": "referredBy",
};

const STAGE_MAP: Record<string, string> = {
  "New": "new_lead",
  "New Lead": "new_lead",
  "Active": "active",
  "Active Buyer": "active",
  "Active Seller": "active",
  "Showing": "showing",
  "Under Contract": "under_contract",
  "Closed": "closed",
  "Past Client": "closed",
  "Nurture": "active",
  "Hot": "active",
  "Warm": "active",
  "Cold": "new_lead",
};

export async function POST(request: NextRequest) {
  const { rows } = await request.json() as { rows: Record<string, string>[] };

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const data: Record<string, unknown> = {};

    for (const [csvCol, value] of Object.entries(row)) {
      const field = LOFTY_MAP[csvCol];
      if (!field || !value?.trim()) continue;

      if (field === "stage") {
        data[field] = STAGE_MAP[value.trim()] ?? "new_lead";
      } else if (field === "priceMin" || field === "priceMax" || field === "pricePoint") {
        const num = parseFloat(value.replace(/[$,]/g, ""));
        if (!isNaN(num)) data[field] = num;
      } else {
        data[field] = value.trim();
      }
    }

    // Build full name
    const first = (data.firstName as string) || "";
    const last = (data.lastName as string) || "";
    data.name = `${first} ${last}`.trim() || "Unknown";

    if (!data.name || data.name === "Unknown") { skipped++; continue; }

    try {
      if (data.loftyId) {
        const existing = await prisma.lead.findUnique({ where: { loftyId: data.loftyId as string } });
        if (existing) {
          await prisma.lead.update({ where: { id: existing.id }, data });
          updated++;
          continue;
        }
      }
      await prisma.lead.create({ data: data as Parameters<typeof prisma.lead.create>[0]["data"] });
      created++;
    } catch {
      skipped++;
    }
  }

  return Response.json({ created, updated, skipped, total: rows.length });
}
