"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const groups = [
  {
    links: [
      { href: "/", label: "Today" },
    ],
  },
  {
    label: "Sales",
    links: [
      { href: "/pipeline", label: "Pipeline" },
      { href: "/contacts", label: "Contacts" },
      { href: "/messages", label: "Messages" },
      { href: "/follow-up", label: "Follow-Up" },
      { href: "/buyers", label: "Buyers" },
    ],
  },
  {
    label: "Content",
    links: [
      { href: "/create-post", label: "Create" },
      { href: "/social-drafts", label: "Drafts" },
      { href: "/social-analytics", label: "Analytics" },
      { href: "/messenger-outreach", label: "Outreach" },
    ],
  },
  {
    label: "Intel",
    links: [
      { href: "/mls", label: "MLS" },
      { href: "/smart-plans", label: "Smart Plans" },
    ],
  },
  {
    links: [
      { href: "/settings", label: "Settings" },
    ],
  },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        borderBottom: "1px solid var(--reve-border)",
        background: "rgba(9,9,11,0.88)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        position: "sticky",
        top: 0,
        zIndex: 100,
        paddingLeft: "24px",
      }}
      className="px-8 py-4 flex items-center justify-between"
    >
      {/* Brand */}
      <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
        <span style={{ fontFamily: "'Hauora', sans-serif", fontWeight: 700, letterSpacing: "0.18em", fontSize: "13px", color: "var(--reve-coral)" }}>
          RÊVE
        </span>
        <span style={{ width: "1px", height: "14px", background: "var(--reve-border)", display: "inline-block" }} />
        <span style={{ fontFamily: "'Hauora', sans-serif", fontWeight: 300, letterSpacing: "0.20em", fontSize: "11px", color: "var(--reve-muted)" }}>
          AIRE
        </span>
      </div>

      {/* Grouped nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {groups.map((group, gi) => (
          <div key={gi} style={{ display: "flex", alignItems: "center" }}>
            {/* Separator before each group except first */}
            {gi > 0 && (
              <span style={{ width: "1px", height: "16px", background: "var(--reve-border)", margin: "0 18px", flexShrink: 0 }} />
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
              {group.links.map((link) => {
                const active = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    style={{
                      fontSize: "11px",
                      letterSpacing: "0.12em",
                      fontWeight: active ? 600 : 300,
                      color: active ? "var(--reve-text)" : "var(--reve-muted)",
                      textDecoration: "none",
                      transition: "color 300ms ease",
                      position: "relative",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {link.label.toUpperCase()}
                    {active && (
                      <span style={{
                        position: "absolute",
                        bottom: "-17px",
                        left: 0,
                        right: 0,
                        height: "1px",
                        background: "var(--reve-coral)",
                        animation: "coral-sweep 700ms cubic-bezier(0.65,0,0.35,1) both",
                      }} />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
