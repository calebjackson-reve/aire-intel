"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Dashboard banner that surfaces 0-N urgent signals at the very top.
 *
 * Each signal is a chip you can tap to act on it. Coral = act now, cream =
 * attention, mint = informational. Per-session dismissals stored in sessionStorage
 * so reopening the tab tomorrow still shows them.
 *
 * If there are zero signals, the component renders nothing (no chrome).
 */

interface Signal {
  id: string;
  severity: "red" | "yellow" | "blue";
  label: string;
  href?: string;
  count?: number;
}

const COLORS = {
  red: {
    pill: "pill-coral",
    fg: "var(--aire-coral-deep)",
    bg: "var(--aire-coral-soft)",
    border: "rgba(238,129,114,0.30)",
  },
  yellow: {
    pill: "pill-cream",
    fg: "#8a7a18",
    bg: "var(--aire-cream-soft)",
    border: "rgba(239,221,132,0.40)",
  },
  blue: {
    pill: "pill-mint",
    fg: "#2d7a55",
    bg: "var(--aire-mint-soft)",
    border: "rgba(184,230,208,0.50)",
  },
} as const;

const DISMISS_KEY = "aire.urgent_signals.dismissed";

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...set]));
  } catch {}
}

export default function UrgentSignals() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());

  useEffect(() => {
    fetch("/api/signals")
      .then((r) => r.json())
      .then((data: { signals: Signal[] }) => setSignals(data.signals ?? []))
      .catch(() => {});
  }, []);

  function dismiss(id: string) {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    saveDismissed(next);
  }

  const visible = signals.filter((s) => !dismissed.has(s.id));
  if (visible.length === 0) return null;

  // Sort: red first, then yellow, then blue
  const order: Record<Signal["severity"], number> = { red: 0, yellow: 1, blue: 2 };
  const sorted = [...visible].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        flexWrap: "wrap",
        alignItems: "center",
        padding: "14px 18px",
        marginBottom: "20px",
        background: "var(--aire-card)",
        border: "1px solid var(--aire-border)",
        borderRadius: "14px",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <span
        style={{
          fontSize: "9px",
          letterSpacing: "0.22em",
          color: "var(--aire-text-2)",
          marginRight: "6px",
        }}
      >
        URGENT
      </span>
      {sorted.map((s) => {
        const c = COLORS[s.severity];
        const chip = (
          <span
            className={c.pill}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 10px 6px 12px",
              borderRadius: "20px",
              background: c.bg,
              border: `1px solid ${c.border}`,
              color: c.fg,
              fontSize: "11px",
              letterSpacing: "0.04em",
              fontWeight: 500,
              textDecoration: "none",
              cursor: s.href ? "pointer" : "default",
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: c.fg }} />
            {s.label}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dismiss(s.id);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: c.fg,
                opacity: 0.6,
                cursor: "pointer",
                padding: "0 2px",
                fontSize: "14px",
                lineHeight: 1,
              }}
              aria-label={`Dismiss ${s.label}`}
            >
              ×
            </button>
          </span>
        );
        return s.href ? (
          <Link key={s.id} href={s.href} style={{ textDecoration: "none" }}>
            {chip}
          </Link>
        ) : (
          <span key={s.id}>{chip}</span>
        );
      })}
    </div>
  );
}
