"use client";

import { useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function LogDealModal({ open, onClose, onSaved }: Props) {
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Baton Rouge");
  const [salePrice, setSalePrice] = useState("");
  const [commission, setCommission] = useState("");
  const [commissionPct, setCommissionPct] = useState("3");
  const [side, setSide] = useState<"buyer" | "seller" | "both">("buyer");
  const [status, setStatus] = useState<"closed" | "pending">("closed");
  const [contractDate, setContractDate] = useState(new Date().toISOString().slice(0, 10));
  const [closingDate, setClosingDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Auto-calc commission from price + pct when both filled
  function syncCommissionFromPct() {
    const price = parseFloat(salePrice);
    const pct = parseFloat(commissionPct);
    if (!isNaN(price) && !isNaN(pct)) {
      setCommission(String(Math.round((price * pct) / 100)));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          city,
          salePrice,
          commission,
          commissionPct,
          side,
          contractDate,
          closingDate,
          status,
          source: "manual",
          notes,
        }),
      });
      setAddress(""); setSalePrice(""); setCommission(""); setNotes("");
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26,26,28,0.40)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: "20px",
        animation: "fade-in 200ms var(--ease-out-expo) both",
      }}
    >
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--aire-card)",
          border: "1px solid var(--aire-border)",
          borderRadius: "20px",
          padding: "32px",
          maxWidth: "540px",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
          boxShadow: "var(--shadow-card-hover)",
          animation: "scale-in 280ms var(--ease-out-expo) both",
        }}
      >
        <div>
          <p
            style={{
              fontSize: "10px",
              letterSpacing: "0.20em",
              color: "var(--aire-muted)",
              textTransform: "uppercase",
              marginBottom: "8px",
              fontWeight: 500,
            }}
          >
            Log a Deal
          </p>
          <h2
            className="font-display"
            style={{
              fontSize: "28px",
              color: "var(--aire-text)",
              letterSpacing: "-0.01em",
              lineHeight: 1.1,
            }}
          >
            New transaction
          </h2>
        </div>

        <Field label="Address">
          <input
            required
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="1234 Magnolia Dr"
            className="aire-input"
          />
        </Field>

        <Field label="City">
          <input
            value={city}
            onChange={e => setCity(e.target.value)}
            placeholder="Baton Rouge"
            className="aire-input"
          />
        </Field>

        {/* Side toggle — pill style */}
        <Field label="Side">
          <div style={{ display: "flex", gap: "6px" }}>
            {(["buyer", "seller", "both"] as const).map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => setSide(opt)}
                className={side === opt ? "pill pill-ink" : "pill"}
                style={{
                  flex: 1,
                  justifyContent: "center",
                  textTransform: "capitalize",
                  cursor: "pointer",
                  padding: "9px 14px",
                  fontSize: "12px",
                  transition: "background 200ms, color 200ms",
                }}
              >
                {opt === "both" ? "Both (dual)" : opt}
              </button>
            ))}
          </div>
        </Field>

        {/* Price + commission — 2 col */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <Field label="Sale price">
            <input
              required
              type="number"
              value={salePrice}
              onChange={e => setSalePrice(e.target.value)}
              onBlur={syncCommissionFromPct}
              placeholder="485000"
              className="aire-input"
            />
          </Field>
          <Field label="Commission $">
            <input
              required
              type="number"
              value={commission}
              onChange={e => setCommission(e.target.value)}
              placeholder="14550"
              className="aire-input"
            />
          </Field>
        </div>

        <Field label="Commission %">
          <input
            type="number"
            step="0.01"
            value={commissionPct}
            onChange={e => setCommissionPct(e.target.value)}
            onBlur={syncCommissionFromPct}
            className="aire-input"
            style={{ maxWidth: "140px" }}
          />
        </Field>

        {/* Contract + closing dates — 2 col */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <Field label="Contract date">
            <input
              type="date"
              value={contractDate}
              onChange={e => setContractDate(e.target.value)}
              className="aire-input"
            />
          </Field>
          <Field label="Closing date">
            <input
              required
              type="date"
              value={closingDate}
              onChange={e => setClosingDate(e.target.value)}
              className="aire-input"
            />
          </Field>
        </div>

        {/* Status pills — Closed (mint) / Pending (cream) */}
        <Field label="Status">
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setStatus("closed")}
              className={status === "closed" ? "pill pill-mint" : "pill"}
              style={{
                cursor: "pointer",
                opacity: status === "closed" ? 1 : 0.55,
                fontWeight: status === "closed" ? 600 : 400,
                transition: "opacity 200ms",
              }}
            >
              Closed
            </button>
            <button
              type="button"
              onClick={() => setStatus("pending")}
              className={status === "pending" ? "pill pill-cream" : "pill"}
              style={{
                cursor: "pointer",
                opacity: status === "pending" ? 1 : 0.55,
                fontWeight: status === "pending" ? 600 : 400,
                transition: "opacity 200ms",
              }}
            >
              Pending
            </button>
          </div>
        </Field>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Buyer was referred by..."
            rows={2}
            className="aire-input"
            style={{ resize: "vertical", fontFamily: "inherit" }}
          />
        </Field>

        <div style={{ display: "flex", gap: "10px", marginTop: "8px", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost"
            style={{ padding: "12px 22px" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn-coral"
            style={{
              padding: "12px 28px",
              opacity: saving ? 0.6 : 1,
              cursor: saving ? "default" : "pointer",
            }}
          >
            {saving ? "SAVING…" : "SAVE DEAL"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label
        style={{
          fontSize: "10px",
          letterSpacing: "0.18em",
          color: "var(--aire-muted)",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
