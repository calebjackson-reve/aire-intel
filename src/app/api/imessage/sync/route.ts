export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const BRIDGE_SECRET = process.env.AIRE_BRIDGE_SECRET || "";

// Normalize phone → E.164 best-effort (+12255551234)
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return raw.replace(/\s/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw; // keep as-is if we can't normalize
}

interface SyncMessage {
  guid: string;
  body: string;
  phone: string;
  displayName?: string;
  direction: "inbound" | "outbound";
  sentAt: string; // ISO string
}

// POST /api/imessage/sync — called by local bridge script on Caleb's Mac
export async function POST(req: NextRequest) {
  // Verify shared secret
  const auth = req.headers.get("x-bridge-secret") || "";
  if (BRIDGE_SECRET && auth !== BRIDGE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messages }: { messages: SyncMessage[] } = await req.json();
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ synced: 0 });
  }

  // Group messages by phone
  const byPhone = new Map<string, SyncMessage[]>();
  for (const msg of messages) {
    const phone = normalizePhone(msg.phone);
    if (!byPhone.has(phone)) byPhone.set(phone, []);
    byPhone.get(phone)!.push({ ...msg, phone });
  }

  let synced = 0;
  let threadsUpserted = 0;

  for (const [phone, msgs] of byPhone) {
    // Sort ascending so lastBody/lastAt reflect the actual latest
    msgs.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
    const latest = msgs[msgs.length - 1];

    // Try to match an existing Lead by phone
    const lead = await prisma.lead.findFirst({
      where: { phone: { contains: phone.replace(/\D/g, "").slice(-10) } },
      select: { id: true },
    });

    // Upsert the thread
    const thread = await prisma.iMessageThread.upsert({
      where: { phone },
      create: {
        phone,
        displayName: msgs[0].displayName || null,
        leadId: lead?.id || null,
        lastBody: latest.body.slice(0, 200),
        lastAt: new Date(latest.sentAt),
        needsReply: latest.direction === "inbound",
      },
      update: {
        displayName: msgs[0].displayName || undefined,
        leadId: lead?.id || undefined,
        lastBody: latest.body.slice(0, 200),
        lastAt: new Date(latest.sentAt),
        needsReply: latest.direction === "inbound",
      },
    });
    threadsUpserted++;

    // Upsert each message
    for (const msg of msgs) {
      try {
        await prisma.iMessageMessage.upsert({
          where: { guid: msg.guid },
          create: {
            threadId: thread.id,
            guid: msg.guid,
            body: msg.body,
            direction: msg.direction,
            sentAt: new Date(msg.sentAt),
          },
          update: {}, // GUID is immutable — no updates needed
        });
        synced++;

        // Mirror inbound messages to ContactLog if we have a matched lead
        if (lead && msg.direction === "inbound") {
          await prisma.contactLog.upsert({
            where: { externalId: `imessage:${msg.guid}` },
            create: {
              leadId: lead.id,
              method: "text",
              platform: "imessage",
              note: msg.body.slice(0, 500),
              direction: "inbound",
              externalId: `imessage:${msg.guid}`,
              touchedAt: new Date(msg.sentAt),
            },
            update: {},
          });
        }
      } catch {
        // Duplicate GUID — skip silently
      }
    }

    // Update lead's lastContactDate if matched
    if (lead) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { lastContactDate: new Date(latest.sentAt) },
      });
    }
  }

  return NextResponse.json({ synced, threadsUpserted });
}
