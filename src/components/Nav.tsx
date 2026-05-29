"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/contacts", label: "Contacts" },
  { href: "/follow-up", label: "Follow-Up" },
  { href: "/buyers", label: "Buyers" },
  { href: "/smart-plans", label: "Smart Plans" },
  { href: "/create-post", label: "Create Post" },
  { href: "/social", label: "Social" },
  { href: "/mls", label: "MLS" },
  { href: "/settings", label: "Settings" },
  { href: "/system", label: "System" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        borderBottom: "1px solid var(--reve-border)",
        background: "rgba(9,9,11,0.85)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        position: "sticky",
        top: 0,
        zIndex: 100,
        paddingLeft: "80px",
      }}
      className="px-8 py-4 flex items-center justify-between"
    >
      <div className="flex items-center gap-3">
        <span
          style={{
            fontFamily: "'Hauora', sans-serif",
            fontWeight: 700,
            letterSpacing: "0.18em",
            fontSize: "13px",
            color: "var(--reve-coral)",
          }}
        >
          RÊVE
        </span>
        <span
          style={{
            width: "1px",
            height: "14px",
            background: "var(--reve-border)",
            display: "inline-block",
          }}
        />
        <span
          style={{
            fontFamily: "'Hauora', sans-serif",
            fontWeight: 300,
            letterSpacing: "0.20em",
            fontSize: "11px",
            color: "var(--reve-muted)",
          }}
        >
          AIRE
        </span>
      </div>

      <div className="flex items-center gap-6">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              fontSize: "12px",
              letterSpacing: "0.12em",
              fontWeight: pathname === link.href ? 500 : 300,
              color:
                pathname === link.href
                  ? "var(--reve-text)"
                  : "var(--reve-muted)",
              textDecoration: "none",
              transition: "color 400ms cubic-bezier(0.65,0,0.35,1)",
              position: "relative",
            }}
          >
            {link.label.toUpperCase()}
            {pathname === link.href && (
              <span
                style={{
                  position: "absolute",
                  bottom: "-17px",
                  left: 0,
                  right: 0,
                  height: "1px",
                  background: "var(--reve-coral)",
                  animation: "coral-sweep 700ms cubic-bezier(0.65,0,0.35,1) both",
                }}
              />
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
