"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface Message {
  id: string;
  guid: string;
  body: string;
  direction: "inbound" | "outbound";
  sentAt: string;
}

interface Lead {
  id: string;
  name: string;
  stage: string;
}

interface Thread {
  id: string;
  phone: string;
  displayName: string | null;
  leadId: string | null;
  lead: Lead | null;
  lastBody: string | null;
  lastAt: string | null;
  needsReply: boolean;
  _count?: { messages: number };
  messages?: Message[];
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatMsgDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

const STAGE_LABEL: Record<string, string> = {
  new_lead: "New",
  active: "Active",
  under_contract: "Contract",
  closed: "Closed",
  dead: "Dead",
};

export default function MessagesPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [needsReplyCount, setNeedsReplyCount] = useState(0);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [filter, setFilter] = useState<"all" | "needs_reply">("all");
  const [search, setSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/imessage/threads")
      .then(r => r.json())
      .then(data => {
        setThreads(data.threads || []);
        setNeedsReplyCount(data.needsReplyCount || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedPhone) return;
    setLoadingThread(true);
    fetch(`/api/imessage/threads?phone=${encodeURIComponent(selectedPhone)}`)
      .then(r => r.json())
      .then(data => {
        setActiveThread(data);
        setLoadingThread(false);
      })
      .catch(() => setLoadingThread(false));
  }, [selectedPhone]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeThread?.messages?.length]);

