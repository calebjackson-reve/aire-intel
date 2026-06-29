import { SignIn } from "@clerk/nextjs";

export const metadata = {
  title: "Sign In",
  description: "Sign in to AIRÉ, the intelligence platform for Rêve Realtors.",
};

export default function SignInPage() {
  return (
    <div className="sign-in-shell">
      <div className="sign-in-brand">
        <div className="sign-in-mark">A</div>
        <div>
          <div className="sign-in-name">AIRÉ</div>
          <div className="sign-in-sub">Rêve Realtors®</div>
        </div>
      </div>
      <SignIn
        appearance={{
          elements: {
            rootBox: "sign-in-clerk-root",
            card: "sign-in-clerk-card",
            headerTitle: "sign-in-clerk-title",
            headerSubtitle: "sign-in-clerk-subtitle",
            socialButtonsBlockButton: "sign-in-clerk-social",
            formButtonPrimary: "sign-in-clerk-btn",
            footerActionLink: "sign-in-clerk-link",
          },
        }}
      />
    </div>
  );
}
