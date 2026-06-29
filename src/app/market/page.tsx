"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { google: any; }
}

import { useEffect, useState, useCallback } from "react";
import { MapPin, Home, DollarSign, TrendingUp, ExternalLink, PenTool, Flame, Clock, Tag } from "lucide-react";
import { useRouter } from "next/navigation";

interface Listing {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  status: string;
  daysOnMarket: number | null;
  photos: string[];
  mlsNumber: string;
  propertyType: string | null;
  listingAgent: string | null;
  source?: "paragon" | "rentcast";
  listingUrl?: string;
}

interface MarketStats {
  totalActive: number;
  medianPrice: number | null;
  avgDom: number | null;
}

const PRICE_FILTERS = [
  { label: "All", min: null, max: null },
  { label: "< $200k", min: null, max: 200000 },
  { label: "$200–350k", min: 200000, max: 350000 },
  { label: "$350–500k", min: 350000, max: 500000 },
  { label: "$500k+", min: 500000, max: null },
];

function fmt(n: number) {
  return n >= 1000000 ? `$${(n / 1000000).toFixed(2)}M`
    : n >= 1000 ? `$${Math.round(n / 1000)}k`
    : `$${n}`;
}

function domLabel(dom: number | null) {
  if (dom == null) return null;
  if (dom <= 7) return { label: "New", color: "#4ADE80", bg: "rgba(74,222,128,0.12)" };
  if (dom <= 30) return { label: `${dom}d`, color: "#728AC5", bg: "rgba(114,138,197,0.12)" };
  if (dom <= 90) return { label: `${dom}d`, color: "#EE8172", bg: "rgba(238,129,114,0.12)" };
  return { label: `${dom}d`, color: "#9B9B9B", bg: "rgba(155,155,155,0.10)" };
}

// Gradient placeholders per property type
const TYPE_GRADIENTS: Record<string, string> = {
  "Single Family": "linear-gradient(135deg, #1c1917 0%, #292524 60%, #2d1b0a 100%)",
  "Condo": "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0c1a2e 100%)",
  "Townhouse": "linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)",
  "Multi-Family": "linear-gradient(135deg, #14532d 0%, #052e16 60%, #1a3a1f 100%)",
  "Land": "linear-gradient(135deg, #1c2b1c 0%, #0f1f0f 60%, #2d3a1a 100%)",
};
function cardGradient(pt: string | null) {
  return TYPE_GRADIENTS[pt ?? ""] ?? "linear-gradient(135deg, #1c1917 0%, #2c2c2c 100%)";
}

