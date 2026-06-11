export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { sendMessengerMessage } from "@/lib/messenger";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-memory";

export async function POST(req: NextRequest) {
  const { leadId, psid, message } = await req.json();
  if (!leadId || !psid || !message) {
    return Response.json({ error: "leadId, psid, and message required" }, { status: 400 });
  }
  try {
    const result = await sendMessengerMessage(psid, message);
    await prisma.contactLog.create({
      data: {
        leadId,
        method: "messenger",
        note: message,
        direction: "outbound",
      },
    });
    await prisma.lead.update({ where: { id: leadId }, data: { lastContactDate: new Date() } });
    return Response.json({ ok: true, messageId: result.messageId });
  } catch (err) {
    logError("api_failure", "api/contacts/messenger-send", err as Error);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
