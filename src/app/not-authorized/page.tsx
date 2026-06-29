"use client";

import { SignOutButton } from "@clerk/nextjs";

export default function NotAuthorized() {
  return (
    <div style={{
      minHeight: "70vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: "16px", padding: "24px", textAlign: "center",
    }}>
      <div style={{
        width: "52px", height: "52px", borderRadius: "13px",
        background: "var(--aire-orange-soft)", color: "var(--aire-orange)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h1 className="font-display" style={{ fontSize: "24px", color: "var(--aire-text)" }}>This account isn’t authorized</h1>
      <p style={{ fontSize: "14px", color: "var(--aire-muted)", maxWidth: "380px", lineHeight: 1.5 }}>
        AIRE is locked to a single account. Sign out and sign back in with the authorized email.
      </p>
      <SignOutButton>
        <button className="btn-coral" style={{ fontSize: "12px", letterSpacing: "0.08em", marginTop: "4px" }}>
          SIGN OUT
        </button>
      </SignOutButton>
    </div>
  );
}
