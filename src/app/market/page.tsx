"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google: any;
  }
}

import { useEffect, useState, useCallback } from "react";
import { MapPin, Home, DollarSign, TrendingUp, ExternalLink, PenTool } from "lucide-react";
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
  source?: "paragon" | "zillow";
  listingUrl?: string;
}

interface MarketStats {
  totalActive: number;
  medianPrice: number | null;
  avgDom: number | null;
}

const BATON_ROUGE_ZIPS = ["70808", "70809", "70810", "70806", "70816", "70817", "70820", "70737"];
const PRICE_FILTERS = [
  { label: "Any price", min: null, max: null },
  { label: "Under $200k", min: null, max: 200000 },
  { label: "$200k–$350k", min: 200000, max: 350000 },
  { label: "$350k–$500k", min: 350000, max: 500000 },
  { label: "$500k+", min: 500000, max: null },
];

function fmt(n: number) {
  return n >= 1000000
    ? `$${(n / 1000000).toFixed(1)}M`
    : n >= 1000
    ? `$${Math.round(n / 1000)}k`
    : `$${n}`;
}

export default function MarketPage() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [priceFilter, setPriceFilter] = useState(0);
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const pf = PRICE_FILTERS[priceFilter];
      const params = new URLSearchParams({ limit: "20" });
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

  // Load Google Maps
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
      mlsId: listing.mlsNumber,
      address: listing.address,
      price: String(listing.price ?? ""),
      type: "listing_spotlight",
    });
    router.push(`/create-post?${params}`);
  }

  const selected = listings.find(l => l.id === selectedId);
  const medianDisplay = stats?.medianPrice ? fmt(stats.medianPrice) : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 52px)", background: "var(--aire-bg)" }}>
      {/* Header */}
      <div style={{ padding: "18px 24px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderBottom: "1px solid var(--aire-border)" }}>
        <h1 style={{ fontFamily: "var(--font-display-app)", fontSize: 22, fontWeight: 700, color: "var(--aire-text)", margin: 0 }}>
          Market
        </h1>
        <span style={{ fontSize: 12, color: "var(--aire-muted)", fontWeight: 500 }}>EBR Parish</span>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PRICE_FILTERS.map((f, i) => (
            <button
              key={i}
              onClick={() => setPriceFilter(i)}
              style={{
                padding: "5px 14px", borderRadius: 100, border: "1px solid var(--aire-border)",
                background: priceFilter === i ? "var(--aire-green)" : "rgba(255,255,255,0.8)",
                color: priceFilter === i ? "#fff" : "var(--aire-text-2)",
                fontSize: 12, fontWeight: 500, cursor: "pointer",
                fontFamily: "var(--font-sans-app)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main split */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 380px", minHeight: 0 }}>
        {/* Map panel */}
        <div style={{ position: "relative", background: "#E8E0D8" }}>
          {mapReady ? (
            <GoogleMapEmbed listings={listings} selectedId={selectedId} onSelect={setSelectedId} />
          ) : (
            <div style={{
              height: "100%", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 12,
              color: "var(--aire-muted)", fontFamily: "var(--font-sans-app)",
            }}>
              <MapPin size={36} opacity={0.3} />
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
                  ? "Loading map…"
                  : "Add NEXT_PUBLIC_GOOGLE_MAPS_KEY to .env to enable the map"}
              </div>
              {!process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY && (
                <div style={{ fontSize: 11, color: "var(--aire-muted)", maxWidth: 280, textAlign: "center", lineHeight: 1.5 }}>
                  Listing cards are fully functional without the map key.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Listing cards */}
        <div style={{
          borderLeft: "1px solid var(--aire-border)",
          overflowY: "auto",
          background: "rgba(255,255,255,0.96)",
          display: "flex", flexDirection: "column",
        }}>
          {loading ? (
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />
              ))}
            </div>
          ) : listings.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--aire-muted)", fontSize: 13 }}>
              No active listings found for this filter.
            </div>
          ) : (
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {listings.map(l => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  selected={selectedId === l.id}
                  onSelect={() => setSelectedId(l.id === selectedId ? null : l.id)}
                  onUseForContent={() => useForContent(l)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Market pulse footer */}
      <div style={{
        borderTop: "1px solid var(--aire-border)",
        background: "rgba(255,255,255,0.96)",
        padding: "10px 24px",
        display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
        fontFamily: "var(--font-sans-app)", fontSize: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--aire-text-2)" }}>
          <Home size={13} />
          <span><b style={{ color: "var(--aire-text)" }}>{stats?.totalActive ?? "—"}</b> active</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--aire-text-2)" }}>
          <DollarSign size={13} />
          <span>Median <b style={{ color: "var(--aire-text)" }}>{medianDisplay}</b></span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--aire-text-2)" }}>
          <TrendingUp size={13} />
          <span>Avg DOM <b style={{ color: "var(--aire-text)" }}>{stats?.avgDom ? `${Math.round(stats.avgDom)}d` : "—"}</b></span>
        </div>
        <span style={{ marginLeft: "auto", color: "var(--aire-muted)", fontSize: 11 }}>
          Paragon MLS · EBR Parish corridors
        </span>
      </div>
    </div>
  );
}

function ListingCard({ listing, selected, onSelect, onUseForContent }: {
  listing: Listing;
  selected: boolean;
  onSelect: () => void;
  onUseForContent: () => void;
}) {
  const photo = listing.photos?.[0];
  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex", gap: 10, padding: "10px 12px", borderRadius: 12,
        border: `1.5px solid ${selected ? "var(--aire-green)" : "var(--aire-border)"}`,
        background: selected ? "var(--aire-green-soft)" : "transparent",
        cursor: "pointer", transition: "all 0.15s",
      }}
    >
      {/* Thumbnail */}
      <div style={{
        width: 72, height: 56, borderRadius: 8, flexShrink: 0, overflow: "hidden",
        background: "var(--aire-bg-deep)", position: "relative",
      }}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Home size={18} color="var(--aire-muted)" />
          </div>
        )}
        {listing.source === "zillow" && (
          <span style={{
            position: "absolute", bottom: 2, right: 2,
            fontSize: 8, letterSpacing: "0.06em", fontWeight: 700,
            background: "rgba(0,106,255,0.85)", color: "#fff",
            padding: "1px 4px", borderRadius: 3,
          }}>Z</span>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--aire-text)", lineHeight: 1.2, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {listing.address}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--aire-text-2)", marginBottom: 4 }}>
          {listing.city}, {listing.state} {listing.zip}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {listing.price && (
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--aire-text)", fontFamily: "var(--font-display-app)" }}>
              {fmt(listing.price)}
            </span>
          )}
          {listing.beds && <span style={{ fontSize: 11, color: "var(--aire-text-2)" }}>{listing.beds}bd</span>}
          {listing.baths && <span style={{ fontSize: 11, color: "var(--aire-text-2)" }}>{listing.baths}ba</span>}
          {listing.sqft && <span style={{ fontSize: 11, color: "var(--aire-text-2)" }}>{listing.sqft.toLocaleString()} sqft</span>}
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "1px 8px", borderRadius: 100,
            background: listing.status === "Active" ? "var(--aire-green-soft)" : "var(--aire-faint)",
            color: listing.status === "Active" ? "var(--aire-green)" : "var(--aire-text-2)",
          }}>
            {listing.status}
          </span>
          {listing.daysOnMarket != null && (
            <span style={{ fontSize: 10, color: "var(--aire-muted)" }}>{listing.daysOnMarket}d</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <button
          onClick={onUseForContent}
          title="Use for Content"
          style={{
            width: 28, height: 28, borderRadius: 8, border: "1px solid var(--aire-border)",
            background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <PenTool size={13} color="var(--aire-text-2)" />
        </button>
        {listing.source === "zillow" && listing.listingUrl ? (
          <a
            href={listing.listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="View on Zillow"
            style={{
              width: 28, height: 28, borderRadius: 8, border: "1px solid var(--aire-border)",
              background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              textDecoration: "none",
            }}
          >
            <ExternalLink size={13} color="#006AFF" />
          </a>
        ) : listing.mlsNumber ? (
          <a
            href={`/mls`}
            title="View in MLS"
            style={{
              width: 28, height: 28, borderRadius: 8, border: "1px solid var(--aire-border)",
              background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              textDecoration: "none",
            }}
          >
            <ExternalLink size={13} color="var(--aire-text-2)" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

// Google Maps component — only rendered when API key is present
function GoogleMapEmbed({ listings, selectedId, onSelect }: {
  listings: Listing[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  useEffect(() => {
    if (typeof window === "undefined" || !window.google?.maps) return;
    const center = { lat: 30.4515, lng: -91.1871 }; // Baton Rouge center
    const mapEl = document.getElementById("aire-map");
    if (!mapEl) return;
    const map = new window.google.maps.Map(mapEl, {
      center,
      zoom: 12,
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
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
          position: results[0].geometry.location,
          map,
          title: l.address,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: selectedId === l.id ? "#065F46" : "#EE8172",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
        });
        marker.addListener("click", () => onSelect(l.id));
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings]);

  return <div id="aire-map" style={{ width: "100%", height: "100%" }} />;
}
