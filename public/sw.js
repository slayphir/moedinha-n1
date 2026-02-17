// Emergency kill-switch:
// - remove stale caches from previous service worker versions
// - unregister service worker to stop serving stale HTML/chunks
const CACHE_PREFIX = "moedinha";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.toLowerCase().includes(CACHE_PREFIX))
          .map((key) => caches.delete(key))
      );

      await self.registration.unregister();
    })()
  );
});
