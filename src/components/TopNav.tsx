"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Sunrise, GitBranch, Users, PenTool, Settings, Map, Menu, X,
  FileText, MessageCircle, UserCheck, Target, Bot, BookOpen, Radar, Globe, Zap,
  Search, Plus, Building2, Activity,
} from "lucide-react";
import NotificationCenter from "@/components/NotificationCenter";

const ICON = 16;

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badgeKey?: "overdue" | "queue";
}
interface NavGroup {
  label: string;
  href?: string;          // direct link (no dropdown) when set
  items?: NavItem[];
  badgeKey?: "overdue" | "queue";
}

/** Lofty-style grouped top nav. Mirrors the old Sidebar SECTIONS as dropdowns. */
const GROUPS: NavGroup[] = [
  { label: "Today", href: "/today", badgeKey: "queue" },
  {
    label: "Sales",
    items: [
      { href: "/pipeline", label: "Pipeline", icon: <GitBranch size={ICON} />, badgeKey: "overdue" },
      { href: "/contacts", label: "Contacts", icon: <Users size={ICON} /> },
      { href: "/people", label: "People", icon: <Globe size={ICON} /> },
      { href: "/buyers", label: "Buyers", icon: <BookOpen size={ICON} /> },
      { href: "/follow-up", label: "Follow-Up", icon: <UserCheck size={ICON} /> },
      { href: "/touches", label: "Touch Tracker", icon: <Radar size={ICON} />, badgeKey: "overdue" },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/studio", label: "Video Brain", icon: <Zap size={ICON} /> },
      { href: "/create-post", label: "Studio", icon: <PenTool size={ICON} /> },
      { href: "/social-drafts", label: "Drafts", icon: <FileText size={ICON} /> },
      { href: "/messenger-outreach", label: "Outreach", icon: <MessageCircle size={ICON} /> },
      { href: "/chat", label: "AIRE Chat", icon: <Bot size={ICON} /> },
    ],
  },
  {
    label: "Intel",
    items: [
      { href: "/market", label: "Market", icon: <Map size={ICON} /> },
      { href: "/smart-plans", label: "Smart Plans", icon: <Target size={ICON} /> },
    ],
  },
  {
    label: "More",
    items: [
      { href: "/mls", label: "MLS", icon: <Building2 size={ICON} /> },
      { href: "/system", label: "System Health", icon: <Activity size={ICON} /> },
      { href: "/settings", label: "Settings", icon: <Settings size={ICON} /> },
    ],
  },
];

interface QuickAction { label: string; shortcut: string; href?: string; action?: () => void; }
const QUICK_ACTIONS: QuickAction[] = [
  { label: "New Lead", shortcut: "N", href: "/pipeline" },
  { label: "Log Deal", shortcut: "D", action: () => document.dispatchEvent(new CustomEvent("aire:open-log-deal")) },
  { label: "Create Post", shortcut: "P", href: "/create-post" },
  { label: "Smart Plans", shortcut: "S", href: "/smart-plans" },
  { label: "MLS Search", shortcut: "M", href: "/mls" },
];

function openPalette() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
}

