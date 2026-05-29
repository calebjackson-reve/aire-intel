"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Lead {
  id: string;
  name: string;
  firstName?: string | null;
  phone: string | null;
  email: string | null;
  stage: string;
  pricePoint: number | null;
  address: string | null;
  motivation: string | null;
  lastContactDate: string | null;
  nextActionNote: string | null;
  notes?: string | null;
  areas?: string | null;
}

const STAGES = [
  { id: "new_lead", label: "New Lead", color: "#728AC5" },
  { id: "active", label: "Active", color: "#EFDD84" },
  { id: "showing", label: "Showing", color: "#EE8172" },
  { id: "under_contract", label: "Under Contract", color: "#4ade80" },
  { id: "closed", label: "Closed", color: "#888" },
];

const CORAL = "#EE8172";
const BLUE = "#728AC5";
const GREEN = "#4ade80";
const CREAM = "#EFDD84";

export default function QuickActionDrawer({
  lead,
  open,
  onClose,
  onUpdate,
}: {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (updated: Lead) => void;
}) {
  const [draftMessage, setDraftMessage] = useState("");
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiStatus, setAiStatus] = useState<"ok" | "credit_low" | "rate_limited" | "auth" | "network" | "other">("ok");
  const [logNote, setLogNote] = useState("");
  const [logMethod, setLogMethod] = useState<"call" | "text" | "email" | "meeting" | "note">("call");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDraftMessage("");
      setLogNote("");
      setToast(null);
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!lead) return null;

  const daysSince = lead.lastContactDate
    ? Math.floor((Date.now() - new Date(lead.lastContactDate).getTime()) / 86_400_000)
    : null;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function generateAiFollowUp() {
    if (!lead) return;
    setGeneratingAi(true);
    setDraftMessage("");
    try {
      const res = await fetch("/api/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = await res.json();
      if (data.message) {
        setDraftMessage(data.message);
        setAiStatus("ok");
      } else if (data.error) {
        // Use template fallback
        const msg = data.error || "";
        if (/credit/i.test(msg)) setAiStatus("credit_low");
        else if (/rate/i.test(msg)) setAiStatus("rate_limited");
        else setAiStatus("other");
        setDraftMessage(generateTemplateFallback(lead));
      }
    } catch {
      setAiStatus("network");
      setDraftMessage(generateTemplateFallback(lead));
    } finally {
      setGeneratingAi(false);
    }
  }

  async function moveStage(stage: string) {
    if (!lead) return;
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    if (res.ok) {
      const updated = { ...lead, stage };
      onUpdate(updated);
      showToast(`Moved to ${STAGES.find(s => s.id === stage)?.label}`);
    }
  }

  async function logActivity() {
    if (!lead || !logNote.trim()) {
      showToast("Add a note first");
      return;
    }
    await fetch(`/api/contacts/${lead.id}/timeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: logMethod, note: logNote, direction: "outbound" }),
    });
    // Update lastContactDate
    await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastContactDate: new Date().toISOString() }),
    });
    onUpdate({ ...lead, lastContactDate: new Date().toISOString() });
    setLogNote("");
    showToast("Logged ✓");
  }

  function copyMessage() {
    if (!draftMessage) return;
    navigator.clipboard.writeText(draftMessage);
    showToast("Copied to clipboard");
  }

  function callPhone() {
    if (!lead?.phone) return;
    window.open(`tel:${lead.phone}`);
    setLogMethod("call");
    setLogNote("Called — ");
  }

  function smsPhone() {
    if (!lead?.phone) return;
    const body = draftMessage ? encodeURIComponent(draftMessage) : "";
    window.open(`sms:${lead.phone}${body ? `?&body=${body}` : ""}`);
    setLogMethod("text");
    setLogNote(draftMessage || "Texted — ");
  }

  function emailLead() {
    if (!lead?.email) return;
    window.open(`mailto:${lead.email}`);
    setLogMethod("email");
    setLogNote("Emailed — ");
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(9,9,11,0.6)",
            zIndex: 90,
            opacity: open ? 1 : 0,
            transition: "opacity 200ms",
          }}
        />
      )}

      {/* Drawer */}
      <div style={{
        position: "fixed",
        top: 0,
        right: open ? 0 : "-560px",
        bottom: 0,
        width: "540px",
        maxWidth: "100vw",
        background: "var(--reve-surface)",
        borderLeft: "1px solid var(--reve-border)",
        zIndex: 100,
        transition: "right 280ms cubic-bezier(0.32, 0.72, 0, 1)",
        display: "flex",
        flexDirection: "column",
        boxShadow: "-16px 0 60px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div style={{ padding: "22px 26px", borderBottom: "1px solid var(--reve-border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: "10px", letterSpacing: "0.20em", color: "var(--reve-muted)", marginBottom: "6px" }}>
                QUICK ACTIONS
              </p>
              <h2 style={{ fontSize: "22px", fontWeight: 700, color: "var(--reve-text)", letterSpacing: "-0.01em", marginBottom: "4px" }}>
                {lead.name}
              </h2>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginTop: "8px" }}>
                <StagePill stage={lead.stage} />
                {lead.pricePoint && (
                  <span style={{ fontSize: "11px", color: BLUE, fontVariantNumeric: "tabular-nums" }}>
                    ${lead.pricePoint.toLocaleString()}
                  </span>
                )}
                {daysSince !== null && (
                  <span style={{ fontSize: "11px", color: daysSince >= 5 ? CORAL : "var(--reve-muted)" }}>
                    {daysSince}d since contact
                  </span>
                )}
                {daysSince === null && (
                  <span style={{ fontSize: "11px", color: CORAL }}>never contacted</span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "transparent",
                color: "var(--reve-muted)",
                border: "1px solid var(--reve-border)",
                borderRadius: "6px",
                width: "32px", height: "32px",
                cursor: "pointer",
                fontSize: "16px",
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: "auto", padding: "22px 26px", display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Contact actions */}
          <Section title="REACH OUT">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              <ContactButton
                label="Call"
                icon="📞"
                enabled={!!lead.phone}
                onClick={callPhone}
                color={GREEN}
              />
              <ContactButton
                label="Text"
                icon="💬"
                enabled={!!lead.phone}
                onClick={smsPhone}
                color={CORAL}
              />
              <ContactButton
                label="Email"
                icon="✉"
                enabled={!!lead.email}
                onClick={emailLead}
                color={BLUE}
              />
            </div>
            {(lead.phone || lead.email) && (
              <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "3px", fontSize: "11px", color: "var(--reve-muted)" }}>
                {lead.phone && <span>📞 {lead.phone}</span>}
                {lead.email && <span>✉ {lead.email}</span>}
              </div>
            )}
          </Section>

          {/* AI Follow-Up draft */}
          <Section title="DRAFT A MESSAGE">
            <button
              onClick={generateAiFollowUp}
              disabled={generatingAi}
              style={{
                fontSize: "10px",
                letterSpacing: "0.14em",
                padding: "10px 16px",
                background: generatingAi ? "transparent" : CORAL,
                color: generatingAi ? "var(--reve-muted)" : "var(--reve-black)",
                border: generatingAi ? "1px solid var(--reve-border)" : "none",
                borderRadius: "6px",
                cursor: generatingAi ? "wait" : "pointer",
                fontWeight: 700,
                width: "100%",
                marginBottom: "10px",
              }}
            >
              {generatingAi ? "DRAFTING..." : "✦ GENERATE WITH AI"}
            </button>

            {aiStatus !== "ok" && draftMessage && (
              <div style={{ marginBottom: "10px", padding: "8px 10px", background: "rgba(239,221,132,0.05)", border: "1px solid rgba(239,221,132,0.2)", borderRadius: "4px", fontSize: "10px", color: CREAM, letterSpacing: "0.04em" }}>
                ⚠ AI offline — using personalized template instead.
                {aiStatus === "credit_low" && (
                  <> <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noreferrer" style={{ color: CREAM, textDecoration: "underline", marginLeft: "4px" }}>Top up credits →</a></>
                )}
              </div>
            )}

            <textarea
              value={draftMessage}
              onChange={e => setDraftMessage(e.target.value)}
              placeholder="Click Generate above, or write your message here…"
              rows={5}
              style={{
                width: "100%",
                background: "var(--reve-black)",
                border: "1px solid var(--reve-border)",
                borderRadius: "6px",
                padding: "10px 12px",
                fontSize: "13px",
                color: "var(--reve-text)",
                lineHeight: 1.6,
                outline: "none",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />

            {draftMessage && (
              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                <button
                  onClick={copyMessage}
                  style={{
                    fontSize: "10px",
                    letterSpacing: "0.12em",
                    padding: "8px 14px",
                    background: "transparent",
                    color: "var(--reve-text)",
                    border: "1px solid var(--reve-border)",
                    borderRadius: "5px",
                    cursor: "pointer",
                  }}
                >
                  COPY
                </button>
                {lead.phone && (
                  <button
                    onClick={smsPhone}
                    style={{
                      fontSize: "10px",
                      letterSpacing: "0.12em",
                      padding: "8px 14px",
                      background: CORAL,
                      color: "var(--reve-black)",
                      border: "none",
                      borderRadius: "5px",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    OPEN SMS WITH MESSAGE
                  </button>
                )}
              </div>
            )}
          </Section>

          {/* Move stage */}
          <Section title="MOVE PIPELINE STAGE">
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {STAGES.map(s => (
                <button
                  key={s.id}
                  onClick={() => moveStage(s.id)}
                  disabled={s.id === lead.stage}
                  style={{
                    fontSize: "10px",
                    letterSpacing: "0.10em",
                    padding: "7px 12px",
                    background: s.id === lead.stage ? `${s.color}22` : "transparent",
                    color: s.id === lead.stage ? s.color : "var(--reve-muted)",
                    border: "1px solid",
                    borderColor: s.id === lead.stage ? s.color : "var(--reve-border)",
                    borderRadius: "20px",
                    cursor: s.id === lead.stage ? "default" : "pointer",
                    fontWeight: s.id === lead.stage ? 700 : 500,
                  }}
                >
                  {s.label.toUpperCase()}
                </button>
              ))}
            </div>
          </Section>

          {/* Log activity */}
          <Section title="LOG ACTIVITY">
            <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
              {(["call", "text", "email", "meeting", "note"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setLogMethod(m)}
                  style={{
                    fontSize: "10px",
                    letterSpacing: "0.10em",
                    padding: "6px 10px",
                    background: logMethod === m ? "var(--reve-text)" : "transparent",
                    color: logMethod === m ? "var(--reve-black)" : "var(--reve-muted)",
                    border: "1px solid",
                    borderColor: logMethod === m ? "var(--reve-text)" : "var(--reve-border)",
                    borderRadius: "5px",
                    cursor: "pointer",
                    fontWeight: logMethod === m ? 700 : 500,
                  }}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
            <textarea
              value={logNote}
              onChange={e => setLogNote(e.target.value)}
              placeholder="What happened? (e.g. Talked about Bocage listings, sending comps tonight)"
              rows={3}
              style={{
                width: "100%",
                background: "var(--reve-black)",
                border: "1px solid var(--reve-border)",
                borderRadius: "6px",
                padding: "10px 12px",
                fontSize: "13px",
                color: "var(--reve-text)",
                lineHeight: 1.5,
                outline: "none",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={logActivity}
              style={{
                marginTop: "8px",
                fontSize: "10px",
                letterSpacing: "0.14em",
                padding: "9px 16px",
                background: GREEN,
                color: "var(--reve-black)",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
                fontWeight: 700,
                width: "100%",
              }}
            >
              ✓ LOG TO TIMELINE
            </button>
          </Section>

          {/* Open full profile */}
          <Link
            href={`/contacts/${lead.id}`}
            style={{
              fontSize: "11px",
              letterSpacing: "0.14em",
              padding: "12px",
              background: "transparent",
              color: "var(--reve-muted)",
              border: "1px solid var(--reve-border)",
              borderRadius: "6px",
              textDecoration: "none",
              textAlign: "center",
              marginTop: "8px",
            }}
          >
            OPEN FULL CONTACT PROFILE →
          </Link>
        </div>

        {/* Toast */}
        {toast && (
          <div style={{
            position: "absolute",
            bottom: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--reve-black)",
            color: "var(--reve-text)",
            padding: "10px 18px",
            borderRadius: "6px",
            fontSize: "12px",
            letterSpacing: "0.04em",
            border: "1px solid var(--reve-border)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}>
            {toast}
          </div>
        )}
      </div>
    </>
  );
}

function StagePill({ stage }: { stage: string }) {
  const config = STAGES.find(s => s.id === stage);
  if (!config) return null;
  return (
    <span style={{
      fontSize: "9px",
      letterSpacing: "0.14em",
      padding: "3px 10px",
      borderRadius: "20px",
      color: config.color,
      border: `1px solid ${config.color}40`,
      background: `${config.color}0D`,
    }}>
      {config.label.toUpperCase()}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: "9px", letterSpacing: "0.20em", color: "var(--reve-muted)", marginBottom: "10px" }}>{title}</p>
      {children}
    </div>
  );
}

function ContactButton({ label, icon, enabled, onClick, color }: { label: string; icon: string; enabled: boolean; onClick: () => void; color: string }) {
  return (
    <button
      onClick={onClick}
      disabled={!enabled}
      style={{
        padding: "14px 8px",
        background: enabled ? `${color}0D` : "var(--reve-surface-2)",
        color: enabled ? color : "var(--reve-muted)",
        border: `1px solid ${enabled ? `${color}30` : "var(--reve-border)"}`,
        borderRadius: "8px",
        cursor: enabled ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        opacity: enabled ? 1 : 0.4,
      }}
    >
      <span style={{ fontSize: "18px" }}>{icon}</span>
      <span style={{ fontSize: "10px", letterSpacing: "0.14em", fontWeight: 600 }}>{label.toUpperCase()}</span>
    </button>
  );
}

// Template fallback if API errors out on the client side
function generateTemplateFallback(lead: Lead): string {
  const name = lead.firstName || lead.name.split(" ")[0] || "there";
  const days = lead.lastContactDate
    ? Math.floor((Date.now() - new Date(lead.lastContactDate).getTime()) / 86_400_000)
    : null;
  if (days === null) {
    return `Hey ${name} — Caleb here from Rêve Realtors. Got your info and wanted to reach out. What's the situation — buyer side, seller side, or both? Just want to make sure I'm useful from day one.`;
  }
  if (days >= 30) {
    return `Hey ${name} — been a while. Quick check-in: still thinking about a move this year, or has the timeline shifted? Rates moved this week and wanted to flag it.`;
  }
  return `Hey ${name} — wanted to keep momentum going. What's the next thing you need from me to move forward?`;
}
