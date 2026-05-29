"use client";

import { useState, useEffect } from "react";

export interface Listing {
  mlsNumber: string;
  address: string;
  city: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  dom: number;
  status: "New" | "Price Drop" | "Back on Market";
  photoUrl?: string;
  listingUrl?: string;
  listedAt: string;
}

interface HotLead {
  name: string;
  email?: string;
  phone?: string;
  score: number;
  tier: "hot" | "warm";
  stage: string;
  lastTouch?: string | null;
  lastVisit?: string | null;
  tags: string[];
  loftyId: string;
  interestedIn: { address?: string; city?: string; price?: number; beds?: number }[];
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function daysAgo(iso?: string | null) {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  return `${d}d ago`;
}

const STATUS_COLORS: Record<string, string> = {
  "New": "#2d7a55",          // mint-deep for "New"
  "Price Drop": "#8a7a18",   // cream-deep for "Price Drop"
  "Back on Market": "#6B6B70", // neutral text-2
};

type Tab = "market" | "hotwarm" | "mylistings";

export default function HotListings() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("market");
  const [listings, setListings] = useState<Listing[]>([]);
  const [hotLeads, setHotLeads] = useState<{ hot: HotLead[]; warm: HotLead[] }>({ hot: [], warm: [] });
  const [loadingListings, setLoadingListings] = useState(false);
  const [loadingHot, setLoadingHot] = useState(false);
  const [lastFetched, setLastFetched] = useState<string | null>(null);

