"use client";

import { useState } from "react";

export interface OutreachRecord {
  id: string;
  leadId: string;
  message: string;
  status: "message_generated" | "copied" | "sent";
  generatedAt: string;
  copiedAt: string | null;
  sentAt: string | null;
  notes: string | null;
}

interface Props {
  record: OutreachRecord;
  linkedinUrl: string | null;
  /** Called after a successful PATCH so the parent can update its state */
  onUpdate: (updated: OutreachRecord) => void;
}

const STATUS_LABEL: Record<string, string> = {
  message_generated: "GENERATED",
  copied: "COPIED",
  sent: "SENT",
};

const STATUS_COLOR: Record<string, string> = {
  message_generated: "var(--aire-muted)",
  copied: "var(--aire-cream)",
  sent: "var(--aire-mint, #6EE7B7)",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function LinkedInOutreachCard({ record, linkedinUrl, onUpdate }: Props) {
  const [copyFlash, setCopyFlash] = useState(false);
  const [sentFlash, setSentFlash] = useState(false);
  const [noteDraft, setNoteDraft] = useState(record.notes ?? "");
  const [savingNote, setSavingNote] = useState(false);

  async function patch(payload: Partial<OutreachRecord>) {
    const res = await fetch("/api/linkedin/outreach", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: record.id, ...payload }),
    });
    const updated = await res.json();
    onUpdate(updated);
    return updated;
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(record.message);
    setCopyFlash(true);
    setTimeout(() => setCopyFlash(false), 2000);
    if (record.status === "message_generated") {
      await patch({ status: "copied" });
    }
  }

  async function handleMarkSent() {
    setSentFlash(true);
    setTimeout(() => setSentFlash(false), 2000);
    await patch({ status: "sent" });
  }

  async function saveNote() {
    if (noteDraft === record.notes) return;
    setSavingNote(true);
    await patch({ notes: noteDraft });
    setSavingNote(false);
  }

  return (
    <div
      style={{
        background: "var(--aire-card-warm)",
        border: "1px solid var(--aire-border)",
        borderRadius: "14px",
        padding: "18px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
    >
      {/* Header row: status pill + timestamp */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{
            fontSize: "9px",
            letterSpacing: "0.16em",
            fontWeight: 600,
            color: STATUS_COLOR[record.status] ?? "var(--aire-muted)",
            border: `1px solid ${STATUS_COLOR[record.status] ?? "var(--aire-border)"}`,
            borderRadius: "999px",
            padding: "3px 10px",
          }}
        >
          {STATUS_LABEL[record.status] ?? record.status.toUpperCase()}
        </span>
        <span style={{ fontSize: "11px", color: "var(--aire-muted)" }}>
          {timeAgo(record.generatedAt)}
        </span>
      </div>

      {/* Message text */}
      <p
        style={{
          fontSize: "14px",
          color: "var(--aire-text)",
          lineHeight: "1.6",
          margin: 0,
          fontStyle: "normal",
        }}
      >
        {record.message}
      </p>

      {/* Character count */}
      <p style={{ fontSize: "10px", color: record.message.length > 300 ? "var(--aire-coral)" : "var(--aire-muted)", margin: 0, letterSpacing: "0.06em" }}>
        {record.message.length}/300 chars
      </p>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {/* Copy + open LinkedIn */}
        <button
          onClick={handleCopy}
          style={{
            fontSize: "10px",
            letterSpacing: "0.14em",
            fontWeight: 600,
            padding: "8px 18px",
            borderRadius: "999px",
            border: "none",
            background: copyFlash ? "var(--aire-cream)" : "var(--aire-coral)",
            color: "var(--aire-ink)",
            cursor: "pointer",
            transition: "background 200ms",
          }}
        >
          {copyFlash ? "COPIED ✓" : "COPY MESSAGE"}
        </button>

        {linkedinUrl && (
          <a
            href={linkedinUrl.startsWith("http") ? linkedinUrl : `https://${linkedinUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "10px",
              letterSpacing: "0.14em",
              fontWeight: 500,
              padding: "8px 16px",
              borderRadius: "999px",
              border: "1px solid var(--aire-border-2)",
              color: "var(--aire-text)",
              textDecoration: "none",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            OPEN LINKEDIN →
          </a>
        )}

        {record.status !== "sent" && (
          <button
            onClick={handleMarkSent}
            style={{
              fontSize: "10px",
              letterSpacing: "0.14em",
              fontWeight: 500,
              padding: "8px 16px",
              borderRadius: "999px",
              border: "1px solid var(--aire-border-2)",
              color: sentFlash ? "var(--aire-mint, #6EE7B7)" : "var(--aire-text-2)",
              background: "transparent",
              cursor: "pointer",
              transition: "color 200ms",
            }}
          >
            {sentFlash ? "MARKED SENT ✓" : "MARK SENT"}
          </button>
        )}
      </div>

      {/* Timestamps trail */}
      {(record.copiedAt || record.sentAt) && (
        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
          {record.copiedAt && (
            <span style={{ fontSize: "10px", color: "var(--aire-muted)", letterSpacing: "0.06em" }}>
              Copied {timeAgo(record.copiedAt)}
            </span>
          )}
          {record.sentAt && (
            <span style={{ fontSize: "10px", color: "var(--aire-muted)", letterSpacing: "0.06em" }}>
              Sent {timeAgo(record.sentAt)}
            </span>
          )}
        </div>
      )}

      {/* Notes */}
      <div>
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={saveNote}
          placeholder="Notes (e.g. 'connected, follow up next week')..."
          rows={2}
          style={{
            width: "100%",
            fontSize: "12px",
            color: "var(--aire-text)",
            background: "var(--aire-card)",
            border: "1px solid var(--aire-border)",
            borderRadius: "8px",
            padding: "8px 10px",
            resize: "vertical",
            boxSizing: "border-box",
            outline: "none",
            fontFamily: "inherit",
            lineHeight: "1.5",
          }}
        />
        {savingNote && (
          <span style={{ fontSize: "10px", color: "var(--aire-muted)", letterSpacing: "0.06em" }}>
            saving...
          </span>
        )}
      </div>
    </div>
  );
}
