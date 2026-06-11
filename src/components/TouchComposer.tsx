"use client";

import { useState, useRef, useCallback } from "react";

interface Lead {
  id: string;
  name: string;
  firstName: string | null;
  phone: string | null;
  email: string | null;
  tags: string | null;
  instagramHandle: string | null;
  facebookUrl: string | null;
  facebookName: string | null;
  linkedinUrl: string | null;
}

interface ContactLog {
  id: string;
  method: string;
  note: string | null;
  direction: string;
  createdAt: string;
}

interface Props {
  lead: Lead;
  onTouchSent: (log: ContactLog) => void;
}

type Channel = "call" | "sms" | "email" | "messenger" | "instagram" | "linkedin";

const CHANNEL_META: Record<Channel, { icon: string; label: string; color: string }> = {
  call:      { icon: "☎", label: "Call",      color: "#4ADE80" },
  sms:       { icon: "✉", label: "Text",       color: "#EE8172" },
  email:     { icon: "◎", label: "Email",      color: "#728AC5" },
  messenger: { icon: "⬡", label: "Messenger", color: "#0078FF" },
  instagram: { icon: "◈", label: "Instagram",  color: "#E1306C" },
  linkedin:  { icon: "▣", label: "LinkedIn",   color: "#0A66C2" },
};

