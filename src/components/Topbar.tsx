"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import NotificationCenter from "@/components/NotificationCenter";
import { Settings, LogOut, User, ChevronDown } from "lucide-react";

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
  "/today": "Today",
  "/market": "Market",
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
  const [avatarOpen, setAvatarOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!quickOpen && !avatarOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setQuickOpen(false);
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) setAvatarOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [quickOpen, avatarOpen]);

  const label = getLabel(pathname ?? "/");

  const QUICK_ACTIONS: QuickAction[] = [
    { label: "New Lead",    shortcut: "N", href: "/pipeline" },
    { label: "Log Deal",    shortcut: "D", action: () => document.dispatchEvent(new CustomEvent("aire:open-log-deal")) },
    { label: "Create Post", shortcut: "P", href: "/create-post" },
    { label: "Smart Plans", shortcut: "S", href: "/smart-plans" },
    { label: "MLS Search",  shortcut: "M", href: "/mls" },
  ];

  const AVATAR_ITEMS = [
    { icon: <User size={13} />,     label: "Profile",  href: "/settings" },
    { icon: <Settings size={13} />, label: "Settings", href: "/settings" },
    { icon: <LogOut size={13} />,   label: "Sign out",  href: "/" },
  ];

  const dropStyle: React.CSSProperties = {
    position: "absolute", top: "calc(100% + 8px)", right: 0,
    background: "rgba(255,255,255,0.97)",
    border: "1px solid rgba(0,0,0,0.10)",
    borderRadius: 12,
    boxShadow: "0 16px 48px rgba(0,0,0,0.14)",
    overflow: "hidden",
    minWidth: 200,
    animation: "scale-in 140ms var(--ease-out-expo) both",
    zIndex: 200,
  };

  const dropItemStyle: React.CSSProperties = {
    width: "100%", display: "flex", alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px", background: "none", border: "none",
    cursor: "pointer", textAlign: "left",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
    gap: 10, transition: "background 130ms",
  };

  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "0 28px", height: 52,
      borderBottom: "1px solid var(--aire-glass-line)",
      background: "rgba(245,240,234,0.88)",
      backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
      position: "sticky", top: 0, zIndex: 40, flexShrink: 0,
    }}>

      {/* Left: page label + time */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--aire-text)", letterSpacing: "0.01em" }}>
          {label}
        </span>
        {time && (
          <span style={{ fontSize: 11, color: "var(--aire-muted)", marginLeft: 2 }}>
            · {time} CST
          </span>
        )}
      </div>

      {/* Right: search + quick + notifications + avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>

        {/* Search */}
        <button
          onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
            background: "var(--aire-card)", border: "1px solid var(--aire-border)",
            borderRadius: 8, cursor: "pointer",
            color: "var(--aire-muted)", fontSize: 12, fontFamily: "inherit",
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
          Search
          <span style={{
            background: "var(--aire-card-warm)", border: "1px solid var(--aire-border)",
            borderRadius: 4, padding: "1px 5px", fontSize: 10, letterSpacing: "0.04em",
          }}>⌘K</span>
        </button>

        {/* Quick actions */}
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            onClick={() => setQuickOpen(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 5, padding: "6px 12px",
              background: quickOpen ? "var(--aire-green)" : "var(--aire-card)",
              border: `1px solid ${quickOpen ? "var(--aire-green)" : "var(--aire-border)"}`,
              borderRadius: 8, cursor: "pointer",
              color: quickOpen ? "#fff" : "var(--aire-text-2)",
              fontSize: 12, fontFamily: "inherit", fontWeight: 600,
              transition: "all 180ms var(--ease-apple)",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Quick
          </button>

          {quickOpen && (
            <div style={dropStyle}>
              {QUICK_ACTIONS.map((qa, i) => (
                <button
                  key={qa.label}
                  onClick={() => {
                    setQuickOpen(false);
                    if (qa.href) router.push(qa.href);
                    if (qa.action) qa.action();
                  }}
                  style={{ ...dropItemStyle, borderBottom: i < QUICK_ACTIONS.length - 1 ? dropItemStyle.borderBottom : "none" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.03)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                  <span style={{ fontSize: 12, color: "var(--aire-text)", fontWeight: 500 }}>{qa.label}</span>
                  <span style={{
                    fontSize: 9.5, letterSpacing: "0.08em",
                    background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.08)",
                    borderRadius: 4, padding: "2px 6px", color: "var(--aire-muted)",
                  }}>
                    {qa.shortcut}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <NotificationCenter />

        {/* User avatar */}
        <div ref={avatarRef} style={{ position: "relative" }}>
          <button
            onClick={() => setAvatarOpen(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "4px 8px 4px 4px",
              background: avatarOpen ? "rgba(6,95,70,0.08)" : "rgba(255,255,255,0.60)",
              border: `1px solid ${avatarOpen ? "rgba(6,95,70,0.25)" : "rgba(0,0,0,0.09)"}`,
              borderRadius: 100, cursor: "pointer",
              transition: "all 180ms var(--ease-apple)",
            }}
            onMouseEnter={e => {
              if (!avatarOpen) {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.85)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,0,0,0.14)";
              }
            }}
            onMouseLeave={e => {
              if (!avatarOpen) {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.60)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,0,0,0.09)";
              }
            }}
          >
            <div style={{
              width: 26, height: 26, borderRadius: "50%",
              background: "linear-gradient(135deg, #065F46, #0A7C5C)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: "#fff",
              boxShadow: "0 2px 6px rgba(6,95,70,0.25)",
            }}>
              CJ
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--aire-text)" }}>
              Caleb
            </span>
            <ChevronDown
              size={11}
              style={{
                color: "var(--aire-muted)",
                transform: avatarOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 200ms",
              }}
            />
          </button>

          {avatarOpen && (
            <div style={{ ...dropStyle, minWidth: 220 }}>
              {/* Profile header */}
              <div style={{
                padding: "14px 16px 12px",
                borderBottom: "1px solid rgba(0,0,0,0.07)",
                background: "rgba(6,95,70,0.04)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: "linear-gradient(135deg, #065F46, #0A7C5C)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 800, color: "#fff",
                  }}>
                    CJ
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--aire-text)" }}>
                      Caleb Jackson
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--aire-muted)", marginTop: 1 }}>
                      Rêve Realtors® · Baton Rouge
                    </div>
                  </div>
                </div>
              </div>

              {/* Menu items */}
              {AVATAR_ITEMS.map((item, i) => (
                <button
                  key={item.label}
                  onClick={() => { setAvatarOpen(false); router.push(item.href); }}
                  style={{
                    ...dropItemStyle,
                    justifyContent: "flex-start",
                    gap: 10,
                    borderBottom: i < AVATAR_ITEMS.length - 1 ? dropItemStyle.borderBottom : "none",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.03)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                  <span style={{ color: "var(--aire-text-2)" }}>{item.icon}</span>
                  <span style={{ fontSize: 12.5, color: "var(--aire-text)", fontWeight: 500 }}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
