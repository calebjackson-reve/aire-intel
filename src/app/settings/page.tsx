"use client";

import { useState, useEffect, useCallback } from "react";

interface SettingStatus {
  set: boolean;
  preview?: string;
}
type SettingsMap = Record<string, SettingStatus>;

interface SyncEvent {
  status: "fetching" | "done" | "error";
  message: string;
  created?: number;
  updated?: number;
  skipped?: number;
  total?: number;
}

function StatusBadge({ set }: { set: boolean }) {
  return (
    <span
      className={set ? "pill-mint" : "pill-coral"}
      style={{
        fontSize: "10px",
        letterSpacing: "0.12em",
        padding: "3px 10px",
        fontWeight: 600,
      }}
    >
      {set ? "CONNECTED" : "NOT SET"}
    </span>
  );
}

function SectionHeader({ title, eyebrow, description, connected }: { title: string; eyebrow: string; description: string; connected: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
      <div>
        <p style={{ fontSize: "10px", letterSpacing: "0.20em", color: "var(--aire-muted)", marginBottom: "6px", textTransform: "uppercase" }}>{eyebrow}</p>
        <h2 className="font-display" style={{ fontSize: "20px", color: "var(--aire-ink)", marginBottom: "6px" }}>{title}</h2>
        <p style={{ fontSize: "12px", color: "var(--aire-text-2)" }}>{description}</p>
      </div>
      <StatusBadge set={connected} />
    </div>
  );
}

// Style for the inline info/setup boxes (replaces old reve-black panels)
const setupBoxStyle: React.CSSProperties = {
  background: "var(--aire-card-warm)",
  border: "1px solid var(--aire-border)",
  borderRadius: "10px",
  padding: "16px",
  marginBottom: "20px",
};

// Style for "connected" success notes
const connectedNoteStyle: React.CSSProperties = {
  background: "var(--aire-mint-soft)",
  border: "1px solid rgba(45,122,85,0.18)",
  borderRadius: "10px",
  padding: "14px 16px",
  marginBottom: "20px",
};

const MINT_INK = "#2d7a55";

