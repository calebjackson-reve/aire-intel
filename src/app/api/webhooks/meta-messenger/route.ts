import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMessengerProfile } from "@/lib/messenger";
import { handleInboundReply } from "@/lib/inbound-reply";
import { logError } from "@/lib/error-memory";

// GET — Meta webhook verification handshake.
// In Meta App Dashboard → Webhooks, set:
//   Callback URL: https://your-domain.com/api/webhooks/meta-messenger
//   Verify Token: value of META_MESSENGER_VERIFY_TOKEN in .env
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const verifyToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expected = process.env.META_MESSENGER_VERIFY_TOKEN;
  if (mode === "subscribe" && verifyToken === expected && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// POST — receive inbound Messenger messages from Meta.
// Meta retries delivery 3× on non-200. Always respond 200 quickly,
// then process async.
export async function POST(req: NextRequest) {
  let body: MessengerWebhookBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (body.object !== "page") {
    return Response.json({ ok: true });
  }

  // Process async — Meta expects 200 within 20s
  void processEntries(body.entry ?? []);

  return Response.json({ ok: true });
}

async function processEntries(entries: MessengerEntry[]) {
  for (const entry of entries) {
    for (const event of entry.messaging ?? []) {
      // Skip echoes (our own outbound messages)
      if (!event.message || event.message.is_echo) continue;

      const psid = event.sender.id;
      const text = event.message.text;
      if (!text?.trim()) continue;

      try {
        await handleMessengerInbound(psid, text.trim());
      } catch (err) {
        await logError("meta", "meta-messenger-webhook", err, { psid });
      }
    }
  }
}

async function handleMessengerInbound(psid: string, text: string) {
  const messengerTag = `messenger:${psid}`;

  // Look for an existing lead tagged with this PSID
  let lead = await prisma.lead.findFirst({
    where: { tags: { contains: messengerTag } },
    select: { id: true, name: true, stage: true, phone: true, email: true },
  });

  // Create a new lead if none found — fetch their name from Meta
  if (!lead) {
    let name = "Facebook Contact";
    let firstName = "Facebook";
    let lastName = "Contact";

    try {
      const profile = await getMessengerProfile(psid);
      name = profile.name;
      firstName = profile.firstName;
      lastName = profile.lastName;
    } catch {
      // Profile fetch may fail if user restricted their info — proceed with defaults
    }

    const created = await prisma.lead.create({
      data: {
        name,
        firstName,
        lastName,
        source: "facebook_messenger",
        tags: messengerTag,
        stage: "new_lead",
        lastContactDate: new Date(),
      },
    });
    lead = { id: created.id, name: created.name, stage: created.stage, phone: created.phone ?? null, email: created.email ?? null };
  }

  // Wire into the existing inbound reply pipeline
  await handleInboundReply({
    leadId: lead.id,
    content: text,
    channel: "text",
    method: "facebook_messenger",
  });
}

// ── Webhook payload types ─────────────────────────────────────────────────────

interface MessengerWebhookBody {
  object: string;
  entry?: MessengerEntry[];
}

interface MessengerEntry {
  id: string;
  time: number;
  messaging?: MessengerEvent[];
}

interface MessengerEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
  };
}