export default function MarketPage() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [priceFilter, setPriceFilter] = useState(0);
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [mapReady, setMapReady] = useState(false);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const pf = PRICE_FILTERS[priceFilter];
      const params = new URLSearchParams({ limit: "24" });
      if (pf.min) params.set("priceMin", String(pf.min));
      if (pf.max) params.set("priceMax", String(pf.max));
      const res = await fetch(`/api/market/listings?${params}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setListings(data.listings ?? []);
      setStats(data.stats ?? null);
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [priceFilter]);

  useEffect(() => { fetchListings(); }, [fetchListings]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!key) { setMapReady(false); return; }
    if (window.google?.maps) { setMapReady(true); return; }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=marker`;
    script.async = true;
    script.onload = () => setMapReady(true);
    document.head.appendChild(script);
  }, []);

  function useForContent(listing: Listing) {
    const params = new URLSearchParams({
      mlsId: listing.mlsNumber, address: listing.address,
      price: String(listing.price ?? ""), type: "listing_spotlight",
    });
    router.push(`/create-post?${params}`);
  }

  // Sort: newest first (lowest DOM), then price
  const sorted = [...listings].sort((a, b) => {
    const da = a.daysOnMarket ?? 9999;
    const db = b.daysOnMarket ?? 9999;
    if (da !== db) return da - db;
    return (b.price ?? 0) - (a.price ?? 0);
  });

  const hotListings = sorted.filter(l => (l.daysOnMarket ?? 999) <= 14);
  const medianDisplay = stats?.medianPrice ? fmt(stats.medianPrice) : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 52px)", background: "var(--aire-bg)", overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{
        padding: "16px 28px 12px",
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
        borderBottom: "1px solid var(--aire-border)",
        background: "rgba(245,240,234,0.92)", backdropFilter: "blur(12px)",
        flexShrink: 0,
      }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display-app)", fontSize: 20, fontWeight: 700, color: "var(--aire-text)", margin: 0 }}>
            Market
          </h1>
          <span style={{ fontSize: 11, color: "var(--aire-muted)", fontWeight: 500, letterSpacing: "0.06em" }}>
            EBR PARISH · {stats?.totalActive ?? "—"} ACTIVE
          </span>
        </div>

        {/* Price filters */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PRICE_FILTERS.map((f, i) => (
            <button key={i} onClick={() => setPriceFilter(i)} style={{
              padding: "5px 13px", borderRadius: 100,
              border: `1.5px solid ${priceFilter === i ? "var(--aire-coral)" : "var(--aire-border)"}`,
              background: priceFilter === i ? "var(--aire-coral)" : "transparent",
              color: priceFilter === i ? "#fff" : "var(--aire-text-2)",
              fontSize: 11.5, fontWeight: 600, cursor: "pointer",
              fontFamily: "var(--font-sans-app)", letterSpacing: "0.02em",
              transition: "all 0.15s",
            }}>{f.label}</button>
          ))}
        </div>

        {/* View toggle + stats */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", gap: 4, background: "var(--aire-faint)", borderRadius: 8, padding: 3 }}>
            {(["grid", "list"] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
                background: view === v ? "var(--aire-card)" : "transparent",
                color: view === v ? "var(--aire-text)" : "var(--aire-muted)",
                boxShadow: view === v ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.12s",
              }}>{v === "grid" ? "⊞" : "☰"}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 700, color: "var(--aire-text)", fontSize: 14, fontFamily: "var(--font-display-app)" }}>{medianDisplay}</div>
              <div style={{ color: "var(--aire-muted)", fontSize: 10, letterSpacing: "0.06em" }}>MEDIAN</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 700, color: "var(--aire-text)", fontSize: 14, fontFamily: "var(--font-display-app)" }}>{stats?.avgDom ? `${Math.round(stats.avgDom)}d` : "—"}</div>
              <div style={{ color: "var(--aire-muted)", fontSize: 10, letterSpacing: "0.06em" }}>AVG DOM</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body: split map | listings ── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* Map panel */}
        <div style={{ width: 340, flexShrink: 0, borderRight: "1px solid var(--aire-border)", background: "#E8E0D8", position: "relative" }}>
          {mapReady ? (
            <GoogleMapEmbed listings={listings} selectedId={selectedId} onSelect={setSelectedId} />
          ) : (
            <div style={{
              height: "100%", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 10,
              color: "var(--aire-muted)",
            }}>
              <MapPin size={32} opacity={0.25} />
              <span style={{ fontSize: 11.5, fontWeight: 500, letterSpacing: "0.06em", fontFamily: "var(--font-sans-app)" }}>
                MAP COMING SOON
              </span>
              <span style={{ fontSize: 10, color: "var(--aire-muted)", maxWidth: 200, textAlign: "center", lineHeight: 1.5 }}>
                Enable Google Maps billing to see listing pins
              </span>
            </div>
          )}
        </div>

        {/* Listings panel */}
        <div style={{ flex: 1, overflowY: "auto", background: "var(--aire-bg)" }}>
          {loading ? (
            <div style={{ padding: "24px 28px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
              {[...Array(8)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 200, borderRadius: 14 }} />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div style={{ padding: 64, textAlign: "center", color: "var(--aire-muted)", fontSize: 13 }}>
              No active listings for this filter.
            </div>
          ) : (
            <div style={{ padding: "20px 24px" }}>

              {/* Hot listings row (≤14 DOM) */}
              {hotListings.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <Flame size={14} color="#EE8172" />
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "var(--aire-text-2)", fontFamily: "var(--font-sans-app)" }}>
                      JUST LISTED
                    </span>
                    <div style={{ flex: 1, height: 1, background: "var(--aire-border)" }} />
                  </div>
                  <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
                    {hotListings.map(l => (
                      <HotCard key={l.id} listing={l} selected={selectedId === l.id}
                        onSelect={() => setSelectedId(l.id === selectedId ? null : l.id)}
                        onUseForContent={() => useForContent(l)} />
                    ))}
                  </div>
                </div>
              )}

              {/* All listings section header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <Home size={13} color="var(--aire-text-2)" />
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "var(--aire-text-2)", fontFamily: "var(--font-sans-app)" }}>
                  ALL ACTIVE — BATON ROUGE
                </span>
                <div style={{ flex: 1, height: 1, background: "var(--aire-border)" }} />
                <span style={{ fontSize: 10, color: "var(--aire-muted)", letterSpacing: "0.06em" }}>
                  {listings[0]?.source === "rentcast" ? "RENTCAST · MLS-BACKED" : "PARAGON MLS"}
                </span>
              </div>

              {view === "grid" ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                  {sorted.map(l => (
                    <GridCard key={l.id} listing={l} selected={selectedId === l.id}
                      onSelect={() => setSelectedId(l.id === selectedId ? null : l.id)}
                      onUseForContent={() => useForContent(l)} />
                  ))}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {sorted.map(l => (
                    <ListRow key={l.id} listing={l} selected={selectedId === l.id}
                      onSelect={() => setSelectedId(l.id === selectedId ? null : l.id)}
                      onUseForContent={() => useForContent(l)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Hot card (horizontal scroll strip for newest listings) ────────────────────
function HotCard({ listing, selected, onSelect, onUseForContent }: {
  listing: Listing; selected: boolean;
  onSelect: () => void; onUseForContent: () => void;
}) {
  const dom = domLabel(listing.daysOnMarket);
  return (
    <div onClick={onSelect} style={{
      flexShrink: 0, width: 220, borderRadius: 14, overflow: "hidden",
      border: `1.5px solid ${selected ? "var(--aire-coral)" : "var(--aire-border)"}`,
      background: "var(--aire-card)", cursor: "pointer",
      transition: "border-color 0.15s, box-shadow 0.15s",
      boxShadow: selected ? "0 0 0 3px rgba(238,129,114,0.15)" : "0 2px 8px rgba(0,0,0,0.05)",
    }}>
      {/* Photo / gradient banner */}
      <div style={{
        height: 100, background: listing.photos?.[0] ? undefined : cardGradient(listing.propertyType),
        position: "relative", overflow: "hidden",
      }}>
        {listing.photos?.[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.photos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
        {!listing.photos?.[0] && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.15 }}>
            <Home size={32} color="#fff" />
          </div>
        )}
        {dom && (
          <span style={{
            position: "absolute", top: 8, left: 8, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em",
            background: dom.bg, color: dom.color, padding: "2px 7px", borderRadius: 100,
            backdropFilter: "blur(8px)", border: `1px solid ${dom.color}30`,
          }}>{dom.label === "New" ? "✦ NEW" : dom.label}</span>
        )}
        <button onClick={e => { e.stopPropagation(); onUseForContent(); }} title="Use for content" style={{
          position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: 8,
          background: "rgba(0,0,0,0.4)", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)",
        }}>
          <PenTool size={11} color="#fff" />
        </button>
      </div>
      {/* Info */}
      <div style={{ padding: "10px 12px" }}>
        <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "var(--font-display-app)", color: "var(--aire-text)", marginBottom: 2 }}>
          {listing.price ? fmt(listing.price) : "Price N/A"}
        </div>
        <div style={{ fontSize: 11, color: "var(--aire-text-2)", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {listing.address}
        </div>
        <div style={{ display: "flex", gap: 8, fontSize: 10.5, color: "var(--aire-muted)", fontWeight: 500 }}>
          {listing.beds && <span>{listing.beds} bd</span>}
          {listing.baths && <span>{listing.baths} ba</span>}
          {listing.sqft && <span>{listing.sqft.toLocaleString()} sf</span>}
        </div>
      </div>
    </div>
  );
}

