"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, Check, Bell, AlertTriangle, Circle, Phone } from "lucide-react";

interface Task {
  id: string;
  title: string;
  dueDate: string | null;
  done: boolean;
  doneAt: string | null;
}

interface Loop {
  id: string;
  name: string;
  status: string;
  salePrice: number | null;
  commission: number | null;
  closingDate: string | null;
  participantsJson: string | null;
  signedDocsCount: number;
  pendingDocsCount: number;
}

interface Lead {
  id: string;
  name: string;
  type: string;
  stage: string;
  phone: string | null;
  address: string | null;
  pricePoint: number | null;
  priceMin: number | null;
  priceMax: number | null;
  contractDate: string | null;
  closingDate: string | null;
  referredBy: string | null;
  tasks: Task[];
  loops: Loop[];
}

type MsStatus = "done" | "today" | "late" | "up";

const NODE_ICON: Record<MsStatus, typeof Check> = {
  done: Check,
  today: Bell,
  late: AlertTriangle,
  up: Circle,
};
const WHEN_COLOR: Record<MsStatus, string> = {
  done: "var(--aire-mint)",
  today: "var(--coral)",
  late: "var(--coral)",
  up: "var(--white-40)",
};

const DAY_MS = 86_400_000;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
function initials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}
function cleanTitle(t: string): string {
  return t.replace(/\s*\[Milestone:[^\]]+\]\s*/g, "").trim();
}

function msStatus(t: Task): MsStatus {
  if (t.done) return "done";
  if (!t.dueDate) return "up";
  const due = new Date(t.dueDate).getTime();
  const now = Date.now();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dueDay = new Date(t.dueDate); dueDay.setHours(0, 0, 0, 0);
  if (dueDay.getTime() === today.getTime()) return "today";
  if (due < now) return "late";
  return "up";
}

