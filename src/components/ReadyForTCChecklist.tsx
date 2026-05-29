"use client";

/**
 * Ready-for-TC Checklist.
 *
 * Lives on the contact profile when a deal is under_contract. Shows a 4-item
 * readiness gate so Caleb can see — at a glance — whether a deal is ready
 * for the Transaction Coordinator handoff or what's still missing. When all
 * four items are green, the big coral CTA fires the same packet flow the
 * dashboard TCHandoffPanel uses.
 *
 * Pure presentation — parent owns the send logic (see TCHandoffPanel for the
 * mailto + optimistic update pattern).
 */

interface Lead {
  id: string;
  stage: string;
  preApproved: boolean;
  nextActionDate: string | null;
  nextActionNote: string | null;
  contractDate: string | null;
  closingDate: string | null;
  timeline_logs: { method: string; createdAt: string }[];
}

interface Props {
  lead: Lead;
  onSendPacket: () => void;
}

export default function ReadyForTCChecklist({ lead, onSendPacket }: Props) {
  if (lead.stage !== "under_contract") return null;

  const packetSent = lead.timeline_logs.some((log) => log.method === "tc_handoff");

  const items = [
    {
      label: "Pre-approved",
      done: lead.preApproved,
      hint: "Mark pre-approval status in the contact header",
    },
    {
      label: "Contract date set",
      done: lead.contractDate !== null,
      hint: "Add the executed-contract date in the Contract block",
    },
    {
      label: "Closing date set",
      done: lead.closingDate !== null,
      hint: "Add the scheduled closing date — triggers walk-through + closing tasks",
    },
    {
      label: "TC packet sent",
      done: packetSent,
      hint: "Send the packet below once the other items are green",
    },
  ];

  const allFourDone = items.every((i) => i.done);
  const readinessItems = items.slice(0, 3);
  const allReady = readinessItems.every((i) => i.done);

  return (
    <div
      style={{
        background: "var(--aire-card)",
        border: allFourDone
          ? "1px solid rgba(238,129,114,0.30)"
          : "1px solid var(--aire-border)",
        borderRadius: "16px",
        padding: "20px",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
        <p
          style={{
            fontSize: "10px",
            letterSpacing: "0.16em",
            color: "var(--aire-text-2)",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          READY FOR TC?
        </p>
        <div style={{ flex: 1, height: "1px", background: "var(--aire-border)" }} />
        {allReady && !packetSent && (
          <span
            style={{
              fontSize: "10px",
              color: "var(--aire-coral-deep)",
              letterSpacing: "0.1em",
              fontWeight: 600,
            }}
          >
            ALL CLEAR
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
        {items.map((item) => (
          <div
            key={item.label}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              padding: "10px 12px",
              background: item.done ? "var(--aire-mint-soft)" : "var(--aire-card-warm)",
              border: `1px solid ${item.done ? "rgba(184,230,208,0.50)" : "var(--aire-border)"}`,
              borderRadius: "10px",
            }}
          >
            <span
              style={{
                fontSize: "14px",
                lineHeight: "16px",
                color: item.done ? "#2d7a55" : "var(--aire-muted)",
                fontWeight: 700,
                width: "14px",
                flexShrink: 0,
              }}
            >
              {item.done ? "✓" : "○"}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: "12px",
                  color: item.done ? "var(--aire-text)" : "var(--aire-text-2)",
                  fontWeight: 500,
                  marginBottom: item.done ? 0 : "2px",
                }}
              >
                {item.label}
              </p>
              {!item.done && (
                <p
                  style={{
                    fontSize: "10px",
                    color: "var(--aire-muted)",
                    fontStyle: "italic",
                  }}
                >
                  {item.hint}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {packetSent ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "12px",
            background: "var(--aire-mint-soft)",
            border: "1px solid rgba(184,230,208,0.50)",
            borderRadius: "999px",
            color: "#2d7a55",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.1em",
          }}
        >
          <span>{"✓"} PACKET SENT</span>
        </div>
      ) : allReady ? (
        <button
          onClick={onSendPacket}
          style={{
            width: "100%",
            padding: "14px",
            background: "var(--aire-coral)",
            color: "var(--aire-ink)",
            border: "none",
            borderRadius: "999px",
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            cursor: "pointer",
            boxShadow: "0 0 24px rgba(238,129,114,0.30)",
            animation: "reve-tc-pulse 2.2s ease-out infinite",
            transition: "background 150ms, transform 150ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--aire-coral-deep)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--aire-coral)";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          SEND TO TC NOW {"→"}
        </button>
      ) : (
        <button
          disabled
          style={{
            width: "100%",
            padding: "14px",
            background: "var(--aire-card-warm)",
            color: "var(--aire-muted)",
            border: "1px solid var(--aire-border)",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            cursor: "not-allowed",
          }}
        >
          Complete checklist to send
        </button>
      )}

      <style jsx>{`
        @keyframes reve-tc-pulse {
          0% {
            box-shadow: 0 0 24px rgba(238, 129, 114, 0.30), 0 0 0 0 rgba(238, 129, 114, 0.55);
          }
          70% {
            box-shadow: 0 0 24px rgba(238, 129, 114, 0.30), 0 0 0 14px rgba(238, 129, 114, 0);
          }
          100% {
            box-shadow: 0 0 24px rgba(238, 129, 114, 0.30), 0 0 0 0 rgba(238, 129, 114, 0);
          }
        }
      `}</style>
    </div>
  );
}