export default function TouchComposer({ lead, onTouchSent }: Props) {
  const messengerPsid = lead.tags?.split(",").find(t => t.startsWith("messenger:"))?.replace("messenger:", "");

  const available: Channel[] = [
    ...(lead.phone ? (["call", "sms"] as Channel[]) : []),
    ...(lead.email ? (["email"] as Channel[]) : []),
    ...(messengerPsid ? (["messenger"] as Channel[]) : []),
    ...(lead.instagramHandle ? (["instagram"] as Channel[]) : []),
    ...(lead.linkedinUrl ? (["linkedin"] as Channel[]) : []),
  ];

  const [channel, setChannel] = useState<Channel>(available[0] ?? "sms");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const toast$ = useCallback((msg: string, ms = 3000) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  }, []);

  async function suggestAI() {
    setLoadingAI(true);
    setMessage("");
    textareaRef.current?.focus();
    const res = await fetch("/api/followup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead }),
    });
    const reader = res.body?.getReader();
    const dec = new TextDecoder();
    if (!reader) { setLoadingAI(false); return; }
    setLoadingAI(false);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      setMessage(prev => prev + dec.decode(value));
    }
  }

  async function logDirect(method: string, note: string) {
    const res = await fetch(`/api/contacts/${lead.id}/timeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, note, direction: "outbound" }),
    });
    const log: ContactLog = await res.json();
    onTouchSent(log);
    return log;
  }

  async function send() {
    if (sending) return;
    setSending(true);
    try {
      if (channel === "call") {
        window.location.href = `tel:${lead.phone}`;
        await logDirect("call", message || "Call placed");
        setMessage("");
        toast$("Call logged ✓");
        return;
      }

      if (channel === "sms") {
        if (!lead.phone) { toast$("No phone on file"); return; }
        const res = await fetch("/api/sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: lead.id, to: lead.phone, message }),
        });
        const data = await res.json();
        if (data.ok) {
          toast$("Text sent ✓");
          setMessage("");
          const fresh = await fetch(`/api/contacts/${lead.id}`).then(r => r.json());
          onTouchSent(fresh.timeline_logs?.[0] ?? { id: "", method: "text", note: message, direction: "outbound", createdAt: new Date().toISOString() });
        } else if (res.status === 503) {
          window.location.href = `sms:${lead.phone}&body=${encodeURIComponent(message)}`;
        } else {
          toast$(`Failed: ${data.error?.slice(0, 50) ?? "unknown"}`);
        }
        return;
      }

      if (channel === "email") {
        if (!lead.email) { toast$("No email on file"); return; }
        const res = await fetch("/api/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: lead.id,
            to: lead.email,
            subject: `Following up — ${lead.firstName ?? lead.name.split(" ")[0]}`,
            message,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          toast$("Email sent ✓");
          setMessage("");
          const fresh = await fetch(`/api/contacts/${lead.id}`).then(r => r.json());
          onTouchSent(fresh.timeline_logs?.[0] ?? { id: "", method: "email", note: message, direction: "outbound", createdAt: new Date().toISOString() });
        } else if (res.status === 503) {
          const subject = encodeURIComponent(`Following up — ${lead.firstName ?? lead.name.split(" ")[0]}`);
          window.location.href = `mailto:${lead.email}?subject=${subject}&body=${encodeURIComponent(message)}`;
        } else {
          toast$(`Failed: ${data.error?.slice(0, 50) ?? "unknown"}`);
        }
        return;
      }

      if (channel === "messenger") {
        if (!messengerPsid) { toast$("No Messenger ID linked"); return; }
        const res = await fetch("/api/contacts/messenger-send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: lead.id, psid: messengerPsid, message }),
        });
        const data = await res.json();
        if (data.ok) {
          toast$("Messenger sent ✓");
          setMessage("");
          await logDirect("messenger", message);
        } else {
          toast$(`Failed: ${data.error?.slice(0, 50) ?? "unknown"}`);
        }
        return;
      }

      if (channel === "instagram") {
        const handle = lead.instagramHandle?.replace("@", "");
        window.open(`https://www.instagram.com/${handle}/`, "_blank");
        if (message) await logDirect("instagram", message);
        toast$("Instagram opened ✓");
        setMessage("");
        return;
      }

      if (channel === "linkedin") {
        window.open(lead.linkedinUrl ?? "https://linkedin.com", "_blank");
        if (message) await logDirect("linkedin", message);
        toast$("LinkedIn opened ✓");
        setMessage("");
        return;
      }
    } finally {
      setSending(false);
    }
  }

  const meta = CHANNEL_META[channel];
  const canSend = channel === "call" ? true : message.trim().length > 0;

  return (
    <div
      style={{
        background: "var(--aire-card)",
        border: "1px solid var(--aire-border)",
        borderRadius: "16px",
        padding: "16px 20px",
        marginBottom: "24px",
      }}
    >
      {/* Channel selector */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
        {(Object.keys(CHANNEL_META) as Channel[]).map(ch => {
          const isAvail = available.includes(ch);
          const isActive = channel === ch;
          const cm = CHANNEL_META[ch];
          return (
            <button
              key={ch}
              onClick={() => isAvail && setChannel(ch)}
              disabled={!isAvail}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "6px 12px",
                borderRadius: "999px",
                fontSize: "11px",
                letterSpacing: "0.12em",
                fontWeight: isActive ? 700 : 500,
                cursor: isAvail ? "pointer" : "not-allowed",
                border: isActive ? `1.5px solid ${cm.color}` : "1px solid var(--aire-border)",
                background: isActive ? `${cm.color}18` : "transparent",
                color: isActive ? cm.color : isAvail ? "var(--aire-text-2)" : "var(--aire-muted)",
                transition: "all 0.15s",
                opacity: isAvail ? 1 : 0.35,
                fontFamily: "inherit",
              }}
            >
              <span style={{ fontSize: "12px" }}>{cm.icon}</span>
              {cm.label.toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* Message input */}
      {channel !== "call" && (
        <div style={{ position: "relative", marginBottom: "10px" }}>
          <textarea
            ref={textareaRef}
            value={loadingAI ? "Drafting..." : message}
            onChange={e => setMessage(e.target.value)}
            placeholder={`Send via ${meta.label.toLowerCase()}…`}
            disabled={loadingAI}
            rows={3}
            style={{
              width: "100%",
              resize: "none",
              border: "1px solid var(--aire-border)",
              borderRadius: "10px",
              padding: "12px 14px",
              fontSize: "14px",
              lineHeight: "1.6",
              fontFamily: "inherit",
              background: "var(--aire-surface)",
              color: loadingAI ? "var(--aire-muted)" : "var(--aire-text)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      )}

      {/* Actions row */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {channel !== "call" && (
          <button
            onClick={suggestAI}
            disabled={loadingAI}
            style={{
              fontSize: "11px",
              letterSpacing: "0.12em",
              padding: "7px 14px",
              borderRadius: "999px",
              border: "1px solid var(--aire-border)",
              background: "transparent",
              color: "var(--aire-coral-deep)",
              cursor: loadingAI ? "wait" : "pointer",
              fontFamily: "inherit",
              fontWeight: 600,
            }}
          >
            {loadingAI ? "Drafting…" : "✦ AI Suggest"}
          </button>
        )}

        <div style={{ flex: 1 }} />

        {toast && (
          <span style={{
            fontSize: "11px",
            color: toast.includes("Failed") ? "var(--aire-coral)" : "var(--aire-mint-text, #166534)",
            letterSpacing: "0.04em",
          }}>
            {toast}
          </span>
        )}

        <button
          onClick={send}
          disabled={!canSend || sending}
          style={{
            fontSize: "11px",
            letterSpacing: "0.14em",
            fontWeight: 700,
            padding: "8px 20px",
            borderRadius: "999px",
            border: "none",
            background: canSend ? meta.color : "var(--aire-border)",
            color: canSend ? "#fff" : "var(--aire-muted)",
            cursor: canSend && !sending ? "pointer" : "not-allowed",
            fontFamily: "inherit",
            transition: "background 0.15s",
          }}
        >
          {sending ? "SENDING…" : channel === "call" ? "☎ CALL" : `SEND ${meta.label.toUpperCase()}`}
        </button>
      </div>
    </div>
  );
}
