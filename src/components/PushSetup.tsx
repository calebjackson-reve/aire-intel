"use client";

import { useEffect } from "react";

// Registers the service worker and subscribes to Web Push notifications.
// Loaded once in the root layout. Gracefully no-ops if VAPID keys aren't configured.
export default function PushSetup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then(async (reg) => {
        // Check if already subscribed
        const existing = await reg.pushManager.getSubscription();
        if (existing) return;

        // Fetch the VAPID public key
        const res = await fetch("/api/push/vapid-key").catch(() => null);
        if (!res?.ok) return;
        const { publicKey } = await res.json();
        if (!publicKey) return;

        // Subscribe
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
        });

        // Save subscription to server
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subscription: sub }),
        });
      })
      .catch(() => null); // Never throw — push is enhancement only
  }, []);

  return null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
