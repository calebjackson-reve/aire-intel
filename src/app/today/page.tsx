"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle, SkipForward, ChevronRight } from "lucide-react";

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  stage: string;
  lastContactDate: string | null;
}

interface ActionItem {
  id: string;
  type: string;
  priority: number;
  payload: Record<string, unknown>;
  lead: Lead | null;
  createdAt: string;
}

interface QueueState {
  items: ActionItem[];
  total: number;
  done: number;
}

const TYPE_LABELS: Record<string, string> = {
  draft_message: "Follow-up",
  follow_up_text: "Text",
  send_client_email: "Client Email",
  post_content: "Content",
  create_lofty_task: "Task",
};

const TYPE_COLORS: Record<string, string> = {
  draft_message: "#EE8172",
  follow_up_text: "#EE8172",
  send_client_email: "#728AC5",
  post_content: "#EFDD84",
  create_lofty_task: "#6B7280",
};

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function contextLine(item: ActionItem): string {
  const d = daysSince(item.lead?.lastContactDate ?? null);
  if (item.type === "post_content") {
    const ct = (item.payload.contentType as string) ?? "Post";
    return ct.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }
  if (d === null) return "First contact";
  if (d === 0) return "Contacted today";
  if (d === 1) return "1 day since last contact";
  return `${d} days since last contact`;
}

function draftText(item: ActionItem): string {
  if (item.payload.body) return item.payload.body as string;
  if (item.payload.caption) return item.payload.caption as string;
  if (item.payload.description) return item.payload.description as string;
  return "";
}