// ── Grid card ─────────────────────────────────────────────────────────────────
function GridCard({ listing, selected, onSelect, onUseForContent }: {
  listing: Listing; selected: boolean;
  onSelect: () => void; onUseForContent: () => void;
}) {
  const dom = domLabel(listing.daysOnMarket);
  const ppsf = listing.price && listing.sqft ? Math.round(listing.price / listing.sqft) : null;

  return (
    <div onClick={onSelect} style={{
      borderRadius: 14, overflow: "hidden",
      border: `1.5px solid ${selected ? "var(--aire-coral)" : "var(--aire-border)"}`,
      background: "var(--aire-card)", cursor: "pointer",
      transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s",
      boxShadow: selected ? "0 0 0 3px rgba(238,129,114,0.12)" : "0 1px 6px rgba(0,0,0,0.04)",
    }}>
      {/* Photo / gradient banner */}
      <div style={{ height: 130, background: listing.photos?.[0] ? undefined : cardGradient(listing.propertyType), position: "relative" }}>
        {listing.photos?.[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.photos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
        {!listing.photos?.[0] && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, opacity: 0.18 }}>
            <Home size={28} color="#fff" />
            {listing.propertyType && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "#fff" }}>{listing.propertyType.toUpperCase()}</span>}
          </div>
        )}
        <div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 4 }}>
          {dom && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
              background: dom.bg, color: dom.color, padding: "2px 7px", borderRadius: 100,
              backdropFilter: "blur(8px)", border: `1px solid ${dom.color}30`,
            }}>{dom.label === "New" ? "✦ NEW" : `${dom.label} DOM`}</span>
          )}
          {listing.source === "rentcast" && (
            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.04em", background: "rgba(238,129,114,0.8)", color: "#fff", padding: "2px 5px", borderRadius: 4 }}>MLS</span>
          )}
        </div>
        <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
          <button onClick={onUseForContent} title="Use for content" style={{
            width: 28, height: 28, borderRadius: 8, background: "rgba(0,0,0,0.45)", border: "none",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)",
          }}><PenTool size={12} color="#fff" /></button>
          {listing.listingUrl && (
            <a href={listing.listingUrl} target="_blank" rel="noopener noreferrer" style={{
              width: 28, height: 28, borderRadius: 8, background: "rgba(0,0,0,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)", textDecoration: "none",
            }}><ExternalLink size={12} color="#fff" /></a>
          )}
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: "12px 14px" }}>
        <div style={{ fontFamily: "var(--font-display-app)", fontSize: 18, fontWeight: 800, color: "var(--aire-text)", marginBottom: 1 }}>
          {listing.price ? fmt(listing.price) : "Price N/A"}
        </div>
        <div style={{ fontSize: 11, color: "var(--aire-muted)", marginBottom: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {listing.address} · {listing.zip}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {[
            listing.beds ? `${listing.beds} bd` : null,
            listing.baths ? `${listing.baths} ba` : null,
            listing.sqft ? `${listing.sqft.toLocaleString()} sf` : null,
          ].filter(Boolean).map((s, i) => (
            <span key={i} style={{ fontSize: 11, color: "var(--aire-text-2)", fontWeight: 500 }}>{s}</span>
          ))}
          {ppsf && <span style={{ fontSize: 10, color: "var(--aire-muted)" }}>${ppsf}/sf</span>}
        </div>
        {listing.listingAgent && (
          <div style={{ marginTop: 8, fontSize: 10, color: "var(--aire-muted)", display: "flex", alignItems: "center", gap: 4 }}>
            <Tag size={9} />
            {listing.listingAgent}
          </div>
        )}
      </div>
    </div>
  );
}

