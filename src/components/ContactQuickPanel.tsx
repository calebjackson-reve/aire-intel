"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface Log { id: string; method: string; note: string | null; direction: string; createdAt: string; }
interface Task { id: string; title: string; done: boolean; dueDate: string | null; }
interface Lead {
  id: string; name: string; firstName: string | null; phone: string | null; email: string | null;
  stage: string; type: string; priceMin: number | null; priceMax: number | null;
  linkedinUrl: string | null; instagramHandle: string | null; source: string | null;
  areas: string | null; motivation: string | null; timeline: string | null;
  lastContactDate: string | null; nextActionDate: string | null; nextActionNote: string | null;
  notes: string | null; loftyId: string | null;
  timeline_logs: Log[]; tasks: Task[];
}

const STAGE_LABELS: Record<string, string> = {
  new_lead: "New Lead", active: "Active", showing: "Showing",
  under_contract: "Under Contract", closed: "Closed",
};

const STAGE_COLOR: Record<string, string> = {
  new_lead: "var(--aire-muted)",
  active: "var(--status-active)",
  showing: "var(--aire-cream)",
  under_contract: "var(--status-urgent)",
  closed: "var(--aire-muted)",
};

const METHOD_ICONS: Record<string, string> = {
  text: "✉", call: "☎", email: "✉", showing: "⌂", meeting: "●", note: "✎", ai_message: "✦",
};

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function fmt(n: number | null) {
  if (n == null) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export default function ContactQuickPanel({ id }: { id: string }) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);

  // AI follow-up
  const [aiStream, setAiStream] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [copyFlash, setCopyFlash] = useState(false);
  const aiRef = useRef<HTMLDivElement>(null);

  // Log activity
  const [logNote, setLogNote] = useState("");
  const [logMethod, setLogMethod] = useState("note");
  const [addingLog, setAddingLog] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLead(null);
    setAiStream("");
    setShowAI(false);
    fetch(`/api/contacts/${id}`)
      .then(r => r.json())
      .then(data => { setLead(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (aiRef.current) aiRef.current.scrollTop = aiRef.current.scrollHeight;
  }, [aiStream]);

  async function generateAI() {
    if (!lead) return;
    setAiLoading(true);
    setAiStream("");
    setShowAI(true);
    const res = await fetch("/api/followup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead }),
    });
    const reader = res.body?.getReader();
    const dec = new TextDecoder();
    if (!reader) { setAiLoading(false); return; }
    setAiLoading(false);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      setAiStream(prev => prev + dec.decode(value));
    }
  }

  async function addLog() {
    if (!logNote.trim()) return;
    setAddingLog(true);
    const res = await fetch(`/api/contacts/${id}/timeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: logMethod, note: logNote, direction: "outbound" }),
    });
    const log = await res.json();
    setLead(prev => prev ? {
      ...prev,
      timeline_logs: [log, ...prev.timeline_logs],
      lastContactDate: new Date().toISOString(),
    } : prev);
    setLogNote("");
    setAddingLog(false);
  }

  async function toggleTask(task: Task) {
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, done: !task.done, doneAt: !task.done ? new Date().toISOString() : null }),
    });
    const updated = await res.json();
    setLead(prev => prev ? {
      ...prev,
      tasks: prev.tasks.map(t => t.id === task.id ? { ...t, ...updated } : t),
    } : prev);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--aire-muted)", fontSize: "13px" }}>
        Loading…
      </div>
    );
  }

  if (!lead) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--aire-muted)", fontSize: "13px" }}>
        Contact not found.
      </div>
    );
  }

  const stageColor = STAGE_COLOR[lead.stage] ?? "var(--aire-muted)";
  const pendingTasks = lead.tasks.filter(t => !t.done);
  const recentLogs = lead.timeline_logs.slice(0, 6);

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px", minHeight: "100%" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontSize: "22px", fontWeight: 600, color: "var(--aire-text)", margin: "0 0 6px 0", letterSpacing: "-0.01em" }}>
            {lead.name}
          </h2>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{
              fontSize: "10px", letterSpacing: "0.12em", fontWeight: 600,
              color: stageColor, background: `${stageColor}15`,
              border: `1px solid ${stageColor}30`,
              borderRadius: "6px", padding: "2px 8px",
            }}>
              {STAGE_LABELS[lead.stage] ?? lead.stage.toUpperCase()}
            </span>
            {lead.source && (
              <span style={{ fontSize: "11px", color: "var(--aire-muted)" }}>via {lead.source}</span>
            )}
          </div>
        </div>
        <Link
          href={`/contacts/${lead.id}`}
          style={{
            fontSize: "10px", letterSpacing: "0.12em", color: "var(--aire-muted)",
            textDecoration: "none", padding: "6px 12px",
            border: "1px solid var(--aire-border)", borderRadius: "6px",
            transition: "color 200ms, border-color 200ms", whiteSpace: "nowrap",
          }}
        >
          FULL PROFILE →
        </Link>
      </div>

      {/* ── Quick contact row ── */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {lead.phone && (
          <>
            <a href={`tel:${lead.phone}`} style={quickLinkStyle("#6EE7B7", "rgba(110,231,183,0.1)")}>☎ CALL</a>
            <a href={`sms:${lead.phone}`} style={quickLinkStyle("var(--aire-text-2)", "var(--aire-card-warm)")}>✉ TEXT</a>
          </>
        )}
        {lead.email && (
          <a href={`mailto:${lead.email}`} style={quickLinkStyle("var(--aire-text-2)", "var(--aire-card-warm)")}>@ EMAIL</a>
        )}
        {lead.linkedinUrl && (
          <a href={lead.linkedinUrl.startsWith("http") ? lead.linkedinUrl : `https://${lead.linkedinUrl}`}
            target="_blank" rel="noopener noreferrer"
            style={quickLinkStyle("var(--aire-text-2)", "var(--aire-card-warm)")}>
            in LI
          </a>
        )}
        <button onClick={generateAI} style={quickLinkStyle("var(--aire-coral)", "var(--aire-coral-soft)")}>
          ✦ AI DRAFT
        </button>
      </div>

      {/* ── AI draft panel ── */}
      {showAI && (
        <div style={{
          background: "rgba(238,129,114,0.06)",
          border: "1px solid rgba(238,129,114,0.18)",
          borderRadius: "12px",
          padding: "14px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--aire-coral)", fontWeight: 500 }}>✦ AI FOLLOW-UP</span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button onClick={generateAI} style={{ ...tinyBtnStyle, border: "1px solid rgba(238,129,114,0.3)", color: "var(--aire-coral)" }}>
                REDO
              </button>
              {aiStream && (
                <button onClick={() => { navigator.clipboard.writeText(aiStream); setCopyFlash(true); setTimeout(() => setCopyFlash(false), 1500); }}
                  style={{ ...tinyBtnStyle, background: copyFlash ? "var(--aire-coral)" : "transparent", color: copyFlash ? "#09090B" : "var(--aire-text-2)", border: "1px solid var(--aire-border)" }}>
                  {copyFlash ? "COPIED ✓" : "COPY"}
                </button>
              )}
            </div>
          </div>
          <div ref={aiRef} style={{
            fontSize: "13px", color: "var(--aire-text)", lineHeight: "1.6",
            whiteSpace: "pre-wrap", minHeight: "48px", maxHeight: "180px", overflowY: "auto",
          }}>
            {aiLoading
              ? <span style={{ color: "var(--aire-muted)" }}>Drafting…</span>
              : aiStream || <span style={{ color: "var(--aire-muted)" }}>Generating…</span>
            }
          </div>
          {aiStream && lead.phone && (
            <a href={`sms:${lead.phone}&body=${encodeURIComponent(aiStream)}`}
              style={{ ...tinyBtnStyle, display: "inline-block", marginTop: "10px", textDecoration: "none", background: "var(--aire-coral)", color: "#09090B", border: "none", fontWeight: 700 }}>
              SEND SMS →
            </a>
          )}
        </div>
      )}

      {/* ── Key details ── */}
      <div style={{
        background: "var(--aire-card)",
        border: "1px solid var(--aire-border)",
        borderRadius: "12px",
        padding: "14px",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "10px",
      }}>
        {lead.phone && <Detail label="Phone" value={lead.phone} />}
        {lead.email && <Detail label="Email" value={lead.email} ellipsis />}
        {lead.type && <Detail label="Type" value={lead.type.charAt(0).toUpperCase() + lead.type.slice(1)} />}
        {(lead.priceMin || lead.priceMax) && (
          <Detail label="Budget" value={
            lead.priceMin && lead.priceMax
              ? `${fmt(lead.priceMin)} – ${fmt(lead.priceMax)}`
              : lead.priceMin ? `${fmt(lead.priceMin)}+` : `Up to ${fmt(lead.priceMax)}`
          } />
        )}
        {lead.areas && <Detail label="Areas" value={lead.areas} />}
        {lead.timeline && <Detail label="Timeline" value={lead.timeline} />}
        {lead.nextActionNote && <Detail label="Next action" value={lead.nextActionNote} span2 />}
        {lead.motivation && <Detail label="Motivation" value={lead.motivation} span2 ellipsis />}
      </div>

      {/* ── Log activity ── */}
      <div style={{
        background: "var(--aire-card)",
        border: "1px solid var(--aire-border)",
        borderRadius: "12px",
        padding: "14px",
      }}>
        <p style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: "10px", fontWeight: 500 }}>
          LOG ACTIVITY
        </p>
        <div style={{ display: "flex", gap: "4px", marginBottom: "8px", flexWrap: "wrap" }}>
          {(["note", "call", "text", "email"] as const).map(m => (
            <button key={m} onClick={() => setLogMethod(m)}
              style={{
                fontSize: "9px", letterSpacing: "0.12em", padding: "4px 8px",
                borderRadius: "5px", border: "1px solid var(--aire-border)",
                background: logMethod === m ? "var(--aire-coral)" : "transparent",
                color: logMethod === m ? "#09090B" : "var(--aire-muted)",
                cursor: "pointer", fontWeight: logMethod === m ? 700 : 400,
              }}>
              {m.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            value={logNote}
            onChange={e => setLogNote(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addLog()}
            placeholder="Add a note..."
            className="aire-input"
            style={{ flex: 1, fontSize: "12px" }}
          />
          <button onClick={addLog} disabled={addingLog || !logNote.trim()} className="btn-coral"
            style={{ fontSize: "10px", padding: "8px 14px", opacity: logNote.trim() ? 1 : 0.4 }}>
            LOG
          </button>
        </div>
      </div>

      {/* ── Pending tasks ── */}
      {pendingTasks.length > 0 && (
        <div style={{ background: "var(--aire-card)", border: "1px solid var(--aire-border)", borderRadius: "12px", padding: "14px" }}>
          <p style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: "10px", fontWeight: 500 }}>
            TASKS ({pendingTasks.length})
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {pendingTasks.slice(0, 5).map(task => (
              <div key={task.id} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                <button onClick={() => toggleTask(task)} style={{
                  width: "16px", height: "16px", borderRadius: "4px", flexShrink: 0, marginTop: "1px",
                  background: "transparent", border: "1px solid var(--aire-border-2)",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }} />
                <span style={{ fontSize: "13px", color: "var(--aire-text)", lineHeight: "1.4" }}>{task.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Activity timeline ── */}
      {recentLogs.length > 0 && (
        <div style={{ background: "var(--aire-card)", border: "1px solid var(--aire-border)", borderRadius: "12px", padding: "14px" }}>
          <p style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: "12px", fontWeight: 500 }}>
            RECENT ACTIVITY
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {recentLogs.map((log, i) => (
              <div key={log.id} style={{
                display: "flex", gap: "10px", paddingBottom: "12px",
                position: "relative", alignItems: "flex-start",
              }}>
                {i < recentLogs.length - 1 && (
                  <div style={{ position: "absolute", left: "9px", top: "20px", bottom: 0, width: "1px", background: "var(--aire-border)" }} />
                )}
                <div style={{
                  width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0, zIndex: 1,
                  background: "var(--aire-card-warm)", border: "1px solid var(--aire-border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "9px", color: "var(--aire-text-2)",
                }}>
                  {METHOD_ICONS[log.method] ?? "●"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "6px" }}>
                    <span style={{ fontSize: "10px", letterSpacing: "0.10em", color: "var(--aire-text-2)", fontWeight: 500 }}>
                      {log.method.toUpperCase()}
                    </span>
                    <span style={{ fontSize: "10px", color: "var(--aire-muted)", flexShrink: 0 }}>{timeAgo(log.createdAt)}</span>
                  </div>
                  {log.note && (
                    <p style={{ fontSize: "12px", color: "var(--aire-text)", margin: "2px 0 0 0", lineHeight: "1.4", wordBreak: "break-word" }}>
                      {log.note}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Notes ── */}
      {lead.notes && (
        <div style={{ background: "var(--aire-card)", border: "1px solid var(--aire-border)", borderRadius: "12px", padding: "14px" }}>
          <p style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: "8px", fontWeight: 500 }}>NOTES</p>
          <p style={{ fontSize: "13px", color: "var(--aire-text)", lineHeight: "1.6" }}>{lead.notes}</p>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ paddingBottom: "8px", display: "flex", justifyContent: "flex-end" }}>
        <Link href={`/contacts/${lead.id}`} style={{
          fontSize: "11px", letterSpacing: "0.12em", color: "var(--aire-muted)",
          textDecoration: "none",
        }}>
          Edit / Full Profile →
        </Link>
      </div>
    </div>
  );
}

// ── Helpers ──
function quickLinkStyle(color: string, bg: string): React.CSSProperties {
  return {
    fontSize: "10px", letterSpacing: "0.12em", fontWeight: 600,
    padding: "6px 12px", borderRadius: "6px",
    background: bg, color, border: "none",
    cursor: "pointer", textDecoration: "none", display: "inline-block",
    fontFamily: "inherit",
  };
}

const tinyBtnStyle: React.CSSProperties = {
  fontSize: "9px", letterSpacing: "0.12em", fontWeight: 600,
  padding: "4px 10px", borderRadius: "5px",
  background: "transparent", cursor: "pointer", fontFamily: "inherit",
};

function Detail({ label, value, span2, ellipsis }: {
  label: string; value: string | null | undefined; span2?: boolean; ellipsis?: boolean;
}) {
  if (!value) return null;
  return (
    <div style={{ gridColumn: span2 ? "1 / -1" : undefined }}>
      <p style={{ fontSize: "9px", letterSpacing: "0.14em", color: "var(--aire-muted)", fontWeight: 500, marginBottom: "2px" }}>
        {label.toUpperCase()}
      </p>
      <p style={{
        fontSize: "12px", color: "var(--aire-text)", lineHeight: "1.4",
        overflow: ellipsis ? "hidden" : undefined,
        textOverflow: ellipsis ? "ellipsis" : undefined,
        whiteSpace: ellipsis ? "nowrap" : undefined,
      }}>
        {value}
      </p>
    </div>
  );
}
