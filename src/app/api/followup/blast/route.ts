import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { REVE_PIPELINE_SYSTEM } from "@/lib/reve-system-prompt";
import { getTwilioConfig, sendSMS } from "@/lib/twilio";
import { getSendGridConfig, sendEmail } from "@/lib/sendgrid";

// Batch Cold Follow-Up Blast
//
// Two-stage workflow:
//   1. action=draft  → fan out to Claude Haiku in parallel, draft per-channel
//                      messages (SMS + email subject + email body) for each
//                      selected lead. Per-lead AI failure falls back to a
//                      generic template so the whole batch still ships.
//   2. action=send   → for each reviewed draft, dispatch via Twilio + SendGrid
//                      based on the channel toggle, log a ContactLog row, and
//                      bump lead.lastContactDate. Missing Twilio/SendGrid keys
//                      yield a soft per-row error instead of nuking the batch.

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

interface DraftedMessage {
  leadId: string;
  name: string;
  phone: string | null;
  email: string | null;
  smsBody: string;
  emailSubject: string;
  emailBody: string;
}

interface SendInput {
  leadId: string;
  channel: "sms" | "email" | "both";
  smsBody?: string;
  emailSubject?: string;
  emailBody?: string;
}

interface SendResult {
  leadId: string;
  sms: { ok: boolean; error?: string };
  email: { ok: boolean; error?: string };
}

function firstNameOf(lead: { firstName: string | null; name: string }) {
  return lead.firstName?.trim() || lead.name.split(" ")[0] || "there";
}

// Deterministic fallback if Claude fails for a single lead. Keeps the batch shippable.
function fallbackSms(firstName: string) {
  return `Hey ${firstName}, it's been a while — let me know if there's anything I can help with on the home search. — Caleb`;
}
function fallbackEmailSubject() {
  return "Checking in";
}
function fallbackEmailBody(firstName: string) {
  return `Hey ${firstName},\n\nWanted to check in and see where you're at on the home search. No rush — happy to answer anything that's come up or just touch base when you have a minute.\n\nLet me know what works.\n\nCaleb Jackson · Rêve Realtors`;
}