  const visibleThreads = threads.filter(t => {
    if (filter === "needs_reply" && !t.needsReply) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = (t.displayName || t.lead?.name || t.phone || "").toLowerCase();
      if (!name.includes(q) && !t.phone.includes(q)) return false;
    }
    return true;
  });

  const contactName = (t: Thread) => t.displayName || t.lead?.name || t.phone;

  // Group messages by date for the conversation view
  const groupedMessages = (() => {
    if (!activeThread?.messages) return [];
    const groups: { date: string; messages: Message[] }[] = [];
    for (const msg of activeThread.messages) {
      const label = formatMsgDate(msg.sentAt);
      const last = groups[groups.length - 1];
      if (last?.date === label) {
        last.messages.push(msg);
      } else {
        groups.push({ date: label, messages: [msg] });
      }
    }
    return groups;
  })();

  return (
    <div style={{ display: "flex", height: "calc(100vh - 58px)", background: "var(--aire-bg)", overflow: "hidden" }}>

      {/* ── Thread list sidebar ── */}
      <div style={{
        width: "340px",
        flexShrink: 0,
        borderRight: "1px solid var(--aire-border)",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 20px 14px", borderBottom: "1px solid var(--aire-border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <h1 style={{ fontSize: "17px", fontWeight: 700, color: "var(--aire-text)", margin: 0 }}>Messages</h1>
            {needsReplyCount > 0 && (
              <span style={{
                background: "var(--aire-orange)",
                color: "#fff",
                fontSize: "10px",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: "20px",
                letterSpacing: "0.06em",
              }}>{needsReplyCount} needs reply</span>
            )}
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="aire-input"
            style={{ fontSize: "12px", padding: "8px 12px" }}
          />

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
            {(["all", "needs_reply"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.10em",
                  fontWeight: 600,
                  padding: "5px 12px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  background: filter === f ? "var(--aire-orange)" : "var(--aire-bg)",
                  color: filter === f ? "#fff" : "var(--aire-text-2)",
                  transition: "all 150ms",
                }}
              >
                {f === "all" ? "ALL" : "NEEDS REPLY"}
              </button>
            ))}
          </div>
        </div>

        {/* Thread list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && (
            <div style={{ padding: "32px", textAlign: "center", color: "var(--aire-muted)", fontSize: "12px" }}>
              Loading…
            </div>
          )}

          {!loading && visibleThreads.length === 0 && (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <p style={{ fontSize: "13px", color: "var(--aire-muted)", marginBottom: "12px" }}>
                {threads.length === 0 ? "No messages synced yet" : "No conversations match"}
              </p>
              {threads.length === 0 && (
                <p style={{ fontSize: "11px", color: "var(--aire-muted)", lineHeight: 1.7 }}>
                  Run the bridge script on your Mac to sync iMessages from<br />
                  <code style={{ background: "var(--aire-bg)", padding: "2px 6px", borderRadius: "4px", fontSize: "10px" }}>
                    ~/Library/Messages/chat.db
                  </code>
                </p>
              )}
            </div>
          )}

          {visibleThreads.map(thread => (
            <div
              key={thread.id}
              onClick={() => setSelectedPhone(thread.phone)}
              style={{
                padding: "14px 18px",
                cursor: "pointer",
                borderBottom: "1px solid var(--aire-border)",
                background: selectedPhone === thread.phone ? "rgba(251,122,1,0.06)" : "transparent",
                borderLeft: selectedPhone === thread.phone ? "3px solid var(--aire-orange)" : "3px solid transparent",
                transition: "all 150ms",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                {/* Avatar */}
                <div style={{
                  width: 38, height: 38, borderRadius: "50%",
                  background: thread.leadId ? "rgba(251,122,1,0.15)" : "var(--aire-bg)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                  fontSize: "14px", fontWeight: 700,
                  color: thread.leadId ? "var(--aire-orange)" : "var(--aire-muted)",
                }}>
                  {contactName(thread).charAt(0).toUpperCase()}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
                    <span style={{
                      fontSize: "13px",
                      fontWeight: thread.needsReply ? 700 : 500,
                      color: "var(--aire-text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {contactName(thread)}
                    </span>
                    <span style={{ fontSize: "10px", color: "var(--aire-muted)", flexShrink: 0, marginLeft: "8px" }}>
                      {thread.lastAt ? timeAgo(thread.lastAt) : ""}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {thread.needsReply && (
                      <span style={{
                        width: "6px", height: "6px", borderRadius: "50%",
                        background: "var(--aire-orange)", flexShrink: 0,
                      }} />
                    )}
                    <p style={{
                      fontSize: "11px",
                      color: thread.needsReply ? "var(--aire-text)" : "var(--aire-muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      margin: 0,
                      flex: 1,
                    }}>
                      {thread.lastBody || "No messages"}
                    </p>
                  </div>

                  {thread.lead && (
                    <span style={{
                      fontSize: "9px",
                      letterSpacing: "0.10em",
                      color: "var(--aire-orange)",
                      fontWeight: 600,
                      marginTop: "2px",
                      display: "block",
                    }}>
                      {STAGE_LABEL[thread.lead.stage] || thread.lead.stage} · LEAD
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Conversation panel ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!selectedPhone ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
            <div style={{ fontSize: "40px", opacity: 0.3 }}>💬</div>
            <p style={{ fontSize: "13px", color: "var(--aire-muted)", letterSpacing: "0.08em" }}>
              SELECT A CONVERSATION
            </p>
          </div>
        ) : (
          <>
            {/* Conversation header */}
            <div style={{
              padding: "16px 24px",
              borderBottom: "1px solid var(--aire-border)",
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div>
                <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--aire-text)", margin: 0 }}>
                  {activeThread ? contactName(activeThread) : selectedPhone}
                </h2>
                <p style={{ fontSize: "11px", color: "var(--aire-muted)", margin: "2px 0 0" }}>
                  {selectedPhone}
                  {activeThread?.messages && ` · ${activeThread.messages.length} messages`}
                </p>
              </div>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                {activeThread?.lead && (
                  <Link
                    href={`/contacts/${activeThread.lead.id}`}
                    style={{
                      fontSize: "10px",
                      letterSpacing: "0.10em",
                      fontWeight: 700,
                      color: "var(--aire-orange)",
                      textDecoration: "none",
                      padding: "5px 12px",
                      border: "1px solid rgba(251,122,1,0.3)",
                      borderRadius: "8px",
                    }}
                  >
                    VIEW LEAD →
                  </Link>
                )}
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
              {loadingThread && (
                <div style={{ textAlign: "center", padding: "40px", color: "var(--aire-muted)", fontSize: "12px" }}>
                  Loading…
                </div>
              )}

              {!loadingThread && activeThread && groupedMessages.map(group => (
                <div key={group.date}>
                  {/* Date divider */}
                  <div style={{ textAlign: "center", margin: "20px 0 14px" }}>
                    <span style={{
                      fontSize: "10px",
                      letterSpacing: "0.12em",
                      color: "var(--aire-muted)",
                      background: "var(--aire-bg)",
                      padding: "3px 10px",
                      borderRadius: "10px",
                    }}>
                      {group.date}
                    </span>
                  </div>

                  {group.messages.map(msg => (
                    <div
                      key={msg.id}
                      style={{
                        display: "flex",
                        justifyContent: msg.direction === "outbound" ? "flex-end" : "flex-start",
                        marginBottom: "8px",
                      }}
                    >
                      <div style={{
                        maxWidth: "68%",
                        padding: "10px 14px",
                        borderRadius: msg.direction === "outbound"
                          ? "18px 18px 4px 18px"
                          : "18px 18px 18px 4px",
                        background: msg.direction === "outbound"
                          ? "var(--aire-orange)"
                          : "#fff",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                        border: msg.direction === "inbound" ? "1px solid var(--aire-border)" : "none",
                      }}>
                        <p style={{
                          fontSize: "13px",
                          lineHeight: 1.5,
                          color: msg.direction === "outbound" ? "#fff" : "var(--aire-text)",
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}>
                          {msg.body}
                        </p>
                        <p style={{
                          fontSize: "9px",
                          color: msg.direction === "outbound" ? "rgba(255,255,255,0.65)" : "var(--aire-muted)",
                          margin: "4px 0 0",
                          textAlign: "right",
                        }}>
                          {formatTime(msg.sentAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Read-only notice */}
            <div style={{
              padding: "12px 24px",
              borderTop: "1px solid var(--aire-border)",
              background: "#fff",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}>
              <div style={{
                flex: 1,
                padding: "10px 16px",
                background: "var(--aire-bg)",
                borderRadius: "20px",
                fontSize: "12px",
                color: "var(--aire-muted)",
                letterSpacing: "0.04em",
              }}>
                Read-only view — reply from your iPhone or Mac Messages app
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
