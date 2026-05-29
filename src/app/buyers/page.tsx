"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ListingAlert {
  id: string;
  mlsNumber: string;
  address: string;
  price: number;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  listingUrl: string | null;
  listedAt: string;
  seen: boolean;
}

interface BuyerSearch {
  id: string;
  name: string;
  priceMin: number | null;
  priceMax: number | null;
  bedsMin: number | null;
  bathsMin: number | null;
  sqftMin: number | null;
  areas: string | null;
  propertyTypes: string | null;
  active: boolean;
  createdAt: string;
  lead: { id: string; name: string; phone: string | null; email: string | null } | null;
  alerts: ListingAlert[];
  _count: { alerts: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined) {
  if (n == null) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${(n / 1000).toFixed(0)}K`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const MINT_INK = "#2d7a55";

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function BuyersPage() {
  const [searches, setSearches] = useState<BuyerSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<BuyerSearch | null>(null);
  const [creating, setCreating] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: "", leadId: "", priceMin: "", priceMax: "",
    bedsMin: "", bathsMin: "", sqftMin: "", areas: "", propertyTypes: "",
  });
  const [saving, setSaving] = useState(false);

  // Contacts for lead selector
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/buyers").then(r => r.json()).then(data => { setSearches(data); setLoading(false); }).catch(() => setLoading(false));
    fetch("/api/contacts").then(r => r.json()).then(setContacts).catch(() => {});
  }, []);

  async function saveSearch() {
    if (!form.name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/buyers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        leadId: form.leadId || null,
        priceMin: form.priceMin || null,
        priceMax: form.priceMax || null,
        bedsMin: form.bedsMin || null,
        bathsMin: form.bathsMin || null,
        sqftMin: form.sqftMin || null,
        areas: form.areas || null,
        propertyTypes: form.propertyTypes || null,
      }),
    });
    const created = await res.json();
    setSearches(prev => [created, ...prev]);
    setCreating(false);
    setForm({ name: "", leadId: "", priceMin: "", priceMax: "", bedsMin: "", bathsMin: "", sqftMin: "", areas: "", propertyTypes: "" });
    setSaving(false);
  }

  async function deleteSearch(id: string) {
    await fetch("/api/buyers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setSearches(prev => prev.filter(s => s.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  async function toggleActive(search: BuyerSearch) {
    const res = await fetch("/api/buyers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: search.id, active: !search.active }),
    });
    const updated = await res.json();
    setSearches(prev => prev.map(s => s.id === search.id ? { ...s, ...updated } : s));
    if (selected?.id === search.id) setSelected(prev => prev ? { ...prev, active: !prev.active } : prev);
  }

  const totalMatches = searches.reduce((sum, s) => sum + s._count.alerts, 0);
  const newMatches = searches.reduce((sum, s) => sum + s.alerts.filter(a => !a.seen).length, 0);

  return (
    <div style={{ padding: "32px 40px 32px 80px", maxWidth: "1360px", margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "28px", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <p style={{ fontSize: "11px", letterSpacing: "0.20em", color: "var(--aire-muted)", marginBottom: "6px" }}>BUYER SEARCHES</p>
          <h1 className="font-display" style={{ fontSize: "32px", color: "var(--aire-ink)", letterSpacing: "-0.01em" }}>Live match feed</h1>
          <div style={{ width: "32px", height: "2px", background: "var(--aire-coral)", marginTop: "10px" }} />
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          {newMatches > 0 && (
            <span className="pill-mint" style={{ fontSize: "11px", letterSpacing: "0.10em", padding: "5px 14px", fontWeight: 600 }}>
              {newMatches} NEW MATCHES
            </span>
          )}
          <button
            onClick={() => setCreating(true)}
            className="btn-coral"
            style={{ padding: "10px 20px", fontSize: "11px", letterSpacing: "0.14em" }}
          >
            + NEW SEARCH
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="card-light" style={{ padding: "16px 24px", marginBottom: "20px", display: "flex", gap: "32px", flexWrap: "wrap" }}>
        {[
          { label: "SAVED SEARCHES", value: searches.length },
          { label: "ACTIVE", value: searches.filter(s => s.active).length },
          { label: "TOTAL MATCHES", value: totalMatches },
          { label: "UNREAD MATCHES", value: newMatches, color: newMatches > 0 ? MINT_INK : undefined },
        ].map(({ label, value, color }) => (
          <div key={label}>
            <div style={{ fontSize: "9px", letterSpacing: "0.16em", color: "var(--aire-muted)", marginBottom: "4px", fontWeight: 600 }}>{label}</div>
            <div className="font-display" style={{ fontSize: "26px", color: color ?? "var(--aire-ink)", letterSpacing: "-0.02em" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: "16px" }}>

        {/* Search list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {loading ? (
            [1,2,3].map(i => <div key={i} className="card-light" style={{ height: "100px", opacity: 0.5 }} />)
          ) : searches.length === 0 ? (
            <BuyerArchetypeEmpty onCreated={(s) => setSearches([s])} onCreateCustom={() => setCreating(true)} />
          ) : (
            searches.map((search, i) => {
              const newCount = search.alerts.filter(a => !a.seen).length;
              const isSelected = selected?.id === search.id;
              return (
                <div
                  key={search.id}
                  onClick={() => setSelected(search)}
                  className="card-light"
                  style={{
                    padding: "16px 18px",
                    cursor: "pointer",
                    borderColor: isSelected ? "var(--aire-coral)" : newCount > 0 ? "rgba(45,122,85,0.18)" : undefined,
                    background: isSelected ? "var(--aire-coral-soft)" : undefined,
                    animation: `fade-up 300ms var(--ease-out-expo) ${i * 40}ms both`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px", gap: "8px" }}>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--aire-ink)" }}>{search.name}</p>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                      {newCount > 0 && (
                        <span className="pill-mint" style={{ fontSize: "10px", letterSpacing: "0.10em", padding: "2px 8px", fontWeight: 600 }}>
                          {newCount} NEW
                        </span>
                      )}
                      <span
                        className={search.active ? "pill-coral" : "pill"}
                        style={{ fontSize: "9px", letterSpacing: "0.10em", padding: "2px 8px" }}
                      >
                        {search.active ? "ON" : "OFF"}
                      </span>
                    </div>
                  </div>

                  {/* Criteria chips */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
                    {search.priceMin && <Chip label={`${fmt(search.priceMin)}+`} />}
                    {search.priceMax && <Chip label={`Up to ${fmt(search.priceMax)}`} />}
                    {search.bedsMin && <Chip label={`${search.bedsMin}+ bd`} />}
                    {search.areas && <Chip label={search.areas} />}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    {search.lead && (
                      <Link href={`/contacts/${search.lead.id}`} onClick={e => e.stopPropagation()} style={{ fontSize: "11px", color: "var(--aire-coral-deep)", textDecoration: "none", fontWeight: 600 }}>
                        {search.lead.name}
                      </Link>
                    )}
                    <span style={{ fontSize: "11px", color: "var(--aire-text-2)", marginLeft: "auto" }}>
                      {search._count.alerts} total matches
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Match feed */}
        <div>
          {selected ? (
            <SearchDetail
              search={selected}
              onToggle={() => toggleActive(selected)}
              onDelete={() => deleteSearch(selected.id)}
            />
          ) : (
            <div className="card-light" style={{ padding: "60px 40px", textAlign: "center" }}>
              <p style={{ fontSize: "32px", opacity: 0.2, color: "var(--aire-ink)" }}>⌂</p>
              <p style={{ fontSize: "13px", color: "var(--aire-text-2)", marginTop: "16px" }}>Select a search to see matched listings.</p>
              <p style={{ fontSize: "11px", color: "var(--aire-muted)", marginTop: "6px" }}>When new listings match a buyer&apos;s criteria, they appear here instantly.</p>
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      {creating && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,28,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", backdropFilter: "blur(6px)" }}>
          <div className="card-light animate-scale-in" style={{ padding: "28px", width: "100%", maxWidth: "560px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <div>
                <p style={{ fontSize: "10px", letterSpacing: "0.20em", color: "var(--aire-muted)", marginBottom: "4px" }}>NEW SEARCH</p>
                <h2 className="font-display" style={{ fontSize: "20px", color: "var(--aire-ink)" }}>Define buyer criteria</h2>
              </div>
              <button onClick={() => setCreating(false)} style={{ background: "none", border: "none", color: "var(--aire-muted)", fontSize: "22px", cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <FormField label="SEARCH NAME">
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="aire-input" style={{ width: "100%", boxSizing: "border-box" }} placeholder="e.g. The Joneses – Gardere under $400K" />
              </FormField>

              <FormField label="LINKED CONTACT (optional)">
                <select value={form.leadId} onChange={e => setForm(p => ({ ...p, leadId: e.target.value }))} className="aire-input" style={{ width: "100%", boxSizing: "border-box" }}>
                  <option value="">No contact linked</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </FormField>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <FormField label="PRICE MIN">
                  <input value={form.priceMin} onChange={e => setForm(p => ({ ...p, priceMin: e.target.value }))} className="aire-input" style={{ width: "100%", boxSizing: "border-box" }} placeholder="e.g. 300000" />
                </FormField>
                <FormField label="PRICE MAX">
                  <input value={form.priceMax} onChange={e => setForm(p => ({ ...p, priceMax: e.target.value }))} className="aire-input" style={{ width: "100%", boxSizing: "border-box" }} placeholder="e.g. 500000" />
                </FormField>
                <FormField label="MIN BEDS">
                  <input value={form.bedsMin} onChange={e => setForm(p => ({ ...p, bedsMin: e.target.value }))} className="aire-input" style={{ width: "100%", boxSizing: "border-box" }} placeholder="3" />
                </FormField>
                <FormField label="MIN BATHS">
                  <input value={form.bathsMin} onChange={e => setForm(p => ({ ...p, bathsMin: e.target.value }))} className="aire-input" style={{ width: "100%", boxSizing: "border-box" }} placeholder="2" />
                </FormField>
              </div>

              <FormField label="AREAS / ZIP CODES">
                <input value={form.areas} onChange={e => setForm(p => ({ ...p, areas: e.target.value }))} className="aire-input" style={{ width: "100%", boxSizing: "border-box" }} placeholder="Gardere, 70820, Prairieville..." />
              </FormField>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
              <button onClick={() => setCreating(false)} className="btn-ghost" style={{ flex: 1, padding: "12px" }}>CANCEL</button>
              <button onClick={saveSearch} disabled={saving || !form.name.trim()} className="btn-coral" style={{ flex: 2, padding: "12px" }}>
                {saving ? "SAVING..." : "SAVE SEARCH"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Chip({ label }: { label: string | null | undefined }) {
  if (!label) return null;
  return (
    <span className="pill" style={{ fontSize: "10px", padding: "2px 10px" }}>
      {label}
    </span>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode; placeholder?: string }) {
  return (
    <div>
      <label style={{ fontSize: "9px", letterSpacing: "0.16em", color: "var(--aire-text-2)", display: "block", marginBottom: "6px", fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

function SearchDetail({
  search, onToggle, onDelete,
}: {
  search: BuyerSearch;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="card-light" style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h2 className="font-display" style={{ fontSize: "22px", color: "var(--aire-ink)", marginBottom: "6px" }}>{search.name}</h2>
          {search.lead && (
            <Link href={`/contacts/${search.lead.id}`} style={{ fontSize: "12px", color: "var(--aire-coral-deep)", textDecoration: "none", fontWeight: 600 }}>
              Linked to {search.lead.name} →
            </Link>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={onToggle}
            className={search.active ? "btn-coral" : "btn-ghost"}
            style={{ padding: "7px 14px", fontSize: "10px", letterSpacing: "0.10em" }}
          >
            {search.active ? "RUN MATCH · ACTIVE" : "PAUSED"}
          </button>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="btn-ghost" style={{ padding: "7px 14px", fontSize: "10px" }}>DELETE</button>
          ) : (
            <button onClick={onDelete} style={{ padding: "7px 14px", fontSize: "10px", letterSpacing: "0.10em", background: "transparent", border: "1px solid var(--aire-coral)", color: "var(--aire-coral-deep)", borderRadius: "999px", cursor: "pointer", fontWeight: 600 }}>CONFIRM</button>
          )}
        </div>
      </div>

      {/* Criteria */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px", padding: "14px", background: "var(--aire-card-warm)", borderRadius: "10px", border: "1px solid var(--aire-border)" }}>
        {[
          search.priceMin && `Min ${fmt(search.priceMin)}`,
          search.priceMax && `Max ${fmt(search.priceMax)}`,
          search.bedsMin && `${search.bedsMin}+ beds`,
          search.bathsMin && `${search.bathsMin}+ baths`,
          search.sqftMin && `${search.sqftMin?.toLocaleString()}+ sqft`,
          search.areas,
          search.propertyTypes,
        ].filter(Boolean).map(c => (
          <span key={c} className="pill" style={{ fontSize: "11px", padding: "4px 12px" }}>
            {c}
          </span>
        ))}
      </div>

      {/* Match feed */}
      <div style={{ fontSize: "9px", letterSpacing: "0.18em", color: "var(--aire-muted)", marginBottom: "14px", fontWeight: 600 }}>
        {search._count.alerts} MATCHED LISTINGS
      </div>

      {search.alerts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <p style={{ fontSize: "24px", opacity: 0.25, color: "var(--aire-ink)" }}>⌂</p>
          <p style={{ fontSize: "12px", color: "var(--aire-text-2)", marginTop: "12px" }}>No matches yet.</p>
          <p style={{ fontSize: "11px", color: "var(--aire-muted)", marginTop: "4px" }}>
            New listings that match this criteria will appear here automatically.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {search.alerts.map((alert, i) => (
            <div
              key={alert.id}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 16px",
                background: alert.seen ? "var(--aire-card-warm)" : "var(--aire-mint-soft)",
                border: `1px solid ${alert.seen ? "var(--aire-border)" : "rgba(45,122,85,0.18)"}`,
                borderRadius: "10px",
                animation: `fade-up 300ms var(--ease-out-expo) ${i * 40}ms both`,
                cursor: alert.listingUrl ? "pointer" : "default",
              }}
              onClick={() => alert.listingUrl && window.open(alert.listingUrl, "_blank")}
            >
              <div>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--aire-ink)", marginBottom: "4px" }}>{alert.address}</p>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {alert.beds && <span style={{ fontSize: "11px", color: "var(--aire-text-2)" }}>{alert.beds}bd</span>}
                  {alert.baths && <span style={{ fontSize: "11px", color: "var(--aire-text-2)" }}>{alert.baths}ba</span>}
                  {alert.sqft && <span style={{ fontSize: "11px", color: "var(--aire-text-2)" }}>{alert.sqft.toLocaleString()} sf</span>}
                  <span style={{ fontSize: "11px", color: "var(--aire-muted)" }}>{timeAgo(alert.listedAt)}</span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <p className="font-display" style={{ fontSize: "20px", color: "var(--aire-ink)", letterSpacing: "-0.02em" }}>{fmt(alert.price)}</p>
                {!alert.seen && <span style={{ fontSize: "9px", letterSpacing: "0.12em", color: MINT_INK, fontWeight: 600 }}>NEW</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Buyer archetype templates (one-click create) ───────────────────────────

interface BuyerArchetype {
  name: string;
  description: string;
  priceMin: number | null;
  priceMax: number | null;
  bedsMin: number | null;
  bathsMin: number | null;
  sqftMin: number | null;
  areas: string;
  propertyTypes: string;
}

const BUYER_ARCHETYPES: BuyerArchetype[] = [
  {
    name: "First-Time Buyer · $150-300k",
    description: "Younger buyers, mid-budget, family-friendly BR neighborhoods.",
    priceMin: 150_000, priceMax: 300_000,
    bedsMin: 3, bathsMin: 2, sqftMin: 1400,
    areas: "Zachary, Central, Denham Springs, Walker, Watson",
    propertyTypes: "residential",
  },
  {
    name: "Move-Up Family · $350-550k",
    description: "Growing family upgrading. Schools and yard space matter.",
    priceMin: 350_000, priceMax: 550_000,
    bedsMin: 4, bathsMin: 2.5, sqftMin: 2200,
    areas: "Prairieville, Gonzales, Watson, Denham Springs, Baton Rouge",
    propertyTypes: "residential",
  },
  {
    name: "Luxury Buyer · $600k+",
    description: "High-end, finish-focused. Bocage, Country Club, St. Francisville.",
    priceMin: 600_000, priceMax: null,
    bedsMin: 4, bathsMin: 3, sqftMin: 3000,
    areas: "Bocage, Country Club of Louisiana, Highland Plantation, St. Francisville",
    propertyTypes: "residential",
  },
  {
    name: "Downsizer · $200-400k",
    description: "Empty nester / retiree. Single-story, low maintenance.",
    priceMin: 200_000, priceMax: 400_000,
    bedsMin: 2, bathsMin: 2, sqftMin: 1400,
    areas: "Baton Rouge, Central, Zachary",
    propertyTypes: "residential,condo,townhome",
  },
  {
    name: "Investor · Multi-Family / Cash Flow",
    description: "Rentals, duplexes, fixer-uppers. Cap rate over aesthetics.",
    priceMin: 100_000, priceMax: 350_000,
    bedsMin: null, bathsMin: null, sqftMin: null,
    areas: "Mid-City, Old South Baton Rouge, Scotlandville, Baker",
    propertyTypes: "residential,multi-family,land",
  },
  {
    name: "Land Buyer · Acreage",
    description: "Land for homestead, hunting, or development.",
    priceMin: 50_000, priceMax: 500_000,
    bedsMin: null, bathsMin: null, sqftMin: null,
    areas: "West Feliciana, East Feliciana, Pointe Coupee, Iberville",
    propertyTypes: "land",
  },
];

function BuyerArchetypeEmpty({
  onCreated,
  onCreateCustom,
}: {
  onCreated: (search: BuyerSearch) => void;
  onCreateCustom: () => void;
}) {
  const [installing, setInstalling] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function install(arch: BuyerArchetype) {
    setInstalling(arch.name);
    try {
      const res = await fetch("/api/buyers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(arch),
      });
      if (res.ok) {
        const search = await res.json();
        setToast(`Created "${arch.name}"`);
        setTimeout(() => setToast(null), 2000);
        onCreated(search);
      } else {
        setToast("Create failed");
        setTimeout(() => setToast(null), 2000);
      }
    } finally {
      setInstalling(null);
    }
  }

  return (
    <div className="card-light" style={{ padding: "24px" }}>
      <div style={{ marginBottom: "16px" }}>
        <p style={{ fontSize: "10px", letterSpacing: "0.20em", color: "var(--aire-muted)", marginBottom: "8px" }}>
          START WITH AN ARCHETYPE
        </p>
        <p style={{ fontSize: "12px", color: "var(--aire-text-2)", lineHeight: 1.5 }}>
          Click any archetype below to spin up a search instantly. Edit price, beds, areas after.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {BUYER_ARCHETYPES.map(arch => {
          const isInstalling = installing === arch.name;
          return (
            <div
              key={arch.name}
              style={{
                background: "var(--aire-card-warm)",
                border: "1px solid var(--aire-border)",
                borderRadius: "10px",
                padding: "14px 16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: "180px" }}>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--aire-ink)", marginBottom: "4px" }}>
                  {arch.name}
                </p>
                <p style={{ fontSize: "11px", color: "var(--aire-text-2)", lineHeight: 1.5 }}>
                  {arch.description}
                </p>
              </div>
              <button
                onClick={() => install(arch)}
                disabled={isInstalling}
                className={isInstalling ? "btn-ghost" : "btn-coral"}
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.14em",
                  padding: "8px 14px",
                  cursor: isInstalling ? "wait" : "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {isInstalling ? "..." : "+ CREATE"}
              </button>
            </div>
          );
        })}

        <button
          onClick={onCreateCustom}
          style={{
            marginTop: "8px",
            fontSize: "11px",
            letterSpacing: "0.14em",
            padding: "12px",
            background: "transparent",
            color: "var(--aire-text-2)",
            border: "1px dashed var(--aire-border-2)",
            borderRadius: "10px",
            cursor: "pointer",
            width: "100%",
            fontWeight: 600,
          }}
        >
          OR BUILD A CUSTOM SEARCH →
        </button>
      </div>

      {toast && (
        <div className="card-light" style={{
          position: "fixed",
          bottom: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          padding: "12px 22px",
          fontSize: "12px",
          letterSpacing: "0.06em",
          zIndex: 200,
          color: "var(--aire-ink)",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
