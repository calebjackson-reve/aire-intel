"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sun, UserPlus, FileSignature, CalendarPlus } from "lucide-react";
import HotListings from "@/components/HotListings";
import CalendarWidget from "@/components/CalendarWidget";
import KPITracker from "@/components/KPITracker";
import ActionStack from "@/components/ActionStack";
import LogDealModal from "@/components/LogDealModal";
import ContentPerformancePanel from "@/components/ContentPerformancePanel";
import DailyMission from "@/components/DailyMission";
import TCHandoffPanel from "@/components/TCHandoffPanel";
import UrgentSignals from "@/components/UrgentSignals";
import HotLeadsBubble from "@/components/HotLeadsBubble";

interface MarketData {
  headline?: string;
  br_median?: string;
  dom_avg?: string;
  inventory?: string;
  rate_30yr?: string;
  signal?: string;
  caleb_note?: string;
  yoy_change?: string;
}

const CORAL = "#EE8172";
const CREAM = "#EFDD84";
const GREEN = "#4ade80";

interface IntegrationStatus {
  lofty: boolean;
  paragon: boolean;
  meta: boolean;
  twilio: boolean;
  sendgrid: boolean;
  calendly: boolean;
  zapier: boolean;
}

// Market data is heavy to compute (AI brief). Cache it in sessionStorage for 24h
// so reopening the dashboard doesn't re-spend tokens.
const MARKET_CACHE_KEY = "aire.market.v1";
const MARKET_TTL_MS = 24 * 60 * 60 * 1000;

interface MarketCache {
  data: MarketData;
  loadedAt: number;
}

function readMarketCache(): MarketCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MARKET_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as MarketCache;
    if (Date.now() - c.loadedAt > MARKET_TTL_MS) return null;
    return c;
  } catch {
    return null;
  }
}

function writeMarketCache(data: MarketData) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(MARKET_CACHE_KEY, JSON.stringify({ data, loadedAt: Date.now() }));
  } catch {}
}

const INTEGRATION_KEYS = ["lofty", "meta", "twilio", "sendgrid", "paragon", "calendly", "zapier"] as const;

