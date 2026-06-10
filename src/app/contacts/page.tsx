"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { UserPlus, Search } from "lucide-react";
import ContactQuickPanel from "@/components/ContactQuickPanel";

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  stage: string;
  lastContactDate: string | null;
  nextActionNote: string | null;
  tasks: { id: string; done: boolean }[];
}

const STAGE_LABELS: Record<string, string> = {
  new_lead: "New lead", active: "Active", showing: "Showing",
  under_contract: "Under contract", closed: "Closed",
};

const STAGE_BASE: Record<string, number> = {
  new_lead: 55, active: 75, showing: 83, under_contract: 90, closed: 100,
};

function daysOf(date: string | null): number {
  return date ? Math.floor((Date.now() - new Date(date).getTime()) / 86400000) : 30;
}

// Derived lead score (no score column in DB): stage base, decayed by contact recency
function leadScore(lead: Lead): number {
  const base = STAGE_BASE[lead.stage] ?? 55;
  return Math.max(20, Math.min(100, Math.round(base - Math.min(daysOf(lead.lastContactDate), 40) * 0.8)));
}

function scoreColor(s: number): string {
  return s >= 80 ? "var(--aire-mint)" : s >= 50 ? "var(--cream)" : "var(--coral)";
}

function initials(name: string): string {
  return name.split(" ").map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase();
}

function daysBadge(date: string | null) {
  if (!date) return "—";
  const d = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "1d ago";
  return `${d}d ago`;
}

// Smart filter chips (match Contacts.html)
const SMART_FILTERS = [
  { id: "all", label: "All", filter: (_l: Lead) => true },
  { id: "followup_today", label: "Follow up today", filter: (l: Lead) =>
    daysOf(l.lastContactDate) >= 3 && daysOf(l.lastContactDate) < 7 && l.stage !== "closed" },
  { id: "overdue", label: "Overdue", filter: (l: Lead) =>
    daysOf(l.lastContactDate) >= 5 && l.stage !== "closed" },
  { id: "no_contact_7", label: "No contact 7+ days", filter: (l: Lead) =>
    daysOf(l.lastContactDate) >= 7 && l.stage !== "closed" },
];

function ContactsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [smartFilter, setSmartFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPrice, setNewPrice] = useState("");

  // Selected contact for right panel
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("selected") ?? null
  );

  // Sync ?selected= param to state
  useEffect(() => {
    const sel = searchParams.get("selected");
    if (sel) setSelectedId(sel);
  }, [searchParams]);

  const searchRef = useRef<HTMLInputElement>(null);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [q, stage]);

  // Fetch leads
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (stage) params.set("stage", stage);
    params.set("page", String(page));
    fetch(`/api/contacts?${params}`)
      .then(r => r.json())
      .then(data => {
        setLeads(data.leads ?? data);
        setTotal(data.total ?? data.length ?? 0);
        setPages(data.pages ?? 1);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [q, stage, page]);

  function selectLead(id: string) {
    setSelectedId(id);
    router.replace(`/contacts?selected=${id}`, { scroll: false });
  }

  // Cmd+F focuses the search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const visible = leads.filter(lead => {
    if (!smartFilter || smartFilter === "all") return true;
    const sf = SMART_FILTERS.find(f => f.id === smartFilter);
    return sf ? sf.filter(lead) : true;
  });

  return (
    <div className="cx-shell">

      {/* ── LEFT PANEL — contact list ── */}
      <section className="cx-list">
        <div className="cx-lhead">
          <div className="r1">
            <h1>Contacts</h1>
            <button className="cx-addc" onClick={() => setAddModalOpen(true)}>
              <UserPlus /> Add
            </button>
          </div>
          <div className="cx-search">
            <Search />
            <input
              ref={searchRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={`Search ${total ? total.toLocaleString() : ""} contacts… (Lofty synced)`}
            />
          </div>
        </div>

        <div className="cx-chips">
          {SMART_FILTERS.map(sf => {
            const on = (sf.id === "all" && !smartFilter) || smartFilter === sf.id;
            return (
              <button
                key={sf.id}
                className={`cx-chip${on ? " on" : ""}`}
                onClick={() => setSmartFilter(sf.id === "all" ? null : sf.id)}
              >
                {sf.label}
              </button>
            );
          })}
        </div>

        <div className="cx-lscroll">
          {loading && (
            <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {[...Array(8)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: "52px", borderRadius: "11px" }} />
              ))}
            </div>
          )}

          {!loading && visible.length === 0 && (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--white-40)", fontSize: "13px" }}>
              {q ? `No results for "${q}"` : "No contacts yet."}
            </div>
          )}

          {!loading && visible.map(lead => {
            const isSelected = selectedId === lead.id;
            const score = leadScore(lead);
            const color = scoreColor(score);
            return (
              <div
                key={lead.id}
                className={`cx-li${isSelected ? " on" : ""}`}
                onClick={() => selectLead(lead.id)}
              >
                <div
                  className="cx-av"
                  style={{ background: `linear-gradient(135deg, ${color}, rgba(255,255,255,.22))` }}
                >
                  {initials(lead.name)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="nm" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {lead.name}
                  </div>
                  <div className="meta">{STAGE_LABELS[lead.stage] ?? lead.stage}</div>
                </div>
                <div className="right">
                  <div className="sc" style={{ color }}>{score}</div>
                  <div className="ago">{daysBadge(lead.lastContactDate)}</div>
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {pages > 1 && (
            <div style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--aire-glass-line)" }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                style={{ fontSize: "11px", color: page === 0 ? "var(--white-40)" : "var(--white-70)", background: "none", border: "none", cursor: page === 0 ? "not-allowed" : "pointer" }}>
                ← Prev
              </button>
              <span style={{ fontSize: "11px", color: "var(--white-40)" }}>{page + 1} / {pages}</span>
              <button onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}
                style={{ fontSize: "11px", color: page >= pages - 1 ? "var(--white-40)" : "var(--white-70)", background: "none", border: "none", cursor: page >= pages - 1 ? "not-allowed" : "pointer" }}>
                Next →
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── RIGHT PANEL — contact detail ── */}
      <div className="cx-detail">
        {selectedId ? (
          <ContactQuickPanel id={selectedId} />
        ) : (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", gap: "12px",
          }}>
            <div style={{
              width: "48px", height: "48px", borderRadius: "12px",
              background: "var(--aire-card)", border: "1px solid var(--aire-border)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="var(--aire-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <p style={{ fontSize: "13px", color: "var(--aire-muted)" }}>Select a contact</p>
            <p style={{ fontSize: "11px", color: "var(--aire-muted)", opacity: 0.6 }}>or press ⌘K to search</p>
            <button onClick={() => setAddModalOpen(true)} className="btn-coral" style={{ fontSize: "11px", letterSpacing: "0.12em", marginTop: "8px" }}>
              + NEW CONTACT
            </button>
          </div>
        )}
      </div>

      {/* ── ADD CONTACT MODAL ── */}
      {addModalOpen && (
        <div
          onClick={() => setAddModalOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(17,24,39,0.35)",
            backdropFilter: "blur(6px)", zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center", padding: "16px",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--aire-card-warm)", border: "1px solid var(--aire-border-2)",
              borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "420px",
              boxShadow: "var(--shadow-float-hover)",
              animation: "scale-in 180ms var(--ease-out-expo) both",
            }}
          >
            <p style={{ fontSize: "10px", letterSpacing: "0.20em", color: "var(--aire-muted)", marginBottom: "18px", fontWeight: 600 }}>
              NEW CONTACT
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <input
                className="aire-input" placeholder="Full name *" value={newName}
                onChange={e => setNewName(e.target.value)} style={{ width: "100%" }}
              />
              <input
                className="aire-input" placeholder="Phone" value={newPhone}
                onChange={e => setNewPhone(e.target.value)} style={{ width: "100%" }}
              />
              <input
                className="aire-input" placeholder="Email" value={newEmail}
                onChange={e => setNewEmail(e.target.value)} style={{ width: "100%" }}
              />
              <input
                className="aire-input" placeholder="Price point (e.g. 650000)" type="number"
                value={newPrice} onChange={e => setNewPrice(e.target.value)} style={{ width: "100%" }}
              />
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "18px" }}>
              <button
                className="btn-coral"
                style={{ fontSize: "11px", letterSpacing: "0.12em" }}
                onClick={async () => {
                  if (!newName.trim()) return;
                  const res = await fetch("/api/contacts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: newName.trim(),
                      phone: newPhone || null,
                      email: newEmail || null,
                      pricePoint: newPrice ? parseFloat(newPrice) : null,
                      stage: "new_lead",
                    }),
                  });
                  const created = await res.json();
                  setLeads(prev => [created, ...prev]);
                  selectLead(created.id);
                  setAddModalOpen(false);
                  setNewName(""); setNewPhone(""); setNewEmail(""); setNewPrice("");
                }}
              >
                SAVE CONTACT
              </button>
              <button className="btn-ghost" style={{ fontSize: "11px", letterSpacing: "0.12em" }} onClick={() => setAddModalOpen(false)}>
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Contacts() {
  return (
    <Suspense>
      <ContactsInner />
    </Suspense>
  );
}
