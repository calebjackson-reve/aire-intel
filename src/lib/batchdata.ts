import { withRetry } from "@/lib/error-memory";
import { prisma } from "@/lib/prisma";

const BASE_URL = "https://api.batchdata.com/api/v1";

export interface SkipTraceResult {
  phones: Array<{ number: string; type: string; confidence: number; doNotCall: boolean }>;
  emails: Array<{ email: string; confidence: number }>;
  currentAddress: string | null;
  relatives: string[];
  employer: string | null;
  rawResponse?: unknown;
}

function headers() {
  const key = process.env.BATCHDATA_API_KEY;
  if (!key) throw new Error("BATCHDATA_API_KEY not set");
  return { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
}

export async function skipTrace(opts: {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
}): Promise<SkipTraceResult> {
  return withRetry(async () => {
    let firstName = opts.firstName;
    let lastName = opts.lastName;
    if (opts.name && !firstName) {
      const parts = opts.name.trim().split(" ");
      firstName = parts[0];
      lastName = parts.slice(1).join(" ") || undefined;
    }

    // Build request — address is nested object for BatchData v1
    const request: Record<string, unknown> = { firstName, lastName };
    if (opts.email) request.email = opts.email;
    if (opts.phone) request.phone = opts.phone;
    if (opts.address) {
      request.address = {
        street: opts.address,
        city: opts.city,
        state: opts.state ?? "LA",
        zip: opts.zip,
      };
    }

    const res = await fetch(`${BASE_URL}/property/skip-trace`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ requests: [request] }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`BatchData skip trace failed: ${res.status} — ${err}`);
    }

    const data = await res.json();
    const result = data.results?.[0]?.result ?? data.results?.[0];
    if (!result) return { phones: [], emails: [], currentAddress: null, relatives: [], employer: null };

    return {
      phones: (result.phones ?? result.phoneNumbers ?? []).map((p: Record<string, unknown>) => ({
        number: (p.phoneNumber ?? p.number) as string,
        type: ((p.phoneType ?? p.type) as string) ?? "unknown",
        confidence: (p.confidence as number) ?? 0,
        doNotCall: Boolean(p.doNotCall),
      })),
      emails: (result.emails ?? result.emailAddresses ?? []).map((e: Record<string, unknown>) => ({
        email: (e.emailAddress ?? e.email) as string,
        confidence: (e.confidence as number) ?? 0,
      })),
      currentAddress: result.currentAddress?.fullAddress ?? result.address?.fullAddress ?? null,
      relatives: (result.relatives ?? result.associatedPeople ?? []).map((r: Record<string, unknown>) => (r.fullName ?? r.name) as string).filter(Boolean),
      employer: result.employments?.[0]?.employer ?? result.employment?.company ?? null,
      rawResponse: result,
    };
  }, { maxAttempts: 2, source: "batchdata.skipTrace", type: "api_failure" });
}

// Enriches a Lead record in-place — updates phone/email if missing or stale
export async function enrichLead(leadId: string): Promise<{ updated: boolean; fieldsUpdated: string[] }> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { updated: false, fieldsUpdated: [] };

  const result = await skipTrace({
    name: lead.name,
    address: (lead as unknown as Record<string, string>).siteAddress ?? undefined,
    email: lead.email ?? undefined,
    phone: lead.phone ?? undefined,
  });

  const updates: Record<string, string> = {};

  // Only update phone if current one looks like a placeholder or is missing
  const bestPhone = result.phones.find(p => !p.doNotCall && p.confidence > 60);
  if (bestPhone && (!lead.phone || lead.phone.startsWith("555") || lead.phone.length < 10)) {
    updates.phone = bestPhone.number;
  }

  // Only update email if missing
  const bestEmail = result.emails.find(e => e.confidence > 60);
  if (bestEmail && !lead.email) {
    updates.email = bestEmail.email;
  }

  if (Object.keys(updates).length === 0) return { updated: false, fieldsUpdated: [] };

  await prisma.lead.update({ where: { id: leadId }, data: updates });

  // Log the enrichment
  await prisma.contactLog.create({
    data: {
      leadId,
      method: "note",
      direction: "inbound",
      note: `Skip trace enrichment: updated ${Object.keys(updates).join(", ")} via BatchData`,
    },
  });

  return { updated: true, fieldsUpdated: Object.keys(updates) };
}
