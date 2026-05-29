import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/google";

interface GoogleCSVRow {
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

function parseGoogleCSV(csv: string): GoogleCSVRow[] {
  const lines = csv.split("\n").filter(Boolean);
  if (lines.length < 2) return [];

  // Parse header — Google CSV uses quoted fields
  function parseLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    result.push(current.trim());
    return result;
  }

  const headers = parseLine(lines[0]);
  const rows: GoogleCSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] ?? ""; });

    // Google Contacts CSV field names
    const firstName = row["Given Name"]?.trim() || row["First Name"]?.trim() || "";
    const lastName = row["Family Name"]?.trim() || row["Last Name"]?.trim() || "";
    const name = row["Name"]?.trim() || `${firstName} ${lastName}`.trim();

    if (!name) continue;

    // Email — try Email 1 - Value, then Email 2 - Value, etc.
    const email = (
      row["E-mail 1 - Value"] || row["Email 1 - Value"] ||
      row["E-mail Address"] || row["Email"]
    )?.trim().toLowerCase() || undefined;

    // Phone — try Phone 1 - Value first
    const rawPhone = (
      row["Phone 1 - Value"] || row["Mobile Phone"] ||
      row["Primary Phone"] || row["Phone"]
    )?.trim() || undefined;
    const phone = rawPhone ? normalizePhone(rawPhone) || undefined : undefined;

    // Notes / org
    const org = row["Organization 1 - Name"]?.trim() || row["Company"]?.trim() || "";
    const title = row["Organization 1 - Title"]?.trim() || row["Job Title"]?.trim() || "";
    const notes = org ? `${org}${title ? ` — ${title}` : ""}` : undefined;

    rows.push({ name, firstName: firstName || undefined, lastName: lastName || undefined, email, phone, notes });
  }

  return rows;
}

export async function POST(req: NextRequest) {
  const { csv } = await req.json() as { csv: string };
  if (!csv) return Response.json({ error: "No CSV content provided" }, { status: 400 });

  const contacts = parseGoogleCSV(csv);
  if (contacts.length === 0) return Response.json({ error: "No contacts found in CSV" }, { status: 400 });

  // Build dedup index from existing leads
  const existingLeads = await prisma.lead.findMany({
    select: { id: true, email: true, phone: true },
  });

  const emailIndex = new Map<string, string>();
  const phoneIndex = new Map<string, string>();
  for (const lead of existingLeads) {
    if (lead.email) emailIndex.set(lead.email.toLowerCase().trim(), lead.id);
    if (lead.phone) phoneIndex.set(normalizePhone(lead.phone), lead.id);
  }

  let created = 0, merged = 0, skipped = 0;

  for (const contact of contacts) {
    const emailKey = contact.email?.toLowerCase();
    const phoneKey = contact.phone ? normalizePhone(contact.phone) : undefined;
    const existingId = (emailKey && emailIndex.get(emailKey)) || (phoneKey && phoneIndex.get(phoneKey));

    if (existingId) {
      const existing = await prisma.lead.findUnique({ where: { id: existingId } });
      if (!existing) { skipped++; continue; }

      const patch: Record<string, unknown> = {};
      if (!existing.email && contact.email) patch.email = contact.email;
      if (!existing.phone && contact.phone) patch.phone = contact.phone;
      if (!existing.firstName && contact.firstName) patch.firstName = contact.firstName;
      if (!existing.lastName && contact.lastName) patch.lastName = contact.lastName;
      if (!existing.notes && contact.notes) patch.notes = contact.notes;

      if (Object.keys(patch).length > 0) {
        await prisma.lead.update({ where: { id: existingId }, data: patch });
        merged++;
      } else {
        skipped++;
      }
      continue;
    }

    try {
      const lead = await prisma.lead.create({
        data: { ...contact, source: "Google Contacts CSV" },
      });
      created++;
      if (contact.email) emailIndex.set(contact.email, lead.id);
      if (contact.phone) phoneIndex.set(normalizePhone(contact.phone), lead.id);
    } catch {
      skipped++;
    }
  }

  await prisma.notification.create({
    data: {
      type: "sync_complete",
      title: "Google Contacts CSV imported",
      body: `${created} imported, ${merged} merged, ${skipped} duplicates skipped`,
      href: "/contacts",
    },
  });

  return Response.json({ ok: true, created, merged, skipped, total: contacts.length });
}