  async function fetchListings() {
    setLoadingListings(true);
    const data = await fetch("/api/listings").then(r => r.json()).catch(() => ({ listings: [] }));
    setListings(data.listings ?? []);
    setLastFetched(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    setLoadingListings(false);
  }

  async function fetchHotWarm() {
    setLoadingHot(true);
    const data = await fetch("/api/lofty/hot-warm").then(r => r.json()).catch(() => ({ hot: [], warm: [] }));
    setHotLeads({ hot: data.hot ?? [], warm: data.warm ?? [] });
    setLoadingHot(false);
  }

  useEffect(() => {
    if (!open) return;
    if (tab === "market" && listings.length === 0) fetchListings();
    if (tab === "hotwarm" && hotLeads.hot.length === 0 && hotLeads.warm.length === 0) fetchHotWarm();
  }, [open, tab]);

  const newCount = listings.filter(l => l.status === "New").length;
  const hotTotal = hotLeads.hot.length + hotLeads.warm.length;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "market", label: "Market", badge: newCount || undefined },
    { id: "hotwarm", label: "Hot & Warm", badge: hotTotal || undefined },
    { id: "mylistings", label: "My Listings" },
  ];

  return (
    <>
      {/* Toggle Tab — signature dark stripe on the left edge */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", left: 0, top: "50%", transform: "translateY(-50%)",
          zIndex: 300,
          background: open ? "var(--aire-coral)" : "var(--aire-ink)",
          border: "1px solid var(--aire-border)", borderLeft: "none",
          borderRadius: "0 10px 10px 0",
          padding: "14px 10px", cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", gap: "6px",
          transition: "background 300ms, box-shadow 300ms",
          boxShadow: open ? "var(--shadow-card-hover)" : "var(--shadow-card)",
        }}
        onMouseEnter={e => {
          if (!open) (e.currentTarget as HTMLButtonElement).style.background = "var(--aire-ink-soft)";
        }}
        onMouseLeave={e => {
          if (!open) (e.currentTarget as HTMLButtonElement).style.background = "var(--aire-ink)";
        }}
      >
        {(newCount > 0 || hotTotal > 0) && !open && (
          <span style={{
            width: "18px", height: "18px", borderRadius: "50%",
            background: "var(--aire-coral)",
            color: "var(--aire-ink)", fontSize: "10px", fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {hotTotal > 0 ? hotTotal : newCount}
          </span>
        )}
        <span style={{
          writingMode: "vertical-lr", fontSize: "9px", letterSpacing: "0.18em",
          color: open ? "var(--aire-ink)" : "var(--aire-text-inv)",
          fontWeight: open ? 700 : 500, transform: "rotate(180deg)", userSelect: "none",
        }}>
          {open ? "CLOSE" : "HOT LISTINGS"}
        </span>
        <span style={{ fontSize: "12px", color: open ? "var(--aire-ink)" : "var(--aire-coral)" }}>
          {open ? "×" : "▸"}
        </span>
      </button>

      {/* Backdrop */}
      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: "fixed", inset: 0, background: "rgba(26,26,28,0.25)",
          zIndex: 290, animation: "fade-in 200ms ease both", backdropFilter: "blur(2px)",
        }} />
      )}

      {/* Drawer — white floating panel */}
      <div style={{
        position: "fixed", left: 0, top: 0, bottom: 0, width: "400px", zIndex: 295,
        background: "var(--aire-card)",
        borderRight: "1px solid var(--aire-border)",
        boxShadow: "var(--shadow-card-hover)",
        transform: open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 420ms var(--ease-out-expo)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "24px 24px 0",
          background: "linear-gradient(180deg, var(--aire-coral-soft) 0%, transparent 100%)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span className="live-dot" />
            <span style={{ fontSize: "9px", letterSpacing: "0.18em", color: "var(--aire-muted)" }}>RÊVE · LOFTY CRM</span>
          </div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--aire-text)", letterSpacing: "-0.01em", marginBottom: "16px" }}>
            Intelligence Feed
          </h2>

          {/* Tabs — pill-ink active, pill outlined inactive */}
          <div style={{ display: "flex", gap: "6px", paddingBottom: "12px" }}>
            {tabs.map(t => {
              const isActive = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} className={isActive ? "pill-ink" : "pill"} style={{
                  flex: 1, padding: "6px 10px",
                  cursor: "pointer",
                  fontSize: "10px", letterSpacing: "0.08em", fontWeight: isActive ? 600 : 500,
                  transition: "background 200ms, color 200ms",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px",
                  borderRadius: "999px",
                  border: isActive ? "1px solid transparent" : "1px solid var(--aire-border)",
                  background: isActive ? "var(--aire-ink)" : "var(--aire-card)",
                  color: isActive ? "var(--aire-text-inv)" : "var(--aire-text-2)",
                }}>
                  {t.label}
                  {t.badge ? (
                    <span style={{
                      fontSize: "9px", fontWeight: 700, minWidth: "16px", height: "16px",
                      background: "var(--aire-coral)",
                      color: "var(--aire-ink)", borderRadius: "8px", padding: "0 4px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{t.badge}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px" }}>
          {tab === "market" && (
            <MarketTab listings={listings} loading={loadingListings} lastFetched={lastFetched} onRefresh={fetchListings} />
          )}
          {tab === "hotwarm" && (
            <HotWarmTab hot={hotLeads.hot} warm={hotLeads.warm} loading={loadingHot} onRefresh={fetchHotWarm} />
          )}
          {tab === "mylistings" && (
            <MyListingsTab />
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--aire-border)", display: "flex", gap: "8px" }}>
          <a href="/mls" style={{
            flex: 1, textAlign: "center", fontSize: "10px", letterSpacing: "0.14em",
            color: "var(--aire-coral-deep)", textDecoration: "none", padding: "10px",
            border: "1px solid rgba(238,129,114,0.3)", borderRadius: "8px",
            background: "var(--aire-coral-soft)",
            transition: "background 200ms",
          }}>
            FULL MLS →
          </a>
          <a href="/contacts" style={{
            flex: 1, textAlign: "center", fontSize: "10px", letterSpacing: "0.14em",
            color: "var(--aire-text-2)", textDecoration: "none", padding: "10px",
            border: "1px solid var(--aire-border)", borderRadius: "8px",
            background: "var(--aire-card)",
          }}>
            ALL CONTACTS →
          </a>
        </div>
      </div>
    </>
  );
}

// ── Market Tab ────────────────────────────────────────────────────────────────
function MarketTab({ listings, loading, lastFetched, onRefresh }: {
  listings: Listing[]; loading: boolean; lastFetched: string | null; onRefresh: () => void;
}) {
  const newCount = listings.filter(l => l.status === "New").length;
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0 12px" }}>
        <p style={{ fontSize: "11px", color: "var(--aire-text-2)" }}>New today · EBR, West Feliciana, Pointe Coupee</p>
        <button onClick={onRefresh} disabled={loading} style={{
          fontSize: "10px", padding: "5px 10px", background: "var(--aire-card)",
          border: "1px solid var(--aire-border)", color: "var(--aire-text-2)", borderRadius: "6px", cursor: "pointer",
        }}>{loading ? "..." : "↺"}</button>
      </div>
      {lastFetched && <p style={{ fontSize: "10px", color: "var(--aire-muted)", marginBottom: "10px" }}>Updated {lastFetched}</p>}
      {newCount > 0 && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
          {Object.entries(STATUS_COLORS).map(([status, color]) => {
            const count = listings.filter(l => l.status === status).length;
            if (!count) return null;
            const bgMap: Record<string, string> = {
              "New": "var(--aire-mint-soft)",
              "Price Drop": "var(--aire-cream-soft)",
              "Back on Market": "var(--aire-card-warm)",
            };
            const borderMap: Record<string, string> = {
              "New": "rgba(184,230,208,0.5)",
              "Price Drop": "rgba(239,221,132,0.35)",
              "Back on Market": "var(--aire-border)",
            };
            return <span key={status} style={{ fontSize: "10px", color, border: `1px solid ${borderMap[status]}`, background: bgMap[status], borderRadius: "20px", padding: "3px 10px", fontWeight: 600 }}>{count} {status.toUpperCase()}</span>;
          })}
        </div>
      )}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: "110px", borderRadius: "12px" }} />)}
        </div>
      ) : listings.length === 0 ? (
        <div style={{ paddingTop: "40px", textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "16px", opacity: 0.3, color: "var(--aire-text-2)" }}>⌂</div>
          <p style={{ fontSize: "13px", color: "var(--aire-text-2)" }}>No new listings yet.</p>
          <a href="/settings" className="btn-coral" style={{ display: "inline-block", marginTop: "16px", fontSize: "10px", letterSpacing: "0.12em", textDecoration: "none", padding: "8px 18px" }}>CONNECT PARAGON →</a>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {listings.map((listing, i) => <ListingCard key={listing.mlsNumber} listing={listing} index={i} />)}
        </div>
      )}
    </>
  );
}