// ── List row ──────────────────────────────────────────────────────────────────
function ListRow({ listing, selected, onSelect, onUseForContent }: {
  listing: Listing; selected: boolean;
  onSelect: () => void; onUseForContent: () => void;
}) {
  const dom = domLabel(listing.daysOnMarket);
  return (
    <div onClick={onSelect} style={{
      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
      borderRadius: 12, border: `1.5px solid ${selected ? "var(--aire-coral)" : "var(--aire-border)"}`,
      background: selected ? "rgba(238,129,114,0.04)" : "var(--aire-card)", cursor: "pointer",
      transition: "all 0.15s",
    }}>
      {/* Thumb */}
      <div style={{
        width: 60, height: 48, borderRadius: 8, flexShrink: 0, overflow: "hidden",
        background: cardGradient(listing.propertyType), position: "relative",
      }}>
        {listing.photos?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.photos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.2 }}>
            <Home size={18} color="#fff" />
          </div>
        )}
      </div>
      {/* Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 2 }}>
          <span style={{ fontFamily: "var(--font-display-app)", fontSize: 15, fontWeight: 700, color: "var(--aire-text)" }}>
            {listing.price ? fmt(listing.price) : "—"}
          </span>
          <span style={{ fontSize: 11, color: "var(--aire-text-2)", fontWeight: 500 }}>
            {[listing.beds && `${listing.beds}bd`, listing.baths && `${listing.baths}ba`, listing.sqft && `${listing.sqft.toLocaleString()}sf`].filter(Boolean).join(" · ")}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "var(--aire-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {listing.address}, {listing.city} {listing.zip}
        </div>
      </div>
      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {dom && (
          <span style={{ fontSize: 10, fontWeight: 700, color: dom.color, background: dom.bg, padding: "2px 8px", borderRadius: 100, border: `1px solid ${dom.color}30` }}>
            {dom.label === "New" ? "✦ NEW" : dom.label}
          </span>
        )}
        <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
          <button onClick={onUseForContent} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--aire-border)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <PenTool size={12} color="var(--aire-text-2)" />
          </button>
          {listing.listingUrl && (
            <a href={listing.listingUrl} target="_blank" rel="noopener noreferrer" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--aire-border)", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
              <ExternalLink size={12} color="var(--aire-text-2)" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Google Map embed ──────────────────────────────────────────────────────────
function GoogleMapEmbed({ listings, selectedId, onSelect }: {
  listings: Listing[]; selectedId: string | null; onSelect: (id: string) => void;
}) {
  useEffect(() => {
    if (typeof window === "undefined" || !window.google?.maps) return;
    const mapEl = document.getElementById("aire-map");
    if (!mapEl) return;
    const map = new window.google.maps.Map(mapEl, {
      center: { lat: 30.4515, lng: -91.1871 },
      zoom: 12, disableDefaultUI: true, zoomControl: true,
      styles: [
        { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
        { featureType: "transit", stylers: [{ visibility: "off" }] },
      ],
    });
    listings.forEach(l => {
      if (!l.address) return;
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address: `${l.address}, ${l.city}, ${l.state}` }, (results: any[], status: string) => {
        if (status !== "OK" || !results[0]) return;
        const marker = new window.google.maps.Marker({
          position: results[0].geometry.location, map, title: l.address,
          icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: selectedId === l.id ? "#EE8172" : "#09090B", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
        });
        marker.addListener("click", () => onSelect(l.id));
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings]);
  return <div id="aire-map" style={{ width: "100%", height: "100%" }} />;
}