export default function Dashboard() {
  const router = useRouter();
  const [today, setToday] = useState<string>("");
  const [market, setMarket] = useState<MarketData>({});
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketLoadedAt, setMarketLoadedAt] = useState<number | null>(null);
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [integrations, setIntegrations] = useState<IntegrationStatus>({
    lofty: false, paragon: false, meta: false,
    twilio: false, sendgrid: false, calendly: false, zapier: false,
  });

  useEffect(() => {
    setToday(new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago",
    }));
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then((s: Record<string, { set: boolean }>) => {
        setIntegrations({
          lofty: !!s["LOFTY_CONNECTED"]?.set,
          paragon: !!s["PARAGON_API_KEY"]?.set,
          meta: !!s["META_PAGE_ACCESS_TOKEN"]?.set,
          // Twilio requires all 3 fields to be set; rest just need their primary key
          twilio: !!(s["TWILIO_ACCOUNT_SID"]?.set && s["TWILIO_AUTH_TOKEN"]?.set && s["TWILIO_PHONE_NUMBER"]?.set),
          sendgrid: !!(s["SENDGRID_API_KEY"]?.set && s["SENDGRID_FROM_EMAIL"]?.set),
          calendly: !!s["CALENDLY_API_KEY"]?.set,
          zapier: !!s["ZAPIER_WEBHOOK_URL"]?.set,
        });
      })
      .catch(() => {});
  }, []);

  // Auto-load market pulse on mount. Hits cache first; refetches if cache stale.
  useEffect(() => {
    const cached = readMarketCache();
    if (cached) {
      setMarket(cached.data);
      setMarketLoadedAt(cached.loadedAt);
      return;
    }
    loadMarket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMarket() {
    setMarketLoading(true);
    const data = await fetch("/api/market").then(r => r.json()).catch(() => ({}));
    setMarket(data);
    setMarketLoadedAt(Date.now());
    writeMarketCache(data);
    setMarketLoading(false);
  }

  function formatLoadedAgo(loadedAt: number | null): string {
    if (!loadedAt) return "";
    const mins = Math.floor((Date.now() - loadedAt) / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  const connectedCount = INTEGRATION_KEYS.filter(k => integrations[k]).length;
  const allConnected = connectedCount === INTEGRATION_KEYS.length;

  return (
    <div style={{ minHeight: "100vh", position: "relative" }} key={refreshKey}>

      <HotListings />

      <LogDealModal
        open={dealModalOpen}
        onClose={() => setDealModalOpen(false)}
        onSaved={() => setRefreshKey(k => k + 1)}
      />

      {/* ── ZONE 1 — command bar: date · weather · quick actions · health ──── */}
      <header className="cmd-bar">
        <div className="when">
          <span className="d">{today || "Today"}</span>
          <span className="wx"><Sun size={15} /> Baton Rouge, LA</span>
        </div>
        <div className="qa">
          <Link href="/pipeline" className="btn-coral-glow" style={{ textDecoration: "none" }}>
            <UserPlus size={14} /> New Lead
          </Link>
          <button className="btn-glass" onClick={() => setDealModalOpen(true)}>
            <FileSignature size={14} /> Log Deal
          </button>
          <Link href="/content-calendar" className="btn-glass" style={{ textDecoration: "none" }}>
            <CalendarPlus size={14} /> Schedule
          </Link>
        </div>
        <Link
          href="/system"
          className={`health-pill${allConnected ? "" : " warn"}`}
          style={{ textDecoration: "none" }}
          title={`${connectedCount} of ${INTEGRATION_KEYS.length} integrations connected`}
        >
          <span className="pulse" />
          <span className="ht">
            {allConnected ? "All systems connected" : `${connectedCount}/${INTEGRATION_KEYS.length} systems connected`}
          </span>
        </Link>
      </header>

      {/* ── CANVAS — 3-zone editorial grid ─────────────────────────────────── */}
      <div className="dash-canvas">
        <div className="dash-grid">

          {/* ZONE 2 — main column */}
          <div className="col-main">
            <DailyMission />
            <UrgentSignals />
            <KPITracker onLogDeal={() => setDealModalOpen(true)} />
            <ActionStack />
            <div>
              <p className="aire-eyebrow" style={{ marginBottom: "14px" }}>CONTENT PERFORMANCE — FB + IG</p>
              <ContentPerformancePanel />
            </div>

            {/* Market Pulse */}
            <div className="glass pad">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                <span style={{ fontSize: "9px", letterSpacing: "0.20em", color: "var(--reve-muted)" }}>MARKET PULSE — EBR</span>
                <div style={{ flex: 1, height: "1px", background: "var(--reve-border)" }} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", gap: "8px" }}>
              {market.signal ? (
                <span style={{
                  fontSize: "9px", letterSpacing: "0.14em", padding: "3px 10px", borderRadius: "20px",
                  color: market.signal === "bull" ? GREEN : market.signal === "bear" ? CORAL : CREAM,
                  border: `1px solid ${market.signal === "bull" ? `${GREEN}40` : market.signal === "bear" ? `${CORAL}40` : `${CREAM}40`}`,
                  background: market.signal === "bull" ? `${GREEN}0D` : market.signal === "bear" ? `${CORAL}0D` : `${CREAM}0D`,
                }}>
                  {market.signal?.toUpperCase() === "BULL" ? "▲ BULLISH" : market.signal?.toUpperCase() === "BEAR" ? "▼ BEARISH" : "● NEUTRAL"}
                </span>
              ) : marketLoading ? (
                <span style={{ fontSize: "10px", letterSpacing: "0.10em", color: "var(--reve-muted)" }}>LOADING…</span>
              ) : null}

              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
                {marketLoadedAt && (
                  <span style={{ fontSize: "9px", letterSpacing: "0.10em", color: "var(--reve-muted)" }}>
                    {formatLoadedAgo(marketLoadedAt)}
                  </span>
                )}
                <button
                  onClick={loadMarket}
                  disabled={marketLoading}
                  title="Refresh market data"
                  style={{ fontSize: "12px", padding: "4px 8px", background: "none", border: "1px solid var(--reve-border)", color: "var(--reve-muted)", borderRadius: "6px", cursor: marketLoading ? "wait" : "pointer", opacity: marketLoading ? 0.5 : 1 }}
                  aria-label="Refresh market data"
                >
                  ↻
                </button>
              </div>
            </div>

            {market.headline ? (
              <>
                <p style={{ fontSize: "12px", color: "var(--reve-text-2)", lineHeight: "1.6", marginBottom: "16px" }}>{market.headline}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {[
                    { label: "MEDIAN", value: market.br_median },
                    { label: "AVG DOM", value: market.dom_avg ? `${market.dom_avg}d` : null },
                    { label: "30-YR", value: market.rate_30yr },
                    { label: "YOY", value: market.yoy_change },
                  ].filter(x => x.value).map(({ label, value }) => (
                    <div key={label} style={{ padding: "10px 12px", background: "var(--aire-card-warm)", borderRadius: "10px", border: "1px solid var(--aire-border)" }}>
                      <div style={{ fontSize: "9px", letterSpacing: "0.14em", color: "var(--reve-muted)", marginBottom: "4px" }}>{label}</div>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--reve-text)", letterSpacing: "-0.01em" }}>{value}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p style={{ fontSize: "12px", color: "var(--reve-muted)", fontStyle: "italic" }}>
                {marketLoading ? "Pulling EBR + West Feliciana + Pointe Coupee data…" : "Couldn't load market data. Tap ↻ to retry."}
              </p>
            )}
            </div>
          </div>

          {/* ZONE 3 — side column */}
          <aside className="col-side">
            <CalendarWidget />
            <HotLeadsBubble />
            <TCHandoffPanel />
          </aside>

        </div>

        <div style={{ maxWidth: "1240px", margin: "0 auto" }}>

        {/* 4. Capture stack — Plaud / Fathom / Vidyard */}
        <div style={{ marginTop: "22px", marginBottom: "14px" }}>
          <p style={{ fontSize: "10px", letterSpacing: "0.20em", color: "var(--aire-muted)", marginBottom: "12px", fontWeight: 500 }}>
            CAPTURE STACK
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
            {[
              {
                name: "PLAUD",
                tagline: "Physical reality",
                desc: "In-person conversations, car brain dumps, sphere encounters",
                url: "https://www.plaud.ai",
                accent: "#6EE7B7",
                icon: "⦿",
                tip: "Clip to phone → talk → transcript lands in Lofty",
              },
              {
                name: "FATHOM",
                tagline: "Digital meetings",
                desc: "Zoom, Meet, Teams — auto-transcribed, summarized, synced",
                url: "https://fathom.video",
                accent: "var(--aire-coral)",
                icon: "◎",
                tip: "Runs in background on every video call",
              },
              {
                name: "VIDYARD",
                tagline: "Outbound video",
                desc: "Personalized video messages to leads, lenders, past clients",
                url: "https://www.vidyard.com",
                accent: "var(--aire-cream)",
                icon: "▷",
                tip: "Record → share link → track when they watch it",
              },
            ].map(({ name, tagline, desc, url, accent, icon, tip }) => (
              <a
                key={name}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: "var(--aire-card)",
                  border: "1px solid var(--aire-border)",
                  borderRadius: "14px",
                  padding: "18px 20px",
                  textDecoration: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  transition: "border-color 200ms, background 200ms",
                  cursor: "pointer",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = accent;
                  (e.currentTarget as HTMLAnchorElement).style.background = "var(--aire-card-warm)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--aire-border)";
                  (e.currentTarget as HTMLAnchorElement).style.background = "var(--aire-card)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "18px", color: accent, lineHeight: 1 }}>{icon}</span>
                  <div>
                    <p style={{ fontSize: "11px", letterSpacing: "0.14em", fontWeight: 700, color: "var(--aire-text)", margin: 0 }}>{name}</p>
                    <p style={{ fontSize: "9px", letterSpacing: "0.10em", color: accent, margin: 0, fontWeight: 500 }}>{tagline.toUpperCase()}</p>
                  </div>
                  <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--aire-muted)" }}>↗</span>
                </div>
                <p style={{ fontSize: "11px", color: "var(--aire-text-2)", lineHeight: "1.5", margin: 0 }}>{desc}</p>
                <p style={{ fontSize: "10px", color: "var(--aire-muted)", fontStyle: "italic", margin: 0, borderTop: "1px solid var(--aire-border)", paddingTop: "8px" }}>
                  {tip}
                </p>
              </a>
            ))}
          </div>
        </div>

        {/* 5. Integration hub bar */}
        <div style={{ marginTop: "14px" }}>
          <div className="glass-card" style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "9px", letterSpacing: "0.20em", color: "var(--reve-muted)" }}>QUICK ACCESS</span>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[
                  { href: "/pipeline",    label: "Pipeline" },
                  { href: "/contacts",    label: "Contacts" },
                  { href: "/buyers",      label: "Buyers" },
                  { href: "/smart-plans", label: "Smart Plans" },
                  { href: "/create-post", label: "Post Studio" },
                  { href: "/mls",         label: "MLS" },
                  { href: "/settings",    label: "Settings" },
                ].map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    style={{
                      fontSize: "11px", letterSpacing: "0.10em",
                      color: "var(--reve-text-2)",
                      border: "1px solid var(--reve-border)",
                      borderRadius: "8px", padding: "8px 14px",
                      textDecoration: "none",
                    }}
                  >
                    {label.toUpperCase()}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        </div>

      </div>
    </div>
  );
}
