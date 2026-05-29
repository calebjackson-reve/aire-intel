"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * DailyMission — the hero experience of AIRE.
 *
 * This is what solves the procrastination problem. Three moves. One at a time.
 * Pre-loaded context. Pre-written message. One tap to execute.
 *
 * Design rules:
 *   - Only ONE move is active at a time. The others are dimmed previews.
 *   - The active move shows the full message ready to copy / send.
 *   - "Done" advances to the next move. No back button. Forward only.
 *   - When all 3 are done: a quiet victory state. No confetti. Just respect.
 */

interface Move {
  id: string;
  rank: 1 | 2 | 3;
  type: "call" | "text" | "email" | "post" | "task";
  title: string;
  why: string;
  leadId?: string;
  leadName?: string;
  phone?: string;
  email?: string;
  prefilledMessage?: string;
  emailSubject?: string;
  estMinutes: number;
  href?: string;
}

interface Mission {
  date: string;
  greeting: string;
  intro: string;
  moves: Move[];
  meta: {
    hotCount: number;
    coldCount: number;
    underContractCount: number;
    postedThisWeek: boolean;
    aiStatus: string;
    source: string;
  };
}

// Tokens for the ink-card luxury surface. These are the literal hex/rgba
// values matched to the CSS tokens in globals.css so inline styles stay
// in lockstep with utility classes (.card-ink, .btn-coral, .pill-coral).
const CORAL = "#EE8172";
const CREAM = "#EFDD84";
const TEXT_INV = "#FAF6EE"; // var(--aire-text-inv)
const MUTED_INV = "rgba(250,246,238,0.55)"; // var(--aire-muted-inv)
const BORDER_INK = "rgba(250,246,238,0.10)"; // var(--aire-border-ink)
const SURFACE_INNER = "rgba(250,246,238,0.04)"; // barely-there warm tint
const SURFACE_INNER_HOVER = "rgba(250,246,238,0.08)"; // ghost button bg

// Snooze state lives in localStorage keyed by move ID. Each value is the
// epoch-ms timestamp when the snooze expires. Snoozes that have passed are
// pruned on mount.
const SNOOZE_KEY = "aire.mission.snoozed.v1";
const SNOOZE_DURATION_MS = 60 * 60 * 1000; // 1 hour

function loadSnoozes(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    // Drop expired entries
    const now = Date.now();
    const live: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v > now) live[k] = v;
    }
    return live;
  } catch {
    return {};
  }
}

function saveSnoozes(snoozes: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(snoozes));
  } catch {}
}

