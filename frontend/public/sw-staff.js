/* Action Plus Gym Manager — staff phone alerts */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {
    title: "Action Plus Gym",
    body: "Log in to the Gym app to check.",
    url: "/",
    tag: "staff-desk",
  };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* keep the fallback */
  }
  const title = data.title || "Action Plus Gym";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/apg-mgr-icon-v1-192.png",
      badge: "/apg-mgr-icon-v1-192.png",
      data: { url: data.url || "/" },
      tag: data.tag || "staff-desk",
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || "/";
  const url = new URL(path, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client && String(client.url || "").startsWith(self.location.origin)) {
          if (typeof client.navigate === "function") {
            return client.navigate(url).then(() => client.focus()).catch(() => client.focus());
          }
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
      return undefined;
    }),
  );
});