// Try to parse Claude's structured-ish output. Falls back to fallbacks if a section is missing.
function parseDraftResponse(
  raw: string,
  firstName: string,
): { smsBody: string; emailSubject: string; emailBody: string } {
  const text = raw.trim();

  // Look for SMS: / EMAIL_SUBJECT: / EMAIL_BODY: section markers.
  const smsMatch = text.match(/SMS:\s*([\s\S]*?)(?=\n\s*(?:EMAIL_SUBJECT|EMAIL_BODY|$))/i);
  const subjMatch = text.match(/EMAIL_SUBJECT:\s*([\s\S]*?)(?=\n\s*(?:EMAIL_BODY|$))/i);
  const bodyMatch = text.match(/EMAIL_BODY:\s*([\s\S]*?)$/i);

  let smsBody = smsMatch?.[1]?.trim() || "";
  let emailSubject = subjMatch?.[1]?.trim() || "";
  let emailBody = bodyMatch?.[1]?.trim() || "";

  // Strip wrapping quotes Claude sometimes adds.
  const strip = (s: string) => s.replace(/^["']|["']$/g, "").trim();
  smsBody = strip(smsBody);
  emailSubject = strip(emailSubject);
  emailBody = strip(emailBody);

  // Enforce the 160-char SMS cap defensively (truncate at last word boundary).
  if (smsBody.length > 160) {
    const truncated = smsBody.slice(0, 160);
    const lastSpace = truncated.lastIndexOf(" ");
    smsBody = (lastSpace > 100 ? truncated.slice(0, lastSpace) : truncated).trim();
  }

  if (!smsBody) smsBody = fallbackSms(firstName);
  if (!emailSubject) emailSubject = fallbackEmailSubject();
  if (!emailBody) emailBody = fallbackEmailBody(firstName);

  return { smsBody, emailSubject, emailBody };
}

async function draftFor(lead: {
  id: string;
  name: string;
  firstName: string | null;
  phone: string | null;
  email: string | null;
  stage: string;
  type: string;
  pricePoint: number | null;
  areas: string | null;
  motivation: string | null;
  source: string | null;
  notes: string | null;
  lastContactDate: Date | null;
}): Promise<DraftedMessage> {
  const firstName = firstNameOf(lead);
  const daysSince = lead.lastContactDate
    ? Math.floor((Date.now() - new Date(lead.lastContactDate).getTime()) / 86_400_000)
    : null;

  let smsBody = fallbackSms(firstName);
  let emailSubject = fallbackEmailSubject();
  let emailBody = fallbackEmailBody(firstName);

  try {
    const response = await getClient().messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 500,
      system: [
        {
          type: "text",
          text: REVE_PIPELINE_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Draft a cold re-engagement follow-up for this lead — both an SMS and an email version.

Lead context:
- Name: ${lead.name}
- First name to use: ${firstName}
- Stage: ${lead.stage}
- Type: ${lead.type}
- Price point: ${lead.pricePoint ? `$${lead.pricePoint.toLocaleString()}` : "unknown"}
- Areas: ${lead.areas || "unknown"}
- Motivation: ${lead.motivation || "unknown"}
- Source: ${lead.source || "unknown"}
- Days since last contact: ${daysSince ?? "never contacted"}
- Notes: ${lead.notes?.slice(0, 300) || "none"}

Output EXACTLY this format (no preamble, no markdown, no quotes):

SMS: <one text message, ≤160 chars, casual, Baton Rouge friendly, no emojis, ends with sign-off "— Caleb">
EMAIL_SUBJECT: <3-6 words, no exclamations, sentence case>
EMAIL_BODY: <3-4 sentences, warm but not pushy, ends with "Caleb Jackson · Rêve Realtors">

Pre-fill the first name. Reference the time gap lightly. Avoid "just checking in" / "just wanted to". Real and specific, not template-y.`,
        },
      ],
    });

    const raw = response.content.find((b) => b.type === "text")?.text ?? "";
    if (raw.trim().length > 0) {
      const parsed = parseDraftResponse(raw, firstName);
      smsBody = parsed.smsBody;
      emailSubject = parsed.emailSubject;
      emailBody = parsed.emailBody;
    }
  } catch {
    // Per-lead failure: keep fallbacks. The batch as a whole still ships.
  }

  return {
    leadId: lead.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    smsBody,
    emailSubject,
    emailBody,
  };
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as
    | { action: "draft"; leadIds: string[] }
    | { action: "send"; messages: SendInput[] };

  // ───── DRAFT ─────────────────────────────────────────────────────────────
  if (body.action === "draft") {
    const leadIds = Array.isArray(body.leadIds) ? body.leadIds : [];
    if (leadIds.length === 0) {
      return Response.json({ drafts: [] });
    }

    const leads = await prisma.lead.findMany({
      where: { id: { in: leadIds } },
    });

    // Run all drafts in parallel — Haiku is fast and per-lead failures are
    // contained inside draftFor's try/catch.
    const drafts = await Promise.all(leads.map(draftFor));

    return Response.json({ drafts });
  }

  // ───── SEND ──────────────────────────────────────────────────────────────
  if (body.action === "send") {
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      return Response.json({ results: [] });
    }

    // Resolve configs ONCE up front so we don't hammer Setting lookups per row.
    const [twilioConfig, sendgridConfig] = await Promise.all([
      getTwilioConfig(),
      getSendGridConfig(),
    ]);

    // Load all leads in one query (we need phone/email for each send).
    const leadIds = messages.map((m) => m.leadId);
    const leads = await prisma.lead.findMany({
      where: { id: { in: leadIds } },
      select: { id: true, phone: true, email: true },
    });
    const leadMap = new Map(leads.map((l) => [l.id, l]));

    const results: SendResult[] = await Promise.all(
      messages.map(async (msg): Promise<SendResult> => {
        const lead = leadMap.get(msg.leadId);
        const wantsSms = msg.channel === "sms" || msg.channel === "both";
        const wantsEmail = msg.channel === "email" || msg.channel === "both";

        const result: SendResult = {
          leadId: msg.leadId,
          sms: { ok: false },
          email: { ok: false },
        };

        if (!lead) {
          const err = "Lead not found";
          if (wantsSms) result.sms = { ok: false, error: err };
          if (wantsEmail) result.email = { ok: false, error: err };
          return result;
        }

        // ── SMS ──
        if (wantsSms) {
          if (!twilioConfig) {
            result.sms = { ok: false, error: "Twilio not connected — configure in /settings" };
          } else if (!lead.phone) {
            result.sms = { ok: false, error: "Lead has no phone number" };
          } else if (!msg.smsBody || msg.smsBody.trim().length === 0) {
            result.sms = { ok: false, error: "SMS body empty" };
          } else {
            try {
              await sendSMS(lead.phone, msg.smsBody, twilioConfig);
              await prisma.contactLog.create({
                data: {
                  leadId: msg.leadId,
                  method: "text",
                  direction: "outbound",
                  note: msg.smsBody,
                },
              });
              result.sms = { ok: true };
            } catch (err) {
              result.sms = {
                ok: false,
                error: err instanceof Error ? err.message : String(err),
              };
            }
          }
        } else {
          // Channel not requested — represent as "ok: true" with no error so
          // the UI can render a neutral checkmark / skip indicator.
          result.sms = { ok: true };
        }

        // ── Email ──
        if (wantsEmail) {
          if (!sendgridConfig) {
            result.email = {
              ok: false,
              error: "SendGrid not connected — configure in /settings",
            };
          } else if (!lead.email) {
            result.email = { ok: false, error: "Lead has no email" };
          } else if (!msg.emailSubject || !msg.emailBody) {
            result.email = { ok: false, error: "Email subject or body empty" };
          } else {
            try {
              await sendEmail({
                to: lead.email,
                subject: msg.emailSubject,
                body: msg.emailBody,
                config: sendgridConfig,
              });
              await prisma.contactLog.create({
                data: {
                  leadId: msg.leadId,
                  method: "email",
                  direction: "outbound",
                  note: msg.emailBody,
                },
              });
              result.email = { ok: true };
            } catch (err) {
              result.email = {
                ok: false,
                error: err instanceof Error ? err.message : String(err),
              };
            }
          }
        } else {
          result.email = { ok: true };
        }

        // If ANY channel actually shipped, bump lastContactDate.
        const anyShipped =
          (wantsSms && result.sms.ok && msg.smsBody) ||
          (wantsEmail && result.email.ok && msg.emailBody);
        if (anyShipped) {
          await prisma.lead.update({
            where: { id: msg.leadId },
            data: { lastContactDate: new Date() },
          });
        }

        return result;
      }),
    );

    return Response.json({ results });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
