"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ─── Types ─────────────────────────────────────────────────────────────────
interface Person {
  id: string;
  source: "lead" | "facebook" | "instagram" | "contacts";
  name: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  stage: string | null;
  type: string | null;
  instagramHandle: string | null;
  facebookUrl: string | null;
  linkedinUrl: string | null;
  preferredPlatform: string | null;
  lastContactDate: string | null;
}

interface DupePair {
  a: { id: string; name: string; source: string };
  b: { id: string; name: string; source: string };
  score: number;
  reason: string;
}

interface Payload {
  total: number;
  leads: number;
  imported: number;
  people: Person[];
  duplicates: DupePair[];
}

interface ImportResult {
  source: string;
  parsed: number;
  inserted: number;
  matches: unknown[];
}

// ─── Constants ─────────────────────────────────────────────────────────────
const SOURCE_COLOR: Record<string, string> = {
  lead: "var(--reve-coral, #EE8172)",
  facebook: "#1877F2",
  instagram: "#E1306C",
  contacts: "var(--reve-cream, #EFDD84)",
};

const SOURCE_LABEL: Record<string, string> = {
  lead: "CRM",
  facebook: "FB",
  instagram: "IG",
  contacts: "Contacts",
};

const PLATFORM_ICON: Record<string, string> = {
  imessage: "💬", facebook: "📘", instagram: "📸",
  snapchat: "👻", linkedin: "💼",
};

function initials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
}

function daysSince(d: string | null) {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

// ─── Avatar chip ────────────────────────────────────────────────────────────
function Avatar({ person, size = 56 }: { person: Person; size?: number }) {
  const bg = SOURCE_COLOR[person.source] ?? "#888";
  const fontSize = size * 0.33;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: bg, display: "flex", alignItems: "center", justifyContent: "center",
      fontSize, fontWeight: 700, color: "#09090B", flexShrink: 0, position: "relative",
    }}>
      {initials(person.name)}
      {/* source badge */}
      <span style={{
        position: "absolute", bottom: -2, right: -2,
        background: "#09090B", border: `1px solid ${bg}`,
        borderRadius: 4, fontSize: 9, padding: "1px 3px", fontWeight: 600,
        color: bg, lineHeight: 1.3,
      }}>
        {SOURCE_LABEL[person.source]}
      </span>
    </div>
  );
}

