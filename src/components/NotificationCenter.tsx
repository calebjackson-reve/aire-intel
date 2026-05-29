"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
}

const TYPE_ICONS: Record<string, string> = {
  listing_match: "⌂",
  lead_assigned: "●",
  task_due: "✓",
  sync_complete: "✓",
  social_post: "◎",
  error: "!",
};

// Each type maps to one of three flavors: mint (success), coral (alert), cream (info)
type Flavor = "mint" | "coral" | "cream";
const TYPE_FLAVOR: Record<string, Flavor> = {
  sync_complete: "mint",
  listing_match: "mint",
  task_due: "mint",
  error: "coral",
  lead_assigned: "cream",
  social_post: "cream",
};

function flavorTokens(flavor: Flavor) {
  switch (flavor) {
    case "mint":
      return { bg: "var(--aire-mint-soft)", fg: "#2d7a55", border: "rgba(184,230,208,0.5)" };
    case "coral":
      return { bg: "var(--aire-coral-soft)", fg: "var(--aire-coral-deep)", border: "rgba(238,129,114,0.25)" };
    case "cream":
    default:
      return { bg: "var(--aire-cream-soft)", fg: "#8a7a18", border: "rgba(239,221,132,0.35)" };
  }
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const errorCountRef = useRef(0);

  useEffect(() => {
    // Always seed with a REST fetch so the UI populates immediately, then
    // upgrade to SSE for real-time deltas. Polling stays as a fallback.
    fetchNotifications();

    const startPolling = () => {
      if (pollTimerRef.current) return;
      pollTimerRef.current = setInterval(fetchNotifications, 60_000);
    };
    const stopPolling = () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    // Bail out cleanly on SSR / environments without EventSource.
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      startPolling();
      return () => stopPolling();
    }

    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const es = new EventSource("/api/notifications/stream");
      esRef.current = es;

      es.addEventListener("connected", () => {
        // Stream is alive — reset error counter and disable the slow poll.
        errorCountRef.current = 0;
        stopPolling();
      });

      es.addEventListener("unread", (evt: MessageEvent) => {
        try {
          const data = JSON.parse(evt.data);
          if (typeof data.unreadCount === "number") {
            setUnreadCount(data.unreadCount);
          }
        } catch {
          /* ignore malformed payload */
        }
      });

      // Default (unnamed) events carry new notifications.
      es.onmessage = (evt: MessageEvent) => {
        try {
          const data = JSON.parse(evt.data);
          const n: Notification | undefined = data.notification;
          if (!n) return;
          setNotifications(prev => {
            if (prev.some(x => x.id === n.id)) return prev;
            return [n, ...prev].slice(0, 50);
          });
          if (!n.read) setUnreadCount(c => c + 1);
        } catch {
          /* ignore malformed payload */
        }
      };

      es.onerror = () => {
        errorCountRef.current += 1;
        es.close();
        esRef.current = null;
        if (cancelled) return;
        if (errorCountRef.current >= 2) {
          // Two strikes — give up on SSE and fall back to the legacy poll.
          // eslint-disable-next-line no-console
          console.warn(
            "[NotificationCenter] SSE failed twice, falling back to 60s polling"
          );
          startPolling();
        } else {
          // One transient error — try to reconnect after a short delay.
          setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      stopPolling();
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function fetchNotifications() {
    setLoading(true);
    const data = await fetch("/api/notifications").then(r => r.json()).catch(() => ({ notifications: [], unreadCount: 0 }));
    setNotifications(data.notifications ?? []);
    setUnreadCount(data.unreadCount ?? 0);
    setLoading(false);
  }

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Bell button — quiet, no bg, hover lifts warm */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Notifications"
        style={{
          position: "relative",
          width: "36px",
          height: "36px",
          background: open ? "var(--aire-card-warm)" : "transparent",
          border: "none",
          borderRadius: "10px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--aire-text-2)",
          transition: "background 200ms, color 200ms",
        }}
        onMouseEnter={e => {
          if (!open) (e.currentTarget as HTMLButtonElement).style.background = "var(--aire-card-warm)";
        }}
        onMouseLeave={e => {
          if (!open) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }}
      >
        {/* Bell glyph — drawn as SVG so it tints cleanly */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>

        {/* Unread dot — small coral circle, no number, no border */}
        {unreadCount > 0 && (
          <span
            aria-label={`${unreadCount} unread`}
            style={{
              position: "absolute",
              top: "6px",
              right: "6px",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "var(--aire-coral)",
              boxShadow: "0 0 0 2px var(--aire-card)",
            }}
          />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "44px",
            right: 0,
            width: "380px",
            maxWidth: "calc(100vw - 32px)",
            maxHeight: "480px",
            background: "var(--aire-card)",
            border: "1px solid var(--aire-border)",
            borderRadius: "14px",
            boxShadow: "var(--shadow-card-hover)",
            overflow: "hidden",
            animation: "scale-in 220ms var(--ease-out-expo) both",
            zIndex: 200,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "14px 18px",
              borderBottom: "1px solid var(--aire-border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.20em",
                  color: "var(--aire-muted)",
                  textTransform: "uppercase",
                  fontWeight: 500,
                }}
              >
                Notifications
              </span>
              {unreadCount > 0 && (
                <span
                  className="pill pill-coral"
                  style={{ padding: "2px 9px", fontSize: "10px", fontWeight: 600 }}
                >
                  {unreadCount > 99 ? "99+" : unreadCount} new
                </span>
              )}
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", maxHeight: "360px", flex: 1 }}>
            {loading ? (
              <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "8px" }}>
                {[1, 2, 3].map(i => (
                  <div key={i} className="skeleton" style={{ height: "52px" }} />
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div
                style={{
                  padding: "44px 18px",
                  textAlign: "center",
                  background: "var(--aire-card-warm)",
                }}
              >
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--aire-muted)",
                    fontStyle: "italic",
                  }}
                >
                  All caught up.
                </p>
              </div>
            ) : (
              notifications.map((n, i) => {
                const flavor = TYPE_FLAVOR[n.type] ?? "cream";
                const tone = flavorTokens(flavor);

                const baseRowBg = n.read ? "transparent" : "var(--aire-card-warm)";
                const rowStyle: React.CSSProperties = {
                  display: "flex",
                  gap: "12px",
                  padding: "12px 18px",
                  borderBottom:
                    i < notifications.length - 1 ? "1px solid var(--aire-border)" : "none",
                  background: baseRowBg,
                  cursor: "pointer",
                  textDecoration: "none",
                  transition: "background 150ms",
                  color: "inherit",
                };

                const iconNode = (
                  <div
                    style={{
                      width: "30px",
                      height: "30px",
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: tone.bg,
                      border: `1px solid ${tone.border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "13px",
                      color: tone.fg,
                      fontWeight: 600,
                    }}
                  >
                    {TYPE_ICONS[n.type] ?? "●"}
                  </div>
                );

                const bodyNode = (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: "13px",
                          fontWeight: n.read ? 400 : 500,
                          color: "var(--aire-text)",
                          marginBottom: "2px",
                          lineHeight: 1.35,
                        }}
                      >
                        {n.title}
                      </p>
                      {n.body && (
                        <p
                          style={{
                            fontSize: "11px",
                            color: "var(--aire-text-2)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            lineHeight: 1.4,
                          }}
                        >
                          {n.body}
                        </p>
                      )}
                      <p
                        style={{
                          fontSize: "10px",
                          color: "var(--aire-muted)",
                          marginTop: "3px",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                    {!n.read && (
                      <div
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          background: "var(--aire-coral)",
                          marginTop: "8px",
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </>
                );

                const hoverOn = (bg: string) => (e: React.MouseEvent<HTMLElement>) => {
                  e.currentTarget.style.background = bg;
                };

                return n.href ? (
                  <Link
                    key={n.id}
                    href={n.href}
                    onClick={() => !n.read && markRead(n.id)}
                    style={rowStyle}
                    onMouseEnter={hoverOn("var(--aire-card-warm)")}
                    onMouseLeave={hoverOn(baseRowBg)}
                  >
                    {iconNode}
                    {bodyNode}
                  </Link>
                ) : (
                  <div
                    key={n.id}
                    onClick={() => !n.read && markRead(n.id)}
                    style={rowStyle}
                    onMouseEnter={hoverOn("var(--aire-card-warm)")}
                    onMouseLeave={hoverOn(baseRowBg)}
                  >
                    {iconNode}
                    {bodyNode}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer — Mark all read */}
          {unreadCount > 0 && (
            <div
              style={{
                borderTop: "1px solid var(--aire-border)",
                padding: "10px 14px",
                background: "var(--aire-card)",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={markAllRead}
                className="btn-ghost"
                style={{
                  padding: "6px 14px",
                  fontSize: "10px",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                Mark all read
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
