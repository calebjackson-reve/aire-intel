"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Phone, Sparkles } from "lucide-react";
import Link from "next/link";
import QuickActionDrawer from "@/components/QuickActionDrawer";

interface Lead {
  id: string;
  name: string;
  firstName?: string | null;
  email: string | null;
  stage: string;
  pricePoint: number | null;
  address: string | null;
  lastContactDate: string | null;
  nextActionNote: string | null;
  phone: string | null;
  motivation: string | null;
  notes?: string | null;
  areas?: string | null;
  contacts?: { method: string; note: string | null; createdAt: string }[];
}

interface FollowUpModal {
  lead: Lead;
  message: string;
  loading: boolean;
}

const STAGES: { id: string; label: string; barColor: string }[] = [
  { id: "new_lead", label: "New Lead", barColor: "#728AC5" },
  { id: "active", label: "Active", barColor: "#fff" },
  { id: "showing", label: "Showing", barColor: "var(--cream)" },
  { id: "under_contract", label: "Under Contract", barColor: "var(--coral)" },
  { id: "closed", label: "Closed", barColor: "var(--aire-mint)" },
];

type FilterKey = "all" | "today" | "overdue" | "cold";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "today", label: "Follow up today" },
  { key: "overdue", label: "Overdue" },
  { key: "cold", label: "7+ days cold" },
];

