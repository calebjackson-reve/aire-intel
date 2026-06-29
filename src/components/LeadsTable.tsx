"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronUp, ChevronDown, Phone, ChevronsUpDown } from "lucide-react";

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  stage: string;
  lastContactDate: string | null;
  nextActionNote: string | null;
  tasks?: { id: string; done: boolean }[];
  photoUrl?: string | null;
}

const STAGES: Record<string, string> = {
  new_lead: "New Lead",
  active: "Active",
  showing: "Showing",
  under_contract: "Under Contract",
  closed: "Closed",
};

const STAGE_BASE: Record<string, number> = {
  new_lead: 55, active: 75, showing: 83, under_contract: 90, closed: 100,
};

function daysAgo(date: string | null): number {
  return date ? Math.floor((Date.now() - new Date(date).getTime()) / 86400000) : 30;
}
function relativeDate(date: string | null): string {
  if (!date) return "—";
  const d = daysAgo(date);
  if (d === 0) return "Today";
  if (d === 1) return "1d ago";
  if (d < 30) return `${d}d ago`;
  const m = Math.floor(d / 30);
  return `${m}mo ago`;
}
function leadScore(l: Lead): number {
  return Math.max(20, Math.min(100, Math.round((STAGE_BASE[l.stage] ?? 55) - Math.min(daysAgo(l.lastContactDate), 40) * 0.8)));
}
function scoreMeta(s: number): { color: string; label: string } {
  if (s >= 80) return { color: "#3E9C77", label: "Hot" };
  if (s >= 60) return { color: "#FB7A01", label: "Warm" };
  return { color: "#8990A0", label: "Cold" };
}
function scoreTrend(l: Lead): "up" | "down" | "flat" {
  const d = daysAgo(l.lastContactDate);
  if (d < 5) return "up";
  if (d > 14) return "down";
  return "flat";
}
function initials(name: string): string {
  return name.split(" ").map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase();
}

type SortKey = "score" | "name" | "lastContact" | "stage";
type SortDir = "asc" | "desc";

interface Props {
  leads: Lead[];
  total: number;
  onStageChange?: (id: string, stage: string) => void;
  onBulkAction?: (ids: string[], action: string) => void;
}

export default function LeadsTable({ leads, total, onStageChange, onBulkAction }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [stageFilter, setStageFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Stage counts for filter pills
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: leads.length };
    leads.forEach(l => { counts[l.stage] = (counts[l.stage] ?? 0) + 1; });
    return counts;
  }, [leads]);

  // Filter + sort
  const rows = useMemo(() => {
    const filtered = stageFilter === "all" ? leads : leads.filter(l => l.stage === stageFilter);
    return [...filtered].sort((a, b) => {
      let va: number | string, vb: number | string;
      if (sortKey === "score")       { va = leadScore(a); vb = leadScore(b); }
      else if (sortKey === "name")   { va = a.name; vb = b.name; }
      else if (sortKey === "lastContact") { va = daysAgo(a.lastContactDate); vb = daysAgo(b.lastContactDate); }
      else                           { va = a.stage; vb = b.stage; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [leads, stageFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.id)));
  }
  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronsUpDown size={13} style={{ opacity: 0.3 }} />;
    return sortDir === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />;
  }

  return (
    <div className="leads-table-wrap">
      {/* Stage filter pills */}
      <div className="lt-pills">
        <button
          className={`lt-pill${stageFilter === "all" ? " on" : ""}`}
          onClick={() => setStageFilter("all")}
        >
          All <span className="lt-pill-count">{total}</span>
        </button>
        {Object.entries(STAGES).map(([key, label]) => (
          <button
            key={key}
            className={`lt-pill${stageFilter === key ? " on" : ""}`}
            onClick={() => setStageFilter(key)}
          >
            {label}
            {stageCounts[key] ? <span className="lt-pill-count">{stageCounts[key]}</span> : null}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="lt-bulk-bar">
          <span className="lt-bulk-count">{selected.size} selected</span>
          <button className="lt-bulk-btn" onClick={() => onBulkAction?.([...selected], "smart-plan")}>+ Smart Plan</button>
          <button className="lt-bulk-btn" onClick={() => onBulkAction?.([...selected], "stage")}>Set Stage</button>
          <button className="lt-bulk-btn lt-bulk-clear" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="lt-scroll">
        <table className="lt-table">
          <thead>
            <tr>
              <th className="lt-th lt-th-check">
                <input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} />
              </th>
              <th className="lt-th lt-th-name">
                <button className="lt-sort-btn" onClick={() => toggleSort("name")}>
                  Name <SortIcon k="name" />
                </button>
              </th>
              <th className="lt-th lt-th-score">
                <button className="lt-sort-btn" onClick={() => toggleSort("score")}>
                  Score <SortIcon k="score" />
                </button>
              </th>
              <th className="lt-th lt-th-contact">
                <button className="lt-sort-btn" onClick={() => toggleSort("lastContact")}>
                  Last Contact <SortIcon k="lastContact" />
                </button>
              </th>
              <th className="lt-th lt-th-stage">
                <button className="lt-sort-btn" onClick={() => toggleSort("stage")}>
                  Stage <SortIcon k="stage" />
                </button>
              </th>
              <th className="lt-th lt-th-phone">Phone</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(lead => {
              const score = leadScore(lead);
              const { color, label } = scoreMeta(score);
              const trend = scoreTrend(lead);
              const isSelected = selected.has(lead.id);
              return (
                <tr key={lead.id} className={`lt-row${isSelected ? " selected" : ""}`}>
                  <td className="lt-td lt-td-check">
                    <input type="checkbox" checked={isSelected} onChange={() => toggleRow(lead.id)} />
                  </td>
                  <td className="lt-td lt-td-name">
                    <Link href={`/contacts/${lead.id}`} className="lt-name-link">
                      <span className="lt-avatar">{initials(lead.name)}</span>
                      <span className="lt-name-text">{lead.name}</span>
                    </Link>
                  </td>
                  <td className="lt-td lt-td-score">
                    <div className="lt-score-wrap">
                      <span className="lt-score-num" style={{ color }}>{score}</span>
                      {trend === "up" && <ChevronUp size={13} style={{ color: "#3E9C77" }} />}
                      {trend === "down" && <ChevronDown size={13} style={{ color: "#E2645C" }} />}
                      <span className="lt-score-tag" style={{ background: `${color}18`, color }}>{label}</span>
                    </div>
                  </td>
                  <td className="lt-td lt-td-contact">
                    <span className="lt-date">{relativeDate(lead.lastContactDate)}</span>
                  </td>
                  <td className="lt-td lt-td-stage">
                    <select
                      className="lt-stage-sel"
                      value={lead.stage}
                      onChange={e => onStageChange?.(lead.id, e.target.value)}
                    >
                      {Object.entries(STAGES).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </td>
                  <td className="lt-td lt-td-phone">
                    {lead.phone
                      ? <a href={`tel:${lead.phone}`} className="lt-phone-link">
                          <Phone size={13} /> {lead.phone}
                        </a>
                      : <span className="lt-phone-empty">—</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="lt-empty">No leads match this filter.</div>
        )}
      </div>
    </div>
  );
}
