"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp, Loader2, X, MessageSquare, Plus } from "lucide-react";

const TOOL_LABELS: Record<string, string> = {
  get_today_actions: "checking your queue",
  approve_and_execute: "executing action",
  skip_action: "skipping item",
  get_lead: "looking up lead",
  get_cold_leads: "scanning cold leads",
  get_pipeline_summary: "reading pipeline",
  get_opportunities: "scanning opportunities",
  run_agent: "triggering agent",
  skip_trace_lead: "skip tracing",
  run_comps: "running comps",
  search_mls: "searching MLS",
  market_pulse: "reading market data",
  get_social_drafts: "checking drafts",
  create_social_post: "writing post",
  push_post_to_facebook: "pushing to Facebook",
  score_caption: "scoring caption",
  sync_fb_insights: "pulling engagement data",
  search_zillow: "searching Zillow listings",
  refresh_zillow_market: "refreshing Zillow market data",
  search_contacts: "searching contacts",
  update_caption: "updating caption",
  schedule_post: "scheduling post",
  search_memory: "searching memory",
};

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolBadges?: ToolBadge[];
}

interface ToolBadge {
  tool: string;
  label: string;
  status: "running" | "done";
  summary?: string;
}

interface SSEEvent {
  type: "thread" | "delta" | "tool_call" | "tool_result" | "done" | "error";
  text?: string;
  threadId?: string;
  tool?: string;
  label?: string;
  summary?: string;
}

interface ThreadMeta {
  id: string;
  title: string | null;
  messageCount: number;
  updatedAt: string;
}

