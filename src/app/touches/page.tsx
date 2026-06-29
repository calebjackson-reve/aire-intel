"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────
type PlatformCell = { touchedAt: string; direction: string; daysAgo: number } | null;

interface Row {
  id: string;
  name: string;
  firstName: string | null;
  stage: string;
  type: string;
  preferredPlatform: string | null;
  cadence: number;
  daysSinceAny: number | null;
  overdue: boolean;
  overdueBy: number | null;
  suggestedPlatform: string | null;
  byPlatform: Record<string, PlatformCell>;
  links: Record<string, string | null>;
}

interface Payload {
  platforms: string[];
  counts: { total: number; overdue: number };
  rows: Row[];
}

const PLATFORM_LABEL: Record<string, string> = {
  imessage: "iMessage",
  facebook: "Facebook",
  instagram: "Instagram",
  snapchat: "Snapchat",
  linkedin: "LinkedIn",
};
const PLATFORM_ICON: Record<string, string> = {
  imessage: "💬",
  facebook: "📘",
  instagram: "📸",
  snapchat: "👻",
  linkedin: "💼",
};

function cellColor(cell: PlatformCell): string {
  if (!cell) return "var(--text-dim, #6b7280)";
  if (cell.daysAgo <= 7) return "var(--reve-coral, #EE8172)";
  if (cell.daysAgo <= 30) return "var(--reve-cream, #EFDD84)";
  return "var(--text-dim, #6b7280)";
}

export default function TouchesPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [filter, setFilter] = useState<"overdue" | "all">("overdue");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/touches");
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const logTouch = useCallback(
    async (leadId: string, platform: string) => {
      setBusy(`${leadId}:${platform}`);
      await fetch("/api/touches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, platform, direction: "outbound" }),
      });
      await load();
      setBusy(null);
    },
    [load]
  );

  if (!data) {
    return (
      <main style={{ padding: "32px 32px 32px 80px" }}>
        <div className="skeleton" style={{ height: 64, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 320 }} />
      </main>
    );
  }

  const rows = filter === "overdue" ? data.rows.filter((r) => r.overdue) : data.rows;

  return (
    <main style={{ padding: "32px 32px 64px 80px", maxWidth: 1280, margin: "0 auto" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>
          Touch Tracker
        </h1>
        <p style={{ color: "var(--text-dim, #9ca3af)", marginTop: 4, fontSize: 14 }}>
          Every conversation, one funnel — who's been touched, on which platform, and who's gone cold.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 16, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--text-dim, #9ca3af)" }}>
            <strong style={{ color: "var(--reve-coral, #EE8172)" }}>{data.counts.overdue}</strong> overdue
            {" · "}
            {data.counts.total} tracked
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button
              className={filter === "overdue" ? "btn-primary" : "btn-ghost"}
              onClick={() => setFilter("overdue")}
            >
              Needs a touch
            </button>
            <button
              className={filter === "all" ? "btn-primary" : "btn-ghost"}
              onClick={() => setFilter("all")}
            >
              All
            </button>
          </div>
        </div>
      </header>

      <div className="glass-card" style={{ overflowX: "auto", padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-dim, #9ca3af)" }}>
              <th style={{ padding: "12px 16px" }}>Contact</th>
              <th style={{ padding: "12px 8px" }}>Last touch</th>
              <th style={{ padding: "12px 8px" }}>Reach on</th>
              {data.platforms.map((p) => (
                <th key={p} style={{ padding: "12px 8px", textAlign: "center" }}>
                  {PLATFORM_ICON[p]} {PLATFORM_LABEL[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: "12px 16px" }}>
                  <Link href={`/contacts/${r.id}`} style={{ fontWeight: 500, textDecoration: "none", color: "inherit" }}>
                    {r.name}
                  </Link>
                  <div style={{ fontSize: 11, color: "var(--text-dim, #6b7280)" }}>
                    {r.stage.replace(/_/g, " ")} · {r.type}
                  </div>
                </td>
                <td style={{ padding: "12px 8px" }}>
                  {r.daysSinceAny === null ? (
                    <span style={{ color: "var(--reve-coral, #EE8172)" }}>never</span>
                  ) : (
                    <span style={{ color: r.overdue ? "var(--reve-coral, #EE8172)" : "inherit" }}>
                      {r.daysSinceAny}d ago
                      {r.overdue && r.overdueBy && r.overdueBy > 0 ? ` (+${r.overdueBy})` : ""}
                    </span>
                  )}
                </td>
                <td style={{ padding: "12px 8px" }}>
                  {r.suggestedPlatform ? (
                    <span title="Preferred / last replied channel">
                      {PLATFORM_ICON[r.suggestedPlatform]} {PLATFORM_LABEL[r.suggestedPlatform]}
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-dim, #6b7280)" }}>—</span>
                  )}
                </td>
                {data.platforms.map((p) => {
                  const cell = r.byPlatform[p];
                  const link = r.links[p];
                  const isBusy = busy === `${r.id}:${p}`;
                  return (
                    <td key={p} style={{ padding: "8px", textAlign: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <span style={{ color: cellColor(cell), fontSize: 12 }}>
                          {cell ? `${cell.daysAgo}d` : "—"}
                        </span>
                        <div style={{ display: "flex", gap: 4 }}>
                          {link && (
                            <a
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-ghost"
                              style={{ padding: "2px 6px", fontSize: 11 }}
                              title={`Open ${PLATFORM_LABEL[p]}`}
                            >
                              open
                            </a>
                          )}
                          <button
                            className="btn-ghost"
                            style={{ padding: "2px 6px", fontSize: 11 }}
                            disabled={isBusy}
                            onClick={() => logTouch(r.id, p)}
                            title={`Log a touch on ${PLATFORM_LABEL[p]}`}
                          >
                            {isBusy ? "…" : "✓"}
                          </button>
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3 + data.platforms.length} style={{ padding: 32, textAlign: "center", color: "var(--text-dim, #9ca3af)" }}>
                  Nobody's overdue. Everyone's been touched within cadence. 🎯
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
