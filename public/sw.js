// AIRÉ Service Worker — handles push notifications and offline caching

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "AIRÉ", body: event.data.text() };
  }

  const title = payload.title ?? "AIRÉ";
  const options = {
    body: payload.body ?? "",
    icon: "/next.svg",
    badge: "/next.svg",
    data: { url: payload.url ?? "/" },
    requireInteraction: payload.requireInteraction ?? false,
    tag: payload.tag ?? "aire-notification",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(url) && "focus" in c);
        if (existing) return existing.focus();
        return self.clients.openWindow(url);
      })
  );
});
