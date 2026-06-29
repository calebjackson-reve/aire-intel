import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div style={{
      minHeight: "80vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: "22px", padding: "24px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{
          width: "38px", height: "38px", background: "var(--aire-orange)", borderRadius: "11px",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-display-app)", fontSize: "19px", fontWeight: 600, color: "#fff",
        }}>A</span>
        <span style={{ fontFamily: "var(--font-display-app)", fontSize: "20px", color: "var(--aire-text)" }}>AIRÉ</span>
      </div>
      <SignIn
        appearance={{
          variables: { colorPrimary: "#FB7A01", borderRadius: "10px" },
        }}
      />
    </div>
  );
}
