import { prisma } from "@/lib/prisma";
import { getValidGoogleToken, fetchAllGoogleContacts, mapGoogleContact, normalizePhone } from "@/lib/google";

export async function POST() {
  const token = await getValidGoogleToken();
  if (!token) {
    return Response.json({ error: "Google not connected. Connect via Settings first." }, { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

      try {
        send({ status: "fetching", message: "Connecting to Google Contacts..." });

        const googleContacts = await fetchAllGoogleContacts(token);
        send({ status: "fetching", message: `Found ${googleContacts.length} Google contacts. Deduplicating...` });

        // Load existing leads for dedup — email + phone index
        const existingLeads = await prisma.lead.findMany({
          select: { id: true, email: true, phone: true, name: true },
        });

        const emailIndex = new Map<string, string>(); // email → lead id
        const phoneIndex = new Map<string, string>(); // normalized phone → lead id

        for (const lead of existingLeads) {
          if (lead.email) emailIndex.set(lead.email.toLowerCase().trim(), lead.id);
          if (lead.phone) phoneIndex.set(normalizePhone(lead.phone), lead.id);
        }

        let created = 0, skipped = 0, merged = 0;

        for (const gc of googleContacts) {
          const mapped = mapGoogleContact(gc);
          if (!mapped.name || mapped.name === "Unknown") { skipped++; continue; }

          // Dedup: email first, then phone
          const emailKey = mapped.email?.toLowerCase();
          const phoneKey = mapped.phone ? normalizePhone(mapped.phone) : undefined;

          const existingId = (emailKey && emailIndex.get(emailKey)) || (phoneKey && phoneIndex.get(phoneKey));

          if (existingId) {
            // Merge — only fill in missing fields, never overwrite existing data
            const existing = await prisma.lead.findUnique({ where: { id: existingId } });
            if (!existing) { skipped++; continue; }

            const patch: Record<string, unknown> = {};
            if (!existing.email && mapped.email) patch.email = mapped.email;
            if (!existing.phone && mapped.phone) patch.phone = mapped.phone;
            if (!existing.firstName && mapped.firstName) patch.firstName = mapped.firstName;
            if (!existing.lastName && mapped.lastName) patch.lastName = mapped.lastName;
            if (!existing.notes && mapped.notes) patch.notes = mapped.notes;

            if (Object.keys(patch).length > 0) {
              await prisma.lead.update({ where: { id: existingId }, data: patch });
              merged++;
            } else {
              skipped++;
            }
            continue;
          }

          // New contact — create
          try {
            const lead = await prisma.lead.create({ data: mapped });
            created++;
            if (mapped.email) emailIndex.set(mapped.email, lead.id);
            if (mapped.phone) phoneIndex.set(normalizePhone(mapped.phone), lead.id);
          } catch {
            skipped++;
          }
        }

        await prisma.notification.create({
          data: {
            type: "sync_complete",
            title: "Google Contacts synced",
            body: `${created} imported, ${merged} merged with existing, ${skipped} duplicates skipped`,
            href: "/contacts",
          },
        });

        send({ status: "done", message: "Sync complete.", created, merged, skipped, total: googleContacts.length });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        send({ status: "error", message: msg });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

export async function GET() {
  const tokenRow = await prisma.setting.findUnique({ where: { key: "GOOGLE_REFRESH_TOKEN" } });
  return Response.json({ connected: !!tokenRow?.value });
}
