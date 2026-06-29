"use client";

import { useState } from "react";

interface Person {
  id: string;
  name: string;
  type: "sphere" | "pro";
}

function buildMessage(name: string, type: "sphere" | "pro"): string {
  const first = name.trim().split(" ")[0];
  if (type === "sphere") {
    return `Hey ${first}, wanted to hit you up personally before this goes live.\n\nThis is honestly the biggest event I've ever done for a listing and I'm genuinely fired up about it. We're doing a private preview at 90108 Basil Lane in St. Francisville on June 18th. Brand new construction, two years in the making on the design alone. Completely custom from top to bottom. The owner hand-planed 200 year old Pennsylvania barn beams himself and the doors came straight out of an Italian church. It's unlike anything I've ever walked through.\n\nI specifically thought of you for this one because I know you'd appreciate something like this, and honestly you might know someone who'd be interested in a property at this level too. I really want you there and it would mean a lot to me to have you come out.\n\nDoors open at 6pm on June 18th. Hit the RSVP and I'll hold your spot:\nhttps://www.facebook.com/events/1311778061141076\n\nText me if anything comes up. (225) 747-0303.`;
  }
  return `Hey ${first}, wanted to hit you up personally before this goes live.\n\nThis is honestly the biggest event I've ever done for a listing and I'm genuinely fired up about it. We're doing a private preview at 90108 Basil Lane in St. Francisville on June 18th. Brand new construction, two years in the making on the design alone. Completely custom from top to bottom. The owner hand-planed 200 year old Pennsylvania barn beams himself and the doors came straight out of an Italian church. It's unlike anything I've ever walked through.\n\nI specifically thought of you for this one. I know you'd appreciate something like this and you might know someone who'd be serious about a property at this level. I'm also holding a broker window from 5 to 6pm if you want to walk it before the other guests arrive. Strong buyer-agent incentive on an accepted offer within 60 days too. Reach out and I'll send you the full details.\n\nDoors open at 6pm on June 18th. Hit the RSVP and I'll hold your spot:\nhttps://www.facebook.com/events/1311778061141076\n\nText me if anything comes up. (225) 747-0303.`;
}

type MessageMode = "sphere" | "pro" | "split" | null;