export default function ChatPanel({ mode = "float" }: { mode?: "float" | "page" }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadMeta[]>([]);
  const [showThreads, setShowThreads] = useState(false);
  const [fabPulse, setFabPulse] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isFloat = mode === "float";

  // Load thread history
  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/threads");
      if (res.ok) setThreads(await res.json());
    } catch { /* silent */ }
  }, []);

  // Rehydrate last thread
  const loadThread = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/chat/threads/${id}/messages`);
      if (!res.ok) return;
      const msgs = await res.json() as Array<{ id: string; role: string; content: string }>;
      setMessages(msgs.map(m => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content })));
      setThreadId(id);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (mode === "page") {
      loadThreads();
    }
  }, [mode, loadThreads]);

  // On float open, restore last thread
  useEffect(() => {
    if (isFloat && open && !threadId) {
      const last = localStorage.getItem("aire.lastThreadId");
      if (last) loadThread(last);
    }
  }, [isFloat, open, threadId, loadThread]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Cmd+J global hotkey
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        if (isFloat) {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        } else {
          inputRef.current?.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFloat]);

  // Receive queries from Cmd+K palette
  useEffect(() => {
    function onQuery(e: Event) {
      const { text } = (e as CustomEvent<{ text: string }>).detail;
      if (!text) return;
      if (isFloat) setOpen(true);
      // Short delay to let panel open, then auto-send
      setTimeout(() => {
        setInput(text);
        setTimeout(() => {
          setInput("");
          const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", content: text };
          const assistantMsg: ChatMsg = { id: `a-${Date.now()}`, role: "assistant", content: "", toolBadges: [] };
          setMessages(prev => [...prev, userMsg, assistantMsg]);
          setStreaming(true);
          // Fire send directly
          sendMessageText(text);
        }, 80);
      }, isFloat ? 120 : 0);
    }
    window.addEventListener("aire:chat-query", onQuery);
    return () => window.removeEventListener("aire:chat-query", onQuery);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFloat, threadId, pathname]);

  // Periodic FAB pulse
  useEffect(() => {
    if (!isFloat) return;
    const t = setInterval(() => {
      if (!open) { setFabPulse(true); setTimeout(() => setFabPulse(false), 1800); }
    }, 90_000);
    return () => clearInterval(t);
  }, [isFloat, open]);

  function newChat() {
    setMessages([]);
    setThreadId(null);
    localStorage.removeItem("aire.lastThreadId");
  }

  async function sendMessageText(msg: string) {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message: msg, context: { page: pathname } }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const event: SSEEvent = JSON.parse(line);
            if (event.type === "thread" && event.threadId) {
              setThreadId(event.threadId);
              localStorage.setItem("aire.lastThreadId", event.threadId);
            } else if (event.type === "delta" && event.text) {
              currentText += event.text;
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") last.content = currentText;
                return updated;
              });
            } else if (event.type === "tool_call" && event.tool) {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  last.toolBadges = [...(last.toolBadges ?? []), { tool: event.tool!, label: event.label ?? TOOL_LABELS[event.tool!] ?? event.tool!, status: "running" }];
                }
                return updated;
              });
            } else if (event.type === "tool_result" && event.tool) {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  last.toolBadges = (last.toolBadges ?? []).map(b =>
                    b.tool === event.tool && b.status === "running" ? { ...b, status: "done" as const, summary: event.summary } : b
                  );
                }
                return updated;
              });
            } else if (event.type === "done") {
              setStreaming(false);
              loadThreads();
              window.dispatchEvent(new CustomEvent("aire:refresh"));
            } else if (event.type === "error") {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") last.content = event.text ?? "Something went wrong.";
                return updated;
              });
              setStreaming(false);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") last.content = "Connection error. Try again.";
        return updated;
      });
      setStreaming(false);
    }
  }

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    const msg = input.trim();
    if (!msg || streaming) return;
    setInput("");
    setStreaming(true);
    setMessages(prev => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", content: msg },
      { id: `a-${Date.now()}`, role: "assistant", content: "", toolBadges: [] },
    ]);
    await sendMessageText(msg);
  }

  const conversationArea = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--aire-muted)", fontSize: 12, marginTop: 40 }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>✦</div>
            <div>Ask me anything — leads, pipeline,</div>
            <div>social posts, comps, market data.</div>
            <div style={{ marginTop: 8, fontSize: 11 }}>⌘J to focus</div>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id}>
            {/* Tool badges */}
            {msg.role === "assistant" && msg.toolBadges && msg.toolBadges.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                {msg.toolBadges.map((b, i) => (
                  <span key={i} style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    fontSize: 10, letterSpacing: "0.06em",
                    padding: "3px 8px", borderRadius: 999,
                    background: b.status === "running" ? "rgba(238,129,114,0.12)" : "rgba(34,197,94,0.1)",
                    border: `1px solid ${b.status === "running" ? "rgba(238,129,114,0.3)" : "rgba(34,197,94,0.3)"}`,
                    color: b.status === "running" ? "#EE8172" : "#16a34a",
                  }}>
                    <span style={{
                      width: 5, height: 5, borderRadius: "50%",
                      background: b.status === "running" ? "#EE8172" : "#22c55e",
                      animation: b.status === "running" ? "pulse-dot 1.2s ease-in-out infinite" : "none",
                    }} />
                    {b.label}
                  </span>
                ))}
              </div>
            )}
            {/* Bubble */}
            <div style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}>
              <div style={{
                maxWidth: "85%",
                padding: "9px 13px",
                borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
                background: msg.role === "user"
                  ? "var(--aire-ink, #09090B)"
                  : "var(--aire-card, rgba(255,255,255,0.7))",
                border: msg.role === "assistant" ? "1px solid var(--aire-border)" : "none",
                color: msg.role === "user" ? "#fff" : "var(--aire-text)",
                fontSize: 13,
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {msg.content || (msg.role === "assistant" && streaming ? (
                  <span style={{ color: "var(--aire-muted)", fontStyle: "italic" }}>thinking…</span>
                ) : null)}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px 14px",
        borderTop: "1px solid var(--aire-border)",
        marginTop: 8,
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Ask me anything…"
          disabled={streaming}
          autoFocus={!isFloat}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            fontSize: 13, color: "var(--aire-text)", fontFamily: "inherit",
            caretColor: "#EE8172",
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || streaming}
          style={{
            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
            background: input.trim() && !streaming ? "#EE8172" : "rgba(0,0,0,0.06)",
            border: "none", cursor: input.trim() && !streaming ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.15s",
          }}
        >
          {streaming
            ? <Loader2 size={12} color="#9CA3AF" style={{ animation: "spin 1s linear infinite" }} />
            : <ArrowUp size={12} color={input.trim() ? "#fff" : "#9CA3AF"} />
          }
        </button>
      </form>
    </div>
  );

  // ── FLOAT MODE ──
  if (isFloat) {
    return (
      <>
        {/* FAB */}
        <button
          onClick={() => { setOpen(v => !v); setTimeout(() => inputRef.current?.focus(), 80); }}
          title="AIRE Chat (⌘J)"
          style={{
            position: "fixed", bottom: 20, right: 20, zIndex: 201,
            width: 44, height: 44, borderRadius: "50%",
            background: open ? "#EE8172" : streaming ? "#EE8172" : "var(--aire-ink, #09090B)",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, color: "#fff",
            boxShadow: fabPulse
              ? "0 0 0 6px rgba(9,9,11,0.12), 0 4px 20px rgba(0,0,0,0.22)"
              : "0 4px 16px rgba(0,0,0,0.2)",
            transition: "all 0.2s ease",
          }}
        >
          {open ? <X size={16} /> : "✦"}
        </button>

        {/* Float panel */}
        {open && (
          <div style={{
            position: "fixed", bottom: 72, right: 20, zIndex: 200,
            width: 400, height: 520,
            background: "rgba(245,240,234,0.96)",
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            border: "1px solid var(--aire-border-2)",
            borderRadius: 16,
            boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
            animation: "scale-in 140ms var(--ease-out-expo, cubic-bezier(0.16,1,0.3,1)) both",
          }}>
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px 10px",
              borderBottom: "1px solid var(--aire-border)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#EE8172" }}>AIRE</span>
                <span style={{ fontSize: 10, color: "var(--aire-muted)", background: "var(--aire-card)", border: "1px solid var(--aire-border)", borderRadius: 999, padding: "1px 7px" }}>
                  {streaming ? "thinking…" : "ready"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={newChat}
                  title="New chat"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--aire-muted)", padding: 4, borderRadius: 6, display: "flex" }}
                >
                  <Plus size={14} />
                </button>
                <button
                  onClick={() => setShowThreads(v => !v)}
                  title="Chat history"
                  style={{ background: "none", border: "none", cursor: "pointer", color: showThreads ? "var(--aire-text)" : "var(--aire-muted)", padding: 4, borderRadius: 6, display: "flex" }}
                >
                  <MessageSquare size={14} />
                </button>
              </div>
            </div>

            {/* Thread list overlay */}
            {showThreads && threads.length > 0 ? (
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
                {threads.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { loadThread(t.id); setShowThreads(false); }}
                    style={{
                      width: "100%", textAlign: "left", padding: "8px 16px",
                      background: t.id === threadId ? "rgba(238,129,114,0.08)" : "none",
                      border: "none", cursor: "pointer",
                      borderBottom: "1px solid var(--aire-border)",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.03)")}
                    onMouseLeave={e => (e.currentTarget.style.background = t.id === threadId ? "rgba(238,129,114,0.08)" : "none")}
                  >
                    <div style={{ fontSize: 12, color: "var(--aire-text)", fontWeight: 500, marginBottom: 2 }}>
                      {t.title ?? "Untitled"}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--aire-muted)" }}>
                      {t.messageCount} messages · {new Date(t.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              conversationArea
            )}
          </div>
        )}
      </>
    );
  }

  // ── PAGE MODE ──
  return (
    <div style={{ display: "flex", height: "calc(100vh - 52px)", overflow: "hidden" }}>
      {/* Thread sidebar */}
      <div style={{
        width: 220, flexShrink: 0, borderRight: "1px solid var(--aire-border)",
        background: "var(--aire-card)", overflowY: "auto", padding: "12px 0",
      }}>
        <div style={{ padding: "0 12px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "var(--aire-muted)" }}>CONVERSATIONS</span>
          <button
            onClick={newChat}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--aire-muted)", display: "flex", padding: 2 }}
            title="New chat"
          >
            <Plus size={13} />
          </button>
        </div>
        {threads.map(t => (
          <button
            key={t.id}
            onClick={() => loadThread(t.id)}
            style={{
              width: "100%", textAlign: "left", padding: "8px 12px",
              background: t.id === threadId ? "rgba(238,129,114,0.08)" : "none",
              border: "none", borderLeft: `2px solid ${t.id === threadId ? "#EE8172" : "transparent"}`,
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--aire-text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.title ?? "Untitled"}
            </div>
            <div style={{ fontSize: 10, color: "var(--aire-muted)", marginTop: 1 }}>
              {new Date(t.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          </button>
        ))}
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--aire-bg)" }}>
        {conversationArea}
      </div>
    </div>
  );
}
