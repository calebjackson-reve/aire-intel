"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Sparkles, Plus } from "lucide-react";

interface ScheduledPost {
  id: string;
  platform: string;
  caption: string | null;
  imageUrl: string | null;
  scheduledAt: string | null;
  status: string;
  createdAt: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "var(--coral)",
  facebook: "var(--cream)",
  linkedin: "var(--blue)",
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function buildCalendar(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const cells: (number | null)[] = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function ContentCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/posts?scheduled=true")
      .then(r => r.json())
      .then(d => { setPosts(d.posts ?? d ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function prevMonth() {
    setSelected(null);
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    setSelected(null);
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  const cells = buildCalendar(year, month);

  function postsOnDay(day: number): ScheduledPost[] {
    return posts.filter(p => {
      if (!p.scheduledAt) return false;
      const d = new Date(p.scheduledAt);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
  }

  const monthPosts = posts.filter(p => {
    if (!p.scheduledAt) return false;
    const d = new Date(p.scheduledAt);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const selectedPosts = selected ? postsOnDay(selected) : [];

  async function publishNow(postId: string) {
    const res = await fetch(`/api/posts/${postId}/publish`, { method: "POST" });
    if (res.ok) {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: "published" } : p));
    }
  }

  async function deletePost(postId: string) {
    await fetch(`/api/posts/${postId}`, { method: "DELETE" });
    setPosts(prev => prev.filter(p => p.id !== postId));
    if (selected && postsOnDay(selected).filter(p => p.id !== postId).length === 0) {
      setSelected(null);
    }
  }

  function fmtTime(iso: string | null) {
    if (!iso) return "Draft";
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase().replace(" ", "");
  }

  return (
    <>
      <header className="cc-cmd">
        <h1>Content Calendar</h1>
        <div className="cc-monthnav">
          <button className="cc-arw" onClick={prevMonth} aria-label="Previous month"><ChevronLeft size={15} /></button>
          <span className="cc-mlabel">{MONTHS[month]} {year}</span>
          <button className="cc-arw" onClick={nextMonth} aria-label="Next month"><ChevronRight size={15} /></button>
        </div>
        <Link href="/create-post" className="cc-newbtn"><Plus size={14} /> New Post</Link>
      </header>

      <div className="cc-body">
        <div className="cc-optimal">
          <Sparkles />
          <div className="t">
            <b>AIRE optimal times:</b> Your Rêve audience engages most <b>Tue &amp; Thu 6–8 PM</b> and <b>Sat 10 AM</b>.
            {monthPosts.length > 0 && <> {monthPosts.length} {monthPosts.length === 1 ? "post" : "posts"} scheduled this month.</>}
          </div>
          <span className="src">via Meta insights</span>
        </div>

        <div className="cc-legend">
          <div className="cc-lg"><span className="sw" style={{ background: "var(--coral)" }} />Listing · Sold · Under Contract</div>
          <div className="cc-lg"><span className="sw" style={{ background: "var(--cream)" }} />Client story · feature</div>
          <div className="cc-lg"><span className="sw" style={{ background: "var(--blue)" }} />Market · educational</div>
          <div className="cc-lg"><span className="sw" style={{ background: "rgba(0,0,0,0.18)" }} />Personal story</div>
        </div>

        <div className="cc-cal">
          <div className="cc-dow">
            {DAYS.map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="cc-grid">
            {cells.map((day, i) => {
              if (!day) return <div key={i} className="cc-cell empty" />;
              const isToday = year === now.getFullYear() && month === now.getMonth() && day === now.getDate();
              const isSel = day === selected;
              const dayPosts = postsOnDay(day);
              return (
                <div
                  key={i}
                  className={`cc-cell${isToday ? " today" : ""}${isSel ? " sel" : ""}`}
                  onClick={() => setSelected(isSel ? null : day)}
                >
                  <div className="dn">{day}</div>
                  {dayPosts.slice(0, 3).map(p => (
                    <div key={p.id} className="cc-post" style={{ borderLeftColor: PLATFORM_COLORS[p.platform] ?? "var(--aire-glass-line)" }}>
                      <span className="pt">{p.caption?.slice(0, 14) ?? p.platform}</span>
                      <span className="tm">{fmtTime(p.scheduledAt)}</span>
                    </div>
                  ))}
                  {dayPosts.length > 3 && <div className="cc-more">+{dayPosts.length - 3} more</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected day detail */}
        {selected && (
          <div className="glass pad" style={{ marginTop: "18px" }}>
            <p style={{ fontSize: "10px", letterSpacing: "0.18em", color: "var(--white-40)", marginBottom: "14px", fontWeight: 600 }}>
              {MONTHS[month]} {selected}
            </p>
            {selectedPosts.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <p style={{ fontSize: "13px", color: "var(--white-40)", margin: 0 }}>No posts scheduled.</p>
                <Link href="/create-post" style={{ fontSize: "12px", color: "var(--coral)", textDecoration: "none", fontWeight: 600 }}>+ Create one →</Link>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {selectedPosts.map(p => (
                  <div key={p.id} style={{ background: "rgba(255,255,255,0.80)", borderRadius: "11px", padding: "14px", border: "1px solid rgba(255,255,255,0.90)", borderLeft: `3px solid ${PLATFORM_COLORS[p.platform] ?? "var(--aire-border)"}`, boxShadow: "var(--shadow-card)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                      <span style={{ fontSize: "9px", letterSpacing: "0.12em", color: PLATFORM_COLORS[p.platform] ?? "var(--white-40)", fontWeight: 600 }}>{p.platform.toUpperCase()}</span>
                      <span style={{ fontSize: "10px", color: "var(--white-40)" }}>{fmtTime(p.scheduledAt)}</span>
                    </div>
                    <p style={{ fontSize: "12px", color: "var(--white-70)", lineHeight: 1.5, marginBottom: "12px" }}>
                      {p.caption?.slice(0, 110) ?? "No caption"}{p.caption && p.caption.length > 110 ? "…" : ""}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {p.status !== "published" ? (
                        <button onClick={() => publishNow(p.id)} className="btn-coral-glow" style={{ fontSize: "9px", letterSpacing: "0.10em", padding: "5px 12px" }}>PUBLISH NOW</button>
                      ) : (
                        <span style={{ fontSize: "10px", color: "var(--aire-mint)", letterSpacing: "0.10em", fontWeight: 600 }}>✓ PUBLISHED</span>
                      )}
                      <button onClick={() => deletePost(p.id)} style={{ fontSize: "9px", color: "var(--white-40)", background: "none", border: "none", cursor: "pointer", letterSpacing: "0.08em" }}>DELETE</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading && (
          <p style={{ textAlign: "center", color: "var(--white-40)", marginTop: "24px", fontSize: "12px" }}>Loading posts…</p>
        )}
      </div>
    </>
  );
}
