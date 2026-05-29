"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const POST_TYPES = [
  { value: "just_listed", label: "Just Listed" },
  { value: "just_sold", label: "Just Sold" },
  { value: "under_contract", label: "Under Contract" },
  { value: "client_story", label: "Client Story" },
  { value: "market_update", label: "Market Update" },
  { value: "educational_carousel", label: "Educational" },
];

const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
];

interface Section {
  caption: string;
  slideCopy: string;
  motionSpec: string;
}

function parseSection(text: string, heading: string, next: string): string {
  const re = new RegExp(`###\\s*${heading}\\s*([\\s\\S]*?)(?=###\\s*${next}|$)`, "i");
  return text.match(re)?.[1]?.trim() || "";
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}
      className="btn-ghost"
      style={{
        fontSize: "10px",
        letterSpacing: "0.14em",
        padding: "5px 12px",
        color: copied ? "var(--aire-coral)" : "var(--aire-text-2)",
      }}
    >
      {copied ? "COPIED" : "COPY"}
    </button>
  );
}

export default function CreatePostPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "var(--aire-muted)" }}>Loading…</div>}>
      <CreatePost />
    </Suspense>
  );
}

function CreatePost() {
  const searchParams = useSearchParams();
  const initialType = searchParams.get("type") || "just_sold";

  const [postType, setPostType] = useState(initialType);
  const [address, setAddress] = useState("");
  const [price, setPrice] = useState("");
  const [rawNotes, setRawNotes] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [streaming, setStreaming] = useState(false);
  const [rawOutput, setRawOutput] = useState("");
  const [done, setDone] = useState(false);

  // Pre-load market context when arriving via "Weekly Market Post" action card
  useEffect(() => {
    if (initialType === "market_update" && !rawNotes) {
      // Pull current BR market signal into the notes field
      fetch("/api/market")
        .then(r => r.json())
        .then(d => {
          if (d && d.headline) {
            const ctx = [
              d.headline,
              d.br_median ? `BR median: ${d.br_median}` : null,
              d.dom_avg ? `Avg DOM: ${d.dom_avg}d` : null,
              d.rate_30yr ? `30-yr rate: ${d.rate_30yr}` : null,
              d.yoy_change ? `YoY: ${d.yoy_change}` : null,
              d.caleb_note ? `\nCaleb's take: ${d.caleb_note}` : null,
            ].filter(Boolean).join(" · ");
            setRawNotes(ctx);
          } else {
            setRawNotes("This week in Baton Rouge real estate — leading with a current market signal. Tone: confident, data-driven, conversational. Avoid generic 'great time to buy' language.");
          }
        })
        .catch(() => {
          setRawNotes("This week in Baton Rouge real estate — leading with a current market signal. Tone: confident, data-driven, conversational.");
        });
    }
  }, [initialType, rawNotes]);

  const sections: Section = {
    caption: parseSection(rawOutput, "CAPTION", "SLIDE COPY"),
    slideCopy: parseSection(rawOutput, "SLIDE COPY", "MOTION SPEC"),
    motionSpec: parseSection(rawOutput, "MOTION SPEC", "ZZZNOMATCH"),
  };

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setStreaming(true);
    setRawOutput("");
    setDone(false);

    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postType, address, price: price ? parseFloat(price) : null, rawNotes, platform }),
    });

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) return;

    while (true) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;
      setRawOutput((prev) => prev + decoder.decode(value));
    }

    setStreaming(false);
    setDone(true);
  }

  return (
    <div style={{ padding: "32px 40px 40px 80px", maxWidth: "1280px", margin: "0 auto" }}>
      <div style={{ marginBottom: "32px" }}>
        <p style={{ fontSize: "11px", letterSpacing: "0.20em", color: "var(--aire-muted)", marginBottom: "8px" }}>
          POST ENGINE
        </p>
        <h1 className="font-display" style={{ fontSize: "44px", color: "var(--aire-text)", lineHeight: 1.05 }}>
          Create Post
        </h1>
        <div style={{ width: "36px", height: "2px", background: "var(--aire-coral)", marginTop: "14px", animation: "coral-sweep 700ms cubic-bezier(0.65,0,0.35,1) 200ms both" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* Form */}
        <form onSubmit={generate} className="card-light" style={{ padding: "26px 26px", display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <label style={labelStyle}>POST TYPE</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginTop: "10px" }}>
              {POST_TYPES.map((pt) => (
                <button
                  key={pt.value}
                  type="button"
                  onClick={() => setPostType(pt.value)}
                  className={postType === pt.value ? "pill pill-coral" : "pill"}
                  style={{
                    fontSize: "10px",
                    letterSpacing: "0.12em",
                    padding: "8px 6px",
                    cursor: "pointer",
                    fontWeight: 600,
                    justifyContent: "center",
                    transition: "all 200ms",
                  }}
                >
                  {pt.label.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>PLATFORM</label>
            <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
              {PLATFORMS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPlatform(p.value)}
                  className={platform === p.value ? "pill pill-ink" : "pill"}
                  style={{
                    fontSize: "10px",
                    letterSpacing: "0.12em",
                    padding: "8px 16px",
                    cursor: "pointer",
                    fontWeight: 600,
                    transition: "all 200ms",
                  }}
                >
                  {p.label.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>ADDRESS</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="1234 Magnolia Dr, St. Francisville"
              className="aire-input"
              style={{ marginTop: "8px" }}
            />
          </div>

          <div>
            <label style={labelStyle}>SALE PRICE</label>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="1250000"
              type="number"
              className="aire-input"
              style={{ marginTop: "8px" }}
            />
          </div>

          <div>
            <label style={labelStyle}>RAW NOTES</label>
            <textarea
              required
              value={rawNotes}
              onChange={(e) => setRawNotes(e.target.value)}
              placeholder="Buyers were the Rodriguezes, referred by Kim. Fought off 2 other offers. Closed 10 days early. They're from Dallas, moving here for family."
              rows={5}
              className="aire-input"
              style={{ marginTop: "8px", resize: "vertical", fontFamily: "inherit" }}
            />
          </div>

          <button
            type="submit"
            disabled={streaming}
            className="btn-coral"
            style={{
              opacity: streaming ? 0.6 : 1,
              cursor: streaming ? "default" : "pointer",
            }}
          >
            {streaming ? "GENERATING..." : "GENERATE POST →"}
          </button>
        </form>

        {/* Output */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {(streaming || done) && (
            <>
              {sections.caption && (
                <OutputSection title="CAPTION" content={sections.caption} />
              )}
              {sections.slideCopy && (
                <OutputSection title="SLIDE COPY" content={sections.slideCopy} />
              )}
              {sections.motionSpec && (
                <OutputSection title="MOTION SPEC" content={sections.motionSpec} />
              )}
              {streaming && !sections.caption && (
                <div className="card-ink" style={{ padding: "26px" }}>
                  <p style={{ fontSize: "13px", color: "var(--aire-muted-inv)", fontStyle: "italic" }}>
                    Writing...
                  </p>
                  <p style={{ fontSize: "12px", color: "var(--aire-muted-inv)", marginTop: "10px", whiteSpace: "pre-wrap", opacity: 0.6 }}>
                    {rawOutput}
                  </p>
                </div>
              )}
            </>
          )}

          {!streaming && !done && (
            <div
              style={{
                background: "var(--aire-card-warm)",
                border: "1px dashed var(--aire-border-2)",
                borderRadius: "14px",
                padding: "60px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "320px",
              }}
            >
              <p style={{ fontSize: "11px", color: "var(--aire-muted)", letterSpacing: "0.16em" }}>
                OUTPUT WILL APPEAR HERE
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OutputSection({ title, content }: { title: string; content: string }) {
  return (
    <div className="card-ink" style={{ padding: "22px", animation: "fade-up 600ms cubic-bezier(0.22,1,0.36,1) both" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ fontSize: "10px", letterSpacing: "0.18em", color: "var(--aire-muted-inv)" }}>
          {title}
        </span>
        <CopyButton text={content} />
      </div>
      <p style={{ fontSize: "13px", lineHeight: 1.8, color: "var(--aire-text-inv)", whiteSpace: "pre-wrap" }}>
        {content}
      </p>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: "10px",
  letterSpacing: "0.16em",
  color: "var(--aire-muted)",
  display: "block",
};
