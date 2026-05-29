"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Sunrise, GitBranch, Users, Route, Target, Megaphone, CalendarDays,
  Map, Home, Briefcase, RefreshCw, Inbox, PenTool, Activity, Settings,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badgeKey?: "overdue" | "unread";
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const ICON = 17;

const SECTIONS: NavSection[] = [
  {
    title: "Command",
    items: [
      { href: "/", label: "Today", icon: <Sunrise size={ICON} /> },
      { href: "/pipeline", label: "Pipeline", icon: <GitBranch size={ICON} />, badgeKey: "overdue" },
      { href: "/contacts", label: "Contacts", icon: <Users size={ICON} /> },
      { href: "/smart-plans", label: "Smart Plans", icon: <Route size={ICON} /> },
    ],
  },
  {
    title: "Growth",
    items: [
      { href: "/buyers", label: "Buyers", icon: <Home size={ICON} /> },
      { href: "/social", label: "Social", icon: <Megaphone size={ICON} /> },
      { href: "/content-calendar", label: "Content", icon: <CalendarDays size={ICON} /> },
      { href: "/projection", label: "Projection", icon: <Target size={ICON} /> },
      { href: "/mls", label: "Market", icon: <Map size={ICON} /> },
    ],
  },
  {
    title: "Outreach",
    items: [
      { href: "/create-post", label: "Post Studio", icon: <PenTool size={ICON} /> },
      { href: "/linkedin", label: "LinkedIn", icon: <Briefcase size={ICON} /> },
      { href: "/revival", label: "Revival", icon: <RefreshCw size={ICON} /> },
      { href: "/drafts", label: "Queue", icon: <Inbox size={ICON} />, badgeKey: "unread" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/system", label: "Health", icon: <Activity size={ICON} /> },
      { href: "/settings", label: "Settings", icon: <Settings size={ICON} /> },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [health, setHealth] = useState<number | null>(null);

  // Poll badge counts + system health score
  useEffect(() => {
    async function load() {
      try {
        const [notifRes, taskRes, healthRes] = await Promise.all([
          fetch("/api/notifications?limit=1"),
          fetch("/api/tasks?overdue=true&limit=1"),
          fetch("/api/errors?health=1").catch(() => null),
        ]);
        if (notifRes.ok) {
          const d = await notifRes.json();
          setUnreadCount(d.unreadCount ?? 0);
        }
        if (taskRes.ok) {
          const d = await taskRes.json();
          setOverdueCount(d.overdueCount ?? 0);
        }
        if (healthRes && healthRes.ok) {
          const d = await healthRes.json();
          const score = d.healthScore ?? d.score ?? d.health?.score;
          if (typeof score === "number") setHealth(Math.round(score));
        }
      } catch {}
    }
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname?.startsWith(href);
  }

  function badgeFor(item: NavItem) {
    if (item.href === "/system" && health != null) {
      return <span className="bdg mint">{health}</span>;
    }
    if (item.badgeKey === "overdue" && overdueCount > 0) {
      return <span className="bdg">{overdueCount > 99 ? "99+" : overdueCount}</span>;
    }
    if (item.badgeKey === "unread" && unreadCount > 0) {
      return <span className="bdg">{unreadCount > 99 ? "99+" : unreadCount}</span>;
    }
    return null;
  }

  return (
    <aside className="aire-nav">
      <Link href="/" className="brand" aria-label="AIRE — Today">
        <div className="mk">A</div>
        <div>
          <div className="nm">AIRE</div>
          <div className="sb">Intelligence</div>
        </div>
      </Link>

      <div className="navscroll">
        {SECTIONS.map(section => (
          <div key={section.title}>
            <div className="nsec">{section.title}</div>
            {section.items.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`ni${isActive(item.href) ? " on" : ""}`}
                aria-label={item.label}
              >
                {item.icon}
                <span>{item.label}</span>
                {badgeFor(item)}
              </Link>
            ))}
          </div>
        ))}
      </div>

      <Link
        href="/settings"
        className="navfoot"
        style={{ textDecoration: "none" }}
        aria-label="Caleb Jackson — account"
      >
        <div className="av">CJ</div>
        <div>
          <div className="who">Caleb Jackson</div>
          <div className="role">Rêve Realtors®</div>
        </div>
      </Link>
    </aside>
  );
}
