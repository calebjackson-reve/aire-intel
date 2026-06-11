export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { getSendGridConfig, sendEmail } from "@/lib/sendgrid";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { leadId, to, subject, message } = await req.json() as { leadId: string; to: string; subject: string; message: string };

  if (!to || !subject || !message) return Response.json({ error: "to, subject, and message are required" }, { status: 400 });

  const config = await getSendGridConfig();
  if (!config) return Response.json({ error: "SendGrid not configured. Add credentials in Settings." }, { status: 503 });

  try {
    const result = await sendEmail({ to, subject, body: message, config });

    if (leadId) {
      await prisma.contactLog.create({
        data: { leadId, method: "email", note: `Subject: ${subject}\n\n${message}`, direction: "outbound" },
      }).catch(() => {});
    }

    return Response.json({ ok: true, messageId: result.messageId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Email failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  const config = await getSendGridConfig();
  return Response.json({ connected: !!config });
}
