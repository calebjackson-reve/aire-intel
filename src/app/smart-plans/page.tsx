"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, UserPlus, Play, Mail, MessageSquare, PhoneCall, CheckSquare } from "lucide-react";
import { PLAN_TEMPLATES, type PlanTemplate } from "@/lib/smart-plan-templates";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanStep {
  day: number;
  method: "text" | "call" | "email" | "task";
  message: string;
  subject?: string;
}

interface SmartPlan {
  id: string;
  name: string;
  description: string | null;
  triggerType: string;
  steps: string;
  active: boolean;
  createdAt: string;
  _count: { enrollments: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  new_lead: "New Lead",
  stage_change: "Stage Change",
  no_contact: "No Contact (7d)",
  manual: "Manual",
};

const METHOD_ICON: Record<string, typeof Mail> = {
  email: Mail,
  text: MessageSquare,
  call: PhoneCall,
  task: CheckSquare,
};

const METHOD_LABEL: Record<string, string> = {
  email: "Email · SendGrid",
  text: "Text · Twilio",
  call: "Call reminder",
  task: "Task",
};

const METHOD_COLORS: Record<string, string> = {
  text: "var(--aire-coral-deep)",
  call: "var(--aire-ink)",
  email: "var(--aire-coral-deep)",
  task: "var(--aire-text-2)",
};

function parseSteps(raw: string): PlanStep[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function initials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SmartPlans() {
  const [plans, setPlans] = useState<SmartPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SmartPlan | null>(null);

  // New plan form
  const [creating, setCreating] = useState(false);
  const [formName, setFormName] = useState("");
  const [formTrigger, setFormTrigger] = useState("new_lead");
  const [formDesc, setFormDesc] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedSteps, setGeneratedSteps] = useState<PlanStep[]>([]);
  const [streamText, setStreamText] = useState("");
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/smart-plans")
      .then(r => r.json())
      .then(data => {
        setPlans(data);
        if (Array.isArray(data) && data.length > 0) setSelected(data[0]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [streamText]);

  async function generateSteps() {
    if (!formName.trim()) return;
    setGenerating(true);
    setStreamText("");
    setGeneratedSteps([]);

    const res = await fetch("/api/smart-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate", name: formName, triggerType: formTrigger, description: formDesc }),
    });

    const reader = res.body?.getReader();
    const dec = new TextDecoder();
    if (!reader) return;

    let full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = dec.decode(value);
      full += chunk;
      setStreamText(full);
    }

