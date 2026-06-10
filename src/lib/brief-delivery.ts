// Brief Delivery — sends the assembled DailyBrief via SMS, email, and push notification
// Called once by the Morning Brief Agent after assembly. Idempotent — checks delivery timestamps.

import { prisma } from "./prisma";
import { getTwilioConfig, sendSMS, normalizePhone } from "./twilio";
import { getSendGridConfig, sendEmail } from "./sendgrid";
import type { AssembledBrief, BriefItem } from "./brief-assembler";

const CALEB_PHONE = process.env.CALEB_PHONE ?? process.env.TWILIO_TO_PHONE ?? "";
const CALEB_EMAIL = "caleb.jackson@reverealtors.com";

interface DeliveryResult {
  sms: { ok: boolean; error?: string };
  email: { ok: boolean; error?: string };
  push: { ok: boolean; error?: string };
  dashboard: { ok: boolean };
}

/** Deliver the brief via all 4 channels. Updates DailyBrief delivery timestamps. */
export async function deliverBrief(brief: AssembledBrief): Promise<DeliveryResult> {
  const result: DeliveryResult = {
    sms: { ok: false },
    email: { ok: false },
    push: { ok: false },
    dashboard: { ok: false },
  };

  const record = await prisma.dailyBrief.findUnique({ where: { date: brief.date } });
  if (!record) {
    throw new Error(`No DailyBrief record found for ${brief.date}`);
  }

  // ── SMS ──────────────────────────────────────────────────────────────────
  if (!record.smsDeliveredAt && brief.smsSummary && CALEB_PHONE) {
    try {
      const config = await getTwilioConfig();
      if (config) {
        await sendSMS(normalizePhone(CALEB_PHONE), brief.smsSummary, config);
        await prisma.dailyBrief.update({
          where: { date: brief.date },
          data: { smsDeliveredAt: new Date() },
        });
        result.sms = { ok: true };
      } else {
        result.sms = { ok: false, error: "Twilio not configured" };
      }
    } catch (err) {
      result.sms = { ok: false, error: String(err) };
    }
  } else {
    result.sms = { ok: true }; // Already delivered or no phone configured
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  if (!record.emailDeliveredAt) {
    try {
      const config = await getSendGridConfig();
      if (config) {
        const html = buildEmailHtml(brief);
        await sendEmail({
          to: CALEB_EMAIL,
          subject: `AIRÉ Morning Brief — ${formatDate(brief.date)}`,
          body: html,
          config,
        });
        await prisma.dailyBrief.update({
          where: { date: brief.date },
          data: { emailDeliveredAt: new Date() },
        });
        result.email = { ok: true };
      } else {
        result.email = { ok: false, error: "SendGrid not configured" };
      }
    } catch (err) {
      result.email = { ok: false, error: String(err) };
    }
  } else {
    result.email = { ok: true };
  }

  // ── Dashboard notification (SSE) ──────────────────────────────────────────
  try {
    await prisma.notification.create({
      data: {
        type: "sync_complete",
        title: `Morning Brief ready — ${formatDate(brief.date)}`,
        body: brief.smsSummary.slice(0, 160),
        href: "/brief",
      },
    });
    result.dashboard = { ok: true };
  } catch {
    result.dashboard = { ok: false };
  }

  // ── Push notification ─────────────────────────────────────────────────────
  if (!record.pushDeliveredAt) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const pushRes = await fetch(`${appUrl}/api/push/send`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
        },
        body: JSON.stringify({
          title: "AIRÉ Morning Brief",
          body: brief.smsSummary.slice(0, 100),
          url: "/brief",
        }),
      });

      if (pushRes.ok) {
        await prisma.dailyBrief.update({
          where: { date: brief.date },
          data: { pushDeliveredAt: new Date() },
        });
        result.push = { ok: true };
      } else {
        result.push = { ok: false, error: `Push route returned ${pushRes.status}` };
      }
    } catch (err) {
      result.push = { ok: false, error: String(err) };
    }
  } else {
    result.push = { ok: true };
  }

  return result;
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function sectionHtml(title: string, emoji: string, items: BriefItem[]): string {
  if (!items.length) return "";

  const rows = items
    .map((item) => {
      const name = item.leadName ? ` — ${item.leadName}` : "";
      const preview = item.preview ? `<br><span style="color:#888;font-size:13px">${item.preview.slice(0, 100)}</span>` : "";
      const due = item.dueDate
        ? `<span style="color:#EE8172;font-size:12px;margin-left:8px">${new Date(item.dueDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>`
        : "";
      return `<tr><td style="padding:8px 12px;border-bottom:1px solid #1a1a1a"><strong>${item.title}</strong>${name}${due}${preview}</td></tr>`;
    })
    .join("");

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;background:#0f0f12;border-radius:8px;overflow:hidden">
  <tr><td style="padding:10px 12px;background:#15151a;color:#EE8172;font-size:12px;font-weight:700;letter-spacing:0.08em">${emoji} ${title} <span style="color:#555;font-weight:normal">(${items.length})</span></td></tr>
  ${rows}
</table>`;
}

function buildEmailHtml(brief: AssembledBrief): string {
  const sections = [
    sectionHtml("NON-NEGOTIABLES", "🔴", brief.nonNegotiables),
    sectionHtml("GOING COLD", "🟡", brief.goingCold),
    sectionHtml("YOU OWE REPLIES", "📨", brief.owePeople),
    sectionHtml("TODAY'S CONTENT", "📸", brief.contentQueued),
    sectionHtml("MARKET MOVEMENT", "📊", brief.marketMovement),
  ]
    .filter(Boolean)
    .join("");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://aire.app";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#EFDD84">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px">
<table width="600" cellpadding="0" cellspacing="0">
  <tr><td style="padding-bottom:24px;border-bottom:1px solid #1a1a1a;margin-bottom:24px">
    <p style="margin:0;font-size:11px;letter-spacing:0.15em;color:#555">AIRÉ — MORNING BRIEF</p>
    <h1 style="margin:8px 0 0;font-size:24px;font-weight:300;color:#fff">${formatDate(brief.date)}</h1>
    ${brief.smsSummary ? `<p style="margin:12px 0 0;font-size:14px;color:#888;line-height:1.5">${brief.smsSummary}</p>` : ""}
  </td></tr>
  <tr><td style="padding-top:24px">${sections}</td></tr>
  <tr><td style="padding-top:16px;text-align:center">
    <a href="${appUrl}/brief" style="display:inline-block;padding:12px 32px;background:#EE8172;color:#09090B;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">Open Brief →</a>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
