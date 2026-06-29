import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { ToastProvider } from "@/components/ui/Toast";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: {
    default: "AIRÉ — Rêve Realtors",
    template: "%s — AIRÉ",
  },
  description: "Operations platform for Caleb Jackson at Rêve Realtors®",
  metadataBase: new URL("https://www.aireintel.org"),
  openGraph: {
    siteName: "AIRÉ",
    type: "website",
  },
};

export function generateStaticParams() { return []; }

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className="h-full">
        <head>
          <link rel="manifest" href="/manifest.json" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&display=swap" rel="stylesheet" />
        </head>
        <body className="min-h-full">
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