export default function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [lead, setLead] = useState<Lead | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/contacts/${id}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setLead)
      .catch(() => setError(true));
  }, [id]);

  async function markDone(taskId: string) {
    setLead(prev => prev ? { ...prev, tasks: prev.tasks.map(t => t.id === taskId ? { ...t, done: true } : t) } : prev);
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, done: true }),
    });
  }

  if (error) {
    return (
      <div className="dl-body" style={{ display: "block" }}>
        <p style={{ color: "var(--white-40)", fontSize: "13px" }}>Deal not found.</p>
        <Link href="/pipeline" className="dl-crumb"><ArrowLeft /> Back to Pipeline</Link>
      </div>
    );
  }
  if (!lead) {
    return <div className="dl-body" style={{ display: "block" }}><p style={{ color: "var(--white-40)", fontSize: "13px" }}>Loading deal…</p></div>;
  }

  const price = lead.pricePoint ?? lead.priceMax ?? lead.priceMin ?? null;
  const commission = price != null ? price * 0.03 : null;
  const loop = lead.loops?.[0] ?? null;

  const contractPrice = loop?.salePrice ?? price;
  const commissionVal = loop?.commission ?? commission;
  const closing = lead.closingDate ?? loop?.closingDate ?? null;

  // Countdown to close
  let countdown: string | null = null;
  if (closing) {
    const days = Math.ceil((new Date(closing).getTime() - Date.now()) / DAY_MS);
    countdown = days >= 0 ? `${days} ${days === 1 ? "day" : "days"}` : `${Math.abs(days)}d ago`;
  }

  const tasks = lead.tasks ?? [];
  const doneCount = tasks.filter(t => t.done).length;
  const needsYou = tasks.filter(t => { const s = msStatus(t); return s === "today" || s === "late"; }).length;
  const pct = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

  // Parties: dotloop participants if synced, else the client contact.
  let parties: { name: string; role: string; phone?: string }[] = [];
  if (loop?.participantsJson) {
    try {
      const parsed = JSON.parse(loop.participantsJson);
      if (Array.isArray(parsed)) parties = parsed.map((p: { name?: string; role?: string; phone?: string }) => ({ name: p.name ?? "—", role: p.role ?? "", phone: p.phone }));
    } catch { /* ignore */ }
  }
  if (parties.length === 0) {
    parties = [{ name: lead.name, role: lead.type === "seller" ? "Seller" : "Buyer", phone: lead.phone ?? undefined }];
    if (lead.referredBy) parties.push({ name: lead.referredBy, role: "Referred by" });
  }

  const statusLabel = lead.stage === "closed" ? "Closed" : "Under Contract";

  return (
    <>
      <header className="dl-top">
        <Link href="/pipeline" className="dl-crumb"><ArrowLeft /> Pipeline · {statusLabel}</Link>
        <div className="dl-toprow">
          <h1>{lead.address ?? lead.name}</h1>
          <span className="dl-badge" style={{ color: "var(--coral)", borderColor: "rgba(238,129,114,.45)", background: "rgba(238,129,114,.12)" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--coral)" }} />
            {needsYou > 0 ? `${needsYou} needs you` : statusLabel}
          </span>
          {countdown && (
            <div className="dl-countdown">
              <div className="v tnum">{countdown}</div>
              <div className="l">to close · {fmtDate(closing)}</div>
            </div>
          )}
        </div>
      </header>

      <div className="dl-body">
        {/* Main: milestone timeline */}
        <div>
          <div className="dl-autobanner">
            <Sparkles />
            <div className="t">
              <b>AIRE generated {tasks.length} {tasks.length === 1 ? "milestone" : "milestones"}</b>
              {lead.contractDate ? <> when this deal moved to Under Contract on {fmtDate(lead.contractDate)} — deadlines and reminders are tracked automatically.</> : <> — deadlines and reminders are tracked automatically.</>}
            </div>
          </div>

          <div className="dl-progress">
            <div className="bar"><span style={{ width: `${pct}%` }} /></div>
            <div className="lab tnum">{doneCount} of {tasks.length} complete{needsYou > 0 ? ` · ${needsYou} needs you` : ""}</div>
          </div>

          <h3 className="dl-sech">Transaction timeline · TCS</h3>
          {tasks.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--white-40)" }}>No milestones yet. They generate when a contract date and closing date are set.</p>
          ) : (
            <div className="dl-ms">
              {tasks.map(t => {
                const status = msStatus(t);
                const NodeIcon = NODE_ICON[status];
                return (
                  <div key={t.id} className={`dl-mi ${status === "up" ? "" : status}`}>
                    <div className="node"><NodeIcon /></div>
                    <div className="dl-card">
                      <div className="r1">
                        <span className="ttl">{cleanTitle(t.title)}</span>
                        <span className="when" style={{ color: WHEN_COLOR[status] }}>{t.done && t.doneAt ? "Done" : fmtDate(t.dueDate)}</span>
                      </div>
                      {(status === "today" || status === "late") && (
                        <div className="act">
                          <button className="dl-mibtn primary" onClick={() => markDone(t.id)}>Mark done</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right rail */}
        <aside>
          <section className="glass pad" style={{ marginBottom: "18px" }}>
            <h3 className="dl-sech" style={{ fontSize: "15px" }}>Deal facts</h3>
            <div className="dl-fact"><span className="k">Contract price</span><span className="v tnum">{fmtMoney(contractPrice)}</span></div>
            <div className="dl-fact"><span className="k">Type</span><span className="v">{lead.type === "seller" ? "Listing-side" : "Buyer-side"}</span></div>
            <div className="dl-fact"><span className="k">Contract date</span><span className="v">{fmtDate(lead.contractDate)}</span></div>
            <div className="dl-fact"><span className="k">Close date</span><span className="v">{fmtDate(closing)}</span></div>
            <div className="dl-fact"><span className="k">Commission (3%)</span><span className="v tnum" style={{ color: "var(--aire-mint)" }}>{fmtMoney(commissionVal)}</span></div>
          </section>

          <section className="glass pad" style={{ marginBottom: "18px" }}>
            <h3 className="dl-sech" style={{ fontSize: "15px" }}>Parties</h3>
            {parties.map((p, i) => (
              <div key={i} className="dl-party">
                <div className="pa">{initials(p.name)}</div>
                <div>
                  <div className="pn">{p.name}</div>
                  <div className="pr">{p.role}</div>
                </div>
                {p.phone && (
                  <a className="pc" href={`tel:${p.phone.replace(/[^0-9+]/g, "")}`}><Phone /></a>
                )}
              </div>
            ))}
          </section>

          {loop && (
            <section className="glass pad">
              <h3 className="dl-sech" style={{ fontSize: "15px" }}>Documents</h3>
              <div className="dl-fact"><span className="k">Signed</span><span className="v tnum" style={{ color: "var(--aire-mint)" }}>{loop.signedDocsCount}</span></div>
              <div className="dl-fact"><span className="k">Pending</span><span className="v tnum" style={{ color: loop.pendingDocsCount > 0 ? "var(--cream)" : "#fff" }}>{loop.pendingDocsCount}</span></div>
              <div className="dl-fact"><span className="k">Dotloop status</span><span className="v">{loop.status.replace(/_/g, " ")}</span></div>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
