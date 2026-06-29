"use client";

import TopNav from "@/components/TopNav";
import ChatPanel from "@/components/ChatPanel";
import CommandPalette from "@/components/CommandPalette";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";
import PushSetup from "@/components/PushSetup";

/**
 * Client-side app chrome. Lives behind a "use client" boundary so the root
 * layout (layout.tsx) can stay a Server Component — Next 16 + Turbopack can't
 * resolve client components imported directly into a Server Component layout
 * (the "Could not find module in React Client Manifest" error).
 */
export default function AppChrome({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <TopNav />
      {/* Content area — clears the fixed top nav via padding-top: var(--topnav-h) */}
      <div className="aire-content" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <main style={{ flex: 1 }}>
          <ErrorBoundary source="app-shell">{children}</ErrorBoundary>
        </main>
      </div>
      {/* Cmd+K palette */}
      <CommandPalette />
      {/* AIRE Chat — floating agent, every page */}
      <ChatPanel mode="float" />
      <PushSetup />
    </ToastProvider>
  );
}
