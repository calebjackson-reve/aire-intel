"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import SocialPanel from "@/components/SocialPanel";
import ReadyForTCChecklist from "@/components/ReadyForTCChecklist";
import StageProgressor from "@/components/StageProgressor";
import ContactQuickActions from "@/components/ContactQuickActions";
import LoopPanel from "@/components/LoopPanel";
import LinkedInOutreachCard, { type OutreachRecord } from "@/components/LinkedInOutreachCard";
import LeadTemperature from "@/components/LeadTemperature";
import SellIntent from "@/components/SellIntent";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContactLog {
  id: string;
  method: string;
  note: string | null;
  direction: string;
  createdAt: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: string;
  done: boolean;
  doneAt: string | null;
}

interface Lead {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  stage: string;
  type: string;
  pricePoint: number | null;
  priceMin: number | null;
  priceMax: number | null;
  address: string | null;
  beds: number | null;
  baths: number | null;
  areas: string | null;
  motivation: string | null;
  timeline: string | null;
  preApproved: boolean;
  preApprovalAmt: number | null;
  referredBy: string | null;
  source: string | null;
  tags: string | null;
  lastContactDate: string | null;
  nextActionDate: string | null;
  nextActionNote: string | null;
  contractDate: string | null;
  closingDate: string | null;
  assignedTo: string | null;
  notes: string | null;
  loftyId: string | null;
  // Social handles
  instagramHandle: string | null;
  facebookUrl: string | null;
  facebookName: string | null;
  linkedinUrl: string | null;
  tiktokHandle: string | null;
  twitterHandle: string | null;
  createdAt: string;
  timeline_logs: ContactLog[];
  tasks: Task[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  new_lead: "NEW LEAD",
  active: "ACTIVE",
  showing: "SHOWING",
  under_contract: "UNDER CONTRACT",
  closed: "CLOSED",
};

/** Map a stage to a pill utility class (cream theme). */
const STAGE_PILL: Record<string, string> = {
  new_lead: "pill",
  active: "pill pill-coral",
  showing: "pill pill-cream",
  under_contract: "pill pill-coral",
  closed: "pill pill-mint",
};

const METHOD_ICONS: Record<string, string> = {
  text: "✉",
  call: "☎",
  email: "✉",
  showing: "🏠",
  meeting: "●",
  note: "✎",
  ai_message: "✦",
};

function fmt(n: number | null | undefined, prefix = "$") {
  if (n == null) return null;
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(0)}K`;
  return `${prefix}${n}`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDate(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContactProfile() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);

  // Timeline
  const [logMethod, setLogMethod] = useState("note");
  const [logNote, setLogNote] = useState("");
  const [logDirection, setLogDirection] = useState("outbound");
  const [addingLog, setAddingLog] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Lead>>({});

  // Tasks
  const [newTask, setNewTask] = useState("");
  const [addingTask, setAddingTask] = useState(false);

  // AI follow-up
  const [showAI, setShowAI] = useState(false);
  const [aiStream, setAiStream] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const aiRef = useRef<HTMLDivElement>(null);

  // Ref for the LOG ACTIVITY card so the sticky sidebar can scroll to it
  const logSectionRef = useRef<HTMLDivElement>(null);

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Inline edit — Next Action (date + note). Click to edit, blur to save.
  const [editingNextAction, setEditingNextAction] = useState(false);
  const [naDateDraft, setNaDateDraft] = useState("");
  const [naNoteDraft, setNaNoteDraft] = useState("");
  const [naSaving, setNaSaving] = useState(false);
  const [naSavedFlash, setNaSavedFlash] = useState(false);

  // Lofty deep-sync (notes + tasks pull-down for this lead)
  const [refreshingLofty, setRefreshingLofty] = useState(false);
  const [loftyToast, setLoftyToast] = useState<string | null>(null);

  // Direct-send state for AI drafts (Twilio + SendGrid)
  const [sendingChannel, setSendingChannel] = useState<"sms" | "email" | null>(null);
  const [sendToast, setSendToast] = useState<string | null>(null);

  // LinkedIn outreach panel
  const [showLinkedIn, setShowLinkedIn] = useState(false);
  const [liOutreach, setLiOutreach] = useState<OutreachRecord[]>([]);
  const [liLoaded, setLiLoaded] = useState(false);
  const [liGenerating, setLiGenerating] = useState(false);
  const [liContext, setLiContext] = useState("");

  useEffect(() => {
    fetch(`/api/contacts/${id}`)
      .then(r => r.json())
      .then(data => { setLead(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (aiRef.current) aiRef.current.scrollTop = aiRef.current.scrollHeight;
  }, [aiStream]);

  async function saveEdit() {
    const res = await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editData),
    });
    const updated = await res.json();
    setLead(prev => prev ? { ...prev, ...updated } : updated);
    setEditing(false);
    setEditData({});
  }

  /** Inline PATCH helper — used by Next Action inline editor and (later) other inline edits. */
  async function patchLead(patch: Partial<Lead>) {
    const res = await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(await res.text());
    const updated = await res.json();
    setLead(prev => prev ? { ...prev, ...updated } : updated);
    return updated;
  }

  function startEditingNextAction() {
    if (!lead) return;
    setNaDateDraft(lead.nextActionDate ? lead.nextActionDate.slice(0, 10) : "");
    setNaNoteDraft(lead.nextActionNote ?? "");
    setEditingNextAction(true);
  }

  async function saveNextAction() {
    if (!lead) return;
    setNaSaving(true);
    try {
      await patchLead({
        nextActionDate: naDateDraft ? new Date(naDateDraft).toISOString() : null,
        nextActionNote: naNoteDraft.trim() || null,
      });
      setEditingNextAction(false);
      setNaSavedFlash(true);
      setTimeout(() => setNaSavedFlash(false), 1500);
    } catch {
      // Keep editor open on failure
    } finally {
      setNaSaving(false);
    }
  }

  /** Advance the lead to a new stage. Backed by the existing PATCH /api/contacts/[id]. */
  async function advanceStage(nextStage: string) {
    if (!lead) return;
    try {
      await patchLead({ stage: nextStage });
      // If we just entered under_contract, the server kicked off milestone
      // task generation (inspection +7d, appraisal +14d). Those tasks aren't
      // in the PATCH response — refetch so they appear in the right sidebar.
      if (nextStage === "under_contract" && lead.stage !== "under_contract") {
        // Small delay to give the background generation time to land
        setTimeout(async () => {
          const fresh = await fetch(`/api/contacts/${id}`).then((r) => r.json());
          setLead(fresh);
        }, 600);
      }
    } catch {
      // Errors surface via the patchLead path (no UI yet — to add later)
    }
  }

  /**
   * Send the current AI draft as an SMS or email via Twilio/SendGrid. Falls
   * back to mailto:/sms: if the integration isn't connected.
   */
  async function sendAIDraft(channel: "sms" | "email") {
    if (!lead || !aiStream) return;
    setSendingChannel(channel);
    setSendToast(null);
    try {
      if (channel === "sms") {
        if (!lead.phone) {
          setSendToast("No phone on file");
          return;
        }
        const res = await fetch("/api/sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: lead.id, to: lead.phone, message: aiStream }),
        });
        const data = await res.json();
        if (data.ok) {
          setSendToast(`SMS sent · ${data.status ?? "queued"}`);
          // Refetch to pick up the new ContactLog entry
          const fresh = await fetch(`/api/contacts/${id}`).then((r) => r.json());
          setLead(fresh);
        } else {
          // Twilio not configured → fall back to native sms: link
          if (res.status === 503) {
            window.location.href = `sms:${lead.phone}&body=${encodeURIComponent(aiStream)}`;
            return;
          }
          setSendToast(`SMS failed: ${data.error?.slice(0, 60) ?? "unknown"}`);
        }
      } else {
        if (!lead.email) {
          setSendToast("No email on file");
          return;
        }
        const res = await fetch("/api/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: lead.id,
            to: lead.email,
            subject: `Following up — ${lead.firstName ?? lead.name.split(" ")[0]}`,
            message: aiStream,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          setSendToast("Email sent ✓");
          const fresh = await fetch(`/api/contacts/${id}`).then((r) => r.json());
          setLead(fresh);
        } else {
          if (res.status === 503) {
            const subject = encodeURIComponent(`Following up — ${lead.firstName ?? lead.name.split(" ")[0]}`);
            const body = encodeURIComponent(aiStream);
            window.location.href = `mailto:${lead.email}?subject=${subject}&body=${body}`;
            return;
          }
          setSendToast(`Email failed: ${data.error?.slice(0, 60) ?? "unknown"}`);
        }
      }
    } finally {
      setSendingChannel(null);
      setTimeout(() => setSendToast(null), 3500);
    }
  }

  /** Trigger TC packet send for the current lead (same flow as TCHandoffPanel). */
  async function sendTCPacket() {
    if (!lead) return;
    try {
      const res = await fetch("/api/handoff/tc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const { packet } = await res.json();
      if (packet) {
        const to = packet.to ?? "";
        const subject = encodeURIComponent(packet.subject);
        const body = encodeURIComponent(packet.body);
        window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
      }
      // Re-fetch to surface the new tc_handoff timeline entry
      const fresh = await fetch(`/api/contacts/${id}`).then((r) => r.json());
      setLead(fresh);
    } catch {
      // Silent for now
    }
  }

  /**
   * Pull fresh notes + tasks from Lofty for this lead, then re-fetch the contact
   * so the new entries appear in the timeline.
   */
  async function refreshFromLofty() {
    if (!lead?.loftyId) return;
    setRefreshingLofty(true);
    setLoftyToast(null);
    try {
      const res = await fetch(`/api/lofty/sync-lead/${lead.id}`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setLoftyToast(`Lofty refresh failed: ${data.error?.slice(0, 60) ?? "unknown error"}`);
      } else {
        // Refetch contact so new logs/tasks appear in the timeline
        const fresh = await fetch(`/api/contacts/${id}`).then((r) => r.json());
        setLead(fresh);
        const parts: string[] = [];
        if (data.notesAdded > 0) parts.push(`+${data.notesAdded} note${data.notesAdded === 1 ? "" : "s"}`);
        if (data.tasksAdded > 0) parts.push(`+${data.tasksAdded} task${data.tasksAdded === 1 ? "" : "s"}`);
        if (data.tasksUpdated > 0) parts.push(`${data.tasksUpdated} updated`);
        setLoftyToast(parts.length ? `Lofty: ${parts.join(", ")}` : "Lofty: already up to date");
      }
    } catch (e) {
      setLoftyToast(`Lofty refresh failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRefreshingLofty(false);
      setTimeout(() => setLoftyToast(null), 3500);
    }
  }

  async function loadLinkedInOutreach() {
    if (liLoaded) return;
    const records = await fetch(`/api/linkedin/outreach?leadId=${id}`).then(r => r.json());
    setLiOutreach(records);
    setLiLoaded(true);
  }

  async function generateLinkedInMessage() {
    if (!lead) return;
    setLiGenerating(true);
    try {
      const res = await fetch("/api/linkedin/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: id, context: liContext }),
      });
      const newRecord: OutreachRecord = await res.json();
      setLiOutreach(prev => [newRecord, ...prev]);
    } finally {
      setLiGenerating(false);
      setLiContext("");
    }
  }

  async function addLog() {
    if (!logNote.trim() && logMethod === "note") return;
    setAddingLog(true);
    const res = await fetch(`/api/contacts/${id}/timeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: logMethod, note: logNote, direction: logDirection }),
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
    const res = await fetch(`/api/tasks`, {
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

  async function addTask() {
    if (!newTask.trim()) return;
    setAddingTask(true);
    const res = await fetch(`/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: id, title: newTask }),
    });
    const task = await res.json();
    setLead(prev => prev ? { ...prev, tasks: [...prev.tasks, task] } : prev);
    setNewTask("");
    setAddingTask(false);
  }

  async function generateFollowUp() {
    setAiLoading(true);
    setAiStream("");
    const res = await fetch("/api/followup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead }),
    });
    const reader = res.body?.getReader();
    const dec = new TextDecoder();
    if (!reader) return;
    setAiLoading(false);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      setAiStream(prev => prev + dec.decode(value));
    }
  }

  async function deleteLead() {
    await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    router.push("/contacts");
  }

  if (loading) {
    return (
      <div style={{ padding: "80px 40px", textAlign: "center", color: "var(--aire-muted)", fontSize: "13px", letterSpacing: "0.14em" }}>
        LOADING...
      </div>
    );
  }

  if (!lead) {
    return (
      <div style={{ padding: "80px 40px", textAlign: "center" }}>
        <p style={{ color: "var(--aire-muted)", fontSize: "13px" }}>Contact not found.</p>
        <Link href="/contacts" style={{ color: "var(--aire-coral-deep)", fontSize: "12px", letterSpacing: "0.12em" }}>← BACK TO CONTACTS</Link>
      </div>
    );
  }

  const stagePillClass = STAGE_PILL[lead.stage] ?? "pill";
  const daysSinceContact = lead.lastContactDate
    ? Math.floor((Date.now() - new Date(lead.lastContactDate).getTime()) / 86400000)
    : null;

  return (
    <div style={{ padding: "32px 40px", maxWidth: "1100px", margin: "0 auto" }}>

      {/* Sticky right-edge quick-actions panel. Always-visible call/text/email
          /AI/log/TC buttons so Caleb never has to scroll to find an action. */}
      <ContactQuickActions
        lead={lead}
        onAIFollowUp={() => { setShowAI(true); if (!aiStream) generateFollowUp(); }}
        onScrollToLog={() => logSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        onSendTCPacket={sendTCPacket}
      />

      {/* ── Back ── */}
      <Link href="/contacts" style={{ fontSize: "11px", letterSpacing: "0.14em", color: "var(--aire-muted)", textDecoration: "none", display: "inline-block", marginBottom: "24px" }}>
        ← CONTACTS
      </Link>

      {/* ── Header ── */}
      <div
        className="hero-blob-wrap"
        style={{
          position: "relative",
          overflow: "hidden",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "32px",
          padding: "8px 4px 16px",
        }}
      >
        {/* Subtle blobs behind the lead name */}
        <div className="blob blob-coral" style={{ top: "-40px", right: "22%", opacity: 0.35 }} />
        <div className="blob blob-cream" style={{ top: "40px", right: "-30px", opacity: 0.4 }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px", flexWrap: "wrap" }}>
            <h1 className="font-display" style={{ fontSize: "34px", fontWeight: 500, color: "var(--aire-text)", margin: 0, letterSpacing: "-0.01em" }}>
              {lead.name}
            </h1>
            <span className={stagePillClass}>
              {STAGE_LABELS[lead.stage] ?? lead.stage.toUpperCase()}
            </span>
            {lead.loftyId && (
              <span className="pill" style={{ fontSize: "10px", letterSpacing: "0.12em", color: "var(--aire-text-2)" }}>
                LOFTY #{lead.loftyId}
              </span>
            )}
            <StageProgressor lead={lead} onAdvance={advanceStage} />
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                className="pill"
                style={{ textDecoration: "none", fontSize: "12px", color: "var(--aire-text)", letterSpacing: "0.02em" }}
              >
                ☎ {lead.phone}
              </a>
            )}
            {lead.email && (
              <a
                href={`mailto:${lead.email}`}
                className="pill"
                style={{ textDecoration: "none", fontSize: "12px", color: "var(--aire-text)", letterSpacing: "0.02em" }}
              >
                ✉ {lead.email}
              </a>
            )}
            {daysSinceContact !== null && (
              <span
                className={daysSinceContact > 7 ? "pill pill-coral" : "pill"}
                style={{ fontSize: "11px", letterSpacing: "0.06em" }}
              >
                {daysSinceContact === 0 ? "contacted today" : `last contact ${daysSinceContact}d ago`}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center", position: "relative", zIndex: 1 }}>
          <button
            onClick={() => { setShowAI(!showAI); if (!showAI && !aiStream) generateFollowUp(); }}
            className="btn-coral"
            style={{ fontSize: "11px", letterSpacing: "0.14em", padding: "10px 18px" }}
          >
            ✦ AI FOLLOW-UP
          </button>
          <button
            onClick={() => { setEditing(true); setEditData(lead); }}
            className="btn-ghost"
            style={{ fontSize: "11px", letterSpacing: "0.14em", padding: "10px 18px" }}
          >
            EDIT
          </button>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{
                fontSize: "11px",
                letterSpacing: "0.14em",
                padding: "10px 14px",
                background: "transparent",
                border: "none",
                color: "var(--aire-muted)",
                cursor: "pointer",
              }}
            >
              ⋯
            </button>
          ) : (
            <button
              onClick={deleteLead}
              style={{
                fontSize: "11px",
                letterSpacing: "0.14em",
                padding: "10px 14px",
                background: "transparent",
                border: "1px solid var(--aire-coral)",
                color: "var(--aire-coral-deep)",
                borderRadius: "999px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              DELETE?
            </button>
          )}
        </div>
      </div>

      {/* ── AI Panel ── */}
      {showAI && (
        <div className="card-ink" style={{ padding: "20px", marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", gap: "12px", flexWrap: "wrap" }}>
            <p style={{ fontSize: "10px", letterSpacing: "0.18em", color: "var(--aire-cream)", margin: 0, fontWeight: 500 }}>
              ✦ AI FOLLOW-UP DRAFT
            </p>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                onClick={generateFollowUp}
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.14em",
                  padding: "6px 14px",
                  background: "transparent",
                  border: "1px solid var(--aire-border-ink)",
                  color: "var(--aire-text-inv)",
                  borderRadius: "999px",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                REGENERATE
              </button>
              {aiStream && lead.phone && (
                <button
                  onClick={() => sendAIDraft("sms")}
                  disabled={sendingChannel !== null}
                  title={`Send via Twilio to ${lead.phone}`}
                  style={{
                    fontSize: "10px",
                    letterSpacing: "0.14em",
                    padding: "6px 14px",
                    background: "var(--aire-coral)",
                    border: "1px solid var(--aire-coral)",
                    color: "var(--aire-ink)",
                    borderRadius: "999px",
                    cursor: sendingChannel !== null ? "wait" : "pointer",
                    fontWeight: 700,
                  }}
                >
                  {sendingChannel === "sms" ? "SENDING…" : "SEND SMS →"}
                </button>
              )}
              {aiStream && lead.email && (
                <button
                  onClick={() => sendAIDraft("email")}
                  disabled={sendingChannel !== null}
                  title={`Send via SendGrid to ${lead.email}`}
                  style={{
                    fontSize: "10px",
                    letterSpacing: "0.14em",
                    padding: "6px 14px",
                    background: "transparent",
                    border: "1px solid var(--aire-coral)",
                    color: "var(--aire-coral)",
                    borderRadius: "999px",
                    cursor: sendingChannel !== null ? "wait" : "pointer",
                    fontWeight: 600,
                  }}
                >
                  {sendingChannel === "email" ? "SENDING…" : "SEND EMAIL →"}
                </button>
              )}
              {aiStream && (
                <button
                  onClick={() => navigator.clipboard.writeText(aiStream)}
                  style={{
                    fontSize: "10px",
                    letterSpacing: "0.14em",
                    padding: "6px 14px",
                    background: "transparent",
                    border: "1px solid var(--aire-border-ink)",
                    color: "var(--aire-text-inv)",
                    borderRadius: "999px",
                    cursor: "pointer",
                  }}
                >
                  COPY
                </button>
              )}
            </div>
          </div>
          {sendToast && (
            <p style={{
              fontSize: "11px",
              color: sendToast.includes("failed") || sendToast.includes("No ")
                ? "var(--aire-coral)"
                : "var(--aire-mint)",
              marginBottom: "8px",
              letterSpacing: "0.04em",
            }}>
              {sendToast}
            </p>
          )}
          <div
            ref={aiRef}
            style={{
              background: "rgba(0,0,0,0.25)",
              border: "1px solid var(--aire-border-ink)",
              borderRadius: "12px",
              padding: "16px",
              minHeight: "80px",
              maxHeight: "240px",
              overflowY: "auto",
              fontSize: "13px",
              color: "var(--aire-text-inv)",
              lineHeight: "1.7",
              whiteSpace: "pre-wrap",
            }}
          >
            {aiLoading
              ? <span style={{ color: "var(--aire-muted-inv)" }}>Drafting...</span>
              : aiStream || <span style={{ color: "var(--aire-muted-inv)" }}>Generating follow-up...</span>}
          </div>
        </div>
      )}

      {/* ── Two-column layout ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "20px" }}>

        {/* LEFT: Timeline + Tasks */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Log Activity */}
          <div ref={logSectionRef} className="card-light" style={{ padding: "20px" }}>
            <p style={{ fontSize: "10px", letterSpacing: "0.18em", color: "var(--aire-muted)", marginBottom: "14px", fontWeight: 500 }}>
              LOG ACTIVITY
            </p>

            <div style={{ display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap" }}>
              {(["note", "call", "text", "email", "meeting", "showing"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setLogMethod(m)}
                  className={logMethod === m ? "pill pill-ink" : "pill"}
                  style={{ fontSize: "10px", letterSpacing: "0.14em", cursor: "pointer" }}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>

            {logMethod !== "note" && (
              <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
                {(["outbound", "inbound"] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setLogDirection(d)}
                    className={logDirection === d ? "pill pill-ink" : "pill"}
                    style={{ fontSize: "10px", letterSpacing: "0.12em", cursor: "pointer" }}
                  >
                    {d.toUpperCase()}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: "8px" }}>
              <input
                value={logNote}
                onChange={e => setLogNote(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addLog()}
                placeholder={`Add ${logMethod}...`}
                className="aire-input"
                style={{ flex: 1, fontSize: "13px" }}
              />
              <button
                onClick={addLog}
                disabled={addingLog}
                className="btn-primary"
                style={{ fontSize: "11px", letterSpacing: "0.14em", padding: "9px 20px" }}
              >
                LOG
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div className="card-light" style={{ padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "8px" }}>
              <p style={{ fontSize: "10px", letterSpacing: "0.18em", color: "var(--aire-muted)", fontWeight: 500 }}>
                ACTIVITY TIMELINE
              </p>
              {lead.loftyId && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {loftyToast && (
                    <span style={{
                      fontSize: "10px",
                      color: loftyToast.includes("failed") ? "var(--aire-coral-deep)" : "var(--aire-text-2)",
                      letterSpacing: "0.04em",
                    }}>
                      {loftyToast}
                    </span>
                  )}
                  <button
                    onClick={refreshFromLofty}
                    disabled={refreshingLofty}
                    title="Pull fresh notes + tasks from Lofty"
                    className="btn-ghost"
                    style={{
                      fontSize: "10px",
                      letterSpacing: "0.14em",
                      padding: "6px 12px",
                      cursor: refreshingLofty ? "wait" : "pointer",
                    }}
                  >
                    {refreshingLofty ? "SYNCING…" : "↻ LOFTY"}
                  </button>
                </div>
              )}
            </div>

            {lead.timeline_logs.length === 0 ? (
              <p style={{ fontSize: "12px", color: "var(--aire-muted)", fontStyle: "italic" }}>No activity logged yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                {lead.timeline_logs.map((log, i) => {
                  const isAI = log.method === "ai_message";
                  return (
                    <div key={log.id} style={{ display: "flex", gap: "14px", paddingBottom: "16px", position: "relative" }}>
                      {/* Vertical line */}
                      {i < lead.timeline_logs.length - 1 && (
                        <div style={{ position: "absolute", left: "12px", top: "26px", bottom: 0, width: "1px", background: "var(--aire-border)" }} />
                      )}
                      {/* Icon */}
                      <div style={{
                        width: "26px",
                        height: "26px",
                        borderRadius: "50%",
                        flexShrink: 0,
                        zIndex: 1,
                        background: isAI ? "var(--aire-coral-soft)" : "var(--aire-card-warm)",
                        border: `1px solid ${isAI ? "var(--aire-coral)" : "var(--aire-border)"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "11px",
                        color: isAI ? "var(--aire-coral-deep)" : "var(--aire-text-2)",
                      }}>
                        {METHOD_ICONS[log.method] ?? "●"}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "2px" }}>
                          <span style={{ fontSize: "11px", letterSpacing: "0.12em", color: "var(--aire-text)", fontWeight: 500 }}>
                            {log.method.toUpperCase()}
                            {log.direction === "inbound" && (
                              <span style={{ marginLeft: "6px", fontSize: "10px", color: "var(--aire-text-2)" }}>INBOUND</span>
                            )}
                          </span>
                          <span style={{ fontSize: "11px", color: "var(--aire-muted)" }}>{timeAgo(log.createdAt)}</span>
                        </div>
                        {log.note && (
                          <p style={{ fontSize: "13px", color: "var(--aire-text)", margin: 0, lineHeight: "1.5" }}>{log.note}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tasks */}
          <div className="card-light" style={{ padding: "20px" }}>
            <p style={{ fontSize: "10px", letterSpacing: "0.18em", color: "var(--aire-muted)", marginBottom: "16px", fontWeight: 500 }}>
              TASKS
            </p>

            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <input
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addTask()}
                placeholder="Add a task..."
                className="aire-input"
                style={{ flex: 1, fontSize: "13px" }}
              />
              <button
                onClick={addTask}
                disabled={addingTask || !newTask.trim()}
                className="btn-coral"
                style={{
                  fontSize: "11px",
                  letterSpacing: "0.14em",
                  padding: "9px 20px",
                  opacity: newTask.trim() ? 1 : 0.4,
                  cursor: newTask.trim() ? "pointer" : "not-allowed",
                }}
              >
                ADD
              </button>
            </div>

            {lead.tasks.length === 0 ? (
              <p style={{ fontSize: "12px", color: "var(--aire-muted)", fontStyle: "italic" }}>No tasks yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {lead.tasks.map(task => (
                  <div
                    key={task.id}
                    style={{
                      display: "flex",
                      gap: "12px",
                      alignItems: "flex-start",
                      padding: "10px 12px",
                      background: "var(--aire-card-warm)",
                      borderRadius: "10px",
                      border: "1px solid var(--aire-border)",
                      opacity: task.done ? 0.55 : 1,
                      transition: "opacity 200ms",
                    }}
                  >
                    <button
                      onClick={() => toggleTask(task)}
                      style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "4px",
                        flexShrink: 0,
                        marginTop: "1px",
                        background: task.done ? "var(--aire-mint)" : "transparent",
                        border: `1px solid ${task.done ? "var(--aire-mint)" : "var(--aire-border-2)"}`,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "11px",
                        color: "var(--aire-ink)",
                      }}
                    >
                      {task.done && "✓"}
                    </button>
                    <div style={{ flex: 1 }}>
                      <p style={{
                        fontSize: "13px",
                        color: "var(--aire-text)",
                        margin: 0,
                        textDecoration: task.done ? "line-through" : "none",
                      }}>
                        {task.title}
                      </p>
                      {task.dueDate && (
                        <p style={{ fontSize: "11px", color: "var(--aire-muted)", margin: "2px 0 0 0" }}>
                          Due {fmtDate(task.dueDate)}
                        </p>
                      )}
                    </div>
                    {task.priority === "urgent" && (
                      <span className="pill pill-coral" style={{ fontSize: "9px", letterSpacing: "0.14em" }}>URGENT</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Details sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Lead temperature — learned score + why */}
          <LeadTemperature leadId={lead.id} />

          {/* Sell intent — PropStream attributes + first-party engagement */}
          <SellIntent leadId={lead.id} />

          {/* Contact Details */}
          <div className="card-light" style={{ padding: "20px" }}>
            <p style={{ fontSize: "10px", letterSpacing: "0.18em", color: "var(--aire-muted)", marginBottom: "14px", fontWeight: 500 }}>
              CONTACT DETAILS
            </p>

            <DetailRow label="Type" value={lead.type?.toUpperCase()} />
            <DetailRow label="Source" value={lead.source} />
            <DetailRow label="Referred by" value={lead.referredBy} />
            <DetailRow label="Assigned to" value={lead.assignedTo} />
            <DetailRow label="Added" value={fmtDate(lead.createdAt)} />
            {lead.tags && <DetailRow label="Tags" value={lead.tags} />}
          </div>

          {/* Social — one-tap DM / profile open to IG, FB, LinkedIn, TikTok, X */}
          <SocialPanel
            lead={lead}
            onUpdate={(patch) => setLead((prev) => (prev ? { ...prev, ...patch } : prev))}
          />

          {/* LinkedIn Outreach — only renders when linkedinUrl is set */}
          {lead.linkedinUrl && (
            <div className="card-light" style={{ padding: "20px" }}>
              <button
                onClick={() => {
                  setShowLinkedIn(v => !v);
                  if (!liLoaded) loadLinkedInOutreach();
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <p style={{ fontSize: "10px", letterSpacing: "0.18em", color: "var(--aire-muted)", fontWeight: 500, margin: 0 }}>
                  LINKEDIN OUTREACH
                </p>
                <span style={{ fontSize: "12px", color: "var(--aire-muted)", transition: "transform 200ms", transform: showLinkedIn ? "rotate(180deg)" : "none" }}>
                  ▾
                </span>
              </button>

              {showLinkedIn && (
                <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                  {/* Generate row */}
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      value={liContext}
                      onChange={e => setLiContext(e.target.value)}
                      placeholder="Context (optional)..."
                      className="aire-input"
                      style={{ flex: 1, fontSize: "12px" }}
                    />
                    <button
                      onClick={generateLinkedInMessage}
                      disabled={liGenerating}
                      className="btn-coral"
                      style={{
                        fontSize: "10px",
                        letterSpacing: "0.14em",
                        padding: "8px 16px",
                        cursor: liGenerating ? "wait" : "pointer",
                        opacity: liGenerating ? 0.7 : 1,
                        flexShrink: 0,
                      }}
                    >
                      {liGenerating ? "…" : "✦ GENERATE"}
                    </button>
                  </div>

                  {/* History */}
                  {liOutreach.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "var(--aire-muted)", fontStyle: "italic" }}>
                      No messages yet.
                    </p>
                  ) : (
                    liOutreach.map(record => (
                      <LinkedInOutreachCard
                        key={record.id}
                        record={record}
                        linkedinUrl={lead.linkedinUrl}
                        onUpdate={updated =>
                          setLiOutreach(prev => prev.map(r => r.id === updated.id ? updated : r))
                        }
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Property Interest */}
          <div className="card-light" style={{ padding: "20px" }}>
            <p style={{ fontSize: "10px", letterSpacing: "0.18em", color: "var(--aire-muted)", marginBottom: "14px", fontWeight: 500 }}>
              PROPERTY INTEREST
            </p>

            {(lead.priceMin || lead.priceMax) && (
              <DetailRow
                label="Budget"
                value={
                  lead.priceMin && lead.priceMax
                    ? `${fmt(lead.priceMin)} – ${fmt(lead.priceMax)}`
                    : lead.priceMin ? `${fmt(lead.priceMin)}+` : `Up to ${fmt(lead.priceMax)}`
                }
              />
            )}
            {lead.beds && <DetailRow label="Beds" value={`${lead.beds}+`} />}
            {lead.baths && <DetailRow label="Baths" value={`${lead.baths}+`} />}
            {lead.areas && <DetailRow label="Areas" value={lead.areas} />}
            {lead.timeline && <DetailRow label="Timeline" value={lead.timeline} />}
            {lead.motivation && (
              <div style={{ marginTop: "12px" }}>
                <p style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: "4px", fontWeight: 500 }}>
                  MOTIVATION
                </p>
                <p style={{ fontSize: "12px", color: "var(--aire-text)", lineHeight: "1.5" }}>{lead.motivation}</p>
              </div>
            )}
          </div>

          {/* Pre-Approval */}
          {(lead.preApproved || lead.preApprovalAmt) && (
            <div
              style={{
                background: "var(--aire-mint-soft)",
                border: "1px solid var(--aire-mint)",
                borderRadius: "16px",
                padding: "18px 20px",
              }}
            >
              <p style={{ fontSize: "10px", letterSpacing: "0.18em", color: "#1F6B4A", marginBottom: "8px", fontWeight: 600 }}>
                ✓ PRE-APPROVED
              </p>
              {lead.preApprovalAmt && (
                <p className="font-display" style={{ fontSize: "26px", fontWeight: 500, color: "var(--aire-text)", margin: 0 }}>
                  {fmt(lead.preApprovalAmt)}
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="card-light" style={{ padding: "20px" }}>
            <p style={{ fontSize: "10px", letterSpacing: "0.18em", color: "var(--aire-muted)", marginBottom: "12px", fontWeight: 500 }}>
              NOTES
            </p>
            {editing ? (
              <textarea
                value={editData.notes ?? ""}
                onChange={e => setEditData(prev => ({ ...prev, notes: e.target.value }))}
                rows={5}
                className="aire-input"
                style={{ width: "100%", fontSize: "13px", resize: "vertical", boxSizing: "border-box" }}
              />
            ) : (
              <p style={{
                fontSize: "13px",
                color: lead.notes ? "var(--aire-text)" : "var(--aire-muted)",
                lineHeight: "1.6",
                fontStyle: lead.notes ? "normal" : "italic",
                margin: 0,
              }}>
                {lead.notes || "No notes yet."}
              </p>
            )}
          </div>

          {/* Contract dates — only renders when stage = under_contract.
              Drives the milestone task generator + Ready-for-TC checklist. */}
          {lead.stage === "under_contract" && (
            <div className="card-warm" style={{ padding: "20px" }}>
              <p style={{ fontSize: "10px", letterSpacing: "0.18em", color: "var(--aire-muted)", marginBottom: "14px", fontWeight: 500 }}>
                CONTRACT
              </p>
              <div style={{ display: "flex", gap: "10px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "9px", letterSpacing: "0.14em", color: "var(--aire-muted)", display: "block", marginBottom: "6px", fontWeight: 500 }}>
                    CONTRACT DATE
                  </label>
                  <input
                    type="date"
                    value={lead.contractDate ? lead.contractDate.slice(0, 10) : ""}
                    onChange={(e) => {
                      const v = e.target.value ? new Date(e.target.value).toISOString() : null;
                      patchLead({ contractDate: v }).catch(() => {});
                    }}
                    className="aire-input"
                    style={{ width: "100%", fontSize: "12px", padding: "6px 10px", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "9px", letterSpacing: "0.14em", color: "var(--aire-muted)", display: "block", marginBottom: "6px", fontWeight: 500 }}>
                    CLOSING DATE
                  </label>
                  <input
                    type="date"
                    value={lead.closingDate ? lead.closingDate.slice(0, 10) : ""}
                    onChange={(e) => {
                      const v = e.target.value ? new Date(e.target.value).toISOString() : null;
                      patchLead({ closingDate: v }).catch(() => {});
                    }}
                    className="aire-input"
                    style={{ width: "100%", fontSize: "12px", padding: "6px 10px", boxSizing: "border-box" }}
                  />
                </div>
              </div>
              {lead.closingDate && (
                <p style={{ fontSize: "11px", color: "var(--aire-text-2)", marginTop: "10px", fontStyle: "italic" }}>
                  Walk-through and closing-day tasks auto-generate on save.
                </p>
              )}
            </div>
          )}

          {/* Ready-for-TC checklist — only renders when stage = under_contract */}
          <ReadyForTCChecklist lead={lead} onSendPacket={sendTCPacket} />

          {/* Dotloop transaction panel — auto-hides when no loops linked */}
          <LoopPanel leadId={lead.id} />

          {/* Next Action — click anywhere on the card to edit inline */}
          <div
            onClick={() => { if (!editingNextAction) startEditingNextAction(); }}
            className="card-light"
            style={{
              padding: "20px",
              cursor: editingNextAction ? "default" : "text",
              transition: "border-color 220ms, box-shadow 220ms",
              borderColor: naSavedFlash
                ? "var(--aire-mint)"
                : editingNextAction
                  ? "var(--aire-coral)"
                  : undefined,
              boxShadow: naSavedFlash ? "0 0 0 3px var(--aire-mint-soft)" : undefined,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <p style={{ fontSize: "10px", letterSpacing: "0.18em", color: "var(--aire-muted)", fontWeight: 500 }}>
                NEXT ACTION
              </p>
              {!editingNextAction && (
                <span style={{
                  fontSize: "9px",
                  letterSpacing: "0.14em",
                  color: naSavedFlash ? "#1F6B4A" : "var(--aire-muted)",
                  opacity: 0.75,
                  fontWeight: 500,
                }}>
                  {naSavedFlash ? "✓ SAVED" : "TAP TO EDIT"}
                </span>
              )}
            </div>

            {editingNextAction ? (
              <div onClick={(e) => e.stopPropagation()}>
                <input
                  type="date"
                  value={naDateDraft}
                  onChange={(e) => setNaDateDraft(e.target.value)}
                  className="aire-input"
                  style={{ width: "100%", marginBottom: "8px", fontSize: "12px", padding: "8px 10px" }}
                  autoFocus
                />
                <textarea
                  value={naNoteDraft}
                  onChange={(e) => setNaNoteDraft(e.target.value)}
                  placeholder="What's next? (e.g. 'Call about Bocage offer')"
                  rows={2}
                  className="aire-input"
                  style={{ width: "100%", fontSize: "13px", padding: "8px 10px", resize: "vertical" }}
                />
                <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                  <button
                    onClick={saveNextAction}
                    disabled={naSaving}
                    className="btn-coral"
                    style={{ flex: 1, fontSize: "10px", letterSpacing: "0.14em", padding: "9px", cursor: naSaving ? "wait" : "pointer" }}
                  >
                    {naSaving ? "SAVING…" : "SAVE"}
                  </button>
                  <button
                    onClick={() => setEditingNextAction(false)}
                    disabled={naSaving}
                    className="btn-ghost"
                    style={{ fontSize: "10px", letterSpacing: "0.14em", padding: "9px 16px" }}
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            ) : (
              <>
                {lead.nextActionDate && (
                  <p style={{ fontSize: "12px", color: "var(--aire-coral-deep)", marginBottom: "4px", letterSpacing: "0.02em", fontWeight: 500 }}>
                    {fmtDate(lead.nextActionDate)}
                  </p>
                )}
                <p style={{
                  fontSize: "13px",
                  color: lead.nextActionNote ? "var(--aire-text)" : "var(--aire-muted)",
                  fontStyle: lead.nextActionNote ? "normal" : "italic",
                  margin: 0,
                  lineHeight: 1.5,
                }}>
                  {lead.nextActionNote || "No next action set. Tap to plan one."}
                </p>
              </>
            )}
          </div>

          {/* Quick links */}
          <div style={{ display: "flex", gap: "8px" }}>
            {lead.phone && (
              <a
                href={`sms:${lead.phone}`}
                className="btn-ghost"
                style={{
                  flex: 1,
                  fontSize: "11px",
                  letterSpacing: "0.14em",
                  padding: "11px",
                  textAlign: "center",
                  textDecoration: "none",
                }}
              >
                TEXT
              </a>
            )}
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                className="btn-ghost"
                style={{
                  flex: 1,
                  fontSize: "11px",
                  letterSpacing: "0.14em",
                  padding: "11px",
                  textAlign: "center",
                  textDecoration: "none",
                }}
              >
                CALL
              </a>
            )}
            {lead.email && (
              <a
                href={`mailto:${lead.email}`}
                className="btn-ghost"
                style={{
                  flex: 1,
                  fontSize: "11px",
                  letterSpacing: "0.14em",
                  padding: "11px",
                  textAlign: "center",
                  textDecoration: "none",
                }}
              >
                EMAIL
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── Edit Modal ── */}
      {editing && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(26,26,28,0.4)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            className="card-light"
            style={{
              padding: "32px",
              width: "100%",
              maxWidth: "600px",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 className="font-display" style={{ fontSize: "22px", fontWeight: 500, color: "var(--aire-text)", margin: 0 }}>
                Edit Contact
              </h2>
              <button
                onClick={() => { setEditing(false); setEditData({}); }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--aire-muted)",
                  fontSize: "22px",
                  cursor: "pointer",
                  lineHeight: 1,
                  padding: "4px 10px",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <EditField label="FIRST NAME" value={editData.firstName ?? ""} onChange={v => setEditData(p => ({ ...p, firstName: v }))} />
              <EditField label="LAST NAME" value={editData.lastName ?? ""} onChange={v => setEditData(p => ({ ...p, lastName: v }))} />
              <EditField label="PHONE" value={editData.phone ?? ""} onChange={v => setEditData(p => ({ ...p, phone: v }))} />
              <EditField label="EMAIL" value={editData.email ?? ""} onChange={v => setEditData(p => ({ ...p, email: v }))} />
              <div>
                <label style={{ fontSize: "10px", letterSpacing: "0.16em", color: "var(--aire-muted)", display: "block", marginBottom: "6px", fontWeight: 500 }}>
                  STAGE
                </label>
                <select
                  value={editData.stage ?? "new_lead"}
                  onChange={e => setEditData(p => ({ ...p, stage: e.target.value }))}
                  className="aire-input"
                  style={{ width: "100%", fontSize: "13px" }}
                >
                  {Object.entries(STAGE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "10px", letterSpacing: "0.16em", color: "var(--aire-muted)", display: "block", marginBottom: "6px", fontWeight: 500 }}>
                  TYPE
                </label>
                <select
                  value={editData.type ?? "buyer"}
                  onChange={e => setEditData(p => ({ ...p, type: e.target.value }))}
                  className="aire-input"
                  style={{ width: "100%", fontSize: "13px" }}
                >
                  {["buyer", "seller", "both", "investor", "referral"].map(v => <option key={v} value={v}>{v.toUpperCase()}</option>)}
                </select>
              </div>
              <EditField label="PRICE MIN" value={editData.priceMin?.toString() ?? ""} onChange={v => setEditData(p => ({ ...p, priceMin: v ? Number(v) : undefined }))} />
              <EditField label="PRICE MAX" value={editData.priceMax?.toString() ?? ""} onChange={v => setEditData(p => ({ ...p, priceMax: v ? Number(v) : undefined }))} />
              <EditField label="AREAS" value={editData.areas ?? ""} onChange={v => setEditData(p => ({ ...p, areas: v }))} />
              <EditField label="SOURCE" value={editData.source ?? ""} onChange={v => setEditData(p => ({ ...p, source: v }))} />
              <EditField label="REFERRED BY" value={editData.referredBy ?? ""} onChange={v => setEditData(p => ({ ...p, referredBy: v }))} />
              <EditField label="ASSIGNED TO" value={editData.assignedTo ?? ""} onChange={v => setEditData(p => ({ ...p, assignedTo: v }))} />
            </div>

            <div style={{ marginTop: "16px" }}>
              <label style={{ fontSize: "10px", letterSpacing: "0.16em", color: "var(--aire-muted)", display: "block", marginBottom: "6px", fontWeight: 500 }}>
                NOTES
              </label>
              <textarea
                value={editData.notes ?? ""}
                onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))}
                rows={4}
                className="aire-input"
                style={{ width: "100%", fontSize: "13px", resize: "vertical", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginTop: "16px" }}>
              <label style={{ fontSize: "10px", letterSpacing: "0.16em", color: "var(--aire-muted)", display: "block", marginBottom: "6px", fontWeight: 500 }}>
                NEXT ACTION
              </label>
              <input
                value={editData.nextActionNote ?? ""}
                onChange={e => setEditData(p => ({ ...p, nextActionNote: e.target.value }))}
                placeholder="e.g. Follow up re: pre-approval"
                className="aire-input"
                style={{ width: "100%", fontSize: "13px", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "28px", justifyContent: "flex-end" }}>
              <button
                onClick={() => { setEditing(false); setEditData({}); }}
                className="btn-ghost"
                style={{ fontSize: "11px", letterSpacing: "0.14em", padding: "10px 22px" }}
              >
                CANCEL
              </button>
              <button
                onClick={saveEdit}
                className="btn-coral"
                style={{ fontSize: "11px", letterSpacing: "0.14em", padding: "10px 22px" }}
              >
                SAVE CHANGES
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      padding: "7px 0",
      borderBottom: "1px solid var(--aire-border)",
    }}>
      <span style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--aire-muted)", fontWeight: 500 }}>
        {label.toUpperCase()}
      </span>
      <span style={{ fontSize: "12px", color: "var(--aire-text)", textAlign: "right", maxWidth: "60%" }}>
        {value}
      </span>
    </div>
  );
}

function EditField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ fontSize: "10px", letterSpacing: "0.16em", color: "var(--aire-muted)", display: "block", marginBottom: "6px", fontWeight: 500 }}>
        {label}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="aire-input"
        style={{ width: "100%", fontSize: "13px", boxSizing: "border-box" }}
      />
    </div>
  );
}
