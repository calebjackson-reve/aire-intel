"use client";

interface Lead {
  id: string;
  stage: string;
  preApproved: boolean;
  nextActionDate: string | null;
  lastContactDate: string | null;
  timeline_logs: { method: string; note: string | null; createdAt: string }[];
  tasks: { id: string; done: boolean; title: string }[];
}

interface Props {
  lead: Lead;
  onAdvance: (nextStage: string) => void;
}

interface Suggestion {
  nextStage: string;
  reason: string;
}

function inferNextStage(lead: Lead): Suggestion | null {
  const { stage, preApproved, nextActionDate, timeline_logs, tasks } = lead;

  // Rule 1: new_lead + pre-approved -> active
  if (stage === "new_lead" && preApproved === true) {
    return { nextStage: "active", reason: "Pre-approved — ready to engage" };
  }

  // Rule 2: active + pre-approved + task mentions showing -> showing
  if (
    stage === "active" &&
    preApproved === true &&
    tasks.some((t) => /showing|tour|see|visit/i.test(t.title))
  ) {
    return { nextStage: "showing", reason: "Showing planned" };
  }

  // Rule 3: active + timeline log method === "showing" -> showing
  if (
    stage === "active" &&
    timeline_logs.some((log) => log.method === "showing")
  ) {
    return { nextStage: "showing", reason: "Showing already happened" };
  }

  // Rule 4: showing + timeline note mentions offer/contract -> under_contract
  if (
    stage === "showing" &&
    timeline_logs.some(
      (log) => log.note && /offer|contract|under contract/i.test(log.note),
    )
  ) {
    return { nextStage: "under_contract", reason: "Offer activity detected" };
  }

  // Rule 5: under_contract + closing date passed -> closed
  if (
    stage === "under_contract" &&
    nextActionDate &&
    new Date(nextActionDate) <= new Date()
  ) {
    return { nextStage: "closed", reason: "Closing date passed" };
  }

  return null;
}

export default function StageProgressor({ lead, onAdvance }: Props) {
  const suggestion = inferNextStage(lead);

  if (!suggestion) return null;

  const { nextStage, reason } = suggestion;
  const label = nextStage.replace(/_/g, " ").toUpperCase();

  return (
    <button
      type="button"
      onClick={() => onAdvance(nextStage)}
      title={reason}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 14px",
        fontSize: 12,
        fontFamily: "inherit",
        borderRadius: 999,
        border: "1px solid rgba(184,230,208,0.50)",
        background: "var(--aire-mint-soft)",
        color: "var(--aire-text)",
        cursor: "pointer",
        lineHeight: 1,
        letterSpacing: 0.3,
        transition: "background 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--aire-mint)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--aire-mint-soft)";
      }}
    >
      <span style={{ color: "var(--aire-muted)", fontWeight: 400 }}>
        Next →
      </span>
      <span
        style={{
          color: "#2d7a55",
          textTransform: "uppercase",
          fontWeight: 600,
          letterSpacing: 0.5,
        }}
      >
        {label}?
      </span>
    </button>
  );
}
