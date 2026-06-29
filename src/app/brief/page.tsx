"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface BriefItem {
  actionQueueId?: string;
  type: string;
  title: string;
  subtitle?: string;
  preview?: string;
  leadId?: string;
  leadName?: string;
  dueDate?: string;
  priority?: number;
  channel?: string;
  metadata?: Record<string, unknown>;
}

interface DailyBrief {
  id: string;
  date: string;
  nonNegotiables: BriefItem[] | null;
  goingCold: BriefItem[] | null;
  owePeople: BriefItem[] | null;
  contentQueued: BriefItem[] | null;
  marketMovement: BriefItem[] | null;
  smsSummary: string | null;
  assembledAt: string;
  smsDeliveredAt: string | null;
  emailDeliveredAt: string | null;
}

type ActionStatus = Record<string, "pending" | "loading" | "approved" | "skipped" | "error">;

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

function BriefItemCard({
  item,
  status,
  onApprove,
  onSkip,
}: {
  item: BriefItem;
  status: ActionStatus;
  onApprove: (id: string) => void;
  onSkip: (id: string) => void;
}) {
  const qid = item.actionQueueId;
  const s = qid ? (status[qid] ?? "pending") : null;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="glass-card"
      style={{
        padding: "14px 16px",
        marginBottom: "8px",
        borderRadius: "10px",
        opacity: s === "skipped" ? 0.45 : 1,
        transition: "opacity 0.2s",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: "14px", color: "#fff" }}>{item.title}</span>
            {item.subtitle && (
              <span style={{ fontSize: "12px", color: "#888" }}>{item.subtitle}</span>
            )}
            {item.dueDate && (
              <span style={{ fontSize: "11px", color: "#EE8172", fontWeight: 600 }}>
                {new Date(item.dueDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </span>
            )}
          </div>

          {item.preview && (
            <button
              onClick={() => setExpanded((x) => !x)}
              style={{
                marginTop: "6px",
                fontSize: "13px",
                color: "#728AC5",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {expanded ? item.preview : `${item.preview.slice(0, 80)}…`}
            </button>
          )}
        </div>

        {qid && s !== "approved" && s !== "skipped" && (
          <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
            <button
              className="btn-primary"
              style={{ padding: "6px 14px", fontSize: "12px", opacity: s === "loading" ? 0.6 : 1 }}
              disabled={s === "loading"}
              onClick={() => onApprove(qid)}
            >
              {s === "loading" ? "…" : "Approve"}
            </button>
            <button
              className="btn-ghost"
              style={{ padding: "6px 10px", fontSize: "12px" }}
              onClick={() => onSkip(qid)}
            >
              Skip
            </button>
          </div>
        )}

        {s === "approved" && (
          <span style={{ fontSize: "12px", color: "var(--aire-green)", fontWeight: 600 }}>✓ Approved</span>
        )}
        {s === "skipped" && (
          <span style={{ fontSize: "12px", color: "#555" }}>Skipped</span>
        )}
        {s === "error" && (
          <span style={{ fontSize: "12px", color: "#EE8172" }}>Error</span>
        )}
      </div>
    </div>
  );
}

// ─── Rich market stats card ───────────────────────────────────────────────────
function MarketStatsCard({ item }: { item: BriefItem }) {
  const m = item.metadata ?? {};
  const medianPrice = m.medianPrice as number | null;
  const dom = m.daysOnMarket as number | null;
  const totalActive = m.totalActive as number | null;
  const featured = (m.featuredListings ?? []) as Array<{ photos: string[]; address: string; city: string; price: number | null }>;

  function fmt(n: number) {
    return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}k`;
  }

  return (
    <div className="glass-card" style={{ padding: "18px 20px", marginBottom: "8px", borderRadius: "12px" }}>
      {/* Stats row */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: featured.length ? 16 : 0 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#666", textTransform: "uppercase", marginBottom: 4 }}>Median Price</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", fontFamily: "var(--font-display-app)", letterSpacing: "-0.02em" }}>
            {medianPrice ? fmt(medianPrice) : "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#666", textTransform: "uppercase", marginBottom: 4 }}>Avg DOM</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", fontFamily: "var(--font-display-app)", letterSpacing: "-0.02em" }}>
            {dom != null ? `${Math.round(dom)}d` : "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#666", textTransform: "uppercase", marginBottom: 4 }}>Active Listings</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", fontFamily: "var(--font-display-app)", letterSpacing: "-0.02em" }}>
            {totalActive ?? "—"}
          </div>
        </div>
        <div style={{ marginLeft: "auto", alignSelf: "flex-end" }}>
          <Link href="/market" style={{ fontSize: 12, color: "#EE8172", textDecoration: "none", fontWeight: 600 }}>
            View Market →
          </Link>
        </div>
      </div>

      {/* AI summary */}
      {item.subtitle && (
        <p style={{ fontSize: 12, color: "#888", margin: "0 0 14px", lineHeight: 1.5 }}>{item.subtitle}</p>
      )}

      {/* Featured listings with photos */}
      {featured.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
          {featured.map((l, i) => (
            <div key={i} style={{ borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.photos[0]} alt={l.address} style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} />
              <div style={{ padding: "6px 8px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{l.price ? fmt(l.price) : "—"}</div>
                <div style={{ fontSize: 10, color: "#888", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.address}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({
  emoji,
  title,
  items,
  status,
  onApprove,
  onSkip,
}: {
  emoji: string;
  title: string;
  items: BriefItem[];
  status: ActionStatus;
  onApprove: (id: string) => void;
  onSkip: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (!items.length) return null;

  return (
    <div style={{ marginBottom: "24px" }}>
      <button
        onClick={() => setCollapsed((x) => !x)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "0 0 12px",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: "14px" }}>{emoji}</span>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", color: "#EE8172" }}>
          {title}
        </span>
        <span
          style={{
            fontSize: "11px",
            color: "var(--aire-text-2)",
            background: "rgba(0,0,0,0.06)",
            borderRadius: "10px",
            padding: "2px 7px",
          }}
        >
          {items.length}
        </span>
        <span style={{ marginLeft: "auto", color: "#444", fontSize: "12px" }}>
          {collapsed ? "▶" : "▼"}
        </span>
      </button>

      {!collapsed && (
        <div>
          {items.map((item, i) =>
            item.type === "market_stats" ? (
              <MarketStatsCard key={`market-${i}`} item={item} />
            ) : (
              <BriefItemCard
                key={item.actionQueueId ?? `${title}-${i}`}
                item={item}
                status={status}
                onApprove={onApprove}
                onSkip={onSkip}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function BriefPage() {
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionStatus, setActionStatus] = useState<ActionStatus>({});

  useEffect(() => {
    fetch("/api/brief")
      .then((r) => r.json())
      .then((d) => { setBrief(d.brief); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const d = await fetch("/api/brief", { method: "POST" }).then((r) => r.json());
      setBrief(d.brief);
      setActionStatus({});
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleApprove = useCallback(async (actionQueueId: string) => {
    setActionStatus((s) => ({ ...s, [actionQueueId]: "loading" }));
    try {
      const res = await fetch(`/api/actions/${actionQueueId}/approve`, { method: "POST" });
      if (res.ok) {
        setActionStatus((s) => ({ ...s, [actionQueueId]: "approved" }));
        // Auto-execute after approval
        await fetch(`/api/actions/${actionQueueId}/execute`, { method: "POST" });
      } else {
        setActionStatus((s) => ({ ...s, [actionQueueId]: "error" }));
      }
    } catch {
      setActionStatus((s) => ({ ...s, [actionQueueId]: "error" }));
    }
  }, []);

  const handleSkip = useCallback(async (actionQueueId: string) => {
    setActionStatus((s) => ({ ...s, [actionQueueId]: "loading" }));
    try {
      const res = await fetch(`/api/actions/${actionQueueId}/skip`, { method: "POST" });
      if (res.ok) {
        setActionStatus((s) => ({ ...s, [actionQueueId]: "skipped" }));
      } else {
        setActionStatus((s) => ({ ...s, [actionQueueId]: "error" }));
      }
    } catch {
      setActionStatus((s) => ({ ...s, [actionQueueId]: "error" }));
    }
  }, []);

  if (loading) {
    return (
      <main style={{ padding: "40px 24px", maxWidth: "720px", margin: "0 auto" }}>
        <div className="skeleton" style={{ height: "28px", width: "200px", borderRadius: "6px", marginBottom: "8px" }} />
        <div className="skeleton" style={{ height: "16px", width: "320px", borderRadius: "4px" }} />
      </main>
    );
  }

  if (!brief) {
    return (
      <main style={{ padding: "40px 24px", maxWidth: "720px", margin: "0 auto" }}>
        <p style={{ color: "#555" }}>No brief for today. The Morning Brief agent runs at 5:00 AM CT.</p>
        <button
          className="btn-primary"
          style={{ marginTop: "16px" }}
          onClick={async () => {
            setLoading(true);
            await fetch("/api/agents/morning-brief");
            const d = await fetch("/api/brief").then((r) => r.json());
            setBrief(d.brief);
            setLoading(false);
          }}
        >
          Assemble Now
        </button>
      </main>
    );
  }

  const nonNegotiables = (brief.nonNegotiables as BriefItem[]) ?? [];
  const goingCold = (brief.goingCold as BriefItem[]) ?? [];
  const owePeople = (brief.owePeople as BriefItem[]) ?? [];
  const contentQueued = (brief.contentQueued as BriefItem[]) ?? [];
  const marketMovement = (brief.marketMovement as BriefItem[]) ?? [];

  const pendingActions = [...nonNegotiables, ...goingCold, ...owePeople, ...contentQueued].filter(
    (i) => i.actionQueueId && !actionStatus[i.actionQueueId]
  ).length;

  return (
    <main
      style={{
        paddingLeft: "80px",
        paddingRight: "24px",
        paddingTop: "40px",
        paddingBottom: "60px",
        maxWidth: "800px",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <p style={{ margin: 0, fontSize: "11px", letterSpacing: "0.15em", color: "#555" }}>
          AIRÉ — MORNING BRIEF
        </p>
        <h1 style={{ margin: "6px 0 0", fontWeight: 300, fontSize: "26px", color: "#fff" }}>
          {formatDate(brief.date)}
        </h1>
        {brief.smsSummary && (
          <p
            style={{
              margin: "12px 0 0",
              fontSize: "14px",
              color: "#888",
              lineHeight: 1.6,
              maxWidth: "560px",
            }}
          >
            {brief.smsSummary}
          </p>
        )}
        <div
          style={{
            marginTop: "12px",
            display: "flex",
            gap: "16px",
            flexWrap: "wrap",
            fontSize: "12px",
            color: "#555",
          }}
        >
          <span>Assembled {timeAgo(brief.assembledAt)}</span>
          {brief.smsDeliveredAt && <span>SMS ✓</span>}
          {brief.emailDeliveredAt && <span>Email ✓</span>}
          {pendingActions > 0 && (
            <span style={{ color: "#EE8172" }}>{pendingActions} action{pendingActions > 1 ? "s" : ""} pending</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ background: "none", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "2px 10px", fontSize: 11, color: refreshing ? "#555" : "#888", cursor: refreshing ? "wait" : "pointer", fontFamily: "inherit" }}
          >
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* Sections */}
      <Section
        emoji="🔴"
        title="NON-NEGOTIABLES"
        items={nonNegotiables}
        status={actionStatus}
        onApprove={handleApprove}
        onSkip={handleSkip}
      />
      <Section
        emoji="🟡"
        title="GOING COLD"
        items={goingCold}
        status={actionStatus}
        onApprove={handleApprove}
        onSkip={handleSkip}
      />
      <Section
        emoji="📨"
        title="YOU OWE REPLIES"
        items={owePeople}
        status={actionStatus}
        onApprove={handleApprove}
        onSkip={handleSkip}
      />
      <Section
        emoji="📸"
        title="TODAY'S CONTENT"
        items={contentQueued}
        status={actionStatus}
        onApprove={handleApprove}
        onSkip={handleSkip}
      />
      <Section
        emoji="📊"
        title="MARKET MOVEMENT"
        items={marketMovement}
        status={actionStatus}
        onApprove={handleApprove}
        onSkip={handleSkip}
      />

      {nonNegotiables.length === 0 &&
        goingCold.length === 0 &&
        owePeople.length === 0 &&
        contentQueued.length === 0 &&
        marketMovement.length === 0 && (
          <div style={{ color: "#555", textAlign: "center", paddingTop: "48px" }}>
            <p>No items in today&apos;s brief.</p>
            <p style={{ fontSize: "13px", marginTop: "8px" }}>
              Agents run overnight — check back after 5:00 AM CT.
            </p>
          </div>
        )}
    </main>
  );
}
