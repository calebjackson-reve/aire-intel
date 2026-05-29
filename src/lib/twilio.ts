import { prisma } from "./prisma";

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromPhone: string;
}

async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } }).catch(() => null);
  return row?.value || process.env[key] || null;
}

export async function getTwilioConfig(): Promise<TwilioConfig | null> {
  const [accountSid, authToken, fromPhone] = await Promise.all([
    getSetting("TWILIO_ACCOUNT_SID"),
    getSetting("TWILIO_AUTH_TOKEN"),
    getSetting("TWILIO_PHONE_NUMBER"),
  ]);
  if (!accountSid || !authToken || !fromPhone) return null;
  return { accountSid, authToken, fromPhone };
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export async function sendSMS(to: string, body: string, config: TwilioConfig): Promise<{ sid: string; status: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: normalizePhone(to), From: config.fromPhone, Body: body }).toString(),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(`Twilio error ${res.status}: ${err.message ?? res.statusText}`);
  }

  const data = await res.json() as { sid: string; status: string };
  return { sid: data.sid, status: data.status };
}
