"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ContactResult {
  id: string;
  name: string;
  phone: string | null;
  stage: string;
  lastContactDate: string | null;
}

const NAV_SHORTCUTS = [
  { label: "Dashboard", href: "/", keys: "G D" },
  { label: "Pipeline", href: "/pipeline", keys: "G P" },
  { label: "Contacts", href: "/contacts", keys: "G C" },
  { label: "LinkedIn Queue", href: "/linkedin", keys: "G L" },
  { label: "Post Studio", href: "/create-post", keys: "G S" },
  { label: "Social", href: "/social", keys: "" },
  { label: "Settings", href: "/settings", keys: "" },
  { label: "System Health", href: "/system", keys: "" },
];

const STAGE_COLOR: Record<string, string> = {
  new_lead: "var(--aire-muted)",
  active: "var(--status-active)",
  showing: "var(--aire-cream)",
  under_contract: "var(--status-urgent)",
  closed: "var(--aire-muted)",
};

function daysSince(d: string | null) {
  if (!d) return null;
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  return days;
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [contacts, setContacts] = useState<ContactResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Open on Cmd+K / Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(v => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQ("");
      setContacts([]);
      setSelected(0);
    }
  }, [open]);

  // Debounced contact search
  useEffect(() => {
    if (!q.trim()) { setContacts([]); setLoading(false); return; }
    setLoading(true);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/contacts?q=${encodeURIComponent(q)}&limit=6`);
        const data = await res.json();
        setContacts(data.leads ?? data ?? []);
      } catch {
        setContacts([]);
      } finally {
        setLoading(false);
      }
    }, 200);
  }, [q]);

  const allItems = q.trim()
    ? contacts.map(c => ({ type: "contact" as const, contact: c }))
    : NAV_SHORTCUTS.map(n => ({ type: "nav" as const, nav: n }));

  const navigate = useCallback((href: string) => {
    router.push(href);
    setOpen(false);
  }, [router]);

  function sendToAire(query: string) {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("aire:chat-query", { detail: { text: query } }));
  }

  const showAireOption = q.trim().length > 2 && !loading;
  const totalItems = allItems.length + (showAireOption ? 1 : 0);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected(s => Math.min(s + 1, totalItems - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected(s => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // If AIRE option is selected (last item) or no contacts found, send to AIRE
      if (selected === allItems.length && showAireOption) {
        sendToAire(q);
        return;
      }
      if (q.trim() && contacts.length === 0 && !loading) {
        sendToAire(q);
        return;
      }
      const item = allItems[selected];
      if (!item) return;
      if (item.type === "contact") navigate(`/contacts?selected=${item.contact.id}`);
      if (item.type === "nav") navigate(item.nav.href);
    }
  }

  if (!open) return null;

  return (
    <div className="cmd-backdrop" onClick={() => setOpen(false)}>
      <div className="cmd-panel" onClick={e => e.stopPropagation()}>
        {/* Search input */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "14px 16px",
          borderBottom: "1px solid var(--aire-border)",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="var(--aire-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => { setQ(e.target.value); setSelected(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search contacts, jump to page, or ask AIRE anything…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: "15px",
              color: "var(--aire-text)",
              fontFamily: "inherit",
            }}
          />
          <span style={{
            fontSize: "10px",
            color: "var(--aire-muted)",
            background: "var(--aire-card)",
            border: "1px solid var(--aire-border)",
            borderRadius: "5px",
            padding: "2px 6px",
            letterSpacing: "0.06em",
            flexShrink: 0,
          }}>ESC</span>
        </div>

        {/* Results */}
        <div style={{ maxHeight: "360px", overflowY: "auto" }}>
          {!q.trim() && (
            <div style={{ padding: "8px 16px 4px", fontSize: "10px", letterSpacing: "0.14em", color: "var(--aire-muted)", fontWeight: 500 }}>
              JUMP TO
            </div>
          )}
          {q.trim() && loading && (
            <div style={{ padding: "16px", fontSize: "13px", color: "var(--aire-muted)", textAlign: "center" }}>
              Searching…
            </div>
          )}
          {q.trim() && !loading && contacts.length === 0 && (
            <div style={{ padding: "12px 16px 4px", fontSize: "12px", color: "var(--aire-muted)", textAlign: "center" }}>
              No contacts found — press ↵ to ask AIRE
            </div>
          )}

          {allItems.map((item, i) => {
            const isSelected = i === selected;
            if (item.type === "nav") {
              return (
                <div
                  key={item.nav.href}
                  onClick={() => navigate(item.nav.href)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 16px",
                    cursor: "pointer",
                    background: isSelected ? "var(--aire-card)" : "transparent",
                    borderLeft: isSelected ? "2px solid var(--aire-coral)" : "2px solid transparent",
                    transition: "background 100ms",
                  }}
                  onMouseEnter={() => setSelected(i)}
                >
                  <span style={{ fontSize: "14px", color: "var(--aire-text)" }}>{item.nav.label}</span>
                  {item.nav.keys && (
                    <span style={{ fontSize: "10px", color: "var(--aire-muted)", letterSpacing: "0.08em" }}>
                      {item.nav.keys}
                    </span>
                  )}
                </div>
              );
            }
            // Contact result
            const c = item.contact;
            const days = daysSince(c.lastContactDate);
            const stageColor = STAGE_COLOR[c.stage] ?? "var(--aire-muted)";
            return (
              <div
                key={c.id}
                onClick={() => navigate(`/contacts?selected=${c.id}`)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  cursor: "pointer",
                  background: isSelected ? "var(--aire-card)" : "transparent",
                  borderLeft: isSelected ? "2px solid var(--aire-coral)" : "2px solid transparent",
                  transition: "background 100ms",
                  gap: "12px",
                }}
                onMouseEnter={() => setSelected(i)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "14px", color: "var(--aire-text)", fontWeight: 500, margin: 0 }}>
                    {c.name}
                  </p>
                  {c.phone && (
                    <p style={{ fontSize: "12px", color: "var(--aire-muted)", margin: "2px 0 0 0" }}>
                      {c.phone}
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px", flexShrink: 0 }}>
                  <span style={{ fontSize: "10px", letterSpacing: "0.10em", color: stageColor, fontWeight: 600 }}>
                    {c.stage.replace(/_/g, " ").toUpperCase()}
                  </span>
                  {days !== null && (
                    <span style={{ fontSize: "10px", color: "var(--aire-muted)" }}>
                      {days === 0 ? "today" : `${days}d ago`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Ask AIRE row — always shown when there's a query */}
          {showAireOption && (
            <div
              onClick={() => sendToAire(q)}
              onMouseEnter={() => setSelected(allItems.length)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "11px 16px",
                cursor: "pointer",
                background: selected === allItems.length ? "rgba(238,129,114,0.08)" : "transparent",
                borderLeft: selected === allItems.length ? "2px solid #EE8172" : "2px solid transparent",
                borderTop: "1px solid var(--aire-border)",
                transition: "background 100ms",
              }}
            >
              <span style={{
                fontSize: "13px",
                color: "#EE8172",
                fontWeight: 600,
                flexShrink: 0,
              }}>✦</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: "13px", color: "var(--aire-text)" }}>Ask AIRE: </span>
                <span style={{ fontSize: "13px", color: "var(--aire-muted)", fontStyle: "italic" }}>&ldquo;{q}&rdquo;</span>
              </div>
              <span style={{ fontSize: "10px", color: "var(--aire-muted)", background: "var(--aire-card)", border: "1px solid var(--aire-border)", borderRadius: "5px", padding: "2px 6px", flexShrink: 0 }}>↵</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "10px 16px",
          borderTop: "1px solid var(--aire-border)",
          display: "flex",
          gap: "16px",
          alignItems: "center",
        }}>
          <span style={{ fontSize: "10px", color: "var(--aire-muted)", letterSpacing: "0.06em" }}>↑↓ navigate</span>
          <span style={{ fontSize: "10px", color: "var(--aire-muted)", letterSpacing: "0.06em" }}>↵ open</span>
          <span style={{ fontSize: "10px", color: "var(--aire-muted)", letterSpacing: "0.06em" }}>esc close</span>
        </div>
      </div>
    </div>
  );
}
