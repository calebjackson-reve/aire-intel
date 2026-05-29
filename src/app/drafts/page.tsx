"use client";

// Approval Queue — the human gate for every comms-agent message.
//
// Drafts (revival / follow-up / manual) land here as `pending`. Caleb reviews each
// against the lead's context and Approves (sends via Twilio/SendGrid + logs it),
// Edits (tweak the wording first), or Dismisses. Nothing leaves AIRE without a tap.

import { useEffect, useState, useCallback } from "react";
import { Card, CardLabel, Badge, Modal, EmptyState, useToast } from "@/components/ui";

interface DraftLead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  stage: string;
  type: string;
  pricePoint: number | null;
}

interface Draft {
  id: string;
  leadId: string;
  channel: "text" | "email";
  subject: string | null;
  body: string;
  status: string;
  source: string;
  cohortId: string | null;
  createdAt: string;
  lead: DraftLead;
}

const SOURCE_VARIANT: Record<string, "coral" | "cream" | "mint" | "muted"> = {
  revival: "coral",
  followup: "cream",
  manual: "muted",
};

export default function DraftQueue() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const { toast } = useToast();

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/drafts?status=pending")
      .then((r) => r.json())
      .then((d) => {
        setDrafts(Array.isArray(d.drafts) ? d.drafts : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(draft: Draft, action: "approve" | "dismiss", overrides?: { body?: string; subject?: string }) {
    setBusy(draft.id);
    try {
      const res = await fetch("/api/drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id, action, ...overrides }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast(d.error ?? "Action failed", "error");
      } else {
        toast(action === "approve" ? `Sent to ${draft.lead.name}` : "Dismissed", action === "approve" ? "success" : "info");
        setDrafts((prev) => prev.filter((x) => x.id !== draft.id));
        setEditing(null);
      }
    } catch {
      toast("Network error", "error");
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit(body: string, subject: string) {
    if (!editing) return;
    setBusy(editing.id);
    try {
      const res = await fetch("/api/drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, action: "edit", body, subject }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast(d.error ?? "Could not save", "error");
      } else {
        setDrafts((prev) => prev.map((x) => (x.id === editing.id ? d.draft : x)));
        toast("Draft updated", "success");
        setEditing(null);
      }
    } catch {
      toast("Network error", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ padding: "32px 40px 48px", maxWidth: "1100px" }}>
      <div style={{ marginBottom: "8px" }}>
        <p style={{ fontSize: "10px", letterSpacing: "0.20em", color: "var(--aire-muted)", marginBottom: "6px", fontWeight: 500 }}>
          COMMUNICATION AGENTS
        </p>
        <h2 className="font-display" style={{ fontSize: "26px", color: "var(--aire-text)", letterSpacing: "-0.01em" }}>
          Approval Queue
        </h2>
        <div style={{ width: "32px", height: "2px", background: "var(--aire-coral)", marginTop: "10px" }} />
      </div>

      <p style={{ fontSize: "12px", color: "var(--aire-muted)", lineHeight: 1.6, margin: "16px 0 24px", maxWidth: "640px" }}>
        Every message is drafted in Caleb&apos;s voice and waits here for a human tap.
        Nothing sends automatically. Approve fires the text/email and logs it; Edit lets
        you tweak first; Dismiss drops it.
      </p>

      {loading ? (
        <p style={{ fontSize: "13px", color: "var(--aire-muted)" }}>Loading queue…</p>
      ) : drafts.length === 0 ? (
        <EmptyState
          title="Queue is clear"
          description="No drafts waiting. Generate revival drafts from a cohort, or a follow-up from a contact."
        />
      ) : (
        <>
          <CardLabel>{drafts.length} PENDING</CardLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "12px" }}>
            {drafts.map((d) => (
              <DraftCard
                key={d.id}
                draft={d}
                busy={busy === d.id}
                onApprove={() => act(d, "approve")}
                onDismiss={() => act(d, "dismiss")}
                onEdit={() => setEditing(d)}
              />
            ))}
          </div>
        </>
      )}

      <EditModal
        draft={editing}
        busy={busy === editing?.id}
        onClose={() => setEditing(null)}
        onSave={saveEdit}
        onApprove={(body, subject) => editing && act(editing, "approve", { body, subject })}
      />
    </div>
  );
}

function DraftCard({
  draft,
  busy,
  onApprove,
  onDismiss,
  onEdit,
}: {
  draft: Draft;
  busy: boolean;
  onApprove: () => void;
  onDismiss: () => void;
  onEdit: () => void;
}) {
  const contact = draft.channel === "email" ? draft.lead.email : draft.lead.phone;
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
        <div>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--aire-text)" }}>{draft.lead.name}</p>
          <p style={{ fontSize: "10px", color: "var(--aire-muted)", marginTop: "2px" }}>
            {draft.lead.stage} · {draft.lead.type}
            {contact ? ` · ${contact}` : " · no contact info"}
          </p>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          <Badge variant={SOURCE_VARIANT[draft.source] ?? "muted"}>{draft.source}</Badge>
          <Badge variant="muted">{draft.channel}</Badge>
        </div>
      </div>

      {draft.channel === "email" && draft.subject && (
        <p style={{ fontSize: "12px", color: "var(--aire-text-2)", fontWeight: 600, marginBottom: "6px" }}>
          {draft.subject}
        </p>
      )}
      <p style={{ fontSize: "13px", color: "var(--aire-text-2)", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: "16px" }}>
        {draft.body}
      </p>

      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={onApprove}
          disabled={busy || !contact}
          className="btn-coral"
          style={{ fontSize: "10px", letterSpacing: "0.12em", padding: "8px 14px", opacity: busy || !contact ? 0.5 : 1, cursor: busy || !contact ? "default" : "pointer" }}
        >
          {busy ? "SENDING…" : "APPROVE & SEND"}
        </button>
        <button
          onClick={onEdit}
          disabled={busy}
          className="btn-ghost"
          style={{ fontSize: "10px", letterSpacing: "0.12em", padding: "8px 14px" }}
        >
          EDIT
        </button>
        <button
          onClick={onDismiss}
          disabled={busy}
          className="btn-ghost"
          style={{ fontSize: "10px", letterSpacing: "0.12em", padding: "8px 14px", color: "var(--aire-muted)" }}
        >
          DISMISS
        </button>
      </div>
    </Card>
  );
}