export default function MessengerOutreachPage() {
  const [mode, setMode] = useState<MessageMode>(null);
  const [sphereInput, setSphereInput] = useState("");
  const [proInput, setProInput] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [step, setStep] = useState<"ask" | "paste" | "send">("ask");

  function parseNames(text: string, type: "sphere" | "pro", offset = 0): Person[] {
    return text
      .split(/[\n,]+/)
      .map(l => l.trim())
      .filter(l => l.length > 1)
      .map((name, i) => ({ id: `${type}-${i + offset}`, name, type }));
  }

  function buildList() {
    let list: Person[] = [];
    if (mode === "sphere") list = parseNames(sphereInput, "sphere");
    else if (mode === "pro") list = parseNames(proInput, "pro");
    else if (mode === "split") {
      const s = parseNames(sphereInput, "sphere");
      const p = parseNames(proInput, "pro", s.length);
      list = [...s, ...p];
    }
    setPeople(list);
    setStep("send");
  }

  async function handleSend(person: Person) {
    const msg = buildMessage(person.name, person.type);
    try { await navigator.clipboard.writeText(msg); } catch {}
    setCopied(person.id);
    setTimeout(() => setCopied(null), 2500);
    window.open("https://www.messenger.com/", "_blank");
    setSent(prev => new Set(prev).add(person.id));
  }

  const remaining = people.filter(p => !sent.has(p.id)).length;
  const progress = people.length > 0 ? Math.round((sent.size / people.length) * 100) : 0;

  const modeOptions: { value: MessageMode; title: string; desc: string }[] = [
    {
      value: "sphere",
      title: "Friends & Clients",
      desc: "Personal tone — excited you're coming, event details, your cell number at the end.",
    },
    {
      value: "pro",
      title: "Agents & Investors",
      desc: "Professional tone — broker preview window 5–6pm, buyer-agent incentive, bring a client.",
    },
    {
      value: "split",
      title: "Both — I'll paste two lists",
      desc: "Paste your personal contacts and your industry contacts separately.",
    },
  ];

  const sphereCount = sphereInput.split(/[\n,]+/).filter(l => l.trim().length > 1).length;
  const proCount = proInput.split(/[\n,]+/).filter(l => l.trim().length > 1).length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--aire-bg)", padding: "36px 32px 80px 112px" }}>

      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--aire-text)", marginBottom: 4 }}>
          Messenger Outreach
        </h1>
        <p style={{ fontSize: 12, color: "var(--aire-muted)" }}>
          Basil Lane Private Preview · June 18 · {people.length > 0 ? `${sent.size} / ${people.length} sent` : "Personal DMs to your confirmed guests"}
        </p>
      </div>

      {/* Step 1: Ask what they want */}
      {step === "ask" && (
        <div style={{ maxWidth: 560 }}>
          <p style={{ fontSize: 13, color: "var(--aire-text-2)", marginBottom: 24, lineHeight: 1.6 }}>
            Who are you messaging?
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {modeOptions.map(opt => (
              <button
                key={opt.value as string}
                onClick={() => { setMode(opt.value); setStep("paste"); }}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-start",
                  padding: "18px 20px", borderRadius: 14, cursor: "pointer",
                  background: "var(--aire-card)", border: "1px solid var(--aire-border)",
                  textAlign: "left", fontFamily: "inherit", transition: "border-color 150ms",
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--aire-coral)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--aire-border)")}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--aire-text)", marginBottom: 4 }}>
                  {opt.title}
                </span>
                <span style={{ fontSize: 11, color: "var(--aire-muted)", lineHeight: 1.5 }}>
                  {opt.desc}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Paste names */}
      {step === "paste" && (
        <div style={{ maxWidth: 580 }}>
          <button
            onClick={() => { setStep("ask"); setMode(null); }}
            style={{ fontSize: 11, color: "var(--aire-muted)", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 20, fontFamily: "inherit" }}
          >
            ← Back
          </button>

          <div style={{ background: "var(--aire-card)", border: "1px solid var(--aire-border)", borderRadius: 16, padding: 24, marginBottom: 16 }}>
            <p style={{ fontSize: 10, letterSpacing: "0.1em", fontWeight: 700, color: "var(--aire-muted)", textTransform: "uppercase" as const, marginBottom: 8 }}>
              {mode === "split" ? "Friends & Clients" : mode === "sphere" ? "Friends & Clients" : "Agents & Investors"}
            </p>
            <p style={{ fontSize: 12, color: "var(--aire-text-2)", marginBottom: 12, lineHeight: 1.6 }}>
              Go to your Facebook event → click <strong>Going</strong> → copy the names → paste below. One per line or comma separated.
            </p>
            <textarea
              value={mode === "pro" ? proInput : sphereInput}
              onChange={e => mode === "pro" ? setProInput(e.target.value) : setSphereInput(e.target.value)}
              rows={8}
              placeholder={"John Smith\nSarah Johnson\nMike Williams"}
              autoFocus
              style={{
                width: "100%", padding: "12px 14px", fontSize: 13, lineHeight: 1.7,
                background: "rgba(0,0,0,0.03)", border: "1px solid var(--aire-border)",
                borderRadius: 10, color: "var(--aire-text)", outline: "none",
                resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" as const,
              }}
            />
            <p style={{ fontSize: 11, color: "var(--aire-muted)", marginTop: 6 }}>
              {mode === "pro" ? proCount : sphereCount} names detected
            </p>
          </div>

          {mode === "split" && (
            <div style={{ background: "var(--aire-card)", border: "1px solid var(--aire-border)", borderRadius: 16, padding: 24, marginBottom: 16 }}>
              <p style={{ fontSize: 10, letterSpacing: "0.1em", fontWeight: 700, color: "var(--aire-muted)", textTransform: "uppercase" as const, marginBottom: 8 }}>
                Agents & Investors
              </p>
              <textarea
                value={proInput}
                onChange={e => setProInput(e.target.value)}
                rows={6}
                placeholder={"Agent Name\nInvestor Name"}
                style={{
                  width: "100%", padding: "12px 14px", fontSize: 13, lineHeight: 1.7,
                  background: "rgba(0,0,0,0.03)", border: "1px solid var(--aire-border)",
                  borderRadius: 10, color: "var(--aire-text)", outline: "none",
                  resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" as const,
                }}
              />
              <p style={{ fontSize: 11, color: "var(--aire-muted)", marginTop: 6 }}>
                {proCount} names detected
              </p>
            </div>
          )}

          <button
            onClick={buildList}
            disabled={(mode === "sphere" && sphereCount === 0) || (mode === "pro" && proCount === 0) || (mode === "split" && sphereCount + proCount === 0)}
            style={{
              width: "100%", padding: "14px", borderRadius: 12, fontSize: 12,
              letterSpacing: "0.1em", fontWeight: 700, fontFamily: "inherit",
              background: "var(--aire-coral)", border: "none", color: "#fff",
              cursor: "pointer", transition: "opacity 150ms",
              opacity: (mode === "sphere" && sphereCount === 0) || (mode === "pro" && proCount === 0) || (mode === "split" && sphereCount + proCount === 0) ? 0.4 : 1,
            }}
          >
            BUILD OUTREACH LIST →
          </button>
        </div>
      )}

      {/* Step 3: Send */}
      {step === "send" && (
        <>
          <div style={{ maxWidth: 720, marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" as const, alignItems: "center" }}>
              {[
                { label: "Total", val: people.length, color: "var(--aire-text)" },
                { label: "Sent", val: sent.size, color: "#4ade80" },
                { label: "Remaining", val: remaining, color: "var(--aire-coral)" },
              ].map(s => (
                <div key={s.label} style={{ background: "var(--aire-card)", border: "1px solid var(--aire-border)", borderRadius: 12, padding: "10px 18px" }}>
                  <p style={{ fontSize: 20, fontWeight: 700, color: s.color, margin: 0 }}>{s.val}</p>
                  <p style={{ fontSize: 9, color: "var(--aire-muted)", letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: 0 }}>{s.label}</p>
                </div>
              ))}
              <div style={{ flex: 1, minWidth: 160, background: "var(--aire-card)", border: "1px solid var(--aire-border)", borderRadius: 12, padding: "10px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <p style={{ fontSize: 9, color: "var(--aire-muted)", letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: 0 }}>Progress</p>
                  <p style={{ fontSize: 9, color: "var(--aire-coral)", fontWeight: 700, margin: 0 }}>{progress}%</p>
                </div>
                <div style={{ background: "var(--aire-border)", borderRadius: 99, height: 6 }}>
                  <div style={{ width: `${progress}%`, background: "var(--aire-coral)", borderRadius: 99, height: "100%", transition: "width 400ms" }} />
                </div>
              </div>
              <button
                onClick={() => { setStep("ask"); setMode(null); setSent(new Set()); setSphereInput(""); setProInput(""); setPeople([]); }}
                style={{ padding: "10px 14px", borderRadius: 12, fontSize: 10, background: "transparent", border: "1px solid var(--aire-border)", color: "var(--aire-muted)", cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.06em" }}
              >
                START OVER
              </button>
            </div>
            <p style={{ fontSize: 11, color: "var(--aire-muted)" }}>
              Click a card → message copies to clipboard → Messenger opens → search their name → paste → send.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12, maxWidth: 1020 }}>
            {people.map(person => {
              const isSent = sent.has(person.id);
              const isCopied = copied === person.id;
              const msg = buildMessage(person.name, person.type);

              return (
                <div key={person.id} style={{
                  background: isSent ? "rgba(74,222,128,0.04)" : "var(--aire-card)",
                  border: `1px solid ${isSent ? "rgba(74,222,128,0.2)" : "var(--aire-border)"}`,
                  borderRadius: 14, padding: "14px 16px",
                  display: "flex", flexDirection: "column", gap: 10,
                  opacity: isSent ? 0.65 : 1, transition: "all 200ms",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                        background: person.type === "sphere"
                          ? "linear-gradient(135deg, var(--aire-coral), #f59e0b)"
                          : "linear-gradient(135deg, var(--blue), #a78bfa)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 700, color: "#fff",
                      }}>
                        {person.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--aire-text)", margin: 0 }}>{person.name}</p>
                        <p style={{ fontSize: 10, color: person.type === "sphere" ? "var(--aire-coral)" : "var(--blue)", margin: 0, fontWeight: 600 }}>
                          {person.type === "sphere" ? "PERSONAL" : "PRO"}
                        </p>
                      </div>
                    </div>
                    {isSent && <span style={{ fontSize: 9, color: "#4ade80", fontWeight: 700 }}>✓ SENT</span>}
                  </div>

                  <p style={{
                    fontSize: 11, color: "var(--aire-text-2)", lineHeight: 1.55, margin: 0,
                    padding: "10px 12px", background: "rgba(0,0,0,0.03)", borderRadius: 8,
                    display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const, overflow: "hidden",
                  }}>
                    {msg}
                  </p>

                  <button
                    onClick={() => handleSend(person)}
                    style={{
                      width: "100%", padding: "10px", borderRadius: 10, fontSize: 11,
                      letterSpacing: "0.07em", fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                      background: isCopied ? "rgba(74,222,128,0.12)" : "rgba(24,119,242,0.08)",
                      border: `1px solid ${isCopied ? "rgba(74,222,128,0.35)" : "rgba(24,119,242,0.2)"}`,
                      color: isCopied ? "#4ade80" : "#1877F2",
                      transition: "all 150ms",
                    }}
                  >
                    {isCopied ? "✓ COPIED — MESSENGER IS OPEN" : "📋  COPY + OPEN MESSENGER"}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
