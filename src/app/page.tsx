"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sun, UserPlus, FileSignature } from "lucide-react";
import HotListings from "@/components/HotListings";
import CalendarWidget from "@/components/CalendarWidget";
import OvernightReport from "@/components/OvernightReport";
import KPITracker from "@/components/KPITracker";
import CommandCenter from "@/components/CommandCenter";
import ApproveQueue from "@/components/ApproveQueue";
import DailyMission from "@/components/DailyMission";
import LogDealModal from "@/components/LogDealModal";
import SocialKPIs from "@/components/SocialKPIs";

interface MarketData {
  headline?: string; br_median?: string; dom_avg?: string; inventory?: string;
  rate_30yr?: string; signal?: string; caleb_note?: string; yoy_change?: string;
}

// Market pulse is heavy (AI brief) — cache 24h in sessionStorage.
const MARKET_CACHE_KEY = "aire.market.v1";
const MARKET_TTL_MS = 24 * 60 * 60 * 1000;
function readMarketCache(): { data: MarketData; loadedAt: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const c = JSON.parse(sessionStorage.getItem(MARKET_CACHE_KEY) || "null");
    if (!c || Date.now() - c.loadedAt > MARKET_TTL_MS) return null;
    return c;
  } catch { return null; }
}
function writeMarketCache(data: MarketData) {
  try { sessionStorage.setItem(MARKET_CACHE_KEY, JSON.stringify({ data, loadedAt: Date.now() })); } catch {}
}

const INTEGRATION_KEYS = ["lofty", "meta", "twilio", "sendgrid", "paragon", "calendly", "zapier"] as const;
const SIGNAL_COLOR: Record<string, string> = { bull: "#2C7A5C", bear: "#9A4F00", neutral: "#5E6678" };

export default function Cockpit() {
  const [today, setToday] = useState("");
  const [market, setMarket] = useState<MarketData>({});
  const [marketLoading, setMarketLoading] = useState(false);
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [connected, setConnected] = useState(0);

  useEffect(() => {
    setToday(new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago" }));
  }, []);

  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then((s: Record<string, { set: boolean }>) => {
      const map: Record<string, boolean> = {
        lofty: !!s["LOFTY_CONNECTED"]?.set,
        paragon: !!s["PARAGON_API_KEY"]?.set,
        meta: !!s["META_PAGE_ACCESS_TOKEN"]?.set,
        twilio: !!(s["TWILIO_ACCOUNT_SID"]?.set && s["TWILIO_AUTH_TOKEN"]?.set && s["TWILIO_PHONE_NUMBER"]?.set),
        sendgrid: !!(s["SENDGRID_API_KEY"]?.set && s["SENDGRID_FROM_EMAIL"]?.set),
        calendly: !!s["CALENDLY_API_KEY"]?.set,
        zapier: !!s["ZAPIER_WEBHOOK_URL"]?.set,
      };
      setConnected(INTEGRATION_KEYS.filter(k => map[k]).length);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const cached = readMarketCache();
    if (cached) { setMarket(cached.data); return; }
    loadMarket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMarket() {
    setMarketLoading(true);
    const data = await fetch("/api/market").then(r => r.json()).catch(() => ({}));
    setMarket(data);
    writeMarketCache(data);
    setMarketLoading(false);
  }

  const allConnected = connected === INTEGRATION_KEYS.length;
  const sig = (market.signal || "").toLowerCase();

  return (
    <div style={{ minHeight: "100vh", position: "relative" }} key={refreshKey}>
      <HotListings />
      <LogDealModal open={dealModalOpen} onClose={() => setDealModalOpen(false)} onSaved={() => setRefreshKey(k => k + 1)} />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
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
        </div>
        <Link href="/settings" className={`health-pill${allConnected ? "" : " warn"}`} style={{ textDecoration: "none" }}
          title={`${connected} of ${INTEGRATION_KEYS.length} integrations connected`}>
          <span className="pulse" />
          <span className="ht">{allConnected ? "All systems connected" : `${connected}/${INTEGRATION_KEYS.length} systems`}</span>
        </Link>
      </header>

      {/* ── Cockpit — calm single column, in order ──────────────────────────── */}
      <div style={{ padding: "26px 30px 70px" }}>
        <div style={{ maxWidth: "1180px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "22px" }}>

          {/* 0 — Command Center (action-count widgets, Lofty-style) */}
          <CommandCenter />

          {/* 1 — Daily agenda + small calendar  ·  Overnight report */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.05fr) minmax(0,1fr)", gap: "22px", alignItems: "stretch" }} className="cockpit-top">
            <CalendarWidget />
            <OvernightReport />
          </div>

          {/* 2 — KPI data */}
          <KPITracker onLogDeal={() => setDealModalOpen(true)} />

          {/* 3 — Housing market updates */}
          <div className="glass-card" style={{ padding: "22px 26px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <span className="aire-eyebrow">Housing Market — Baton Rouge</span>
              {sig && (
                <span className="pill" style={{ fontSize: "10px", padding: "3px 11px", color: SIGNAL_COLOR[sig] ?? "var(--aire-text-2)" }}>
                  {sig === "bull" ? "▲ Bullish" : sig === "bear" ? "▼ Cooling" : "● Neutral"}
                </span>
              )}
              <button onClick={loadMarket} disabled={marketLoading} aria-label="Refresh market data"
                style={{ marginLeft: "auto", fontSize: "13px", padding: "5px 10px", background: "var(--aire-card)", border: "none", boxShadow: "var(--shadow-xs)", color: "var(--aire-text-2)", borderRadius: "8px", cursor: marketLoading ? "wait" : "pointer" }}>↻</button>
            </div>
            {market.headline ? (
              <>
                <p style={{ fontSize: "13px", color: "var(--aire-text-2)", lineHeight: 1.6, marginBottom: "16px" }}>{market.headline}</p>
                <div className="stat-tile-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
                  {[
                    { label: "Median", value: market.br_median },
                    { label: "Avg DOM", value: market.dom_avg ? `${market.dom_avg}d` : null },
                    { label: "30-Yr Rate", value: market.rate_30yr },
                    { label: "YoY", value: market.yoy_change },
                  ].filter(x => x.value).map(({ label, value }) => (
                    <div key={label} className="stat-tile coral" style={{ padding: "16px 18px" }}>
                      <div className="st-label">{label}</div>
                      <div className="st-value" style={{ fontSize: "26px" }}>{value}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p style={{ fontSize: "13px", color: "var(--aire-muted)", fontStyle: "italic" }}>
                {marketLoading ? "Pulling EBR + West Feliciana + Pointe Coupee data…" : "Couldn't load market data. Tap ↻ to retry."}
              </p>
            )}
          </div>

          {/* 4 — Social KPIs */}
          <SocialKPIs />

          {/* 5 — Approve Queue */}
          <ApproveQueue />

          {/* 5 — Today's Mission (the simple, to-the-point task engine) */}
          <DailyMission />

        </div>
      </div>

      <style>{`@media (max-width: 940px){ .cockpit-top { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