function EditModal({
  draft,
  busy,
  onClose,
  onSave,
  onApprove,
}: {
  draft: Draft | null;
  busy: boolean;
  onClose: () => void;
  onSave: (body: string, subject: string) => void;
  onApprove: (body: string, subject: string) => void;
}) {
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");

  useEffect(() => {
    if (draft) {
      setBody(draft.body);
      setSubject(draft.subject ?? "");
    }
  }, [draft]);

  if (!draft) return null;

  return (
    <Modal open={!!draft} onClose={onClose} title={`Edit — ${draft.lead.name}`} width={560}>
      {draft.channel === "email" && (
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="aire-input"
          style={{ width: "100%", marginBottom: "12px" }}
        />
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={draft.channel === "email" ? 8 : 4}
        className="aire-input"
        style={{ width: "100%", resize: "vertical", lineHeight: 1.6 }}
      />
      <div style={{ display: "flex", gap: "8px", marginTop: "16px", justifyContent: "flex-end" }}>
        <button onClick={() => onSave(body, subject)} disabled={busy} className="btn-ghost" style={{ fontSize: "10px", letterSpacing: "0.12em", padding: "9px 15px" }}>
          SAVE DRAFT
        </button>
        <button onClick={() => onApprove(body, subject)} disabled={busy} className="btn-coral" style={{ fontSize: "10px", letterSpacing: "0.12em", padding: "9px 15px" }}>
          {busy ? "SENDING…" : "APPROVE & SEND"}
        </button>
      </div>
    </Modal>
  );
}
