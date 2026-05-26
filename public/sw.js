// Service worker for Medics WI Inventory.
// Two responsibilities:
//   1. Receive web push messages and display notifications.
//   2. Re-focus / open the app when a notification is clicked.
//
// Important: this file MUST live in /public so the browser fetches it from the site root.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Medics WI Inventory", body: "You have a new alert.", url: "/notifications" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    /* non-JSON payload — ignore */
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      tag: payload.tag || "medics-wi-inventory",
      renotify: true,
      data: { url: payload.url || "/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/notifications";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // If a tab is already open on the app, focus + navigate it
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            client.navigate(url);
          }
          return;
        }
      }
      // Otherwise open a fresh window
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});
