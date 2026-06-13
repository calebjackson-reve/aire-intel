"use client";

import { useState, useMemo, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, ChevronUp, ChevronDown,
  MoreHorizontal, Eye, MessageSquare, Phone, CheckCircle,
  UserPlus, Home, DollarSign, Activity,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface KPICard {
  label: string;
  value: string;
  change: string;
  changePercent: string;
  trendUp: boolean;
  detail: string;
  accentColor: string;
}

interface Lead {
  id: number;
  name: string;
  status: "Hot" | "Active" | "Warm" | "New" | "Cold";
  propertyType: string;
  budget: string;
  budgetRaw: number;
  lastContact: string;
  lastContactDaysAgo: number;
  stage: string;
  score: number;
}

interface FeedItem {
  id: number;
  time: string;
  type: "offer" | "showing" | "lead" | "task" | "listing" | "deal";
  text: string;
  color: string;
}

interface ChartPoint {
  label: string;
  day: number;
  newLeads: number;
  qualified: number;
}

// ─── Static data (deterministic — no Math.random, SSR-safe) ─────────────────

const KPI_CARDS: KPICard[] = [
  {
    label: "Active Listings",
    value: "14",
    change: "+3",
    changePercent: "+27.3%",
    trendUp: true,
    detail: "vs. last month",
    accentColor: "#065F46",
  },
  {
    label: "Pipeline GCI",
    value: "$487,500",
    change: "+$52,800",
    changePercent: "+12.1%",
    trendUp: true,
    detail: "projected close",
    accentColor: "#728AC5",
  },
  {
    label: "Lead Conversion",
    value: "18.3%",
    change: "−2.1 pts",
    changePercent: "−10.3%",
    trendUp: false,
    detail: "lead → client",
    accentColor: "#EE8172",
  },
  {
    label: "Avg Days on Market",
    value: "28",
    change: "−6 days",
    changePercent: "−17.6%",
    trendUp: true,
    detail: "East Baton Rouge",
    accentColor: "#F59E0B",
  },
];

// 90-day data: Mar 15 → Jun 12, 2026 — pure math, no randomness
const CHART_DATA: ChartPoint[] = Array.from({ length: 90 }, (_, i) => {
  const base = new Date(2026, 2, 15);
  base.setDate(base.getDate() + i);
  const label = base.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const newLeads = Math.max(1, Math.round(6 + Math.sin(i * 0.22) * 3 + Math.sin(i * 0.07) * 2 + (i > 60 ? 1.5 : 0)));
  const qualified = Math.max(0, Math.round(newLeads * (0.28 + Math.sin(i * 0.15) * 0.08)));
  return { label, day: i + 1, newLeads, qualified };
});

const CHART_TICKS = CHART_DATA.filter((_, i) => i % 9 === 0).map(d => d.label);

const LEADS: Lead[] = [
  { id: 1, name: "Marcus & Tanya Williams",   status: "Hot",    propertyType: "Single Family", budget: "$485,000",   budgetRaw: 485000,   lastContact: "2h ago",     lastContactDaysAgo: 0, stage: "Offer Pending",   score: 94 },
  { id: 2, name: "Robert Arceneaux",           status: "Hot",    propertyType: "Land",          budget: "$1,200,000", budgetRaw: 1200000,  lastContact: "30m ago",    lastContactDaysAgo: 0, stage: "Due Diligence",   score: 91 },
  { id: 3, name: "James & Karen Holloway",     status: "Active", propertyType: "Single Family", budget: "$540,000",   budgetRaw: 540000,   lastContact: "4h ago",     lastContactDaysAgo: 0, stage: "Touring",         score: 82 },
  { id: 4, name: "Derek Fontaine",             status: "Active", propertyType: "Condo",         budget: "$285,000",   budgetRaw: 285000,   lastContact: "Yesterday",  lastContactDaysAgo: 1, stage: "Touring",         score: 78 },
  { id: 5, name: "Patrick Guillory",           status: "Active", propertyType: "Commercial",    budget: "$825,000",   budgetRaw: 825000,   lastContact: "5h ago",     lastContactDaysAgo: 0, stage: "Letter of Intent",score: 76 },
  { id: 6, name: "Sophia Tran",                status: "Warm",   propertyType: "Single Family", budget: "$620,000",   budgetRaw: 620000,   lastContact: "3 days ago", lastContactDaysAgo: 3, stage: "Pre-qualified",   score: 65 },
  { id: 7, name: "Leila Okafor",               status: "Warm",   propertyType: "Single Family", budget: "$375,000",   budgetRaw: 375000,   lastContact: "2 days ago", lastContactDaysAgo: 2, stage: "Pre-qualified",   score: 60 },
  { id: 8, name: "Brianna Mitchell",           status: "New",    propertyType: "Condo",         budget: "$195,000",   budgetRaw: 195000,   lastContact: "1 day ago",  lastContactDaysAgo: 1, stage: "Initial Contact", score: 45 },
];

const FEED_ITEMS: FeedItem[] = [
  { id: 1, time: "2m ago",    type: "offer",   text: "Offer accepted — 14208 Honeysuckle Dr, $479,000",          color: "#065F46" },
  { id: 2, time: "18m ago",   type: "showing", text: "Showing scheduled — Marcus Williams, Sat Jun 14 at 2pm",   color: "#728AC5" },
  { id: 3, time: "1h ago",    type: "lead",    text: "New lead via Zillow — Patricia Dubois, budget $320K",       color: "#F59E0B" },
  { id: 4, time: "2h ago",    type: "task",    text: "Follow-up completed — James Holloway pre-qual call",        color: "#065F46" },
  { id: 5, time: "4h ago",    type: "listing", text: "Listing expired — 8801 Jefferson Hwy, price reduction needed", color: "#EE8172" },
  { id: 6, time: "Yesterday", type: "deal",    text: "Deal closed — 2247 Perkins Rd — GCI $18,400",              color: "#065F46" },
  { id: 7, time: "Yesterday", type: "lead",    text: "New lead via Meta Ads — Devon Arceneaux, budget $450K",    color: "#F59E0B" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  Hot:    { bg: "rgba(238,129,114,0.13)", color: "#C0392B" },
  Active: { bg: "rgba(6,95,70,0.10)",     color: "#065F46" },
  Warm:   { bg: "rgba(245,158,11,0.12)",  color: "#92400E" },
  New:    { bg: "rgba(114,138,197,0.13)", color: "#3B5088" },
  Cold:   { bg: "rgba(0,0,0,0.06)",       color: "#6B7280" },
};

function FeedIcon({ type, color }: { type: FeedItem["type"]; color: string }) {
  const sz = { width: 14, height: 14 };
  const icon = {
    offer:   <DollarSign {...sz} />,
    deal:    <DollarSign {...sz} />,
    showing: <Home {...sz} />,
    lead:    <UserPlus {...sz} />,
    task:    <CheckCircle {...sz} />,
    listing: <Activity {...sz} />,
  }[type];
  return (
    <div style={{
      width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
      background: `${color}18`, border: `1px solid ${color}30`,
      color, display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {icon}
    </div>
  );
}

function Skeleton({ w = "100%", h = 14, r = 8 }: { w?: string | number; h?: number; r?: number }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r }} />;
}

type SortKey = "name" | "status" | "propertyType" | "budgetRaw" | "lastContactDaysAgo" | "stage" | "score";

function ColHeader({
  col, sortKey, sortDir, onSort,
}: {
  col: { key: SortKey; label: string };
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === col.key;
  return (
    <button
      onClick={() => onSort(col.key)}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        background: "none", border: "none", cursor: "pointer",
        fontFamily: "inherit", fontWeight: 700, fontSize: 9.5,
        letterSpacing: "0.10em", textTransform: "uppercase",
        color: active ? "var(--aire-text)" : "var(--aire-muted)",
        padding: 0, transition: "color 150ms",
      }}
    >
      {col.label}
      {active
        ? sortDir === "asc"
          ? <ChevronUp size={11} />
          : <ChevronDown size={11} />
        : <ChevronUp size={10} style={{ opacity: 0.25 }} />
      }
    </button>
  );
}

const TABLE_COLS: { key: SortKey; label: string }[] = [
  { key: "name",               label: "Name"          },
  { key: "status",             label: "Status"        },
  { key: "propertyType",       label: "Type"          },
  { key: "budgetRaw",          label: "Budget"        },
  { key: "lastContactDaysAgo", label: "Last Contact"  },
  { key: "stage",              label: "Stage"         },
  { key: "score",              label: "Score"         },
];

const GRID = "22% 9% 13% 11% 12% 15% 10% 8%";

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [rowMenu, setRowMenu] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 700);
    return () => clearTimeout(t);
  }, []);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sortedLeads = useMemo(() => {
    return [...LEADS].sort((a, b) => {
      const av = a[sortKey] as number | string;
      const bv = b[sortKey] as number | string;
      const cmp = typeof av === "number"
        ? av - (bv as number)
        : (av as string).localeCompare(bv as string);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [sortKey, sortDir]);

  return (
    <div style={{ padding: "28px 30px 60px" }}>

      {/* ─── Page header ─── */}
      <div className="animate-fade-up" style={{ marginBottom: 28 }}>
        <h1 style={{
          fontFamily: "var(--font-display-app)", fontWeight: 500, fontSize: 28,
          color: "var(--aire-text)", letterSpacing: "-0.01em", margin: 0,
        }}>
          Intelligence Hub
        </h1>
        <p style={{ fontSize: 13, color: "var(--aire-text-2)", marginTop: 5, margin: "5px 0 0" }}>
          East Baton Rouge market · 90-day view · Jun 13, 2026
        </p>
      </div>

      {/* ─── KPI Cards ─── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 16,
        marginBottom: 24,
      }}>
        {KPI_CARDS.map((card, i) => (
          <div
            key={card.label}
            className={`glass-card animate-fade-up stagger-${i + 1}`}
            style={{ padding: "20px 22px", borderRadius: 16, cursor: "pointer" }}
          >
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Skeleton h={10} w="60%" />
                <Skeleton h={34} w="70%" r={6} />
                <Skeleton h={10} w="50%" />
              </div>
            ) : (
              <>
                <div style={{
                  display: "flex", alignItems: "center",
                  justifyContent: "space-between", marginBottom: 10,
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
                    textTransform: "uppercase", color: "var(--aire-muted)",
                  }}>
                    {card.label}
                  </span>
                  <span style={{
                    display: "flex", alignItems: "center", gap: 3,
                    padding: "2px 8px", borderRadius: 100,
                    background: card.trendUp ? "rgba(6,95,70,0.09)" : "rgba(239,68,68,0.09)",
                    color: card.trendUp ? "#065F46" : "#DC2626",
                    fontSize: 10, fontWeight: 700,
                  }}>
                    {card.trendUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    {card.changePercent}
                  </span>
                </div>

                <div style={{
                  fontFamily: "var(--font-display-app)",
                  fontSize: 34, fontWeight: 600, lineHeight: 1.05,
                  color: "var(--aire-text)", letterSpacing: "-0.02em", marginBottom: 8,
                }}>
                  {card.value}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: card.trendUp ? "#065F46" : "#DC2626",
                  }}>
                    {card.change}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--aire-muted)" }}>
                    {card.detail}
                  </span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* ─── Chart + Feed ─── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 310px",
        gap: 18,
        marginBottom: 24,
      }}>
        {/* Line chart */}
        <div className="glass-card animate-fade-up stagger-2" style={{ padding: "22px 24px", borderRadius: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <div style={{
                fontFamily: "var(--font-display-app)", fontSize: 18, fontWeight: 500,
                color: "var(--aire-text)", letterSpacing: "-0.005em",
              }}>
                Lead Activity — 90 Days
              </div>
              <div style={{ fontSize: 11, color: "var(--aire-text-2)", marginTop: 3 }}>
                Mar 15 – Jun 13, 2026
              </div>
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              {[{ label: "New Leads", color: "#065F46" }, { label: "Qualified", color: "#728AC5" }].map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
                  <span style={{ fontSize: 11, color: "var(--aire-text-2)" }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {loading ? (
            <Skeleton h={220} r={12} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={CHART_DATA} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis
                  dataKey="label"
                  ticks={CHART_TICKS}
                  tick={{ fontSize: 10, fill: "var(--aire-muted)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--aire-muted)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "rgba(255,255,255,0.96)",
                    border: "1px solid rgba(0,0,0,0.08)",
                    borderRadius: 12,
                    fontSize: 12,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
                  }}
                />
                <Line
                  type="monotone" dataKey="newLeads" name="New Leads"
                  stroke="#065F46" strokeWidth={2} dot={false}
                  activeDot={{ r: 4, fill: "#065F46" }}
                />
                <Line
                  type="monotone" dataKey="qualified" name="Qualified"
                  stroke="#728AC5" strokeWidth={2} dot={false}
                  strokeDasharray="4 2"
                  activeDot={{ r: 4, fill: "#728AC5" }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Activity feed */}
        <div className="glass-card animate-fade-up stagger-3" style={{ padding: "22px 20px", borderRadius: 16 }}>
          <div style={{
            fontFamily: "var(--font-display-app)", fontSize: 18, fontWeight: 500,
            color: "var(--aire-text)", marginBottom: 16, letterSpacing: "-0.005em",
          }}>
            Activity Feed
          </div>
          <div>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "11px 0", borderBottom: "1px solid rgba(0,0,0,0.05)", alignItems: "flex-start" }}>
                    <Skeleton w={30} h={30} r={50} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      <Skeleton h={11} w="90%" />
                      <Skeleton h={9} w="35%" />
                    </div>
                  </div>
                ))
              : FEED_ITEMS.map((item, idx) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex", gap: 10, alignItems: "flex-start",
                      padding: "11px 6px",
                      borderBottom: idx < FEED_ITEMS.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
                      borderRadius: 8, cursor: "pointer",
                      transition: "background 150ms",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.026)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <FeedIcon type={item.type} color={item.color} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 11.5, color: "var(--aire-text)", lineHeight: 1.45,
                        margin: 0, fontWeight: 500,
                      }}>
                        {item.text}
                      </p>
                      <span style={{ fontSize: 10, color: "var(--aire-muted)", marginTop: 2, display: "block" }}>
                        {item.time}
                      </span>
                    </div>
                  </div>
                ))
            }
          </div>
        </div>
      </div>

      {/* ─── Data Table ─── */}
      <div className="glass-card animate-fade-up stagger-4" style={{ borderRadius: 16, overflow: "hidden" }}>

        {/* Table toolbar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px 14px",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
        }}>
          <div>
            <div style={{
              fontFamily: "var(--font-display-app)", fontSize: 18, fontWeight: 500,
              color: "var(--aire-text)", letterSpacing: "-0.005em",
            }}>
              Active Leads
            </div>
            <div style={{ fontSize: 11, color: "var(--aire-text-2)", marginTop: 3 }}>
              {LEADS.length} contacts shown · click columns to sort
            </div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            {(["Hot", "Active", "Warm", "New"] as const).map(s => (
              <button
                key={s}
                style={{
                  padding: "5px 12px", borderRadius: 100, fontSize: 11, fontWeight: 600,
                  border: "1px solid rgba(0,0,0,0.09)",
                  background: STATUS_STYLE[s].bg,
                  color: STATUS_STYLE[s].color,
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "transform 120ms, box-shadow 150ms",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.transform = "";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "";
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Column header row */}
        <div style={{
          display: "grid", gridTemplateColumns: GRID,
          padding: "10px 24px",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
          background: "rgba(0,0,0,0.016)",
        }}>
          {TABLE_COLS.map(col => (
            <ColHeader
              key={col.key}
              col={col}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
          ))}
          <span style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: "0.10em",
            textTransform: "uppercase", color: "var(--aire-muted)",
          }}>
            Actions
          </span>
        </div>

        {/* Rows */}
        {loading
          ? (
            <div style={{ padding: "14px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, alignItems: "center" }}>
                  <Skeleton h={12} w="85%" />
                  <Skeleton h={20} w={50} r={100} />
                  <Skeleton h={12} w="80%" />
                  <Skeleton h={12} w="70%" />
                  <Skeleton h={12} w="60%" />
                  <Skeleton h={12} w="75%" />
                  <Skeleton h={8} w={48} r={4} />
                  <Skeleton h={24} w={90} r={8} />
                </div>
              ))}
            </div>
          )
          : sortedLeads.map((lead, idx) => (
            <div
              key={lead.id}
              style={{
                display: "grid", gridTemplateColumns: GRID,
                padding: "13px 24px",
                borderBottom: idx < sortedLeads.length - 1 ? "1px solid rgba(0,0,0,0.045)" : "none",
                alignItems: "center", cursor: "pointer",
                transition: "background 150ms", position: "relative",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.022)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              {/* Name + sub */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--aire-text)" }}>
                  {lead.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--aire-muted)", marginTop: 1 }}>
                  {lead.propertyType}
                </div>
              </div>

              {/* Status badge */}
              <div>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 100,
                  background: STATUS_STYLE[lead.status].bg,
                  color: STATUS_STYLE[lead.status].color,
                }}>
                  {lead.status}
                </span>
              </div>

              {/* Property type */}
              <div style={{ fontSize: 12.5, color: "var(--aire-text-2)" }}>
                {lead.propertyType}
              </div>

              {/* Budget */}
              <div style={{
                fontSize: 13, fontWeight: 600, color: "var(--aire-text)",
                fontFeatureSettings: "'tnum' 1",
              }}>
                {lead.budget}
              </div>

              {/* Last contact */}
              <div style={{
                fontSize: 12,
                color: lead.lastContactDaysAgo > 3 ? "#DC2626" : "var(--aire-text-2)",
                fontWeight: lead.lastContactDaysAgo > 3 ? 600 : 400,
              }}>
                {lead.lastContact}
              </div>

              {/* Stage */}
              <div style={{ fontSize: 12.5, color: "var(--aire-text-2)" }}>
                {lead.stage}
              </div>

              {/* Score bar + number */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 36, height: 4, borderRadius: 2,
                  background: "rgba(0,0,0,0.08)", overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${lead.score}%`,
                    background: lead.score >= 80 ? "#065F46" : lead.score >= 60 ? "#F59E0B" : "#EE8172",
                    borderRadius: 2,
                  }} />
                </div>
                <span style={{
                  fontSize: 11.5, fontWeight: 600, color: "var(--aire-text-2)",
                  fontFeatureSettings: "'tnum' 1",
                }}>
                  {lead.score}
                </span>
              </div>

              {/* Row actions */}
              <div style={{ display: "flex", gap: 4 }}>
                {[
                  { icon: <Phone size={12} />, title: "Call" },
                  { icon: <MessageSquare size={12} />, title: "Message" },
                  { icon: <Eye size={12} />, title: "View profile" },
                ].map(action => (
                  <button
                    key={action.title}
                    title={action.title}
                    onClick={e => e.stopPropagation()}
                    style={{
                      width: 26, height: 26, borderRadius: 7,
                      border: "1px solid rgba(0,0,0,0.09)",
                      background: "rgba(255,255,255,0.70)",
                      color: "var(--aire-text-2)", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "background 150ms, color 150ms, transform 120ms",
                    }}
                    onMouseEnter={e => {
                      const b = e.currentTarget as HTMLButtonElement;
                      b.style.background = "rgba(6,95,70,0.09)";
                      b.style.color = "#065F46";
                      b.style.transform = "scale(1.1)";
                    }}
                    onMouseLeave={e => {
                      const b = e.currentTarget as HTMLButtonElement;
                      b.style.background = "rgba(255,255,255,0.70)";
                      b.style.color = "var(--aire-text-2)";
                      b.style.transform = "scale(1)";
                    }}
                  >
                    {action.icon}
                  </button>
                ))}
                <button
                  title="More actions"
                  onClick={e => { e.stopPropagation(); setRowMenu(rowMenu === lead.id ? null : lead.id); }}
                  style={{
                    width: 26, height: 26, borderRadius: 7,
                    border: "1px solid rgba(0,0,0,0.09)",
                    background: rowMenu === lead.id ? "rgba(6,95,70,0.09)" : "rgba(255,255,255,0.70)",
                    color: rowMenu === lead.id ? "#065F46" : "var(--aire-text-2)",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 150ms, color 150ms",
                  }}
                >
                  <MoreHorizontal size={12} />
                </button>
              </div>
            </div>
          ))
        }

        {/* Table footer / pagination */}
        <div style={{
          padding: "12px 24px",
          borderTop: "1px solid rgba(0,0,0,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 11, color: "var(--aire-muted)" }}>
            Showing {LEADS.length} of 47 leads
          </span>
          <div style={{ display: "flex", gap: 5 }}>
            {["←", "1", "2", "3", "→"].map(p => (
              <button
                key={p}
                style={{
                  width: 28, height: 28, borderRadius: 7,
                  border: "1px solid rgba(0,0,0,0.09)",
                  background: p === "1" ? "var(--aire-green)" : "rgba(255,255,255,0.70)",
                  color: p === "1" ? "#fff" : "var(--aire-text-2)",
                  fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 150ms, color 150ms, transform 120ms",
                }}
                onMouseEnter={e => {
                  if (p !== "1") {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.05)";
                    (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
                  }
                }}
                onMouseLeave={e => {
                  if (p !== "1") {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.70)";
                    (e.currentTarget as HTMLButtonElement).style.transform = "";
                  }
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