// ─── Person card ────────────────────────────────────────────────────────────
function PersonCard({ person, onTouch }: { person: Person; onTouch: (id: string, platform: string) => void }) {
  const days = daysSince(person.lastContactDate);
  const platforms = [
    person.instagramHandle && "instagram",
    person.facebookUrl && "facebook",
    person.linkedinUrl && "linkedin",
    person.phone && "imessage",
  ].filter(Boolean) as string[];

  return (
    <div className="glass-card" style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <Avatar person={person} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {person.source === "lead" ? (
            <Link href={`/contacts/${person.id}`} style={{ fontWeight: 600, fontSize: 14, textDecoration: "none", color: "inherit", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {person.name}
            </Link>
          ) : (
            <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{person.name}</div>
          )}
          {person.stage && (
            <div style={{ fontSize: 11, color: "var(--text-dim, #9ca3af)", marginTop: 1 }}>
              {person.stage.replace(/_/g, " ")} · {person.type}
            </div>
          )}
          {days !== null && (
            <div style={{ fontSize: 11, color: days > 30 ? "var(--reve-coral, #EE8172)" : "var(--text-dim, #9ca3af)", marginTop: 1 }}>
              {days === 0 ? "touched today" : `${days}d ago`}
            </div>
          )}
        </div>
      </div>

      {/* Platform badges */}
      {platforms.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {platforms.map((p) => (
            <button
              key={p}
              className="btn-ghost"
              style={{ padding: "2px 7px", fontSize: 11, borderRadius: 99 }}
              title={`Log touch on ${p}`}
              onClick={() => onTouch(person.id, p)}
            >
              {PLATFORM_ICON[p]} {p}
            </button>
          ))}
        </div>
      )}

      {(person.phone || person.email) && (
        <div style={{ fontSize: 11, color: "var(--text-dim, #9ca3af)", display: "flex", flexDirection: "column", gap: 2 }}>
          {person.phone && <span>📞 {person.phone}</span>}
          {person.email && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>✉ {person.email}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Import drawer ───────────────────────────────────────────────────────────
function ImportDrawer({ onImported }: { onImported: (r: ImportResult) => void }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const detect = (name: string, content: string): string => {
    if (name.endsWith(".vcf")) return "vcf";
    if (name.includes("followers") || name.includes("following")) return "instagram_json";
    if (name.includes("friends") || (content.includes("friends_v2") || content.includes("<html"))) {
      return content.includes("<html") ? "facebook_html" : "facebook_json";
    }
    if (content.startsWith("BEGIN:VCARD")) return "vcf";
    try { JSON.parse(content); return "instagram_json"; } catch { return "vcf"; }
  };

  const handleFile = async (file: File) => {
    setLoading(true); setError(null); setResult(null);
    const content = await file.text();
    const format = detect(file.name, content.slice(0, 200));
    const res = await fetch("/api/people/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, format }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error); return; }
    setResult(data);
    onImported(data);
  };

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
        + Import
      </button>

      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setOpen(false)}>
          <div className="glass-card" style={{ width: 480, padding: 28 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Import People</h2>
            <p style={{ fontSize: 13, color: "var(--text-dim, #9ca3af)", marginBottom: 20, lineHeight: 1.6 }}>
              Drop any of these files and AIRE matches them to your CRM automatically:
            </p>
            <ul style={{ fontSize: 12, color: "var(--text-dim, #9ca3af)", marginBottom: 20, lineHeight: 2, paddingLeft: 16 }}>
              <li><strong style={{ color: "inherit" }}>Facebook:</strong> <em>friends.json</em> or <em>friends.html</em> from <a href="https://www.facebook.com/dyi" target="_blank" rel="noreferrer" style={{ color: "var(--reve-coral, #EE8172)" }}>facebook.com/dyi</a> → Your Information → Friends</li>
              <li><strong style={{ color: "inherit" }}>Instagram:</strong> <em>followers.json</em> or <em>following.json</em> from Instagram Settings → Your Activity → Download Your Information</li>
              <li><strong style={{ color: "inherit" }}>Phone Contacts:</strong> Export all contacts as <em>.vcf</em> from the Contacts app (File → Export → Export vCard)</li>
            </ul>

            <div
              style={{ border: "2px dashed rgba(255,255,255,0.15)", borderRadius: 12, padding: 32, textAlign: "center", cursor: "pointer" }}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              {loading ? "Importing…" : "Click or drop file here"}
              <input ref={fileRef} type="file" accept=".json,.html,.vcf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>

            {error && <p style={{ color: "var(--reve-coral, #EE8172)", marginTop: 12, fontSize: 13 }}>{error}</p>}

            {result && (
              <div style={{ marginTop: 16, padding: 14, background: "rgba(255,255,255,0.05)", borderRadius: 8, fontSize: 13 }}>
                <div>✓ Parsed <strong>{result.parsed}</strong> from {result.source}</div>
                <div>Saved <strong>{result.inserted}</strong> new • <strong>{Array.isArray(result.matches) ? result.matches.length : 0}</strong> CRM matches found</div>
              </div>
            )}

            <button className="btn-ghost" style={{ marginTop: 16, width: "100%" }} onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Dedup panel ─────────────────────────────────────────────────────────────
function DedupPanel({ dupes, onMerged }: { dupes: DupePair[]; onMerged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  if (!dupes.length) return null;

  const visible = dupes.filter((d) => !dismissed.has(`${d.a.id}:${d.b.id}`));
  if (!visible.length) return null;

  const merge = async (keep: DupePair["a"], other: DupePair["a"]) => {
    setBusy(`${keep.id}:${other.id}`);
    // If one is a lead and other is social person — link; if both leads — merge
    if (keep.source === "lead" && other.source !== "lead") {
      await fetch("/api/people/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ socialPersonId: other.id, leadId: keep.id, platform: other.source }) });
    } else if (keep.source === "lead" && other.source === "lead") {
      await fetch("/api/people/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keepLeadId: keep.id, mergeLeadId: other.id }) });
    }
    setBusy(null);
    setDismissed((s) => new Set([...s, `${keep.id}:${other.id}`]));
    onMerged();
  };

  return (
    <div className="glass-card" style={{ padding: 20, marginBottom: 24 }}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>
        ⚠️ {visible.length} possible duplicate{visible.length > 1 ? "s" : ""}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {visible.slice(0, 8).map((d) => {
          const key = `${d.a.id}:${d.b.id}`;
          const isBusy = busy === key || busy === `${d.b.id}:${d.a.id}`;
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <span style={{ flex: 1 }}>
                <strong>{d.a.name}</strong> <span style={{ color: "var(--text-dim, #9ca3af)", fontSize: 11 }}>({SOURCE_LABEL[d.a.source]})</span>
                {" = "}
                <strong>{d.b.name}</strong> <span style={{ color: "var(--text-dim, #9ca3af)", fontSize: 11 }}>({SOURCE_LABEL[d.b.source]})</span>
                <span style={{ marginLeft: 8, color: "var(--text-dim, #9ca3af)", fontSize: 11 }}>{d.reason}</span>
              </span>
              <button className="btn-primary" style={{ padding: "3px 10px", fontSize: 11 }} disabled={isBusy} onClick={() => merge(d.a, d.b)}>
                {isBusy ? "…" : "Merge"}
              </button>
              <button className="btn-ghost" style={{ padding: "3px 10px", fontSize: 11 }} onClick={() => setDismissed((s) => new Set([...s, key]))}>
                Dismiss
              </button>
            </div>
          );
        })}
        {visible.length > 8 && <div style={{ fontSize: 12, color: "var(--text-dim, #9ca3af)" }}>+{visible.length - 8} more…</div>}
      </div>
    </div>
  );
}

const PAGE_SIZE = 60;

// ─── Main page ───────────────────────────────────────────────────────────────
export default function PeoplePage() {
  const [data, setData] = useState<Payload | null>(null);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [dedupLoading, setDedupLoading] = useState(false);

  const load = useCallback(async () => {
    // Fast load — people grid only, no dedup
    const r = await fetch("/api/people");
    const payload = await r.json();
    setData(payload);
    setPage(1);
    // Lazy: run dedup in the background after paint
    setDedupLoading(true);
    fetch("/api/people?dedup=1")
      .then((res) => res.json())
      .then((full) => setData((prev) => prev ? { ...prev, duplicates: full.duplicates } : prev))
      .finally(() => setDedupLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const logTouch = useCallback(async (id: string, platform: string) => {
    await fetch("/api/touches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: id, platform, direction: "outbound" }),
    });
  }, []);

  if (!data) {
    return (
      <main style={{ padding: "32px 32px 64px 80px" }}>
        <div className="skeleton" style={{ height: 60, marginBottom: 16 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 130 }} />)}
        </div>
      </main>
    );
  }

  const q = search.toLowerCase();
  const filtered = data.people.filter((p) => {
    if (sourceFilter !== "all" && p.source !== sourceFilter) return false;
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.phone ?? "").includes(q) ||
      (p.email ?? "").toLowerCase().includes(q) ||
      (p.instagramHandle ?? "").toLowerCase().includes(q)
    );
  });
  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < filtered.length;

  const sources = ["all", "lead", "facebook", "instagram", "contacts"] as const;

  return (
    <main style={{ padding: "32px 32px 64px 80px", maxWidth: 1440, margin: "0 auto" }}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>People</h1>
          <span style={{ fontSize: 13, color: "var(--text-dim, #9ca3af)" }}>
            {data.total.toLocaleString()} total · {data.leads} CRM · {data.imported} imported
          </span>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-dim, #9ca3af)", marginTop: 4 }}>
          Everyone across your CRM, Facebook, Instagram, and phone contacts — in one place.
        </p>

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="aire-input"
            placeholder="Search by name, phone, email, @handle…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ width: 280 }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            {sources.map((s) => (
              <button
                key={s}
                className={sourceFilter === s ? "btn-primary" : "btn-ghost"}
                style={{ padding: "5px 12px", fontSize: 12, borderRadius: 99, ...(s !== "all" ? { borderBottom: `2px solid ${SOURCE_COLOR[s] ?? "transparent"}` } : {}) }}
                onClick={() => { setSourceFilter(s); setPage(1); }}
              >
                {s === "all" ? "All" : SOURCE_LABEL[s]}
                {s !== "all" && (
                  <span style={{ marginLeft: 4, opacity: 0.7 }}>
                    {data.people.filter((p) => p.source === s).length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: "auto" }}>
            <ImportDrawer onImported={load} />
          </div>
        </div>
      </header>

      {dedupLoading && (
        <div style={{ fontSize: 12, color: "var(--text-dim, #9ca3af)", marginBottom: 12 }}>
          🔍 Scanning for duplicates…
        </div>
      )}
      <DedupPanel dupes={data.duplicates} onMerged={load} />

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
        gap: 12,
      }}>
        {visible.map((p) => (
          <PersonCard key={p.id} person={p} onTouch={logTouch} />
        ))}
      </div>

      {hasMore && (
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <button className="btn-ghost" style={{ padding: "10px 32px" }} onClick={() => setPage((n) => n + 1)}>
            Load more ({filtered.length - visible.length} remaining)
          </button>
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 64, color: "var(--text-dim, #9ca3af)" }}>
          {search ? `No matches for "${search}"` : "No people in this source yet — import to get started."}
        </div>
      )}
    </main>
  );
}
