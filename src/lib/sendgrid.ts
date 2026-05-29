import { prisma } from "./prisma";

export interface SendGridConfig {
  apiKey: string;
  fromEmail: string;
}

async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } }).catch(() => null);
  return row?.value || process.env[key] || null;
}

export async function getSendGridConfig(): Promise<SendGridConfig | null> {
  const [apiKey, fromEmail] = await Promise.all([
    getSetting("SENDGRID_API_KEY"),
    getSetting("SENDGRID_FROM_EMAIL"),
  ]);
  if (!apiKey || !fromEmail) return null;
  return { apiKey, fromEmail };
}

export async function sendEmail(
  { to, subject, body, config }: { to: string; subject: string; body: string; config: SendGridConfig }
): Promise<{ ok: boolean; messageId?: string }> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: config.fromEmail },
      subject,
      content: [{ type: "text/plain", value: body }],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`SendGrid error ${res.status}: ${err}`);
  }

  const messageId = res.headers.get("X-Message-Id") ?? undefined;
  return { ok: true, messageId };
}