export default function DailyMission() {
  const [mission, setMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSnoozed(loadSnoozes());
    fetch("/api/mission")
      .then((r) => r.json())
      .then((data: Mission) => {
        setMission(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Periodically re-check snooze expiry while page is open so a 1-hour snooze
  // pops back into view without a manual reload.
  useEffect(() => {
    const interval = setInterval(() => {
      setSnoozed((prev) => {
        const now = Date.now();
        const live: Record<string, number> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v > now) live[k] = v;
        }
        // Only update if anything actually expired
        if (Object.keys(live).length === Object.keys(prev).length) return prev;
        saveSnoozes(live);
        return live;
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  function markDone(move: Move) {
    setCompleted((prev) => new Set(prev).add(move.id));
    // Log to lead timeline if applicable
    if (move.leadId) {
      fetch(`/api/contacts/${move.leadId}/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: move.type === "call" ? "call" : move.type === "email" ? "email" : "text",
          note: `[Daily Mission] ${move.title}`,
          direction: "outbound",
        }),
      }).catch(() => {});
    }
    advanceToNextAvailable(move.id, { ...snoozed });
  }

  /**
   * Push the active move down the queue for 1 hour. Snoozed moves are not
   * marked done and will surface again either when their snooze expires (the
   * interval above) or on the next page load.
   */
  function snoozeMove(move: Move) {
    const next = { ...snoozed, [move.id]: Date.now() + SNOOZE_DURATION_MS };
    setSnoozed(next);
    saveSnoozes(next);
    advanceToNextAvailable(move.id, next);
  }

  /**
   * Defer a move until tomorrow morning (7am local). Same mechanism as snooze
   * but with a much longer duration so the move drops off today's mission
   * entirely. The interval expiry loop will surface it tomorrow.
   */
  function deferToTomorrow(move: Move) {
    const tomorrow7am = new Date();
    tomorrow7am.setDate(tomorrow7am.getDate() + 1);
    tomorrow7am.setHours(7, 0, 0, 0);
    const next = { ...snoozed, [move.id]: tomorrow7am.getTime() };
    setSnoozed(next);
    saveSnoozes(next);
    advanceToNextAvailable(move.id, next);
  }

  /** Find the next move that's not completed and not currently snoozed. */
  function advanceToNextAvailable(justHandledId: string, currentSnoozed: Record<string, number>) {
    if (!mission) return;
    const newlyCompleted = new Set(completed);
    if (justHandledId) newlyCompleted.add(justHandledId); // optimistic for markDone path
    // Try moves in order, starting after current activeIndex, wrapping around once.
    for (let offset = 1; offset <= mission.moves.length; offset++) {
      const idx = (activeIndex + offset) % mission.moves.length;
      const candidate = mission.moves[idx];
      if (newlyCompleted.has(candidate.id)) continue;
      if (currentSnoozed[candidate.id] && currentSnoozed[candidate.id] > Date.now()) continue;
      setTimeout(() => setActiveIndex(idx), 250);
      return;
    }
    // No available move — all are either done or snoozed. Stay put; render
    // logic will show appropriate end state.
  }

  async function copyMessage(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (loading) {
    return (
      <div
        className="card-ink"
        style={{ padding: "40px 32px", textAlign: "center", borderRadius: "24px" }}
      >
        <div className="skeleton" style={{ width: "200px", height: "20px", margin: "0 auto 12px", borderRadius: "4px" }} />
        <div className="skeleton" style={{ width: "320px", height: "14px", margin: "0 auto", borderRadius: "4px" }} />
      </div>
    );
  }

  if (!mission || mission.moves.length === 0) {
    return (
      <div
        className="card-ink hero-blob-wrap"
        style={{ padding: "44px 36px", textAlign: "center", borderRadius: "24px" }}
      >
        <div className="blob blob-coral" />
        <div className="blob blob-cream" />
        <div className="blob blob-dark" />
        <div style={{ position: "relative", zIndex: 1 }}>
          <p
            style={{
              fontSize: "10px",
              letterSpacing: "0.28em",
              color: CORAL,
              marginBottom: "10px",
              fontWeight: 500,
            }}
          >
            TODAY&apos;S MISSION
          </p>
          <p
            className="font-display"
            style={{ fontSize: "28px", color: TEXT_INV, marginBottom: "10px", lineHeight: 1.15 }}
          >
            Pipeline is quiet.
          </p>
          <p style={{ fontSize: "14px", color: MUTED_INV }}>
            Use this hour to prospect, post, or call a sphere contact.
          </p>
        </div>
      </div>
    );
  }

  const now = Date.now();
  const isSnoozed = (m: Move) => !!snoozed[m.id] && snoozed[m.id] > now;
  const isHandled = (m: Move) => completed.has(m.id) || isSnoozed(m);
  const handledCount = mission.moves.filter(isHandled).length;
  const allHandled = handledCount === mission.moves.length;
  const allDone = completed.size === mission.moves.length;
  const snoozedCount = mission.moves.filter(isSnoozed).length;
  // If the currently-active index points to a handled move, find the next available
  let renderIndex = activeIndex;
  if (mission.moves[renderIndex] && isHandled(mission.moves[renderIndex])) {
    const next = mission.moves.findIndex((m) => !isHandled(m));
    if (next >= 0) renderIndex = next;
  }
  const activeMove = mission.moves[renderIndex];

  // Build the one-tap action link
  function actionHref(move: Move): string | undefined {
    if (move.type === "call" && move.phone) return `tel:${move.phone}`;
    if (move.type === "text" && move.phone) {
      const body = encodeURIComponent(move.prefilledMessage ?? "");
      return `sms:${move.phone}${navigator.userAgent.includes("Mac") ? "&" : "?"}body=${body}`;
    }
    if (move.type === "email" && move.email) {
      const subject = encodeURIComponent(move.emailSubject ?? "");
      const body = encodeURIComponent(move.prefilledMessage ?? "");
      return `mailto:${move.email}?subject=${subject}&body=${body}`;
    }
    return move.href;
  }

  return (
    <div
      className="card-ink hero-blob-wrap"
      style={{
        borderRadius: "24px",
        padding: "34px 36px",
      }}
    >
      {/* Floating blob accents drift behind the content */}
      <div className="blob blob-coral" />
      <div className="blob blob-cream" />
      <div className="blob blob-dark" />

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "22px", gap: "24px" }}>
          <div>
            <p style={{ fontSize: "10px", letterSpacing: "0.28em", color: CORAL, marginBottom: "10px", fontWeight: 500 }}>
              TODAY&apos;S MISSION
            </p>
            <p
              className="font-display"
              style={{ fontSize: "28px", color: TEXT_INV, lineHeight: 1.15, maxWidth: "640px" }}
            >
              {mission.intro}
            </p>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0 }}>
            {mission.moves.map((m, i) => {
              const done = completed.has(m.id);
              const snoozedNow = isSnoozed(m);
              const active = i === renderIndex && !done && !snoozedNow;
              return (
                <div
                  key={m.id}
                  title={snoozedNow ? "Snoozed — returns in ~1h" : done ? "Done" : active ? "Active" : "Upcoming"}
                  style={{
                    width: done ? "28px" : active ? "40px" : "20px",
                    height: "3px",
                    borderRadius: "2px",
                    background: done
                      ? CORAL
                      : snoozedNow
                        ? "rgba(239,221,132,0.5)"
                        : active
                          ? TEXT_INV
                          : "rgba(250,246,238,0.18)",
                    transition: "all 400ms cubic-bezier(0.65,0,0.35,1)",
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* All handled state — could be all done, or some snoozed */}
        {allHandled && (
          <div style={{ padding: "28px 0 12px", textAlign: "center" }}>
            <p
              className="font-display"
              style={{ fontSize: "34px", color: CREAM, marginBottom: "10px", lineHeight: 1.1 }}
            >
              {allDone ? "Mission complete." : snoozedCount === mission.moves.length ? "All snoozed." : "Cleared for now."}
            </p>
            <p style={{ fontSize: "14px", color: MUTED_INV, lineHeight: 1.55 }}>
              {allDone
                ? "Three moves done. That's the day. Anything else is upside."
                : `${completed.size} done · ${snoozedCount} snoozed. Come back in an hour and the snoozed moves return.`}
            </p>
          </div>
        )}

        {/* Active move card */}
        {!allHandled && activeMove && (
          <div
            style={{
              background: SURFACE_INNER,
              borderRadius: "14px",
              padding: "26px",
              border: `1px solid ${BORDER_INK}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "12px" }}>
                  <span
                    className="pill-coral"
                    style={{
                      fontSize: "10px",
                      letterSpacing: "0.2em",
                      fontWeight: 600,
                    }}
                  >
                    MOVE {activeMove.rank}
                  </span>
                  <span
                    style={{
                      fontSize: "10px",
                      letterSpacing: "0.18em",
                      color: MUTED_INV,
                      textTransform: "uppercase",
                    }}
                  >
                    {activeMove.type}
                  </span>
                  <span style={{ fontSize: "11px", color: MUTED_INV }}>·</span>
                  <span style={{ fontSize: "11px", color: MUTED_INV }}>~{activeMove.estMinutes} min</span>
                </div>
                <h3
                  className="font-display"
                  style={{ fontSize: "28px", color: TEXT_INV, marginBottom: "10px", lineHeight: 1.1 }}
                >
                  {activeMove.title}
                </h3>
                <p style={{ fontSize: "14px", color: MUTED_INV, lineHeight: 1.55, maxWidth: "640px" }}>
                  {activeMove.why}
                </p>
              </div>
            </div>

            {/* Pre-written message */}
            {activeMove.prefilledMessage && activeMove.type !== "post" && (
              <div
                style={{
                  background: "rgba(0,0,0,0.30)",
                  borderRadius: "12px",
                  padding: "18px",
                  marginTop: "20px",
                  marginBottom: "22px",
                  border: `1px solid ${BORDER_INK}`,
                }}
              >
                {activeMove.emailSubject && (
                  <p style={{ fontSize: "11px", color: MUTED_INV, marginBottom: "10px", letterSpacing: "0.1em" }}>
                    SUBJECT: <span style={{ color: TEXT_INV }}>{activeMove.emailSubject}</span>
                  </p>
                )}
                <p
                  style={{
                    fontSize: "15px",
                    color: "rgba(250,246,238,0.92)",
                    lineHeight: 1.55,
                    fontFamily: "Hauora, sans-serif",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {activeMove.prefilledMessage}
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {actionHref(activeMove) && (
                <a
                  href={actionHref(activeMove)}
                  className="btn-coral"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    textDecoration: "none",
                  }}
                >
                  {activeMove.type === "call" && "Call now"}
                  {activeMove.type === "text" && "Open text"}
                  {activeMove.type === "email" && "Open email"}
                  {activeMove.type === "post" && "Generate post"}
                  {activeMove.type === "task" && "Open"}
                  <span style={{ fontSize: "16px" }}>→</span>
                </a>
              )}
              {activeMove.prefilledMessage && activeMove.type !== "post" && (
                <button
                  onClick={() => copyMessage(activeMove.prefilledMessage ?? "")}
                  style={{
                    padding: "12px 18px",
                    borderRadius: "999px",
                    background: SURFACE_INNER_HOVER,
                    color: TEXT_INV,
                    fontSize: "13px",
                    border: `1px solid ${BORDER_INK}`,
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  {copied ? "Copied ✓" : "Copy message"}
                </button>
              )}
              {activeMove.leadId && (
                <Link
                  href={`/contacts/${activeMove.leadId}`}
                  style={{
                    padding: "12px 18px",
                    borderRadius: "999px",
                    background: "transparent",
                    color: MUTED_INV,
                    fontSize: "13px",
                    border: `1px solid ${BORDER_INK}`,
                    textDecoration: "none",
                  }}
                >
                  View profile
                </Link>
              )}
              <button
                onClick={() => snoozeMove(activeMove)}
                title="Push this move down the queue. Returns in 1 hour."
                style={{
                  padding: "12px 16px",
                  borderRadius: "999px",
                  background: "transparent",
                  color: MUTED_INV,
                  fontSize: "13px",
                  border: `1px solid ${BORDER_INK}`,
                  cursor: "pointer",
                  marginLeft: "auto",
                }}
              >
                Snooze 1h
              </button>
              <button
                onClick={() => deferToTomorrow(activeMove)}
                title="Drop from today's mission. Returns tomorrow at 7am."
                style={{
                  padding: "12px 14px",
                  borderRadius: "999px",
                  background: "transparent",
                  color: MUTED_INV,
                  fontSize: "12px",
                  border: `1px solid ${BORDER_INK}`,
                  cursor: "pointer",
                  opacity: 0.85,
                }}
              >
                Defer →
              </button>
              <button
                onClick={() => markDone(activeMove)}
                style={{
                  padding: "12px 18px",
                  borderRadius: "999px",
                  background: "transparent",
                  color: CREAM,
                  fontSize: "13px",
                  border: "1px solid rgba(239,221,132,0.3)",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Mark done ✓
              </button>
            </div>
          </div>
        )}

        {/* Upcoming moves preview */}
        {!allHandled && mission.moves.length > 1 && (
          <div style={{ marginTop: "22px", display: "flex", gap: "10px" }}>
            {mission.moves.map((m, i) => {
              if (i === renderIndex) return null;
              const done = completed.has(m.id);
              const snoozedNow = isSnoozed(m);
              const clickable = !done && !snoozedNow;
              const label = done ? "· DONE" : snoozedNow ? "· SNOOZED" : "";
              return (
                <div
                  key={m.id}
                  onClick={() => clickable && setActiveIndex(i)}
                  style={{
                    flex: 1,
                    padding: "14px 16px",
                    borderRadius: "12px",
                    background: SURFACE_INNER,
                    border: `1px solid ${BORDER_INK}`,
                    cursor: clickable ? "pointer" : "default",
                    opacity: done ? 0.4 : snoozedNow ? 0.6 : 0.85,
                    transition: "opacity 200ms ease, background 200ms ease",
                  }}
                >
                  <p style={{ fontSize: "10px", color: MUTED_INV, letterSpacing: "0.15em", marginBottom: "6px" }}>
                    MOVE {m.rank} · {m.type.toUpperCase()} {label}
                  </p>
                  <p style={{ fontSize: "13px", color: TEXT_INV, fontWeight: 500, marginBottom: "4px" }}>
                    {m.title}
                  </p>
                  <p style={{ fontSize: "11px", color: MUTED_INV, lineHeight: 1.4 }}>
                    {m.why.slice(0, 80)}
                    {m.why.length > 80 ? "…" : ""}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Meta footer */}
        <div
          style={{
            marginTop: "22px",
            paddingTop: "18px",
            borderTop: `1px solid ${BORDER_INK}`,
            display: "flex",
            gap: "20px",
            fontSize: "11px",
            color: MUTED_INV,
            letterSpacing: "0.1em",
          }}
        >
          <span>{mission.meta.hotCount} HOT</span>
          <span>{mission.meta.coldCount} COLD</span>
          <span>{mission.meta.underContractCount} UNDER CONTRACT</span>
          <span style={{ marginLeft: "auto" }}>
            {mission.meta.source === "ai" ? "AI · " : "TEMPLATE · "}
            {mission.date.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
}
