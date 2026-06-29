import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import AppChrome from "@/components/AppChrome";

export const metadata: Metadata = {
  title: "AIRÉ — Rêve Realtors",
  description: "Operations platform for Caleb Jackson at Rêve Realtors®",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Josefin+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full">
        <ClerkProvider>
          <AppChrome>{children}</AppChrome>
        </ClerkProvider>
      </body>
    </html>
  );
}
