"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Sunrise, GitBranch, Users, PenTool, Settings, Map, Newspaper, CheckSquare, Pin, PinOff } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badgeKey?: "overdue" | "queue";
}

const ICON = 17;

const PRIMARY: NavItem[] = [
  { href: "/brief",          label: "Brief",    icon: <Newspaper size={ICON} />,    badgeKey: "queue" },
  { href: "/today",          label: "Today",    icon: <CheckSquare size={ICON} /> },
  { href: "/pipeline",       label: "Pipeline", icon: <GitBranch size={ICON} />,    badgeKey: "overdue" },
  { href: "/contacts",       label: "Contacts", icon: <Users size={ICON} /> },
  { href: "/market",         label: "Market",   icon: <Map size={ICON} /> },
  { href: "/create-post",    label: "Content",  icon: <PenTool size={ICON} /> },
  { href: "/settings",       label: "Settings", icon: <Settings size={ICON} /> },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [overdueCount, setOverdueCount] = useState(0);
  const [queueCount, setQueueCount] = useState(0);
  const [pinned, setPinned] = useState(false); // pinned = always expanded

  useEffect(() => {
    async function load() {
      try {
        const [taskRes, queueRes] = await Promise.all([
          fetch("/api/tasks?overdue=true&limit=1"),
          fetch("/api/actions/queue"),
        ]);
        if (taskRes.ok) {
          const d = await taskRes.json();
          setOverdueCount(d.overdueCount ?? 0);
        }
        if (queueRes.ok) {
          const d = await queueRes.json();
          setQueueCount((d.items as unknown[])?.length ?? 0);
        }
      } catch {}
    }
    load();
    const id = setInterval(load, 60_000);
    window.addEventListener("aire:refresh", load);
    return () => { clearInterval(id); window.removeEventListener("aire:refresh", load); };
  }, []);

  function isActive(href: string) {
    if (href === "/brief") return pathname === "/brief" || pathname === "/";
    return pathname?.startsWith(href);
  }

  function badge(item: NavItem) {
    if (item.badgeKey === "queue" && queueCount > 0) return <span className="bdg">{queueCount}</span>;
    if (item.badgeKey === "overdue" && overdueCount > 0) return <span className="bdg">{overdueCount > 99 ? "99+" : overdueCount}</span>;
    return null;
  }

  return (
    <aside
      className="aire-nav"
      style={pinned ? { width: "var(--sidebar-expanded)" } : undefined}
    >
      <Link href="/today" className="brand" aria-label="AIRE — Today">
        <div className="mk">A</div>
        <div className="ni-label">
          <div className="nm">AIRE</div>
          <div className="sb">Rêve</div>
        </div>
      </Link>

      <div className="navscroll">
        {PRIMARY.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`ni${isActive(item.href) ? " on" : ""}`}
            aria-label={item.label}
          >
            {item.icon}
            <span className="ni-label">{item.label}</span>
            {badge(item)}
          </Link>
        ))}
      </div>

      {/* Pin/collapse toggle — visible when hovered or pinned */}
      <button
        onClick={() => setPinned(v => !v)}
        title={pinned ? "Collapse sidebar" : "Pin sidebar open"}
        className="ni-label"
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px", margin: "0 0 6px",
          background: "none", border: "none", cursor: "pointer",
          color: "var(--aire-muted)", fontSize: 11, fontWeight: 500,
          fontFamily: "inherit", transition: "color 150ms",
        }}
        onMouseEnter={e => (e.currentTarget.style.color = "var(--aire-text)")}
        onMouseLeave={e => (e.currentTarget.style.color = "var(--aire-muted)")}
      >
        {pinned
          ? <PinOff size={13} />
          : <Pin size={13} />
        }
        {pinned ? "Unpin" : "Pin open"}
      </button>

      <Link href="/settings" className="navfoot" style={{ textDecoration: "none" }} aria-label="Settings">
        <div className="av">CJ</div>
        <div className="ni-label">
          <div className="who">Caleb Jackson</div>
          <div className="role">Rêve Realtors®</div>
        </div>
      </Link>
    </aside>
  );
}