    const match = full.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const steps = JSON.parse(match[0]);
        setGeneratedSteps(steps);
      } catch {}
    }
    setGenerating(false);
  }

  async function savePlan() {
    if (!formName.trim() || generatedSteps.length === 0) return;
    const res = await fetch("/api/smart-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formName,
        description: formDesc || null,
        triggerType: formTrigger,
        steps: generatedSteps,
      }),
    });
    const plan = await res.json();
    const withCount = { ...plan, _count: { enrollments: 0 } };
    setPlans(prev => [withCount, ...prev]);
    setSelected(withCount);
    setCreating(false);
    setFormName("");
    setFormDesc("");
    setFormTrigger("new_lead");
    setGeneratedSteps([]);
    setStreamText("");
  }

  async function toggleActive(plan: SmartPlan) {
    const res = await fetch("/api/smart-plans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: plan.id, active: !plan.active }),
    });
    const updated = await res.json();
    setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, ...updated } : p));
    if (selected?.id === plan.id) setSelected(prev => prev ? { ...prev, ...updated } : prev);
  }

  async function deletePlan(plan: SmartPlan) {
    await fetch("/api/smart-plans", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: plan.id }),
    });
    const remaining = plans.filter(p => p.id !== plan.id);
    setPlans(remaining);
    if (selected?.id === plan.id) setSelected(remaining[0] ?? null);
  }

  return (
    <div className="sp-shell">
      {/* Plan list column */}
      <section className="sp-plist">
        <div className="sp-plh">
          <h1>Smart Plans</h1>
          <button className="sp-newp" onClick={() => setCreating(true)}>
            <Plus /> New
          </button>
        </div>
        <div className="sp-plscroll">
          {loading ? (
            <p style={{ fontSize: "12px", color: "var(--white-40)", padding: "16px 8px" }}>Loading plans…</p>
          ) : plans.length === 0 ? (
            <TemplatesEmptyState
              onInstalled={(plan) => { setPlans([plan]); setSelected(plan); }}
              onCreateCustom={() => setCreating(true)}
            />
          ) : (
            plans.map(plan => {
              const isSel = selected?.id === plan.id;
              const stepCount = parseSteps(plan.steps).length;
              return (
                <div
                  key={plan.id}
                  className={`sp-pcard${isSel ? " on" : ""}`}
                  onClick={() => setSelected(plan)}
                >
                  <div className="pn">{plan.name}</div>
                  <div className="pm">
                    <span>{stepCount} steps</span>
                    <span><b>{plan._count.enrollments}</b> enrolled</span>
                    <span>{plan.active ? "Active" : "Paused"}</span>
                  </div>
                  <span className="sp-ptag">{TRIGGER_LABELS[plan.triggerType] ?? plan.triggerType}</span>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Detail */}
      <section className="sp-detail">
        {selected ? (
          <PlanDetail
            plan={selected}
            onToggle={() => toggleActive(selected)}
            onDelete={() => deletePlan(selected)}
          />
        ) : (
          <div style={{ padding: "60px 30px", color: "var(--white-40)", fontStyle: "italic", fontSize: "13px" }}>
            Select a plan to view its sequence.
          </div>
        )}
      </section>

      {/* Create Plan Modal */}
      {creating && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.30)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", backdropFilter: "blur(8px)" }}>
          <div className="glass" style={{ padding: "28px", width: "100%", maxWidth: "680px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <div>
                <p style={{ fontSize: "10px", letterSpacing: "0.20em", color: "var(--white-40)", marginBottom: "4px" }}>NEW PLAN</p>
                <h2 className="disp" style={{ fontSize: "22px", color: "#fff", margin: 0 }}>Create a drip sequence</h2>
              </div>
              <button onClick={() => { setCreating(false); setGeneratedSteps([]); setStreamText(""); }} style={{ background: "none", border: "none", color: "var(--white-40)", fontSize: "24px", cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "20px" }}>
              <div>
                <label style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--white-50)", display: "block", marginBottom: "6px", fontWeight: 600 }}>PLAN NAME</label>
                <input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. New Buyer Lead — 30 Day Sequence"
                  className="aire-input"
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--white-50)", display: "block", marginBottom: "6px", fontWeight: 600 }}>TRIGGER</label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {Object.entries(TRIGGER_LABELS).map(([v, l]) => (
                    <button
                      key={v}
                      onClick={() => setFormTrigger(v)}
                      className={formTrigger === v ? "btn-coral-glow" : "btn-glass"}
                      style={{ fontSize: "10px", letterSpacing: "0.10em", padding: "7px 14px" }}
                    >
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--white-50)", display: "block", marginBottom: "6px", fontWeight: 600 }}>DESCRIPTION (optional — helps Claude write better messages)</label>
                <input
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  placeholder="e.g. For buyers in the $300-500K range who came in from Zillow"
                  className="aire-input"
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
            </div>

            <button
              onClick={generateSteps}
              disabled={!formName.trim() || generating}
              className="btn-coral-glow"
              style={{
                width: "100%", fontSize: "11px", letterSpacing: "0.14em",
                padding: "12px", marginBottom: "16px",
                opacity: !formName.trim() || generating ? 0.5 : 1,
                cursor: !formName.trim() || generating ? "default" : "pointer",
              }}
            >
              {generating ? "GENERATING WITH AI…" : "GENERATE PLAN WITH AI"}
            </button>

            {/* Stream output */}
            {(streamText || generating) && generatedSteps.length === 0 && (
              <div ref={streamRef} style={{ background: "rgba(0,0,0,0.04)", border: "1px solid var(--aire-border)", borderRadius: "10px", padding: "14px", maxHeight: "160px", overflowY: "auto", fontSize: "12px", color: "var(--aire-text-2)", fontFamily: "monospace", lineHeight: "1.5", marginBottom: "16px" }}>
                {streamText || "Thinking…"}
              </div>
            )}

            {/* Generated steps preview */}
            {generatedSteps.length > 0 && (
              <div style={{ marginBottom: "8px" }}>
                <p style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--white-40)", marginBottom: "12px", fontWeight: 600 }}>
                  GENERATED {generatedSteps.length} STEPS — REVIEW BEFORE SAVING
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "300px", overflowY: "auto" }}>
                  {generatedSteps.map((step, i) => (
                    <div key={i} style={{ display: "flex", gap: "12px", padding: "12px", background: "rgba(255,255,255,0.80)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.90)", boxShadow: "var(--shadow-xs)", borderLeft: `3px solid ${METHOD_COLORS[step.method] ?? "var(--aire-border)"}` }}>
                      <div style={{ minWidth: "44px", textAlign: "center" }}>
                        <div className="disp" style={{ fontSize: "18px", color: "#fff" }}>D{step.day}</div>
                        <div style={{ fontSize: "9px", letterSpacing: "0.10em", color: METHOD_COLORS[step.method], fontWeight: 600 }}>{step.method.toUpperCase()}</div>
                      </div>
                      <div>
                        {step.subject && <p style={{ fontSize: "11px", color: "var(--white-40)", margin: "0 0 4px 0" }}>Re: {step.subject}</p>}
                        <p style={{ fontSize: "12px", color: "var(--white-70)", margin: 0, lineHeight: "1.5" }}>{step.message}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                  <button onClick={generateSteps} className="btn-glass" style={{ fontSize: "11px", letterSpacing: "0.14em", padding: "10px 18px" }}>
                    REGENERATE
                  </button>
                  <button onClick={savePlan} className="btn-coral-glow" style={{ flex: 1, fontSize: "11px", letterSpacing: "0.14em", padding: "10px" }}>
                    SAVE PLAN →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Plan Detail ──────────────────────────────────────────────────────────────

function PlanDetail({ plan, onToggle, onDelete }: { plan: SmartPlan; onToggle: () => void; onDelete: () => void }) {
  const steps = parseSteps(plan.steps);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <div className="sp-dh">
        <div className="r1">
          <h2>{plan.name}</h2>
          <div className="sp-toggle">
            {plan.active ? "Active" : "Paused"}
            <button
              className={`sp-sw${plan.active ? "" : " off"}`}
              onClick={onToggle}
              aria-label="Toggle plan active"
            />
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} className="btn-glass" style={{ fontSize: "10px", letterSpacing: "0.10em", padding: "6px 12px", marginLeft: "8px" }}>DELETE</button>
            ) : (
              <button
                onClick={onDelete}
                style={{ fontSize: "10px", letterSpacing: "0.10em", padding: "6px 12px", marginLeft: "8px", background: "transparent", border: "1px solid var(--coral)", color: "var(--coral)", borderRadius: "999px", cursor: "pointer", fontWeight: 600 }}
              >
                CONFIRM
              </button>
            )}
          </div>
        </div>
        <div className="sub">
          {steps.length}-step sequence · {plan._count.enrollments} {plan._count.enrollments === 1 ? "lead" : "leads"} enrolled · executes automatically as due dates pass
        </div>
        {plan.description && (
          <p style={{ fontSize: "12px", color: "var(--white-50)", marginTop: "6px" }}>{plan.description}</p>
        )}
        <div className="sp-enrollbar">
          <UserPlus />
          <span className="t">Enroll a lead into this plan</span>
          <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--white-40)" }}>
            Trigger: {TRIGGER_LABELS[plan.triggerType] ?? plan.triggerType}
          </span>
        </div>
      </div>

      <div className="sp-dbody">
        <div>
          <h3 className="sp-sech">Sequence</h3>
          <div className="sp-steps">
            {steps.map((step, i) => {
              const Icon = METHOD_ICON[step.method] ?? CheckSquare;
              return (
                <div className="sp-step" key={i}>
                  <div className="nd"><Icon /></div>
                  <div className="card">
                    <div className="r1">
                      <span className="day">Day {step.day}</span>
                      <span className="ty">{METHOD_LABEL[step.method] ?? step.method}</span>
                    </div>
                    {step.subject && <div className="tl">{step.subject}</div>}
                    <div className="bd">{step.message}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside>
          <h3 className="sp-sech">Enrolled · {plan._count.enrollments}</h3>
          {plan._count.enrollments === 0 ? (
            <p style={{ fontSize: "12px", color: "var(--white-40)", fontStyle: "italic" }}>No leads enrolled yet.</p>
          ) : (
            <div style={{ fontSize: "12px", color: "var(--white-50)", lineHeight: 1.7 }}>
              {plan._count.enrollments} {plan._count.enrollments === 1 ? "contact is" : "contacts are"} progressing through this sequence.
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

// ─── Empty state with one-click templates ───────────────────────────────────

function TemplatesEmptyState({
  onInstalled,
  onCreateCustom,
}: {
  onInstalled: (plan: SmartPlan) => void;
  onCreateCustom: () => void;
}) {
  const [installing, setInstalling] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function install(template: PlanTemplate) {
    setInstalling(template.id);
    try {
      const res = await fetch("/api/smart-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          triggerType: template.triggerType,
          steps: JSON.stringify(template.steps),
        }),
      });
      if (res.ok) {
        const plan = await res.json();
        setToast(`Installed "${template.name}"`);
        setTimeout(() => setToast(null), 2200);
        onInstalled({ ...plan, _count: { enrollments: 0 } });
      } else {
        setToast("Install failed. Try again.");
        setTimeout(() => setToast(null), 2200);
      }
    } finally {
      setInstalling(null);
    }
  }

  return (
    <div style={{ padding: "4px" }}>
      <p style={{ fontSize: "10px", letterSpacing: "0.20em", color: "var(--white-40)", margin: "8px 8px 6px" }}>
        START WITH A TEMPLATE
      </p>
      <p style={{ fontSize: "12px", color: "var(--white-50)", lineHeight: 1.6, margin: "0 8px 14px" }}>
        Battle-tested sequences in Caleb&apos;s voice. One click installs — edit any step after.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {PLAN_TEMPLATES.map(t => {
          const isInstalling = installing === t.id;
          return (
            <div key={t.id} className="sp-pcard" style={{ cursor: "default" }}>
              <div className="pn">{t.name}</div>
              <p style={{ fontSize: "11px", color: "var(--white-50)", lineHeight: 1.5, margin: "6px 0 10px" }}>
                {t.description}
              </p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "10px", letterSpacing: "0.08em", color: "var(--white-40)" }}>
                  {t.steps.length} steps · {t.durationDays}d
                </span>
                <button
                  onClick={() => install(t)}
                  disabled={isInstalling}
                  className={isInstalling ? "btn-glass" : "btn-coral-glow"}
                  style={{ fontSize: "10px", letterSpacing: "0.14em", padding: "7px 13px", cursor: isInstalling ? "wait" : "pointer" }}
                >
                  {isInstalling ? "INSTALLING…" : "+ INSTALL"}
                </button>
              </div>
            </div>
          );
        })}

        <button
          onClick={onCreateCustom}
          style={{ marginTop: "6px", fontSize: "11px", letterSpacing: "0.14em", padding: "12px", background: "transparent", color: "var(--aire-text-2)", border: "1px dashed var(--aire-border-2)", borderRadius: "10px", cursor: "pointer", width: "100%", fontWeight: 600 }}
        >
          OR CREATE FROM SCRATCH WITH AI →
        </button>
      </div>

      {toast && (
        <div className="glass" style={{ position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)", padding: "12px 22px", fontSize: "12px", letterSpacing: "0.06em", zIndex: 200, color: "#fff" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