// ── Hot & Warm Tab ─────────────────────────────────────────────────────────────
function HotWarmTab({ hot, warm, loading, onRefresh }: {
  hot: HotLead[]; warm: HotLead[]; loading: boolean; onRefresh: () => void;
}) {
  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingTop: "16px" }}>
      {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: "90px", borderRadius: "12px" }} />)}
    </div>
  );

  const all = [...hot.map(l => ({ ...l, tier: "hot" as const })), ...warm.map(l => ({ ...l, tier: "warm" as const }))];

  if (all.length === 0) return (
    <div style={{ paddingTop: "40px", textAlign: "center" }}>
      <div style={{ fontSize: "32px", marginBottom: "16px", opacity: 0.3 }}>🔥</div>
      <p style={{ fontSize: "13px", color: "var(--aire-text-2)" }}>No hot or warm leads right now.</p>
    </div>
  );

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0 12px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <span className="pill-coral" style={{ fontSize: "10px", borderRadius: "20px", padding: "3px 10px", fontWeight: 600 }}>
            {hot.length} HOT
          </span>
          <span className="pill-cream" style={{ fontSize: "10px", borderRadius: "20px", padding: "3px 10px", fontWeight: 600 }}>
            {warm.length} WARM
          </span>
        </div>
        <button onClick={onRefresh} style={{
          fontSize: "10px", padding: "5px 10px", background: "var(--aire-card)",
          border: "1px solid var(--aire-border)", color: "var(--aire-text-2)", borderRadius: "6px", cursor: "pointer",
        }}>↺</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {all.map((lead, i) => <LeadCard key={lead.loftyId} lead={lead} index={i} />)}
      </div>
    </>
  );
}

