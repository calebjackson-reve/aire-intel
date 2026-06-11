export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateSettingsCache } from "@/lib/settings";

// Keys we allow to be stored — whitelist prevents arbitrary writes
const ALLOWED_KEYS = [
  "PARAGON_API_URL",
  "PARAGON_API_KEY",
  "META_PAGE_ACCESS_TOKEN",
  "META_PAGE_ID",
  "META_IG_BUSINESS_ID",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "SENDGRID_API_KEY",
  "SENDGRID_FROM_EMAIL",
  "CALENDLY_API_KEY",
  "DOTLOOP_ACCESS_TOKEN",
  "DOTLOOP_PROFILE_ID",
  "ZAPIER_WEBHOOK_URL",
  "ZAPIER_INBOUND_SECRET",
  "RPR_USERNAME",
  "RPR_PASSWORD",
  // Team — solo-agent handoff routing
  "TC_NAME",
  "TC_EMAIL",
  "TC_PHONE",
  "SHOWING_ASSISTANT_NAME",
  "SHOWING_ASSISTANT_EMAIL",
  "SHOWING_ASSISTANT_PHONE",
];

// Lofty status comes from env only (set via .env, not UI)
const LOFTY_ENV_KEYS = ["LOFTY_CLIENT_ID", "LOFTY_CLIENT_SECRET", "LOFTY_CUSTOMER_KEY"];

export async function GET() {
  const settings = await prisma.setting.findMany({
    where: { key: { in: ALLOWED_KEYS } },
  });

  // Names and emails are not secrets — show them in clear.
  // Tokens/keys/passwords stay masked.
  const NON_SECRET = new Set([
    "TC_NAME", "TC_EMAIL", "TC_PHONE",
    "SHOWING_ASSISTANT_NAME", "SHOWING_ASSISTANT_EMAIL", "SHOWING_ASSISTANT_PHONE",
    "PARAGON_API_URL",
    "META_PAGE_ID", "META_IG_BUSINESS_ID",
    "GOOGLE_CLIENT_ID",
    "TWILIO_PHONE_NUMBER",
    "SENDGRID_FROM_EMAIL",
    "DOTLOOP_PROFILE_ID",
    "RPR_USERNAME",
  ]);

  const result: Record<string, { set: boolean; preview?: string }> = {};
  for (const key of ALLOWED_KEYS) {
    const found = settings.find(s => s.key === key);
    const rawVal = found?.value ?? process.env[key] ?? null;
    if (rawVal) {
      result[key] = {
        set: true,
        preview: NON_SECRET.has(key)
          ? rawVal
          : rawVal.length > 6
            ? `···${rawVal.slice(-4)}`
            : "···",
      };
    } else {
      result[key] = { set: false };
    }
  }

  // Add Lofty env status (read-only — set via .env)
  const loftyConnected = LOFTY_ENV_KEYS.every(k => !!process.env[k]);
  result["LOFTY_CONNECTED"] = { set: loftyConnected };

  return Response.json(result);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Record<string, string>;

  const updates: { key: string; value: string }[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_KEYS.includes(key) || !value?.trim()) continue;
    updates.push({ key, value: value.trim() });
  }

  if (updates.length === 0) {
    return Response.json({ error: "No valid keys provided" }, { status: 400 });
  }

  await Promise.all(
    updates.map(({ key, value }) =>
      prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    )
  );

  // Invalidate the in-memory cache so getSetting() returns fresh values
  invalidateSettingsCache(updates.map(u => u.key));

  return Response.json({ ok: true, saved: updates.map(u => u.key) });
}
