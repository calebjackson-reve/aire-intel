export const dynamic = "force-dynamic";

// Loop 26 — Gmail Lead Detection
// Cron: */30 * * * * — Scans unread Gmail messages every 30 minutes,
// classifies them as real estate inquiries, creates new leads or routes to handleInboundReply.

import { verifyCronSecret, verifyCronOrInternal, cronUnauthorized } from "@/lib/cron-auth";
import { startRun, finishRun, failRun } from "@/lib/agent-run";
import { prisma } from "@/lib/prisma";
import { getValidGoogleToken } from "@/lib/google";
import { handleInboundReply } from "@/lib/inbound-reply";

const MAX_EMAILS = 20;
const MAX_NEW_LEADS = 5;
const CLASSIFICATION_THRESHOLD = 0.6;

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  return runGmailLeadDetect();
}

export async function GET(request: Request) {
  if (!verifyCronOrInternal(request)) return cronUnauthorized();
  return runGmailLeadDetect();
}

interface GmailMessage {
  id: string;
  snippet?: string;
}

interface GmailHeader {
  name: string;
  value: string;
}

async function runGmailLeadDetect() {
  const runId = await startRun("new_lead_intake");

  try {
    // Graceful Google check
    const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!googleSecret) {
      await prisma.notification.create({
        data: {
          type: "sync_complete",
          title: "Gmail not connected",
          body: "Gmail lead detection requires Google OAuth. Set up at /settings.",
          href: "/settings",
        },
      });
      await finishRun(runId, { itemsProcessed: 0, actionsQueued: 0 });
      return Response.json({ ok: true, skipped: "no_gmail" });
    }

    // Get valid access token
    const token = await getValidGoogleToken();
    if (!token) {
      await prisma.notification.create({
        data: {
          type: "sync_complete",
          title: "Gmail token expired",
          body: "Google OAuth token expired or not set. Re-authenticate at /settings.",
          href: "/settings",
        },
      });
      await finishRun(runId, { itemsProcessed: 0, actionsQueued: 0 });
      return Response.json({ ok: true, skipped: "no_token" });
    }

    // List unread messages from last 24h
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread+newer_than:1d&maxResults=${MAX_EMAILS}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }
    );

    if (!listRes.ok) {
      throw new Error(`Gmail list failed: ${listRes.status}`);
    }

    const listData = await listRes.json() as { messages?: GmailMessage[] };
    const messages = listData.messages ?? [];

    if (messages.length === 0) {
      await finishRun(runId, { itemsProcessed: 0, actionsQueued: 0 });
      return Response.json({ ok: true, emailsScanned: 0, newLeads: 0, repliesProcessed: 0 });
    }

    let emailsScanned = 0;
    let newLeads = 0;
    let repliesProcessed = 0;
    const errors: unknown[] = [];

    for (const msg of messages) {
      if (newLeads >= MAX_NEW_LEADS) break;

      try {
        // Fetch message metadata
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
          { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) }
        );

        if (!msgRes.ok) continue;

        const msgData = await msgRes.json() as {
          snippet?: string;
          payload?: { headers?: GmailHeader[] };
        };

        const headers = msgData.payload?.headers ?? [];
        const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
        const fromHeader = headers.find((h) => h.name === "From")?.value ?? "";
        const snippet = msgData.snippet ?? "";

        emailsScanned++;

        // Classify with Anthropic
        const isREInquiry = await classifyAsREInquiry(subject, snippet);
        if (!isREInquiry.isRE || isREInquiry.confidence < CLASSIFICATION_THRESHOLD) continue;

        // Extract sender email and name
        const emailMatch = fromHeader.match(/<([^>]+)>/) ?? fromHeader.match(/(\S+@\S+)/);
        const senderEmail = emailMatch?.[1]?.trim().toLowerCase() ?? "";
        if (!senderEmail) continue;

        const senderName = fromHeader.replace(/<[^>]+>/, "").trim().replace(/"/g, "") || senderEmail;

        // Check if lead already exists
        const existingLead = await prisma.lead.findFirst({
          where: { email: { equals: senderEmail, mode: "insensitive" } },
          select: { id: true, name: true, stage: true, phone: true, email: true },
        });

        if (existingLead) {
          // Route to handleInboundReply
          await handleInboundReply({
            leadId: existingLead.id,
            content: `Subject: ${subject}\n\n${snippet}`,
            channel: "email",
            method: "email",
          });
          repliesProcessed++;
        } else if (newLeads < MAX_NEW_LEADS) {
          // Create new lead
          await prisma.lead.create({
            data: {
              name: senderName,
              email: senderEmail,
              stage: "new_lead",
              source: "gmail",
            },
          });
          newLeads++;

          await prisma.notification.create({
            data: {
              type: "lead_assigned",
              title: `New lead from Gmail: ${senderName}`,
              body: `Subject: ${subject}`,
              href: "/contacts",
            },
          });
        }
      } catch (err) {
        errors.push({ msgId: msg.id, error: String(err) });
      }
    }

    await finishRun(runId, {
      itemsProcessed: emailsScanned,
      actionsQueued: newLeads + repliesProcessed,
      errorLog: errors,
    });

    return Response.json({ ok: true, emailsScanned, newLeads, repliesProcessed });
  } catch (err) {
    await failRun(runId, err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

async function classifyAsREInquiry(
  subject: string,
  snippet: string
): Promise<{ isRE: boolean; confidence: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback: keyword heuristic
    const text = `${subject} ${snippet}`.toLowerCase();
    const keywords = ["buy", "sell", "home", "house", "property", "listing", "realtor", "agent", "mortgage", "tour", "showing"];
    const hits = keywords.filter((k) => text.includes(k)).length;
    return { isRE: hits >= 2, confidence: Math.min(hits / 3, 1) };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 64,
        messages: [
          {
            role: "user",
            content: `Is this email a real estate inquiry (buying, selling, or asking about property)? Reply with valid JSON only: {"isRE": true/false, "confidence": 0.0-1.0}\n\nSubject: ${subject.slice(0, 200)}\nSnippet: ${snippet.slice(0, 300)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) return { isRE: false, confidence: 0 };

    const data = await res.json() as { content: Array<{ type: string; text: string }> };
    const text = data.content.find((b) => b.type === "text")?.text?.trim() ?? "";
    const parsed = JSON.parse(text) as { isRE?: boolean; confidence?: number };
    return {
      isRE: parsed.isRE === true,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    };
  } catch {
    return { isRE: false, confidence: 0 };
  }
}
