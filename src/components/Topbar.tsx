"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import NotificationCenter from "@/components/NotificationCenter";

const PAGE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/pipeline": "Pipeline",
  "/contacts": "Contacts",
  "/linkedin": "LinkedIn",
  "/buyers": "Buyers",
  "/smart-plans": "Smart Plans",
  "/create-post": "Post Studio",
  "/social": "Social",
  "/mls": "MLS",
  "/settings": "Settings",
  "/system": "System Health",
  "/content-calendar": "Content Calendar",
};

function getLabel(pathname: string) {
  if (pathname.startsWith("/contacts/")) return "Contact Profile";
  return PAGE_LABELS[pathname] ?? "AIRE";
}

interface QuickAction {
  label: string;
  shortcut: string;
  href?: string;
  action?: () => void;
}

export default function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [time, setTime] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function tick() {
      setTime(new Date().toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", hour12: true,
        timeZone: "America/Chicago",
      }));
    }
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  // Close quick menu on outside click
  useEffect(() => {
    if (!quickOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setQuickOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [quickOpen]);

  const label = getLabel(pathname ?? "/");

  const QUICK_ACTIONS: QuickAction[] = [
    { label: "New Lead", shortcut: "N", href: "/pipeline" },
    { label: "Log Deal", shortcut: "D", action: () => {
      document.dispatchEvent(new CustomEvent("aire:open-log-deal"));
    }},
    { label: "Create Post", shortcut: "P", href: "/create-post" },
    { label: "Smart Plans", shortcut: "S", href: "/smart-plans" },
    { label: "MLS Search", shortcut: "M", href: "/mls" },
  ];

  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "0 30px",
      height: "52px",
      borderBottom: "1px solid var(--aire-glass-line)",
      background: "rgba(9,9,11,0.72)",
      backdropFilter: "blur(18px)",
      WebkitBackdropFilter: "blur(18px)",
      position: "sticky",
      top: 0,
      zIndex: 40,
      flexShrink: 0,
    }}>
      {/* Left: page label + time */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--aire-text)", letterSpacing: "0.01em" }}>
          {label}
        </span>
        {time && (
          <span style={{ fontSize: "11px", color: "var(--aire-muted)", marginLeft: "4px" }}>
            · {time} CST
          </span>
        )}
      </div>

      {/* Right: quick add + search + notifications */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>

        {/* ⚡ Quick-action + button */}
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            onClick={() => setQuickOpen(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: "5px",
              padding: "6px 12px",
              background: quickOpen ? "var(--aire-coral)" : "var(--aire-card)",
              border: `1px solid ${quickOpen ? "var(--aire-coral)" : "var(--aire-border)"}`,
              borderRadius: "8px", cursor: "pointer",
              color: quickOpen ? "#09090B" : "var(--aire-text-2)",
              fontSize: "12px", fontFamily: "inherit",
              transition: "all 180ms var(--ease-apple)",
              fontWeight: 600,
            }}
            title="Quick actions"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Quick
          </button>

          {quickOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0,
              background: "var(--aire-card-warm)",
              border: "1px solid var(--aire-border-2)",
              borderRadius: "12px",
              boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
              overflow: "hidden",
              minWidth: "200px",
              animation: "scale-in 140ms var(--ease-out-expo) both",
              zIndex: 200,
            }}>
              {QUICK_ACTIONS.map(qa => (
                <button
                  key={qa.label}
                  onClick={() => {
                    setQuickOpen(false);
                    if (qa.href) router.push(qa.href);
                    if (qa.action) qa.action();
                  }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", background: "none", border: "none",
                    cursor: "pointer", textAlign: "left", gap: "12px",
                    borderBottom: "1px solid var(--aire-border)",
                    transition: "background 150ms",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--aire-card)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                  <span style={{ fontSize: "12px", color: "var(--aire-text)", fontWeight: 500 }}>{qa.label}</span>
                  <span style={{
                    fontSize: "9px", letterSpacing: "0.08em",
                    background: "var(--aire-card)", border: "1px solid var(--aire-border)",
                    borderRadius: "4px", padding: "2px 6px", color: "var(--aire-muted)",
                  }}>
                    {qa.shortcut}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cmd+K search */}
        <button
          onClick={() => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
          }}
          style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "6px 12px",
            background: "var(--aire-card)", border: "1px solid var(--aire-border)",
            borderRadius: "8px", cursor: "pointer",
            color: "var(--aire-muted)", fontSize: "12px", fontFamily: "inherit",
            transition: "border-color 200ms, color 200ms",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--aire-border-2)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--aire-text-2)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--aire-border)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--aire-muted)";
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
          </svg>
          <span>Search</span>
          <span style={{
            background: "var(--aire-card-warm)", border: "1px solid var(--aire-border)",
            borderRadius: "4px", padding: "1px 5px", fontSize: "10px", letterSpacing: "0.04em",
          }}>⌘K</span>
        </button>

        <NotificationCenter />
      </div>
    </div>
  );
}