function daysSince(date: string | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

// score → dot/left-border color: mint fresh (<3d), cream 3–6d, coral 7d+ or never
function scoreColor(days: number | null): string {
  if (days === null || days >= 7) return "var(--coral)";
  if (days >= 3) return "var(--cream)";
  return "var(--aire-mint)";
}

function disClass(days: number | null): "ok" | "warn" | "late" {
  if (days === null || days >= 7) return "late";
  if (days >= 3) return "warn";
  return "ok";
}

function dibLabel(days: number | null): string {
  if (days === null) return "no contact";
  if (days === 0) return "contacted today";
  return `${days}d since contact`;
}

function passesFilter(days: number | null, filter: FilterKey): boolean {
  switch (filter) {
    case "today":
      return days !== null && days >= 3 && days < 7;
    case "overdue":
      return days === null || days >= 5;
    case "cold":
      return days === null || days >= 7;
    default:
      return true;
  }
}

function LeadCard({
  lead,
  onFollowUp,
  onOpenActions,
}: {
  lead: Lead;
  onFollowUp: (lead: Lead) => void;
  onOpenActions: (lead: Lead) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: lead.id });

  const days = daysSince(lead.lastContactDate);
  const color = scoreColor(days);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    borderLeftColor: color,
  };

  const previewText =
    lead.nextActionNote ||
    `Reach out to ${lead.firstName || lead.name.split(" ")[0]} — it's been ${
      days === null ? "a while" : `${days} days`
    } since last contact.`;

  return (
    <div
      ref={setNodeRef}
      className="pcard"
      style={style}
      onClick={(e) => {
        if (!isDragging) {
          e.stopPropagation();
          onOpenActions(lead);
        }
      }}
      {...attributes}
      {...listeners}
    >
      <div className="r1">
        <span className="scoredot" style={{ background: color }} />
        <div style={{ minWidth: 0 }}>
          <div className="nm">{lead.name}</div>
          {lead.address && <div className="addr">{lead.address}</div>}
        </div>
        {lead.pricePoint != null && (
          <span className="price tnum">
            ${lead.pricePoint >= 1000 ? `${Math.round(lead.pricePoint / 1000)}K` : lead.pricePoint}
          </span>
        )}
      </div>

      <div className="meta">
        <span className={`dib ${disClass(days)}`}>{dibLabel(days)}</span>
        {lead.phone && (
          <a
            className="tel"
            href={`tel:${lead.phone.replace(/[^0-9]/g, "")}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <Phone /> {lead.phone}
          </a>
        )}
        <span className="src">
          <span className="lofd" /> Lofty
        </span>
        {(lead.stage === "under_contract" || lead.stage === "closed") && (
          <Link
            href={`/deal/${lead.id}`}
            className="src"
            style={{ marginLeft: "auto", color: "var(--coral)", textDecoration: "none", fontWeight: 600 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            View deal →
          </Link>
        )}
      </div>

      <div className="aiprev">
        <div className="lbl">
          <Sparkles /> AIRE follow-up
        </div>
        <div
          className="txt"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onFollowUp(lead);
          }}
          title="Generate AI follow-up"
        >
          {previewText}
        </div>
      </div>
    </div>
  );
}

function DroppableColumn({
  stage,
  leads,
  activeId,
  onFollowUp,
  onOpenActions,
  children,
}: {
  stage: { id: string; label: string; barColor: string };
  leads: Lead[];
  activeId: string | null;
  onFollowUp: (lead: Lead) => void;
  onOpenActions: (lead: Lead) => void;
  children?: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  const avgDays = leads.length
    ? Math.round(
        leads.reduce((sum, l) => sum + (daysSince(l.lastContactDate) ?? 0), 0) / leads.length
      )
    : null;

  return (
    <div className={`col${isOver && activeId ? " dropactive" : ""}`}>
      <div className="colhead">
        <div className="row1">
          <span className="nm">{stage.label}</span>
          <span className="ct">{leads.length}</span>
        </div>
        <div className="stagebar" style={{ background: stage.barColor }} />
        <div className="velocity">
          <span>
            avg in stage <b>{avgDays === null ? "—" : `${avgDays}d`}</b>
          </span>
          <span>
            <b>{leads.length}</b> {leads.length === 1 ? "lead" : "leads"}
          </span>
        </div>
      </div>

      <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="coldrop">
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onFollowUp={onFollowUp}
              onOpenActions={onOpenActions}
            />
          ))}
          {leads.length === 0 && (
            <div
              style={{
                fontSize: "11.5px",
                color: "var(--white-40)",
                fontStyle: "italic",
                padding: "18px 8px",
                textAlign: "center",
                border: "1px dashed var(--aire-glass-line)",
                borderRadius: "12px",
              }}
            >
              Drop here
            </div>
          )}
        </div>
      </SortableContext>

      {children}
    </div>
  );
}

function AddLeadForm({
  open,
  setOpen,
  onAdd,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onAdd: (lead: Lead) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pricePoint, setPricePoint] = useState("");
  const [motivation, setMotivation] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        phone: phone || null,
        pricePoint: pricePoint ? parseFloat(pricePoint) : null,
        motivation: motivation || null,
        stage: "new_lead",
      }),
    });
    const lead = await res.json();
    onAdd(lead);
    setOpen(false);
    setName("");
    setPhone("");
    setPricePoint("");
    setMotivation("");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          fontSize: "11px",
          letterSpacing: "0.12em",
          fontWeight: 600,
          color: "var(--white-50)",
          background: "transparent",
          border: "1px dashed var(--aire-glass-line)",
          borderRadius: "11px",
          padding: "11px 14px",
          cursor: "pointer",
          width: "100%",
          textTransform: "uppercase",
        }}
      >
        + Add lead
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="glass pad"
      style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "14px" }}
    >
      <input required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
      <input placeholder="Price point (e.g. 850000)" value={pricePoint} onChange={(e) => setPricePoint(e.target.value)} style={inputStyle} type="number" />
      <input placeholder="Motivation / notes" value={motivation} onChange={(e) => setMotivation(e.target.value)} style={inputStyle} />
      <div style={{ display: "flex", gap: "8px" }}>
        <button type="submit" className="btn-coral-glow" style={{ fontSize: "11px" }}>Save</button>
        <button type="button" onClick={() => setOpen(false)} className="btn-glass" style={{ fontSize: "11px" }}>Cancel</button>
      </div>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.80)",
  border: "1px solid var(--aire-border)",
  borderRadius: "8px",
  padding: "8px 10px",
  fontSize: "13px",
  color: "#fff",
  outline: "none",
  width: "100%",
};

export default function Pipeline() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState<FollowUpModal | null>(null);
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [addOpen, setAddOpen] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    fetch("/api/leads?excludeStage=closed&limit=200")
      .then((r) => r.json())
      .then((d) => setLeads(d.leads || []));
  }, []);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const overId = over.id as string;
    // dropped over a column directly, or over a card → resolve that card's stage
    let targetStage = STAGES.find((s) => s.id === overId)?.id;
    if (!targetStage) {
      const overLead = leads.find((l) => l.id === overId);
      targetStage = overLead?.stage;
    }
    if (!targetStage) return;

    const moving = leads.find((l) => l.id === active.id);
    if (!moving || moving.stage === targetStage) return;

    setLeads((prev) => prev.map((l) => (l.id === active.id ? { ...l, stage: targetStage! } : l)));
    await fetch(`/api/leads/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: targetStage }),
    });
  }

  async function openFollowUp(lead: Lead) {
    setFollowUp({ lead, message: "", loading: true });
    const res = await fetch("/api/followup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: lead.id }),
    });
    const data = await res.json();
    setFollowUp((prev) => (prev ? { ...prev, message: data.message, loading: false } : null));
  }

  const visibleLeads = leads.filter((l) => passesFilter(daysSince(l.lastContactDate), filter));
  const activeLeadCard = activeId ? leads.find((l) => l.id === activeId) : null;
  const lastSync = leads.length;

  return (
    <>
      <header className="cmd-bar">
        <h1>Pipeline</h1>

        <div className="lofty" title="Synced from Lofty CRM">
          <span className="lg">L</span>
          <div>
            <div className="lt">
              Lofty CRM <span className="dot" />
            </div>
            <div className="ls">{lastSync} active leads</div>
          </div>
        </div>

        <div className="filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`fchip${filter === f.key ? " on" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button className="btn-coral-glow addbtn" onClick={() => setAddOpen(true)}>
          <Plus /> New Lead
        </button>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="board">
          {STAGES.map((stage) => {
            const stageLeads = visibleLeads.filter((l) => l.stage === stage.id);
            return (
              <DroppableColumn
                key={stage.id}
                stage={stage}
                leads={stageLeads}
                activeId={activeId}
                onFollowUp={openFollowUp}
                onOpenActions={(l) => setDrawerLead(l)}
              >
                {stage.id === "new_lead" && (
                  <AddLeadForm
                    open={addOpen}
                    setOpen={setAddOpen}
                    onAdd={(lead) => setLeads((prev) => [...prev, lead])}
                  />
                )}
              </DroppableColumn>
            );
          })}
        </div>

        <DragOverlay>
          {activeLeadCard && (
            <div
              className="pcard"
              style={{
                width: "256px",
                borderLeftColor: scoreColor(daysSince(activeLeadCard.lastContactDate)),
                boxShadow: "0 14px 32px rgba(0,0,0,.6)",
                transform: "rotate(-1.5deg)",
                cursor: "grabbing",
              }}
            >
              <div className="r1">
                <span
                  className="scoredot"
                  style={{ background: scoreColor(daysSince(activeLeadCard.lastContactDate)) }}
                />
                <div className="nm">{activeLeadCard.name}</div>
                {activeLeadCard.pricePoint != null && (
                  <span className="price tnum">
                    ${activeLeadCard.pricePoint >= 1000
                      ? `${Math.round(activeLeadCard.pricePoint / 1000)}K`
                      : activeLeadCard.pricePoint}
                  </span>
                )}
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <QuickActionDrawer
        lead={drawerLead}
        open={!!drawerLead}
        onClose={() => setDrawerLead(null)}
        onUpdate={(updated) => {
          setLeads((prev) => prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)));
          setDrawerLead(updated);
        }}
      />

      {followUp && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17,24,39,0.30)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => setFollowUp(null)}
        >
          <div
            className="glass"
            style={{ padding: "28px", maxWidth: "480px", width: "100%", margin: "0 16px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p
              style={{
                fontSize: "10px",
                letterSpacing: "0.18em",
                color: "var(--coral)",
                marginBottom: "16px",
                fontWeight: 700,
                textTransform: "uppercase",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Sparkles size={13} /> AI follow-up — {followUp.lead.name}
            </p>

            {followUp.loading ? (
              <p style={{ fontSize: "13px", color: "var(--white-50)", fontStyle: "italic" }}>
                Generating…
              </p>
            ) : (
              <>
                <p
                  style={{
                    fontSize: "14px",
                    lineHeight: 1.6,
                    color: "#fff",
                    marginBottom: "24px",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {followUp.message}
                </p>
                <div style={{ display: "flex", gap: "12px" }}>
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(followUp.message).then(() => setFollowUp(null))
                    }
                    className="btn-coral-glow"
                    style={{ fontSize: "11px" }}
                  >
                    Copy text
                  </button>
                  <button onClick={() => setFollowUp(null)} className="btn-glass" style={{ fontSize: "11px" }}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