export default function TopNav() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);   // hovered/clicked group
  const [quickOpen, setQuickOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [overdueCount, setOverdueCount] = useState(0);
  const [queueCount, setQueueCount] = useState(0);
  const quickRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [taskRes, queueRes] = await Promise.all([
          fetch("/api/tasks?overdue=true&limit=1"),
          fetch("/api/actions/queue"),
        ]);
        if (taskRes.ok) { const d = await taskRes.json(); setOverdueCount(d.overdueCount ?? 0); }
        if (queueRes.ok) { const d = await queueRes.json(); setQueueCount((d.items as unknown[])?.length ?? 0); }
      } catch {}
    }
    load();
    const id = setInterval(load, 60_000);
    window.addEventListener("aire:refresh", load);
    return () => { clearInterval(id); window.removeEventListener("aire:refresh", load); };
  }, []);

  // close quick + mobile on route change
  useEffect(() => { setOpen(null); setQuickOpen(false); setMobileOpen(false); }, [pathname]);

  // outside-click for quick menu
  useEffect(() => {
    if (!quickOpen) return;
    function onDown(e: MouseEvent) {
      if (quickRef.current && !quickRef.current.contains(e.target as Node)) setQuickOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [quickOpen]);

  function badgeCount(key?: "overdue" | "queue") {
    if (key === "queue") return queueCount;
    if (key === "overdue") return overdueCount;
    return 0;
  }
  function groupBadge(g: NavGroup) {
    if (g.badgeKey) return badgeCount(g.badgeKey);
    return (g.items ?? []).reduce((n, it) => n + badgeCount(it.badgeKey), 0);
  }
  function itemActive(href: string) {
    if (href === "/today") return pathname === "/today" || pathname === "/";
    return pathname.startsWith(href);
  }
  function groupActive(g: NavGroup) {
    if (g.href) return itemActive(g.href);
    return (g.items ?? []).some(it => itemActive(it.href));
  }

  function hoverOpen(label: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(label);
  }
  function hoverClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(null), 120);
  }

  return (
    <header className="topnav">
      {/* Brand */}
      <Link href="/today" className="tn-brand" aria-label="AIRE — Today">
        <span className="tn-mk">A</span>
        <span className="tn-wm">AIRE</span>
      </Link>

      {/* Primary nav (desktop) */}
      <nav className="tn-groups" aria-label="Primary">
        {GROUPS.map(g => {
          const count = groupBadge(g);
          const active = groupActive(g);
          if (g.href) {
            return (
              <Link key={g.label} href={g.href} className={`tn-trigger${active ? " on" : ""}`}>
                {g.label}
                {count > 0 && <span className="tn-bdg">{count > 99 ? "99+" : count}</span>}
              </Link>
            );
          }
          return (
            <div
              key={g.label}
              className="tn-group"
              onMouseEnter={() => hoverOpen(g.label)}
              onMouseLeave={hoverClose}
            >
              <button
                className={`tn-trigger${active ? " on" : ""}`}
                aria-haspopup="true"
                aria-expanded={open === g.label}
                onClick={() => setOpen(open === g.label ? null : g.label)}
              >
                {g.label}
                {count > 0 && <span className="tn-bdg">{count > 99 ? "99+" : count}</span>}
                <svg className="tn-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              {open === g.label && (
                <div className="tn-menu" onMouseEnter={() => hoverOpen(g.label)} onMouseLeave={hoverClose}>
                  {g.items!.map(it => {
                    const c = badgeCount(it.badgeKey);
                    return (
                      <Link key={it.href} href={it.href} className={`tn-mi${itemActive(it.href) ? " on" : ""}`}>
                        <span className="tn-mi-ic">{it.icon}</span>
                        <span>{it.label}</span>
                        {c > 0 && <span className="tn-bdg" style={{ marginLeft: "auto" }}>{c > 99 ? "99+" : c}</span>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Global search (desktop) */}
      <button className="tn-search" onClick={openPalette} aria-label="Search (Command K)">
        <Search size={15} />
        <span className="tn-search-ph">Search leads, contacts…</span>
        <span className="tn-kbd">⌘K</span>
      </button>

      {/* Right utilities */}
      <div className="tn-right">
        {/* Quick action */}
        <div ref={quickRef} style={{ position: "relative" }}>
          <button className={`tn-quick${quickOpen ? " on" : ""}`} onClick={() => setQuickOpen(v => !v)} aria-label="Quick actions">
            <Plus size={15} /><span className="tn-quick-label">Quick</span>
          </button>
          {quickOpen && (
            <div className="tn-menu" style={{ right: 0, left: "auto", minWidth: "200px" }}>
              {QUICK_ACTIONS.map(qa => (
                <button
                  key={qa.label}
                  className="tn-mi"
                  style={{ width: "100%", justifyContent: "space-between" }}
                  onClick={() => { setQuickOpen(false); if (qa.href) router.push(qa.href); qa.action?.(); }}
                >
                  <span>{qa.label}</span>
                  <span className="tn-kbd">{qa.shortcut}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="tn-icon-btn" onClick={openPalette} aria-label="Search" data-mobile-search>
          <Search size={18} />
        </button>

        <NotificationCenter />

        <Link href="/settings" className="tn-av" aria-label="Caleb Jackson — Settings">CJ</Link>

        <button className="tn-icon-btn" data-hamburger onClick={() => setMobileOpen(v => !v)} aria-label="Menu">
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="tn-mobile">
          {GROUPS.map(g => (
            <div key={g.label} className="tn-mobile-sec">
              <div className="tn-mobile-h">{g.label}</div>
              {(g.href ? [{ href: g.href, label: g.label, icon: <Sunrise size={ICON} /> }] : g.items!).map(it => (
                <Link key={it.href} href={it.href} className={`tn-mi${itemActive(it.href) ? " on" : ""}`}>
                  <span className="tn-mi-ic">{it.icon}</span><span>{it.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
