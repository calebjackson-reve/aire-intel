import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import AIAssistant from "@/components/AIAssistant";
import CommandPalette from "@/components/CommandPalette";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: "AIRE — Rêve Realtors",
  description: "Operations platform for Caleb Jackson at Rêve Realtors®",
};

// Google Fonts loaded here (not in CSS) to avoid Tailwind v4 @import ordering issue
export function generateStaticParams() { return []; }

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full">
        <ToastProvider>
          <Sidebar />
          {/* Content area — 236px sidebar clearance (64px when collapsed under 900px) */}
          <div className="aire-content" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
            <Topbar />
            <main style={{ flex: 1 }}>
              <ErrorBoundary source="app-shell">{children}</ErrorBoundary>
            </main>
          </div>
          {/* Global Cmd+K command palette — available on every page */}
          <CommandPalette />
          <AIAssistant />
        </ToastProvider>
      </body>
    </html>
  );
}