export default function TodayPage() {
  const [queue, setQueue] = useState<QueueState>({ items: [], total: 0, done: 0 });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [doneForToday, setDoneForToday] = useState(false);

  const loadQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/actions/queue");
      if (!res.ok) return;
      const data = await res.json() as { items: ActionItem[]; total: number; done: number };
      setQueue(data);
      if (data.items.length === 0) setDoneForToday(true);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
    // Listen for Jarvis executing actions
    const handler = () => { loadQueue(); setCurrentIndex(0); };
    window.addEventListener("aire:refresh", handler);
    return () => window.removeEventListener("aire:refresh", handler);
  }, [loadQueue]);

  // When item changes, reset the draft text
  const currentItem = queue.items[currentIndex];
  useEffect(() => {
    if (currentItem) setDraft(draftText(currentItem));
  }, [currentItem]);

  async function approve(channel: "sms" | "email" = "sms") {
    if (!currentItem || acting) return;
    setActing(true);

    try {
      // Update draft if modified
      const payload = { ...currentItem.payload };
      if (draft !== draftText(currentItem)) payload.body = draft;
      if (channel) payload.channel = channel;

      // Approve
      await fetch(`/api/actions/${currentItem.id}/approve`, { method: "POST" });

      // Execute
      const execRes = await fetch(`/api/actions/${currentItem.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overridePayload: payload }),
      });

      if (execRes.ok) {
        const leadName = currentItem.lead?.name ?? "item";
        const msg = channel === "sms" ? `SMS sent to ${leadName}` :
                    channel === "email" ? `Email sent to ${leadName}` :
                    `${TYPE_LABELS[currentItem.type] ?? "Action"} completed`;
        setSuccessMsg(msg);
        // Announce to Jarvis bar
        window.dispatchEvent(new CustomEvent("aire:confirm", { detail: { text: msg } }));
        setTimeout(() => advance(), 1200);
      }
    } catch { /* silent */ } finally {
      setActing(false);
    }
  }

  async function skip() {
    if (!currentItem || acting) return;
    setActing(true);
    await fetch(`/api/actions/${currentItem.id}/skip`, { method: "POST" });
    setActing(false);
    advance();
  }

  function advance() {
    setSuccessMsg("");
    setActing(false);
    const nextIndex = currentIndex + 1;
    if (nextIndex >= queue.items.length) {
      setDoneForToday(true);
      loadQueue();
    } else {
      setCurrentIndex(nextIndex);
    }
  }

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const accentColor = currentItem ? (TYPE_COLORS[currentItem.type] ?? "#EE8172") : "#EE8172";
  const isMessage = currentItem && ["draft_message", "follow_up_text", "send_client_email"].includes(currentItem.type);
  const isContent = currentItem?.type === "post_content";

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <div className="skeleton" style={{ width: 480, height: 280, borderRadius: 20 }} />
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh",
      paddingBottom: 100,
      fontFamily: "var(--font-sans-app, system-ui)",
      background: "var(--aire-bg, #F5F0EA)",
    }}>
      {/* Header */}
      <div style={{ padding: "32px 32px 0", maxWidth: 640, margin: "0 auto" }}>
        <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0, letterSpacing: "0.04em" }}>
          {today.toUpperCase()}
        </p>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 4 }}>
          <h1 style={{
            fontSize: 28, fontWeight: 700, margin: 0,
            fontFamily: "var(--font-display-app, Georgia)",
            color: "#111827",
          }}>
            Today
          </h1>
          {!doneForToday && (
            <span style={{ fontSize: 14, color: "#9CA3AF" }}>
              {currentIndex + 1} of {queue.items.length}
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: "24px 32px 0", maxWidth: 640, margin: "0 auto" }}>

        {/* Done state */}
        {doneForToday ? (
          <div style={{
            background: "rgba(255,255,255,0.9)",
            borderRadius: 20,
            padding: "48px 32px",
            textAlign: "center",
            border: "1px solid rgba(0,0,0,0.06)",
          }}>
            <CheckCircle size={36} color="#4ade80" style={{ marginBottom: 16 }} />
            <p style={{ fontSize: 18, fontWeight: 600, color: "#111827", margin: "0 0 8px" }}>
              Queue clear
            </p>
            <p style={{ fontSize: 14, color: "#9CA3AF", margin: 0 }}>
              Ask AIRE to check on anything, or it'll surface new items as agents run.
            </p>
          </div>
        ) : currentItem ? (
          <>
            {/* Success flash */}
            {successMsg && (
              <div style={{
                background: "rgba(74,222,128,0.12)",
                border: "1px solid rgba(74,222,128,0.3)",
                borderRadius: 10,
                padding: "10px 16px",
                marginBottom: 12,
                fontSize: 13,
                color: "#065F46",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <CheckCircle size={14} />
                {successMsg}
              </div>
            )}

            {/* Main focus card */}
            <div style={{
              background: "rgba(255,255,255,0.95)",
              borderRadius: 20,
              border: "1px solid rgba(0,0,0,0.06)",
              boxShadow: "0 4px 32px rgba(0,0,0,0.08)",
              overflow: "hidden",
            }}>
              {/* Type pill */}
              <div style={{
                padding: "14px 20px 0",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: accentColor,
                  textTransform: "uppercase",
                }}>
                  {TYPE_LABELS[currentItem.type] ?? currentItem.type}
                </span>
                <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#D1D5DB" }} />
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>
                  priority {currentItem.priority}
                </span>
              </div>

              {/* Lead name */}
              <div style={{ padding: "8px 20px 0" }}>
                <p style={{
                  fontSize: 26,
                  fontWeight: 700,
                  margin: 0,
                  fontFamily: "var(--font-display-app, Georgia)",
                  color: "#111827",
                  lineHeight: 1.2,
                }}>
                  {currentItem.lead?.name ?? (isContent ? "Social Post" : "Action")}
                </p>
                <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0 0" }}>
                  {contextLine(currentItem)}
                  {currentItem.lead?.phone && ` · ${currentItem.lead.phone}`}
                </p>
              </div>

              {/* Draft text */}
              {draft && (
                <div style={{ padding: "16px 20px 0" }}>
                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    rows={4}
                    style={{
                      width: "100%",
                      background: "rgba(0,0,0,0.03)",
                      border: "1px solid rgba(0,0,0,0.08)",
                      borderRadius: 10,
                      padding: "12px 14px",
                      fontSize: 14,
                      color: "#111827",
                      lineHeight: 1.6,
                      resize: "vertical",
                      outline: "none",
                      fontFamily: "var(--font-sans-app, system-ui)",
                      boxSizing: "border-box",
                    }}
                    onFocus={e => { e.target.style.borderColor = accentColor; }}
                    onBlur={e => { e.target.style.borderColor = "rgba(0,0,0,0.08)"; }}
                  />
                </div>
              )}

              {/* Action buttons */}
              <div style={{
                padding: "16px 20px 20px",
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}>
                {isMessage && (
                  <>
                    {currentItem.lead?.phone && (
                      <button
                        onClick={() => approve("sms")}
                        disabled={acting}
                        style={{
                          flex: 1,
                          background: accentColor,
                          color: "#fff",
                          border: "none",
                          borderRadius: 10,
                          padding: "11px 16px",
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: acting ? "wait" : "pointer",
                          opacity: acting ? 0.6 : 1,
                          fontFamily: "var(--font-sans-app, system-ui)",
                          transition: "opacity 0.15s",
                        }}
                      >
                        {acting ? "Sending…" : "Send SMS"}
                      </button>
                    )}
                    {currentItem.lead?.email && (
                      <button
                        onClick={() => approve("email")}
                        disabled={acting}
                        style={{
                          flex: currentItem.lead?.phone ? "0 0 auto" : 1,
                          background: "rgba(0,0,0,0.05)",
                          color: "#374151",
                          border: "none",
                          borderRadius: 10,
                          padding: "11px 16px",
                          fontSize: 14,
                          fontWeight: 500,
                          cursor: acting ? "wait" : "pointer",
                          opacity: acting ? 0.6 : 1,
                          fontFamily: "var(--font-sans-app, system-ui)",
                          transition: "opacity 0.15s",
                        }}
                      >
                        Send Email
                      </button>
                    )}
                  </>
                )}

                {isContent && (
                  <button
                    onClick={() => approve()}
                    disabled={acting}
                    style={{
                      flex: 1,
                      background: accentColor,
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      padding: "11px 16px",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: acting ? "wait" : "pointer",
                      opacity: acting ? 0.6 : 1,
                      fontFamily: "var(--font-sans-app, system-ui)",
                    }}
                  >
                    {acting ? "Approving…" : "Approve Post"}
                  </button>
                )}

                {!isMessage && !isContent && (
                  <button
                    onClick={() => approve()}
                    disabled={acting}
                    style={{
                      flex: 1,
                      background: accentColor,
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      padding: "11px 16px",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: acting ? "wait" : "pointer",
                      fontFamily: "var(--font-sans-app, system-ui)",
                    }}
                  >
                    {acting ? "Working…" : "Approve"}
                  </button>
                )}

                {/* Skip */}
                <button
                  onClick={skip}
                  disabled={acting}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#9CA3AF",
                    cursor: "pointer",
                    padding: "11px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 13,
                    fontFamily: "var(--font-sans-app, system-ui)",
                  }}
                >
                  <SkipForward size={14} />
                  Skip
                </button>
              </div>
            </div>

            {/* Up next — just names, no detail */}
            {queue.items.slice(currentIndex + 1, currentIndex + 4).length > 0 && (
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 8px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Up next
                </p>
                {queue.items.slice(currentIndex + 1, currentIndex + 4).map((item, i) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 12px",
                      borderRadius: 10,
                      marginBottom: 4,
                      background: "rgba(255,255,255,0.5)",
                      opacity: 1 - i * 0.25,
                    }}
                  >
                    <span style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: TYPE_COLORS[item.type] ?? "#D1D5DB",
                      flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 13, color: "#374151", flex: 1 }}>
                      {item.lead?.name ?? TYPE_LABELS[item.type] ?? item.type}
                    </span>
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                      {TYPE_LABELS[item.type] ?? item.type}
                    </span>
                    <ChevronRight size={12} color="#D1D5DB" />
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
