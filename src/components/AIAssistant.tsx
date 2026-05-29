"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const PAGE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/pipeline": "Pipeline",
  "/contacts": "Contacts",
  "/create-post": "Post Studio",
  "/social": "Social",
  "/mls": "MLS",
  "/buyers": "Buyers",
  "/smart-plans": "Smart Plans",
  "/settings": "Settings",
  "/system": "System Health",
  "/content-calendar": "Content Calendar",
};

function getContextHint(pathname: string): string {
  if (pathname === "/") return "You're on the Dashboard — I can help interpret signals, explain KPIs, or draft your morning plan.";
  if (pathname === "/pipeline") return "You're viewing the Pipeline — I can help prioritize leads, suggest follow-ups, or explain stage strategies.";
  if (pathname.startsWith("/contacts/")) return "You're on a Contact Profile — I can help draft messages, suggest next actions, or summarize their history.";
  if (pathname === "/contacts") return "You're in Contacts — I can help filter leads, suggest who to call today, or explain urgency signals.";
  if (pathname === "/create-post") return "You're in Post Studio — I can help write captions, suggest post angles, or advise on content strategy.";
  if (pathname === "/social") return "You're in Social — I can help analyze post performance or suggest what to publish next.";
  if (pathname === "/smart-plans") return "You're in Smart Plans — I can help design drip sequences, suggest cadences, or explain trigger types.";
  if (pathname === "/system") return "You're in System Health — I can help diagnose errors, explain patterns, or suggest fixes.";
  if (pathname === "/buyers") return "You're in Buyers — I can help match listings to buyer profiles or suggest search criteria.";
  if (pathname === "/content-calendar") return "You're in the Content Calendar — I can help plan your posting schedule or suggest optimal days/times.";
  return "Ask me anything about AIRE or your real estate workflow.";
}

export default function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [hover, setHover] = useState(false);
  const pathname = usePathname();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMessages([]);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, pathname]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    const res = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        page: pathname,
      }),
    });

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) {
      setStreaming(false);
      return;
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: updated[updated.length - 1].content + text,
        };
        return updated;
      });
    }

    setStreaming(false);
  }

  const pageLabel = PAGE_LABELS[pathname] || pathname;

  return (
    <>
      {/* Floating button — ink circle with coral icon */}
      <button
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label="AIRE Assistant"
        title="AIRE Assistant"
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: "var(--aire-ink)",
          border: "none",
          cursor: "pointer",
          zIndex: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--aire-coral)",
          fontSize: "22px",
          fontWeight: 600,
          boxShadow: hover
            ? "0 8px 24px rgba(26,26,28,0.30), 0 0 32px rgba(238,129,114,0.20)"
            : "var(--shadow-ink)",
          transform: hover ? "translateY(-2px)" : "translateY(0)",
          transition: "transform 240ms var(--ease-spring), box-shadow 240ms var(--ease-apple)",
        }}
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <span style={{ display: "block", lineHeight: 1, transform: "translateY(-1px)" }}>✦</span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: "94px",
            right: "24px",
            width: "380px",
            maxWidth: "calc(100vw - 32px)",
            maxHeight: "600px",
            background: "var(--aire-card)",
            border: "1px solid var(--aire-border)",
            borderRadius: "14px",
            display: "flex",
            flexDirection: "column",
            zIndex: 199,
            boxShadow: "var(--shadow-card-hover)",
            overflow: "hidden",
            animation: "fade-up 280ms var(--ease-out-expo) both",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--aire-border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--aire-card)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "var(--aire-coral)",
                  display: "inline-block",
                  flexShrink: 0,
                  boxShadow: "0 0 8px rgba(238,129,114,0.45)",
                }}
              />
              <span
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.20em",
                  color: "var(--aire-text)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                }}
              >
                AIRE Assistant
              </span>
              <span
                style={{
                  fontSize: "10px",
                  color: "var(--aire-muted)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                · {pageLabel}
              </span>
            </div>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "18px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              minHeight: "240px",
              maxHeight: "440px",
              background: "var(--aire-card)",
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--aire-muted)",
                  textAlign: "center",
                  marginTop: "32px",
                  lineHeight: 1.6,
                  padding: "0 8px",
                }}
              >
                {getContextHint(pathname ?? "/")}
              </div>
            )}
            {messages.map((msg, i) => {
              const isUser = msg.role === "user";
              const isStreamingPlaceholder =
                msg.role === "assistant" &&
                streaming &&
                i === messages.length - 1 &&
                !msg.content;
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: isUser ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "80%",
                      padding: "10px 14px",
                      borderRadius: isUser
                        ? "14px 14px 4px 14px"
                        : "14px 14px 14px 4px",
                      background: isUser ? "var(--aire-ink)" : "var(--aire-card-warm)",
                      color: isUser ? "var(--aire-text-inv)" : "var(--aire-text)",
                      fontSize: "13px",
                      lineHeight: 1.55,
                      whiteSpace: "pre-wrap",
                      border: isUser ? "none" : "1px solid var(--aire-border)",
                      boxShadow: isUser ? "var(--shadow-ink)" : "none",
                    }}
                  >
                    {isStreamingPlaceholder ? <PulseDots /> : msg.content}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input row */}
          <form
            onSubmit={send}
            style={{
              padding: "12px 14px 14px",
              borderTop: "1px solid var(--aire-border)",
              display: "flex",
              gap: "8px",
              background: "var(--aire-card)",
              alignItems: "center",
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything…"
              disabled={streaming}
              className="aire-input"
              style={{ flex: 1, padding: "10px 14px" }}
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="btn-coral"
              style={{
                padding: "10px 16px",
                fontSize: "13px",
                letterSpacing: "0.04em",
                opacity: streaming || !input.trim() ? 0.45 : 1,
                cursor: streaming || !input.trim() ? "default" : "pointer",
                lineHeight: 1,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="13 6 19 12 13 18" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}

/* Streaming indicator — three tiny coral dots that pulse in sequence */
function PulseDots() {
  return (
    <span
      aria-label="Assistant typing"
      style={{ display: "inline-flex", gap: "4px", alignItems: "center", padding: "2px 0" }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "var(--aire-coral)",
            display: "inline-block",
            animation: "pulse-dot 1.2s ease-in-out infinite",
            animationDelay: `${i * 160}ms`,
          }}
        />
      ))}
    </span>
  );
}
