import { NextRequest } from "next/server";
import { getTwilioConfig, sendSMS, normalizePhone } from "@/lib/twilio";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { leadId, to, message } = await req.json() as { leadId: string; to: string; message: string };

  if (!to || !message) return Response.json({ error: "to and message are required" }, { status: 400 });

  const config = await getTwilioConfig();
  if (!config) return Response.json({ error: "Twilio not configured. Add credentials in Settings." }, { status: 503 });

  try {
    const result = await sendSMS(normalizePhone(to), message, config);

    if (leadId) {
      await prisma.contactLog.create({
        data: { leadId, method: "text", note: message, direction: "outbound" },
      }).catch(() => {});
    }

    return Response.json({ ok: true, sid: result.sid, status: result.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "SMS failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  const config = await getTwilioConfig();
  return Response.json({ connected: !!config });
}