export default function Settings() {
  const [statuses, setStatuses] = useState<SettingsMap>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  // Lofty sync state
  const [loftyClientId, setLoftyClientId] = useState("");
  const [loftyClientSecret, setLoftyClientSecret] = useState("");
  const [loftyCustomerKey, setLoftyCustomerKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncEvents, setSyncEvents] = useState<SyncEvent[]>([]);
  const [syncDone, setSyncDone] = useState<SyncEvent | null>(null);

  // Paragon state
  const [paragonUrl, setParagonUrl] = useState("");
  const [paragonKey, setParagonKey] = useState("");

  // Meta state
  const [metaToken, setMetaToken] = useState("");
  const [metaPageId, setMetaPageId] = useState("");
  const [metaIgId, setMetaIgId] = useState("");

  // Google state
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [googleSyncResult, setGoogleSyncResult] = useState<{ created: number; merged: number; skipped: number; total: number } | null>(null);
  const [googleSyncError, setGoogleSyncError] = useState<string | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<{ created: number; merged: number; skipped: number; total: number } | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  // Twilio
  const [twilioSid, setTwilioSid] = useState("");
  const [twilioToken, setTwilioToken] = useState("");
  const [twilioPhone, setTwilioPhone] = useState("");

  // SendGrid
  const [sgKey, setSgKey] = useState("");
  const [sgFrom, setSgFrom] = useState("");

  // Calendly
  const [calendlyKey, setCalendlyKey] = useState("");

  // Dotloop
  const [dotloopToken, setDotloopToken] = useState("");
  const [dotloopProfile, setDotloopProfile] = useState("");

  // Zapier
  const [zapierUrl, setZapierUrl] = useState("");

  // RPR
  const [rprUser, setRprUser] = useState("");
  const [rprPass, setRprPass] = useState("");

  // Team — TC + Showing Assistant (the two roles a solo agent actually has)
  const [tcName, setTcName] = useState("");
  const [tcEmail, setTcEmail] = useState("");
  const [tcPhone, setTcPhone] = useState("");
  const [saName, setSaName] = useState("");
  const [saEmail, setSaEmail] = useState("");
  const [saPhone, setSaPhone] = useState("");

  const loadStatuses = useCallback(async () => {
    const data = await fetch("/api/settings").then(r => r.json()).catch(() => ({}));
    setStatuses(data);
  }, []);

  useEffect(() => { loadStatuses(); }, [loadStatuses]);

  useEffect(() => {
    fetch("/api/google/contacts/sync").then(r => r.json()).then(d => setGoogleConnected(d.connected)).catch(() => {});
  }, []);

  async function saveSection(section: string, payload: Record<string, string>) {
    setSaving(section);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaveResult(prev => ({
      ...prev,
      [section]: data.ok
        ? { ok: true, msg: `Saved: ${data.saved.join(", ")}` }
        : { ok: false, msg: data.error ?? "Save failed" },
    }));
    setSaving(null);
    if (data.ok) loadStatuses();
  }

  /** Fire a real Twilio SMS to confirm the connection. Prompts for a US phone. */
  async function testTwilio() {
    const to = window.prompt("Send a test SMS to which phone number? (E.164 format, e.g. +12255551234)");
    if (!to) return;
    setSaving("twilio_test");
    const res = await fetch("/api/sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, message: "AIRE Twilio test — if you got this, SMS is live." }),
    });
    const data = await res.json();
    setSaveResult(prev => ({
      ...prev,
      twilio: data.ok
        ? { ok: true, msg: `Test sent (status: ${data.status ?? "queued"})` }
        : { ok: false, msg: data.error ?? "Test failed" },
    }));
    setSaving(null);
  }

  /** Fire a real SendGrid email to confirm the connection. */
  async function testSendGrid() {
    const to = window.prompt("Send a test email to which address?");
    if (!to) return;
    setSaving("sendgrid_test");
    const res = await fetch("/api/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        subject: "AIRE SendGrid test",
        message: "If you got this, your SendGrid connection is live.",
      }),
    });
    const data = await res.json();
    setSaveResult(prev => ({
      ...prev,
      sendgrid: data.ok
        ? { ok: true, msg: "Test sent" }
        : { ok: false, msg: data.error ?? "Test failed" },
    }));
    setSaving(null);
  }

  async function testLofty() {
    setTesting(true);
    setTestResult(null);
    const res = await fetch("/api/lofty/sync", {
      method: "GET",
      headers: {
        "x-lofty-client-id": loftyClientId.trim(),
        "x-lofty-client-secret": loftyClientSecret.trim(),
        "x-lofty-customer-key": loftyCustomerKey.trim(),
      },
    });
    const data = await res.json();
    setTestResult({
      ok: data.ok,
      message: data.ok ? `Connected — ${data.total?.toLocaleString()} contacts in Lofty` : data.error,
    });
    setTesting(false);
  }

  async function runSync() {
    setSyncing(true);
    setSyncEvents([]);
    setSyncDone(null);
    // If credentials are in .env, send empty body — server uses env vars automatically
    const body = loftyClientId.trim()
      ? JSON.stringify({ clientId: loftyClientId.trim(), clientSecret: loftyClientSecret.trim(), customerKey: loftyCustomerKey.trim() })
      : JSON.stringify({});
    const res = await fetch("/api/lofty/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) return;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const event: SyncEvent = JSON.parse(line);
          if (event.status === "done" || event.status === "error") setSyncDone(event);
          else setSyncEvents(prev => [...prev, event]);
        } catch {}
      }
    }
    setSyncing(false);
  }

  const tcConfigured = !!(statuses["TC_NAME"]?.set && (statuses["TC_EMAIL"]?.set || statuses["TC_PHONE"]?.set));
  const saConfigured = !!(statuses["SHOWING_ASSISTANT_NAME"]?.set && (statuses["SHOWING_ASSISTANT_EMAIL"]?.set || statuses["SHOWING_ASSISTANT_PHONE"]?.set));
  const loftyConnected = !!(statuses["LOFTY_CONNECTED"]?.set);
  const paragonConnected = !!(statuses["PARAGON_API_URL"]?.set && statuses["PARAGON_API_KEY"]?.set);
  const metaConnected = !!(statuses["META_PAGE_ACCESS_TOKEN"]?.set && statuses["META_PAGE_ID"]?.set);
  const googleCredsSet = !!(statuses["GOOGLE_CLIENT_ID"]?.set && statuses["GOOGLE_CLIENT_SECRET"]?.set);
  const twilioConnected = !!(statuses["TWILIO_ACCOUNT_SID"]?.set && statuses["TWILIO_AUTH_TOKEN"]?.set && statuses["TWILIO_PHONE_NUMBER"]?.set);
  const sendgridConnected = !!(statuses["SENDGRID_API_KEY"]?.set && statuses["SENDGRID_FROM_EMAIL"]?.set);
  const calendlyConnected = !!(statuses["CALENDLY_API_KEY"]?.set);
  const dotloopConnected = !!(statuses["DOTLOOP_ACCESS_TOKEN"]?.set);
  const zapierConnected = !!(statuses["ZAPIER_WEBHOOK_URL"]?.set);
  const rprConnected = !!(statuses["RPR_USERNAME"]?.set && statuses["RPR_PASSWORD"]?.set);

  async function runGoogleSync() {
    setGoogleSyncing(true);
    setGoogleSyncResult(null);
    setGoogleSyncError(null);
    try {
      const res = await fetch("/api/google/contacts/sync", { method: "POST" });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const ev = JSON.parse(line);
            if (ev.status === "done") setGoogleSyncResult({ created: ev.created, merged: ev.merged, skipped: ev.skipped, total: ev.total });
            if (ev.status === "error") setGoogleSyncError(ev.message);
          } catch {}
        }
      }
    } catch (e) {
      setGoogleSyncError(e instanceof Error ? e.message : "Sync failed");
    }
    setGoogleSyncing(false);
  }

  async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvUploading(true);
    setCsvResult(null);
    setCsvError(null);
    try {
      const csv = await file.text();
      const res = await fetch("/api/google/contacts/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (data.ok) setCsvResult(data);
      else setCsvError(data.error ?? "Upload failed");
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Upload failed");
    }
    setCsvUploading(false);
    e.target.value = "";
  }

  const cardStyle: React.CSSProperties = {
    background: "var(--aire-card)",
    border: "1px solid var(--aire-border)",
    borderRadius: "16px",
    padding: "28px",
    marginBottom: "20px",
    boxShadow: "var(--shadow-card)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "10px",
    letterSpacing: "0.14em",
    color: "var(--aire-text-2)",
    display: "block",
    marginBottom: "6px",
    textTransform: "uppercase",
    fontWeight: 600,
  };

  const errorTextColor = "var(--aire-coral-deep)";
  const okTextColor = MINT_INK;

  return (
    <div style={{ padding: "32px 40px", maxWidth: "800px", margin: "0 auto" }}>
      <div style={{ marginBottom: "32px" }}>
        <p style={{ fontSize: "11px", letterSpacing: "0.20em", color: "var(--aire-muted)", marginBottom: "6px" }}>INTEGRATIONS</p>
        <h1 className="font-display" style={{ fontSize: "32px", color: "var(--aire-ink)" }}>Settings</h1>
        <div style={{ width: "32px", height: "2px", background: "var(--aire-coral)", marginTop: "10px" }} />
      </div>

      {/* Status overview */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "28px" }}>
        {[
          { label: "Lofty CRM", ok: loftyConnected, desc: "Leads & contacts" },
          { label: "Paragon MLS", ok: paragonConnected, desc: "Live listings" },
          { label: "Meta", ok: metaConnected, desc: "IG & Facebook" },
          { label: "Google", ok: googleConnected, desc: "Contacts & Calendar" },
          { label: "Twilio", ok: twilioConnected, desc: "Click-to-text" },
          { label: "SendGrid", ok: sendgridConnected, desc: "Email campaigns" },
          { label: "Calendly", ok: calendlyConnected, desc: "Booking links" },
          { label: "Dotloop", ok: dotloopConnected, desc: "Transaction docs" },
          { label: "Zapier", ok: zapierConnected, desc: "Automation" },
          { label: "RPR/Remine", ok: rprConnected, desc: "Market data" },
        ].map(({ label, ok, desc }) => (
          <div key={label} style={{
            background: ok ? "var(--aire-mint-soft)" : "var(--aire-card)",
            border: `1px solid ${ok ? "rgba(45,122,85,0.18)" : "var(--aire-border)"}`,
            borderRadius: "12px",
            padding: "14px 16px",
            boxShadow: "var(--shadow-card)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: ok ? MINT_INK : "var(--aire-border-2)",
                flexShrink: 0,
              }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--aire-ink)" }}>{label}</span>
            </div>
            <p style={{ fontSize: "11px", color: "var(--aire-text-2)", paddingLeft: "15px" }}>{ok ? "Connected" : desc}</p>
          </div>
        ))}
      </div>

      {/* ── YOUR TEAM ── */}
      <div style={cardStyle}>
        <SectionHeader
          eyebrow="YOUR TEAM"
          title="TC and showing assistant"
          description="AIRE routes handoff messages to these two. Solo agent, two helpers."
          connected={tcConfigured && saConfigured}
        />

        <div style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.16em", color: "var(--aire-ink)", fontWeight: 600 }}>
              TRANSACTION COORDINATOR
            </span>
            <StatusBadge set={tcConfigured} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
            <input type="text" value={tcName} onChange={e => setTcName(e.target.value)} placeholder="Name" className="aire-input" style={{ width: "100%", boxSizing: "border-box" }} />
            <input type="email" value={tcEmail} onChange={e => setTcEmail(e.target.value)} placeholder="Email" className="aire-input" style={{ width: "100%", boxSizing: "border-box" }} />
            <input type="tel" value={tcPhone} onChange={e => setTcPhone(e.target.value)} placeholder="Phone" className="aire-input" style={{ width: "100%", boxSizing: "border-box" }} />
          </div>
          <p style={{ fontSize: "11px", color: "var(--aire-muted)", marginTop: "8px" }}>
            {statuses["TC_NAME"]?.set ? `Saved: ${statuses["TC_NAME"].preview ?? ""}` : "Not yet configured"}
          </p>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.16em", color: "var(--aire-ink)", fontWeight: 600 }}>
              SHOWING ASSISTANT
            </span>
            <StatusBadge set={saConfigured} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
            <input type="text" value={saName} onChange={e => setSaName(e.target.value)} placeholder="Name" className="aire-input" style={{ width: "100%", boxSizing: "border-box" }} />
            <input type="email" value={saEmail} onChange={e => setSaEmail(e.target.value)} placeholder="Email" className="aire-input" style={{ width: "100%", boxSizing: "border-box" }} />
            <input type="tel" value={saPhone} onChange={e => setSaPhone(e.target.value)} placeholder="Phone" className="aire-input" style={{ width: "100%", boxSizing: "border-box" }} />
          </div>
          <p style={{ fontSize: "11px", color: "var(--aire-muted)", marginTop: "8px" }}>
            {statuses["SHOWING_ASSISTANT_NAME"]?.set ? `Saved: ${statuses["SHOWING_ASSISTANT_NAME"].preview ?? ""}` : "Not yet configured"}
          </p>
        </div>

        <button
          className="btn-primary"
          disabled={saving === "team"}
          onClick={() => saveSection("team", {
            TC_NAME: tcName,
            TC_EMAIL: tcEmail,
            TC_PHONE: tcPhone,
            SHOWING_ASSISTANT_NAME: saName,
            SHOWING_ASSISTANT_EMAIL: saEmail,
            SHOWING_ASSISTANT_PHONE: saPhone,
          })}
          style={{ padding: "10px 20px", fontSize: "12px" }}
        >
          {saving === "team" ? "Saving..." : "Save Team"}
        </button>
        {saveResult.team && (
          <p style={{ fontSize: "11px", color: saveResult.team.ok ? okTextColor : errorTextColor, marginTop: "8px" }}>
            {saveResult.team.msg}
          </p>
        )}
      </div>

      {/* ── LOFTY ── */}
      <div style={cardStyle}>
        <SectionHeader
          eyebrow="LOFTY CRM"
          title="Sync contacts and leads"
          description="OAuth 2.0 connection to your Lofty CRM — full address book + lead pipeline."
          connected={loftyConnected}
        />

        {loftyConnected && (
          <div style={connectedNoteStyle}>
            <p style={{ fontSize: "12px", color: MINT_INK }}>
              Lofty credentials are active in your environment. Use the sync button below to import contacts.
            </p>
          </div>
        )}

        {!loftyConnected && (
          <>
            {[
              { label: "CLIENT ID", value: loftyClientId, setter: setLoftyClientId, placeholder: "From developer.lofty.com", password: false },
              { label: "CLIENT SECRET", value: loftyClientSecret, setter: setLoftyClientSecret, placeholder: "From developer.lofty.com app", password: true },
              { label: "CUSTOMER KEY", value: loftyCustomerKey, setter: setLoftyCustomerKey, placeholder: "From Lofty CRM → Settings → Open API", password: true },
            ].map(({ label, value, setter, placeholder, password }) => (
              <div key={label} style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>{label}</label>
                <input
                  type={password ? "password" : "text"}
                  value={value} onChange={e => setter(e.target.value)}
                  placeholder={placeholder}
                  className="aire-input" style={{ width: "100%", fontFamily: "monospace", boxSizing: "border-box" }}
                />
              </div>
            ))}
            <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
              <button onClick={testLofty} disabled={!loftyClientId || !loftyClientSecret || !loftyCustomerKey || testing} className="btn-ghost" style={{ padding: "10px 18px", fontSize: "11px" }}>
                {testing ? "TESTING..." : "TEST CONNECTION"}
              </button>
              <button onClick={runSync} disabled={!loftyClientId || !loftyClientSecret || !loftyCustomerKey || syncing} className="btn-coral" style={{ padding: "10px 20px", fontSize: "11px" }}>
                {syncing ? "SYNCING..." : "SYNC CONTACTS →"}
              </button>
            </div>
            {testResult && <p style={{ fontSize: "12px", color: testResult.ok ? okTextColor : errorTextColor, marginBottom: "12px" }}>{testResult.message}</p>}
          </>
        )}

        {/* Sync button always visible when connected */}
        {loftyConnected && (
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={runSync} disabled={syncing} className="btn-coral" style={{ padding: "10px 20px", fontSize: "11px" }}>
              {syncing ? "SYNCING..." : "SYNC ALL CONTACTS →"}
            </button>
          </div>
        )}

        {(syncEvents.length > 0 || syncDone) && (
          <div style={{ marginTop: "20px", background: "var(--aire-card-warm)", border: "1px solid var(--aire-border)", borderRadius: "10px", padding: "16px" }}>
            {syncEvents.map((e, i) => <p key={i} style={{ fontSize: "12px", color: "var(--aire-text-2)", marginBottom: "4px" }}>↳ {e.message}</p>)}
            {syncDone && (
              <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--aire-border)" }}>
                {syncDone.status === "done" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
                    {[
                      { label: "IMPORTED", value: syncDone.created, color: okTextColor },
                      { label: "UPDATED", value: syncDone.updated, color: "var(--aire-coral-deep)" },
                      { label: "SKIPPED", value: syncDone.skipped, color: "var(--aire-muted)" },
                      { label: "TOTAL", value: syncDone.total, color: "var(--aire-ink)" },
                    ].map(({ label, value, color }) => (
                      <div key={label}>
                        <div className="font-display" style={{ fontSize: "26px", color }}>{value ?? 0}</div>
                        <div style={{ fontSize: "9px", letterSpacing: "0.14em", color: "var(--aire-muted)", marginTop: "2px" }}>{label}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: "13px", color: errorTextColor }}>Error: {syncDone.message}</p>
                )}
                {syncDone.status === "done" && (
                  <a href="/contacts" style={{ display: "inline-block", marginTop: "16px", fontSize: "11px", letterSpacing: "0.14em", color: "var(--aire-coral-deep)", textDecoration: "none", fontWeight: 600 }}>VIEW CONTACTS →</a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── PARAGON MLS ── */}
      <div style={cardStyle}>
        <SectionHeader
          eyebrow="PARAGON MLS"
          title="Live market listings"
          description="Powers buyer matching and your active listing dashboard."
          connected={paragonConnected}
        />

        {paragonConnected && (
          <div style={connectedNoteStyle}>
            <p style={{ fontSize: "12px", color: MINT_INK }}>Paragon is connected. Live listings and buyer matching are active.</p>
            <div style={{ marginTop: "8px", display: "flex", gap: "16px" }}>
              {statuses["PARAGON_API_URL"] && <span style={{ fontSize: "11px", color: "var(--aire-text-2)" }}>URL: {statuses["PARAGON_API_URL"].preview}</span>}
              {statuses["PARAGON_API_KEY"] && <span style={{ fontSize: "11px", color: "var(--aire-text-2)" }}>Key: {statuses["PARAGON_API_KEY"].preview}</span>}
            </div>
          </div>
        )}

        <div style={setupBoxStyle}>
          <p style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: "10px", fontWeight: 600 }}>HOW TO GET YOUR PARAGON API CREDENTIALS</p>
          <ol style={{ fontSize: "12px", color: "var(--aire-text)", lineHeight: "2.0", paddingLeft: "18px", margin: 0 }}>
            <li>Log into <strong>Paragon 5</strong> (your MLS platform)</li>
            <li>Go to <strong>My Profile → API Settings</strong> or contact your MLS board</li>
            <li>Request API access — they&apos;ll give you an endpoint URL and key</li>
            <li>Some boards use <strong>Spark API</strong> or <strong>RESO Web API</strong> — paste the base URL below</li>
          </ol>
        </div>

        {[
          { label: "PARAGON API URL", key: "PARAGON_API_URL", value: paragonUrl, setter: setParagonUrl, placeholder: "https://api.paragonrels.com/reso/odata", password: false },
          { label: "PARAGON API KEY", key: "PARAGON_API_KEY", value: paragonKey, setter: setParagonKey, placeholder: "Your Paragon API key or Bearer token", password: true },
        ].map(({ label, value, setter, placeholder, password }) => (
          <div key={label} style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>{label}</label>
            <input
              type={password ? "password" : "text"}
              value={value} onChange={e => setter(e.target.value)}
              placeholder={placeholder}
              className="aire-input" style={{ width: "100%", fontFamily: "monospace", boxSizing: "border-box" }}
            />
          </div>
        ))}

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            onClick={() => saveSection("paragon", { PARAGON_API_URL: paragonUrl, PARAGON_API_KEY: paragonKey })}
            disabled={!paragonUrl || !paragonKey || saving === "paragon"}
            className="btn-coral" style={{ padding: "10px 20px", fontSize: "11px" }}
          >
            {saving === "paragon" ? "SAVING..." : "SAVE & CONNECT →"}
          </button>
          {saveResult["paragon"] && (
            <p style={{ fontSize: "12px", color: saveResult["paragon"].ok ? okTextColor : errorTextColor }}>
              {saveResult["paragon"].msg}
            </p>
          )}
        </div>
      </div>

      {/* ── META ── */}
      <div style={cardStyle}>
        <SectionHeader
          eyebrow="META"
          title="Facebook and Instagram"
          description="Publish posts directly to your business page and Instagram from AIRE."
          connected={metaConnected}
        />

        {metaConnected && (
          <div style={connectedNoteStyle}>
            <p style={{ fontSize: "12px", color: MINT_INK }}>Meta is connected. One-click publish to IG and Facebook is active.</p>
            <div style={{ marginTop: "8px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
              {statuses["META_PAGE_ID"] && <span style={{ fontSize: "11px", color: "var(--aire-text-2)" }}>Page ID: {statuses["META_PAGE_ID"].preview}</span>}
              {statuses["META_IG_BUSINESS_ID"] && <span style={{ fontSize: "11px", color: "var(--aire-text-2)" }}>IG ID: {statuses["META_IG_BUSINESS_ID"].preview}</span>}
            </div>
          </div>
        )}

        <div style={setupBoxStyle}>
          <p style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: "10px", fontWeight: 600 }}>HOW TO GET YOUR META CREDENTIALS</p>
          <ol style={{ fontSize: "12px", color: "var(--aire-text)", lineHeight: "2.0", paddingLeft: "18px", margin: 0 }}>
            <li>Go to <strong>developers.facebook.com</strong> → My Apps</li>
            <li>Create an app → Business type → add <strong>Pages API</strong> product</li>
            <li>Go to <strong>Graph API Explorer</strong> → generate a Page Access Token for your Rêve page</li>
            <li>Your <strong>Page ID</strong> is in your Facebook page settings → About</li>
            <li>Your <strong>Instagram Business Account ID</strong>: in IG settings → Account → Meta Business Account</li>
          </ol>
        </div>

        {[
          { label: "PAGE ACCESS TOKEN", key: "META_PAGE_ACCESS_TOKEN", value: metaToken, setter: setMetaToken, placeholder: "EAAxxxxxxxxx... (long-lived token)", password: true },
          { label: "FACEBOOK PAGE ID", key: "META_PAGE_ID", value: metaPageId, setter: setMetaPageId, placeholder: "Your Rêve Facebook page ID (numbers only)", password: false },
          { label: "INSTAGRAM BUSINESS ACCOUNT ID", key: "META_IG_BUSINESS_ID", value: metaIgId, setter: setMetaIgId, placeholder: "Instagram business account ID (optional)", password: false },
        ].map(({ label, value, setter, placeholder, password }) => (
          <div key={label} style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>{label}</label>
            <input
              type={password ? "password" : "text"}
              value={value} onChange={e => setter(e.target.value)}
              placeholder={placeholder}
              className="aire-input" style={{ width: "100%", fontFamily: "monospace", boxSizing: "border-box" }}
            />
          </div>
        ))}

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            onClick={() => saveSection("meta", { META_PAGE_ACCESS_TOKEN: metaToken, META_PAGE_ID: metaPageId, META_IG_BUSINESS_ID: metaIgId })}
            disabled={!metaToken || !metaPageId || saving === "meta"}
            className="btn-coral" style={{ padding: "10px 20px", fontSize: "11px" }}
          >
            {saving === "meta" ? "SAVING..." : "SAVE & CONNECT →"}
          </button>
          {saveResult["meta"] && (
            <p style={{ fontSize: "12px", color: saveResult["meta"].ok ? okTextColor : errorTextColor }}>
              {saveResult["meta"].msg}
            </p>
          )}
        </div>
      </div>

      {/* ── GOOGLE CONTACTS ── */}
      <div style={cardStyle}>
        <SectionHeader
          eyebrow="GOOGLE CONTACTS"
          title="Import your address book"
          description="Auto-merged by email and phone — duplicates collapse cleanly."
          connected={googleConnected}
        />

        {googleConnected ? (
          <div style={connectedNoteStyle}>
            <p style={{ fontSize: "12px", color: MINT_INK }}>Google Contacts is connected. Sync anytime to pull in new contacts.</p>
          </div>
        ) : (
          <>
            <div style={setupBoxStyle}>
              <p style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: "10px", fontWeight: 600 }}>HOW TO GET GOOGLE CREDENTIALS — ONE TIME</p>
              <ol style={{ fontSize: "12px", color: "var(--aire-text)", lineHeight: "2.0", paddingLeft: "18px", margin: 0 }}>
                <li>Go to <strong>console.cloud.google.com</strong> → Create a new project named &ldquo;AIRE&rdquo;</li>
                <li>Search for <strong>People API</strong> → Enable it</li>
                <li>Go to <strong>APIs &amp; Services → Credentials → Create Credentials → OAuth 2.0 Client ID</strong></li>
                <li>Application type: <strong>Web application</strong></li>
                <li>Add redirect URI: <strong>http://localhost:3000/api/auth/google/callback</strong></li>
                <li>Copy your <strong>Client ID</strong> and <strong>Client Secret</strong> below</li>
                <li>Also go to <strong>OAuth consent screen</strong> → add your email as a Test User</li>
              </ol>
            </div>

            {[
              { label: "GOOGLE CLIENT ID", value: googleClientId, setter: setGoogleClientId, placeholder: "xxxxxxxxxx.apps.googleusercontent.com", password: false },
              { label: "GOOGLE CLIENT SECRET", value: googleClientSecret, setter: setGoogleClientSecret, placeholder: "GOCSPX-xxxxxxxxxx", password: true },
            ].map(({ label, value, setter, placeholder, password }) => (
              <div key={label} style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>{label}</label>
                <input
                  type={password ? "password" : "text"}
                  value={value} onChange={e => setter(e.target.value)}
                  placeholder={placeholder}
                  className="aire-input" style={{ width: "100%", fontFamily: "monospace", boxSizing: "border-box" }}
                />
              </div>
            ))}

            <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "16px" }}>
              <button
                onClick={() => saveSection("google", { GOOGLE_CLIENT_ID: googleClientId, GOOGLE_CLIENT_SECRET: googleClientSecret })}
                disabled={!googleClientId || !googleClientSecret || saving === "google"}
                className="btn-primary" style={{ padding: "10px 18px", fontSize: "11px" }}
              >
                {saving === "google" ? "SAVING..." : "SAVE CREDENTIALS"}
              </button>
              {saveResult["google"] && (
                <p style={{ fontSize: "12px", color: saveResult["google"].ok ? okTextColor : errorTextColor }}>{saveResult["google"].msg}</p>
              )}
            </div>
          </>
        )}

        {(googleConnected || googleCredsSet) && (
          <a
            href="/api/auth/google"
            className={googleConnected ? "btn-ghost" : "btn-coral"}
            style={{
              display: "inline-block",
              marginBottom: "16px",
              fontSize: "11px",
              letterSpacing: "0.12em",
              padding: "10px 18px",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            {googleConnected ? "RECONNECT GOOGLE →" : "CONNECT GOOGLE ACCOUNT →"}
          </a>
        )}

        {googleConnected && (
          <>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button onClick={runGoogleSync} disabled={googleSyncing} className="btn-coral" style={{ padding: "10px 20px", fontSize: "11px" }}>
                {googleSyncing ? "SYNCING..." : "SYNC GOOGLE CONTACTS →"}
              </button>
            </div>

            {googleSyncResult && (
              <div style={{ marginTop: "16px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
                {[
                  { label: "IMPORTED", value: googleSyncResult.created, color: okTextColor },
                  { label: "MERGED", value: googleSyncResult.merged, color: "var(--aire-coral-deep)" },
                  { label: "DUPLICATES", value: googleSyncResult.skipped, color: "var(--aire-muted)" },
                  { label: "TOTAL", value: googleSyncResult.total, color: "var(--aire-ink)" },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div className="font-display" style={{ fontSize: "26px", color }}>{value}</div>
                    <div style={{ fontSize: "9px", letterSpacing: "0.14em", color: "var(--aire-muted)", marginTop: "2px" }}>{label}</div>
                  </div>
                ))}
              </div>
            )}

            {googleSyncError && <p style={{ fontSize: "12px", color: errorTextColor, marginTop: "12px" }}>{googleSyncError}</p>}
          </>
        )}

        {/* CSV Upload — always visible */}
        <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid var(--aire-border)" }}>
          <p style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: "8px", fontWeight: 600 }}>OR UPLOAD CSV DIRECTLY</p>
          <p style={{ fontSize: "12px", color: "var(--aire-text-2)", marginBottom: "14px", lineHeight: 1.6 }}>
            In Google Contacts → Export → <strong style={{ color: "var(--aire-ink)" }}>Google CSV</strong> → upload here. Duplicates are auto-merged by email and phone.
          </p>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <label className="btn-ghost" style={{
              display: "inline-block",
              padding: "10px 20px",
              fontSize: "11px",
              letterSpacing: "0.12em",
              cursor: csvUploading ? "not-allowed" : "pointer",
              opacity: csvUploading ? 0.6 : 1,
            }}>
              {csvUploading ? "UPLOADING..." : "UPLOAD GOOGLE CSV"}
              <input
                type="file" accept=".csv" onChange={handleCSVUpload}
                disabled={csvUploading}
                style={{ display: "none" }}
              />
            </label>
            {csvResult && (
              <div style={{ display: "flex", gap: "16px" }}>
                <span style={{ fontSize: "12px", color: okTextColor }}>{csvResult.created} imported</span>
                <span style={{ fontSize: "12px", color: "var(--aire-coral-deep)" }}>{csvResult.merged} merged</span>
                <span style={{ fontSize: "12px", color: "var(--aire-muted)" }}>{csvResult.skipped} duplicates skipped</span>
                <span style={{ fontSize: "12px", color: "var(--aire-faint)" }}>of {csvResult.total} total</span>
              </div>
            )}
            {csvError && <p style={{ fontSize: "12px", color: errorTextColor }}>{csvError}</p>}
          </div>
        </div>
      </div>

      {/* ── TWILIO ── */}
      <div style={cardStyle}>
        <SectionHeader eyebrow="TWILIO SMS" title="Click-to-text from contacts" description="Outbound SMS, auto-logged to the activity timeline." connected={twilioConnected} />
        <div style={setupBoxStyle}>
          <p style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: "8px", fontWeight: 600 }}>SETUP</p>
          <p style={{ fontSize: "12px", color: "var(--aire-text)", lineHeight: 1.8 }}>Go to <strong>console.twilio.com</strong> → Account Info for SID + Auth Token. Buy a phone number for outbound SMS.</p>
        </div>
        {[
          { label: "ACCOUNT SID", value: twilioSid, setter: setTwilioSid, placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", password: false },
          { label: "AUTH TOKEN", value: twilioToken, setter: setTwilioToken, placeholder: "Your Twilio auth token", password: true },
          { label: "FROM PHONE NUMBER", value: twilioPhone, setter: setTwilioPhone, placeholder: "+12255551234", password: false },
        ].map(({ label, value, setter, placeholder, password }) => (
          <div key={label} style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>{label}</label>
            <input type={password ? "password" : "text"} value={value} onChange={e => setter(e.target.value)} placeholder={placeholder} className="aire-input" style={{ width: "100%", fontFamily: "monospace", boxSizing: "border-box" }} />
          </div>
        ))}
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => saveSection("twilio", { TWILIO_ACCOUNT_SID: twilioSid, TWILIO_AUTH_TOKEN: twilioToken, TWILIO_PHONE_NUMBER: twilioPhone })} disabled={!twilioSid || !twilioToken || !twilioPhone || saving === "twilio"} className="btn-coral" style={{ padding: "10px 20px", fontSize: "11px" }}>
            {saving === "twilio" ? "SAVING..." : "SAVE & CONNECT →"}
          </button>
          {twilioConnected && (
            <button onClick={testTwilio} disabled={saving === "twilio_test"} className="btn-ghost" style={{ padding: "10px 16px", fontSize: "11px" }}>
              {saving === "twilio_test" ? "SENDING..." : "TEST SMS"}
            </button>
          )}
          {saveResult["twilio"] && <p style={{ fontSize: "12px", color: saveResult["twilio"].ok ? okTextColor : errorTextColor }}>{saveResult["twilio"].msg}</p>}
        </div>
      </div>

      {/* ── SENDGRID ── */}
      <div style={cardStyle}>
        <SectionHeader eyebrow="SENDGRID" title="Email from contacts and Smart Plans" description="One-click sends from profiles and drip sequences." connected={sendgridConnected} />
        <div style={setupBoxStyle}>
          <p style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: "8px", fontWeight: 600 }}>SETUP</p>
          <p style={{ fontSize: "12px", color: "var(--aire-text)", lineHeight: 1.8 }}>Go to <strong>app.sendgrid.com</strong> → Settings → API Keys → Create API Key. Verify your sender email under Sender Authentication first.</p>
        </div>
        {[
          { label: "API KEY", value: sgKey, setter: setSgKey, placeholder: "SG.xxxxxxxxxx", password: true },
          { label: "FROM EMAIL", value: sgFrom, setter: setSgFrom, placeholder: "caleb@reverealtors.com", password: false },
        ].map(({ label, value, setter, placeholder, password }) => (
          <div key={label} style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>{label}</label>
            <input type={password ? "password" : "text"} value={value} onChange={e => setter(e.target.value)} placeholder={placeholder} className="aire-input" style={{ width: "100%", fontFamily: "monospace", boxSizing: "border-box" }} />
          </div>
        ))}
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => saveSection("sendgrid", { SENDGRID_API_KEY: sgKey, SENDGRID_FROM_EMAIL: sgFrom })} disabled={!sgKey || !sgFrom || saving === "sendgrid"} className="btn-coral" style={{ padding: "10px 20px", fontSize: "11px" }}>
            {saving === "sendgrid" ? "SAVING..." : "SAVE & CONNECT →"}
          </button>
          {sendgridConnected && (
            <button onClick={testSendGrid} disabled={saving === "sendgrid_test"} className="btn-ghost" style={{ padding: "10px 16px", fontSize: "11px" }}>
              {saving === "sendgrid_test" ? "SENDING..." : "TEST EMAIL"}
            </button>
          )}
          {saveResult["sendgrid"] && <p style={{ fontSize: "12px", color: saveResult["sendgrid"].ok ? okTextColor : errorTextColor }}>{saveResult["sendgrid"].msg}</p>}
        </div>
      </div>

      {/* ── GOOGLE CALENDAR ── */}
      <div style={cardStyle}>
        <SectionHeader eyebrow="GOOGLE CALENDAR" title="Showings, appointments, tasks" description="Pulls real events into the AIRE calendar widget." connected={googleConnected} />
        <div style={googleConnected ? connectedNoteStyle : setupBoxStyle}>
          <p style={{ fontSize: "12px", color: googleConnected ? MINT_INK : "var(--aire-text)", lineHeight: 1.7 }}>
            {googleConnected
              ? "Google Calendar is active. Showings and appointments will appear in your CalendarWidget automatically."
              : "Google Calendar uses your existing Google connection. Connect Google Contacts first, then Calendar access is included automatically."}
          </p>
        </div>
        <a href="/api/auth/google" className={googleConnected ? "btn-ghost" : "btn-coral"} style={{ display: "inline-block", fontSize: "11px", letterSpacing: "0.12em", textDecoration: "none", padding: "10px 18px", fontWeight: 600 }}>
          {googleConnected ? "RECONNECT GOOGLE →" : "CONNECT GOOGLE →"}
        </a>
      </div>

      {/* ── CALENDLY ── */}
      <div style={cardStyle}>
        <SectionHeader eyebrow="CALENDLY" title="Auto-inject your booking link" description="Used in AI follow-ups and Smart Plan sequences." connected={calendlyConnected} />
        <div style={setupBoxStyle}>
          <p style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: "8px", fontWeight: 600 }}>SETUP</p>
          <p style={{ fontSize: "12px", color: "var(--aire-text)", lineHeight: 1.8 }}>Go to <strong>calendly.com</strong> → Integrations → API &amp; Webhooks → Generate New Token. Copy and paste below.</p>
        </div>
        <div style={{ marginBottom: "14px" }}>
          <label style={labelStyle}>API KEY</label>
          <input type="password" value={calendlyKey} onChange={e => setCalendlyKey(e.target.value)} placeholder="eyJhbGciOiJIUzI1NiJ9..." className="aire-input" style={{ width: "100%", fontFamily: "monospace", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button onClick={() => saveSection("calendly", { CALENDLY_API_KEY: calendlyKey })} disabled={!calendlyKey || saving === "calendly"} className="btn-coral" style={{ padding: "10px 20px", fontSize: "11px" }}>
            {saving === "calendly" ? "SAVING..." : "SAVE & CONNECT →"}
          </button>
          {saveResult["calendly"] && <p style={{ fontSize: "12px", color: saveResult["calendly"].ok ? okTextColor : errorTextColor }}>{saveResult["calendly"].msg}</p>}
        </div>
      </div>

      {/* ── DOTLOOP ── */}
      <div style={cardStyle}>
        <SectionHeader eyebrow="DOTLOOP" title="Transaction loops and docs" description="Loop status, participants, and document progress into the contact profile." connected={dotloopConnected} />
        <div style={setupBoxStyle}>
          <p style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: "8px", fontWeight: 600 }}>RÊVE REALTORS SETUP</p>
          <ol style={{ fontSize: "12px", color: "var(--aire-text)", lineHeight: 1.8, paddingLeft: "20px", margin: 0 }}>
            <li>Rêve pays for the team Dotloop license — your account is already there.</li>
            <li>Go to <a href="https://www.dotloop.com" target="_blank" rel="noopener" style={{ color: "var(--aire-coral-deep)", fontWeight: 600 }}>dotloop.com</a> → click your name → <strong>My Account</strong> → <strong>Integrations</strong> → <strong>API Access Tokens</strong>.</li>
            <li>If &ldquo;API Access&rdquo; is greyed out, email the Rêve broker admin to enable &ldquo;Public API access&rdquo; on your profile (one-time, takes ~1 day).</li>
            <li>Once enabled: <strong>Generate token</strong>, paste it below. Then click <strong>DISCOVER PROFILE</strong> below — AIRE will fetch your Profile ID automatically.</li>
          </ol>
        </div>
        {[
          { label: "ACCESS TOKEN", value: dotloopToken, setter: setDotloopToken, placeholder: "Your Dotloop API Personal Access Token", password: true },
          { label: "PROFILE ID", value: dotloopProfile, setter: setDotloopProfile, placeholder: "Click DISCOVER below to auto-fill, or paste manually", password: false },
        ].map(({ label, value, setter, placeholder, password }) => (
          <div key={label} style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>{label}</label>
            <input type={password ? "password" : "text"} value={value} onChange={e => setter(e.target.value)} placeholder={placeholder} className="aire-input" style={{ width: "100%", fontFamily: "monospace", boxSizing: "border-box" }} />
          </div>
        ))}
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => saveSection("dotloop", { DOTLOOP_ACCESS_TOKEN: dotloopToken, DOTLOOP_PROFILE_ID: dotloopProfile })}
            disabled={!dotloopToken || !dotloopProfile || saving === "dotloop"}
            className="btn-coral" style={{ padding: "10px 20px", fontSize: "11px" }}
          >
            {saving === "dotloop" ? "SAVING..." : "SAVE & CONNECT →"}
          </button>
          {dotloopToken && (
            <button
              onClick={async () => {
                setSaving("dotloop_discover");
                try {
                  const res = await fetch("/api/dotloop/discover", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ accessToken: dotloopToken }),
                  });
                  const data = await res.json();
                  if (data.ok && data.profiles?.length) {
                    const def = data.profiles.find((p: { default: boolean }) => p.default) ?? data.profiles[0];
                    setDotloopProfile(String(def.id));
                    setSaveResult(prev => ({ ...prev, dotloop: { ok: true, msg: `Discovered profile: ${def.name} (#${def.id})` } }));
                  } else {
                    setSaveResult(prev => ({ ...prev, dotloop: { ok: false, msg: data.error ?? "Discovery failed" } }));
                  }
                } finally {
                  setSaving(null);
                }
              }}
              disabled={saving === "dotloop_discover"}
              className="btn-ghost" style={{ padding: "10px 16px", fontSize: "11px" }}
            >
              {saving === "dotloop_discover" ? "DISCOVERING…" : "DISCOVER PROFILE"}
            </button>
          )}
          {dotloopConnected && (
            <button
              onClick={async () => {
                setSaving("dotloop_sync");
                setSaveResult(prev => ({ ...prev, dotloop: { ok: true, msg: "Syncing loops…" } }));
                try {
                  const res = await fetch("/api/dotloop/sync", { method: "POST" });
                  const text = await res.text();
                  const lines = text.trim().split("\n");
                  const last = JSON.parse(lines[lines.length - 1]);
                  if (last.status === "done") {
                    setSaveResult(prev => ({
                      ...prev,
                      dotloop: { ok: true, msg: `Synced ${last.total} loops · ${last.matched} matched to contacts · ${last.failed} failed` },
                    }));
                  } else {
                    setSaveResult(prev => ({ ...prev, dotloop: { ok: false, msg: last.message ?? "Sync failed" } }));
                  }
                } finally {
                  setSaving(null);
                }
              }}
              disabled={saving === "dotloop_sync"}
              className="btn-ghost" style={{ padding: "10px 16px", fontSize: "11px" }}
            >
              {saving === "dotloop_sync" ? "SYNCING…" : "SYNC LOOPS"}
            </button>
          )}
          {saveResult["dotloop"] && <p style={{ fontSize: "12px", color: saveResult["dotloop"].ok ? okTextColor : errorTextColor }}>{saveResult["dotloop"].msg}</p>}
        </div>
      </div>

      {/* ── ZAPIER ── */}
      <div style={cardStyle}>
        <SectionHeader eyebrow="ZAPIER" title="Automation webhook" description="Triggers Zaps on new leads, stage changes, and published posts." connected={zapierConnected} />
        <div style={setupBoxStyle}>
          <p style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: "8px", fontWeight: 600 }}>SETUP</p>
          <ol style={{ fontSize: "12px", color: "var(--aire-text)", lineHeight: "2.0", paddingLeft: "18px", margin: 0 }}>
            <li>In Zapier → <strong>Create Zap → Trigger: Webhooks by Zapier → Catch Hook</strong></li>
            <li>Copy the webhook URL Zapier gives you</li>
            <li>Paste it below — AIRE will POST to it on new leads, stage changes, and published posts</li>
          </ol>
        </div>
        <div style={{ marginBottom: "14px" }}>
          <label style={labelStyle}>ZAPIER WEBHOOK URL</label>
          <input type="text" value={zapierUrl} onChange={e => setZapierUrl(e.target.value)} placeholder="https://hooks.zapier.com/hooks/catch/..." className="aire-input" style={{ width: "100%", fontFamily: "monospace", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button onClick={() => saveSection("zapier", { ZAPIER_WEBHOOK_URL: zapierUrl })} disabled={!zapierUrl || saving === "zapier"} className="btn-coral" style={{ padding: "10px 20px", fontSize: "11px" }}>
            {saving === "zapier" ? "SAVING..." : "SAVE & CONNECT →"}
          </button>
          {saveResult["zapier"] && <p style={{ fontSize: "12px", color: saveResult["zapier"].ok ? okTextColor : errorTextColor }}>{saveResult["zapier"].msg}</p>}
        </div>
      </div>

      {/* ── RPR ── */}
      <div style={cardStyle}>
        <SectionHeader eyebrow="RPR / REMINE" title="Live market data" description="Median price, days on market, active listings — pulled into Morning Brief." connected={rprConnected} />
        <div style={setupBoxStyle}>
          <p style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: "8px", fontWeight: 600 }}>SETUP</p>
          <p style={{ fontSize: "12px", color: "var(--aire-text)", lineHeight: 1.8 }}>RPR access is included with your NAR membership. Log in at <strong>narrpr.com</strong> with your NRDS credentials — those are your username and password below.</p>
        </div>
        {[
          { label: "RPR USERNAME (NRDS ID)", value: rprUser, setter: setRprUser, placeholder: "Your NRDS / NAR member ID", password: false },
          { label: "RPR PASSWORD", value: rprPass, setter: setRprPass, placeholder: "Your RPR password", password: true },
        ].map(({ label, value, setter, placeholder, password }) => (
          <div key={label} style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>{label}</label>
            <input type={password ? "password" : "text"} value={value} onChange={e => setter(e.target.value)} placeholder={placeholder} className="aire-input" style={{ width: "100%", fontFamily: "monospace", boxSizing: "border-box" }} />
          </div>
        ))}
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button onClick={() => saveSection("rpr", { RPR_USERNAME: rprUser, RPR_PASSWORD: rprPass })} disabled={!rprUser || !rprPass || saving === "rpr"} className="btn-coral" style={{ padding: "10px 20px", fontSize: "11px" }}>
            {saving === "rpr" ? "SAVING..." : "SAVE & CONNECT →"}
          </button>
          {saveResult["rpr"] && <p style={{ fontSize: "12px", color: saveResult["rpr"].ok ? okTextColor : errorTextColor }}>{saveResult["rpr"].msg}</p>}
        </div>
      </div>

      {/* ── WEBHOOK ── */}
      <div style={cardStyle}>
        <p style={{ fontSize: "10px", letterSpacing: "0.20em", color: "var(--aire-muted)", marginBottom: "6px", textTransform: "uppercase" }}>REAL-TIME SYNC</p>
        <h2 className="font-display" style={{ fontSize: "20px", color: "var(--aire-ink)", marginBottom: "6px" }}>Lofty webhook</h2>
        <p style={{ fontSize: "12px", color: "var(--aire-text-2)", marginBottom: "20px" }}>
          New leads added in Lofty appear in AIRE within seconds — no manual sync needed.
        </p>
        <div style={setupBoxStyle}>
          <p style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: "10px", fontWeight: 600 }}>SETUP — ONE TIME AFTER DEPLOYING TO VERCEL/NETLIFY</p>
          <ol style={{ fontSize: "12px", color: "var(--aire-text)", lineHeight: "2.2", paddingLeft: "18px", margin: 0 }}>
            <li>In Lofty: <strong>Settings → Integrations → Webhooks → Add Webhook</strong></li>
            <li>Paste: <code style={{ color: "var(--aire-coral-deep)", fontSize: "11px" }}>https://your-domain.com/api/lofty/webhook</code></li>
            <li>Select events: <strong>Lead Created</strong>, <strong>Lead Updated</strong></li>
            <li>Save — done forever</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
