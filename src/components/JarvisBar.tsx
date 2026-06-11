"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp, Loader2 } from "lucide-react";

interface JarvisEvent {
  type: "tool_call" | "result" | "error";
  text?: string;
  tool?: string;
}

const TOOL_LABELS: Record<string, string> = {
  get_today_actions: "checking your queue",
  approve_and_execute: "executing action",
  skip_action: "skipping item",
  get_lead: "looking up lead",
  get_cold_leads: "scanning cold leads",
  get_pipeline_summary: "reading pipeline",
  run_agent: "triggering agent",
  skip_trace_lead: "skip tracing",
  run_comps: "running comps",
  search_mls: "searching MLS",
  market_pulse: "reading market data",
};

export default function JarvisBar() {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "thinking" | "done">("idle");
  const [toolLabel, setToolLabel] = useState("");
  const [response, setResponse] = useState("");
  const [visible, setVisible] = useState(false);
  const [fabPulse, setFabPulse] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const responseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();

  // Show after mount to avoid SSR flash
  useEffect(() => { setVisible(true); }, []);

  // Cmd+J focuses the input from anywhere
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        inputRef.current?.focus();
        setFabPulse(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Pulse the FAB every 90s when idle to remind user AIRE is alive
  useEffect(() => {
    const timer = setInterval(() => {
      if (status === "idle") {
        setFabPulse(true);
        setTimeout(() => setFabPulse(false), 2000);
      }
    }, 90_000);
    return () => clearInterval(timer);
  }, [status]);

  // Clear response after 8s of inactivity
  const scheduleCollapse = useCallback(() => {
    if (responseTimer.current) clearTimeout(responseTimer.current);
    responseTimer.current = setTimeout(() => {
      setResponse("");
      setStatus("idle");
      setToolLabel("");
    }, 8000);
  }, []);

  // Listen for external actions (e.g. Today page send button) to show confirmations
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const { text } = e.detail as { text: string };
      setResponse(text);
      setStatus("done");
      scheduleCollapse();
      // Notify Today page to refresh
      window.dispatchEvent(new CustomEvent("aire:refresh"));
    };
    window.addEventListener("aire:confirm" as never, handler as EventListener);
    return () => window.removeEventListener("aire:confirm" as never, handler as EventListener);
  }, [scheduleCollapse]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const msg = input.trim();
    if (!msg || status === "thinking") return;

    setInput("");
    setStatus("thinking");
    setResponse("");
    setToolLabel("thinking");

    const res = await fetch("/api/jarvis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg, context: { page: pathname } }),
    });

    if (!res.body) {
      setResponse("No response.");
      setStatus("done");
      scheduleCollapse();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

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
          const event: JarvisEvent = JSON.parse(line);
          if (event.type === "tool_call" && event.tool) {
            setToolLabel(TOOL_LABELS[event.tool] ?? event.tool);
          } else if (event.type === "result" && event.text) {
            setResponse(event.text);
            setStatus("done");
            setToolLabel("");
            scheduleCollapse();
            window.dispatchEvent(new CustomEvent("aire:refresh"));
          } else if (event.type === "error") {
            setResponse(event.text ?? "Error.");
            setStatus("done");
            scheduleCollapse();
          }
        } catch { /* skip malformed lines */ }
      }
    }

    if ((status as string) === "thinking") {
      setStatus("done");
      scheduleCollapse();
    }
  }

  if (!visible) return null;

  const hasResponse = response || (status === "thinking" && toolLabel);

  // Page label shown in the context chip
  const pageLabel = pathname === "/" ? "Dashboard"
    : pathname.startsWith("/contacts/") ? "Contact"
    : pathname.startsWith("/contacts") ? "Contacts"
    : pathname.startsWith("/pipeline") ? "Pipeline"
    : pathname.startsWith("/market") ? "Market"
    : pathname.startsWith("/brief") ? "Morning Brief"
    : pathname.startsWith("/agents") ? "Agents"
    : pathname.startsWith("/social") ? "Social"
    : pathname.startsWith("/smart-plans") ? "Smart Plans"
    : pathname.startsWith("/create-post") ? "Post Studio"
    : null;

  return (
    <>
      {/* Floating AIRE trigger — bottom right, always visible */}
      <button
        onClick={() => inputRef.current?.focus()}
        title="Ask AIRE (⌘J)"
        style={{
          position: "fixed",
          bottom: 64,
          right: 20,
          zIndex: 101,
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: status === "thinking" ? "#EE8172" : "var(--aire-ink, #09090B)",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          color: "#fff",
          boxShadow: status === "thinking"
            ? "0 0 0 4px rgba(238,129,114,0.3), 0 4px 16px rgba(0,0,0,0.2)"
            : fabPulse
            ? "0 0 0 6px rgba(9,9,11,0.12), 0 4px 16px rgba(0,0,0,0.18)"
            : "0 4px 16px rgba(0,0,0,0.18)",
          transition: "all 0.25s ease",
          animation: fabPulse ? "fab-ping 0.6s ease-out" : "none",
        }}
      >
        ✦
      </button>

    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.06)",
        transition: "all 0.25s ease",
      }}
    >
      {/* Response strip — only shows when AI is active */}
      {hasResponse && (
        <div
          style={{
            padding: "10px 20px 8px",
            fontSize: 13,
            color: status === "thinking" ? "#9CA3AF" : "#111827",
            fontFamily: "var(--font-sans-app, system-ui)",
            lineHeight: 1.5,
            maxWidth: 800,
            margin: "0 auto",
            width: "100%",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          {/* AIRE indicator dot */}
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: status === "thinking" ? "#9CA3AF" : "#EE8172",
              marginTop: 5,
              flexShrink: 0,
              animation: status === "thinking" ? "pulse-dot 1.4s ease-in-out infinite" : "none",
            }}
          />
          <span style={{ fontStyle: status === "thinking" ? "italic" : "normal" }}>
            {status === "thinking" ? toolLabel : response}
          </span>
        </div>
      )}

      {/* Input row */}
      <form
        onSubmit={submit}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          maxWidth: 800,
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* AIRE label + page context chip */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: status === "thinking" ? "#EE8172" : "#9CA3AF",
              fontFamily: "var(--font-sans-app, system-ui)",
              transition: "color 0.2s",
              userSelect: "none",
            }}
          >
            AIRE
          </span>
          {pageLabel && (
            <span style={{
              fontSize: 10,
              letterSpacing: "0.1em",
              color: "#D1D5DB",
              background: "rgba(0,0,0,0.05)",
              padding: "2px 7px",
              borderRadius: 999,
              userSelect: "none",
            }}>
              {pageLabel}
            </span>
          )}
        </div>

        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={status === "thinking" ? "" : "⌘J — ask me anything or tell me what to do"}
          disabled={status === "thinking"}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 14,
            color: "#111827",
            fontFamily: "var(--font-sans-app, system-ui)",
            caretColor: "#EE8172",
          }}
        />

        <button
          type="submit"
          disabled={!input.trim() || status === "thinking"}
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: input.trim() && status !== "thinking" ? "#EE8172" : "rgba(0,0,0,0.06)",
            border: "none",
            cursor: input.trim() && status !== "thinking" ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "background 0.15s",
          }}
        >
          {status === "thinking" ? (
            <Loader2 size={13} color="#9CA3AF" style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <ArrowUp size={13} color={input.trim() ? "#fff" : "#9CA3AF"} />
          )}
        </button>
      </form>
    </div>
    </>
  );
}
