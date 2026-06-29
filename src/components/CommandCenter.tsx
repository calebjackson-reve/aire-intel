"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, CheckSquare, TrendingUp, Star, Heart, Calendar } from "lucide-react";

interface WidgetData {
  newLeadsToday: number;
  followUpsDue: number;
  overdueFollowUps: number;
  hotLeads: number;
  warmLeads: number;
  tasksDue: number;
  closingsThisMonth: number;
}

const EMPTY: WidgetData = {
  newLeadsToday: 0,
  followUpsDue: 0,
  overdueFollowUps: 0,
  hotLeads: 0,
  warmLeads: 0,
  tasksDue: 0,
  closingsThisMonth: 0,
};

function daysAgo(date: string | null): number {
  return date ? Math.floor((Date.now() - new Date(date).getTime()) / 86400000) : 30;
}

export default function CommandCenter() {
  const [data, setData] = useState<WidgetData>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [leadsRes, tasksRes, dealsRes] = await Promise.all([
          fetch("/api/leads?limit=200"),
          fetch("/api/tasks"),
          fetch(`/api/deals?status=active&year=${new Date().getFullYear()}`),
        ]);

        const [leadsData, tasksData, dealsData] = await Promise.all([
          leadsRes.ok ? leadsRes.json() : { leads: [] },
          tasksRes.ok ? tasksRes.json() : [],
          dealsRes.ok ? dealsRes.json() : { deals: [] },
        ]);

        const leads = leadsData.leads ?? [];
        const tasks = Array.isArray(tasksData) ? tasksData : (tasksData.tasks ?? []);
        const deals = dealsData.deals ?? [];

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const newLeadsToday = leads.filter((l: { createdAt?: string }) =>
          l.createdAt && new Date(l.createdAt) >= todayStart
        ).length;

        const followUpsDue = leads.filter((l: { lastContactDate: string | null; stage: string }) =>
          daysAgo(l.lastContactDate) >= 3 && l.stage !== "closed"
        ).length;

        const overdueFollowUps = leads.filter((l: { lastContactDate: string | null; stage: string }) =>
          daysAgo(l.lastContactDate) >= 7 && l.stage !== "closed"
        ).length;

        const hotLeads = leads.filter((l: { stage: string; lastContactDate: string | null }) => {
          const base: Record<string, number> = { new_lead: 55, active: 75, showing: 83, under_contract: 90, closed: 100 };
          const score = Math.max(20, Math.min(100, Math.round((base[l.stage] ?? 55) - Math.min(daysAgo(l.lastContactDate), 40) * 0.8)));
          return score >= 80;
        }).length;

        const warmLeads = leads.filter((l: { stage: string; lastContactDate: string | null }) => {
          const base: Record<string, number> = { new_lead: 55, active: 75, showing: 83, under_contract: 90, closed: 100 };
          const score = Math.max(20, Math.min(100, Math.round((base[l.stage] ?? 55) - Math.min(daysAgo(l.lastContactDate), 40) * 0.8)));
          return score >= 60 && score < 80;
        }).length;

        const tasksDue = tasks.filter((t: { dueDate?: string; done?: boolean }) =>
          !t.done && t.dueDate && new Date(t.dueDate) <= new Date()
        ).length;

        const closingsThisMonth = deals.filter((d: { closingDate?: string }) =>
          d.closingDate && new Date(d.closingDate) <= monthEnd
        ).length;

        setData({ newLeadsToday, followUpsDue, overdueFollowUps, hotLeads, warmLeads, tasksDue, closingsThisMonth });
      } catch {}
      setLoading(false);
    }
    load();
    const id = setInterval(load, 120_000);
    window.addEventListener("aire:refresh", load);
    return () => { clearInterval(id); window.removeEventListener("aire:refresh", load); };
  }, []);

  const widgets = [
    {
      icon: <Users size={18} />,
      label: "New Leads Today",
      value: data.newLeadsToday,
      sub: "untouched",
      href: "/contacts?filter=new",
      accent: "var(--aire-orange)",
      empty: "You're all caught up",
    },
    {
      icon: <TrendingUp size={18} />,
      label: "Follow-Ups Due",
      value: data.followUpsDue,
      sub: `${data.overdueFollowUps} overdue`,
      href: "/contacts?filter=overdue",
      accent: data.overdueFollowUps > 0 ? "#E2645C" : "var(--aire-orange)",
      empty: "Nothing due",
    },
    {
      icon: <Star size={18} />,
      label: "Hot Leads",
      value: data.hotLeads,
      sub: `${data.warmLeads} warm`,
      href: "/pipeline",
      accent: "#3E9C77",
      empty: "No hot leads right now",
    },
    {
      icon: <CheckSquare size={18} />,
      label: "Tasks Due",
      value: data.tasksDue,
      sub: "call · text · email",
      href: "/today",
      accent: data.tasksDue > 3 ? "#E2645C" : "var(--aire-orange)",
      empty: "Nothing on your to-do list — enjoy your day!",
    },
    {
      icon: <Heart size={18} />,
      label: "Keep in Touch",
      value: Math.max(0, data.followUpsDue - data.overdueFollowUps),
      sub: "nurture pipeline",
      href: "/follow-up",
      accent: "var(--blue)",
      empty: "Pipeline is healthy",
    },
    {
      icon: <Calendar size={18} />,
      label: "Closings This Month",
      value: data.closingsThisMonth,
      sub: "near deadline",
      href: "/pipeline?stage=under_contract",
      accent: "#3E9C77",
      empty: "No closings scheduled",
    },
  ];

  return (
    <div className="cc-grid">
      {widgets.map(w => (
        <Link key={w.label} href={w.href} className="cc-widget">
          <div className="cc-widget-icon" style={{ color: w.accent, background: `${w.accent}18` }}>
            {w.icon}
          </div>
          <div className="cc-widget-body">
            <div className="cc-widget-label">{w.label}</div>
            {loading ? (
              <div className="cc-widget-val cc-widget-loading">—</div>
            ) : w.value > 0 ? (
              <>
                <div className="cc-widget-val" style={{ color: w.accent }}>{w.value}</div>
                <div className="cc-widget-sub">{w.sub}</div>
              </>
            ) : (
              <div className="cc-widget-empty">{w.empty}</div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