// ── My Listings Tab ────────────────────────────────────────────────────────────
function MyListingsTab() {
  return (
    <div style={{ paddingTop: "24px" }}>
      <div style={{
        background: "var(--aire-coral-soft)", border: "1px solid rgba(238,129,114,0.25)",
        borderRadius: "12px", padding: "24px", textAlign: "center",
      }}>
        <div style={{ fontSize: "28px", marginBottom: "12px", opacity: 0.7 }}>🏡</div>
        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--aire-text)", marginBottom: "6px" }}>My Active Listings</p>
        <p style={{ fontSize: "11px", color: "var(--aire-text-2)", lineHeight: 1.6, marginBottom: "20px" }}>
          Connect your Paragon MLS credentials to automatically pull listings where you are the listing agent.
        </p>
        <a href="/settings" className="btn-coral" style={{
          display: "inline-block", fontSize: "10px", letterSpacing: "0.12em",
          textDecoration: "none", padding: "10px 18px",
        }}>
          CONNECT PARAGON →
        </a>
      </div>
      <div style={{ marginTop: "16px", padding: "16px", background: "var(--aire-card-warm)", border: "1px solid var(--aire-border)", borderRadius: "12px" }}>
        <p style={{ fontSize: "10px", letterSpacing: "0.12em", color: "var(--aire-muted)", marginBottom: "10px", fontWeight: 600 }}>COMING WITH PARAGON</p>
        {["Just listed — auto badge", "Days on market tracker", "Price change alerts", "Showing request log", "Offer activity feed"].map(f => (
          <div key={f} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", borderBottom: "1px solid var(--aire-border)" }}>
            <span style={{ color: "var(--aire-coral)", fontSize: "10px" }}>◆</span>
            <span style={{ fontSize: "11px", color: "var(--aire-text-2)" }}>{f}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Cards ─────────────────────────────────────────────────────────────────────
function ListingCard({ listing, index }: { listing: Listing; index: number }) {
  const statusColor = STATUS_COLORS[listing.status] ?? "var(--aire-text-2)";
  const statusBgMap: Record<string, string> = {
    "New": "var(--aire-mint-soft)",
    "Price Drop": "var(--aire-cream-soft)",
    "Back on Market": "var(--aire-card-warm)",
  };
  const statusBg = statusBgMap[listing.status] ?? "var(--aire-card-warm)";
  return (
    <div
      style={{
        background: "var(--aire-card-warm)", border: "1px solid var(--aire-border)",
        borderRadius: "12px", overflow: "hidden", cursor: "pointer",
        transition: "border-color 200ms, box-shadow 200ms, transform 200ms",
        animation: `fade-up 400ms var(--ease-out-expo) ${index * 50}ms both`,
      }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = "var(--aire-border-2)"; el.style.boxShadow = "var(--shadow-card)"; el.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = "var(--aire-border)"; el.style.boxShadow = "none"; el.style.transform = "translateY(0)"; }}
      onClick={() => listing.listingUrl && window.open(listing.listingUrl, "_blank")}
    >
      <div style={{ height: "2px", background: statusColor, opacity: 0.7 }} />
      <div style={{ padding: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
          <div>
            <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--aire-text)", lineHeight: 1.2 }}>{listing.address}</p>
            <p style={{ fontSize: "11px", color: "var(--aire-text-2)", marginTop: "3px" }}>{listing.city} · MLS #{listing.mlsNumber}</p>
          </div>
          <span style={{ fontSize: "9px", letterSpacing: "0.10em", color: statusColor, background: statusBg, border: `1px solid ${statusColor}30`, borderRadius: "20px", padding: "3px 8px", flexShrink: 0, marginLeft: "8px", fontWeight: 600 }}>
            {listing.status.toUpperCase()}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--aire-coral)", letterSpacing: "-0.01em" }}>{fmt(listing.price)}</span>
          <div style={{ display: "flex", gap: "10px" }}>
            <span style={{ fontSize: "11px", color: "var(--aire-text-2)" }}>{listing.beds}bd</span>
            <span style={{ fontSize: "11px", color: "var(--aire-text-2)" }}>{listing.baths}ba</span>
            <span style={{ fontSize: "11px", color: "var(--aire-text-2)" }}>{listing.sqft?.toLocaleString()} sf</span>
          </div>
        </div>
        <div style={{ marginTop: "8px", display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: "10px", color: "var(--aire-muted)" }}>{listing.dom === 0 ? "Listed today" : `${listing.dom}d on market`}</span>
          <span style={{ fontSize: "10px", color: "var(--aire-coral-deep)", fontWeight: 600 }}>View →</span>
        </div>
      </div>
    </div>
  );
}

function LeadCard({ lead, index }: { lead: HotLead; index: number }) {
  const isHot = lead.tier === "hot";
  const accentColor = isHot ? "var(--aire-coral-deep)" : "#8a7a18";
  const accentBg = isHot ? "var(--aire-coral-soft)" : "var(--aire-cream-soft)";
  const accentBorder = isHot ? "rgba(238,129,114,0.25)" : "rgba(239,221,132,0.35)";
  const touched = daysAgo(lead.lastTouch);
  const initials = lead.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div
      style={{
        background: "var(--aire-card-warm)", border: `1px solid var(--aire-border)`,
        borderRadius: "12px", padding: "14px", cursor: "pointer",
        transition: "transform 200ms, box-shadow 200ms, border-color 200ms",
        animation: `fade-up 400ms var(--ease-out-expo) ${index * 60}ms both`,
      }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.transform = "translateY(-1px)"; el.style.boxShadow = "var(--shadow-card)"; el.style.borderColor = "var(--aire-border-2)"; }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.transform = "translateY(0)"; el.style.boxShadow = "none"; el.style.borderColor = "var(--aire-border)"; }}
      onClick={() => window.location.href = `/contacts`}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {/* Avatar */}
        <div style={{
          width: "38px", height: "38px", borderRadius: "50%", flexShrink: 0,
          background: accentBg, border: `1px solid ${accentBorder}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "12px", fontWeight: 700, color: accentColor,
        }}>{initials}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--aire-text)", lineHeight: 1.2 }}>{lead.name}</p>
            <span style={{
              fontSize: "9px", letterSpacing: "0.10em", color: accentColor,
              background: accentBg, border: `1px solid ${accentBorder}`, borderRadius: "20px", padding: "2px 7px", flexShrink: 0, marginLeft: "8px", fontWeight: 600,
            }}>
              {isHot ? "HOT" : "WARM"}
            </span>
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "4px", flexWrap: "wrap" }}>
            {lead.score > 0 && (
              <span style={{ fontSize: "11px", color: "var(--aire-text-2)" }}>Score {lead.score}</span>
            )}
            {touched && (
              <span style={{ fontSize: "11px", color: touched === "today" ? "#2d7a55" : "var(--aire-muted)" }}>
                Touched {touched}
              </span>
            )}
            {lead.phone && <span style={{ fontSize: "11px", color: "var(--aire-muted)" }}>{lead.phone}</span>}
          </div>

          {lead.interestedIn.length > 0 && (
            <div style={{ marginTop: "6px" }}>
              {lead.interestedIn.slice(0, 1).map((p, i) => (
                <span key={i} style={{ fontSize: "11px", color: "var(--aire-text-2)" }}>
                  Interested: {p.address ? `${p.address}, ${p.city}` : p.city} {p.price ? `· ${fmt(p.price)}` : ""} {p.beds ? `· ${p.beds}bd` : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {lead.tags.length > 0 && (
        <div style={{ display: "flex", gap: "4px", marginTop: "10px", flexWrap: "wrap" }}>
          {lead.tags.slice(0, 3).map(tag => (
            <span key={tag} style={{ fontSize: "9px", color: "var(--aire-text-2)", background: "var(--aire-card)", border: "1px solid var(--aire-border)", borderRadius: "4px", padding: "2px 6px" }}>{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}
