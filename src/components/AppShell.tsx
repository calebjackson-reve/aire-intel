"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import JarvisBar from "@/components/JarvisBar";
import CommandPalette from "@/components/CommandPalette";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import PushSetup from "@/components/PushSetup";

const AUTH_ROUTES = ["/sign-in", "/sign-up"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const isAuth = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  if (isAuth) {
    return (
      <main className="sign-in-page">
        <ErrorBoundary source="auth">{children}</ErrorBoundary>
      </main>
    );
  }

  return (
    <>
      <Sidebar />
      <div
        className="aire-content"
        style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
      >
        <Topbar />
        <main style={{ flex: 1 }}>
          <ErrorBoundary source="app-shell">{children}</ErrorBoundary>
        </main>
      </div>
      <CommandPalette />
      <JarvisBar />
      <PushSetup />
    </>
  );
}
