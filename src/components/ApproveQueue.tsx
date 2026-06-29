"use client";

import { useEffect, useState } from "react";
import { Check, X, Inbox } from "lucide-react";

interface QueueLead { id: string; name: string; phone?: string | null; email?: string | null }
interface QueueItem {
  id: string;
  type: string;
  agentType: string;
  payload: Record<string, unknown>;
  priority: number;
  lead?: QueueLead | null;
}

const TYPE_LABEL: Record<string, string> = {
  draft_message: "Text follow-up",
  follow_up_text: "Text follow-up",
  send_client_email: "Email",
  post_content: "Social post",
  create_lofty_task: "CRM task",
};

// Pull the human-readable body out of a queue item's payload (varies by type).
function bodyOf(item: QueueItem): string {
  const p = item.payload || {};
  return (
    (p.body as string) ||
    (p.message as string) ||
    (p.caption as string) ||
    (p.text as string) ||
    (p.title as string) ||
    "—"
  );
}

export default function ApproveQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { load(); }, []);
  function load() {
    fetch("/api/queue?status=pending&take=20")
      .then((r) => r.json())
      .then((d) => { setItems(d.items ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  async function act(id: string, action: "approve" | "skip") {
    setBusy(id);
    const res = await fetch(`/api/queue/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    if (res?.ok) setItems((prev) => prev.filter((i) => i.id !== id));
    setBusy(null);
  }

  return (
    <div id="approve-queue" className="glass-card" style={{ padding: "24px 26px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
        <span className="aire-eyebrow">Approve Queue</span>
        <span style={{ fontSize: "11px", color: "var(--aire-muted)" }}>· nothing sends without you</span>
        {items.length > 0 && (
          <span className="pill-ink" style={{ marginLeft: "auto", fontSize: "11px", padding: "3px 11px" }}>
            {items.length}
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[0, 1].map((i) => <div key={i} className="skeleton" style={{ height: "84px", borderRadius: "14px" }} />)}
        </div>
      ) : items.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "28px 0", color: "var(--aire-muted)" }}>
          <Inbox size={26} />
          <p style={{ fontSize: "13px", fontStyle: "italic" }}>Queue is clear. Nothing waiting on you.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                background: "var(--aire-bg)", borderRadius: "14px", padding: "16px 18px",
                boxShadow: "var(--shadow-pressed-sm)", opacity: busy === item.id ? 0.5 : 1,
                transition: "opacity 0.2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "9px" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--aire-text)" }}>
                  {item.lead?.name ?? "Rêve"}
                </span>
                <span className="pill" style={{ fontSize: "10px", padding: "3px 9px" }}>
                  {TYPE_LABEL[item.type] ?? item.type}
                </span>
                <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--aire-muted)" }}>
                  {item.agentType.replace(/_/g, " ")}
                </span>
              </div>

              <p style={{ fontSize: "13.5px", color: "var(--aire-text-2)", lineHeight: 1.5, fontStyle: "italic", marginBottom: "14px" }}>
                {bodyOf(item).slice(0, 240)}{bodyOf(item).length > 240 ? "…" : ""}
              </p>

              <div style={{ display: "flex", gap: "10px" }}>
                <button className="btn-primary" disabled={busy === item.id}
                  onClick={() => act(item.id, "approve")}
                  style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontFamily: "inherit" }}>
                  <Check size={14} /> Approve &amp; send
                </button>
                <button className="btn-ghost" disabled={busy === item.id}
                  onClick={() => act(item.id, "skip")}
                  style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontFamily: "inherit" }}>
                  <X size={14} /> Skip
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
