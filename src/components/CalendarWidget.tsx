"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

interface Task {
  id: string;
  title: string;
  dueDate: string | null;
  priority: string;
  done: boolean;
  lead: { id: string; name: string } | null;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isThisWeek(date: Date) {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  return date >= startOfWeek && date <= endOfWeek;
}

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Build the 6x7 = 42 cell month grid (leading/trailing days included).
function buildMonthGrid(viewYear: number, viewMonth: number) {
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const leadingDays = firstOfMonth.getDay(); // 0 = Sun
  const startDate = new Date(viewYear, viewMonth, 1 - leadingDays);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    return d;
  });
}

export default function CalendarWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [today] = useState(new Date());
  const [newTask, setNewTask] = useState("");
  const [adding, setAdding] = useState(false);
  const [viewAll, setViewAll] = useState(false);

  // Calendar nav state — defaults to current month
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  useEffect(() => {
    fetch("/api/tasks")
      .then(r => r.json())
      .then(data => { setTasks(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function addTask() {
    if (!newTask.trim()) return;
    setAdding(true);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTask, dueDate: today.toISOString() }),
    });
    const task = await res.json();
    setTasks(prev => [...prev, task]);
    setNewTask("");
    setAdding(false);
  }

  async function toggleTask(task: Task) {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, done: !task.done }),
    });
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: !t.done } : t));
  }

  // ── Derived task buckets ───────────────────────────────────────────────────
  const todayTasks = tasks.filter(t => {
    if (!t.dueDate) return false;
    return isSameDay(new Date(t.dueDate), today);
  });

  const overdueTasks = tasks.filter(t => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    return d < today && !isSameDay(d, today) && !t.done;
  });

  const upcomingTasks = tasks.filter(t => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    return d > today && isThisWeek(d);
  });

  const displayTasks = viewAll ? tasks : [...overdueTasks, ...todayTasks, ...upcomingTasks].slice(0, 5);

  // ── Calendar grid + per-day task lookups ───────────────────────────────────
  const monthGrid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  // Index tasks by yyyy-mm-dd for quick per-cell lookup
  const tasksByDay = useMemo(() => {
    const map = new Map<string, { hasPending: boolean; hasDone: boolean; allDone: boolean }>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const d = new Date(t.dueDate);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const prev = map.get(key) ?? { hasPending: false, hasDone: false, allDone: true };
      if (t.done) prev.hasDone = true;
      else { prev.hasPending = true; prev.allDone = false; }
      map.set(key, prev);
    }
    return map;
  }, [tasks]);

  function goPrevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function goNextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  const todayDateStr = `${MONTH_FULL[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;
  const viewMonthLabel = MONTH_FULL[viewMonth].toUpperCase();

  // ── Styles shared on ink ───────────────────────────────────────────────────
  const navBtnStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: "var(--aire-muted-inv)",
    cursor: "pointer",
    padding: "4px 6px",
    fontSize: "12px",
    lineHeight: 1,
    borderRadius: "6px",
    transition: "color 160ms var(--ease-apple), background 160ms var(--ease-apple)",
  };

  return (
    <div
      className="card-ink"
      style={{
        padding: "22px",
        borderRadius: "16px",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        gap: "16px",
      }}
    >
      {/* ── Header: TODAY + date / month nav ────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
        <div>
          <p style={{
            fontSize: "10px",
            letterSpacing: "0.18em",
            color: "var(--aire-muted-inv)",
            textTransform: "uppercase",
            margin: 0,
            marginBottom: "6px",
            fontWeight: 500,
          }}>
            Today
          </p>
          <p className="font-display" style={{
            fontSize: "18px",
            color: "var(--aire-text-inv)",
            margin: 0,
            lineHeight: 1.1,
          }}>
            {todayDateStr}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          <button
            onClick={goPrevMonth}
            aria-label="Previous month"
            style={navBtnStyle}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--aire-text-inv)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--aire-muted-inv)"; }}
          >
            ◀
          </button>
          <span style={{
            fontSize: "10px",
            letterSpacing: "0.16em",
            color: "var(--aire-muted-inv)",
            fontWeight: 500,
            padding: "0 6px",
            minWidth: "62px",
            textAlign: "center",
          }}>
            {viewMonthLabel}
          </span>
          <button
            onClick={goNextMonth}
            aria-label="Next month"
            style={navBtnStyle}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--aire-text-inv)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--aire-muted-inv)"; }}
          >
            ▶
          </button>
        </div>
      </div>

      {/* ── Day-letter row ──────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
        {DAY_LETTERS.map((letter, i) => (
          <div
            key={i}
            style={{
              fontSize: "10px",
              letterSpacing: "0.10em",
              color: "var(--aire-muted-inv)",
              fontWeight: 500,
              textAlign: "center",
              textTransform: "uppercase",
              paddingBottom: "4px",
            }}
          >
            {letter}
          </div>
        ))}
      </div>

      {/* ── Date grid (6 rows × 7 cols) ─────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", rowGap: "2px" }}>
        {monthGrid.map((d, i) => {
          const inMonth = d.getMonth() === viewMonth;
          const isToday = isSameDay(d, today);
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const dayMeta = tasksByDay.get(key);
          const hasPending = dayMeta?.hasPending ?? false;
          const hasDone = dayMeta?.hasDone ?? false;
          const allDone = dayMeta?.allDone ?? false;

          // Visual stack: TODAY > all-done-mint > pending-coral-dot > inactive
          let bg = "transparent";
          let color: string = inMonth ? "var(--aire-text-inv)" : "var(--aire-muted-inv)";
          let fontWeight = 400;
          let opacity = inMonth ? 1 : 0.45;

          if (isToday) {
            bg = "var(--aire-coral)";
            color = "var(--aire-ink)";
            fontWeight = 700;
            opacity = 1;
          } else if (inMonth && hasDone && allDone) {
            bg = "var(--aire-mint)";
            color = "var(--aire-ink)";
            fontWeight = 600;
          }

          return (
            <div
              key={i}
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "1 / 1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  fontFeatureSettings: '"tnum" 1',
                  background: bg,
                  color,
                  fontWeight,
                  opacity,
                  transition: "background 180ms var(--ease-apple), color 180ms var(--ease-apple)",
                  cursor: "default",
                }}
                onMouseEnter={e => {
                  if (!isToday && !(hasDone && allDone)) {
                    e.currentTarget.style.background = "rgba(250,246,238,0.10)";
                  }
                }}
                onMouseLeave={e => {
                  if (!isToday && !(hasDone && allDone)) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                {d.getDate()}
              </div>
              {/* Pending-task coral dot (suppress if today or all-done) */}
              {!isToday && !(hasDone && allDone) && hasPending && inMonth && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "2px",
                    width: "3px",
                    height: "3px",
                    borderRadius: "50%",
                    background: "var(--aire-coral)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        gap: "14px",
        alignItems: "center",
        flexWrap: "wrap",
      }}>
        {[
          { label: "Today", color: "var(--aire-coral)" },
          { label: "Done", color: "var(--aire-mint)" },
          { label: "Scheduled", color: "var(--aire-cream)" },
        ].map(item => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: item.color,
              display: "inline-block",
            }} />
            <span style={{ fontSize: "9px", color: "var(--aire-muted-inv)", letterSpacing: "0.06em" }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* ── Divider ─────────────────────────────────────────────────────── */}
      <div style={{ height: "1px", background: "var(--aire-border-ink)", width: "100%" }} />

      {/* ── Today's tasks ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, minHeight: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{
            fontSize: "10px",
            letterSpacing: "0.18em",
            color: "var(--aire-muted-inv)",
            textTransform: "uppercase",
            margin: 0,
            fontWeight: 500,
          }}>
            Today's Tasks
          </p>
          {overdueTasks.length > 0 && (
            <span style={{ fontSize: "9px", letterSpacing: "0.10em", color: "var(--aire-coral)" }}>
              {overdueTasks.length} OVERDUE
            </span>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0 }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {[1,2,3].map(i => (
                <div
                  key={i}
                  style={{
                    height: "32px",
                    borderRadius: "6px",
                    background: "linear-gradient(90deg, var(--aire-ink-soft) 25%, rgba(250,246,238,0.06) 50%, var(--aire-ink-soft) 75%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.8s infinite",
                  }}
                />
              ))}
            </div>
          ) : displayTasks.length === 0 ? (
            <p style={{
              fontSize: "12px",
              color: "var(--aire-muted-inv)",
              fontStyle: "italic",
              margin: "8px 0",
            }}>
              You're clear. Add a task above.
            </p>
          ) : (
            displayTasks.map((task, i) => {
              const isOverdue = task.dueDate && new Date(task.dueDate) < today && !isSameDay(new Date(task.dueDate), today);
              const dueStr = task.dueDate
                ? isSameDay(new Date(task.dueDate), today)
                  ? "Today"
                  : new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : null;

              return (
                <div
                  key={task.id}
                  style={{
                    display: "flex",
                    gap: "10px",
                    alignItems: "flex-start",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--aire-border-ink)",
                    opacity: task.done ? 0.55 : 1,
                    animation: `fade-up 300ms var(--ease-out-expo) ${i * 30}ms both`,
                  }}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleTask(task)}
                    aria-label={task.done ? "Mark task incomplete" : "Mark task complete"}
                    style={{
                      width: "14px",
                      height: "14px",
                      minWidth: "14px",
                      borderRadius: "50%",
                      flexShrink: 0,
                      marginTop: "2px",
                      background: task.done ? "var(--aire-mint)" : "transparent",
                      border: `1px solid ${task.done ? "var(--aire-mint)" : "var(--aire-muted-inv)"}`,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "8px",
                      color: "var(--aire-ink)",
                      transition: "all 150ms var(--ease-spring)",
                      padding: 0,
                    }}
                  >
                    {task.done && "✓"}
                  </button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: "12px",
                      color: "var(--aire-text-inv)",
                      textDecoration: task.done ? "line-through" : "none",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      margin: 0,
                      lineHeight: 1.3,
                    }}>
                      {task.title}
                    </p>
                    <div style={{ display: "flex", gap: "8px", marginTop: "2px", alignItems: "center" }}>
                      {task.lead && (
                        <Link
                          href={`/contacts/${task.lead.id}`}
                          style={{
                            fontSize: "10px",
                            color: "var(--aire-muted-inv)",
                            textDecoration: "none",
                          }}
                        >
                          {task.lead.name}
                        </Link>
                      )}
                      {dueStr && (
                        <span style={{
                          fontSize: "10px",
                          color: isOverdue && !task.done ? "var(--aire-coral)" : "var(--aire-cream)",
                        }}>
                          {dueStr}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {tasks.length > 5 && !loading && (
          <button
            onClick={() => setViewAll(v => !v)}
            style={{
              fontSize: "10px",
              letterSpacing: "0.12em",
              color: "var(--aire-cream)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 0 0",
              textAlign: "left",
              alignSelf: "flex-start",
              textTransform: "uppercase",
            }}
          >
            {viewAll ? "Show less" : `View all ${tasks.length}`}
          </button>
        )}
      </div>

      {/* ── Add task input ──────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 10px",
        background: "rgba(250,246,238,0.06)",
        border: "1px solid var(--aire-border-ink)",
        borderRadius: "10px",
        transition: "border-color 160ms var(--ease-apple), background 160ms var(--ease-apple)",
      }}>
        <input
          value={newTask}
          onChange={e => setNewTask(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addTask()}
          placeholder="Add task"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--aire-text-inv)",
            fontSize: "12px",
            fontFamily: "inherit",
            padding: 0,
          }}
        />
        <button
          onClick={addTask}
          disabled={adding || !newTask.trim()}
          aria-label="Add task"
          style={{
            width: "22px",
            height: "22px",
            borderRadius: "999px",
            border: "none",
            background: newTask.trim() ? "var(--aire-coral)" : "rgba(250,246,238,0.10)",
            color: newTask.trim() ? "var(--aire-ink)" : "var(--aire-muted-inv)",
            fontSize: "14px",
            lineHeight: 1,
            cursor: newTask.trim() ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontWeight: 600,
            transition: "background 160ms var(--ease-apple)",
            padding: 0,
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
