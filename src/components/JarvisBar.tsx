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
};

export default function JarvisBar() {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "thinking" | "done">("idle");
  const [toolLabel, setToolLabel] = useState("");
  const [response, setResponse] = useState("");
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const responseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();

  // Show after mount to avoid SSR flash
  useEffect(() => { setVisible(true); }, []);

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

  return (
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
        {/* AIRE label */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: status === "thinking" ? "#EE8172" : "#9CA3AF",
            fontFamily: "var(--font-sans-app, system-ui)",
            flexShrink: 0,
            transition: "color 0.2s",
            userSelect: "none",
          }}
        >
          AIRE
        </span>

        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={status === "thinking" ? "" : "ask me anything or tell me what to do"}
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
  );
}
